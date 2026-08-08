/**
 * Complete "Sign in with Salesforce": exchange the code, resolve who signed in,
 * find-or-create their workspace, and mint the Studio session.
 *
 * This is the only place a Studio session is created. Everything it trusts comes
 * from a token exchange against Salesforce plus a `state` we minted ourselves —
 * nothing from the query string except the opaque code and state.
 */
import { NextResponse } from "next/server";
import {
  exchangeSalesforceAuthorizationCode,
  cardstackSalesforceLoginApp,
  fetchSalesforceSignerIdentity,
} from "@cardstack/crm-adapters";
import { resolveSignIn } from "@cardstack/config-store";
import { getStore } from "../../../../../lib/backend";
import { studioOrigin } from "../../../../../lib/oauth";
import { LOGIN_PENDING_NS, safeNext, type PendingLogin } from "../../../../../lib/login-flow";
import {
  createStudioSession,
  newSessionId,
  SESSION_TTL_SECONDS,
  sessionSigningSecrets,
  STUDIO_SESSION_COOKIE,
  STUDIO_SESSION_NS,
  studioSessionCookieOptions,
  type StudioSessionRecord,
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
  if (oauthError) return fail(oauthError);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail("Salesforce sign-in was missing its code or state.");

  const secrets = sessionSigningSecrets();
  const signingSecret = secrets[0];
  if (!signingSecret) {
    return fail("Sign-in is not configured on this deployment: CARDSTACK_SESSION_SECRET is unset.");
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
    const { account, workspace, role } = await resolveSignIn(store, identity);
    if (role !== "admin") {
      return fail(
        `You joined ${workspace.name}, but Studio is limited to workspace admins. Ask an admin to grant access.`,
      );
    }

    const sessionId = newSessionId();
    const record: StudioSessionRecord = {
      accountId: account.id,
      workspaceId: workspace.id,
      role,
      createdAt: new Date().toISOString(),
    };
    await store.kvSet(
      STUDIO_SESSION_NS,
      sessionId,
      record as unknown as Record<string, unknown>,
      new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(),
    );

    // Belt and braces on A6: safeNext rejects the authority-introducing
    // prefixes, and this re-checks the RESOLVED origin so a future encoding
    // trick that slips past the string check still cannot leave this origin.
    const target = new URL(safeNext(pending.next), origin);
    const response = NextResponse.redirect(
      target.origin === new URL(origin).origin ? target : new URL("/", origin),
    );
    response.cookies.set(
      STUDIO_SESSION_COOKIE,
      await createStudioSession(sessionId, signingSecret),
      studioSessionCookieOptions(),
    );
    return response;
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}
