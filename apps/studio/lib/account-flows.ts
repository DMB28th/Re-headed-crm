/**
 * Pure account flows: every rule from spec §3 lives here, testable without
 * HTTP. Routes (Task 8) only parse, rate-limit, call one function, and mint
 * the session via session-mint.ts.
 */
import { normalizeUserId } from "@cardstack/core";
import { newWorkspaceId, type Account, type AdminConfigStore, type Workspace } from "@cardstack/config-store";
import {
  burnTimingForMissingAccount,
  hashPassword,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  verifyPassword,
} from "./password";
import {
  CLAIM_TTL_MS,
  consumeToken,
  EMAIL_VERIFY_NS,
  issueToken,
  PASSWORD_RESET_NS,
  RESET_TTL_MS,
  VERIFY_TTL_MS,
} from "./auth-tokens";

export type AccountFlowStore = Pick<
  AdminConfigStore,
  | "getAccount"
  | "getAccountByEmail"
  | "upsertAccount"
  | "createWorkspace"
  | "getWorkspaceByOwner"
  | "kvGet"
  | "kvSet"
  | "kvDelete"
>;

export type SignupResult =
  | { kind: "created"; account: Account; workspace: Workspace; verifyToken: string }
  | { kind: "exists-with-password" }
  | { kind: "claim-email-sent"; claimToken: string; accountId: string };

export type SigninResult = { kind: "ok"; account: Account; workspace: Workspace } | { kind: "invalid" };

export type ResetResult = { kind: "ok"; account: Account; workspace: Workspace } | { kind: "invalid" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function badPassword(password: string): string | undefined {
  if (password.length < MIN_PASSWORD_LENGTH)
    return `Passwords are at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > MAX_PASSWORD_LENGTH) return "That password is too long.";
  return undefined;
}

export async function ensureOwnedWorkspace(
  store: AccountFlowStore,
  accountId: string,
): Promise<Workspace> {
  const existing = await store.getWorkspaceByOwner(accountId);
  if (existing) return existing;
  const workspace: Workspace = {
    id: newWorkspaceId(),
    ownerAccountId: accountId,
    name: "My workspace",
    createdAt: new Date().toISOString(),
  };
  await store.createWorkspace(workspace);
  return (await store.getWorkspaceByOwner(accountId)) ?? workspace;
}

export async function signup(store: AccountFlowStore, input: { email: string; name: string; password: string }) {
  const email = input.email.trim();
  const name = input.name.trim();
  if (!EMAIL_RE.test(email)) return { kind: "invalid" as const, message: "Enter a valid email address." };
  if (!name) return { kind: "invalid" as const, message: "Enter your name." };
  const weak = badPassword(input.password);
  if (weak) return { kind: "invalid" as const, message: weak };

  const existing = await store.getAccountByEmail(email);
  if (existing?.passwordHash) return { kind: "exists-with-password" as const };
  if (existing) {
    // Passwordless account (rep runtime identity, legacy bridge, or a
    // Salesforce-created account). Setting a password directly would hand this
    // account — and its user_connections — to whoever typed the email, so the
    // flow goes verification-first: prove the inbox, then set the password via
    // the reset lane (spec §3). performPasswordReset finishes the claim.
    const claimToken = await issueToken(store, PASSWORD_RESET_NS, { accountId: existing.id }, CLAIM_TTL_MS);
    return { kind: "claim-email-sent" as const, claimToken, accountId: existing.id };
  }

  const account: Account = {
    id: normalizeUserId(email),
    email,
    name,
    passwordHash: await hashPassword(input.password),
    createdAt: new Date().toISOString(),
  };
  await store.upsertAccount(account);
  const workspace = await ensureOwnedWorkspace(store, account.id);
  const verifyToken = await issueToken(store, EMAIL_VERIFY_NS, { accountId: account.id }, VERIFY_TTL_MS);
  return { kind: "created" as const, account, workspace, verifyToken };
}

export async function signin(store: AccountFlowStore, input: { email: string; password: string }) {
  const account = await store.getAccountByEmail(input.email.trim());
  if (!account?.passwordHash) {
    await burnTimingForMissingAccount(input.password);
    return { kind: "invalid" as const };
  }
  if (!(await verifyPassword(account.passwordHash, input.password))) return { kind: "invalid" as const };
  const workspace = await ensureOwnedWorkspace(store, account.id);
  return { kind: "ok" as const, account, workspace };
}

export async function requestPasswordReset(store: AccountFlowStore, email: string) {
  const account = await store.getAccountByEmail(email.trim());
  if (!account) return undefined;
  const resetToken = await issueToken(store, PASSWORD_RESET_NS, { accountId: account.id }, RESET_TTL_MS);
  return { resetToken, accountId: account.id };
}

export async function performPasswordReset(store: AccountFlowStore, rawToken: string, newPassword: string) {
  const weak = badPassword(newPassword);
  if (weak) return { kind: "weak" as const, message: weak };
  const payload = await consumeToken(store, PASSWORD_RESET_NS, rawToken);
  const accountId = typeof payload?.accountId === "string" ? payload.accountId : undefined;
  const account = accountId ? await store.getAccount(accountId) : undefined;
  if (!account) return { kind: "invalid" as const };
  const now = new Date().toISOString();
  const updated: Account = {
    ...account,
    passwordHash: await hashPassword(newPassword),
    passwordChangedAt: now,
    // Clicking a link mailed to this address proves the inbox (spec §3).
    emailVerifiedAt: account.emailVerifiedAt ?? now,
  };
  await store.upsertAccount(updated);
  // Completes the passwordless claim too: a rep identity never had a
  // workspace of its own (spec §3).
  const workspace = await ensureOwnedWorkspace(store, updated.id);
  return { kind: "ok" as const, account: updated, workspace };
}

export async function verifyEmail(store: AccountFlowStore, rawToken: string) {
  const payload = await consumeToken(store, EMAIL_VERIFY_NS, rawToken);
  const accountId = typeof payload?.accountId === "string" ? payload.accountId : undefined;
  const account = accountId ? await store.getAccount(accountId) : undefined;
  if (!account) return { ok: false };
  await store.upsertAccount({ ...account, emailVerifiedAt: account.emailVerifiedAt ?? new Date().toISOString() });
  return { ok: true };
}
