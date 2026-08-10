/**
 * The one place a verified Salesforce identity becomes a Cardstack identity.
 * Both sign-in lanes call this — Studio's browser login and the MCP server's
 * OAuth callback — so a rep who first appears through a chat host and an admin
 * who first appears through Studio land in the same workspace with the same
 * account id, whichever happens first.
 *
 * Callers MUST have completed a real OAuth code exchange before calling this.
 * Everything here is trusted; nothing in this module verifies anything.
 */
import { normalizeUserId } from "@cardstack/core";
import {
  workspaceIdForOrg,
  type Account,
  type IdentityStore,
  type Membership,
  type SignedInIdentity,
  type Workspace,
} from "./identity.js";

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
 * Find-or-create the workspace, account, and membership for a verified signer.
 *
 * Concurrency: two people from a brand-new org can sign in at the same instant
 * and both find no workspace. `createWorkspace` is therefore required to be
 * idempotent on `salesforceOrgId` (ON CONFLICT DO NOTHING), and we re-read
 * after creating rather than trusting our own write — so the loser of the race
 * adopts the winner's workspace instead of erroring or forking a duplicate.
 */
export async function resolveSignIn(
  store: IdentityStore,
  identity: SalesforceIdentity,
  now: () => string = () => new Date().toISOString(),
): Promise<SignedInIdentity> {
  const workspace = await findOrCreateWorkspace(store, identity, now);
  const account = await upsertAccount(store, identity, now);
  const role = await ensureMembership(store, account.id, workspace.id, now);
  return { account, workspace, role };
}

async function findOrCreateWorkspace(
  store: IdentityStore,
  identity: SalesforceIdentity,
  now: () => string,
): Promise<Workspace> {
  const existing = await store.getWorkspaceByOrgId(identity.orgId);
  if (existing) return existing;

  const created: Workspace = {
    id: workspaceIdForOrg(identity.orgId),
    salesforceOrgId: identity.orgId,
    name: identity.orgName?.trim() || "My workspace",
    createdAt: now(),
  };
  await store.createWorkspace(created);
  // Re-read: if we lost a creation race, the stored row is the winner's.
  return (await store.getWorkspaceByOrgId(identity.orgId)) ?? created;
}

async function upsertAccount(
  store: IdentityStore,
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
  store: IdentityStore,
  accountId: string,
  workspaceId: string,
  now: () => string,
): Promise<Membership["role"]> {
  const existing = await store.getMembership(accountId, workspaceId);
  if (existing) return existing.role;

  // First person into an org's workspace administers it. Someone must be able
  // to configure it, and there is no one else to grant the role.
  const members = await store.listMembershipsForWorkspace(workspaceId);
  const role: Membership["role"] = members.length === 0 ? "admin" : "member";
  await store.setMembership({ accountId, workspaceId, role, createdAt: now() });
  return role;
}
