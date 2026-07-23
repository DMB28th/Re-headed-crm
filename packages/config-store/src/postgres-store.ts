/**
 * Postgres-backed AdminConfigStore — the deploy-grade store (Railway/Neon/RDS).
 * Same interface as the file store; the MCP server and Studio each hold their
 * own connection and see publishes at render time, no shared filesystem needed.
 *
 * Tables (created on first boot; PLAN.md's layout_configs shape):
 *   layout_configs(tenant_id, object, audience, status draft|published|history, revision, config jsonb)
 *   view_exposures(tenant_id, object, config jsonb)
 *   home_cards(tenant_id, audience, config jsonb)
 *   flow_render_modes(tenant_id, flow_api, config jsonb)
 *   custom_screens(tenant_id, screen_id, status draft|published|history, revision, config jsonb)
 *   publish_events(tenant_id, object, audience, revision, kind, created_at)
 *   connections(tenant_id, config jsonb)
 *   user_connections(tenant_id, user_id, crm, config jsonb)
 *
 * Migration notes:
 * - 2026-07-11: added `connections` (CREATE TABLE IF NOT EXISTS — safe on live
 *   databases). A missing row means "connected mock" so databases initialized
 *   before this table behave unchanged. Custom lists ride inside the existing
 *   view_exposures jsonb (view-exposures schema v2) — no table change.
 * - 2026-07-20: added `flow_render_modes`, `custom_screens`, and
 *   `user_connections` for per-user Salesforce OAuth. Additive tables; missing
 *   rows mean defaults/empty.
 */
import {
  CustomScreenConfig as CustomScreenSchema,
  FlowRenderModeConfig as FlowRenderModeSchema,
  ViewExposuresConfig as ViewExposuresSchema,
  type CrmKind,
  type CustomScreenConfig,
  type CustomScreenRecord,
  type CustomList,
  type FlowRenderModeConfig,
  type HomeCardConfig,
  type LayoutConfig,
  type ViewExposure,
  type ViewExposuresConfig,
} from "@cardstack/core";
import type {
  AdminConfigStore,
  ConnectionState,
  LayoutRecord,
  PublishEvent,
  UserConnectionState,
} from "./types.js";
import { defaultConnection, demoDealsLayout, demoHomeCard, demoViewExposures } from "./seed.js";
import { openConnection, openKvValue, sealConnection, sealKvValue } from "./crypto.js";

/**
 * Single logical SQL session (so BEGIN/COMMIT are safe). Satisfied by a pg
 * Client and by PGlite in tests. Do NOT pass a pg Pool directly — pool.query
 * may run each statement on a different connection.
 */
export interface SqlSession {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  /**
   * Run `fn` inside a transaction on a single dedicated connection, so its
   * BEGIN/COMMIT can't interleave with concurrent queries. Optional — the
   * in-memory test mock omits it and callers fall back to a best-effort
   * BEGIN/COMMIT on the shared session.
   */
  transaction?<T>(fn: (tx: Pick<SqlSession, "query">) => Promise<T>): Promise<T>;
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

CREATE TABLE IF NOT EXISTS flow_render_modes (
  tenant_id text NOT NULL,
  flow_api  text NOT NULL,
  config    jsonb NOT NULL,
  PRIMARY KEY (tenant_id, flow_api)
);

CREATE TABLE IF NOT EXISTS custom_screens (
  tenant_id  text NOT NULL,
  screen_id  text NOT NULL,
  status     text NOT NULL CHECK (status IN ('draft','published','history')),
  revision   int  NOT NULL DEFAULT 0,
  config     jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS custom_screens_draft_uq
  ON custom_screens (tenant_id, screen_id) WHERE status = 'draft';
CREATE UNIQUE INDEX IF NOT EXISTS custom_screens_published_uq
  ON custom_screens (tenant_id, screen_id) WHERE status = 'published';

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

CREATE TABLE IF NOT EXISTS user_connections (
  tenant_id text NOT NULL,
  user_id   text NOT NULL,
  crm       text NOT NULL,
  config    jsonb NOT NULL,
  PRIMARY KEY (tenant_id, user_id, crm)
);

-- 2026-07-23: namespaced KV for MCP per-user OAuth (registered clients,
-- pending authorizations, codes, tokens). Values are sealed jsonb (they hold
-- bearer secrets) and expires_at drives lazy expiry on read. Additive table.
-- NOTE: init naively splits this SCHEMA on semicolons — keep them out of comments.
CREATE TABLE IF NOT EXISTS kv_entries (
  namespace  text NOT NULL,
  key        text NOT NULL,
  value      jsonb NOT NULL,
  expires_at timestamptz,
  PRIMARY KEY (namespace, key)
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
    return rows[0]
      ? openConnection(this.parse<ConnectionState>(rows[0].config))
      : defaultConnection(tenantId);
  }

  async setConnection(connection: ConnectionState): Promise<void> {
    await this.ready;
    await this.sql.query(
      `INSERT INTO connections (tenant_id, config) VALUES ($1,$2)
       ON CONFLICT (tenant_id) DO UPDATE SET config = EXCLUDED.config`,
      [connection.tenantId, JSON.stringify(sealConnection(connection))],
    );
  }

  async getUserConnection(
    tenantId: string,
    userId: string,
    crm: UserConnectionState["crm"],
  ): Promise<UserConnectionState | undefined> {
    await this.ready;
    const { rows } = await this.sql.query(
      "SELECT config FROM user_connections WHERE tenant_id=$1 AND user_id=$2 AND crm=$3",
      [tenantId, userId, crm],
    );
    return rows[0] ? openConnection(this.parse<UserConnectionState>(rows[0].config)) : undefined;
  }

  async setUserConnection(connection: UserConnectionState): Promise<void> {
    await this.ready;
    await this.sql.query(
      `INSERT INTO user_connections (tenant_id, user_id, crm, config) VALUES ($1,$2,$3,$4)
       ON CONFLICT (tenant_id, user_id, crm) DO UPDATE SET config = EXCLUDED.config`,
      [
        connection.tenantId,
        connection.userId,
        connection.crm,
        JSON.stringify(sealConnection(connection)),
      ],
    );
  }

  async deleteUserConnection(
    tenantId: string,
    userId: string,
    crm: UserConnectionState["crm"],
  ): Promise<void> {
    await this.ready;
    await this.sql.query(
      "DELETE FROM user_connections WHERE tenant_id=$1 AND user_id=$2 AND crm=$3",
      [tenantId, userId, crm],
    );
  }

  async listUserConnections(tenantId: string): Promise<UserConnectionState[]> {
    await this.ready;
    const { rows } = await this.sql.query(
      "SELECT config FROM user_connections WHERE tenant_id=$1",
      [tenantId],
    );
    return rows
      .map((r) => openConnection(this.parse<UserConnectionState>(r.config)))
      .sort((a, b) => b.changedAt.localeCompare(a.changedAt));
  }

  async kvGet(namespace: string, key: string): Promise<Record<string, unknown> | undefined> {
    await this.ready;
    const { rows } = await this.sql.query(
      "SELECT value, expires_at FROM kv_entries WHERE namespace=$1 AND key=$2",
      [namespace, key],
    );
    if (!rows[0]) return undefined;
    const expiresAt = rows[0].expires_at as Date | null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      await this.kvDelete(namespace, key);
      return undefined;
    }
    return openKvValue(this.parse<Record<string, unknown>>(rows[0].value));
  }

  async kvSet(
    namespace: string,
    key: string,
    value: Record<string, unknown>,
    expiresAt?: string,
  ): Promise<void> {
    await this.ready;
    await this.sql.query(
      `INSERT INTO kv_entries (namespace, key, value, expires_at) VALUES ($1,$2,$3,$4)
       ON CONFLICT (namespace, key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`,
      [namespace, key, JSON.stringify(sealKvValue(value)), expiresAt ?? null],
    );
  }

  async kvDelete(namespace: string, key: string): Promise<void> {
    await this.ready;
    await this.sql.query("DELETE FROM kv_entries WHERE namespace=$1 AND key=$2", [namespace, key]);
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

  async removeObject(tenantId: string, object: string): Promise<void> {
    await this.ready;
    await this.sql.query("BEGIN");
    try {
      // All audiences + statuses (draft/published), exposures, and publish log.
      await this.sql.query("DELETE FROM layout_configs WHERE tenant_id=$1 AND object=$2", [
        tenantId,
        object,
      ]);
      await this.sql.query("DELETE FROM view_exposures WHERE tenant_id=$1 AND object=$2", [
        tenantId,
        object,
      ]);
      await this.sql.query("DELETE FROM publish_events WHERE tenant_id=$1 AND object=$2", [
        tenantId,
        object,
      ]);
      await this.sql.query("COMMIT");
    } catch (error) {
      await this.sql.query("ROLLBACK");
      throw error;
    }
  }

  async tenantConfigCrm(tenantId: string): Promise<CrmKind | undefined> {
    await this.ready;
    const { rows } = await this.sql.query(
      "SELECT config->>'crm' AS crm FROM layout_configs WHERE tenant_id=$1 LIMIT 1",
      [tenantId],
    );
    const crm = rows[0]?.crm;
    return crm === "salesforce" || crm === "hubspot" ? crm : undefined;
  }

  async clearTenantConfig(tenantId: string): Promise<void> {
    await this.ready;
    const tables = [
      "layout_configs",
      "view_exposures",
      "home_cards",
      "flow_render_modes",
      "custom_screens",
      "publish_events",
    ];
    const run = async (sql: Pick<SqlSession, "query">): Promise<void> => {
      for (const table of tables) {
        await sql.query(`DELETE FROM ${table} WHERE tenant_id=$1`, [tenantId]);
      }
    };
    if (this.sql.transaction) return this.sql.transaction(run);
    await this.sql.query("BEGIN");
    try {
      await run(this.sql);
      await this.sql.query("COMMIT");
    } catch (error) {
      await this.sql.query("ROLLBACK");
      throw error;
    }
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
    // Normalize through the schema: rows written before customLists existed
    // (v2 note) otherwise reach clients without the field and crash them.
    return rows[0] ? ViewExposuresSchema.parse(this.parse(rows[0].config)) : undefined;
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

  async getFlowRenderModes(tenantId: string): Promise<FlowRenderModeConfig[]> {
    await this.ready;
    const { rows } = await this.sql.query(
      "SELECT config FROM flow_render_modes WHERE tenant_id=$1 ORDER BY flow_api ASC",
      [tenantId],
    );
    return rows.map((row) => FlowRenderModeSchema.parse(this.parse(row.config)));
  }

  async setFlowRenderMode(config: FlowRenderModeConfig): Promise<void> {
    await this.ready;
    const parsed = FlowRenderModeSchema.parse(config);
    await this.sql.query(
      `INSERT INTO flow_render_modes (tenant_id, flow_api, config) VALUES ($1,$2,$3)
       ON CONFLICT (tenant_id, flow_api) DO UPDATE SET config = EXCLUDED.config`,
      [parsed.tenantId, parsed.flowApiName, JSON.stringify(parsed)],
    );
  }

  async getCustomScreens(tenantId: string): Promise<CustomScreenConfig[]> {
    const records = await this.listCustomScreenRecords(tenantId);
    return records.flatMap((record) => (record.published ? [record.published] : []));
  }

  async listCustomScreenRecords(
    tenantId: string,
  ): Promise<(CustomScreenRecord & { id: string })[]> {
    await this.ready;
    const { rows } = await this.sql.query(
      "SELECT screen_id, status, config FROM custom_screens WHERE tenant_id=$1 ORDER BY screen_id ASC, revision ASC",
      [tenantId],
    );
    const records = new Map<string, CustomScreenRecord & { id: string }>();
    for (const row of rows) {
      const id = String(row.screen_id);
      const record = records.get(id) ?? { id, draft: null, published: null, history: [] };
      const screen = CustomScreenSchema.parse(this.parse(row.config));
      if (row.status === "draft") record.draft = screen;
      else if (row.status === "published") record.published = screen;
      else record.history.push(screen);
      records.set(id, record);
    }
    return [...records.values()].sort((a, b) => {
      const aLabel = a.draft?.label ?? a.published?.label ?? a.id;
      const bLabel = b.draft?.label ?? b.published?.label ?? b.id;
      return aLabel.localeCompare(bLabel);
    });
  }

  async getCustomScreenRecord(tenantId: string, id: string): Promise<CustomScreenRecord> {
    await this.ready;
    const { rows } = await this.sql.query(
      "SELECT status, config FROM custom_screens WHERE tenant_id=$1 AND screen_id=$2 ORDER BY revision ASC",
      [tenantId, id],
    );
    const record: CustomScreenRecord = { draft: null, published: null, history: [] };
    for (const row of rows) {
      const screen = CustomScreenSchema.parse(this.parse(row.config));
      if (row.status === "draft") record.draft = screen;
      else if (row.status === "published") record.published = screen;
      else record.history.push(screen);
    }
    return record;
  }

  async saveCustomScreenDraft(config: CustomScreenConfig): Promise<void> {
    await this.ready;
    const parsed = CustomScreenSchema.parse({
      ...config,
      status: "draft",
      updatedAt: config.updatedAt ?? new Date().toISOString(),
    });
    await this.sql.query(
      `INSERT INTO custom_screens (tenant_id, screen_id, status, revision, config)
       VALUES ($1,$2,'draft',$3,$4)
       ON CONFLICT (tenant_id, screen_id) WHERE status='draft'
       DO UPDATE SET config = EXCLUDED.config, revision = EXCLUDED.revision`,
      [parsed.tenantId, parsed.id, parsed.revision, JSON.stringify(parsed)],
    );
  }

  async publishCustomScreen(tenantId: string, id: string): Promise<CustomScreenConfig> {
    await this.ready;
    const current = (await this.getCustomScreenRecord(tenantId, id)).published;
    const run = async (sql: Pick<SqlSession, "query">): Promise<CustomScreenConfig> => {
      const { rows } = await sql.query(
        "SELECT config FROM custom_screens WHERE tenant_id=$1 AND screen_id=$2 AND status='draft'",
        [tenantId, id],
      );
      if (!rows[0]) throw new Error(`No draft to publish for custom screen ${id}.`);
      const draft = CustomScreenSchema.parse(this.parse(rows[0].config));
      const published = CustomScreenSchema.parse({
        ...draft,
        status: "published",
        revision: (current?.revision ?? 0) + 1,
        updatedAt: new Date().toISOString(),
      });
      await sql.query(
        "UPDATE custom_screens SET status='history' WHERE tenant_id=$1 AND screen_id=$2 AND status='published'",
        [tenantId, id],
      );
      await sql.query(
        "DELETE FROM custom_screens WHERE tenant_id=$1 AND screen_id=$2 AND status='draft'",
        [tenantId, id],
      );
      await sql.query(
        "INSERT INTO custom_screens (tenant_id, screen_id, status, revision, config) VALUES ($1,$2,'published',$3,$4)",
        [tenantId, id, published.revision, JSON.stringify(published)],
      );
      return published;
    };
    // Prefer a dedicated transaction-scoped connection so concurrent queries
    // can't be swept into this BEGIN/COMMIT. Fall back to the shared session
    // (in-memory mock / single-session) when no pooled transaction is available.
    if (this.sql.transaction) return this.sql.transaction(run);
    await this.sql.query("BEGIN");
    try {
      const published = await run(this.sql);
      await this.sql.query("COMMIT");
      return published;
    } catch (error) {
      await this.sql.query("ROLLBACK");
      throw error;
    }
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

/**
 * Production factory: a pooled connection. Single statements run on any pooled
 * connection; `transaction` pins one checked-out client so a BEGIN/COMMIT can't
 * interleave with concurrent queries (a real hazard the old single-Client setup
 * had for publishCustomScreen).
 */
export async function createPostgresConfigStore(databaseUrl: string): Promise<PostgresConfigStore> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl });
  const query: SqlSession["query"] = (text, params) => pool.query(text, params as never[]);
  const transaction = async <T>(fn: (tx: Pick<SqlSession, "query">) => Promise<T>): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn({ query: (t, p) => client.query(t, p as never[]) });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };
  return new PostgresConfigStore({ query, transaction });
}
