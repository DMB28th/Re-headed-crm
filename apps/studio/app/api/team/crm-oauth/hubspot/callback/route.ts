/**
 * HubSpot OAuth callback — exchange code, require portal match, store per-rep tokens.
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  exchangeHubSpotCode,
  fetchHubSpotAccessTokenInfo,
  HubSpotAdapter,
} from "@cardstack/crm-adapters";
import { createUserCrmStore } from "@cardstack/auth";
import { isAuthEnabled } from "../../../../../../lib/auth";
import { setCrmOwnerId } from "../../../../../../lib/crm-link";
import {
  hubspotOauthRedirectUri,
  studioBaseUrl,
  verifyOauthState,
} from "../../../../../../lib/oauth-state";

export const dynamic = "force-dynamic";

function teamRedirect(query: Record<string, string>): NextResponse {
  const url = new URL("/team", studioBaseUrl());
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  if (!isAuthEnabled()) {
    return teamRedirect({ oauth_error: "auth_disabled" });
  }
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
  if (!clientId || !clientSecret || !process.env.DATABASE_URL) {
    return teamRedirect({ oauth_error: "hubspot_app_missing" });
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const err = req.nextUrl.searchParams.get("error");
  if (err) return teamRedirect({ oauth_error: err });
  if (!code || !state) return teamRedirect({ oauth_error: "missing_code" });

  const verified = verifyOauthState(state);
  if (!verified) return teamRedirect({ oauth_error: "invalid_state" });

  try {
    const tokens = await exchangeHubSpotCode(
      { clientId, clientSecret },
      { code, redirectUri: hubspotOauthRedirectUri() },
    );
    const info = await fetchHubSpotAccessTokenInfo(tokens.accessToken);
    const authorizedPortal = info.hubId ? String(info.hubId) : "";

    if (!authorizedPortal || authorizedPortal !== String(verified.expectedPortalId)) {
      return teamRedirect({
        oauth_error: "wrong_portal",
        expected: String(verified.expectedPortalId),
        got: authorizedPortal || "unknown",
      });
    }

    const store = await createUserCrmStore(process.env.DATABASE_URL);

    await store.upsertToken({
      tenantId: verified.tenantId,
      userId: verified.userId,
      crm: "hubspot",
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scopes: tokens.scopes ?? null,
      portalId: authorizedPortal,
    });

    await store.upsertLink({
      tenantId: verified.tenantId,
      userId: verified.userId,
      crm: "hubspot",
      crmUserId: info.userId,
      crmEmail: info.email ?? null,
      source: "oauth",
    });

    try {
      const adapter = new HubSpotAdapter({ accessToken: tokens.accessToken });
      const ownerId = await adapter.resolveOwnerIdForUserId(info.userId);
      if (ownerId) {
        await setCrmOwnerId(verified.tenantId, verified.userId, "hubspot", ownerId);
      }
    } catch {
      // best-effort
    }

    return teamRedirect({ oauth: "hubspot_connected", remint: "1" });
  } catch (error) {
    return teamRedirect({
      oauth_error: error instanceof Error ? error.message.slice(0, 120) : "exchange_failed",
    });
  }
}
