import { NextResponse } from "next/server";
import { getStore } from "../../../../lib/backend";
import { performPasswordReset } from "../../../../lib/account-flows";
import { mintStudioSession } from "../../../../lib/session-mint";
import { STUDIO_SESSION_COOKIE, studioSessionCookieOptions } from "../../../../lib/studio-session";

// No rate limiter here: the request is gated by possession of a single-use,
// short-lived token (spec §3), not by request volume.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { token?: string; password?: string };
  if (!body.token || !body.password) {
    return NextResponse.json({ error: "A reset token and new password are required." }, { status: 400 });
  }
  const store = await getStore();
  const result = await performPasswordReset(store, body.token, body.password);

  if (result.kind === "weak") return NextResponse.json({ error: result.message }, { status: 400 });
  if (result.kind === "invalid") {
    return NextResponse.json(
      { error: "That link expired or was already used. Request a new one." },
      { status: 400 },
    );
  }

  const cookie = await mintStudioSession(store, result.account.id, result.workspace.id);
  if (!cookie) {
    console.error("[auth] password reset succeeded but no session signing secret is configured");
    return NextResponse.json({ error: "Sign-in is unavailable on this deployment." }, { status: 503 });
  }
  const response = NextResponse.json({ status: "signed-in" });
  response.cookies.set(STUDIO_SESSION_COOKIE, cookie, studioSessionCookieOptions());
  return response;
}
