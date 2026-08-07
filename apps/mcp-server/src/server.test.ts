/**
 * Integration tests: a real MCP client talking to the server over an in-memory
 * transport — the M0 round-trip check plus M1's golden-path and security gates.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MockCrmAdapter } from "@cardstack/crm-adapters";
import type {
  FlowRunPayload,
  LayoutConfig,
  RecordCardPayload,
  ResultsTablePayload,
  UpdatePreviewPayload,
  UserContext,
  WriteReceiptPayload,
} from "@cardstack/core";
import { createCardstackServer } from "./server.js";
import { DEMO_TENANT_ID, InMemoryConfigStore, demoDealsLayout } from "./config/store.js";
import { InMemoryAuditLog } from "./audit.js";
import { InMemoryPreferenceStore } from "./config/preferences.js";

let client: Client;
let auditLog: InMemoryAuditLog;

beforeEach(async () => {
  auditLog = new InMemoryAuditLog();
  const server = await createCardstackServer({
    adapter: new MockCrmAdapter(),
    configStore: new InMemoryConfigStore(),
    auditLog,
    preferences: new InMemoryPreferenceStore(),
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
    // Object display label (plural), not the raw api name.
    expect(textOf(result)).toContain("7 open Deals over $50,000");
    expect(textOf(result)).toContain("Meridian Health");

    const payload = result.structuredContent as unknown as ResultsTablePayload;
    expect(payload.kind).toBe("results-table");
    expect(payload.page.total).toBe(7);
    expect(payload.provenance).toMatchObject({ crmLabel: "HubSpot", layoutRevision: 4 });
    expect(payload.meta.amount?.description).toContain("ARR");
  });

  it("crm_aggregate returns exact grouped totals without paging rows", async () => {
    const result = await client.callTool({
      name: "crm_aggregate",
      arguments: { object: "deals", groupBy: "dealstage", openOnly: true },
    });
    expect(result.isError).toBeFalsy();
    const payload = result.structuredContent as {
      kind: string;
      buckets: { group: string | null; count: number; sum?: number | null }[];
      sumField?: string;
    };
    expect(payload.kind).toBe("aggregate");
    expect(payload.sumField).toBe("amount"); // defaults to the amount field
    // 13 open deals in the fixture (15 minus closed won/lost).
    expect(payload.buckets.reduce((n, b) => n + b.count, 0)).toBe(13);
    // No closed stages in an openOnly grouping.
    expect(payload.buckets.some((b) => b.group === "Closed won" || b.group === "Closed lost")).toBe(false);
    // Sums are real numbers, so "total pipeline" never depends on pagination.
    for (const b of payload.buckets) expect(typeof b.sum).toBe("number");
  });

  it("drill-through: unconfigured object gets a generated read-only all-fields card", async () => {
    // "contacts" has no configured layout in this fixture — clicking a related
    // contact from a deal card must open a generated card, not an error.
    const result = await client.callTool({
      name: "crm_get_record",
      arguments: { object: "contacts", id: "c-001" },
    });
    expect(result.isError).toBeFalsy();
    const payload = result.structuredContent as unknown as RecordCardPayload;
    expect(payload.kind).toBe("record-card");
    expect(payload.layout.generatedFallback).toBe(true);
    expect(payload.layout.permissions.writeEnabled).toBe(false);
    expect(payload.capabilities.editableFields).toEqual([]);
    // All fields, not a curated subset.
    expect(payload.layout.recordCard.sections).toHaveLength(1);
    expect(Object.keys(payload.meta).length).toBeGreaterThan(3);
    expect(payload.record.fields.name).toBe("Rachel Sato");
  });

  it("drill-through fallback is gated to objects reachable from configured layouts", async () => {
    // "products" isn't referenced by any configured card — the generic path
    // must NOT invert the allowlist into allow-everything.
    const result = await client.callTool({
      name: "crm_get_record",
      arguments: { object: "products", id: "p-001" },
    });
    expect(result.isError).toBeTruthy();
    expect(textOf(result)).toContain("isn't referenced by any configured card");
  });

  it("drill-through reaches a reference field's target object (company lookup)", async () => {
    // The deals card shows `company` (reference → companies), which makes
    // companies reachable for the generated read-only fallback.
    const result = await client.callTool({
      name: "crm_get_record",
      arguments: { object: "companies", id: "co-01" },
    });
    expect(result.isError).toBeFalsy();
    const payload = result.structuredContent as unknown as RecordCardPayload;
    expect(payload.layout.generatedFallback).toBe(true);
    expect(payload.record.fields.name).toBe("Meridian Health Systems");
  });

  it("drill-through fallback refuses name search (id only — no enumeration)", async () => {
    const result = await client.callTool({
      name: "crm_get_record",
      arguments: { object: "contacts", query: "Rachel" },
    });
    expect(result.isError).toBeTruthy();
    expect(textOf(result)).toContain("Pass a record id");
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
      "company",
    ]);
    // Reference field: resolved name for display, id + target for drill-through.
    expect(payload.record.fields.company).toBe("Meridian Health Systems");
    expect(payload.record.refs?.company).toBe("co-01");
    expect(payload.record.refObjects?.company).toBe("companies");
    expect(payload.provenance.connectedUser).toBe("Demo rep");
  });

  it("resolves a record by name query when id is unknown", async () => {
    const result = await client.callTool({
      name: "crm_get_record",
      arguments: { object: "deals", query: "Ardent" },
    });
    const payload = result.structuredContent as unknown as RecordCardPayload;
    expect(payload.record.id).toBe("d-002");
  });

  it("crm_lookup_search returns id + label options for a reference target", async () => {
    const result = await client.callTool({
      name: "crm_lookup_search",
      arguments: { object: "companies", query: "meridian" },
    });
    expect(result.isError).toBeFalsy();
    const payload = result.structuredContent as unknown as {
      kind: string;
      object: string;
      options: { id: string; label: string }[];
    };
    expect(payload.kind).toBe("lookup-options");
    expect(payload.options).toEqual([{ id: "co-01", label: "Meridian Health Systems" }]);
  });

  it("crm_lookup_search is gated to objects reachable from configured layouts", async () => {
    const result = await client.callTool({
      name: "crm_lookup_search",
      arguments: { object: "products", query: "anything" },
    });
    expect(result.isError).toBeTruthy();
    expect(textOf(result)).toContain("isn't referenced by any configured card");
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

/**
 * The confirmation diff is the product's spine (CLAUDE.md hard rule 8). These
 * cover the part the server can actually enforce: that "a rep confirmed this"
 * in the audit log is a verified finding rather than a caller's assertion.
 */
describe("confirmation provenance", () => {
  const preview = async (patch: Record<string, unknown>) => {
    const result = await client.callTool({
      name: "crm_preview_update",
      arguments: { object: "deals", id: "d-001", patch },
    });
    return result.structuredContent as unknown as UpdatePreviewPayload;
  };

  it("previews a diff without writing anything", async () => {
    const payload = await preview({ amount: 135000 });
    expect(payload.kind).toBe("update-preview");
    expect(payload.changes).toEqual([
      { field: "amount", label: "Amount", before: 128400, after: 135000 },
    ]);
    expect(payload.confirmToken).toBeTruthy();

    // Nothing written, nothing logged.
    const record = await client.callTool({
      name: "crm_get_record",
      arguments: { object: "deals", id: "d-001" },
    });
    expect((record.structuredContent as unknown as RecordCardPayload).record.fields.amount).toBe(
      128400,
    );
    expect(await auditLog.list(DEMO_TENANT_ID)).toHaveLength(0);
  });

  it("records a token-backed write as rep-confirmed", async () => {
    const { confirmToken } = await preview({ amount: 135000 });
    const result = await client.callTool({
      name: "crm_update_record",
      arguments: { object: "deals", id: "d-001", patch: { amount: 135000 }, confirmToken },
    });
    expect(result.isError).toBeFalsy();
    const [entry] = await auditLog.list(DEMO_TENANT_ID);
    expect(entry!.confirmation?.via).toBe("widget");
    expect(entry!.confirmation?.confirmationId).toBeTruthy();
    expect(entry!.confirmation?.previewedAt).toBeTruthy();
  });

  it("refuses to write when the patch differs from what was confirmed", async () => {
    // The rep approved 135000; the caller submits ten times that.
    const { confirmToken } = await preview({ amount: 135000 });
    const result = await client.callTool({
      name: "crm_update_record",
      arguments: { object: "deals", id: "d-001", patch: { amount: 1350000 }, confirmToken },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("doesn't match the changes being written");
    expect(await auditLog.list(DEMO_TENANT_ID)).toHaveLength(0);

    const record = await client.callTool({
      name: "crm_get_record",
      arguments: { object: "deals", id: "d-001" },
    });
    expect((record.structuredContent as unknown as RecordCardPayload).record.fields.amount).toBe(
      128400,
    );
  });

  it("refuses a forged token rather than downgrading it to model-initiated", async () => {
    const result = await client.callTool({
      name: "crm_update_record",
      arguments: {
        object: "deals",
        id: "d-001",
        patch: { amount: 135000 },
        confirmToken: "bogus.token",
      },
    });
    expect(result.isError).toBe(true);
    expect(await auditLog.list(DEMO_TENANT_ID)).toHaveLength(0);
  });

  it("refuses a token minted for a different record", async () => {
    const { confirmToken } = await preview({ amount: 135000 });
    const result = await client.callTool({
      name: "crm_update_record",
      arguments: { object: "deals", id: "d-002", patch: { amount: 135000 }, confirmToken },
    });
    expect(result.isError).toBe(true);
    expect(await auditLog.list(DEMO_TENANT_ID)).toHaveLength(0);
  });

  it("preview enforces the same gauntlet as the write (no token for a non-editable field)", async () => {
    const result = await client.callTool({
      name: "crm_preview_update",
      arguments: { object: "deals", id: "d-001", patch: { createdate: "2020-01-01" } },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Not editable on this layout");
  });

  it("will not mint a token for a no-op diff", async () => {
    const result = await client.callTool({
      name: "crm_preview_update",
      arguments: { object: "deals", id: "d-001", patch: { amount: 128400 } },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Nothing to change");
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
    expect(textOf(result)).toContain("Written as Demo rep");

    const receipt = result.structuredContent as unknown as WriteReceiptPayload;
    expect(receipt.kind).toBe("write-receipt");
    expect(receipt.savedCount).toBe(2);
    expect(receipt.failedCount).toBe(0);
    expect(receipt.record.fields.amount).toBe(135000);

    const entries = await auditLog.list(DEMO_TENANT_ID);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      user: "Demo rep",
      actor: { userId: "demo-rep", name: "Demo rep" },
      object: "deals",
      recordId: "d-001",
    });
    expect(entries[0]!.changes).toContainEqual({
      field: "dealstage",
      before: "Contract sent",
      after: "Negotiation",
    });
  });

  it("logs a write with no confirm token as model-initiated", async () => {
    await client.callTool({
      name: "crm_update_record",
      arguments: { object: "deals", id: "d-001", patch: { amount: 135000 } },
    });
    const [entry] = await auditLog.list(DEMO_TENANT_ID);
    expect(entry!.confirmation).toEqual({ via: "model" });
  });

  it("lookup write: patch carries an ID, receipt shows the record's NAME", async () => {
    const result = await client.callTool({
      name: "crm_update_record",
      arguments: { object: "deals", id: "d-001", patch: { company: "co-02" } },
    });
    expect(result.isError).toBeFalsy();
    const receipt = result.structuredContent as unknown as WriteReceiptPayload;
    expect(receipt.savedCount).toBe(1);
    const change = receipt.results[0]!;
    expect(change.before).toBe("Meridian Health Systems");
    expect(change.after).toBe("Ardent Logistics"); // resolved name, not "co-02"
    // The refreshed record re-ships the new drill-through ref.
    expect(receipt.record.fields.company).toBe("Ardent Logistics");
    expect(receipt.record.refs?.company).toBe("co-02");
  });

  it("lookup write: an unknown reference id fails like a CRM FK violation", async () => {
    const result = await client.callTool({
      name: "crm_update_record",
      arguments: { object: "deals", id: "d-001", patch: { company: "co-99" } },
    });
    expect(result.isError).toBeFalsy(); // per-field failure → receipt
    const receipt = result.structuredContent as unknown as WriteReceiptPayload;
    expect(receipt.failedCount).toBe(1);
    expect(receipt.results[0]!.error).toContain('No company matches "co-99"');
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

describe("M2.5: saved views (crm_list_view)", () => {
  it("keeps the tool description static — no dynamic view names baked in", async () => {
    // Clients cache descriptions at load; a baked-in view list goes stale the
    // moment exposures change (seen live: "No saved views are exposed" while
    // views existed). Routing guidance stays; the live list rides in responses.
    const { tools } = await client.listTools();
    const listView = tools.find((t) => t.name === "crm_list_view")!;
    expect(listView.description).toContain("my deals"); // static routing guidance
    expect(listView.description).not.toContain('"My open deals"');
    expect(listView.description).not.toContain("[default]");
    expect(listView.description).not.toContain("Big deals");
  });

  it("resolves a unique alias directly to the view's rows", async () => {
    const result = await client.callTool({
      name: "crm_list_view",
      arguments: { object: "deals", query: "renewals" },
    });
    expect(result.isError).toBeFalsy();
    const payload = result.structuredContent as unknown as ResultsTablePayload;
    expect(payload.kind).toBe("results-table");
    expect(payload.savedViewName).toBe("Renewals — next 90 days");
    expect(payload.savedViewFilterSummary).toContain("90 days");
  });

  it("falls back to the default view when no query is given", async () => {
    const result = await client.callTool({
      name: "crm_list_view",
      arguments: { object: "deals" },
    });
    const payload = result.structuredContent as unknown as ResultsTablePayload;
    expect(payload.savedViewName).toBe("My open deals");
  });

  it("broad possessive ask resolves to the default view, not an error", async () => {
    // Seen live: "my opportunities" errored though All Opportunities existed.
    const result = await client.callTool({
      name: "crm_list_view",
      arguments: { object: "deals", query: "my deals" },
    });
    expect(result.isError).toBeFalsy();
    const payload = result.structuredContent as unknown as ResultsTablePayload;
    expect(payload.kind).toBe("results-table");
    expect(payload.savedViewName).toBe("My open deals");
  });

  it("broad ask crosses CRM vocabulary via synonyms (opportunities→deals)", async () => {
    const result = await client.callTool({
      name: "crm_list_view",
      arguments: { object: "deals", query: "my opportunities" },
    });
    expect(result.isError).toBeFalsy();
    const payload = result.structuredContent as unknown as ResultsTablePayload;
    expect(payload.savedViewName).toBe("My open deals");
  });

  it("ambiguous ask → picker payload; explicit pick is remembered (5b)", async () => {
    const ambiguous = await client.callTool({
      name: "crm_list_view",
      arguments: { object: "deals", query: "deals" },
    });
    expect(ambiguous.isError).toBeFalsy();
    const picker = ambiguous.structuredContent as {
      kind: string;
      options: { viewId: string; name: string }[];
    };
    expect(picker.kind).toBe("view-picker");
    expect(picker.options).toHaveLength(3);
    expect(textOf(ambiguous)).toContain("matches 3 saved views");

    // The widget sends the pick back with the original query…
    const picked = await client.callTool({
      name: "crm_list_view",
      arguments: { object: "deals", view: "v-02", query: "deals" },
    });
    expect(
      (picked.structuredContent as unknown as ResultsTablePayload).savedViewName,
    ).toBe("Closing this quarter");

    // …and the same phrasing now resolves directly, no picker.
    const again = await client.callTool({
      name: "crm_list_view",
      arguments: { object: "deals", query: "Deals" },
    });
    const resolved = again.structuredContent as unknown as ResultsTablePayload;
    expect(resolved.kind).toBe("results-table");
    expect(resolved.savedViewName).toBe("Closing this quarter");
  });

  it("unknown asks error with the exposed-view list and point to crm_search", async () => {
    const result = await client.callTool({
      name: "crm_list_view",
      arguments: { object: "deals", query: "flibbertigibbet" },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("crm_search");
    expect(textOf(result)).toContain("My open deals");
  });

  it("saved-view rows honor the denylist like any other payload", async () => {
    const result = await client.callTool({
      name: "crm_list_view",
      arguments: { object: "deals", query: "my deals" },
    });
    expect(JSON.stringify(result.structuredContent)).not.toContain("commission");
  });
});

describe("M4: home card (crm_home + crm_complete_task)", () => {
  it("renders the launcher: list tiles with counts, recents, follow-ups", async () => {
    const result = await client.callTool({ name: "crm_home", arguments: {} });
    expect(result.isError).toBeFalsy();
    const payload = result.structuredContent as {
      kind: string;
      lists: { name: string; count: number }[];
      recent: unknown[];
      tasks: { id: string }[];
      capabilities: { writeEnabled: boolean };
    };
    expect(payload.kind).toBe("home-card");
    expect(payload.lists.length).toBeGreaterThanOrEqual(3);
    expect(payload.lists.find((l) => l.name === "My open deals")?.count).toBe(13);
    expect(payload.recent.length).toBe(3);
    expect(payload.tasks.length).toBeGreaterThan(0);
    expect(payload.capabilities.writeEnabled).toBe(true);
    expect(textOf(result)).toContain("overdue");
  });

  it("linked to the home-card widget resource", async () => {
    const { tools } = await client.listTools();
    const home = tools.find((t) => t.name === "crm_home")!;
    const ui = (home._meta as { ui?: { resourceUri?: string } })?.ui?.resourceUri;
    expect(ui).toBe("ui://cardstack/home-card");
    const { contents } = await client.readResource({ uri: "ui://cardstack/home-card" });
    expect((contents[0] as { text: string }).text).toContain("<!DOCTYPE html>");
  });

  it("task check-off is a logged write and drops off the open list", async () => {
    const done = await client.callTool({ name: "crm_complete_task", arguments: { id: "t-01" } });
    expect(done.isError).toBeFalsy();
    expect(textOf(done)).toContain("Countersign Meridian renewal");
    expect(textOf(done)).toContain("Written as Demo rep");

    const entries = await auditLog.list(DEMO_TENANT_ID);
    expect(entries[0]).toMatchObject({ object: "tasks", recordId: "t-01" });

    const home = await client.callTool({ name: "crm_home", arguments: {} });
    const payload = home.structuredContent as { tasks: { id: string }[] };
    expect(payload.tasks.find((t) => t.id === "t-01")).toBeUndefined();
  });

  it("a check-off with no token is logged as model-initiated", async () => {
    await client.callTool({ name: "crm_complete_task", arguments: { id: "t-01" } });
    const [entry] = await auditLog.list(DEMO_TENANT_ID);
    expect(entry!.confirmation).toEqual({ via: "model" });
  });

  it("a token-backed check-off is logged as rep-confirmed", async () => {
    const preview = await client.callTool({
      name: "crm_preview_complete_task",
      arguments: { id: "t-01" },
    });
    // Preview writes nothing.
    expect(await auditLog.list(DEMO_TENANT_ID)).toHaveLength(0);
    const { confirmToken } = preview.structuredContent as { confirmToken: string };
    await client.callTool({
      name: "crm_complete_task",
      arguments: { id: "t-01", confirmToken },
    });
    const [entry] = await auditLog.list(DEMO_TENANT_ID);
    expect(entry!.confirmation?.via).toBe("widget");
  });

  it("a token minted for one task cannot check off another", async () => {
    const preview = await client.callTool({
      name: "crm_preview_complete_task",
      arguments: { id: "t-01" },
    });
    const { confirmToken } = preview.structuredContent as { confirmToken: string };
    const done = await client.callTool({
      name: "crm_complete_task",
      arguments: { id: "t-02", confirmToken },
    });
    expect(done.isError).toBe(true);
    expect(await auditLog.list(DEMO_TENANT_ID)).toHaveLength(0);
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

describe("connection gate (empty canvas)", () => {
  it("every tool refuses when the tenant's CRM is disconnected", async () => {
    const configStore = new InMemoryConfigStore();
    await configStore.setConnection({
      tenantId: DEMO_TENANT_ID,
      status: "disconnected",
      crm: "hubspot",
      label: "mock portal",
      changedAt: new Date().toISOString(),
    });
    const server = await createCardstackServer({
      adapter: new MockCrmAdapter(),
      configStore,
      auditLog: new InMemoryAuditLog(),
      preferences: new InMemoryPreferenceStore(),
      tenantId: DEMO_TENANT_ID,
    });
    const offline = new Client({ name: "test-host", version: "0.0.1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), offline.connect(clientTransport)]);

    for (const call of [
      { name: "crm_home", arguments: {} },
      { name: "crm_search", arguments: { object: "deals" } },
      { name: "crm_update_record", arguments: { object: "deals", id: "d-001", patch: { amount: 1 } } },
    ]) {
      const result = await offline.callTool(call);
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain("No CRM is connected");
    }
  });

  it("requires per-user auth when Salesforce runtime OAuth is missing", async () => {
    const configStore = new InMemoryConfigStore();
    await configStore.setConnection({
      tenantId: DEMO_TENANT_ID,
      status: "connected",
      crm: "salesforce",
      label: "admin OAuth",
      changedAt: new Date().toISOString(),
      credentials: { authType: "oauth", clientId: "app", clientSecret: "secret", refreshToken: "admin" },
    });
    const server = await createCardstackServer({
      adapter: new MockCrmAdapter(),
      configStore,
      auditLog: new InMemoryAuditLog(),
      preferences: new InMemoryPreferenceStore(),
      tenantId: DEMO_TENANT_ID,
      runtimeAuth: {
        missingUserAuth: true,
        crmLabel: "Salesforce",
        connectUrl: "http://localhost:3002/api/user-connections/salesforce/oauth/start",
      },
    });
    const missing = new Client({ name: "test-host", version: "0.0.1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), missing.connect(clientTransport)]);

    const result = await missing.callTool({
      name: "crm_search",
      arguments: { object: "deals" },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Connect your Salesforce account");
    expect(textOf(result)).toContain("/api/user-connections/salesforce/oauth/start");
  });
});

describe("custom lists (Cardstack-native filters)", () => {
  it("an exposed custom list resolves in crm_list_view and runs via search", async () => {
    const configStore = new InMemoryConfigStore();
    const exposures = (await configStore.getViewExposuresConfig(DEMO_TENANT_ID, "deals"))!;
    await configStore.setViewExposures({
      ...exposures,
      customLists: [
        {
          id: "cl-big",
          name: "Big open deals",
          filters: [
            { field: "amount", op: "gt", value: 100000 },
            { field: "dealstage", op: "neq", value: "Closed won" },
            { field: "dealstage", op: "neq", value: "Closed lost" },
          ],
          filterSummary: "Amount > $100k · open",
          visibility: "workspace",
        },
      ],
      views: [
        ...exposures.views,
        { viewId: "cl-big", exposed: true, aliases: ["big deals list"], isDefault: false },
      ],
    });
    const server = await createCardstackServer({
      adapter: new MockCrmAdapter(),
      configStore,
      auditLog: new InMemoryAuditLog(),
      preferences: new InMemoryPreferenceStore(),
      tenantId: DEMO_TENANT_ID,
    });
    const custom = new Client({ name: "test-host", version: "0.0.1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), custom.connect(clientTransport)]);

    const result = await custom.callTool({
      name: "crm_list_view",
      arguments: { object: "deals", query: "big deals list" },
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain("Big open deals");
    const payload = result.structuredContent as ResultsTablePayload;
    expect(payload.savedViewId).toBe("cl-big");
    expect(payload.page.rows.length).toBeGreaterThan(0);
    for (const row of payload.page.rows) {
      expect(Number(row.fields.amount)).toBeGreaterThan(100000);
    }
  });

  it("filters private custom lists to the creating app user", async () => {
    const configStore = new InMemoryConfigStore();
    const exposures = (await configStore.getViewExposuresConfig(DEMO_TENANT_ID, "deals"))!;
    await configStore.setViewExposures({
      ...exposures,
      customLists: [
        {
          id: "cl-private",
          name: "Dana's save list",
          filters: [{ field: "amount", op: "gt", value: 100000 }],
          filterSummary: "Amount > $100k",
          visibility: "private",
          createdByUserId: "dana",
          createdByName: "Dana",
        },
      ],
      views: [
        ...exposures.views,
        { viewId: "cl-private", exposed: true, aliases: ["dana saves"], isDefault: false },
      ],
    });
    const makeClient = async (userContext: UserContext): Promise<Client> => {
      const server = await createCardstackServer({
        adapter: new MockCrmAdapter(),
        configStore,
        auditLog: new InMemoryAuditLog(),
        preferences: new InMemoryPreferenceStore(),
        tenantId: DEMO_TENANT_ID,
        userContext,
      });
      const c = new Client({ name: "test-host", version: "0.0.1" });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await Promise.all([server.connect(serverTransport), c.connect(clientTransport)]);
      return c;
    };

    const dana = await makeClient({
      tenantId: DEMO_TENANT_ID,
      userId: "dana",
      name: "Dana",
      audience: "default",
    });
    const lee = await makeClient({
      tenantId: DEMO_TENANT_ID,
      userId: "lee",
      name: "Lee",
      audience: "default",
    });

    const visible = await dana.callTool({
      name: "crm_list_view",
      arguments: { object: "deals", query: "dana saves" },
    });
    expect(visible.isError).toBeFalsy();
    expect(textOf(visible)).toContain("Dana's save list");

    const hidden = await lee.callTool({
      name: "crm_list_view",
      arguments: { object: "deals", query: "dana saves" },
    });
    expect(hidden.isError).toBe(true);
    expect(textOf(hidden)).toContain("No exposed view matches");
  });
});

describe("flow runtime (HANDOFF rung)", () => {
  async function serverWithFlowLayout() {
    const configStore = new InMemoryConfigStore();
    const layout: LayoutConfig = {
      ...structuredClone(demoDealsLayout),
      recordCard: {
        ...structuredClone(demoDealsLayout.recordCard),
        actions: [
          ...structuredClone(demoDealsLayout.recordCard.actions),
          {
            type: "screen_flow",
            flowApiName: "Renewal_Playbook",
            label: "Run renewal playbook",
            embed: "auto",
            inputs: {
              recordId: { source: "context", key: "recordId" },
              renewalDate: {
                source: "ask",
                prompt: "What is the renewal date?",
                required: true,
                valueType: "date",
              },
            },
          },
        ],
      },
    };
    await configStore.saveDraft(layout);
    await configStore.publish(DEMO_TENANT_ID, "deals");
    const server = await createCardstackServer({
      adapter: new MockCrmAdapter(),
      configStore,
      auditLog: new InMemoryAuditLog(),
      preferences: new InMemoryPreferenceStore(),
      tenantId: DEMO_TENANT_ID,
    });
    const local = new Client({ name: "test-host", version: "0.0.1" });
    const [c, s] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(s), local.connect(c)]);
    return local;
  }

  it("crm_flow_start withholds launch until the required ask input is collected", async () => {
    const local = await serverWithFlowLayout();
    const start = await local.callTool({
      name: "crm_flow_start",
      arguments: { object: "deals", recordId: "d-001", flowApiName: "Renewal_Playbook" },
    });
    expect(start.isError).toBeFalsy();
    const p = start.structuredContent as unknown as FlowRunPayload;
    expect(p.kind).toBe("flow-run");
    expect(p.status).toBe("needs-input");
    expect(p.launchUrl).toBeNull(); // launch withheld while a required input is missing
    expect(p.pendingInputs.map((i) => i.name)).toContain("renewalDate");
    expect(p.resolvedInputs.find((i) => i.name === "recordId")?.value).toBe("d-001");
    expect(textOf(start)).toContain("crm_flow_continue");
  });

  it("crm_flow_continue resolves the ask and exposes the CRM launch URL", async () => {
    const local = await serverWithFlowLayout();
    const start = await local.callTool({
      name: "crm_flow_start",
      arguments: { object: "deals", recordId: "d-001", flowApiName: "Renewal_Playbook" },
    });
    const sid = (start.structuredContent as unknown as FlowRunPayload).actionSessionId;
    const cont = await local.callTool({
      name: "crm_flow_continue",
      arguments: {
        object: "deals",
        recordId: "d-001",
        flowApiName: "Renewal_Playbook",
        actionSessionId: sid,
        answers: { renewalDate: "2026-08-01" },
      },
    });
    const p = cont.structuredContent as unknown as FlowRunPayload;
    expect(p.status).toBe("ready");
    expect(p.launchUrl).toContain("/flow/Renewal_Playbook");
    expect(p.pendingInputs).toHaveLength(0);
    expect(p.resolvedInputs.map((i) => i.name)).toEqual(
      expect.arrayContaining(["recordId", "renewalDate"]),
    );
  });

  it("crm_flow_start rejects a flow not configured on the card", async () => {
    const local = await serverWithFlowLayout();
    const result = await local.callTool({
      name: "crm_flow_start",
      arguments: { object: "deals", recordId: "d-001", flowApiName: "Not_Configured" },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("not configured");
  });

  async function serverWithDisabledFlowLayout() {
    const configStore = new InMemoryConfigStore();
    const layout: LayoutConfig = {
      ...structuredClone(demoDealsLayout),
      recordCard: {
        ...structuredClone(demoDealsLayout.recordCard),
        actions: [
          ...structuredClone(demoDealsLayout.recordCard.actions),
          {
            type: "screen_flow",
            flowApiName: "Renewal_Playbook",
            label: "Run renewal playbook",
            embed: "auto",
            enabled: false,
            inputs: { recordId: { source: "context", key: "recordId" } },
          },
        ],
      },
    };
    await configStore.saveDraft(layout);
    await configStore.publish(DEMO_TENANT_ID, "deals");
    const server = await createCardstackServer({
      adapter: new MockCrmAdapter(),
      configStore,
      auditLog: new InMemoryAuditLog(),
      preferences: new InMemoryPreferenceStore(),
      tenantId: DEMO_TENANT_ID,
    });
    const local = new Client({ name: "test-host", version: "0.0.1" });
    const [c, s] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(s), local.connect(c)]);
    return local;
  }

  it("crm_flow_start refuses a flow that is configured but disabled", async () => {
    const local = await serverWithDisabledFlowLayout();
    const result = await local.callTool({
      name: "crm_flow_start",
      arguments: { object: "deals", recordId: "d-001", flowApiName: "Renewal_Playbook" },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("not configured");
  });

  it("crm_flow_continue refuses a disabled flow too", async () => {
    const local = await serverWithDisabledFlowLayout();
    const result = await local.callTool({
      name: "crm_flow_continue",
      arguments: {
        object: "deals",
        recordId: "d-001",
        flowApiName: "Renewal_Playbook",
        actionSessionId: "s-1",
      },
    });
    expect(result.isError).toBe(true);
  });

  async function serverWithDisabledQuickActionLayout() {
    const configStore = new InMemoryConfigStore();
    const layout: LayoutConfig = {
      ...structuredClone(demoDealsLayout),
      recordCard: {
        ...structuredClone(demoDealsLayout.recordCard),
        actions: [
          ...structuredClone(demoDealsLayout.recordCard.actions),
          {
            type: "quick_action",
            actionApiName: "LogACall",
            label: "Log a call",
            enabled: false,
          },
        ],
      },
    };
    await configStore.saveDraft(layout);
    await configStore.publish(DEMO_TENANT_ID, "deals");
    const server = await createCardstackServer({
      adapter: new MockCrmAdapter(),
      configStore,
      auditLog: new InMemoryAuditLog(),
      preferences: new InMemoryPreferenceStore(),
      tenantId: DEMO_TENANT_ID,
    });
    const local = new Client({ name: "test-host", version: "0.0.1" });
    const [c, s] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(s), local.connect(c)]);
    return local;
  }

  it("crm_quick_action_start refuses a quick action that is configured but disabled", async () => {
    const local = await serverWithDisabledQuickActionLayout();
    const result = await local.callTool({
      name: "crm_quick_action_start",
      arguments: { object: "deals", recordId: "d-001", actionApiName: "LogACall" },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("not configured");
  });
});

/**
 * The NATIVE rung — the interpreter actually running an org flow's metadata and
 * doing the writes. Needs an adapter that can supply a flow definition; the mock
 * portal has none, so these build one from the same fixture the interpreter's
 * own tests use.
 */
describe("flow runtime (NATIVE rung): confirmation is server-verified", () => {
  const flowDef = JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL("../../../packages/core/src/__fixtures__/test-screen-flow.json", import.meta.url),
      ),
      "utf8",
    ),
  ) as unknown;

  async function nativeFlowServer() {
    const adapter = new MockCrmAdapter() as MockCrmAdapter & {
      getFlowDefinition?: (name: string) => Promise<unknown>;
    };
    adapter.getFlowDefinition = async (name: string) =>
      name === "Test_Screen_Flow" ? flowDef : null;
    // The fixture creates a Task, which the mock portal has no object for —
    // without this the interpreter (correctly) degrades to handoff instead of
    // reaching the write we're here to check.
    (adapter as unknown as { createRecord: unknown }).createRecord = async (
      _object: string,
      fields: Record<string, unknown>,
    ) => ({ id: "00T_NEW", fields });

    const configStore = new InMemoryConfigStore();
    const layout: LayoutConfig = {
      ...structuredClone(demoDealsLayout),
      recordCard: {
        ...structuredClone(demoDealsLayout.recordCard),
        actions: [
          {
            type: "screen_flow",
            flowApiName: "Test_Screen_Flow",
            label: "Run test flow",
            embed: "native",
            inputs: { recordId: { source: "context", key: "recordId" } },
          },
        ],
      },
    };
    await configStore.saveDraft(layout);
    await configStore.publish(DEMO_TENANT_ID, "deals");
    const server = await createCardstackServer({
      adapter,
      configStore,
      auditLog,
      preferences: new InMemoryPreferenceStore(),
      tenantId: DEMO_TENANT_ID,
    });
    const local = new Client({ name: "test-host", version: "0.0.1" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(st), local.connect(ct)]);
    return local;
  }

  const flowArgs = {
    object: "deals",
    recordId: "d-001",
    flowApiName: "Test_Screen_Flow",
    actionSessionId: "s-1",
  };

  /**
   * Interview state is not a cursor — it carries pendingWrite and the answers a
   * write executes with, so a forgeable one is a forgeable WRITE AUTHORIZATION.
   * It used to pass through unsigned whenever CARDSTACK_ENCRYPTION_KEY was
   * absent; it now shares the confirm token's never-degrading signer, so both
   * write paths have one security floor.
   */
  it("rejects a forged interview state even with no encryption key set", async () => {
    delete process.env.CARDSTACK_ENCRYPTION_KEY;
    const local = await nativeFlowServer();
    const forged = Buffer.from(
      JSON.stringify({ frames: [{ pendingWrite: "Create_Order", answers: {} }] }),
      "utf8",
    ).toString("base64url");
    const result = await local.callTool({
      name: "crm_flow_continue",
      arguments: { ...flowArgs, answers: {}, interviewState: forged, confirmWrite: true },
    });
    expect(textOf(result)).toMatch(/failed verification/i);
    expect(await auditLog.list(DEMO_TENANT_ID)).toHaveLength(0);
  });

  it("interprets the flow, gates the write, and logs it as rep-confirmed", async () => {
    const local = await nativeFlowServer();
    const start = await local.callTool({ name: "crm_flow_start", arguments: flowArgs });
    let payload = start.structuredContent as unknown as FlowRunPayload;
    expect(payload.status).toBe("in-progress"); // rendered natively, not handed off

    const step = async (answers: Record<string, unknown>, confirmWrite?: boolean) => {
      const result = await local.callTool({
        name: "crm_flow_continue",
        arguments: {
          ...flowArgs,
          answers,
          interviewState: payload.interviewState,
          ...(confirmWrite !== undefined ? { confirmWrite } : {}),
        },
      });
      payload = result.structuredContent as unknown as FlowRunPayload;
      return payload;
    };

    // Intake → account table → rush confirm → the write pause.
    await step({ CustomerName: "Jane", Quantity: 3, RushOrder: true, Priority: "High" });
    await step({ Account_Table: ["001A"] });
    const pause = await step({});
    // The interpreter pauses for confirmation and has written nothing yet.
    expect(pause.status).toBe("confirm-write");
    expect(await auditLog.list(DEMO_TENANT_ID)).toHaveLength(0);

    await step({}, true);
    const [entry] = await auditLog.list(DEMO_TENANT_ID);
    expect(entry).toBeDefined();
    // The interpreter's write is rep-confirmed by the same standard as
    // crm_update_record's token: it is unreachable without a signed state
    // carrying pendingWrite plus an explicit confirmWrite.
    expect(entry!.confirmation?.via).toBe("widget");
  });

  it("declining at the confirm pause writes nothing", async () => {
    const local = await nativeFlowServer();
    const start = await local.callTool({ name: "crm_flow_start", arguments: flowArgs });
    let payload = start.structuredContent as unknown as FlowRunPayload;
    const step = async (answers: Record<string, unknown>, confirmWrite?: boolean) => {
      const result = await local.callTool({
        name: "crm_flow_continue",
        arguments: {
          ...flowArgs,
          answers,
          interviewState: payload.interviewState,
          ...(confirmWrite !== undefined ? { confirmWrite } : {}),
        },
      });
      payload = result.structuredContent as unknown as FlowRunPayload;
      return payload;
    };
    await step({ CustomerName: "Jane", Quantity: 3, RushOrder: true, Priority: "High" });
    await step({ Account_Table: ["001A"] });
    await step({});
    await step({}, false);
    expect(await auditLog.list(DEMO_TENANT_ID)).toHaveLength(0);
  });
});
