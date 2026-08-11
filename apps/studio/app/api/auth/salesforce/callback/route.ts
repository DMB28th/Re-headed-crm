/**
 * Complete "Continue with Salesforce": exchange the code, then resolve the
 * signer against Cardstack accounts as a PEER sign-in/signup lane (spec §3),
 * not a chat-lane membership grant — that's `resolveSignIn`, which this route
 * no longer calls.
 *
 * This is the only place a Studio session is created for this lane. Everything
 * it trusts comes from a token exchange against Salesforce plus a `state` we
 * minted ourselves — nothing from the query string except the opaque code and
 * state.
 *
 * Migration note (2026-08-10): resolveSignIn no longer creates workspaces;
 * this lane resolves accounts itself.
 */
import { NextResponse } from "next/server";
import {
  describeSalesforceAuthError,
  exchangeSalesforceAuthorizationCode,
  cardstackSalesforceLoginApp,
  fetchSalesforceSignerIdentity,
} from "@cardstack/crm-adapters";
import { getStore } from "../../../../../lib/backend";
import { studioOrigin } from "../../../../../lib/oauth";
import {
  LOGIN_PENDING_NS,
  resolveSalesforceStudioLogin,
  safeNext,
  type PendingLogin,
} from "../../../../../lib/login-flow";
import { mintStudioSession } from "../../../../../lib/session-mint";
import {
  sessionSigningSecrets,
  STUDIO_SESSION_COOKIE,
  studioSessionCookieOptions,
} from "../../../../../lib/studio-session";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = studioOrigin(req.url);
  const fail = (error: string) => {
    const back = new URL("/login", origin);
    back.searchParams.set("error", error);
    return NextResponse.redirect(back);
  };

  const oauthError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (oauthError) {
    // Self-signup's most common blocker is org policy, not anything Cardstack
    // did. Hand over the exact request to make instead of an error code.
    return fail(
      describeSalesforceAuthError(oauthError, {
        name: "Cardstack",
        clientId: cardstackSalesforceLoginApp()?.clientId,
      }).message,
    );
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail("Salesforce sign-in was missing its code or state.");

  const secrets = sessionSigningSecrets();
  const signingSecret = secrets[0];
  if (!signingSecret) {
    // Specifics to the server log only — the redirect lands on /login, and
    // AuthShell renders `error` verbatim (spec: never render env var names).
    console.error("[auth] Salesforce sign-in unavailable: CARDSTACK_SESSION_SECRET is unset.");
    return fail("Sign-in is not available on this deployment.");
  }
  const app = cardstackSalesforceLoginApp();
  if (!app) return fail("Sign-in is not configured on this deployment.");

  try {
    const store = await getStore();
    const pending = (await store.kvGet(LOGIN_PENDING_NS, state)) as PendingLogin | undefined;
    // Unknown state = forged, replayed, or expired. Single-use: delete before
    // doing any work so the same code can't be exchanged twice.
    if (!pending) return fail("That sign-in link expired or was already used. Try again.");
    await store.kvDelete(LOGIN_PENDING_NS, state);

    const credentials = await exchangeSalesforceAuthorizationCode({
      loginUrl: pending.loginUrl,
      clientId: app.clientId,
      clientSecret: app.clientSecret,
      redirectUri: pending.redirectUri,
      code,
      codeVerifier: pending.codeVerifier,
    });
    if (!credentials.instanceUrl || !credentials.accessToken) {
      throw new Error("Salesforce sign-in did not return a usable access token.");
    }

    const identity = await fetchSalesforceSignerIdentity(credentials);
    const resolution = await resolveSalesforceStudioLogin(store, identity);
    if (resolution.kind === "link-required") {
      const link = new URL("/link", origin);
      link.searchParams.set("token", resolution.linkToken);
      link.searchParams.set("email", resolution.email);
      return NextResponse.redirect(link);
    }
    if (resolution.kind === "unlinkable") return fail(resolution.message);
    const cookie = await mintStudioSession(store, resolution.account.id, resolution.workspace.id);
    if (!cookie) return fail("Sign-in is unavailable on this deployment.");

    // Belt and braces on A6: safeNext rejects the authority-introducing
    // prefixes, and this re-checks the RESOLVED origin so a future encoding
    // trick that slips past the string check still cannot leave this origin.
    const target = new URL(safeNext(pending.next), origin);
    const response = NextResponse.redirect(
      target.origin === new URL(origin).origin ? target : new URL("/", origin),
    );
    response.cookies.set(STUDIO_SESSION_COOKIE, cookie, studioSessionCookieOptions());
    return response;
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}
