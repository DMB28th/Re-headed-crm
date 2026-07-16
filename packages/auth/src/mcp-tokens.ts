/**
 * MCP API tokens — per-account, per-user credentials for chat hosts.
 *
 * Chat hosts (Claude, ChatGPT, Copilot) cannot use Studio session cookies.
 * Admins mint a token in Studio → My team; the host sends
 * `Authorization: Bearer cs_live_…` on every /mcp request. The MCP server
 * hashes the bearer, looks up the row, and resolves tenantId + RunningUser
 * (including CRM user variables when linked via SSO).
 *
 * Migration notes:
 * - 2026-07-16: initial table. CREATE TABLE IF NOT EXISTS — safe on live DBs.
 * - 2026-07-16: crm_user_id / crm_owner_id / crm stamped at mint from
 *   user_crm_links so "my deals" resolves without a join on every request.
 */
import { createHash, randomBytes } from "node:crypto";
import type {
  CrmKind,
  MemberRole,
  McpTokenRecord,
  ResolvedMcpAuth,
  RunningUser,
} from "./types.js";

export interface SqlSession {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS mcp_tokens (
  id           text PRIMARY KEY,
  tenant_id    text NOT NULL,
  user_id      text NOT NULL,
  label        text NOT NULL,
  token_hash   text NOT NULL UNIQUE,
  token_prefix text NOT NULL,
  role         text NOT NULL CHECK (role IN ('owner','admin','member')),
  user_email   text,
  user_name    text NOT NULL,
  crm_user_id  text,
  crm_owner_id text,
  crm          text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
CREATE INDEX IF NOT EXISTS mcp_tokens_tenant_idx ON mcp_tokens (tenant_id);
CREATE INDEX IF NOT EXISTS mcp_tokens_hash_idx ON mcp_tokens (token_hash);
ALTER TABLE mcp_tokens ADD COLUMN IF NOT EXISTS crm_user_id text;
ALTER TABLE mcp_tokens ADD COLUMN IF NOT EXISTS crm_owner_id text;
ALTER TABLE mcp_tokens ADD COLUMN IF NOT EXISTS crm text;
`;

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function rowToRecord(row: Record<string, unknown>): McpTokenRecord {
  const record: McpTokenRecord = {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    userId: String(row.user_id),
    label: String(row.label),
    tokenHash: String(row.token_hash),
    tokenPrefix: String(row.token_prefix),
    role: row.role as MemberRole,
    createdAt: new Date(String(row.created_at)).toISOString(),
    lastUsedAt: row.last_used_at ? new Date(String(row.last_used_at)).toISOString() : null,
    revokedAt: row.revoked_at ? new Date(String(row.revoked_at)).toISOString() : null,
  };
  if (row.crm_user_id) record.crmUserId = String(row.crm_user_id);
  if (row.crm_owner_id) record.crmOwnerId = String(row.crm_owner_id);
  if (row.crm === "hubspot" || row.crm === "salesforce") record.crm = row.crm;
  return record;
}

export class McpTokenStore {
  private ready: Promise<void>;

  constructor(private readonly sql: SqlSession) {
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    for (const statement of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
      await this.sql.query(statement);
    }
  }

  /**
   * Mint a new token. Returns the raw secret ONCE — only the hash is stored.
   * Format: `cs_live_<32 hex bytes>`.
   */
  async create(input: {
    tenantId: string;
    userId: string;
    label: string;
    role: MemberRole;
    userEmail?: string;
    userName: string;
    crmUserId?: string;
    crmOwnerId?: string;
    crm?: CrmKind;
  }): Promise<{ record: McpTokenRecord; rawToken: string }> {
    await this.ready;
    const id = newId("tok");
    const rawToken = `cs_live_${randomBytes(24).toString("hex")}`;
    const tokenHash = hashToken(rawToken);
    const tokenPrefix = `${rawToken.slice(0, 12)}…`;
    await this.sql.query(
      `INSERT INTO mcp_tokens
         (id, tenant_id, user_id, label, token_hash, token_prefix, role, user_email, user_name,
          crm_user_id, crm_owner_id, crm)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        id,
        input.tenantId,
        input.userId,
        input.label,
        tokenHash,
        tokenPrefix,
        input.role,
        input.userEmail ?? null,
        input.userName,
        input.crmUserId ?? null,
        input.crmOwnerId ?? null,
        input.crm ?? null,
      ],
    );
    const { rows } = await this.sql.query(`SELECT * FROM mcp_tokens WHERE id = $1`, [id]);
    return { record: rowToRecord(rows[0]!), rawToken };
  }

  async list(tenantId: string): Promise<McpTokenRecord[]> {
    await this.ready;
    const { rows } = await this.sql.query(
      `SELECT * FROM mcp_tokens
       WHERE tenant_id = $1 AND revoked_at IS NULL
       ORDER BY created_at DESC`,
      [tenantId],
    );
    return rows.map(rowToRecord);
  }

  async revoke(tenantId: string, tokenId: string): Promise<boolean> {
    await this.ready;
    const { rows } = await this.sql.query(
      `UPDATE mcp_tokens SET revoked_at = now()
       WHERE id = $1 AND tenant_id = $2 AND revoked_at IS NULL
       RETURNING id`,
      [tokenId, tenantId],
    );
    return rows.length > 0;
  }

  /** Resolve a raw bearer token → tenant + RunningUser. */
  async resolve(rawToken: string): Promise<ResolvedMcpAuth | null> {
    await this.ready;
    if (!rawToken.startsWith("cs_live_")) return null;
    const tokenHash = hashToken(rawToken);
    const { rows } = await this.sql.query(
      `SELECT * FROM mcp_tokens WHERE token_hash = $1 AND revoked_at IS NULL LIMIT 1`,
      [tokenHash],
    );
    const row = rows[0];
    if (!row) return null;
    await this.sql.query(`UPDATE mcp_tokens SET last_used_at = now() WHERE id = $1`, [row.id]);
    const user: RunningUser = {
      userId: String(row.user_id),
      displayName: String(row.user_name),
      role: row.role as MemberRole,
      authMethod: "mcp_token",
    };
    if (row.user_email) user.email = String(row.user_email);
    if (row.crm_user_id) user.crmUserId = String(row.crm_user_id);
    if (row.crm_owner_id) user.crmOwnerId = String(row.crm_owner_id);
    if (row.crm === "hubspot" || row.crm === "salesforce") user.crm = row.crm;
    return { tenantId: String(row.tenant_id), user, tokenId: String(row.id) };
  }
}

/** Demo / shared-secret principal when multi-tenant auth is off. */
export function demoRunningUser(method: "shared_secret" | "demo" = "demo"): RunningUser {
  return {
    userId: "system",
    displayName: method === "shared_secret" ? "Shared-secret client" : "Demo rep",
    role: "system",
    authMethod: method,
    // Mock portal owner label — "my deals" filters to Demo rep's records.
    crmUserId: "Demo rep",
    crmOwnerId: "Demo rep",
  };
}

export async function createMcpTokenStore(databaseUrl: string): Promise<McpTokenStore> {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  return new McpTokenStore(client);
}
