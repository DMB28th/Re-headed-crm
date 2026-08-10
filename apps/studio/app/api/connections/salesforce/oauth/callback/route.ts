import { NextResponse } from "next/server";
import {
  SalesforceAdapter,
  exchangeSalesforceAuthorizationCode,
  invalidateAdapterCache,
  type SalesforceCredentials,
} from "@cardstack/crm-adapters";
import type { ConnectionState } from "@cardstack/config-store";
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
  if (!code || !state) return done(req, { error: "Salesforce callback was missing code or state." });

  try {
    const { tenantId } = await getUserContextFromRequest(req);
    const store = await getStore();
    const pending = await store.getConnection(tenantId);
    const pendingAuth = pending.pendingAuth as
      | (SalesforceCredentials & { state?: string; codeVerifier?: string })
      | undefined;
    if (
      pending.crm !== "salesforce" ||
      pendingAuth?.authType !== "oauth_pending" ||
      pendingAuth.state !== state ||
      !pendingAuth.redirectUri
    ) {
      return done(req, { error: "Salesforce OAuth state did not match. Start the admin connection again." });
    }

    const credentials = await exchangeSalesforceAuthorizationCode({
      loginUrl: pendingAuth.loginUrl,
      clientId: pendingAuth.clientId,
      clientSecret: pendingAuth.clientSecret,
      redirectUri: pendingAuth.redirectUri,
      code,
      codeVerifier: pendingAuth.codeVerifier,
    });
    // If the probe somehow refreshes (rotation), fold the rotated tokens back
    // into what we're about to persist — never store an already-dead token.
    const probe = new SalesforceAdapter(credentials, undefined, (rotated) => {
      Object.assign(credentials, rotated);
    });
    const connectedUser = await probe.validateConnection();
    invalidateAdapterCache({ crm: "salesforce", credentials: credentials as unknown as Record<string, string> });
    // First Salesforce connect over the demo "deals"/hubspot seed (or any other
    // CRM's config) must not leave stale layouts/lists/home cards behind.
    const existingCrm = await store.tenantConfigCrm(tenantId);
    if (existingCrm && existingCrm !== "salesforce") await store.clearTenantConfig(tenantId);
    const connection: ConnectionState = {
      tenantId,
      status: "connected",
      crm: "salesforce",
      label: "admin OAuth",
      changedAt: new Date().toISOString(),
      credentials: credentials as unknown as Record<string, string>,
    };
    await store.setConnection(connection);
    return done(req, { salesforce: "connected", connectedUser });
  } catch (err) {
    return done(req, { error: err instanceof Error ? err.message : String(err) });
  }
}
