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
 * - 2026-07-24: demo seeding of view_exposures/home_cards now runs on every
 *   boot (ON CONFLICT DO NOTHING) instead of only when layout_configs is
 *   empty — databases seeded before M4 were missing their home_cards row.
 * - 2026-08-10: staging model (docs/studio-staging-model.md). view_exposures,
 *   home_cards and flow_render_modes gain `status` (draft|published|history) +
 *   `revision`, matching layout_configs, so every governed surface can be
 *   staged and rolled back. Their single-row primary keys are replaced by
 *   partial unique indexes on (key…) WHERE status='draft' / 'published'.
 *   MIGRATION IS LAZY AND SAFE: `status` defaults to 'published', so every row
 *   written before this becomes the published revision — nothing a rep can see
 *   today disappears. home_cards backfills `revision` from the config's own
 *   revision so rollback lookups line up. publish_events gains `surface` and
 *   `batch_id` (both nullable — older events render as layout publishes, which
 *   is what they were).
 *   The demo seeding above keeps its every-boot placement from 2026-07-24; its
 *   INSERTs now name the partial-index predicate as the conflict target,
 *   because this migration drops the plain primary keys they used to infer.
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
  FlowRenderModeRecord,
  HomeCardRecord,
  LayoutRecord,
  PublishEvent,
  PublishResult,
  PublishSurface,
  StagedChange,
  StagedKey,
  StagedRecord,
  SurfaceHistory,
  UserConnectionState,
  ViewExposuresRecord,
} from "./types.js";
import { salesforceIdKey, type Account, type Membership, type OrgClaimResult, type Workspace } from "./identity.js";
import type { DiffLabels } from "./diff.js";
import {
  collectStagedChanges,
  collectSurfaceHistory,
  runStagedPublish,
  runStagedRollback,
} from "./staging.js";
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

-- 2026-07-27: Cardstack's own accounts. Until these existed, identity was a
-- self-asserted header and the workspace was an env var, so one deployment
-- served one customer. org_key/sf_user_key hold the LOWERCASED 15-char id
-- because Salesforce returns 15 or 18 chars for the same entity depending on
-- the API, and both must resolve to one row.
-- Additive: every other table stays keyed by the same opaque tenant_id.
--
-- 2026-08-10 (spec: docs/superpowers/specs/2026-08-10-self-serve-accounts-
-- design.md): a workspace is no longer created FROM a Salesforce org — it is
-- created by its owning account (email or Salesforce signup) and a
-- Salesforce org is claimed onto it later, exclusively, by setting org_key.
-- The UNIQUE constraint on org_key is that exclusivity's enforcement -- see
-- the nullable-columns migration below for how an org-less workspace fits it.
CREATE TABLE IF NOT EXISTS workspaces (
  id         text PRIMARY KEY,
  org_key    text NOT NULL UNIQUE,
  config     jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
  id          text PRIMARY KEY,
  sf_user_key text NOT NULL UNIQUE,
  config      jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  account_id   text NOT NULL,
  workspace_id text NOT NULL,
  role         text NOT NULL CHECK (role IN ('admin','member')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, workspace_id)
);
CREATE INDEX IF NOT EXISTS memberships_workspace_idx ON memberships (workspace_id);

-- Staging model migration (2026-08-10). Idempotent: safe on live databases and
-- a no-op on freshly created tables above.
ALTER TABLE view_exposures ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';
ALTER TABLE view_exposures ADD COLUMN IF NOT EXISTS revision int NOT NULL DEFAULT 1;
ALTER TABLE view_exposures DROP CONSTRAINT IF EXISTS view_exposures_pkey;
CREATE UNIQUE INDEX IF NOT EXISTS view_exposures_draft_uq
  ON view_exposures (tenant_id, object) WHERE status = 'draft';
CREATE UNIQUE INDEX IF NOT EXISTS view_exposures_published_uq
  ON view_exposures (tenant_id, object) WHERE status = 'published';

ALTER TABLE home_cards ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';
ALTER TABLE home_cards ADD COLUMN IF NOT EXISTS revision int NOT NULL DEFAULT 1;
ALTER TABLE home_cards DROP CONSTRAINT IF EXISTS home_cards_pkey;
CREATE UNIQUE INDEX IF NOT EXISTS home_cards_draft_uq
  ON home_cards (tenant_id, audience) WHERE status = 'draft';
CREATE UNIQUE INDEX IF NOT EXISTS home_cards_published_uq
  ON home_cards (tenant_id, audience) WHERE status = 'published';
UPDATE home_cards SET revision = COALESCE((config->>'revision')::int, 1)
  WHERE status = 'published' AND revision <> COALESCE((config->>'revision')::int, 1);

ALTER TABLE flow_render_modes ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';
ALTER TABLE flow_render_modes ADD COLUMN IF NOT EXISTS revision int NOT NULL DEFAULT 1;
ALTER TABLE flow_render_modes DROP CONSTRAINT IF EXISTS flow_render_modes_pkey;
CREATE UNIQUE INDEX IF NOT EXISTS flow_render_modes_draft_uq
  ON flow_render_modes (tenant_id, flow_api) WHERE status = 'draft';
CREATE UNIQUE INDEX IF NOT EXISTS flow_render_modes_published_uq
  ON flow_render_modes (tenant_id, flow_api) WHERE status = 'published';

ALTER TABLE publish_events ADD COLUMN IF NOT EXISTS surface text;
ALTER TABLE publish_events ADD COLUMN IF NOT EXISTS batch_id text;

-- Self-serve accounts migration (2026-08-10, spec: docs/superpowers/specs/
-- 2026-08-10-self-serve-accounts-design.md). Additive + idempotent:
-- * org_key becomes NULLABLE: a workspace now starts unconnected, and setting
--   org_key IS the exclusive claim (the existing UNIQUE enforces it -- Postgres
--   allows many NULLs under a unique constraint).
-- * sf_user_key becomes NULLABLE: email-created accounts have no SF user yet.
ALTER TABLE workspaces ALTER COLUMN org_key DROP NOT NULL;
ALTER TABLE accounts ALTER COLUMN sf_user_key DROP NOT NULL;

-- 2026-08-11: spec §6 requires one owned workspace per account. Enforced here,
-- not just in application code, because createWorkspace's DO-NOTHING-on-race
-- philosophy (see its comment) needs the database to be the one deciding a
-- concurrent double-submit -- app-level "check then insert" has a race window
-- a signup double-submit can land in. Partial + on the jsonb expression (not
-- a real column, unlike org_key/sf_user_key) because ownerAccountId lives only
-- in config -- WHERE ... IS NOT NULL keeps legacy/owner-less rows unconstrained,
-- matching how org_key's NULLs are unconstrained under its own UNIQUE.
CREATE UNIQUE INDEX IF NOT EXISTS workspaces_owner_uq
  ON workspaces ((config->>'ownerAccountId')) WHERE config->>'ownerAccountId' IS NOT NULL;
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
    // These two are ON CONFLICT DO NOTHING, so they run every boot: a database
    // seeded before one of these tables existed (e.g. pre-M4, no home_cards)
    // still gets its demo row backfilled without clobbering admin edits.
    // The staging migration drops these tables' primary keys in favour of
    // partial unique indexes, so the conflict target must name the same
    // predicate (WHERE status='published') for inference to match.
    await this.sql.query(
      `INSERT INTO view_exposures (tenant_id, object, status, revision, config)
       VALUES ($1,$2,'published',1,$3)
       ON CONFLICT (tenant_id, object) WHERE status='published' DO NOTHING`,
      [demoViewExposures.tenantId, demoViewExposures.object, JSON.stringify(demoViewExposures)],
    );
    await this.sql.query(
      `INSERT INTO home_cards (tenant_id, audience, status, revision, config)
       VALUES ($1,$2,'published',$3,$4)
       ON CONFLICT (tenant_id, audience) WHERE status='published' DO NOTHING`,
      [
        demoHomeCard.tenantId,
        demoHomeCard.audience,
        demoHomeCard.revision,
        JSON.stringify(demoHomeCard),
      ],
    );
    // layout_configs has no uniqueness across revisions, so this one stays
    // guarded by "has this tenant ever been seeded".
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
  }

  private parse<T>(value: unknown): T {
    return (typeof value === "string" ? JSON.parse(value) : value) as T;
  }

  /**
   * The three single-config surfaces share one storage shape: a table keyed by
   * (tenant_id, <key>) with the same status/revision columns layout_configs
   * uses. Table and column names come from this fixed literal map — never from
   * caller input — so interpolating them into SQL is safe.
   */
  private static readonly STAGED_TABLES = {
    exposures: { table: "view_exposures", keyColumn: "object" },
    flows: { table: "flow_render_modes", keyColumn: "flow_api" },
    homecard: { table: "home_cards", keyColumn: "audience" },
  } as const;

  private async readStaged<T>(
    surface: keyof typeof PostgresConfigStore.STAGED_TABLES,
    tenantId: string,
    key: string,
    normalize: (config: unknown) => T,
  ): Promise<StagedRecord<T>> {
    await this.ready;
    const { table, keyColumn } = PostgresConfigStore.STAGED_TABLES[surface];
    const { rows } = await this.sql.query(
      `SELECT status, config FROM ${table} WHERE tenant_id=$1 AND ${keyColumn}=$2 ORDER BY revision ASC`,
      [tenantId, key],
    );
    const record: StagedRecord<T> = { draft: null, published: null, history: [] };
    for (const row of rows) {
      const config = normalize(this.parse(row.config));
      if (row.status === "draft") record.draft = config;
      else if (row.status === "published") record.published = config;
      else record.history.push(config);
    }
    return record;
  }

  private async writeStagedDraft(
    surface: keyof typeof PostgresConfigStore.STAGED_TABLES,
    tenantId: string,
    key: string,
    revision: number,
    config: unknown,
  ): Promise<void> {
    await this.ready;
    const { table, keyColumn } = PostgresConfigStore.STAGED_TABLES[surface];
    await this.sql.query(
      `INSERT INTO ${table} (tenant_id, ${keyColumn}, status, revision, config)
       VALUES ($1,$2,'draft',$3,$4)
       ON CONFLICT (tenant_id, ${keyColumn}) WHERE status='draft'
       DO UPDATE SET config = EXCLUDED.config, revision = EXCLUDED.revision`,
      [tenantId, key, revision, JSON.stringify(config)],
    );
  }

  private async discardStagedDraft(
    surface: keyof typeof PostgresConfigStore.STAGED_TABLES,
    tenantId: string,
    key: string,
  ): Promise<void> {
    await this.ready;
    const { table, keyColumn } = PostgresConfigStore.STAGED_TABLES[surface];
    await this.sql.query(
      `DELETE FROM ${table} WHERE tenant_id=$1 AND ${keyColumn}=$2 AND status='draft'`,
      [tenantId, key],
    );
  }

  /** Draft → published for a staged single-config table, inside a transaction. */
  private async promoteStaged<T extends { revision: number }>(
    surface: keyof typeof PostgresConfigStore.STAGED_TABLES,
    tenantId: string,
    key: string,
    what: string,
    normalize: (config: unknown) => T,
  ): Promise<T> {
    await this.ready;
    const { table, keyColumn } = PostgresConfigStore.STAGED_TABLES[surface];
    const run = async (sql: Pick<SqlSession, "query">): Promise<T> => {
      const { rows } = await sql.query(
        `SELECT status, config FROM ${table} WHERE tenant_id=$1 AND ${keyColumn}=$2 AND status IN ('draft','published')`,
        [tenantId, key],
      );
      const draftRow = rows.find((row) => row.status === "draft");
      if (!draftRow) throw new Error(`No draft to publish for ${what}.`);
      const currentRow = rows.find((row) => row.status === "published");
      const current = currentRow ? normalize(this.parse(currentRow.config)) : null;
      const published = normalize({
        ...(this.parse(draftRow.config) as object),
        revision: (current?.revision ?? 0) + 1,
      });
      await sql.query(
        `UPDATE ${table} SET status='history' WHERE tenant_id=$1 AND ${keyColumn}=$2 AND status='published'`,
        [tenantId, key],
      );
      await sql.query(
        `DELETE FROM ${table} WHERE tenant_id=$1 AND ${keyColumn}=$2 AND status='draft'`,
        [tenantId, key],
      );
      await sql.query(
        `INSERT INTO ${table} (tenant_id, ${keyColumn}, status, revision, config) VALUES ($1,$2,'published',$3,$4)`,
        [tenantId, key, published.revision, JSON.stringify(published)],
      );
      return published;
    };
    return this.inTransaction(run);
  }

  /** Restore a historical revision as a NEW published revision (linear chain). */
  private async restoreStaged<T extends { revision: number }>(
    surface: keyof typeof PostgresConfigStore.STAGED_TABLES,
    tenantId: string,
    key: string,
    toRevision: number,
    what: string,
    normalize: (config: unknown) => T,
  ): Promise<T> {
    await this.ready;
    const { table, keyColumn } = PostgresConfigStore.STAGED_TABLES[surface];
    return this.inTransaction(async (sql) => {
      const { rows } = await sql.query(
        `SELECT config FROM ${table} WHERE tenant_id=$1 AND ${keyColumn}=$2 AND status='history' AND revision=$3`,
        [tenantId, key, toRevision],
      );
      if (!rows[0]) throw new Error(`No revision v${toRevision} in history for ${what}.`);
      const currentRows = await sql.query(
        `SELECT config FROM ${table} WHERE tenant_id=$1 AND ${keyColumn}=$2 AND status='published'`,
        [tenantId, key],
      );
      const current = currentRows.rows[0] ? normalize(this.parse(currentRows.rows[0].config)) : null;
      const published = normalize({
        ...(this.parse(rows[0].config) as object),
        revision: (current?.revision ?? 0) + 1,
      });
      await sql.query(
        `UPDATE ${table} SET status='history' WHERE tenant_id=$1 AND ${keyColumn}=$2 AND status='published'`,
        [tenantId, key],
      );
      await sql.query(
        `INSERT INTO ${table} (tenant_id, ${keyColumn}, status, revision, config) VALUES ($1,$2,'published',$3,$4)`,
        [tenantId, key, published.revision, JSON.stringify(published)],
      );
      return published;
    });
  }

  /**
   * Prefer a dedicated transaction-scoped connection so concurrent queries
   * can't be swept into this BEGIN/COMMIT. Falls back to the shared session
   * (in-memory mock / single-session) when no pooled transaction is available.
   */
  private async inTransaction<T>(run: (sql: Pick<SqlSession, "query">) => Promise<T>): Promise<T> {
    if (this.sql.transaction) return this.sql.transaction(run);
    await this.sql.query("BEGIN");
    try {
      const result = await run(this.sql);
      await this.sql.query("COMMIT");
      return result;
    } catch (error) {
      await this.sql.query("ROLLBACK");
      throw error;
    }
  }

  /** Distinct keys present for a staged table, in stable order. */
  private async stagedKeys(
    surface: keyof typeof PostgresConfigStore.STAGED_TABLES,
    tenantId: string,
  ): Promise<string[]> {
    await this.ready;
    const { table, keyColumn } = PostgresConfigStore.STAGED_TABLES[surface];
    const { rows } = await this.sql.query(
      `SELECT DISTINCT ${keyColumn} AS key FROM ${table} WHERE tenant_id=$1 ORDER BY key ASC`,
      [tenantId],
    );
    return rows.map((row) => String(row.key));
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

  async listLayoutRecords(
    tenantId: string,
  ): Promise<(LayoutRecord & { object: string; audience: string })[]> {
    await this.ready;
    const { rows } = await this.sql.query(
      "SELECT DISTINCT object, audience FROM layout_configs WHERE tenant_id=$1 ORDER BY object ASC, audience ASC",
      [tenantId],
    );
    return Promise.all(
      rows.map(async (row) => {
        const object = String(row.object);
        const audience = String(row.audience);
        return { object, audience, ...(await this.getLayoutRecord(tenantId, object, audience)) };
      }),
    );
  }

  async listStagedChanges(tenantId: string, labels: DiffLabels = {}): Promise<StagedChange[]> {
    return collectStagedChanges(this, tenantId, labels);
  }

  async listSurfaceHistory(tenantId: string, labels: DiffLabels = {}): Promise<SurfaceHistory[]> {
    return collectSurfaceHistory(this, tenantId, labels);
  }

  async rollbackStaged(
    tenantId: string,
    key: StagedKey,
    toRevision: number,
  ): Promise<{ revision: number }> {
    return runStagedRollback(this, tenantId, key, toRevision);
  }

  async publishStaged(tenantId: string, keys: StagedKey[]): Promise<PublishResult[]> {
    return runStagedPublish(keys, (key, batchId) =>
      this.publishOne<{ revision: number }>(tenantId, key, batchId),
    );
  }

  /**
   * The one place a draft becomes what reps see. Every publish verb routes
   * through here so the revision bump, the history append and the PublishEvent
   * can't drift apart per surface.
   */
  private async publishOne<T>(tenantId: string, key: StagedKey, batchId?: string): Promise<T> {
    const audience = key.audience ?? "default";
    switch (key.surface) {
      case "layout":
        return (await this.publishLayout(tenantId, key.object, audience, batchId)) as T;
      case "exposures": {
        const published = await this.promoteStaged(
          "exposures",
          tenantId,
          key.object,
          `${key.object} lists`,
          (c) => ViewExposuresSchema.parse(c),
        );
        await this.logEvent(
          tenantId, key.object, audience, published.revision, "publish", "exposures", batchId,
        );
        return published as T;
      }
      case "flows": {
        const published = await this.promoteStaged(
          "flows",
          tenantId,
          key.object,
          `flow ${key.object}`,
          (c) => FlowRenderModeSchema.parse(c),
        );
        await this.logEvent(
          tenantId, key.object, audience, published.revision, "publish", "flows", batchId,
        );
        return published as T;
      }
      case "homecard": {
        const published = await this.promoteStaged(
          "homecard",
          tenantId,
          audience,
          "home card",
          (c) => c as HomeCardConfig,
        );
        // Labelled "home card" (not the audience) so the home page reads right.
        await this.logEvent(
          tenantId, "home card", audience, published.revision, "publish", "homecard", batchId,
        );
        return published as T;
      }
      case "screen": {
        const published = await this.publishScreen(tenantId, key.object);
        await this.logEvent(
          tenantId, published.label, audience, published.revision, "publish", "screen", batchId,
        );
        return published as T;
      }
    }
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

  // ---- Identity (accounts / workspaces / memberships) ----

  async getWorkspace(id: string): Promise<Workspace | undefined> {
    await this.ready;
    const { rows } = await this.sql.query("SELECT config FROM workspaces WHERE id=$1", [id]);
    return rows[0] ? this.parse<Workspace>(rows[0].config) : undefined;
  }

  async getWorkspaceByOrgId(salesforceOrgId: string): Promise<Workspace | undefined> {
    await this.ready;
    const { rows } = await this.sql.query("SELECT config FROM workspaces WHERE org_key=$1", [
      salesforceIdKey(salesforceOrgId),
    ]);
    return rows[0] ? this.parse<Workspace>(rows[0].config) : undefined;
  }

  /** ORDER BY created_at so a legacy pre-uq duplicate resolves deterministically
   *  (oldest wins) instead of whichever row Postgres happens to scan first. */
  async getWorkspaceByOwner(ownerAccountId: string): Promise<Workspace | undefined> {
    await this.ready;
    const { rows } = await this.sql.query(
      "SELECT config FROM workspaces WHERE config->>'ownerAccountId' = $1 ORDER BY created_at ASC LIMIT 1",
      [ownerAccountId],
    );
    return rows[0] ? this.parse<Workspace>(rows[0].config) : undefined;
  }

  /**
   * DO NOTHING on conflict, not DO UPDATE: two people from a new org can sign
   * in simultaneously, and the loser must adopt the winner's workspace rather
   * than overwrite it. resolveSignIn re-reads after calling this. org_key may
   * be NULL — a self-serve signup creates a workspace before claiming an org
   * (spec §1), and Postgres allows many NULLs under the UNIQUE constraint.
   *
   * Same DO-NOTHING philosophy applies to a double-submitted signup for one
   * owner: ON CONFLICT can't name the partial `workspaces_owner_uq` index (its
   * predicate isn't inferrable the way org_key's plain UNIQUE is), so the
   * catch below does the same job by hand — 23505 means the owner already has
   * a workspace, the caller re-reads via getWorkspaceByOwner, and the loser's
   * row is simply never inserted. Any other error rethrows.
   */
  async createWorkspace(workspace: Workspace): Promise<void> {
    await this.ready;
    try {
      await this.sql.query(
        `INSERT INTO workspaces (id, org_key, config) VALUES ($1,$2,$3)
         ON CONFLICT (org_key) DO NOTHING`,
        [
          workspace.id,
          workspace.salesforceOrgId ? salesforceIdKey(workspace.salesforceOrgId) : null,
          JSON.stringify(workspace),
        ],
      );
    } catch (error) {
      if ((error as { code?: string }).code === "23505") return;
      throw error;
    }
  }

  /** Operational enumeration — never call from a request path. */
  async listWorkspaces(): Promise<Workspace[]> {
    await this.ready;
    const { rows } = await this.sql.query("SELECT config FROM workspaces");
    return rows.map((row) => this.parse<Workspace>(row.config));
  }

  /**
   * The unique constraint on org_key IS the claim's enforcement: the race
   * between two owners claiming one org is decided by the database, and the
   * loser gets a typed conflict, never a partial write (spec §7).
   */
  async claimOrg(
    workspaceId: string,
    salesforceOrgId: string,
    orgName?: string,
  ): Promise<OrgClaimResult> {
    await this.ready;
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) throw new Error(`Unknown workspace: ${workspaceId}`);
    const updated: Workspace = {
      ...workspace,
      salesforceOrgId,
      ...(orgName?.trim() ? { name: orgName.trim() } : {}),
    };
    try {
      await this.sql.query("UPDATE workspaces SET org_key=$2, config=$3 WHERE id=$1", [
        workspaceId,
        salesforceIdKey(salesforceOrgId),
        JSON.stringify(updated),
      ]);
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        return { ok: false, reason: "org-already-claimed" };
      }
      throw error;
    }
    return { ok: true, workspace: updated };
  }

  async releaseOrg(workspaceId: string): Promise<void> {
    await this.ready;
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) return;
    const { salesforceOrgId: _released, ...rest } = workspace;
    await this.sql.query("UPDATE workspaces SET org_key=NULL, config=$2 WHERE id=$1", [
      workspaceId,
      JSON.stringify(rest),
    ]);
  }

  async setWorkspaceOwner(workspaceId: string, ownerAccountId: string): Promise<void> {
    await this.ready;
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) throw new Error(`Unknown workspace: ${workspaceId}`);
    await this.sql.query("UPDATE workspaces SET config=$2 WHERE id=$1", [
      workspaceId,
      JSON.stringify({ ...workspace, ownerAccountId }),
    ]);
  }

  async getAccount(id: string): Promise<Account | undefined> {
    await this.ready;
    const { rows } = await this.sql.query("SELECT config FROM accounts WHERE id=$1", [id]);
    return rows[0] ? this.parse<Account>(rows[0].config) : undefined;
  }

  async getAccountBySalesforceUserId(salesforceUserId: string): Promise<Account | undefined> {
    await this.ready;
    const { rows } = await this.sql.query("SELECT config FROM accounts WHERE sf_user_key=$1", [
      salesforceIdKey(salesforceUserId),
    ]);
    return rows[0] ? this.parse<Account>(rows[0].config) : undefined;
  }

  async getAccountByEmail(email: string): Promise<Account | undefined> {
    await this.ready;
    const { rows } = await this.sql.query(
      "SELECT config FROM accounts WHERE lower(config->>'email') = lower($1) LIMIT 1",
      [email.trim()],
    );
    return rows[0] ? this.parse<Account>(rows[0].config) : undefined;
  }

  /** Refreshes name/email on return visits; the id and sf_user_key never move. */
  async upsertAccount(account: Account): Promise<void> {
    await this.ready;
    await this.sql.query(
      `INSERT INTO accounts (id, sf_user_key, config) VALUES ($1,$2,$3)
       ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, sf_user_key = EXCLUDED.sf_user_key`,
      [
        account.id,
        account.salesforceUserId ? salesforceIdKey(account.salesforceUserId) : null,
        JSON.stringify(account),
      ],
    );
  }

  async getMembership(accountId: string, workspaceId: string): Promise<Membership | undefined> {
    await this.ready;
    const { rows } = await this.sql.query(
      "SELECT account_id, workspace_id, role, created_at FROM memberships WHERE account_id=$1 AND workspace_id=$2",
      [accountId, workspaceId],
    );
    return rows[0] ? this.toMembership(rows[0]) : undefined;
  }

  async listMembershipsForAccount(accountId: string): Promise<Membership[]> {
    await this.ready;
    const { rows } = await this.sql.query(
      "SELECT account_id, workspace_id, role, created_at FROM memberships WHERE account_id=$1",
      [accountId],
    );
    return rows.map((r) => this.toMembership(r));
  }

  async listMembershipsForWorkspace(workspaceId: string): Promise<Membership[]> {
    await this.ready;
    const { rows } = await this.sql.query(
      "SELECT account_id, workspace_id, role, created_at FROM memberships WHERE workspace_id=$1",
      [workspaceId],
    );
    return rows.map((r) => this.toMembership(r));
  }

  async setMembership(membership: Membership): Promise<void> {
    await this.ready;
    await this.sql.query(
      `INSERT INTO memberships (account_id, workspace_id, role) VALUES ($1,$2,$3)
       ON CONFLICT (account_id, workspace_id) DO UPDATE SET role = EXCLUDED.role`,
      [membership.accountId, membership.workspaceId, membership.role],
    );
  }

  private toMembership(row: Record<string, unknown>): Membership {
    const createdAt = row.created_at;
    return {
      accountId: row.account_id as string,
      workspaceId: row.workspace_id as string,
      role: row.role as Membership["role"],
      createdAt:
        createdAt instanceof Date ? createdAt.toISOString() : String(createdAt ?? ""),
    };
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
    return this.publishOne(tenantId, { surface: "layout", object, audience });
  }

  private async publishLayout(
    tenantId: string,
    object: string,
    audience: string,
    batchId?: string,
  ): Promise<LayoutConfig> {
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
      await this.logEvent(tenantId, object, audience, published.revision, "publish", "layout", batchId);
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
      await this.logEvent(tenantId, object, audience, published.revision, "rollback", "layout");
      await this.sql.query("COMMIT");
      return published;
    } catch (error) {
      await this.sql.query("ROLLBACK");
      throw error;
    }
  }

  async getViewExposuresConfig(
    tenantId: string,
    object: string,
  ): Promise<ViewExposuresConfig | undefined> {
    // PUBLISHED only — this is the read side the MCP server renders from.
    return (await this.getViewExposuresRecord(tenantId, object)).published ?? undefined;
  }

  async getViewExposuresRecord(tenantId: string, object: string): Promise<ViewExposuresRecord> {
    // Normalize through the schema: rows written before customLists existed
    // (v2 note) otherwise reach clients without the field and crash them.
    return this.readStaged("exposures", tenantId, object, (c) => ViewExposuresSchema.parse(c));
  }

  async listViewExposuresRecords(
    tenantId: string,
  ): Promise<(ViewExposuresRecord & { object: string })[]> {
    const objects = await this.stagedKeys("exposures", tenantId);
    return Promise.all(
      objects.map(async (object) => ({
        object,
        ...(await this.getViewExposuresRecord(tenantId, object)),
      })),
    );
  }

  /** Stages exposure changes as a DRAFT — publish makes them visible to reps. */
  async setViewExposures(config: ViewExposuresConfig): Promise<void> {
    const parsed = ViewExposuresSchema.parse(config);
    await this.writeStagedDraft(
      "exposures",
      parsed.tenantId,
      parsed.object,
      parsed.revision,
      parsed,
    );
  }

  async discardViewExposuresDraft(tenantId: string, object: string): Promise<void> {
    await this.discardStagedDraft("exposures", tenantId, object);
  }

  async publishViewExposures(tenantId: string, object: string): Promise<ViewExposuresConfig> {
    return this.publishOne(tenantId, { surface: "exposures", object });
  }

  async rollbackViewExposures(
    tenantId: string,
    object: string,
    toRevision: number,
  ): Promise<ViewExposuresConfig> {
    const published = await this.restoreStaged("exposures", tenantId, object, toRevision, `${object} lists`, (c) =>
      ViewExposuresSchema.parse(c),
    );
    await this.logEvent(tenantId, object, "default", published.revision, "rollback", "exposures");
    return published;
  }

  async getHomeCard(tenantId: string, audience = "default"): Promise<HomeCardConfig | undefined> {
    // PUBLISHED only — a staged home card is invisible to chat until published.
    return (await this.getHomeCardRecord(tenantId, audience)).published ?? undefined;
  }

  async getHomeCardRecord(tenantId: string, audience = "default"): Promise<HomeCardRecord> {
    return this.readStaged("homecard", tenantId, audience, (c) => c as HomeCardConfig);
  }

  async listHomeCardRecords(
    tenantId: string,
  ): Promise<(HomeCardRecord & { audience: string })[]> {
    const audiences = await this.stagedKeys("homecard", tenantId);
    return Promise.all(
      audiences.map(async (audience) => ({
        audience,
        ...(await this.getHomeCardRecord(tenantId, audience)),
      })),
    );
  }

  async getFlowRenderModes(tenantId: string): Promise<FlowRenderModeConfig[]> {
    // PUBLISHED only — a staged render policy does not change chat behavior.
    const records = await this.listFlowRenderModeRecords(tenantId);
    return records.flatMap((record) => (record.published ? [record.published] : []));
  }

  async listFlowRenderModeRecords(
    tenantId: string,
  ): Promise<(FlowRenderModeRecord & { flowApiName: string })[]> {
    const flows = await this.stagedKeys("flows", tenantId);
    return Promise.all(
      flows.map(async (flowApiName) => ({
        flowApiName,
        ...(await this.getFlowRenderModeRecord(tenantId, flowApiName)),
      })),
    );
  }

  async getFlowRenderModeRecord(
    tenantId: string,
    flowApiName: string,
  ): Promise<FlowRenderModeRecord> {
    return this.readStaged("flows", tenantId, flowApiName, (c) => FlowRenderModeSchema.parse(c));
  }

  /** Stages a flow's render policy as a DRAFT — live only after publish. */
  async setFlowRenderMode(config: FlowRenderModeConfig): Promise<void> {
    const parsed = FlowRenderModeSchema.parse(config);
    await this.writeStagedDraft(
      "flows",
      parsed.tenantId,
      parsed.flowApiName,
      parsed.revision,
      parsed,
    );
  }

  async discardFlowRenderModeDraft(tenantId: string, flowApiName: string): Promise<void> {
    await this.discardStagedDraft("flows", tenantId, flowApiName);
  }

  async publishFlowRenderMode(
    tenantId: string,
    flowApiName: string,
  ): Promise<FlowRenderModeConfig> {
    return this.publishOne(tenantId, { surface: "flows", object: flowApiName });
  }

  async rollbackFlowRenderMode(
    tenantId: string,
    flowApiName: string,
    toRevision: number,
  ): Promise<FlowRenderModeConfig> {
    const published = await this.restoreStaged(
      "flows",
      tenantId,
      flowApiName,
      toRevision,
      `flow ${flowApiName}`,
      (c) => FlowRenderModeSchema.parse(c),
    );
    await this.logEvent(tenantId, flowApiName, "default", published.revision, "rollback", "flows");
    return published;
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

  async discardCustomScreenDraft(tenantId: string, id: string): Promise<void> {
    await this.ready;
    await this.sql.query(
      "DELETE FROM custom_screens WHERE tenant_id=$1 AND screen_id=$2 AND status='draft'",
      [tenantId, id],
    );
  }

  async publishCustomScreen(tenantId: string, id: string): Promise<CustomScreenConfig> {
    return this.publishOne(tenantId, { surface: "screen", object: id });
  }

  async rollbackCustomScreen(
    tenantId: string,
    id: string,
    toRevision: number,
  ): Promise<CustomScreenConfig> {
    await this.ready;
    const published = await this.inTransaction(async (sql) => {
      const { rows } = await sql.query(
        "SELECT config FROM custom_screens WHERE tenant_id=$1 AND screen_id=$2 AND status='history' AND revision=$3",
        [tenantId, id, toRevision],
      );
      if (!rows[0]) {
        throw new Error(`No revision v${toRevision} in history for custom screen ${id}.`);
      }
      const currentRows = await sql.query(
        "SELECT config FROM custom_screens WHERE tenant_id=$1 AND screen_id=$2 AND status='published'",
        [tenantId, id],
      );
      const current = currentRows.rows[0]
        ? CustomScreenSchema.parse(this.parse(currentRows.rows[0].config))
        : null;
      // Rolling back is itself a publish: NEW revision, linear version chain.
      const restored = CustomScreenSchema.parse({
        ...(this.parse(rows[0].config) as object),
        status: "published",
        revision: (current?.revision ?? 0) + 1,
        updatedAt: new Date().toISOString(),
      });
      await sql.query(
        "UPDATE custom_screens SET status='history' WHERE tenant_id=$1 AND screen_id=$2 AND status='published'",
        [tenantId, id],
      );
      await sql.query(
        "INSERT INTO custom_screens (tenant_id, screen_id, status, revision, config) VALUES ($1,$2,'published',$3,$4)",
        [tenantId, id, restored.revision, JSON.stringify(restored)],
      );
      return restored;
    });
    await this.logEvent(
      tenantId, published.label, "default", published.revision, "rollback", "screen",
    );
    return published;
  }

  private async publishScreen(tenantId: string, id: string): Promise<CustomScreenConfig> {
    await this.ready;
    const current = (await this.getCustomScreenRecord(tenantId, id)).published;
    const run = async (sql: Pick<SqlSession, "query">): Promise<CustomScreenConfig> => {
      const { rows } = await sql.query(
        "SELECT config FROM custom_screens WHERE tenant_id=$1 AND screen_id=$2 AND status='draft'",
        [tenantId, id],
      );
      if (!rows[0]) throw new Error(`No draft to publish for custom screen ${id}.`);
      const draft = CustomScreenSchema.parse(this.parse(rows[0].config));
      if (!draft.flowApiName) {
        throw new Error(
          "Attach this screen to a flow before publishing — the flow render ladder is the only thing that runs a custom screen.",
        );
      }
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
    return this.inTransaction(run);
  }

  /**
   * Stages home-card changes as a DRAFT. Before the staging model these edits
   * lived in React state only and were lost on tab close — they are durable now.
   */
  async setHomeCard(config: HomeCardConfig): Promise<void> {
    await this.writeStagedDraft(
      "homecard",
      config.tenantId,
      config.audience,
      config.revision,
      config,
    );
  }

  async discardHomeCardDraft(tenantId: string, audience = "default"): Promise<void> {
    await this.discardStagedDraft("homecard", tenantId, audience);
  }

  async publishHomeCard(tenantId: string, audience = "default"): Promise<HomeCardConfig> {
    return this.publishOne(tenantId, { surface: "homecard", object: audience, audience });
  }

  async rollbackHomeCard(
    tenantId: string,
    toRevision: number,
    audience = "default",
  ): Promise<HomeCardConfig> {
    const published = await this.restoreStaged(
      "homecard",
      tenantId,
      audience,
      toRevision,
      "home card",
      (c) => c as HomeCardConfig,
    );
    await this.logEvent(tenantId, "home card", audience, published.revision, "rollback", "homecard");
    return published;
  }

  async listPublishes(tenantId: string): Promise<PublishEvent[]> {
    await this.ready;
    const { rows } = await this.sql.query(
      `SELECT object, audience, revision, kind, surface, batch_id, created_at
       FROM publish_events WHERE tenant_id=$1 ORDER BY id DESC`,
      [tenantId],
    );
    return rows.map((row) => ({
      tenantId,
      object: String(row.object),
      audience: String(row.audience),
      revision: Number(row.revision),
      kind: row.kind as PublishEvent["kind"],
      timestamp: new Date(row.created_at as string).toISOString(),
      // Events written before the staging model have neither column; they were
      // all layout publishes, which is how they render.
      ...(row.surface ? { surface: row.surface as PublishSurface } : {}),
      ...(row.batch_id ? { batchId: String(row.batch_id) } : {}),
    }));
  }

  private async logEvent(
    tenantId: string,
    object: string,
    audience: string,
    revision: number,
    kind: PublishEvent["kind"],
    surface: PublishSurface,
    batchId?: string,
  ): Promise<void> {
    await this.sql.query(
      `INSERT INTO publish_events (tenant_id, object, audience, revision, kind, surface, batch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [tenantId, object, audience, revision, kind, surface, batchId ?? null],
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
