import { NextResponse } from "next/server";
import type { ConnectionState } from "@cardstack/config-store";
import {
  HubSpotAdapter,
  SalesforceAdapter,
  type HubSpotCredentials,
  type SalesforceCredentials,
} from "@cardstack/crm-adapters";
import { getAdapter, getStore, TENANT_ID } from "../../../lib/backend";

/** Credentials NEVER leave the server (hard rule 3) — the API ships a flag only. */
function redact(connection: ConnectionState): Record<string, unknown> {
  const { credentials, ...rest } = connection;
  return { ...rest, live: !!credentials && Object.keys(credentials).length > 0 };
}

export async function GET() {
  const store = await getStore();
  const connection = await store.getConnection(TENANT_ID);
  const connectedUser =
    connection.status === "connected"
      ? await (await getAdapter()).getConnectedUser().catch(() => null)
      : null;
  return NextResponse.json({ connection: redact(connection), connectedUser });
}

interface ConnectBody {
  action?: "connect" | "disconnect";
  kind?: "mock" | "hubspot" | "salesforce";
  credentials?: Record<string, string>;
}

export async function POST(req: Request) {
  const body = (await req.json()) as ConnectBody;
  const store = await getStore();

  if (body.action === "disconnect") {
    const current = await store.getConnection(TENANT_ID);
    const state: ConnectionState = {
      ...current,
      status: "disconnected",
      changedAt: new Date().toISOString(),
    };
    await store.setConnection(state);
    return NextResponse.json({ connection: redact(state), connectedUser: null });
  }
  if (body.action !== "connect") {
    return NextResponse.json({ error: "action must be connect|disconnect" }, { status: 400 });
  }

  const kind = body.kind ?? "mock";
  let state: ConnectionState;
  let connectedUser: string;

  try {
    if (kind === "mock") {
      state = {
        tenantId: TENANT_ID,
        status: "connected",
        crm: "hubspot",
        label: "mock portal",
        changedAt: new Date().toISOString(),
      };
      connectedUser = "Demo rep";
    } else if (kind === "hubspot") {
      const accessToken = body.credentials?.accessToken?.trim();
      if (!accessToken) {
        return NextResponse.json({ error: "A private-app access token is required." }, { status: 400 });
      }
      const credentials: HubSpotCredentials = { accessToken };
      // Validate BEFORE storing: cheapest authenticated read + identity.
      connectedUser = await new HubSpotAdapter(credentials).validateConnection();
      state = {
        tenantId: TENANT_ID,
        status: "connected",
        crm: "hubspot",
        label: "private app",
        changedAt: new Date().toISOString(),
        credentials: { ...credentials },
      };
    } else {
      const instanceUrl = body.credentials?.instanceUrl?.trim().replace(/\/$/, "");
      const clientId = body.credentials?.clientId?.trim();
      const clientSecret = body.credentials?.clientSecret?.trim();
      if (!instanceUrl || !clientId || !clientSecret) {
        return NextResponse.json(
          { error: "Instance URL, consumer key and consumer secret are all required." },
          { status: 400 },
        );
      }
      if (!/^https:\/\//.test(instanceUrl)) {
        return NextResponse.json({ error: "Instance URL must start with https://" }, { status: 400 });
      }
      const credentials: SalesforceCredentials = { instanceUrl, clientId, clientSecret };
      connectedUser = await new SalesforceAdapter(credentials).validateConnection();
      state = {
        tenantId: TENANT_ID,
        status: "connected",
        crm: "salesforce",
        label: "client credentials",
        changedAt: new Date().toISOString(),
        credentials: { ...credentials },
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Could not connect: ${message}` },
      { status: 400 },
    );
  }

  await store.setConnection(state);
  return NextResponse.json({ connection: redact(state), connectedUser });
}
