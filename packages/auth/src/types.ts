/**
 * Multi-tenant identity types (M7).
 *
 * Studio sessions are handled by better-auth (organizations = accounts).
 * The MCP server never sees Studio cookies — it resolves a bearer MCP token
 * (or the legacy shared secret) into a RunningUser + tenantId per request.
 */

/** Studio / org role. Matches better-auth organization defaults. */
export type MemberRole = "owner" | "admin" | "member";

/**
 * The authenticated principal on an MCP request — used for audit attribution,
 * "Written as …" provenance, and (later) audience/layout resolution.
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
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface ResolvedMcpAuth {
  tenantId: string;
  user: RunningUser;
  tokenId?: string;
}
