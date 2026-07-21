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

const done = (req: Request, params: Record<string, string>) => {
  const url = new URL("/connections", req.url);
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
    const { tenantId } = getUserContextFromRequest(req);
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
    const probe = new SalesforceAdapter(credentials);
    const connectedUser = await probe.validateConnection();
    invalidateAdapterCache({ crm: "salesforce", credentials: credentials as unknown as Record<string, string> });
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
