/**
 * Durable audit log for confirmed writes — the compliance spine (CLAUDE.md).
 * In-memory alone evaporates on every Railway redeploy, so an admin could never
 * answer "who changed this last Tuesday". This adds file- and Postgres-backed
 * implementations of the same AuditLog interface the MCP server already uses.
 *
 * Migration notes:
 * - 2026-07-12: new module. PostgresAuditLog creates `audit_entries`
 *   (CREATE TABLE IF NOT EXISTS — safe on a live DB). FileAuditLog appends
 *   JSON-lines next to the file config store's data file.
 * - 2026-08-10: added `query()` — filtered, paged reads with a total count.
 *   `list()` is unchanged and still means "newest N"; it just can't answer
 *   "who changed amount on this record last Tuesday", which is the question a
 *   compliance surface exists for. Additive: implementations keep `list`.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

export interface AuditEntry {
  id: string;
  tenantId: string;
  /** Who the write was attributed to (the connected CRM user, pre-M7). */
  user: string;
  /** Authenticated app user who initiated the write. */
  actor?: {
    userId: string;
    name: string;
    email?: string;
  };
  object: string;
  recordId: string;
  changes: { field: string; before: unknown; after: unknown }[];
  timestamp: string;
}

/** Filters for a compliance read. Every field is optional and ANDed. */
export interface AuditQuery {
  limit?: number;
  offset?: number;
  /** Exact CRM object api name. */
  object?: string;
  /** Case-insensitive substring of the actor's name/email or the written-as user. */
  actor?: string;
  /** Case-insensitive substring of the record id or any changed field name. */
  q?: string;
  /** Inclusive ISO bounds. `to` is compared as written, so pass an end-of-day value. */
  from?: string;
  to?: string;
}

export interface AuditPage {
  entries: AuditEntry[];
  /** Rows matching the filters BEFORE limit/offset — drives "showing N of M". */
  total: number;
}

export interface AuditLog {
  append(entry: Omit<AuditEntry, "id">): Promise<AuditEntry>;
  /** Newest-first. */
  list(tenantId: string, limit?: number): Promise<AuditEntry[]>;
  /** Newest-first, filtered and paged. */
  query(tenantId: string, query?: AuditQuery): Promise<AuditPage>;
}

/**
 * One matcher for the non-SQL implementations, so file and in-memory can't
 * disagree about what a filter means. Postgres pushes the same semantics down.
 */
export function matchesAuditQuery(entry: AuditEntry, query: AuditQuery): boolean {
  if (query.object && entry.object !== query.object) return false;
  if (query.from && entry.timestamp < query.from) return false;
  if (query.to && entry.timestamp > query.to) return false;
  if (query.actor) {
    const needle = query.actor.toLowerCase();
    const haystack = [entry.actor?.name, entry.actor?.email, entry.user]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  if (query.q) {
    const needle = query.q.toLowerCase();
    const haystack = [entry.recordId, ...entry.changes.map((change) => change.field)]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

/** Shared paging for the non-SQL implementations. */
function pageOf(entries: AuditEntry[], query: AuditQuery): AuditPage {
  const matched = entries.filter((entry) => matchesAuditQuery(entry, query));
  const offset = query.offset ?? 0;
  return {
    entries: matched.slice(offset, offset + (query.limit ?? 50)),
    total: matched.length,
  };
}

/** JSON-lines audit log — one entry per line, appended atomically enough for a
 *  single-writer server. Survives restarts; readable by the Studio API. */
export class FileAuditLog implements AuditLog {
  constructor(private readonly filePath: string) {
    mkdirSync(path.dirname(filePath), { recursive: true });
  }

  async append(entry: Omit<AuditEntry, "id">): Promise<AuditEntry> {
    const full: AuditEntry = { ...entry, id: `audit-${Date.now()}-${Math.round(Math.random() * 1e6)}` };
    appendFileSync(this.filePath, `${JSON.stringify(full)}\n`);
    return full;
  }

  private readAll(tenantId: string): AuditEntry[] {
    if (!existsSync(this.filePath)) return [];
    const lines = readFileSync(this.filePath, "utf-8").split("\n").filter(Boolean);
    const entries: AuditEntry[] = [];
    for (const line of lines) {
      try {
        const e = JSON.parse(line) as AuditEntry;
        if (e.tenantId === tenantId) entries.push(e);
      } catch {
        // skip a corrupt line rather than fail the whole read
      }
    }
    return entries.reverse();
  }

  async list(tenantId: string, limit = 500): Promise<AuditEntry[]> {
    return this.readAll(tenantId).slice(0, limit);
  }

  async query(tenantId: string, query: AuditQuery = {}): Promise<AuditPage> {
    return pageOf(this.readAll(tenantId), query);
  }
}

/** Minimal SQL surface (shared with the config store): a raw Client, never a
 *  Pool (pool.query has a different overload). */
interface Sql {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export class PostgresAuditLog implements AuditLog {
  private ready: Promise<void>;

  constructor(private readonly sql: Sql) {
    this.ready = this.sql
      .query(
        `CREATE TABLE IF NOT EXISTS audit_entries (
           id TEXT PRIMARY KEY,
           tenant_id TEXT NOT NULL,
           entry JSONB NOT NULL,
           created_at TIMESTAMPTZ NOT NULL DEFAULT now()
         )`,
      )
      .then(() => undefined);
  }

  async append(entry: Omit<AuditEntry, "id">): Promise<AuditEntry> {
    await this.ready;
    const full: AuditEntry = { ...entry, id: `audit-${Date.now()}-${Math.round(Math.random() * 1e6)}` };
    await this.sql.query(
      "INSERT INTO audit_entries (id, tenant_id, entry) VALUES ($1, $2, $3)",
      [full.id, full.tenantId, JSON.stringify(full)],
    );
    return full;
  }

  async list(tenantId: string, limit = 500): Promise<AuditEntry[]> {
    await this.ready;
    const { rows } = await this.sql.query(
      "SELECT entry FROM audit_entries WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2",
      [tenantId, limit],
    );
    return rows.map((r) => (typeof r.entry === "string" ? JSON.parse(r.entry) : r.entry) as AuditEntry);
  }

  async query(tenantId: string, query: AuditQuery = {}): Promise<AuditPage> {
    await this.ready;
    const where: string[] = ["tenant_id = $1"];
    const params: unknown[] = [tenantId];
    const add = (clause: (placeholder: string) => string, value: unknown) => {
      params.push(value);
      where.push(clause(`$${params.length}`));
    };
    if (query.object) add((p) => `entry->>'object' = ${p}`, query.object);
    if (query.from) add((p) => `entry->>'timestamp' >= ${p}`, query.from);
    if (query.to) add((p) => `entry->>'timestamp' <= ${p}`, query.to);
    if (query.actor) {
      add(
        (p) =>
          `(COALESCE(entry->'actor'->>'name','') || ' ' || COALESCE(entry->'actor'->>'email','') || ' ' || COALESCE(entry->>'user','')) ILIKE ${p}`,
        `%${query.actor}%`,
      );
    }
    if (query.q) {
      // recordId, or any changed field name. The changes array is matched by
      // extracting its `field` values rather than casting the whole row to
      // text, so a value that happens to contain the needle can't false-match.
      add(
        (p) =>
          `(entry->>'recordId' ILIKE ${p} OR EXISTS (
              SELECT 1 FROM jsonb_array_elements(entry->'changes') AS c
              WHERE c->>'field' ILIKE ${p}
            ))`,
        `%${query.q}%`,
      );
    }
    const clause = where.join(" AND ");

    const totalRows = await this.sql.query(
      `SELECT count(*)::int AS total FROM audit_entries WHERE ${clause}`,
      params,
    );
    const total = Number(totalRows.rows[0]?.total ?? 0);

    params.push(query.limit ?? 50, query.offset ?? 0);
    const { rows } = await this.sql.query(
      `SELECT entry FROM audit_entries WHERE ${clause}
       ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return {
      entries: rows.map(
        (r) => (typeof r.entry === "string" ? JSON.parse(r.entry) : r.entry) as AuditEntry,
      ),
      total,
    };
  }
}

export async function createPostgresAuditLog(databaseUrl: string): Promise<PostgresAuditLog> {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  return new PostgresAuditLog({
    query: (text, params) => client.query(text, params as never[]),
  });
}

/** Default JSONL path, next to the file config store's data file. */
export function defaultAuditPath(): string {
  return (
    process.env.CARDSTACK_AUDIT_PATH ??
    path.join(process.cwd(), "..", "..", "data", "cardstack-audit.jsonl")
  );
}

/** In-memory fallback for local dev / tests. */
export class InMemoryAuditLog implements AuditLog {
  private entries: AuditEntry[] = [];
  private nextId = 1;

  async append(entry: Omit<AuditEntry, "id">): Promise<AuditEntry> {
    const full = { ...entry, id: `audit-${this.nextId++}` };
    this.entries.push(full);
    return full;
  }

  async list(tenantId: string, limit = 500): Promise<AuditEntry[]> {
    return this.mine(tenantId).slice(0, limit);
  }

  async query(tenantId: string, query: AuditQuery = {}): Promise<AuditPage> {
    return pageOf(this.mine(tenantId), query);
  }

  private mine(tenantId: string): AuditEntry[] {
    return this.entries.filter((e) => e.tenantId === tenantId).slice().reverse();
  }
}
