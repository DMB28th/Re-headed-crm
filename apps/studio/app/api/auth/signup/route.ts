import { NextResponse } from "next/server";
import { getStore } from "../../../../lib/backend";
import { signup } from "../../../../lib/account-flows";
import { mintStudioSession } from "../../../../lib/session-mint";
import { clientKey, rateLimited } from "../../../../lib/request-guard";
import { sendMail } from "../../../../lib/mail";
import { buildAuthLinks, claimEmail, verificationEmail } from "../../../../lib/auth-links";
import { studioOrigin } from "../../../../lib/oauth";
import { STUDIO_SESSION_COOKIE, studioSessionCookieOptions } from "../../../../lib/studio-session";

const MAX_SIGNUPS_PER_MINUTE = 10;

export async function POST(req: Request) {
  if (rateLimited(`auth-signup:${clientKey(req)}`, { max: MAX_SIGNUPS_PER_MINUTE })) {
    return NextResponse.json({ error: "Too many attempts. Wait a minute and try again." }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as { email?: string; name?: string; password?: string };
  if (!body.email || !body.name || !body.password) {
    return NextResponse.json({ error: "Email, name, and password are required." }, { status: 400 });
  }
  const store = await getStore();
  const links = buildAuthLinks(studioOrigin(req.url));
  const result = await signup(store, { email: body.email, name: body.name, password: body.password });

  if (result.kind === "invalid") return NextResponse.json({ error: result.message }, { status: 400 });
  if (result.kind === "exists-with-password") {
    return NextResponse.json(
      { error: "An account with this email already exists — sign in instead." },
      { status: 409 },
    );
  }
  if (result.kind === "claim-email-sent") {
    const account = await store.getAccount(result.accountId);
    await sendMail({ to: body.email.trim(), ...claimEmail(account?.name ?? "there", links.resetUrl(result.claimToken)) });
    return NextResponse.json({ status: "check-email" });
  }

  await sendMail({ to: result.account.email!, ...verificationEmail(result.account.name, links.verifyUrl(result.verifyToken)) });
  const cookie = await mintStudioSession(store, result.account.id, result.workspace.id);
  if (!cookie) {
    console.error("[auth] signup succeeded but no session signing secret is configured");
    return NextResponse.json({ error: "Sign-in is unavailable on this deployment." }, { status: 503 });
  }
  const response = NextResponse.json({ status: "signed-in" });
  response.cookies.set(STUDIO_SESSION_COOKIE, cookie, studioSessionCookieOptions());
  return response;
}
