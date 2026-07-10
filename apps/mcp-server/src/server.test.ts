/**
 * Integration tests: a real MCP client talking to the server over an in-memory
 * transport — the M0 round-trip check plus M1's golden-path and security gates.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MockCrmAdapter } from "@cardstack/crm-adapters";
import type {
  RecordCardPayload,
  ResultsTablePayload,
  WriteReceiptPayload,
} from "@cardstack/core";
import { createCardstackServer } from "./server.js";
import { DEMO_TENANT_ID, InMemoryConfigStore } from "./config/store.js";
import { InMemoryAuditLog } from "./audit.js";

let client: Client;
let auditLog: InMemoryAuditLog;

beforeEach(async () => {
  auditLog = new InMemoryAuditLog();
  const server = createCardstackServer({
    adapter: new MockCrmAdapter(),
    configStore: new InMemoryConfigStore(),
    auditLog,
    tenantId: DEMO_TENANT_ID,
  });
  client = new Client({ name: "test-host", version: "0.0.1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

const textOf = (result: { content?: unknown }): string => {
  const content = result.content as { type: string; text?: string }[];
  return content.find((c) => c.type === "text")?.text ?? "";
};

describe("MCP Apps mechanics (SEP-1865)", () => {
  it("declares widget resources with the app mimeType", async () => {
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri);
    expect(uris).toContain("ui://cardstack/record-card");
    expect(uris).toContain("ui://cardstack/results-table");
    for (const resource of resources) {
      expect(resource.mimeType).toBe("text/html;profile=mcp-app");
    }
  });

  it("serves self-contained widget HTML", async () => {
    const { contents } = await client.readResource({ uri: "ui://cardstack/record-card" });
    const html = (contents[0] as { text: string }).text;
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<script"); // JS inlined by vite-plugin-singlefile
    expect(html).not.toMatch(/src="https?:\/\//); // no external loads
  });

  it("links UI tools to their resources via _meta.ui.resourceUri", async () => {
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    const uiOf = (t: (typeof tools)[number]) =>
      (t._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri ??
      (t._meta as Record<string, string> | undefined)?.["ui/resourceUri"];
    expect(uiOf(byName.crm_search!)).toBe("ui://cardstack/results-table");
    expect(uiOf(byName.crm_get_record!)).toBe("ui://cardstack/record-card");
    expect(uiOf(byName.crm_list_objects!)).toBeUndefined();
  });
});

describe("golden path 1: search → record card", () => {
  it("crm_search returns a model summary + hydration payload", async () => {
    const result = await client.callTool({
      name: "crm_search",
      arguments: { object: "deals", openOnly: true, minAmount: 50000 },
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain("7 open deals over $50,000");
    expect(textOf(result)).toContain("Meridian Health");

    const payload = result.structuredContent as unknown as ResultsTablePayload;
    expect(payload.kind).toBe("results-table");
    expect(payload.page.total).toBe(7);
    expect(payload.provenance).toMatchObject({ crmLabel: "HubSpot", layoutRevision: 4 });
    expect(payload.meta.amount?.description).toContain("ARR");
  });

  it("crm_get_record renders the configured card with related + activity", async () => {
    const result = await client.callTool({
      name: "crm_get_record",
      arguments: { object: "deals", id: "d-001" },
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain("Meridian Health");
    expect(textOf(result)).toContain("Field notes"); // V3: CRM descriptions reach the model

    const payload = result.structuredContent as unknown as RecordCardPayload;
    expect(payload.kind).toBe("record-card");
    expect(payload.layout.name).toBe("AE deal card");
    expect(payload.record.fields.dealname).toContain("Meridian Health");
    expect(payload.related.deal_contacts?.rows[0]?.fields.name).toBe("Rachel Sato");
    expect(payload.related.deal_contacts?.total).toBe(5);
    expect(payload.activity.length).toBeGreaterThan(0);
    // M2: writes on — every config-editable field that the CRM allows
    expect(payload.capabilities.writeEnabled).toBe(true);
    expect(payload.capabilities.editableFields).toEqual([
      "amount",
      "closedate",
      "dealstage",
      "renewal_date",
      "next_step",
    ]);
    expect(payload.provenance.connectedUser).toBe("Dan K.");
  });

  it("resolves a record by name query when id is unknown", async () => {
    const result = await client.callTool({
      name: "crm_get_record",
      arguments: { object: "deals", query: "Ardent" },
    });
    const payload = result.structuredContent as unknown as RecordCardPayload;
    expect(payload.record.id).toBe("d-002");
  });

  it("crm_get_related paginates within configured columns only", async () => {
    const result = await client.callTool({
      name: "crm_get_related",
      arguments: { object: "deals", recordId: "d-001", relationship: "deal_contacts", limit: 10 },
    });
    const { page } = result.structuredContent as {
      page: { rows: { fields: Record<string, unknown> }[]; hasMore: boolean };
    };
    expect(page.rows).toHaveLength(5);
    expect(page.hasMore).toBe(false);
    expect(Object.keys(page.rows[0]!.fields).sort()).toEqual(["jobtitle", "name", "role"]);
  });
});

describe("golden path 2: confirmed write → receipt → audit", () => {
  it("writes a patch, returns per-field receipt, and logs the audit entry", async () => {
    const result = await client.callTool({
      name: "crm_update_record",
      arguments: {
        object: "deals",
        id: "d-001",
        patch: { dealstage: "Negotiation", amount: 135000 },
      },
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain("Stage Contract sent→Negotiation");
    expect(textOf(result)).toContain("Amount 128400→135000");
    expect(textOf(result)).toContain("Written as Dan K.");

    const receipt = result.structuredContent as unknown as WriteReceiptPayload;
    expect(receipt.kind).toBe("write-receipt");
    expect(receipt.savedCount).toBe(2);
    expect(receipt.failedCount).toBe(0);
    expect(receipt.record.fields.amount).toBe(135000);

    const entries = await auditLog.list(DEMO_TENANT_ID);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      user: "Dan K.",
      object: "deals",
      recordId: "d-001",
    });
    expect(entries[0]!.changes).toContainEqual({
      field: "dealstage",
      before: "Contract sent",
      after: "Negotiation",
    });
  });

  it("partial failure: one rejected field doesn't sink the rest (design 1e)", async () => {
    const result = await client.callTool({
      name: "crm_update_record",
      arguments: {
        object: "deals",
        id: "d-001",
        patch: { dealstage: "Closed lost", amount: 130000 },
      },
    });
    expect(result.isError).toBeFalsy(); // partial failure is a receipt, not a tool error
    const receipt = result.structuredContent as unknown as WriteReceiptPayload;
    expect(receipt.savedCount).toBe(1);
    expect(receipt.failedCount).toBe(1);
    const failed = receipt.results.find((r) => !r.ok)!;
    expect(failed.field).toBe("dealstage");
    expect(failed.error).toBe("Loss reason is required when the deal stage is Closed lost.");
    expect(textOf(result)).toContain("Saved 1 of 2 changes");
    // only the saved change is audited
    const entries = await auditLog.list(DEMO_TENANT_ID);
    expect(entries[0]!.changes).toHaveLength(1);
    expect(entries[0]!.changes[0]!.field).toBe("amount");
  });

  it("refuses fields the layout doesn't mark editable (config violation)", async () => {
    for (const patch of [
      { commission: 1 }, // denylisted
      { deal_owner: "Someone Else" }, // on card but not editable
      { forecast_amount: 5 }, // CRM read-only
    ]) {
      const result = await client.callTool({
        name: "crm_update_record",
        arguments: { object: "deals", id: "d-001", patch },
      });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain("Not editable on this layout");
    }
    expect(await auditLog.list(DEMO_TENANT_ID)).toHaveLength(0);
  });

  it("crm_create_record creates, filters, and audits", async () => {
    const result = await client.callTool({
      name: "crm_create_record",
      arguments: {
        object: "deals",
        fields: { dealname: "Nimbus Cloudworks — pilot", amount: 30000, dealstage: "Discovery" },
      },
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain("Nimbus Cloudworks");
    expect(await auditLog.list(DEMO_TENANT_ID)).toHaveLength(1);
  });
});

describe("server-side security enforcement", () => {
  it("the denylisted field never appears in any payload, meta, or config", async () => {
    for (const call of [
      client.callTool({ name: "crm_search", arguments: { object: "deals" } }),
      client.callTool({ name: "crm_get_record", arguments: { object: "deals", id: "d-001" } }),
    ]) {
      const result = await call;
      expect(JSON.stringify(result.structuredContent)).not.toContain("commission");
    }
  });

  it("unknown objects fail with a helpful tool error, not a crash", async () => {
    const result = await client.callTool({
      name: "crm_search",
      arguments: { object: "invoices" },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("No layout is configured");
    expect(textOf(result)).toContain("deals");
  });
});
