/**
 * Audit log for confirmed writes — the compliance story (PLAN.md V5).
 * The interface and its durable implementations (file / Postgres) live in
 * @cardstack/config-store so both the server and Studio's read API share one
 * source. Re-exported here to keep server.ts's import path stable.
 */
export {
  InMemoryAuditLog,
  FileAuditLog,
  PostgresAuditLog,
  createPostgresAuditLog,
  defaultAuditPath,
  type AuditEntry,
  type AuditLog,
} from "@cardstack/config-store";
