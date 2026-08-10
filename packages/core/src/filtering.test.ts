import { describe, expect, it } from "vitest";
import {
  applyDenylist,
  buildCapabilities,
  filterRecord,
  isDenied,
  parseLayoutConfig,
  recordCardFieldPaths,
  type FieldDescribe,
  type LayoutConfig,
} from "./index.js";

const baseConfig = (): LayoutConfig =>
  parseLayoutConfig({
    version: 1,
    tenantId: "t_test",
    crm: "hubspot",
    object: "deals",
    listView: { columns: ["dealname", "amount", "commission"] },
    recordCard: {
      header: { title: "dealname", subtitle: "company", badge: "dealstage" },
      sections: [
        {
          label: "Details",
          fields: [
            { api: "amount", editable: true },
            { api: "commission", editable: true },
            { api: "dealstage", editable: true },
          ],
        },
        { label: "Secret", fields: [{ api: "commission" }] },
      ],
      relatedLists: [
        { object: "contacts", relationship: "deal_contacts", columns: ["name", "commission"] },
      ],
    },
    permissions: {
      writeEnabled: true,
      fieldDenylist: ["commission"],
      requireConfirmation: true,
    },
  });

describe("isDenied", () => {
  it("matches full path and leading segment", () => {
    expect(isDenied("commission", ["commission"])).toBe(true);
    expect(isDenied("commission.rate", ["commission"])).toBe(true);
    expect(isDenied("amount", ["commission"])).toBe(false);
  });
});

describe("applyDenylist", () => {
  it("strips denied fields from every surface and drops empty sections", () => {
    const sanitized = applyDenylist(baseConfig());
    expect(sanitized.listView.columns).toEqual(["dealname", "amount"]);
    expect(sanitized.recordCard.sections).toHaveLength(1);
    expect(sanitized.recordCard.sections[0]!.fields.map((f) => f.api)).toEqual([
      "amount",
      "dealstage",
    ]);
    expect(sanitized.recordCard.relatedLists[0]!.columns).toEqual(["name"]);
  });

  it("blanks the denylist itself — hidden field names never reach the widget", () => {
    expect(applyDenylist(baseConfig()).permissions.fieldDenylist).toEqual([]);
  });

  it("keeps the original config untouched", () => {
    const config = baseConfig();
    applyDenylist(config);
    expect(config.listView.columns).toContain("commission");
  });
});

describe("filterRecord", () => {
  it("keeps only allowed fields, id always survives", () => {
    const allowed = new Set(recordCardFieldPaths(applyDenylist(baseConfig())));
    const filtered = filterRecord(
      { id: "d-1", fields: { dealname: "X", amount: 5, commission: 99, other: "y" } },
      allowed,
    );
    expect(filtered.id).toBe("d-1");
    expect(filtered.fields).toEqual({ dealname: "X", amount: 5 });
  });

  it("refs and refObjects are filtered with their field — a denied lookup leaks nothing", () => {
    const allowed = new Set(["dealname", "amount"]);
    const filtered = filterRecord(
      {
        id: "d-1",
        fields: { dealname: "X", amount: 5, commission: 99 },
        refs: { amount: "a-1", commission: "c-1" },
        refObjects: { amount: "accounts", commission: "commissions" },
      },
      allowed,
    );
    expect(filtered.refs).toEqual({ amount: "a-1" });
    expect(filtered.refObjects).toEqual({ amount: "accounts" });
  });
});

describe("buildCapabilities", () => {
  const describe_: FieldDescribe[] = [
    { api: "amount", label: "Amount", type: "currency", required: false, readOnly: false },
    { api: "commission", label: "Commission", type: "currency", required: false, readOnly: false },
    { api: "dealstage", label: "Stage", type: "picklist", required: true, readOnly: true },
  ];
  const describeMap = new Map(describe_.map((f) => [f.api, f]));

  it("editable = config ∩ writes-on ∩ not-denied ∩ CRM-writable", () => {
    const caps = buildCapabilities(baseConfig(), describeMap);
    expect(caps.writeEnabled).toBe(true);
    expect(caps.editableFields).toEqual(["amount"]); // commission denied, dealstage CRM read-only
  });

  it("no editable fields when writes are off", () => {
    const config = { ...baseConfig() };
    config.permissions = { ...config.permissions, writeEnabled: false };
    expect(buildCapabilities(config, describeMap)).toEqual({
      writeEnabled: false,
      editableFields: [],
    });
  });
});

describe("LayoutConfig schema", () => {
  it("refuses requireConfirmation: false — confirmation is locked on", () => {
    const raw = baseConfig() as unknown as { permissions: Record<string, unknown> };
    raw.permissions.requireConfirmation = false;
    expect(() => parseLayoutConfig(raw)).toThrow();
  });

  it("defaults audience to \"default\" (role-based layout schema-prep)", () => {
    expect(baseConfig().audience).toBe("default");
  });
});
