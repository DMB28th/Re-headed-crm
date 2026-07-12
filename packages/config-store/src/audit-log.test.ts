import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileAuditLog } from "./audit-log.js";

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
