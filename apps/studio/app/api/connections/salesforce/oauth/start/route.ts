import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  buildSalesforceAuthorizationUrl,
  normalizeSalesforceLoginUrl,
} from "@cardstack/crm-adapters";
import type { ConnectionState } from "@cardstack/config-store";
import { getUserContextFromRequest } from "../../../../../../lib/auth";
import { getStore } from "../../../../../../lib/backend";
import { createPkcePair, studioOrigin } from "../../../../../../lib/oauth";

interface StartBody {
  loginUrl?: string;
  clientId?: string;
  clientSecret?: string;
}

export async function POST(req: Request) {
  try {
    const { tenantId } = getUserContextFromRequest(req);
    const body = (await req.json()) as StartBody;
    const loginUrl = normalizeSalesforceLoginUrl(body.loginUrl);
    const clientId = body.clientId?.trim();
    const clientSecret = body.clientSecret?.trim();
    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: "Consumer key and consumer secret are required." }, { status: 400 });
    }

    const redirectUri = `${studioOrigin(req.url)}/api/connections/salesforce/oauth/callback`;
    const state = randomUUID();
    const { verifier, challenge } = createPkcePair();
    // Pending OAuth state (incl. PKCE verifier + the newly entered secret) is
    // staged under `pendingAuth`, checked on callback. Client secret enters the
    // system here and becomes the single canonical copy on the admin connection.
    const pendingAuth: Record<string, string> = {
      authType: "oauth_pending",
      loginUrl,
      clientId,
      clientSecret,
      redirectUri,
      state,
      codeVerifier: verifier,
    };
    const store = await getStore();
    const existing = await store.getConnection(tenantId);
    // Re-authorizing a live connection must not downgrade it — keep the live
    // status/credentials and only stage `pendingAuth`.
    const connection: ConnectionState =
      existing.status === "connected" && existing.crm === "salesforce"
        ? { ...existing, changedAt: new Date().toISOString(), pendingAuth }
        : {
            tenantId,
            status: "disconnected",
            crm: "salesforce",
            label: "admin OAuth pending",
            changedAt: new Date().toISOString(),
            pendingAuth,
          };
    await store.setConnection(connection);

    return NextResponse.json({
      authorizationUrl: buildSalesforceAuthorizationUrl({
        loginUrl,
        clientId,
        redirectUri,
        state,
        codeChallenge: challenge,
      }),
      redirectUri,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
