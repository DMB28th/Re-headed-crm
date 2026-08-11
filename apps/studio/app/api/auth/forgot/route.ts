import { NextResponse } from "next/server";
import { getStore } from "../../../../lib/backend";
import { requestPasswordReset } from "../../../../lib/account-flows";
import { clientKey, rateLimited } from "../../../../lib/request-guard";
import { sendMail } from "../../../../lib/mail";
import { buildAuthLinks, resetEmail } from "../../../../lib/auth-links";
import { studioOrigin } from "../../../../lib/oauth";

const MAX_FORGOT_PER_MINUTE = 5;

export async function POST(req: Request) {
  if (rateLimited(`auth-forgot:${clientKey(req)}`, { max: MAX_FORGOT_PER_MINUTE })) {
    return NextResponse.json({ error: "Too many attempts. Wait a minute and try again." }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  // Always the same response either way — spec §3 enumeration resistance: a
  // response that differed by "does this email have an account" would let a
  // caller enumerate signed-up emails for free.
  if (body.email) {
    const store = await getStore();
    const result = await requestPasswordReset(store, body.email);
    if (result) {
      const account = await store.getAccount(result.accountId);
      if (account?.email) {
        const links = buildAuthLinks(studioOrigin(req.url));
        // Deliberately not awaited: awaiting the outbound Resend fetch here
        // would make a HIT measurably slower to respond to than a MISS,
        // turning this constant-response-body route into a timing side
        // channel (spec §3 enumeration resistance). The token is already
        // durably stored, so a failed send just means the user asks again.
        void sendMail({ to: account.email, ...resetEmail(account.name, links.resetUrl(result.resetToken)) }).catch(
          (error) => console.error("[mail] reset send failed", error),
        );
      }
    }
  }
  return NextResponse.json({ status: "check-email" });
}
