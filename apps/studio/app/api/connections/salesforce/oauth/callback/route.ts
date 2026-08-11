import { NextResponse } from "next/server";
import {
  SalesforceAdapter,
  cardstackSalesforceLoginApp,
  exchangeSalesforceAuthorizationCode,
  fetchSalesforceSignerIdentity,
  invalidateAdapterCache,
  stripCardstackClientSecret,
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
  if (error) {
    let hint = "";
    try {
      const { tenantId } = await getUserContextFromRequest(req);
      const store = await getStore();
      const pendingAuth = (await store.getConnection(tenantId)).pendingAuth as
        | Record<string, string>
        | undefined;
      if (pendingAuth?.clientApp === "cardstack") {
        hint = " If your org blocks third-party apps, set up your own connected app instead.";
      }
    } catch {
      // No session/store — surface the raw Salesforce error alone.
    }
    return done(req, { error: error + hint });
  }
  if (!code || !state) return done(req, { error: "Salesforce callback was missing code or state." });

  try {
    const { tenantId } = await getUserContextFromRequest(req);
    const store = await getStore();
    const pending = await store.getConnection(tenantId);
    const pendingAuth = pending.pendingAuth as
      | (Partial<SalesforceCredentials> & { state?: string; codeVerifier?: string })
      | undefined;
    if (
      pending.crm !== "salesforce" ||
      pendingAuth?.authType !== "oauth_pending" ||
      pendingAuth.state !== state ||
      !pendingAuth.redirectUri ||
      !pendingAuth.clientId
    ) {
      return done(req, { error: "Salesforce OAuth state did not match. Start the admin connection again." });
    }

    const clientSecret =
      pendingAuth.clientSecret ??
      (pendingAuth.clientApp === "cardstack"
        ? cardstackSalesforceLoginApp()?.clientSecret
        : undefined);
    if (!clientSecret) {
      return done(req, {
        error: "The deployment's Salesforce app changed mid-authorization — start again.",
      });
    }

    const credentials = await exchangeSalesforceAuthorizationCode({
      loginUrl: pendingAuth.loginUrl,
      clientId: pendingAuth.clientId,
      clientSecret,
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

    // The claim IS the connection (spec §4): the org this token belongs to gets
    // bound to this workspace, exclusively — the unique org_key decides races.
    // On conflict nothing is stored: this workspace keeps no credentials for an
    // org it does not hold.
    const signer = await fetchSalesforceSignerIdentity(credentials);
    // Sandbox tag (spec §4): the login host is the honest signal — pendingAuth
    // staged it at OAuth start. No schema change; the tag rides the name.
    const sandbox = pendingAuth.loginUrl?.includes("test.salesforce.com");
    const orgLabel = signer.orgName ? (sandbox ? `${signer.orgName} (sandbox)` : signer.orgName) : undefined;
    const claim = await store.claimOrg(tenantId, signer.orgId, orgLabel);
    if (!claim.ok) {
      return done(req, {
        error:
          "That Salesforce org is already connected to another Cardstack account. Each org can be connected to exactly one account.",
      });
    }
    // Record WHICH Salesforce user connected — this is what makes Continue with
    // Salesforce a one-click sign-in for the owner later (spec §1, §3).
    const { userId } = await getUserContextFromRequest(req);
    const owner = await store.getAccount(userId);
    if (owner) await store.upsertAccount({ ...owner, salesforceUserId: signer.salesforceUserId });

    // First Salesforce connect over the demo "deals"/hubspot seed (or any other
    // CRM's config) must not leave stale layouts/lists/home cards behind.
    const existingCrm = await store.tenantConfigCrm(tenantId);
    if (existingCrm && existingCrm !== "salesforce") await store.clearTenantConfig(tenantId);
    // Probe/validation above ran on the FULL credentials (secret included —
    // refresh during validation must work); only the stored row is stripped.
    const persisted =
      pendingAuth.clientApp === "cardstack"
        ? stripCardstackClientSecret({ ...credentials, clientApp: "cardstack" })
        : credentials;
    const connection: ConnectionState = {
      tenantId,
      status: "connected",
      crm: "salesforce",
      label: "admin OAuth",
      changedAt: new Date().toISOString(),
      credentials: persisted as unknown as Record<string, string>,
    };
    await store.setConnection(connection);
    return done(req, { salesforce: "connected", connectedUser });
  } catch (err) {
    return done(req, { error: err instanceof Error ? err.message : String(err) });
  }
}
