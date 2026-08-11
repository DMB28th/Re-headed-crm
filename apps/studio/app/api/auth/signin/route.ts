import { NextResponse } from "next/server";
import { getStore } from "../../../../lib/backend";
import { signin } from "../../../../lib/account-flows";
import { mintStudioSession } from "../../../../lib/session-mint";
import { clientKey, rateLimited } from "../../../../lib/request-guard";
import { STUDIO_SESSION_COOKIE, studioSessionCookieOptions } from "../../../../lib/studio-session";

/**
 * Failure-only limiting, mirroring /api/session's pattern: a legitimate typo
 * costs nothing, and only a run of WRONG passwords starts refusing.
 */
const MAX_SIGNIN_FAILURES_PER_MINUTE = 10;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  if (!body.email || !body.password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  const store = await getStore();
  const result = await signin(store, { email: body.email, password: body.password });

  if (result.kind === "invalid") {
    const source = clientKey(req);
    const limited = rateLimited(`auth-signin:${source}`, { max: MAX_SIGNIN_FAILURES_PER_MINUTE });
    console.warn(`[security] failed studio sign-in for ${source}`);
    if (limited) {
      return NextResponse.json({ error: "Too many attempts. Wait a minute and try again." }, { status: 429 });
    }
    return NextResponse.json({ error: "Wrong email or password." }, { status: 401 });
  }

  const cookie = await mintStudioSession(store, result.account.id, result.workspace.id);
  if (!cookie) {
    console.error("[auth] signin succeeded but no session signing secret is configured");
    return NextResponse.json({ error: "Sign-in is unavailable on this deployment." }, { status: 503 });
  }
  const response = NextResponse.json({ status: "signed-in" });
  response.cookies.set(STUDIO_SESSION_COOKIE, cookie, studioSessionCookieOptions());
  return response;
}
