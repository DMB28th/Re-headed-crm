/**
 * Cardstack's own accounts — who you are IN CARDSTACK, as distinct from the CRM
 * credentials a workspace holds. Until this existed, identity was self-asserted
 * (`x-cardstack-user-id` / `x-cardstack-tenant-id` headers, unverified) and the
 * workspace was a process-wide env var, so one deployment served exactly one
 * customer and anyone could claim to be anyone.
 *
 * Accounts are email-first now, not Salesforce-first: a workspace is created
 * and owned by one account, and connecting a Salesforce org to it is an
 * exclusive claim made later, not the act that creates the workspace. Full
 * model and rationale: docs/superpowers/specs/2026-08-10-self-serve-accounts-design.md.
 *
 * Sessions deliberately do NOT live here: they ride the store's existing
 * namespaced KV (TTL'd, sealed at rest, shared across instances), so signing
 * out and expiry are already solved and no session table is needed.
 *
 * Migration note (2026-07-27): additive. Three new tables (`workspaces`,
 * `accounts`, `memberships`); every pre-existing table stays keyed by the same
 * opaque `tenant_id`, so existing rows are untouched and a database that has
 * never seen a sign-in behaves exactly as before.
 *
 * Migration note (2026-08-10): `Workspace.salesforceOrgId` and
 * `Account.salesforceUserId` become optional, and `Workspace` gains
 * `ownerAccountId` — see docs/superpowers/specs/2026-08-10-self-serve-accounts-design.md
 * for the exclusive-org-claim model this enables.
 */

import { randomBytes } from "node:crypto";

/** A Cardstack workspace. `id` is the `tenantId` every other table is keyed by. */
export interface Workspace {
  /** The `tenantId` used across layouts, connections, audit. New ids are
   *  `ws_<random>`; legacy `sf_<orgid>` and `t_demo` ids remain valid forever —
   *  nothing parses a tenant id. */
  id: string;
  /** The claimed Salesforce org. ABSENT until the owner connects one; the
   *  claim is exclusive (spec §1) — uniqueness on the 15-char key is what
   *  enforces one-org-one-owner. */
  salesforceOrgId?: string;
  /** The account that owns this workspace. Absent only on legacy rows the
   *  attach-workspace script has not stamped yet. */
  ownerAccountId?: string;
  /** Display name: "My workspace" until an org claim renames it. */
  name: string;
  createdAt: string;
}

/** A person. Root identity — created by email signup, by Salesforce signup,
 *  or as a rep runtime identity on the MCP lane. */
export interface Account {
  /** `normalizeUserId(email ?? username ?? sfUserId)` — matches `user_connections.user_id`. */
  id: string;
  /** Recorded when this account connects an org or signs in with Salesforce.
   *  Absent on email-only accounts. Unique when present. */
  salesforceUserId?: string;
  name: string;
  email?: string;
  /** argon2id hash. Absent on rep runtime identities and Salesforce-created
   *  accounts that never set one. NEVER serialized to clients. */
  passwordHash?: string;
  emailVerifiedAt?: string;
  /** Sessions created before this instant are dead (reset invalidation). */
  passwordChangedAt?: string;
  createdAt: string;
}

/**
 * A `Membership` is the chat-lane access list, nothing more: it says an
 * account can reach a workspace from chat, not that it can configure one.
 * Studio authority comes from `Workspace.ownerAccountId` — the account that
 * claimed the workspace — checked at Studio's single choke point
 * (`resolveStudioSession`), not from this role. `admin` is a legacy value:
 * rows written before the self-serve-accounts model may still carry it, and
 * reading it stays harmless, but nothing grants it anymore — `resolveSignIn`
 * always writes `"member"` for a new membership.
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

/** Salesforce returns 15- or 18-char ids for one entity; key on the lowercased 15. */
export const salesforceIdKey = (salesforceId: string): string =>
  salesforceId.slice(0, 15).toLowerCase();

/**
 * Workspace id from a Salesforce org id. Salesforce's 18-char id is the 15-char
 * id plus a case-insensitivity checksum, so we key on the 15-char prefix and
 * lowercase it — the same org reached via different APIs (which disagree about
 * returning 15 vs 18) must never produce two workspaces. Legacy path only: new
 * workspaces get `newWorkspaceId()` and claim an org afterward; the MCP legacy
 * bridge still routes pre-accounts tenants through this.
 */
export const workspaceIdForOrg = (salesforceOrgId: string): string =>
  `sf_${salesforceIdKey(salesforceOrgId)}`;

/** Id for a signup-created workspace. Opaque; the prefix is cosmetic. */
export const newWorkspaceId = (): string => `ws_${randomBytes(12).toString("base64url")}`;

/** Result of an exclusive org claim — `claimOrg` never throws on conflict. */
export type OrgClaimResult =
  | { ok: true; workspace: Workspace }
  | { ok: false; reason: "org-already-claimed" };

/** Identity reads/writes. Folded into AdminConfigStore so every backend implements it. */
export interface IdentityStore {
  getWorkspace(id: string): Promise<Workspace | undefined>;
  /** Routes a chat-lane rep by their Salesforce-verified org id to the
   *  workspace that claimed it (`resolveSignIn`'s find-or-refuse). */
  getWorkspaceByOrgId(salesforceOrgId: string): Promise<Workspace | undefined>;
  /** The workspace this account owns, if any — backs "you already have a workspace". */
  getWorkspaceByOwner(ownerAccountId: string): Promise<Workspace | undefined>;
  createWorkspace(workspace: Workspace): Promise<void>;
  /**
   * Every workspace on this deployment. Operational only — nothing
   * request-scoped may call this, because a request belongs to exactly one
   * workspace and enumerating the rest is the tenancy leak the model exists to
   * prevent. The zero-admin backfill it used to back
   * (`backfill-workspace-admins.ts`) was deleted with the rest of the
   * multi-admin governance layer (self-serve-accounts design §1); this stays
   * as the operational escape hatch a future migration script would need.
   */
  listWorkspaces(): Promise<Workspace[]>;
  /** Exclusively claim an org for a workspace; conflicts if another workspace
   *  already holds it. Idempotent for the current holder. */
  claimOrg(workspaceId: string, salesforceOrgId: string, orgName?: string): Promise<OrgClaimResult>;
  /** Undo a claim so the org routes to no workspace and can be claimed again. */
  releaseOrg(workspaceId: string): Promise<void>;
  /**
   * Stamp a workspace's owner. Operational — the attach-workspace script's
   * path for legacy rows with no `ownerAccountId`; never request-scoped.
   */
  setWorkspaceOwner(workspaceId: string, ownerAccountId: string): Promise<void>;

  getAccount(id: string): Promise<Account | undefined>;
  getAccountBySalesforceUserId(salesforceUserId: string): Promise<Account | undefined>;
  /** Find an account by its email, case-insensitively — the email sign-in path. */
  getAccountByEmail(email: string): Promise<Account | undefined>;
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
