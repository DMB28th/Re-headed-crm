/**
 * Per-rep HubSpot OAuth — connect as yourself on the workspace's HubSpot portal.
 * The expected portal id is stamped into OAuth state and enforced on callback.
 */
import { NextResponse } from "next/server";
import { hubspotAuthorizeUrl } from "@cardstack/crm-adapters";
import { isAuthEnabled } from "../../../../../../lib/auth";
import { getAdapter, getStore } from "../../../../../../lib/backend";
import {
  hubspotOauthRedirectUri,
  signOauthState,
  studioBaseUrl,
} from "../../../../../../lib/oauth-state";
import { requireSession, requireTenantId } from "../../../../../../lib/session";

export const dynamic = "force-dynamic";

function teamRedirect(query: Record<string, string>): NextResponse {
  const url = new URL("/team", studioBaseUrl());
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET() {
  if (!isAuthEnabled()) {
    return teamRedirect({ oauth_error: "auth_disabled" });
  }
  if (!process.env.HUBSPOT_CLIENT_ID || !process.env.HUBSPOT_CLIENT_SECRET) {
    return teamRedirect({ oauth_error: "hubspot_app_missing" });
  }
  try {
    const session = await requireSession();
    const tenantId = await requireTenantId();
    const connection = await (await getStore()).getConnection(tenantId);

    if (connection.status !== "connected" || connection.crm !== "hubspot") {
      return teamRedirect({ oauth_error: "workspace_not_hubspot" });
    }
    if (!connection.credentials) {
      return teamRedirect({ oauth_error: "workspace_mock" });
    }

    const portal = await (await getAdapter(tenantId)).getPortalInfo();
    const expectedPortalId = portal.portalId;
    if (!expectedPortalId) {
      return teamRedirect({ oauth_error: "portal_unreadable" });
    }

    const payload = Buffer.from(
      JSON.stringify({
        userId: session.user.id,
        tenantId,
        expectedPortalId: String(expectedPortalId),
        exp: Date.now() + 10 * 60 * 1000,
      }),
      "utf8",
    ).toString("base64url");
    const state = signOauthState(payload);
    const url = hubspotAuthorizeUrl({
      clientId: process.env.HUBSPOT_CLIENT_ID,
      redirectUri: hubspotOauthRedirectUri(),
      state,
    });
    return NextResponse.redirect(url);
  } catch (error) {
    return teamRedirect({
      oauth_error: error instanceof Error ? error.message.slice(0, 80) : "start_failed",
    });
  }
}
