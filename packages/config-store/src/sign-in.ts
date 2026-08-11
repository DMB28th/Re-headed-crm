/**
 * The one place a verified Salesforce identity becomes a Cardstack identity —
 * for the MCP lane. Both lanes used to call this; now Studio's Salesforce
 * lane resolves accounts itself (Task 9, self-serve signup/connect), and this
 * resolver is the MCP server's OAuth callback path only: a rep or admin
 * signing into chat.
 *
 * A workspace exists only because an account owner claimed this org in
 * Studio (`claimOrg`, spec §1/§2). This resolver never creates a workspace
 * and never grants admin — chat-lane sign-in only ever populates membership,
 * always as `"member"`. A signer whose org nobody has claimed gets a typed
 * `UnclaimedOrgError`, not a silent empty workspace they'd be admin of.
 *
 * Callers MUST have completed a real OAuth code exchange before calling this.
 * Everything here is trusted; nothing in this module verifies anything.
 */
import { normalizeUserId } from "@cardstack/core";
import {
  type Account,
  type Membership,
  type SignInStore,
  type SignedInIdentity,
  type Workspace,
} from "./identity.js";

/** Thrown when no workspace has claimed the signer's Salesforce org. The MCP
 *  server (Task 13) catches this and renders guidance instead of a tool error. */
export class UnclaimedOrgError extends Error {
  readonly orgId: string;
  constructor(orgId: string, orgName?: string) {
    super(
      `No Cardstack workspace is connected to this Salesforce org${
        orgName ? ` (${orgName})` : ""
      } yet.`,
    );
    this.name = "UnclaimedOrgError";
    this.orgId = orgId;
  }
}

/** What a completed Salesforce OAuth exchange tells us about the signer. */
export interface SalesforceIdentity {
  /** 15- or 18-char org id, from the identity URL. */
  orgId: string;
  /** 18-char user id, from the identity URL. */
  salesforceUserId: string;
  name: string;
  email?: string;
  username?: string;
  /** Org display name; falls back to something readable when unavailable. */
  orgName?: string;
}

/**
 * Find-the-claimed-workspace-or-refuse, then resolve the account and
 * membership for a verified signer.
 */
export async function resolveSignIn(
  store: SignInStore,
  identity: SalesforceIdentity,
  now: () => string = () => new Date().toISOString(),
): Promise<SignedInIdentity> {
  const workspace = await findClaimedWorkspace(store, identity);
  const account = await upsertAccount(store, identity, now);
  const role = await ensureMembership(store, account.id, workspace.id, now);
  return { account, workspace, role };
}

/**
 * Find-or-REFUSE (spec §2). A workspace exists only because an account owner
 * claimed this org in Studio; a rep whose org is unclaimed gets a typed error
 * their chat host can render with guidance, never a silent empty workspace
 * they would be admin of.
 */
async function findClaimedWorkspace(
  store: SignInStore,
  identity: SalesforceIdentity,
): Promise<Workspace> {
  const existing = await store.getWorkspaceByOrgId(identity.orgId);
  if (!existing) throw new UnclaimedOrgError(identity.orgId, identity.orgName);
  return existing;
}

async function upsertAccount(
  store: SignInStore,
  identity: SalesforceIdentity,
  now: () => string,
): Promise<Account> {
  const existing = await store.getAccountBySalesforceUserId(identity.salesforceUserId);
  // Keep the ORIGINAL id on return visits. It keys their user_connections and
  // audit rows; rederiving it would orphan both if they changed their email.
  const id =
    existing?.id ??
    normalizeUserId(identity.email ?? identity.username ?? identity.salesforceUserId);
  const account: Account = {
    id,
    salesforceUserId: identity.salesforceUserId,
    name: identity.name,
    ...(identity.email ? { email: identity.email } : {}),
    createdAt: existing?.createdAt ?? now(),
  };
  await store.upsertAccount(account);
  return account;
}

async function ensureMembership(
  store: SignInStore,
  accountId: string,
  workspaceId: string,
  now: () => string,
): Promise<Membership["role"]> {
  // Keep returning the pre-existing role: legacy admin rows are harmless,
  // and nothing reads role for authority after Task 6 (Studio's choke point
  // checks ownership, not membership role).
  const existing = await store.getMembership(accountId, workspaceId);
  if (existing) return existing.role;

  // Chat-lane population: always a member. Studio authority is ownership,
  // checked at the Studio choke point — membership grants chat access only.
  const role: Membership["role"] = "member";
  await store.setMembership({ accountId, workspaceId, role, createdAt: now() });
  return role;
}
