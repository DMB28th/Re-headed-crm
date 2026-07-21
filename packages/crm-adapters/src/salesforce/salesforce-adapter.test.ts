import { describe, expect, it } from "vitest";
import {
  SalesforceAdapter,
  buildSalesforceAuthorizationUrl,
  exchangeSalesforceAuthorizationCode,
  normalizeSalesforceLoginUrl,
} from "./salesforce-adapter.js";
import { CrmRateLimitError, CrmValidationError } from "../adapter.js";

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

/** Org + stage metadata queries that describeObject now issues. */
const orgHandler: Handler = (url) => {
  const q = decodeURIComponent(url);
  if (q.includes("FROM Organization")) {
    return { status: 200, json: { totalSize: 1, records: [{ IsSandbox: true, DefaultCurrencyIsoCode: "EUR" }] } };
  }
  if (q.includes("FROM OpportunityStage")) {
    return {
      status: 200,
      json: {
        totalSize: 2,
        records: [
          { ApiName: "ClosedWon", MasterLabel: "Closed Won", IsClosed: true },
          { ApiName: "ClosedLost", MasterLabel: "Closed Lost", IsClosed: true },
        ],
      },
    };
  }
  if (q.includes("FROM TaskStatus")) {
    return { status: 200, json: { totalSize: 1, records: [{ ApiName: "Completed", MasterLabel: "Completed" }] } };
  }
  return undefined;
};

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

  it("uses OAuth refresh tokens for web-server-flow credentials", async () => {
    const bodies: string[] = [];
    const { impl } = fetchStub([
      (url, init) => {
        if (url.includes("/services/oauth2/token") && init?.method === "POST") {
          bodies.push(String(init.body));
          return {
            status: 200,
            json: {
              access_token: "user-token",
              instance_url: "https://user.my.salesforce.com",
            },
          };
        }
        return undefined;
      },
      (url) => (url.includes("/sobjects/Opportunity/describe") ? { status: 200, json: OPP_DESCRIBE } : undefined),
    ]);
    const adapter = new SalesforceAdapter(
      {
        authType: "oauth",
        loginUrl: "https://login.salesforce.com",
        clientId: "key",
        clientSecret: "secret",
        refreshToken: "refresh-user",
      },
      impl,
    );
    await adapter.describeObject("Opportunity");
    expect(bodies[0]).toContain("grant_type=refresh_token");
    expect(bodies[0]).toContain("refresh_token=refresh-user");
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
      orgHandler,
      (url) => (url.includes("/describe") ? { status: 200, json: OPP_DESCRIBE } : undefined),
      (url) =>
        decodeURIComponent(url).includes("COUNT()")
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
    // The main search query is the one carrying OFFSET (org/stage/COUNT don't).
    const soqlCall = calls.find((c) => decodeURIComponent(c.url).includes("OFFSET"))!;
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

  it("quotes an injection-shaped filter value instead of splicing raw SOQL", async () => {
    const { impl, calls } = fetchStub([
      tokenHandler(),
      orgHandler,
      (url) => (url.includes("/describe") ? { status: 200, json: OPP_DESCRIBE } : undefined),
      (url) =>
        decodeURIComponent(url).includes("COUNT()")
          ? { status: 200, json: { totalSize: 0, records: [] } }
          : url.includes("/query")
            ? { status: 200, json: { totalSize: 0, records: [] } }
            : undefined,
    ]);
    const adapter = new SalesforceAdapter(CREDS, impl);
    await adapter.search("Opportunity", {
      filters: [{ field: "StageName", op: "eq", value: "2024-01-01 OR Amount > 0" }],
    });
    const soql = decodeURIComponent(calls.find((c) => c.url.includes("OFFSET"))!.url);
    // Not emitted as a bare date literal — it's quoted, so the OR can't execute.
    expect(soql).toContain("StageName = '2024-01-01 OR Amount > 0'");
  });

  it("rejects a filter on an unknown field", async () => {
    const { impl } = fetchStub([
      tokenHandler(),
      orgHandler,
      (url) => (url.includes("/describe") ? { status: 200, json: OPP_DESCRIBE } : undefined),
    ]);
    const adapter = new SalesforceAdapter(CREDS, impl);
    await expect(
      adapter.search("Opportunity", { filters: [{ field: "SecretField", op: "eq", value: "x" }] }),
    ).rejects.toThrow(CrmValidationError);
  });

  it("populates StageName.closedValues and marks the org as sandbox", async () => {
    const { impl } = fetchStub([
      tokenHandler(),
      orgHandler,
      (url) => (url.includes("/describe") ? { status: 200, json: OPP_DESCRIBE } : undefined),
    ]);
    const adapter = new SalesforceAdapter(CREDS, impl);
    const describe = await adapter.describeObject("Opportunity");
    const stage = describe.fields.find((f) => f.api === "StageName");
    expect(stage?.closedValues).toEqual(["ClosedWon", "ClosedLost"]);
    expect(describe.stageField).toBe("StageName");
    expect(describe.amountField).toBe("Amount");
    const info = await adapter.getPortalInfo();
    expect(info.isSandbox).toBe(true);
    expect(info.defaultCurrency).toBe("EUR");
  });

  it("classifies REQUEST_LIMIT_EXCEEDED as a rate-limit, not an auth error", async () => {
    const { impl } = fetchStub([
      tokenHandler(),
      (url) =>
        url.includes("/describe")
          ? {
              status: 403,
              json: [{ message: "TotalRequests Limit exceeded.", errorCode: "REQUEST_LIMIT_EXCEEDED" }],
            }
          : undefined,
    ]);
    const adapter = new SalesforceAdapter(CREDS, impl);
    await expect(adapter.describeObject("Opportunity")).rejects.toThrow(CrmRateLimitError);
  });

  it("completeTask uses the org's actual closed status", async () => {
    const patched: Record<string, unknown>[] = [];
    const { impl } = fetchStub([
      tokenHandler(),
      orgHandler,
      (url, init) => {
        if (url.includes("/sobjects/Task/00Tx") && init?.method === "PATCH") {
          patched.push(JSON.parse(String(init.body)));
          return { status: 200, json: {} };
        }
        return undefined;
      },
      (url) =>
        decodeURIComponent(url).includes("FROM Task WHERE")
          ? { status: 200, json: { totalSize: 1, records: [{ Id: "00Tx", Subject: "Call", ActivityDate: "2026-08-01" }] } }
          : undefined,
    ]);
    const adapter = new SalesforceAdapter(CREDS, impl);
    const task = await adapter.completeTask("00Tx");
    expect(patched[0]).toEqual({ Status: "Completed" });
    expect(task.status).toBe("completed");
  });
});

describe("Salesforce OAuth hardening (PKCE + loginUrl allowlist)", () => {
  it("adds PKCE challenge params to the authorize URL when given a challenge", () => {
    const url = new URL(
      buildSalesforceAuthorizationUrl({
        loginUrl: "https://login.salesforce.com",
        clientId: "key",
        redirectUri: "https://app.example/api/connections/salesforce/oauth/callback",
        state: "st-1",
        codeChallenge: "abc123",
      }),
    );
    expect(url.searchParams.get("code_challenge")).toBe("abc123");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("st-1");
  });

  it("omits PKCE params when no challenge is given (back-compat)", () => {
    const url = new URL(
      buildSalesforceAuthorizationUrl({
        loginUrl: "https://test.salesforce.com",
        clientId: "key",
        redirectUri: "https://app.example/cb",
        state: "st-2",
      }),
    );
    expect(url.searchParams.has("code_challenge")).toBe(false);
    expect(url.searchParams.has("code_challenge_method")).toBe(false);
  });

  it("sends the PKCE code_verifier in the token exchange body", async () => {
    const { impl, calls } = fetchStub([
      (url, init) =>
        url.includes("/services/oauth2/token") && init?.method === "POST"
          ? {
              status: 200,
              json: {
                access_token: "tok",
                refresh_token: "rt",
                instance_url: "https://x.my.salesforce.com",
              },
            }
          : undefined,
    ]);
    await exchangeSalesforceAuthorizationCode(
      {
        loginUrl: "https://login.salesforce.com",
        clientId: "key",
        clientSecret: "secret",
        redirectUri: "https://app.example/cb",
        code: "authcode",
        codeVerifier: "verifier-xyz",
      },
      impl,
    );
    const body = new URLSearchParams(String(calls[0]?.init?.body));
    expect(body.get("code_verifier")).toBe("verifier-xyz");
    expect(body.get("grant_type")).toBe("authorization_code");
  });

  it("accepts Salesforce-owned login hosts", () => {
    expect(normalizeSalesforceLoginUrl("https://login.salesforce.com")).toBe(
      "https://login.salesforce.com",
    );
    expect(normalizeSalesforceLoginUrl("https://test.salesforce.com/")).toBe(
      "https://test.salesforce.com",
    );
    expect(normalizeSalesforceLoginUrl("https://acme.my.salesforce.com")).toBe(
      "https://acme.my.salesforce.com",
    );
  });

  it("rejects non-Salesforce and non-https login hosts (SSRF guard)", () => {
    expect(() => normalizeSalesforceLoginUrl("https://attacker.example")).toThrow(/My Domain/);
    expect(() => normalizeSalesforceLoginUrl("https://login.salesforce.com.evil.com")).toThrow(
      /My Domain/,
    );
    expect(() => normalizeSalesforceLoginUrl("http://login.salesforce.com")).toThrow(/https/);
  });
});
