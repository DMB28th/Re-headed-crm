/**
 * Cardstack's own accounts — who you are IN CARDSTACK, as distinct from the CRM
 * credentials a workspace holds. Until this existed, identity was self-asserted
 * (`x-cardstack-user-id` / `x-cardstack-tenant-id` headers, unverified) and the
 * workspace was a process-wide env var, so one deployment served exactly one
 * customer and anyone could claim to be anyone.
 *
 * The model, per the decisions in docs/salesforce-oauth-support.md:
 *
 * - **Salesforce is the identity provider.** You sign in with Salesforce; there
 *   are no Cardstack passwords to store, leak, or reset (PLAN.md non-goal:
 *   "no password flows").
 * - **A workspace IS a Salesforce org.** `Workspace.salesforceOrgId` is unique,
 *   so the first person from an org creates the workspace and becomes its admin
 *   and everyone else from that org auto-joins as a member. This falls straight
 *   out of the design's "one CRM per workspace" rule — there is no separate
 *   invite system to build or secure for v1.
 * - **`Account.id` is the pre-existing normalized user id** (email → username →
 *   SF user id, via `normalizeUserId`). Keeping that derivation means the
 *   `user_connections` rows written before accounts existed keep resolving.
 *
 * Sessions deliberately do NOT live here: they ride the store's existing
 * namespaced KV (TTL'd, sealed at rest, shared across instances), so signing
 * out and expiry are already solved and no session table is needed.
 *
 * Migration note (2026-07-27): additive. Three new tables (`workspaces`,
 * `accounts`, `memberships`); every pre-existing table stays keyed by the same
 * opaque `tenant_id`, so existing rows are untouched and a database that has
 * never seen a sign-in behaves exactly as before.
 */

/** A Cardstack workspace, one per Salesforce org. `id` is the `tenantId` every
 *  other table is keyed by. */
export interface Workspace {
  /** The `tenantId` used across layouts, connections, audit — `sf_<15-char org id>`. */
  id: string;
  /** 18-char Salesforce org id. Unique: it is what makes auto-join work. */
  salesforceOrgId: string;
  /** Org display name, for the workspace switcher. */
  name: string;
  createdAt: string;
}

/** A person, across every workspace they belong to. */
export interface Account {
  /** `normalizeUserId(email ?? username ?? sfUserId)` — matches `user_connections.user_id`. */
  id: string;
  /** 18-char Salesforce user id. Unique. */
  salesforceUserId: string;
  name: string;
  email?: string;
  createdAt: string;
}

/**
 * `admin` designs and publishes cards and manages the connection; `member` uses
 * them in chat. The org's first signer-in is admin — someone has to be, and an
 * empty workspace with no admin cannot be configured at all.
 */
export type MembershipRole = "admin" | "member";

export interface Membership {
  accountId: string;
  workspaceId: string;
  role: MembershipRole;
  createdAt: string;
}

/** What a verified sign-in resolves to; the shape a session cookie stands for. */
export interface SignedInIdentity {
  account: Account;
  workspace: Workspace;
  role: MembershipRole;
}

export const membershipKey = (accountId: string, workspaceId: string): string =>
  `${accountId}::${workspaceId}`;

/**
 * Workspace id from a Salesforce org id. Salesforce's 18-char id is the 15-char
 * id plus a case-insensitivity checksum, so we key on the 15-char prefix and
 * lowercase it — the same org reached via different APIs (which disagree about
 * returning 15 vs 18) must never produce two workspaces.
 */
export const workspaceIdForOrg = (salesforceOrgId: string): string =>
  `sf_${salesforceOrgId.slice(0, 15).toLowerCase()}`;

/** Identity reads/writes. Folded into AdminConfigStore so every backend implements it. */
export interface IdentityStore {
  getWorkspace(id: string): Promise<Workspace | undefined>;
  /** Find-or-create keys on this — the whole auto-join model depends on it. */
  getWorkspaceByOrgId(salesforceOrgId: string): Promise<Workspace | undefined>;
  createWorkspace(workspace: Workspace): Promise<void>;
  /**
   * Every workspace on this deployment. Operational only — nothing
   * request-scoped may call this, because a request belongs to exactly one
   * workspace and enumerating the rest is the tenancy leak the model exists to
   * prevent. Backs the zero-admin backfill (see
   * apps/studio/scripts/backfill-workspace-admins.ts).
   */
  listWorkspaces(): Promise<Workspace[]>;

  getAccount(id: string): Promise<Account | undefined>;
  getAccountBySalesforceUserId(salesforceUserId: string): Promise<Account | undefined>;
  /** Insert, or refresh a returning signer's name/email from Salesforce. */
  upsertAccount(account: Account): Promise<void>;

  getMembership(accountId: string, workspaceId: string): Promise<Membership | undefined>;
  /** Every workspace an account can reach — backs the workspace switcher. */
  listMembershipsForAccount(accountId: string): Promise<Membership[]>;
  /** Every member of a workspace — backs the admin's people list. */
  listMembershipsForWorkspace(workspaceId: string): Promise<Membership[]>;
  setMembership(membership: Membership): Promise<void>;
}

/**
 * What a sign-in actually needs: everything except the operational enumeration.
 *
 * Typed as an exclusion rather than as `IdentityStore` so a request-path caller
 * physically cannot reach `listWorkspaces` through it. The comment on that
 * method says never call it from a request path; this is what makes the
 * compiler agree.
 */
export type SignInStore = Omit<IdentityStore, "listWorkspaces">;
