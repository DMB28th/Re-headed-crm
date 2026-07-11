/**
 * Postgres-backed AdminConfigStore — the deploy-grade store (Railway/Neon/RDS).
 * Same interface as the file store; the MCP server and Studio each hold their
 * own connection and see publishes at render time, no shared filesystem needed.
 *
 * Tables (created on first boot; PLAN.md's layout_configs shape):
 *   layout_configs(tenant_id, object, audience, status draft|published|history, revision, config jsonb)
 *   view_exposures(tenant_id, object, config jsonb)
 *   home_cards(tenant_id, audience, config jsonb)
 *   publish_events(tenant_id, object, audience, revision, kind, created_at)
 *   connections(tenant_id, config jsonb)
 *
 * Migration notes:
 * - 2026-07-11: added `connections` (CREATE TABLE IF NOT EXISTS — safe on live
 *   databases). A missing row means "connected mock" so databases initialized
 *   before this table behave unchanged. Custom lists ride inside the existing
 *   view_exposures jsonb (view-exposures schema v2) — no table change.
 */
import type { CustomList, HomeCardConfig, LayoutConfig, ViewExposure, ViewExposuresConfig } from "@cardstack/core";
import type { AdminConfigStore, ConnectionState, LayoutRecord, PublishEvent } from "./types.js";
import { defaultConnection, demoDealsLayout, demoHomeCard, demoViewExposures } from "./seed.js";

/**
 * Single logical SQL session (so BEGIN/COMMIT are safe). Satisfied by a pg
 * Client and by PGlite in tests. Do NOT pass a pg Pool directly — pool.query
 * may run each statement on a different connection.
 */
export interface SqlSession {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS layout_configs (
  tenant_id  text NOT NULL,
  object     text NOT NULL,
  audience   text NOT NULL DEFAULT 'default',
  status     text NOT NULL CHECK (status IN ('draft','published','history')),
  revision   int  NOT NULL DEFAULT 0,
  config     jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS layout_configs_draft_uq
  ON layout_configs (tenant_id, object, audience) WHERE status = 'draft';
CREATE UNIQUE INDEX IF NOT EXISTS layout_configs_published_uq
  ON layout_configs (tenant_id, object, audience) WHERE status = 'published';

CREATE TABLE IF NOT EXISTS view_exposures (
  tenant_id text NOT NULL,
  object    text NOT NULL,
  config    jsonb NOT NULL,
  PRIMARY KEY (tenant_id, object)
);

CREATE TABLE IF NOT EXISTS home_cards (
  tenant_id text NOT NULL,
  audience  text NOT NULL DEFAULT 'default',
  config    jsonb NOT NULL,
  PRIMARY KEY (tenant_id, audience)
);

CREATE TABLE IF NOT EXISTS publish_events (
  id         serial PRIMARY KEY,
  tenant_id  text NOT NULL,
  object     text NOT NULL,
  audience   text NOT NULL,
  revision   int  NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('publish','rollback')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS connections (
  tenant_id text PRIMARY KEY,
  config    jsonb NOT NULL
);
`;

export class PostgresConfigStore implements AdminConfigStore {
  private ready: Promise<void>;

  constructor(
    private readonly sql: SqlSession,
    options: { seedDemo?: boolean } = {},
  ) {
    this.ready = this.init(options.seedDemo ?? true);
  }

  private async init(seedDemo: boolean): Promise<void> {
    for (const statement of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
      await this.sql.query(statement);
    }
    if (!seedDemo) return;
    const { rows } = await this.sql.query(
      "SELECT 1 FROM layout_configs WHERE tenant_id = $1 LIMIT 1",
      [demoDealsLayout.tenantId],
    );
    if (rows.length > 0) return;
    await this.sql.query(
      "INSERT INTO layout_configs (tenant_id, object, audience, status, revision, config) VALUES ($1,$2,$3,'published',$4,$5)",
      [
        demoDealsLayout.tenantId,
        demoDealsLayout.object,
        demoDealsLayout.audience,
        demoDealsLayout.revision,
        JSON.stringify(demoDealsLayout),
      ],
    );
    await this.sql.query(
      "INSERT INTO view_exposures (tenant_id, object, config) VALUES ($1,$2,$3) ON CONFLICT (tenant_id, object) DO NOTHING",
      [demoViewExposures.tenantId, demoViewExposures.object, JSON.stringify(demoViewExposures)],
    );
    await this.sql.query(
      "INSERT INTO home_cards (tenant_id, audience, config) VALUES ($1,$2,$3) ON CONFLICT (tenant_id, audience) DO NOTHING",
      [demoHomeCard.tenantId, demoHomeCard.audience, JSON.stringify(demoHomeCard)],
    );
  }

  private parse<T>(value: unknown): T {
    return (typeof value === "string" ? JSON.parse(value) : value) as T;
  }

  private async selectLayout(
    tenantId: string,
    object: string,
    audience: string,
    status: string,
  ): Promise<LayoutConfig | null> {
    const { rows } = await this.sql.query(
      "SELECT config FROM layout_configs WHERE tenant_id=$1 AND object=$2 AND audience=$3 AND status=$4",
      [tenantId, object, audience, status],
    );
    return rows[0] ? this.parse<LayoutConfig>(rows[0].config) : null;
  }

  async getLayout(tenantId: string, object: string, audience = "default"): Promise<LayoutConfig | undefined> {
    await this.ready;
    return (
      (await this.selectLayout(tenantId, object, audience, "published")) ??
      (await this.selectLayout(tenantId, object, "default", "published")) ??
      undefined
    );
  }

  async listConfiguredObjects(tenantId: string): Promise<string[]> {
    await this.ready;
    const { rows } = await this.sql.query(
      "SELECT DISTINCT object FROM layout_configs WHERE tenant_id=$1 AND status='published'",
      [tenantId],
    );
    return rows.map((r) => String(r.object));
  }

  async getViewExposures(tenantId: string, object: string): Promise<ViewExposure[]> {
    const config = await this.getViewExposuresConfig(tenantId, object);
    return (config?.views ?? []).filter((v) => v.exposed);
  }

  async getCustomLists(tenantId: string, object: string): Promise<CustomList[]> {
    const config = await this.getViewExposuresConfig(tenantId, object);
    // ?? handles rows written before customLists existed (view-exposures v2).
    return config?.customLists ?? [];
  }

  async getConnection(tenantId: string): Promise<ConnectionState> {
    await this.ready;
    const { rows } = await this.sql.query(
      "SELECT config FROM connections WHERE tenant_id=$1",
      [tenantId],
    );
    // Missing row = connected mock: keeps databases initialized before the
    // connections table behaving unchanged (see header migration note).
    return rows[0] ? this.parse<ConnectionState>(rows[0].config) : defaultConnection(tenantId);
  }

  async setConnection(connection: ConnectionState): Promise<void> {
    await this.ready;
    await this.sql.query(
      `INSERT INTO connections (tenant_id, config) VALUES ($1,$2)
       ON CONFLICT (tenant_id) DO UPDATE SET config = EXCLUDED.config`,
      [connection.tenantId, JSON.stringify(connection)],
    );
  }

  async getLayoutRecord(tenantId: string, object: string, audience = "default"): Promise<LayoutRecord> {
    await this.ready;
    const { rows } = await this.sql.query(
      "SELECT status, config FROM layout_configs WHERE tenant_id=$1 AND object=$2 AND audience=$3 ORDER BY revision ASC",
      [tenantId, object, audience],
    );
    const record: LayoutRecord = { draft: null, published: null, history: [] };
    for (const row of rows) {
      const config = this.parse<LayoutConfig>(row.config);
      if (row.status === "draft") record.draft = config;
      else if (row.status === "published") record.published = config;
      else record.history.push(config);
    }
    return record;
  }

  async saveDraft(config: LayoutConfig): Promise<void> {
    await this.ready;
    await this.sql.query(
      `INSERT INTO layout_configs (tenant_id, object, audience, status, revision, config)
       VALUES ($1,$2,$3,'draft',$4,$5)
       ON CONFLICT (tenant_id, object, audience) WHERE status='draft'
       DO UPDATE SET config = EXCLUDED.config, revision = EXCLUDED.revision`,
      [config.tenantId, config.object, config.audience, config.revision, JSON.stringify(config)],
    );
  }

  async discardDraft(tenantId: string, object: string, audience = "default"): Promise<void> {
    await this.ready;
    await this.sql.query(
      "DELETE FROM layout_configs WHERE tenant_id=$1 AND object=$2 AND audience=$3 AND status='draft'",
      [tenantId, object, audience],
    );
  }

  async publish(tenantId: string, object: string, audience = "default"): Promise<LayoutConfig> {
    await this.ready;
    await this.sql.query("BEGIN");
    try {
      const draft = await this.selectLayout(tenantId, object, audience, "draft");
      if (!draft) throw new Error(`No draft to publish for ${object}.`);
      const current = await this.selectLayout(tenantId, object, audience, "published");
      const published: LayoutConfig = { ...draft, revision: (current?.revision ?? 0) + 1 };
      await this.sql.query(
        "UPDATE layout_configs SET status='history' WHERE tenant_id=$1 AND object=$2 AND audience=$3 AND status='published'",
        [tenantId, object, audience],
      );
      await this.sql.query(
        "DELETE FROM layout_configs WHERE tenant_id=$1 AND object=$2 AND audience=$3 AND status='draft'",
        [tenantId, object, audience],
      );
      await this.sql.query(
        "INSERT INTO layout_configs (tenant_id, object, audience, status, revision, config) VALUES ($1,$2,$3,'published',$4,$5)",
        [tenantId, object, audience, published.revision, JSON.stringify(published)],
      );
      await this.logEvent(tenantId, object, audience, published.revision, "publish");
      await this.sql.query("COMMIT");
      return published;
    } catch (error) {
      await this.sql.query("ROLLBACK");
      throw error;
    }
  }

  async rollback(tenantId: string, object: string, toRevision: number, audience = "default"): Promise<LayoutConfig> {
    await this.ready;
    await this.sql.query("BEGIN");
    try {
      const { rows } = await this.sql.query(
        "SELECT config FROM layout_configs WHERE tenant_id=$1 AND object=$2 AND audience=$3 AND status='history' AND revision=$4",
        [tenantId, object, audience, toRevision],
      );
      if (!rows[0]) throw new Error(`No revision v${toRevision} in history for ${object}.`);
      const target = this.parse<LayoutConfig>(rows[0].config);
      const current = await this.selectLayout(tenantId, object, audience, "published");
      // Rolling back is itself a publish: NEW revision, linear version chain.
      const published: LayoutConfig = { ...target, revision: (current?.revision ?? 0) + 1 };
      await this.sql.query(
        "UPDATE layout_configs SET status='history' WHERE tenant_id=$1 AND object=$2 AND audience=$3 AND status='published'",
        [tenantId, object, audience],
      );
      await this.sql.query(
        "INSERT INTO layout_configs (tenant_id, object, audience, status, revision, config) VALUES ($1,$2,$3,'published',$4,$5)",
        [tenantId, object, audience, published.revision, JSON.stringify(published)],
      );
      await this.logEvent(tenantId, object, audience, published.revision, "rollback");
      await this.sql.query("COMMIT");
      return published;
    } catch (error) {
      await this.sql.query("ROLLBACK");
      throw error;
    }
  }

  async getViewExposuresConfig(tenantId: string, object: string): Promise<ViewExposuresConfig | undefined> {
    await this.ready;
    const { rows } = await this.sql.query(
      "SELECT config FROM view_exposures WHERE tenant_id=$1 AND object=$2",
      [tenantId, object],
    );
    return rows[0] ? this.parse<ViewExposuresConfig>(rows[0].config) : undefined;
  }

  async setViewExposures(config: ViewExposuresConfig): Promise<void> {
    await this.ready;
    await this.sql.query(
      `INSERT INTO view_exposures (tenant_id, object, config) VALUES ($1,$2,$3)
       ON CONFLICT (tenant_id, object) DO UPDATE SET config = EXCLUDED.config`,
      [config.tenantId, config.object, JSON.stringify(config)],
    );
  }

  async getHomeCard(tenantId: string, audience = "default"): Promise<HomeCardConfig | undefined> {
    await this.ready;
    const { rows } = await this.sql.query(
      "SELECT config FROM home_cards WHERE tenant_id=$1 AND audience=$2",
      [tenantId, audience],
    );
    return rows[0] ? this.parse<HomeCardConfig>(rows[0].config) : undefined;
  }

  async setHomeCard(config: HomeCardConfig): Promise<void> {
    await this.ready;
    await this.sql.query(
      `INSERT INTO home_cards (tenant_id, audience, config) VALUES ($1,$2,$3)
       ON CONFLICT (tenant_id, audience) DO UPDATE SET config = EXCLUDED.config`,
      [config.tenantId, config.audience, JSON.stringify(config)],
    );
  }

  async publishHomeCard(config: HomeCardConfig): Promise<HomeCardConfig> {
    await this.ready;
    const current = await this.getHomeCard(config.tenantId, config.audience);
    const published: HomeCardConfig = { ...config, revision: (current?.revision ?? 0) + 1 };
    await this.setHomeCard(published);
    await this.logEvent(config.tenantId, "home card", config.audience, published.revision, "publish");
    return published;
  }

  async listPublishes(tenantId: string): Promise<PublishEvent[]> {
    await this.ready;
    const { rows } = await this.sql.query(
      "SELECT object, audience, revision, kind, created_at FROM publish_events WHERE tenant_id=$1 ORDER BY id DESC",
      [tenantId],
    );
    return rows.map((row) => ({
      tenantId,
      object: String(row.object),
      audience: String(row.audience),
      revision: Number(row.revision),
      kind: row.kind as PublishEvent["kind"],
      timestamp: new Date(row.created_at as string).toISOString(),
    }));
  }

  private async logEvent(
    tenantId: string,
    object: string,
    audience: string,
    revision: number,
    kind: PublishEvent["kind"],
  ): Promise<void> {
    await this.sql.query(
      "INSERT INTO publish_events (tenant_id, object, audience, revision, kind) VALUES ($1,$2,$3,$4,$5)",
      [tenantId, object, audience, revision, kind],
    );
  }
}

/** Production factory: one pg Client per process (single session → safe transactions). */
export async function createPostgresConfigStore(databaseUrl: string): Promise<PostgresConfigStore> {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  return new PostgresConfigStore({
    query: (text, params) => client.query(text, params as never[]),
  });
}
