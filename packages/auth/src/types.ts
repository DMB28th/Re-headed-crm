/**
 * Multi-tenant identity types (M7).
 *
 * Studio sessions are handled by better-auth (organizations = accounts).
 * The MCP server never sees Studio cookies — it resolves a bearer MCP token
 * (or the legacy shared secret) into a RunningUser + tenantId per request.
 *
 * CRM identity (user variables):
 *   RunningUser.crmUserId / crmOwnerId come from HubSpot/Salesforce SSO
 *   (user_crm_links) and are stamped onto MCP tokens at mint time so
 *   "my deals" / home-card "me" filter as that CRM person.
 */

/** Studio / org role. Matches better-auth organization defaults. */
export type MemberRole = "owner" | "admin" | "member";

export type CrmKind = "hubspot" | "salesforce";

/**
 * The authenticated principal on an MCP request — used for audit attribution,
 * "Written as …" provenance, and CRM user-variable resolution ($me).
 */
export interface RunningUser {
  /** Cardstack user id (better-auth user.id), or "system" for shared-secret demo. */
  userId: string;
  /** Display name / email for receipts and audit. */
  displayName: string;
  email?: string;
  role: MemberRole | "system";
  /** How this principal was authenticated. */
  authMethod: "mcp_token" | "shared_secret" | "demo";
  /**
   * CRM login / user id from HubSpot or Salesforce SSO (SF User Id, HubSpot user_id).
   * Used for Salesforce OwnerId filters and identity display.
   */
  crmUserId?: string;
  /**
   * HubSpot owner id (hubspot_owner_id). Often differs from crmUserId.
   * Prefer this for HubSpot owner filters when present.
   */
  crmOwnerId?: string;
  /** Which CRM the linked ids belong to. */
  crm?: CrmKind;
}

export interface AccountSummary {
  /** Same as better-auth organization.id — the config-store tenantId. */
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface TeamMember {
  userId: string;
  email: string;
  name: string;
  role: MemberRole;
  joinedAt: string;
}

export interface McpTokenRecord {
  id: string;
  tenantId: string;
  userId: string;
  /** Human label shown in Studio (e.g. "Claude.ai connector"). */
  label: string;
  /** sha256 of the raw token — raw value is shown once at creation. */
  tokenHash: string;
  /** Prefix for display (e.g. "cs_live_ab12…"). */
  tokenPrefix: string;
  role: MemberRole;
  crmUserId?: string;
  crmOwnerId?: string;
  crm?: CrmKind;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface ResolvedMcpAuth {
  tenantId: string;
  user: RunningUser;
  tokenId?: string;
}

/** Cardstack user ↔ CRM person binding (from SSO or later OAuth). */
export interface UserCrmLink {
  id: string;
  tenantId: string;
  userId: string;
  crm: CrmKind;
  crmUserId: string;
  crmOwnerId: string | null;
  crmEmail: string | null;
  source: "sso" | "manual" | "oauth";
  updatedAt: string;
}

/**
 * Per-rep CRM OAuth tokens (PLAN endgame). Scaffold — encryption lands with KMS.
 * When present, MCP should prefer these over the workspace integration connection.
 */
export interface UserCrmToken {
  id: string;
  tenantId: string;
  userId: string;
  crm: CrmKind;
  /** Plaintext scaffold; replace with ciphertext when KMS lands. */
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  scopes: string | null;
  instanceUrl: string | null;
  portalId: string | null;
  updatedAt: string;
}

/** Resolve the CRM id to use for owner / "me" filters. */
export function meFilterId(user: RunningUser): string | undefined {
  return user.crmOwnerId ?? user.crmUserId;
}

/** True when an owner argument means "the running user". */
export function isMeOwnerAsk(owner: string): boolean {
  const n = owner.trim().toLowerCase();
  return n === "me" || n === "my" || n === "myself" || n === "$me";
}
