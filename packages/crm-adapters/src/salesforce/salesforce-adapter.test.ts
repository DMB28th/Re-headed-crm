import { describe, expect, it } from "vitest";
import { SalesforceAdapter } from "./salesforce-adapter.js";
import { CrmValidationError } from "../adapter.js";

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

const CREDS = {
  instanceUrl: "https://test.my.salesforce.com",
  clientId: "key",
  clientSecret: "secret",
};

const tokenHandler: (token?: string) => Handler = (token = "tok-1") => (url, init) =>
  url.includes("/services/oauth2/token") && init?.method === "POST"
    ? { status: 200, json: { access_token: token } }
    : undefined;

const OPP_DESCRIBE = {
  fields: [
    { name: "Id", label: "ID", type: "id", nillable: false, createable: false, updateable: false, defaultedOnCreate: true },
    { name: "Name", label: "Name", type: "string", nillable: false, createable: true, updateable: true, defaultedOnCreate: false, inlineHelpText: "Deal name" },
    { name: "Amount", label: "Amount", type: "currency", nillable: true, createable: true, updateable: true, defaultedOnCreate: false },
    {
      name: "StageName", label: "Stage", type: "picklist", nillable: false, createable: true, updateable: true, defaultedOnCreate: false,
      picklistValues: [
        { value: "Prospecting", active: true },
        { value: "Dead", active: false },
      ],
    },
    { name: "IsWon", label: "Won", type: "boolean", nillable: false, createable: false, updateable: false, defaultedOnCreate: true },
    { name: "BillingAddress", label: "Address", type: "address", nillable: true, createable: false, updateable: false, defaultedOnCreate: true },
  ],
};

describe("SalesforceAdapter", () => {
  it("fetches a client-credentials token lazily and retries once on 401", async () => {
    let tokenCount = 0;
    let describeAuths: string[] = [];
    const { impl } = fetchStub([
      (url, init) => {
        if (url.includes("/services/oauth2/token") && init?.method === "POST") {
          tokenCount += 1;
          return { status: 200, json: { access_token: `tok-${tokenCount}` } };
        }
        return undefined;
      },
      (url, init) => {
        if (url.includes("/sobjects/Opportunity/describe")) {
          const auth = String((init?.headers as Record<string, string>)?.Authorization);
          describeAuths.push(auth);
          // First token is "expired": force one retry.
          return auth === "Bearer tok-1" ? { status: 401, json: [] } : { status: 200, json: OPP_DESCRIBE };
        }
        return undefined;
      },
    ]);
    const adapter = new SalesforceAdapter(CREDS, impl);
    const describe = await adapter.describeObject("Opportunity");
    expect(tokenCount).toBe(2); // initial + refresh after 401
    expect(describeAuths).toEqual(["Bearer tok-1", "Bearer tok-2"]);
    expect(describe.fields.map((f) => f.api)).toContain("Name");
  });

  it("maps sobject describe → FieldDescribe (required, readOnly, picklists, address dropped)", async () => {
    const { impl } = fetchStub([
      tokenHandler(),
      (url) => (url.includes("/describe") ? { status: 200, json: OPP_DESCRIBE } : undefined),
    ]);
    const adapter = new SalesforceAdapter(CREDS, impl);
    const describe = await adapter.describeObject("Opportunity");
    const byApi = Object.fromEntries(describe.fields.map((f) => [f.api, f]));
    expect(byApi.BillingAddress).toBeUndefined(); // compound address dropped
    expect(byApi.Name).toMatchObject({ required: true, readOnly: false, description: "Deal name" });
    expect(byApi.Amount).toMatchObject({ type: "currency", required: false });
    expect(byApi.StageName).toMatchObject({ type: "picklist", values: ["Prospecting"] });
    expect(byApi.IsWon).toMatchObject({ type: "boolean", readOnly: true, required: false });
  });

  it("search builds escaped SOQL with filters, sort and offset paging", async () => {
    const { impl, calls } = fetchStub([
      tokenHandler(),
      (url) => (url.includes("/describe") ? { status: 200, json: OPP_DESCRIBE } : undefined),
      (url) =>
        url.includes("/query?q=SELECT+COUNT%28%29") || url.includes("/query?q=SELECT%20COUNT()")
          ? { status: 200, json: { totalSize: 42, records: [] } }
          : url.includes("/query")
            ? {
                status: 200,
                json: {
                  totalSize: 1,
                  records: [
                    { attributes: { type: "Opportunity" }, Id: "006x", Name: "Acme — renewal", Amount: 5000 },
                  ],
                },
              }
            : undefined,
    ]);
    const adapter = new SalesforceAdapter(CREDS, impl);
    const page = await adapter.search("Opportunity", {
      text: "O'Neil",
      filters: [{ field: "Amount", op: "gt", value: 1000 }],
      sort: { field: "Amount", dir: "desc" },
      limit: 10,
      cursor: "20",
    });
    const soqlCall = calls.find((c) => c.url.includes("/query") && !decodeURIComponent(c.url).includes("COUNT("))!;
    const soql = decodeURIComponent(soqlCall.url.split("?q=")[1]!).replace(/\+/g, " ");
    expect(soql).toContain("FROM Opportunity");
    expect(soql).toContain("Name LIKE '%O\\'Neil%'"); // quote escaped
    expect(soql).toContain("Amount > 1000");
    expect(soql).toContain("ORDER BY Amount DESC NULLS LAST");
    expect(soql).toContain("LIMIT 10 OFFSET 20");
    expect(page.rows[0]).toMatchObject({ id: "006x", fields: { Name: "Acme — renewal", Amount: 5000 } });
    expect(page.total).toBe(42);
    expect(page.hasMore).toBe(true);
  });

  it("maps listviews to SavedViews and reads view rows by column pairs", async () => {
    const { impl } = fetchStub([
      tokenHandler(),
      (url) =>
        url.includes("/sobjects/Opportunity/listviews/00Bx/results")
          ? {
              status: 200,
              json: {
                done: true,
                records: [
                  {
                    columns: [
                      { fieldNameOrPath: "Id", value: "006a" },
                      { fieldNameOrPath: "Name", value: "Big deal" },
                      { fieldNameOrPath: "Amount", value: "9000" },
                    ],
                  },
                ],
              },
            }
          : url.includes("/sobjects/Opportunity/listviews")
            ? { status: 200, json: { listviews: [{ id: "00Bx", label: "All Opportunities" }] } }
            : undefined,
    ]);
    const adapter = new SalesforceAdapter(CREDS, impl);
    const views = await adapter.listSavedViews("Opportunity");
    expect(views[0]).toMatchObject({ id: "00Bx", name: "All Opportunities", object: "Opportunity" });
    const rows = await adapter.getViewRows("00Bx");
    expect(rows.rows[0]).toMatchObject({ id: "006a", fields: { Name: "Big deal" } });
  });

  it("maps Salesforce error arrays to CrmValidationError", async () => {
    const { impl } = fetchStub([
      tokenHandler(),
      (url, init) =>
        url.includes("/sobjects/Opportunity/006bad") && init?.method === "PATCH"
          ? {
              status: 400,
              json: [
                {
                  message: "Close Date is required when stage is Closed Won",
                  errorCode: "FIELD_CUSTOM_VALIDATION_EXCEPTION",
                  fields: ["CloseDate"],
                },
              ],
            }
          : undefined,
    ]);
    const adapter = new SalesforceAdapter(CREDS, impl);
    await expect(
      adapter.updateRecord("Opportunity", "006bad", { StageName: "Closed Won" }),
    ).rejects.toThrow(CrmValidationError);
  });
});
