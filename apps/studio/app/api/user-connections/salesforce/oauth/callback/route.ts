import { NextResponse } from "next/server";
import {
  SalesforceAdapter,
  exchangeSalesforceAuthorizationCode,
  invalidateAdapterCache,
  type SalesforceCredentials,
} from "@cardstack/crm-adapters";
import type { UserConnectionState } from "@cardstack/config-store";
import { getUserContextFromRequest } from "../../../../../../lib/auth";
import { getStore } from "../../../../../../lib/backend";
import { studioOrigin } from "../../../../../../lib/oauth";

const done = (req: Request, params: Record<string, string>) => {
  // Base off the canonical Studio origin, not req.url — behind a proxy (Railway)
  // req.url is the internal host (localhost:8080) and would redirect the browser
  // to a dead address.
  const url = new URL("/connections", studioOrigin(req.url));
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (error) return done(req, { error });
  if (!code || !state) return done(req, { error: "Salesforce user callback was missing code or state." });

  try {
    const { tenantId, userId } = getUserContextFromRequest(req);
    const store = await getStore();
    const pending = await store.getUserConnection(tenantId, userId, "salesforce");
    const pendingCredentials = pending?.credentials as
      | (SalesforceCredentials & { state?: string; codeVerifier?: string })
      | undefined;
    if (
      pending?.crm !== "salesforce" ||
      pendingCredentials?.authType !== "oauth_pending" ||
      pendingCredentials.state !== state ||
      !pendingCredentials.redirectUri
    ) {
      return done(req, { error: "Salesforce user OAuth state did not match. Start user authorization again." });
    }

    // The client secret is not stored per user; source it from the admin connection.
    const workspace = await store.getConnection(tenantId);
    const clientSecret = (workspace.credentials as SalesforceCredentials | undefined)?.clientSecret;
    if (!clientSecret) {
      return done(req, {
        error: "The admin Salesforce connection is missing its client secret. Reconnect admin OAuth, then try again.",
      });
    }

    const credentials = await exchangeSalesforceAuthorizationCode({
      loginUrl: pendingCredentials.loginUrl,
      clientId: pendingCredentials.clientId,
      clientSecret,
      redirectUri: pendingCredentials.redirectUri,
      code,
      codeVerifier: pendingCredentials.codeVerifier,
    });
    // If the probe somehow refreshes (rotation), fold the rotated tokens back
    // into what we're about to persist — never store an already-dead token.
    const probe = new SalesforceAdapter(credentials, undefined, (rotated) => {
      Object.assign(credentials, rotated);
    });
    const connectedUser = await probe.validateConnection();
    invalidateAdapterCache({ crm: "salesforce", credentials: credentials as unknown as Record<string, string> });
    // Do NOT persist the shared client secret in the per-user record — the MCP
    // runtime merges it in from the admin connection when building the adapter.
    const { clientSecret: _omitSecret, ...userCredentials } =
      credentials as unknown as Record<string, string>;
    const userConnection: UserConnectionState = {
      tenantId,
      userId,
      status: "connected",
      crm: "salesforce",
      label: "user OAuth",
      changedAt: new Date().toISOString(),
      connectedUser,
      credentials: userCredentials,
    };
    await store.setUserConnection(userConnection);
    return done(req, { salesforce_user: "connected" });
  } catch (err) {
    return done(req, { error: err instanceof Error ? err.message : String(err) });
  }
}
