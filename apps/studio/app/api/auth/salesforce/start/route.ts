/**
 * Begin "Sign in with Salesforce" — the Cardstack account lane.
 *
 * Distinct from the two lanes under /api/connections and /api/user-connections:
 * those authorize a CRM for a workspace that already exists, using that
 * workspace's connected app. This one runs BEFORE any workspace exists (signing
 * in is what creates it), so it can only use the Cardstack-owned app.
 *
 * GET, not POST: this is a plain link on the login page and creates nothing but
 * short-lived pending state. The session is minted only in the callback, after
 * Salesforce has actually authenticated the person and the `state` matches.
 */
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  buildSalesforceAuthorizationUrl,
  cardstackSalesforceLoginApp,
  normalizeSalesforceLoginUrl,
} from "@cardstack/crm-adapters";
import { getStore } from "../../../../../lib/backend";
import { createPkcePair, studioOrigin } from "../../../../../lib/oauth";
import { LOGIN_PENDING_NS, LOGIN_PENDING_TTL_MS, safeNext } from "../../../../../lib/login-flow";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = studioOrigin(req.url);
  const fail = (error: string) => {
    const back = new URL("/login", origin);
    back.searchParams.set("error", error);
    return NextResponse.redirect(back);
  };

  const app = cardstackSalesforceLoginApp();
  if (!app) {
    return fail(
      "Sign-in is not configured on this deployment: CARDSTACK_SF_CLIENT_ID and CARDSTACK_SF_CLIENT_SECRET are unset.",
    );
  }

  try {
    // Sandbox orgs authenticate against test.salesforce.com; the login page
    // offers the same Production/Sandbox choice the design's connect card does.
    const loginUrl = normalizeSalesforceLoginUrl(
      url.searchParams.get("env") === "sandbox"
        ? "https://test.salesforce.com"
        : "https://login.salesforce.com",
    );
    const redirectUri = `${origin}/api/auth/salesforce/callback`;
    const state = randomUUID();
    const { verifier, challenge } = createPkcePair();

    const store = await getStore();
    await store.kvSet(
      LOGIN_PENDING_NS,
      state,
      { codeVerifier: verifier, redirectUri, loginUrl, next: safeNext(url.searchParams.get("next")) },
      new Date(Date.now() + LOGIN_PENDING_TTL_MS).toISOString(),
    );

    return NextResponse.redirect(
      buildSalesforceAuthorizationUrl({
        loginUrl,
        clientId: app.clientId,
        redirectUri,
        state,
        codeChallenge: challenge,
      }),
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}
