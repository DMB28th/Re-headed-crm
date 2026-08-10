import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileAuditLog, InMemoryAuditLog, type AuditEntry } from "./audit-log.js";

describe("FileAuditLog", () => {
  it("appends and lists newest-first, scoped by tenant, surviving a reopen", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cardstack-audit-"));
    const file = path.join(dir, "audit.jsonl");
    const log = new FileAuditLog(file);
    await log.append({
      tenantId: "t1",
      user: "Rep A",
      object: "deals",
      recordId: "1",
      changes: [{ field: "amount", before: 100, after: 200 }],
      timestamp: "2026-07-12T10:00:00.000Z",
    });
    await log.append({
      tenantId: "t2",
      user: "Rep B",
      object: "deals",
      recordId: "2",
      changes: [{ field: "stage", before: "a", after: "b" }],
      timestamp: "2026-07-12T11:00:00.000Z",
    });
    await log.append({
      tenantId: "t1",
      user: "Rep A",
      object: "deals",
      recordId: "3",
      changes: [{ field: "closedate", before: null, after: "2026-08-01" }],
      timestamp: "2026-07-12T12:00:00.000Z",
    });

    // A fresh instance proves durability (survives a "restart").
    const reopened = new FileAuditLog(file);
    const t1 = await reopened.list("t1");
    expect(t1.map((e) => e.recordId)).toEqual(["3", "1"]); // newest-first, tenant-scoped
    expect(await reopened.list("t2")).toHaveLength(1);
    expect(await reopened.list("t1", 1)).toHaveLength(1);
  });
});

describe("audit query (compliance reads)", () => {
  const at = (timestamp: string, over: Partial<AuditEntry> = {}) => ({
    tenantId: "t_demo",
    user: "Dana Seller",
    actor: { userId: "u1", name: "Dana", email: "dana@example.com" },
    object: "deals",
    recordId: "d-1",
    changes: [{ field: "amount", before: 1, after: 2 }],
    timestamp,
    ...over,
  });

  const seed = async (log: InMemoryAuditLog) => {
    await log.append(at("2026-08-01T10:00:00.000Z"));
    await log.append(
      at("2026-08-05T10:00:00.000Z", {
        object: "contacts",
        recordId: "c-9",
        changes: [{ field: "email", before: "a@b.c", after: "d@e.f" }],
        actor: { userId: "u2", name: "Lee", email: "lee@example.com" },
        user: "Lee Rep",
      }),
    );
    await log.append(at("2026-08-09T10:00:00.000Z", { recordId: "d-2" }));
  };

  it("filters by object, actor, date range and free text", async () => {
    const log = new InMemoryAuditLog();
    await seed(log);

    expect((await log.query("t_demo", { object: "deals" })).total).toBe(2);
    expect((await log.query("t_demo", { actor: "lee" })).total).toBe(1);
    expect((await log.query("t_demo", { q: "email" })).total).toBe(1);
    expect((await log.query("t_demo", { q: "d-2" })).total).toBe(1);
    expect(
      (await log.query("t_demo", { from: "2026-08-04", to: "2026-08-06" })).total,
    ).toBe(1);
    // Filters AND together.
    expect((await log.query("t_demo", { object: "deals", actor: "lee" })).total).toBe(0);
  });

  it("pages newest-first and reports the pre-paging total", async () => {
    const log = new InMemoryAuditLog();
    await seed(log);

    const first = await log.query("t_demo", { limit: 2 });
    expect(first.entries).toHaveLength(2);
    expect(first.total).toBe(3);
    expect(first.entries[0]!.timestamp).toBe("2026-08-09T10:00:00.000Z");

    const second = await log.query("t_demo", { limit: 2, offset: 2 });
    expect(second.entries).toHaveLength(1);
    expect(second.total).toBe(3);
    expect(second.entries[0]!.timestamp).toBe("2026-08-01T10:00:00.000Z");
  });

  it("scopes to the tenant", async () => {
    const log = new InMemoryAuditLog();
    await seed(log);
    await log.append(at("2026-08-09T11:00:00.000Z", { tenantId: "t_other" }));
    expect((await log.query("t_demo")).total).toBe(3);
    expect((await log.query("t_other")).total).toBe(1);
  });
});
