/**
 * Audit log for confirmed writes — the compliance story (PLAN.md V5).
 * In-memory for M2; the interface is what Postgres implements later. main.ts
 * holds ONE instance across requests (the server itself stays stateless —
 * audit is durable state, not session state).
 */
export interface AuditEntry {
  id: string;
  tenantId: string;
  user: string;
  object: string;
  recordId: string;
  changes: { field: string; before: unknown; after: unknown }[];
  timestamp: string;
}

export interface AuditLog {
  append(entry: Omit<AuditEntry, "id">): Promise<AuditEntry>;
  list(tenantId: string): Promise<AuditEntry[]>;
}

export class InMemoryAuditLog implements AuditLog {
  private entries: AuditEntry[] = [];
  private nextId = 1;

  async append(entry: Omit<AuditEntry, "id">): Promise<AuditEntry> {
    const full = { ...entry, id: `audit-${this.nextId++}` };
    this.entries.push(full);
    return full;
  }

  async list(tenantId: string): Promise<AuditEntry[]> {
    return this.entries.filter((e) => e.tenantId === tenantId);
  }
}
