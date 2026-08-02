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
 * - 2026-08-02: AuditEntry gains `confirmation` (widget-confirmed vs
 *   model-initiated). Optional, and entries are stored as whole JSON blobs
 *   (JSONB / JSON-lines), so no schema change and no backfill is required —
 *   pre-existing entries read back with `confirmation: undefined`, which
 *   readers must render as "unknown" rather than assuming either origin.
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
  /**
   * Whether a rep confirmed a server-computed diff before this write, or the
   * model called the write tool directly. Undefined on entries written before
   * 2026-08-02, when the distinction wasn't recorded — render those as unknown.
   */
  confirmation?: {
    via: "widget" | "model";
    confirmationId?: string;
    previewedAt?: string;
  };
}

export interface AuditLog {
  append(entry: Omit<AuditEntry, "id">): Promise<AuditEntry>;
  /** Newest-first. */
  list(tenantId: string, limit?: number): Promise<AuditEntry[]>;
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

  async list(tenantId: string, limit = 500): Promise<AuditEntry[]> {
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
    return entries.reverse().slice(0, limit);
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
    return this.entries
      .filter((e) => e.tenantId === tenantId)
      .reverse()
      .slice(0, limit);
  }
}
