/**
 * Cardstack user ↔ CRM identity + per-rep OAuth token store.
 *
 * Migration notes:
 * - 2026-07-16: user_crm_links (SSO → crm user id) + user_crm_tokens scaffold
 *   for per-rep three-legged OAuth. CREATE IF NOT EXISTS — safe on live DBs.
 *   Token plaintext is intentional for the scaffold; AES-GCM/KMS is the next step.
 */
import { randomBytes } from "node:crypto";
import type { CrmKind, UserCrmLink, UserCrmToken } from "./types.js";
import type { SqlSession } from "./mcp-tokens.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS user_crm_links (
  id            text PRIMARY KEY,
  tenant_id     text NOT NULL,
  user_id       text NOT NULL,
  crm           text NOT NULL CHECK (crm IN ('hubspot','salesforce')),
  crm_user_id   text NOT NULL,
  crm_owner_id  text,
  crm_email     text,
  source        text NOT NULL DEFAULT 'sso',
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, crm)
);
CREATE UNIQUE INDEX IF NOT EXISTS user_crm_links_crm_user_uq
  ON user_crm_links (tenant_id, crm, crm_user_id);
CREATE INDEX IF NOT EXISTS user_crm_links_user_idx ON user_crm_links (user_id);

CREATE TABLE IF NOT EXISTS user_crm_tokens (
  id                text PRIMARY KEY,
  tenant_id         text NOT NULL,
  user_id           text NOT NULL,
  crm              text NOT NULL CHECK (crm IN ('hubspot','salesforce')),
  access_token      text,
  refresh_token     text,
  expires_at        timestamptz,
  scopes            text,
  instance_url      text,
  portal_id         text,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, crm)
);
`;

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function linkRow(row: Record<string, unknown>): UserCrmLink {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    userId: String(row.user_id),
    crm: row.crm as CrmKind,
    crmUserId: String(row.crm_user_id),
    crmOwnerId: row.crm_owner_id ? String(row.crm_owner_id) : null,
    crmEmail: row.crm_email ? String(row.crm_email) : null,
    source: (row.source as UserCrmLink["source"]) ?? "sso",
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function tokenRow(row: Record<string, unknown>): UserCrmToken {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    userId: String(row.user_id),
    crm: row.crm as CrmKind,
    accessToken: row.access_token ? String(row.access_token) : null,
    refreshToken: row.refresh_token ? String(row.refresh_token) : null,
    expiresAt: row.expires_at ? new Date(String(row.expires_at)).toISOString() : null,
    scopes: row.scopes ? String(row.scopes) : null,
    instanceUrl: row.instance_url ? String(row.instance_url) : null,
    portalId: row.portal_id ? String(row.portal_id) : null,
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export class UserCrmStore {
  private ready: Promise<void>;

  constructor(private readonly sql: SqlSession) {
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    for (const statement of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
      await this.sql.query(statement);
    }
  }

  async upsertLink(input: {
    tenantId: string;
    userId: string;
    crm: CrmKind;
    crmUserId: string;
    crmOwnerId?: string | null;
    crmEmail?: string | null;
    source?: UserCrmLink["source"];
  }): Promise<UserCrmLink> {
    await this.ready;
    const existing = await this.getLink(input.tenantId, input.userId, input.crm);
    if (existing) {
      await this.sql.query(
        `UPDATE user_crm_links SET
           crm_user_id = $1,
           crm_owner_id = COALESCE($2, crm_owner_id),
           crm_email = COALESCE($3, crm_email),
           source = $4,
           updated_at = now()
         WHERE id = $5`,
        [
          input.crmUserId,
          input.crmOwnerId ?? null,
          input.crmEmail ?? null,
          input.source ?? "sso",
          existing.id,
        ],
      );
      return (await this.getLink(input.tenantId, input.userId, input.crm))!;
    }
    const id = newId("crmlink");
    await this.sql.query(
      `INSERT INTO user_crm_links
         (id, tenant_id, user_id, crm, crm_user_id, crm_owner_id, crm_email, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        id,
        input.tenantId,
        input.userId,
        input.crm,
        input.crmUserId,
        input.crmOwnerId ?? null,
        input.crmEmail ?? null,
        input.source ?? "sso",
      ],
    );
    return (await this.getLink(input.tenantId, input.userId, input.crm))!;
  }

  async getLink(
    tenantId: string,
    userId: string,
    crm?: CrmKind,
  ): Promise<UserCrmLink | null> {
    await this.ready;
    if (crm) {
      const { rows } = await this.sql.query(
        `SELECT * FROM user_crm_links WHERE tenant_id=$1 AND user_id=$2 AND crm=$3 LIMIT 1`,
        [tenantId, userId, crm],
      );
      return rows[0] ? linkRow(rows[0]) : null;
    }
    const { rows } = await this.sql.query(
      `SELECT * FROM user_crm_links WHERE tenant_id=$1 AND user_id=$2 ORDER BY updated_at DESC LIMIT 1`,
      [tenantId, userId],
    );
    return rows[0] ? linkRow(rows[0]) : null;
  }

  async listLinksForUser(userId: string): Promise<UserCrmLink[]> {
    await this.ready;
    const { rows } = await this.sql.query(
      `SELECT * FROM user_crm_links WHERE user_id=$1 ORDER BY updated_at DESC`,
      [userId],
    );
    return rows.map(linkRow);
  }

  /** Bind any provisional (tenant-less) links is N/A — we always require tenantId. */

  async upsertToken(input: {
    tenantId: string;
    userId: string;
    crm: CrmKind;
    accessToken?: string | null;
    refreshToken?: string | null;
    expiresAt?: string | null;
    scopes?: string | null;
    instanceUrl?: string | null;
    portalId?: string | null;
  }): Promise<UserCrmToken> {
    await this.ready;
    const { rows: existing } = await this.sql.query(
      `SELECT id FROM user_crm_tokens WHERE tenant_id=$1 AND user_id=$2 AND crm=$3 LIMIT 1`,
      [input.tenantId, input.userId, input.crm],
    );
    if (existing[0]) {
      await this.sql.query(
        `UPDATE user_crm_tokens SET
           access_token = COALESCE($1, access_token),
           refresh_token = COALESCE($2, refresh_token),
           expires_at = COALESCE($3::timestamptz, expires_at),
           scopes = COALESCE($4, scopes),
           instance_url = COALESCE($5, instance_url),
           portal_id = COALESCE($6, portal_id),
           updated_at = now()
         WHERE id = $7`,
        [
          input.accessToken ?? null,
          input.refreshToken ?? null,
          input.expiresAt ?? null,
          input.scopes ?? null,
          input.instanceUrl ?? null,
          input.portalId ?? null,
          existing[0].id,
        ],
      );
    } else {
      await this.sql.query(
        `INSERT INTO user_crm_tokens
           (id, tenant_id, user_id, crm, access_token, refresh_token, expires_at, scopes, instance_url, portal_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz,$8,$9,$10)`,
        [
          newId("crmtok"),
          input.tenantId,
          input.userId,
          input.crm,
          input.accessToken ?? null,
          input.refreshToken ?? null,
          input.expiresAt ?? null,
          input.scopes ?? null,
          input.instanceUrl ?? null,
          input.portalId ?? null,
        ],
      );
    }
    return (await this.getToken(input.tenantId, input.userId, input.crm))!;
  }

  async getToken(
    tenantId: string,
    userId: string,
    crm: CrmKind,
  ): Promise<UserCrmToken | null> {
    await this.ready;
    const { rows } = await this.sql.query(
      `SELECT * FROM user_crm_tokens WHERE tenant_id=$1 AND user_id=$2 AND crm=$3 LIMIT 1`,
      [tenantId, userId, crm],
    );
    return rows[0] ? tokenRow(rows[0]) : null;
  }

  async deleteToken(tenantId: string, userId: string, crm: CrmKind): Promise<boolean> {
    await this.ready;
    const { rows } = await this.sql.query(
      `DELETE FROM user_crm_tokens WHERE tenant_id=$1 AND user_id=$2 AND crm=$3 RETURNING id`,
      [tenantId, userId, crm],
    );
    return rows.length > 0;
  }
}

export async function createUserCrmStore(databaseUrl: string): Promise<UserCrmStore> {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  return new UserCrmStore(client);
}
