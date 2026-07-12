import { NextResponse } from "next/server";
import type { ConnectionState } from "@cardstack/config-store";
import {
  HubSpotAdapter,
  SalesforceAdapter,
  invalidateAdapterCache,
  type CrmAdapter,
  type HubSpotCredentials,
  type SalesforceCredentials,
} from "@cardstack/crm-adapters";
import { getAdapter, getStore, TENANT_ID } from "../../../lib/backend";

/** Credentials NEVER leave the server (hard rule 3) — the API ships a flag only. */
function redact(connection: ConnectionState): Record<string, unknown> {
  const { credentials, ...rest } = connection;
  return { ...rest, live: !!credentials && Object.keys(credentials).length > 0 };
}

/** Capability gaps from missing token scopes — the connect-time coverage report. */
async function scopeGapsFor(adapter: CrmAdapter): Promise<string[]> {
  const info = await adapter.getPortalInfo().catch(() => null);
  return info?.scopeGaps ?? [];
}

export async function GET() {
  const store = await getStore();
  const connection = await store.getConnection(TENANT_ID);
  if (connection.status !== "connected") {
    return NextResponse.json({ connection: redact(connection), connectedUser: null, scopeGaps: [] });
  }
  const adapter = await getAdapter();
  const [connectedUser, scopeGaps] = await Promise.all([
    adapter.getConnectedUser().catch(() => null),
    scopeGapsFor(adapter),
  ]);
  return NextResponse.json({ connection: redact(connection), connectedUser, scopeGaps });
}

interface ConnectBody {
  action?: "connect" | "disconnect" | "refresh";
  kind?: "mock" | "hubspot" | "salesforce";
  credentials?: Record<string, string>;
}

export async function POST(req: Request) {
  const body = (await req.json()) as ConnectBody;
  const store = await getStore();

  // Re-read scopes/lists WITHOUT re-entering credentials: drop cached adapters,
  // re-probe with a fresh one, and bump changedAt so every process (incl. the
  // MCP server) rebuilds its adapter on the next call.
  if (body.action === "refresh") {
    const current = await store.getConnection(TENANT_ID);
    if (current.status !== "connected" || !current.credentials) {
      return NextResponse.json({ error: "No live connection to refresh." }, { status: 400 });
    }
    invalidateAdapterCache({ crm: current.crm, credentials: current.credentials });
    let connectedUser: string | null = null;
    let scopeGaps: string[] = [];
    try {
      const probe =
        current.crm === "salesforce"
          ? new SalesforceAdapter(current.credentials as unknown as SalesforceCredentials)
          : new HubSpotAdapter(current.credentials as unknown as HubSpotCredentials);
      connectedUser = await probe.validateConnection();
      scopeGaps = await scopeGapsFor(probe);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: `Refresh failed: ${message}` }, { status: 400 });
    }
    const state: ConnectionState = { ...current, changedAt: new Date().toISOString() };
    await store.setConnection(state);
    return NextResponse.json({ connection: redact(state), connectedUser, scopeGaps });
  }

  if (body.action === "disconnect") {
    const current = await store.getConnection(TENANT_ID);
    if (current.credentials) {
      // A later reconnect must build a FRESH adapter, not inherit stale caches.
      invalidateAdapterCache({ crm: current.crm, credentials: current.credentials });
    }
    const state: ConnectionState = {
      ...current,
      status: "disconnected",
      changedAt: new Date().toISOString(),
    };
    await store.setConnection(state);
    return NextResponse.json({ connection: redact(state), connectedUser: null, scopeGaps: [] });
  }
  if (body.action !== "connect") {
    return NextResponse.json({ error: "action must be connect|disconnect" }, { status: 400 });
  }

  const kind = body.kind ?? "mock";
  let state: ConnectionState;
  let connectedUser: string;
  let scopeGaps: string[] = [];

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
      // Validate BEFORE storing: cheapest authenticated read + identity. The
      // probe also runs the optional-capability checks, so the scope-coverage
      // report is ready the moment the connect succeeds.
      const probe = new HubSpotAdapter(credentials);
      connectedUser = await probe.validateConnection();
      scopeGaps = await scopeGapsFor(probe);
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
      const probe = new SalesforceAdapter(credentials);
      connectedUser = await probe.validateConnection();
      scopeGaps = await scopeGapsFor(probe);
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

  if (state.credentials) {
    // Same credential set may have been cached with pre-scope-change state.
    invalidateAdapterCache({ crm: state.crm, credentials: state.credentials });
  }
  await store.setConnection(state);
  return NextResponse.json({ connection: redact(state), connectedUser, scopeGaps });
}
