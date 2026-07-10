import { beforeEach, describe, expect, it } from "vitest";
import { MockCrmAdapter } from "./mock-adapter.js";
import { CrmValidationError } from "../adapter.js";

let adapter: MockCrmAdapter;
beforeEach(() => {
  adapter = new MockCrmAdapter();
});

describe("search", () => {
  it("golden path 1: exactly 7 open deals over $50k, sorted by close date", async () => {
    const page = await adapter.search("deals", {
      filters: [
        { field: "amount", op: "gt", value: 50000 },
        { field: "dealstage", op: "neq", value: "Closed won" },
        { field: "dealstage", op: "neq", value: "Closed lost" },
      ],
      sort: { field: "closedate", dir: "asc" },
      limit: 10,
    });
    expect(page.total).toBe(7);
    expect(page.hasMore).toBe(false);
    expect(page.rows[0]!.fields.dealname).toContain("Meridian Health");
    const dates = page.rows.map((r) => String(r.fields.closedate));
    expect([...dates].sort()).toEqual(dates);
  });

  it("free-text search matches name and company terms", async () => {
    const page = await adapter.search("deals", { text: "meridian renewal" });
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]!.id).toBe("d-001");
  });

  it("paginates with cursor", async () => {
    const first = await adapter.search("deals", { limit: 5 });
    expect(first.hasMore).toBe(true);
    const second = await adapter.search("deals", { limit: 5, cursor: first.cursor! });
    const ids = new Set([...first.rows, ...second.rows].map((r) => r.id));
    expect(ids.size).toBe(10);
  });
});

describe("getRelated", () => {
  it("respects the configured limit and reports hasMore/total", async () => {
    const page = await adapter.getRelated("d-001", {
      object: "contacts",
      relationship: "deal_contacts",
      columns: ["name", "role"],
      limit: 3,
    });
    expect(page.rows).toHaveLength(3);
    expect(page.hasMore).toBe(true);
    expect(page.total).toBe(5);
    expect(page.rows[0]!.fields.name).toBe("Rachel Sato");
  });
});

describe("updateRecord", () => {
  it("applies a patch and persists it", async () => {
    await adapter.updateRecord("deals", "d-001", { amount: 135000, dealstage: "Negotiation" });
    const record = await adapter.getRecord("deals", "d-001", ["amount", "dealstage"]);
    expect(record.fields).toEqual({ amount: 135000, dealstage: "Negotiation" });
  });

  it("rejects invalid picklist values with the CRM's verbatim message", async () => {
    await expect(
      adapter.updateRecord("deals", "d-001", { dealstage: "Not a stage" }),
    ).rejects.toThrow(CrmValidationError);
  });

  it("enforces validation rules (loss reason on Closed lost)", async () => {
    await expect(
      adapter.updateRecord("deals", "d-001", { dealstage: "Closed lost" }),
    ).rejects.toThrow(/Loss reason is required/);
  });

  it("refuses writes to CRM read-only fields", async () => {
    await expect(
      adapter.updateRecord("deals", "d-001", { forecast_amount: 1 }),
    ).rejects.toThrow(/read-only/);
  });
});

describe("saved views / tasks / metadata", () => {
  it("saved view rows honor the view's filters", async () => {
    const page = await adapter.getViewRows("v-04");
    expect(page.total).toBe(7); // same population as golden path 1
  });

  it("completeTask marks the task done", async () => {
    const done = await adapter.completeTask("t-01");
    expect(done.status).toBe("completed");
    const open = await adapter.listTasks("me");
    expect(open.rows.find((t) => t.id === "t-01")).toBeUndefined();
  });

  it("describe metadata includes deliberate description gaps (V3 coverage)", async () => {
    const describe = await adapter.describeObject("deals");
    const withDescription = describe.fields.filter((f) => f.description);
    const without = describe.fields.filter((f) => !f.description);
    expect(withDescription.length).toBeGreaterThan(3);
    expect(without.length).toBeGreaterThan(2);
  });
});
