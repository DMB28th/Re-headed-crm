import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  buildSalesforceAuthorizationUrl,
  normalizeSalesforceLoginUrl,
  type SalesforceCredentials,
} from "@cardstack/crm-adapters";
import type { UserConnectionState } from "@cardstack/config-store";
import { getUserContextFromRequest } from "../../../../../../lib/auth";
import { getStore } from "../../../../../../lib/backend";
import { createPkcePair, studioOrigin } from "../../../../../../lib/oauth";

// POST (not GET) so the mutation is covered by the middleware's method-based
// guard and is not CSRF-triggerable from a plain link/img. Returns the authorize
// URL for the client to navigate to, mirroring the admin lane.
export async function POST(req: Request) {
  try {
    const { tenantId, userId } = getUserContextFromRequest(req);
    const store = await getStore();
    const workspace = await store.getConnection(tenantId);
    const adminCredentials = workspace.credentials as SalesforceCredentials | undefined;
    if (
      workspace.status !== "connected" ||
      workspace.crm !== "salesforce" ||
      adminCredentials?.authType !== "oauth"
    ) {
      return NextResponse.json(
        { error: "An admin must connect Salesforce with OAuth before users can authorize." },
        { status: 400 },
      );
    }
    const loginUrl = normalizeSalesforceLoginUrl(adminCredentials.loginUrl);
    const redirectUri = `${studioOrigin(req.url)}/api/user-connections/salesforce/oauth/callback`;
    const state = randomUUID();
    const { verifier, challenge } = createPkcePair();
    // The client secret is NOT copied per user — it lives once on the admin
    // connection and is sourced at exchange (callback) and refresh (runtime).
    const pendingCredentials = {
      authType: "oauth_pending",
      loginUrl,
      clientId: adminCredentials.clientId,
      redirectUri,
      state,
      codeVerifier: verifier,
    } satisfies Record<string, string>;
    const userConnection: UserConnectionState = {
      tenantId,
      userId,
      status: "disconnected",
      crm: "salesforce",
      label: "user OAuth pending",
      changedAt: new Date().toISOString(),
      credentials: pendingCredentials,
    };
    await store.setUserConnection(userConnection);
    return NextResponse.json({
      authorizationUrl: buildSalesforceAuthorizationUrl({
        loginUrl,
        clientId: adminCredentials.clientId,
        redirectUri,
        state,
        codeChallenge: challenge,
      }),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
