import { NextResponse } from "next/server";
import type { ConnectionState } from "@cardstack/config-store";
import {
  HubSpotAdapter,
  SalesforceAdapter,
  cardstackSalesforceLoginApp,
  hydrateSalesforceClientSecret,
  invalidateAdapterCache,
  stripCardstackClientSecret,
  type CrmAdapter,
  type HubSpotCredentials,
  type SalesforceCredentials,
} from "@cardstack/crm-adapters";
import { getAdapter, getStore } from "../../../lib/backend";
import { getUserContextFromRequest } from "../../../lib/auth";

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

export async function GET(req: Request) {
  const { tenantId } = await getUserContextFromRequest(req);
  const store = await getStore();
  const connection = await store.getConnection(tenantId);
  const cardstackAppAvailable = Boolean(cardstackSalesforceLoginApp());
  if (connection.status !== "connected") {
    return NextResponse.json({
      connection: redact(connection),
      connectedUser: null,
      scopeGaps: [],
      cardstackAppAvailable,
    });
  }
  try {
    const adapter = await getAdapter(tenantId);
    const [connectedUser, scopeGaps] = await Promise.all([
      adapter.getConnectedUser().catch(() => null),
      scopeGapsFor(adapter),
    ]);
    return NextResponse.json({
      connection: redact(connection),
      connectedUser,
      scopeGaps,
      cardstackAppAvailable,
    });
  } catch (error) {
    // This page IS where the admin goes to reconnect, so a live connection
    // whose adapter can't be built (e.g. a one-click connection whose env app
    // is gone or changed) must still render — degrade the adapter-dependent
    // extras and surface the reason instead of 500ing the whole page.
    return NextResponse.json({
      connection: redact(connection),
      connectedUser: null,
      scopeGaps: [],
      cardstackAppAvailable,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

interface ConnectBody {
  action?: "connect" | "disconnect" | "refresh";
  kind?: "mock" | "hubspot" | "salesforce";
  credentials?: Record<string, string>;
}

export async function POST(req: Request) {
  const { tenantId } = await getUserContextFromRequest(req);
  const body = (await req.json()) as ConnectBody;
  const store = await getStore();

  // Re-read scopes/lists WITHOUT re-entering credentials: drop cached adapters,
  // re-probe with a fresh one, and bump changedAt so every process (incl. the
  // MCP server) rebuilds its adapter on the next call.
  if (body.action === "refresh") {
    const current = await store.getConnection(tenantId);
    if (current.status !== "connected" || !current.credentials) {
      return NextResponse.json({ error: "No live connection to refresh." }, { status: 400 });
    }
    invalidateAdapterCache({ crm: current.crm, credentials: current.credentials });
    let connectedUser: string | null = null;
    let scopeGaps: string[] = [];
    // The probe may force a token refresh; under Salesforce rotation the NEW
    // refresh token must reach the store, or the stored one is dead after this
    // request and the whole connection dies.
    let rotated: Record<string, string> | null = null;
    try {
      // One-click (Cardstack-app) Salesforce rows are stored WITHOUT a client
      // secret; hydrate with the env app's secret before building the probe,
      // same as getAdapter's pattern in lib/backend.ts. BYO credentials pass
      // through untouched. Throws a CrmAuthError (caught below, surfaced as a
      // JSON error) when the env app is missing or has changed.
      const credentials =
        current.crm === "salesforce"
          ? (hydrateSalesforceClientSecret(
              current.credentials as unknown as SalesforceCredentials,
            ) as unknown as Record<string, string>)
          : current.credentials;
      const probe =
        current.crm === "salesforce"
          ? new SalesforceAdapter(
              credentials as unknown as SalesforceCredentials,
              undefined,
              (creds) => {
                rotated = creds as unknown as Record<string, string>;
              },
            )
          : new HubSpotAdapter(credentials as unknown as HubSpotCredentials);
      connectedUser = await probe.validateConnection();
      scopeGaps = await scopeGapsFor(probe);
    } catch (error) {
      // Even on failure, a rotation that DID happen must be persisted — the
      // old token is already invalid. Strip the hydrated env secret before it
      // ever reaches the store (no store row may hold the env secret).
      if (rotated) {
        await store.setConnection({
          ...current,
          credentials: stripCardstackClientSecret(rotated),
          changedAt: new Date().toISOString(),
        });
      }
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: `Refresh failed: ${message}` }, { status: 400 });
    }
    const state: ConnectionState = {
      ...current,
      ...(rotated ? { credentials: stripCardstackClientSecret(rotated) } : {}),
      changedAt: new Date().toISOString(),
    };
    await store.setConnection(state);
    return NextResponse.json({ connection: redact(state), connectedUser, scopeGaps });
  }

  if (body.action === "disconnect") {
    const current = await store.getConnection(tenantId);
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
    // Releasing the claim frees the org for another account. Rep memberships and
    // user connections under THIS workspace id stay: reconnecting the same org
    // restores service without re-onboarding, and nothing here is reachable by a
    // future claimant, whose claim lands in their own workspace (spec §4, §7).
    if (current.crm === "salesforce") await store.releaseOrg(tenantId);
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
        tenantId,
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
        tenantId,
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
        tenantId,
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
  // Connecting a CRM whose object model differs from the existing config (e.g. the
  // demo "deals"/hubspot seed when a Salesforce org connects) leaves stale layouts,
  // lists, and home cards behind. Wipe them so the workspace starts clean.
  const existingCrm = await store.tenantConfigCrm(tenantId);
  const clearedStaleConfig = !!existingCrm && existingCrm !== state.crm;
  if (clearedStaleConfig) await store.clearTenantConfig(tenantId);
  await store.setConnection(state);
  return NextResponse.json({ connection: redact(state), connectedUser, scopeGaps, clearedStaleConfig });
}
