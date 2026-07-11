import { describe, expect, it } from "vitest";
import { HubSpotAdapter } from "./hubspot-adapter.js";
import { CrmAuthError, CrmValidationError } from "../adapter.js";

type Handler = (url: string, init?: RequestInit) => { status: number; json: unknown } | undefined;

function fetchStub(handlers: Handler[], calls: { url: string; init?: RequestInit }[] = []) {
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    calls.push({ url, ...(init ? { init } : {}) });
    for (const handler of handlers) {
      const hit = handler(url, init);
      if (hit) {
        return new Response(JSON.stringify(hit.json), {
          status: hit.status,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    throw new Error(`unstubbed fetch: ${url}`);
  };
  return { impl: impl as typeof fetch, calls };
}

const DEAL_PROPERTIES = {
  results: [
    { name: "dealname", label: "Deal Name", type: "string", fieldType: "text", description: "The name" },
    { name: "amount", label: "Amount", type: "number", fieldType: "number", showCurrencySymbol: true },
    {
      name: "dealstage",
      label: "Deal Stage",
      type: "enumeration",
      fieldType: "select",
      options: [
        { label: "Appointment", value: "appointmentscheduled" },
        { label: "Hidden", value: "gone", hidden: true },
      ],
    },
    { name: "closedate", label: "Close Date", type: "date", fieldType: "date" },
    {
      name: "hs_forecast",
      label: "Forecast",
      type: "number",
      fieldType: "calculation_score",
      calculated: true,
      modificationMetadata: { readOnlyValue: true },
    },
    { name: "secret_internal", label: "Internal", type: "string", fieldType: "text", hidden: true },
  ],
};

describe("HubSpotAdapter", () => {
  it("maps properties describe → FieldDescribe (types, picklists, readOnly, hidden dropped)", async () => {
    const { impl } = fetchStub([
      (url) => (url.includes("/crm/v3/properties/deals") ? { status: 200, json: DEAL_PROPERTIES } : undefined),
    ]);
    const adapter = new HubSpotAdapter({ accessToken: "pat-test" }, impl);
    const describe = await adapter.describeObject("deals");

    const byApi = Object.fromEntries(describe.fields.map((f) => [f.api, f]));
    expect(byApi.secret_internal).toBeUndefined(); // hidden dropped
    expect(byApi.amount).toMatchObject({ type: "currency" });
    expect(byApi.dealstage).toMatchObject({ type: "picklist", values: ["appointmentscheduled"] });
    expect(byApi.closedate).toMatchObject({ type: "date" });
    expect(byApi.hs_forecast).toMatchObject({ readOnly: true });
    expect(byApi.dealname).toMatchObject({ description: "The name", readOnly: false });
    expect(describe.relationships.map((r) => r.api)).toContain("deal_contacts");
  });

  it("search builds filterGroups with mapped operators and returns cursor paging", async () => {
    const { impl, calls } = fetchStub([
      (url) => (url.includes("/crm/v3/properties/deals") ? { status: 200, json: DEAL_PROPERTIES } : undefined),
      (url) =>
        url.includes("/crm/v3/objects/deals/search")
          ? {
              status: 200,
              json: {
                total: 12,
                results: [{ id: "1", properties: { dealname: "Acme", amount: "5000", dealstage: null } }],
                paging: { next: { after: "10" } },
              },
            }
          : undefined,
    ]);
    const adapter = new HubSpotAdapter({ accessToken: "pat-test" }, impl);
    const page = await adapter.search("deals", {
      filters: [
        { field: "amount", op: "gt", value: 1000 },
        { field: "dealstage", op: "neq", value: "closedwon" },
      ],
      limit: 10,
    });

    const searchCall = calls.find((c) => c.url.includes("/search"))!;
    const body = JSON.parse(String(searchCall.init?.body)) as {
      filterGroups: { filters: { propertyName: string; operator: string; value: string }[] }[];
    };
    expect(body.filterGroups[0]!.filters).toEqual([
      { propertyName: "amount", operator: "GT", value: "1000" },
      { propertyName: "dealstage", operator: "NEQ", value: "closedwon" },
    ]);
    // typed coercion from string properties + cursor passthrough
    expect(page.rows[0]!.fields.amount).toBe(5000);
    expect(page.rows[0]!.fields.dealstage).toBeNull();
    expect(page).toMatchObject({ total: 12, hasMore: true, cursor: "10" });
  });

  it("getRecord uses batch/read (POST body) — property lists never hit URL limits", async () => {
    const { impl, calls } = fetchStub([
      (url) => (url.includes("/crm/v3/properties/deals") ? { status: 200, json: DEAL_PROPERTIES } : undefined),
      (url, init) =>
        url.includes("/crm/v3/objects/deals/batch/read") && init?.method === "POST"
          ? {
              status: 200,
              json: { results: [{ id: "d1", properties: { dealname: "Acme", amount: "1200" } }] },
            }
          : undefined,
    ]);
    const adapter = new HubSpotAdapter({ accessToken: "pat-test" }, impl);
    const record = await adapter.getRecord("deals", "d1", []);
    expect(record).toMatchObject({ id: "d1", fields: { dealname: "Acme", amount: 1200 } });
    const batch = calls.find((c) => c.url.includes("/batch/read"))!;
    const body = JSON.parse(String(batch.init?.body)) as { properties: string[]; inputs: { id: string }[] };
    expect(body.inputs).toEqual([{ id: "d1" }]);
    expect(body.properties).toContain("dealname"); // all describe properties, in the BODY
    expect(batch.url.length).toBeLessThan(200); // the URL stays tiny
  });

  it("maps 403 to a missing-scope error that names the fix", async () => {
    const { impl } = fetchStub([
      (url) => (url.includes("/crm/v3/properties/contacts") ? { status: 403, json: {} } : undefined),
    ]);
    const adapter = new HubSpotAdapter({ accessToken: "pat-test" }, impl);
    await expect(adapter.describeObject("contacts")).rejects.toThrow(/missing a scope/);
  });

  it("maps 400 responses to CrmValidationError and 401 to CrmAuthError", async () => {
    const { impl } = fetchStub([
      (url, init) =>
        url.includes("/crm/v3/objects/deals/bad") && init?.method === "PATCH"
          ? {
              status: 400,
              json: { message: "Amount must be positive", context: { properties: ["amount"] } },
            }
          : undefined,
      (url) => (url.includes("/crm/v3/objects/deals?limit=1") ? { status: 401, json: {} } : undefined),
    ]);
    const adapter = new HubSpotAdapter({ accessToken: "pat-bad" }, impl);
    await expect(adapter.updateRecord("deals", "bad", { amount: -1 })).rejects.toThrow(
      CrmValidationError,
    );
    await expect(adapter.validateConnection()).rejects.toThrow(CrmAuthError);
  });

  it("maps HubSpot tasks to CrmTask and completes via PATCH", async () => {
    const { impl, calls } = fetchStub([
      (url, init) =>
        url.includes("/crm/v3/objects/tasks/search") && init?.method === "POST"
          ? {
              status: 200,
              json: {
                results: [
                  {
                    id: "t1",
                    properties: {
                      hs_task_subject: "Call Acme",
                      hs_timestamp: "2026-07-15T09:00:00Z",
                      hs_task_status: "NOT_STARTED",
                    },
                  },
                ],
              },
            }
          : undefined,
      (url, init) =>
        url.includes("/crm/v3/objects/tasks/t1") && init?.method === "PATCH"
          ? { status: 200, json: {} }
          : undefined,
      (url, init) =>
        url.includes("/crm/v3/objects/tasks/t1") && (!init?.method || init.method === "GET")
          ? {
              status: 200,
              json: {
                id: "t1",
                properties: {
                  hs_task_subject: "Call Acme",
                  hs_timestamp: "2026-07-15T09:00:00Z",
                  hs_task_status: "COMPLETED",
                },
              },
            }
          : undefined,
    ]);
    const adapter = new HubSpotAdapter({ accessToken: "pat-test" }, impl);
    const tasks = await adapter.listTasks();
    expect(tasks.rows[0]).toMatchObject({ id: "t1", subject: "Call Acme", dueDate: "2026-07-15", status: "open" });

    const done = await adapter.completeTask("t1");
    expect(done.status).toBe("completed");
    const patch = calls.find((c) => c.init?.method === "PATCH")!;
    expect(JSON.parse(String(patch.init?.body))).toEqual({
      properties: { hs_task_status: "COMPLETED" },
    });
  });
});

describe("HubSpotAdapter custom objects", () => {
  const SCHEMAS = {
    results: [
      { objectTypeId: "2-12345", name: "project", labels: { singular: "Project", plural: "Projects" } },
    ],
  };

  it("discovers custom objects and offers them as related lists on core objects", async () => {
    const { impl } = fetchStub([
      (url) => (url.endsWith("/crm/v3/schemas") ? { status: 200, json: SCHEMAS } : undefined),
      (url) => (url.includes("/crm/v3/properties/deals") ? { status: 200, json: DEAL_PROPERTIES } : undefined),
    ]);
    const adapter = new HubSpotAdapter({ accessToken: "pat-test" }, impl);
    const objects = await adapter.listObjects();
    expect(objects.find((o) => o.api === "2-12345")).toMatchObject({
      labelPlural: "Projects",
      custom: true,
    });
    const describe = await adapter.describeObject("deals");
    expect(describe.relationships.map((r) => r.api)).toEqual(
      expect.arrayContaining(["deal_contacts", "deal_tickets", "deal_line_items", "deal_2-12345"]),
    );
  });

  it("degrades to core objects when the schemas scope is missing", async () => {
    const { impl } = fetchStub([
      (url) => (url.endsWith("/crm/v3/schemas") ? { status: 403, json: {} } : undefined),
      (url) => (url.includes("/crm/v3/properties/deals") ? { status: 200, json: DEAL_PROPERTIES } : undefined),
    ]);
    const adapter = new HubSpotAdapter({ accessToken: "pat-test" }, impl);
    expect((await adapter.listObjects()).map((o) => o.api)).toEqual(["deals", "contacts", "companies"]);
    const describe = await adapter.describeObject("deals");
    expect(describe.relationships.some((r) => r.api.startsWith("deal_2-"))).toBe(false);
  });
});
