/**
 * Per-rep HubSpot OAuth — "Connect HubSpot as me".
 * Uses HUBSPOT_CLIENT_ID / HUBSPOT_CLIENT_SECRET (same app as Studio SSO).
 */
import { NextResponse } from "next/server";
import { hubspotAuthorizeUrl } from "@cardstack/crm-adapters";
import { isAuthEnabled } from "../../../../../../lib/auth";
import {
  hubspotOauthRedirectUri,
  signOauthState,
} from "../../../../../../lib/oauth-state";
import { requireSession, requireTenantId } from "../../../../../../lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isAuthEnabled()) {
    return NextResponse.json({ error: "Auth is not enabled." }, { status: 503 });
  }
  if (!process.env.HUBSPOT_CLIENT_ID || !process.env.HUBSPOT_CLIENT_SECRET) {
    return NextResponse.json(
      {
        error:
          "HubSpot OAuth app not configured. Set HUBSPOT_CLIENT_ID and HUBSPOT_CLIENT_SECRET.",
      },
      { status: 503 },
    );
  }
  try {
    const session = await requireSession();
    const tenantId = await requireTenantId();
    const payload = Buffer.from(
      JSON.stringify({
        userId: session.user.id,
        tenantId,
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
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
