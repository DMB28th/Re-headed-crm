import { NextResponse } from "next/server";
import { getStore } from "../../../../lib/backend";
import { consumeToken, PENDING_LINK_NS } from "../../../../lib/auth-tokens";
import { verifyPassword } from "../../../../lib/password";
import { mintStudioSession } from "../../../../lib/session-mint";
import { ensureOwnedWorkspace } from "../../../../lib/account-flows";
import { clientKey, rateLimited } from "../../../../lib/request-guard";
import { STUDIO_SESSION_COOKIE, studioSessionCookieOptions } from "../../../../lib/studio-session";

/** Password-once-to-link (spec §3): a correct password records the Salesforce
 *  user id on the account; only then does the Salesforce button become one
 *  click. This is a password check, so it is rate-limited like sign-in. */
const MAX_FAILURES_PER_MINUTE = 10;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { token?: string; password?: string };
  if (!body.token || !body.password) {
    return NextResponse.json({ error: "Token and password are required." }, { status: 400 });
  }
  const store = await getStore();
  const pending = await consumeToken(store, PENDING_LINK_NS, body.token);
  const accountId = typeof pending?.accountId === "string" ? pending.accountId : undefined;
  const salesforceUserId =
    typeof pending?.salesforceUserId === "string" ? pending.salesforceUserId : undefined;
  const account = accountId ? await store.getAccount(accountId) : undefined;
  if (!account?.passwordHash || !salesforceUserId) {
    return NextResponse.json(
      { error: "That link expired. Start again with Continue with Salesforce." },
      { status: 400 },
    );
  }
  if (!(await verifyPassword(account.passwordHash, body.password))) {
    // Token was consumed — a wrong guess costs a fresh Salesforce round-trip.
    // That is deliberate: this endpoint must not become an offline oracle
    // against a stolen link.
    if (rateLimited(`auth-link:${clientKey(req)}`, { max: MAX_FAILURES_PER_MINUTE })) {
      return NextResponse.json({ error: "Too many attempts. Wait a minute." }, { status: 429 });
    }
    return NextResponse.json(
      { error: "Wrong password. Start again with Continue with Salesforce." },
      { status: 401 },
    );
  }
  await store.upsertAccount({ ...account, salesforceUserId });
  const workspace = await ensureOwnedWorkspace(store, account.id);
  const cookie = await mintStudioSession(store, account.id, workspace.id);
  if (!cookie) return NextResponse.json({ error: "Sign-in is unavailable on this deployment." }, { status: 503 });
  const response = NextResponse.json({ status: "signed-in" });
  response.cookies.set(STUDIO_SESSION_COOKIE, cookie, studioSessionCookieOptions());
  return response;
}
