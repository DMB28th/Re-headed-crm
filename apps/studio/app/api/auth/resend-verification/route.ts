import { NextResponse } from "next/server";
import { getStore } from "../../../../lib/backend";
import { getStudioIdentity } from "../../../../lib/auth";
import { sendMail } from "../../../../lib/mail";
import { buildAuthLinks, verificationEmail } from "../../../../lib/auth-links";
import { studioOrigin } from "../../../../lib/oauth";
import { EMAIL_VERIFY_NS, issueToken, VERIFY_TTL_MS } from "../../../../lib/auth-tokens";

export async function POST(req: Request) {
  const identity = await getStudioIdentity();
  if (!identity) {
    return NextResponse.json({ error: "Sign in to resend a verification email." }, { status: 401 });
  }
  if (identity.account.emailVerifiedAt) {
    return NextResponse.json({ status: "verified" });
  }
  if (!identity.account.email) {
    return NextResponse.json({ error: "This account has no email to verify." }, { status: 400 });
  }

  const store = await getStore();
  const links = buildAuthLinks(studioOrigin(req.url));
  const verifyToken = await issueToken(store, EMAIL_VERIFY_NS, { accountId: identity.account.id }, VERIFY_TTL_MS);
  await sendMail({
    to: identity.account.email,
    ...verificationEmail(identity.account.name, links.verifyUrl(verifyToken)),
  });
  return NextResponse.json({ status: "check-email" });
}
