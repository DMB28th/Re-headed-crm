/** Shared bits of the Salesforce sign-in lane (start ↔ callback). */
import { normalizeUserId } from "@cardstack/core";
import type { Account, AdminConfigStore, SalesforceIdentity, Workspace } from "@cardstack/config-store";
import { issueToken, LINK_TTL_MS, PENDING_LINK_NS } from "./auth-tokens";
import { ensureOwnedWorkspace, type AccountFlowStore } from "./account-flows";

/** KV namespace for pending sign-ins, keyed by the OAuth `state`. */
export const LOGIN_PENDING_NS = "studio-login-pending";
export const LOGIN_PENDING_TTL_MS = 15 * 60 * 1000;

export interface PendingLogin {
  codeVerifier: string;
  redirectUri: string;
  loginUrl: string;
  next: string;
}

/**
 * Only same-site paths survive as post-login redirects.
 *
 * Two separate tricks turn a "path" into a foreign origin, and rejecting a
 * leading `//` only stops the first:
 *
 * - `//evil.com` is protocol-relative, and browsers treat it as absolute.
 * - `/\evil.com` is too. WHATWG URL parsing treats `\` as `/` for special
 *   schemes, so `new URL("/\evil.com", origin)` resolves to `https://evil.com/`.
 *   This is what makes the check below look at the SECOND character rather than
 *   at the literal string `//`.
 *
 * Browsers also strip tab, CR and LF while parsing a URL, so those are removed
 * first — otherwise `/<TAB>/evil.com` passes both checks here and still becomes
 * `//evil.com` by the time the browser resolves it.
 *
 * Callers must ALSO assert the resolved origin (see the sign-in callback): this
 * function is the fix, that assertion is what makes the next encoding trick a
 * non-event.
 */
const ignorable = (ch: string): boolean => {
  const code = ch.charCodeAt(0);
  return code <= 0x1f || code === 0x7f;
};

export function safeNext(candidate: string | null | undefined): string {
  if (!candidate) return "/";
  const cleaned = [...candidate].filter((ch) => !ignorable(ch)).join("");
  if (!cleaned.startsWith("/") || /^[/\\]/.test(cleaned.slice(1))) return "/";
  return cleaned;
}

/** Result of resolving "Continue with Salesforce" against Cardstack accounts. */
export type SalesforceLoginResolution =
  | { kind: "signed-in"; account: Account; workspace: Workspace }
  | { kind: "link-required"; linkToken: string; email: string }
  | { kind: "created"; account: Account; workspace: Workspace };

/**
 * The three-way resolution of spec §3 "Continue with Salesforce". Order
 * matters: the Salesforce user id is proof (Salesforce authenticated it);
 * a matching email alone is NOT — org admins can set a user's email without
 * the inbox confirming, so that case exits to the password-once link step.
 */
export async function resolveSalesforceStudioLogin(
  store: AccountFlowStore & Pick<AdminConfigStore, "getAccountBySalesforceUserId">,
  identity: SalesforceIdentity,
): Promise<SalesforceLoginResolution> {
  const byId = await store.getAccountBySalesforceUserId(identity.salesforceUserId);
  if (byId) {
    const workspace = await ensureOwnedWorkspace(store, byId.id);
    return { kind: "signed-in", account: byId, workspace };
  }

  const byEmail = identity.email ? await store.getAccountByEmail(identity.email) : undefined;
  if (byEmail) {
    const linkToken = await issueToken(
      store,
      PENDING_LINK_NS,
      { accountId: byEmail.id, salesforceUserId: identity.salesforceUserId, name: identity.name },
      LINK_TTL_MS,
    );
    return { kind: "link-required", linkToken, email: byEmail.email ?? identity.email! };
  }

  const now = new Date().toISOString();
  const account: Account = {
    id: normalizeUserId(identity.email ?? identity.username ?? identity.salesforceUserId),
    salesforceUserId: identity.salesforceUserId,
    name: identity.name,
    ...(identity.email ? { email: identity.email, emailVerifiedAt: now } : {}),
    createdAt: now,
  };
  await store.upsertAccount(account);
  const workspace = await ensureOwnedWorkspace(store, account.id);
  return { kind: "created", account, workspace };
}
