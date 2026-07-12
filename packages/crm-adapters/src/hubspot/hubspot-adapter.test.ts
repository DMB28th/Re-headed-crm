import { describe, expect, it } from "vitest";
import { HubSpotAdapter } from "./hubspot-adapter.js";
import { CrmAuthError, CrmValidationError } from "../adapter.js";

type Handler = (
  url: string,
  init?: RequestInit,
) => { status: number; json: unknown; headers?: Record<string, string> } | undefined;

function fetchStub(handlers: Handler[], calls: { url: string; init?: RequestInit }[] = []) {
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    calls.push({ url, ...(init ? { init } : {}) });
    for (const handler of handlers) {
      const hit = handler(url, init);
      if (hit) {
        return new Response(JSON.stringify(hit.json), {
          status: hit.status,
          headers: { "Content-Type": "application/json", ...hit.headers },
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

  it("degrades to core objects when the schemas scope is missing — and says WHY", async () => {
    const { impl } = fetchStub([
      (url) => (url.endsWith("/crm/v3/schemas") ? { status: 403, json: {} } : undefined),
      (url) => (url.includes("/crm/v3/properties/deals") ? { status: 200, json: DEAL_PROPERTIES } : undefined),
    ]);
    const adapter = new HubSpotAdapter({ accessToken: "pat-test" }, impl);
    expect((await adapter.listObjects()).map((o) => o.api)).toEqual([
      "deals",
      "contacts",
      "companies",
      "tickets",
    ]);
    expect(adapter.customObjectsBlocked).toMatch(/crm\.schemas\.custom\.read/);
    const describe = await adapter.describeObject("deals");
    expect(describe.relationships.some((r) => r.api.startsWith("deal_2-"))).toBe(false);
  });
});

describe("HubSpotAdapter value labels", () => {
  it("maps picklist option labels and owner ids to names", async () => {
    const { impl } = fetchStub([
      (url) =>
        url.includes("/crm/v3/owners")
          ? {
              status: 200,
              json: { results: [{ id: "1519", firstName: "Daniel", lastName: "Ben-Atar" }] },
            }
          : undefined,
      (url) =>
        url.includes("/crm/v3/properties/deals")
          ? {
              status: 200,
              json: {
                results: [
                  { name: "dealname", label: "Deal Name", type: "string", fieldType: "text" },
                  {
                    name: "dealstage",
                    label: "Deal Stage",
                    type: "enumeration",
                    fieldType: "select",
                    options: [
                      { label: "Contract sent", value: "49614379" },
                      { label: "Closed lost", value: "closedlost" },
                    ],
                  },
                  {
                    name: "hubspot_owner_id",
                    label: "Deal owner",
                    type: "enumeration",
                    fieldType: "select",
                    referencedObjectType: "OWNER",
                  },
                ],
              },
            }
          : undefined,
    ]);
    const adapter = new HubSpotAdapter({ accessToken: "pat-test" }, impl);
    const describe = await adapter.describeObject("deals");
    const byApi = Object.fromEntries(describe.fields.map((f) => [f.api, f]));
    // Raw pipeline-stage ids resolve to labels; writes still use internal values.
    expect(byApi.dealstage!.valueLabels).toEqual({ "49614379": "Contract sent", closedlost: "Closed lost" });
    expect(byApi.dealstage!.values).toEqual(["49614379", "closedlost"]);
    expect(byApi.hubspot_owner_id!.valueLabels).toEqual({ "1519": "Daniel Ben-Atar" });
  });
});

describe("HubSpotAdapter portal currency", () => {
  it("uses the portal home currency from account-info for currency fields", async () => {
    const { impl, calls } = fetchStub([
      (url) =>
        url.includes("/account-info/v3/details")
          ? { status: 200, json: { portalId: 143270171, companyCurrency: "SEK" } }
          : undefined,
      (url) => (url.includes("/crm/v3/properties/deals") ? { status: 200, json: DEAL_PROPERTIES } : undefined),
    ]);
    const adapter = new HubSpotAdapter({ accessToken: "pat-test" }, impl);
    const describe = await adapter.describeObject("deals");
    const amount = describe.fields.find((f) => f.api === "amount");
    expect(amount).toMatchObject({ type: "currency", currencyCode: "SEK" });
    // Cached like pipelines: a second describe re-uses the account-info call.
    await adapter.describeObject("deals");
    expect(calls.filter((c) => c.url.includes("/account-info")).length).toBe(1);
  });

  it("falls back to USD only when account-info is scope-blocked", async () => {
    const { impl } = fetchStub([
      (url) => (url.includes("/account-info/v3/details") ? { status: 403, json: {} } : undefined),
      (url) => (url.includes("/crm/v3/properties/deals") ? { status: 200, json: DEAL_PROPERTIES } : undefined),
    ]);
    const adapter = new HubSpotAdapter({ accessToken: "pat-test" }, impl);
    const describe = await adapter.describeObject("deals");
    expect(describe.fields.find((f) => f.api === "amount")).toMatchObject({ currencyCode: "USD" });
  });
});

describe("HubSpotAdapter contact display name", () => {
  const CONTACT_PROPERTIES = {
    results: [
      { name: "firstname", label: "First Name", type: "string", fieldType: "text" },
      { name: "lastname", label: "Last Name", type: "string", fieldType: "text" },
      { name: "email", label: "Email", type: "string", fieldType: "text" },
      { name: "jobtitle", label: "Job title", type: "string", fieldType: "text" },
    ],
  };

  function contactAdapter(batchProperties: Record<string, string | null>) {
    const calls: { url: string; init?: RequestInit }[] = [];
    const { impl } = fetchStub(
      [
        (url) => (url.includes("/crm/v3/properties/contacts") ? { status: 200, json: CONTACT_PROPERTIES } : undefined),
        (url, init) =>
          url.includes("/crm/v3/objects/contacts/batch/read") && init?.method === "POST"
            ? { status: 200, json: { results: [{ id: "c1", properties: batchProperties }] } }
            : undefined,
      ],
      calls,
    );
    return { adapter: new HubSpotAdapter({ accessToken: "pat-test" }, impl), calls };
  }

  it("synthesizes a computed read-only __display_name field, first in describe", async () => {
    const { adapter } = contactAdapter({});
    const describe = await adapter.describeObject("contacts");
    expect(describe.fields[0]).toMatchObject({
      api: "__display_name",
      label: "Name",
      readOnly: true,
      type: "string",
    });
  });

  it("populates __display_name from first+last (email fallback) and never requests it", async () => {
    const { adapter, calls } = contactAdapter({ firstname: "Rachel", lastname: "Sato" });
    const record = await adapter.getRecord("contacts", "c1", ["jobtitle"]);
    expect(record.fields.__display_name).toBe("Rachel Sato");
    const batch = calls.find((c) => c.url.includes("/batch/read"))!;
    const body = JSON.parse(String(batch.init?.body)) as { properties: string[] };
    expect(body.properties).not.toContain("__display_name");
    // The inputs ride along even when the caller asked for other fields.
    expect(body.properties).toEqual(expect.arrayContaining(["jobtitle", "firstname", "lastname", "email"]));

    const { adapter: emailOnly } = contactAdapter({ firstname: null, lastname: null, email: "rachel@meridian.com" });
    const fallback = await emailOnly.getRecord("contacts", "c1", []);
    expect(fallback.fields.__display_name).toBe("rachel@meridian.com");
  });

  it("rejects __display_name from write patches", async () => {
    const { adapter } = contactAdapter({});
    await expect(
      adapter.updateRecord("contacts", "c1", { __display_name: "Someone Else" }),
    ).rejects.toThrow(CrmValidationError);
  });
});

describe("HubSpotAdapter tasks", () => {
  it("filters to the open statuses with IN (deferred tasks are not follow-ups) and pages", async () => {
    const { impl, calls } = fetchStub([
      (url, init) =>
        url.includes("/crm/v3/objects/tasks/search") && init?.method === "POST"
          ? {
              status: 200,
              json: {
                results: [
                  { id: "t1", properties: { hs_task_subject: "Call Acme", hs_timestamp: "1784102400000" } },
                ],
                paging: { next: { after: "20" } },
              },
            }
          : undefined,
    ]);
    const adapter = new HubSpotAdapter({ accessToken: "pat-test" }, impl);
    const page = await adapter.listTasks("me");
    const body = JSON.parse(String(calls[0]!.init?.body)) as {
      filterGroups: { filters: { propertyName: string; operator: string; values?: string[] }[] }[];
      properties: string[];
    };
    expect(body.filterGroups[0]!.filters[0]).toEqual({
      propertyName: "hs_task_status",
      operator: "IN",
      values: ["NOT_STARTED", "IN_PROGRESS", "WAITING"],
    });
    expect(body.properties).toContain("hs_task_priority");
    expect(page.hasMore).toBe(true);
    // Epoch-millis hs_timestamp normalizes to a date, same as the ISO path.
    expect(page.rows[0]!.dueDate).toBe("2026-07-15");
  });
});

describe("HubSpotAdapter epoch normalization", () => {
  it("normalizes epoch-millis date and datetime property values", async () => {
    const properties = {
      results: [
        { name: "closedate", label: "Close Date", type: "date", fieldType: "date" },
        { name: "hs_lastmodifieddate", label: "Last modified", type: "datetime", fieldType: "date" },
      ],
    };
    const { impl } = fetchStub([
      (url) => (url.includes("/crm/v3/properties/deals") ? { status: 200, json: properties } : undefined),
      (url, init) =>
        url.includes("/crm/v3/objects/deals/batch/read") && init?.method === "POST"
          ? {
              status: 200,
              json: {
                results: [
                  {
                    id: "d1",
                    properties: {
                      closedate: "1784073600000",
                      hs_lastmodifieddate: "1784073600000",
                    },
                  },
                ],
              },
            }
          : undefined,
    ]);
    const adapter = new HubSpotAdapter({ accessToken: "pat-test" }, impl);
    const record = await adapter.getRecord("deals", "d1", []);
    expect(record.fields.closedate).toBe("2026-07-15");
    expect(record.fields.hs_lastmodifieddate).toBe("2026-07-15T00:00:00.000Z");
  });
});

describe("HubSpotAdapter owners paging + portal info", () => {
  it("follows owners paging (plus an archived pass) and reports the active count", async () => {
    const { impl } = fetchStub([
      (url) =>
        url.includes("/crm/v3/owners") && url.includes("archived=true")
          ? { status: 200, json: { results: [{ id: "9", firstName: "Left", lastName: "TheCompany" }] } }
          : undefined,
      (url) =>
        url.includes("/crm/v3/owners") && url.includes("after=next-page")
          ? { status: 200, json: { results: [{ id: "2", firstName: "Page", lastName: "Two" }] } }
          : undefined,
      (url) =>
        url.includes("/crm/v3/owners")
          ? {
              status: 200,
              json: {
                results: [{ id: "1", firstName: "Page", lastName: "One" }],
                paging: { next: { after: "next-page" } },
              },
            }
          : undefined,
      (url) =>
        url.includes("/account-info/v3/details")
          ? { status: 200, json: { portalId: 143270171, companyCurrency: "SEK" } }
          : undefined,
      (url) => (url.endsWith("/crm/v3/schemas") ? { status: 200, json: { results: [] } } : undefined),
    ]);
    const adapter = new HubSpotAdapter({ accessToken: "pat-test" }, impl);
    const info = await adapter.getPortalInfo();
    // Active owners only in the count; archived owners still label records.
    expect(info).toMatchObject({
      userCount: 2,
      portalId: "143270171",
      defaultCurrency: "SEK",
      scopeGaps: [],
    });
  });

  it("reports scope gaps for blocked custom objects and owners — never invents numbers", async () => {
    const { impl } = fetchStub([
      (url) => (url.includes("/crm/v3/owners") ? { status: 403, json: {} } : undefined),
      (url) => (url.endsWith("/crm/v3/schemas") ? { status: 403, json: {} } : undefined),
      (url) => (url.includes("/account-info/v3/details") ? { status: 403, json: {} } : undefined),
    ]);
    const adapter = new HubSpotAdapter({ accessToken: "pat-test" }, impl);
    const info = await adapter.getPortalInfo();
    expect(info.userCount).toBeNull();
    expect(info.portalId).toBeNull();
    expect(info.defaultCurrency).toBeNull();
    expect(info.scopeGaps.join(" ")).toMatch(/crm\.schemas\.custom\.read/);
    expect(info.scopeGaps.join(" ")).toMatch(/owners/i);
  });
});

describe("HubSpotAdapter 429 handling", () => {
  it("honors Retry-After with exactly one retry", async () => {
    let schemaCalls = 0;
    const { impl } = fetchStub([
      (url) => {
        if (!url.endsWith("/crm/v3/schemas")) return undefined;
        schemaCalls += 1;
        return schemaCalls === 1
          ? { status: 429, json: {}, headers: { "Retry-After": "0" } }
          : {
              status: 200,
              json: { results: [{ objectTypeId: "2-1", name: "project", labels: { singular: "Project", plural: "Projects" } }] },
            };
      },
    ]);
    const adapter = new HubSpotAdapter({ accessToken: "pat-test" }, impl);
    const objects = await adapter.listObjects();
    expect(schemaCalls).toBe(2);
    expect(objects.some((o) => o.api === "2-1")).toBe(true);
  });

  it("surfaces the rate limit after the second 429", async () => {
    const { impl } = fetchStub([
      (url) =>
        url.includes("/crm/v3/properties/deals")
          ? { status: 429, json: {}, headers: { "Retry-After": "0" } }
          : undefined,
    ]);
    const adapter = new HubSpotAdapter({ accessToken: "pat-test" }, impl);
    await expect(adapter.describeObject("deals")).rejects.toThrow(/rate limit/);
  });
});

describe("HubSpotAdapter pipeline-stage fallback", () => {
  it("fills dealstage/pipeline labels from the pipelines API when options are empty", async () => {
    const { impl } = fetchStub([
      (url) =>
        url.includes("/crm/v3/pipelines/deals")
          ? {
              status: 200,
              json: {
                results: [
                  {
                    id: "default",
                    label: "Sales pipeline",
                    stages: [
                      { id: "49614379", label: "Contract sent" },
                      { id: "closedlost", label: "Closed lost" },
                    ],
                  },
                ],
              },
            }
          : undefined,
      (url) =>
        url.includes("/crm/v3/properties/deals")
          ? {
              status: 200,
              json: {
                results: [
                  // Real-portal quirk: dealstage arrives with NO options.
                  { name: "dealstage", label: "Deal Stage", type: "enumeration", fieldType: "select" },
                  { name: "pipeline", label: "Pipeline", type: "enumeration", fieldType: "select" },
                ],
              },
            }
          : undefined,
    ]);
    const adapter = new HubSpotAdapter({ accessToken: "pat-test" }, impl);
    const describe = await adapter.describeObject("deals");
    const byApi = Object.fromEntries(describe.fields.map((f) => [f.api, f]));
    expect(byApi.dealstage!.valueLabels).toEqual({
      "49614379": "Contract sent",
      closedlost: "Closed lost",
    });
    expect(byApi.dealstage!.values).toEqual(["49614379", "closedlost"]);
    expect(byApi.pipeline!.valueLabels).toEqual({ default: "Sales pipeline" });
  });
});
