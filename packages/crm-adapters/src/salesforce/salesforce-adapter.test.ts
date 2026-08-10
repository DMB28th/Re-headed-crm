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
  name: "Opportunity",
  label: "Opportunity",
  labelPlural: "Opportunities",
  custom: false,
  childRelationships: [
    { childSObject: "OpportunityLineItem", field: "OpportunityId", relationshipName: "OpportunityLineItems" },
    { childSObject: "OpportunityHistory", field: "OpportunityId", relationshipName: "Histories" },
  ],
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
    { name: "OwnerId", label: "Owner", type: "reference", nillable: false, createable: false, updateable: true, defaultedOnCreate: false, relationshipName: "Owner", referenceTo: ["User"] },
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

  it("persists a rotated refresh token via the onRefresh callback", async () => {
    const refreshed: { accessToken?: string; refreshToken?: string }[] = [];
    const { impl } = fetchStub([
      (url, init) =>
        url.includes("/services/oauth2/token") && init?.method === "POST"
          ? {
              status: 200,
              json: {
                access_token: "new-access",
                refresh_token: "RT2", // rotation: a NEW refresh token
                instance_url: "https://x.my.salesforce.com",
              },
            }
          : undefined,
      // userinfo (getConnectedUser) after the token refresh
      (url) =>
        url.includes("/services/oauth2/userinfo")
          ? { status: 200, json: { name: "Rep", preferred_username: "rep@x.com" } }
          : undefined,
    ]);
    const adapter = new SalesforceAdapter(
      {
        authType: "oauth",
        loginUrl: "https://login.salesforce.com",
        clientId: "k",
        clientSecret: "s",
        refreshToken: "RT1", // stale after rotation
        instanceUrl: "https://x.my.salesforce.com",
      },
      impl,
      (creds) => refreshed.push(creds),
    );
    await adapter.getConnectedUser().catch(() => undefined);
    expect(refreshed.length).toBeGreaterThan(0);
    expect(refreshed[0]?.refreshToken).toBe("RT2");
    expect(refreshed[0]?.accessToken).toBe("new-access");
  });

  it("validateConnection does not refresh (burn rotation) when it already has an access token", async () => {
    const { impl, calls } = fetchStub([
      (url) =>
        url.includes("/services/oauth2/userinfo")
          ? { status: 200, json: { name: "Real User" } }
          : undefined,
      (url) =>
        decodeURIComponent(url).includes("FROM Organization")
          ? { status: 200, json: { totalSize: 1, records: [{ IsSandbox: true }] } }
          : undefined,
      (url, init) =>
        url.includes("/services/oauth2/token") && init?.method === "POST"
          ? { status: 200, json: { access_token: "should-not-be-used" } }
          : undefined,
    ]);
    const adapter = new SalesforceAdapter(
      {
        authType: "oauth",
        loginUrl: "https://login.salesforce.com",
        clientId: "k",
        clientSecret: "s",
        refreshToken: "RT1",
        accessToken: "A0", // fresh from the OAuth exchange — no refresh needed
        instanceUrl: "https://x.my.salesforce.com",
      },
      impl,
    );
    const user = await adapter.validateConnection();
    expect(user).toBe("Real User");
    // Crucially: no token refresh happened, so the rotation token RT1 stays valid.
    expect(calls.some((c) => c.url.includes("/services/oauth2/token"))).toBe(false);
  });

  it("single-flights concurrent token refreshes — one grant, not one per caller", async () => {
    let grants = 0;
    const { impl } = fetchStub([
      (url, init) => {
        if (url.includes("/services/oauth2/token") && init?.method === "POST") {
          grants += 1;
          return {
            status: 200,
            json: { access_token: `A${grants}`, refresh_token: `RT${grants + 1}` },
          };
        }
        return undefined;
      },
      (url) =>
        url.includes("/services/oauth2/userinfo") ? { status: 200, json: { name: "Rep" } } : undefined,
    ]);
    const adapter = new SalesforceAdapter(
      {
        authType: "oauth",
        loginUrl: "https://login.salesforce.com",
        clientId: "k",
        clientSecret: "s",
        refreshToken: "RT1",
        instanceUrl: "https://x.my.salesforce.com",
      },
      impl,
    );
    // Parallel cold calls (the home card fires several at once). Two concurrent
    // grants would replay RT1 — reuse-detected under rotation, killing the family.
    await Promise.all([adapter.getConnectedUser(), adapter.getConnectedUser(), adapter.getConnectedUser()]);
    expect(grants).toBe(1);
  });

  it("retries a rejected refresh with the store's token when another process rotated it", async () => {
    const attempted: string[] = [];
    const { impl } = fetchStub([
      (url, init) => {
        if (url.includes("/services/oauth2/token") && init?.method === "POST") {
          const rt = new URLSearchParams(String(init.body)).get("refresh_token")!;
          attempted.push(rt);
          return rt === "RT-new"
            ? { status: 200, json: { access_token: "A1" } }
            : {
                status: 400,
                json: { error: "invalid_grant", error_description: "expired access/refresh token" },
              };
        }
        return undefined;
      },
      (url) =>
        url.includes("/services/oauth2/userinfo") ? { status: 200, json: { name: "Rep" } } : undefined,
    ]);
    const adapter = new SalesforceAdapter(
      {
        authType: "oauth",
        loginUrl: "https://login.salesforce.com",
        clientId: "k",
        clientSecret: "s",
        refreshToken: "RT-old", // stale: another process rotated and persisted RT-new
        instanceUrl: "https://x.my.salesforce.com",
      },
      impl,
      undefined,
      async () => ({ clientId: "k", clientSecret: "s", refreshToken: "RT-new" }),
    );
    const user = await adapter.validateConnection();
    expect(user).toBe("Rep");
    expect(attempted).toEqual(["RT-old", "RT-new"]);
  });

  it("awaits the rotated-credentials persist, retrying once and never failing the request", async () => {
    let persistCalls = 0;
    const { impl } = fetchStub([
      (url, init) =>
        url.includes("/services/oauth2/token") && init?.method === "POST"
          ? { status: 200, json: { access_token: "A1", refresh_token: "RT2" } }
          : undefined,
      (url) =>
        url.includes("/services/oauth2/userinfo") ? { status: 200, json: { name: "Rep" } } : undefined,
    ]);
    const adapter = new SalesforceAdapter(
      {
        authType: "oauth",
        loginUrl: "https://login.salesforce.com",
        clientId: "k",
        clientSecret: "s",
        refreshToken: "RT1",
        instanceUrl: "https://x.my.salesforce.com",
      },
      impl,
      async () => {
        persistCalls += 1;
        if (persistCalls === 1) throw new Error("store write failed");
      },
    );
    expect(await adapter.getConnectedUser()).toBe("Rep");
    expect(persistCalls).toBe(2); // first write failed → one retry
  });
});

const GLOBAL_SOBJECTS = {
  sobjects: [
    { name: "Account", label: "Account", labelPlural: "Accounts", custom: false, queryable: true, createable: true, deprecatedAndHidden: false },
    { name: "Opportunity", label: "Opportunity", labelPlural: "Opportunities", custom: false, queryable: true, createable: true, deprecatedAndHidden: false },
    { name: "OpportunityLineItem", label: "Opportunity Product", labelPlural: "Opportunity Products", custom: false, queryable: true, createable: true, deprecatedAndHidden: false },
    { name: "OpportunityHistory", label: "History", labelPlural: "Histories", custom: false, queryable: false, createable: false, deprecatedAndHidden: false },
    { name: "AccountShare", label: "Account Share", labelPlural: "Account Shares", custom: false, queryable: true, createable: true, deprecatedAndHidden: false },
    { name: "Widget__c", label: "Widget", labelPlural: "Widgets", custom: true, queryable: true, createable: true, deprecatedAndHidden: false },
  ],
};

const globalHandler: Handler = (url) =>
  url.endsWith("/sobjects") ? { status: 200, json: GLOBAL_SOBJECTS } : undefined;

describe("Salesforce-first metadata (dynamic objects + relationships)", () => {
  it("listObjects returns layoutable objects incl. custom, filters system objects, common first", async () => {
    const { impl } = fetchStub([tokenHandler(), globalHandler]);
    const adapter = new SalesforceAdapter(CREDS, impl);
    const objects = await adapter.listObjects();
    const apis = objects.map((o) => o.api);
    expect(apis).toContain("Widget__c"); // custom object addable
    expect(apis).toContain("Account");
    expect(apis).not.toContain("OpportunityHistory"); // *History → system
    expect(apis).not.toContain("AccountShare"); // *Share → system
    // Common CRM objects sort ahead of others.
    expect(apis.indexOf("Account")).toBeLessThan(apis.indexOf("Widget__c"));
  });

  it("describeObject builds related lists from childRelationships (FK field as api), skipping system children", async () => {
    const { impl } = fetchStub([
      tokenHandler(),
      globalHandler,
      orgHandler,
      (url) => (url.includes("/sobjects/Opportunity/describe") ? { status: 200, json: OPP_DESCRIBE } : undefined),
    ]);
    const adapter = new SalesforceAdapter(CREDS, impl);
    const describe = await adapter.describeObject("Opportunity");
    expect(describe.api).toBe("Opportunity");
    expect(describe.labelPlural).toBe("Opportunities");
    expect(describe.relationships).toEqual([
      {
        api: "OpportunityLineItems",
        label: "Opportunity Products",
        relatedObject: "OpportunityLineItem",
        foreignKey: "OpportunityId",
      },
    ]);
    // OpportunityHistory child is filtered out (not layoutable).
    expect(describe.relationships.some((r) => r.relatedObject === "OpportunityHistory")).toBe(false);
  });

  it("aggregate builds GROUP BY SOQL and parses buckets", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const { impl } = fetchStub(
      [
        tokenHandler(),
        globalHandler,
        orgHandler,
        (url) =>
          url.includes("/sobjects/Opportunity/describe") ? { status: 200, json: OPP_DESCRIBE } : undefined,
        (url) =>
          url.includes("/query")
            ? {
                status: 200,
                json: {
                  records: [
                    { StageName: "Qualification", cnt: 12, total: 500000 },
                    { StageName: "Closed Won", cnt: 3, total: null },
                  ],
                  totalSize: 2,
                  done: true,
                },
              }
            : undefined,
      ],
      calls,
    );
    const adapter = new SalesforceAdapter(CREDS, impl);
    const buckets = await adapter.aggregate("Opportunity", {
      groupBy: "StageName",
      sumField: "Amount",
      filters: [{ field: "Amount", op: "gte", value: 1000 }],
    });
    const q = decodeURIComponent(
      calls.find((c) => c.url.includes("/query") && c.url.includes("COUNT"))?.url ?? "",
    );
    expect(q).toContain("SELECT StageName, COUNT(Id) cnt, SUM(Amount) total FROM Opportunity");
    expect(q).toContain("WHERE Amount >= 1000");
    expect(q).toContain("GROUP BY StageName");
    expect(buckets).toEqual([
      { group: "Qualification", count: 12, sum: 500000 },
      { group: "Closed Won", count: 3, sum: null },
    ]);
  });

  it("aggregate rejects unknown fields before any SOQL is sent", async () => {
    const { impl } = fetchStub([
      tokenHandler(),
      globalHandler,
      orgHandler,
      (url) =>
        url.includes("/sobjects/Opportunity/describe") ? { status: 200, json: OPP_DESCRIBE } : undefined,
    ]);
    const adapter = new SalesforceAdapter(CREDS, impl);
    await expect(
      adapter.aggregate("Opportunity", { groupBy: "NotAField" }),
    ).rejects.toThrow('Unknown field "NotAField"');
  });

  it("recordUrl builds a Lightning deep link and refuses malformed ids", () => {
    const { impl } = fetchStub([tokenHandler(), globalHandler, orgHandler]);
    const adapter = new SalesforceAdapter(
      { ...CREDS, instanceUrl: "https://org.my.salesforce.com/" },
      impl,
    );
    expect(adapter.recordUrl("Opportunity", "006dL00000QUE1lQAH")).toBe(
      "https://org.my.salesforce.com/lightning/r/Opportunity/006dL00000QUE1lQAH/view",
    );
    expect(adapter.recordUrl("Opportunity", "not-an-id!/../x")).toBeUndefined();
    expect(adapter.recordUrl("Bad Object", "006dL00000QUE1lQAH")).toBeUndefined();
  });

  it("getActivity merges field history with tasks, newest first", async () => {
    const { impl } = fetchStub([
      tokenHandler(),
      globalHandler,
      orgHandler,
      (url) =>
        url.includes("/sobjects/Opportunity/describe") ? { status: 200, json: OPP_DESCRIBE } : undefined,
      (url) => {
        if (!url.includes("/query")) return undefined;
        const q = decodeURIComponent(url);
        if (q.includes("FROM OpportunityFieldHistory"))
          return {
            status: 200,
            json: {
              records: [
                {
                  Id: "h1", Field: "Amount", OldValue: 15000, NewValue: 35000,
                  CreatedDate: "2026-07-23T10:00:00.000+0000", CreatedBy: { Name: "Dan" },
                },
              ],
              totalSize: 1, done: true,
            },
          };
        if (q.includes("FROM Task"))
          return {
            status: 200,
            json: {
              records: [
                {
                  Id: "t1", Subject: "Call Andy", Status: "Completed", TaskSubtype: "Call",
                  ActivityDate: "2026-07-22", CreatedDate: "2026-07-20T00:00:00.000+0000",
                },
              ],
              totalSize: 1, done: true,
            },
          };
        return undefined;
      },
    ]);
    const adapter = new SalesforceAdapter(CREDS, impl);
    const entries = await adapter.getActivity("Opportunity", "006x", 6);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ kind: "update" });
    expect(entries[0]!.summary).toContain("15000 → 35000");
    expect(entries[0]!.summary).toContain("Dan");
    expect(entries[1]).toMatchObject({ kind: "call" });
    expect(entries[1]!.summary).toBe("Call Andy (Completed)");
  });

  it("never emits .Name traversal for non-name-bearing reference targets", async () => {
    // Seen live: LastAmountChangedHistory.Name → "No such column 'Name' on
    // entity 'OpportunityHistory'" — one bad traversal 500s the whole SELECT.
    const describeWithHistory = {
      ...OPP_DESCRIBE,
      fields: [
        ...OPP_DESCRIBE.fields,
        {
          name: "LastAmountChangedHistoryId", label: "Last Amount Changed", type: "reference",
          nillable: true, createable: false, updateable: false, defaultedOnCreate: false,
          relationshipName: "LastAmountChangedHistory", referenceTo: ["OpportunityHistory"],
        },
      ],
    };
    const calls: { url: string; init?: RequestInit }[] = [];
    const { impl } = fetchStub(
      [
        tokenHandler(),
        globalHandler,
        orgHandler,
        (url) =>
          url.includes("/sobjects/Opportunity/describe")
            ? { status: 200, json: describeWithHistory }
            : undefined,
        (url) =>
          url.includes("/query") ? { status: 200, json: { records: [], totalSize: 0, done: true } } : undefined,
      ],
      calls,
    );
    const adapter = new SalesforceAdapter(CREDS, impl);
    await adapter.search("Opportunity", {});
    const soqlCalls = calls.filter((c) => c.url.includes("/query")).map((c) => decodeURIComponent(c.url));
    expect(soqlCalls.length).toBeGreaterThan(0);
    for (const q of soqlCalls) {
      expect(q).not.toContain("LastAmountChangedHistory.Name");
    }
    // Owner is name-bearing (referenceTo User) — traversal still happens.
    expect(soqlCalls.some((q) => q.includes("Owner.Name"))).toBe(true);
  });

  it("resolves reference ids to the related record's Name (OwnerId → Owner.Name)", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const { impl } = fetchStub(
      [
        tokenHandler(),
        globalHandler,
        orgHandler,
        (url) => (url.includes("/sobjects/Opportunity/describe") ? { status: 200, json: OPP_DESCRIBE } : undefined),
        (url) =>
          url.includes("/sobjects/Opportunity/006x")
            ? { status: 200, json: { Id: "006x", OwnerId: "005z", Owner: { Name: "Dana K." } } }
            : undefined,
      ],
      calls,
    );
    const adapter = new SalesforceAdapter(CREDS, impl);
    const rec = await adapter.getRecord("Opportunity", "006x", ["Name", "OwnerId"]);
    expect(rec.fields.OwnerId).toBe("Dana K."); // id replaced with the owner's name
    expect(rec.refs?.OwnerId).toBe("005z"); // …and the id kept for drill-through
    expect(rec.refObjects?.OwnerId).toBe("User"); // single target from describe
    const retrieve = calls.find((c) => c.url.includes("/sobjects/Opportunity/006x"));
    expect(decodeURIComponent(retrieve?.url ?? "")).toContain("Owner.Name");
  });

  it("non-traversable references still ship a drill-through ref (raw id display)", async () => {
    const describeWithHistory = {
      ...OPP_DESCRIBE,
      fields: [
        ...OPP_DESCRIBE.fields,
        {
          name: "LastAmountChangedHistoryId", label: "Last Amount Changed", type: "reference",
          nillable: true, createable: false, updateable: false, defaultedOnCreate: false,
          relationshipName: "LastAmountChangedHistory", referenceTo: ["OpportunityHistory"],
        },
      ],
    };
    const { impl } = fetchStub([
      tokenHandler(),
      globalHandler,
      orgHandler,
      (url) =>
        url.includes("/sobjects/Opportunity/describe")
          ? { status: 200, json: describeWithHistory }
          : undefined,
      (url) =>
        url.includes("/sobjects/Opportunity/006x")
          ? { status: 200, json: { Id: "006x", LastAmountChangedHistoryId: "008z" } }
          : undefined,
    ]);
    const adapter = new SalesforceAdapter(CREDS, impl);
    const rec = await adapter.getRecord("Opportunity", "006x", ["Name", "LastAmountChangedHistoryId"]);
    expect(rec.fields.LastAmountChangedHistoryId).toBe("008z"); // no Name available
    expect(rec.refs?.LastAmountChangedHistoryId).toBe("008z"); // …but still clickable
    expect(rec.refObjects?.LastAmountChangedHistoryId).toBe("OpportunityHistory");
  });

  it("polymorphic references traverse the Name pseudo-object and resolve Type", async () => {
    // WhoId-style field: multiple targets → Name + Type are always queryable
    // on the polymorphic Name object, whatever the concrete targets are.
    const describeWithWho = {
      ...OPP_DESCRIBE,
      fields: [
        ...OPP_DESCRIBE.fields,
        {
          name: "WhoId", label: "Name ID", type: "reference",
          nillable: true, createable: true, updateable: true, defaultedOnCreate: false,
          relationshipName: "Who", referenceTo: ["Contact", "Lead"],
        },
      ],
    };
    const calls: { url: string; init?: RequestInit }[] = [];
    const { impl } = fetchStub(
      [
        tokenHandler(),
        globalHandler,
        orgHandler,
        (url) =>
          url.includes("/sobjects/Opportunity/describe")
            ? { status: 200, json: describeWithWho }
            : undefined,
        (url) =>
          url.includes("/sobjects/Opportunity/006x")
            ? {
                status: 200,
                json: { Id: "006x", WhoId: "00Qz", Who: { Name: "Lee Ramos", Type: "Lead" } },
              }
            : undefined,
      ],
      calls,
    );
    const adapter = new SalesforceAdapter(CREDS, impl);
    const rec = await adapter.getRecord("Opportunity", "006x", ["Name", "WhoId"]);
    expect(rec.fields.WhoId).toBe("Lee Ramos");
    expect(rec.refs?.WhoId).toBe("00Qz");
    expect(rec.refObjects?.WhoId).toBe("Lead"); // concrete target via Who.Type
    const retrieve = calls.find((c) => c.url.includes("/sobjects/Opportunity/006x"));
    const url = decodeURIComponent(retrieve?.url ?? "");
    expect(url).toContain("Who.Name");
    expect(url).toContain("Who.Type");
  });

  it("listFlows returns active screen flows via regular SOQL (empty on error)", async () => {
    // FlowDefinitionView is a REGULAR sObject — the Tooling API rejects it with
    // INVALID_TYPE, which used to silently empty this list on real orgs.
    const { impl } = fetchStub([
      tokenHandler(),
      (url) =>
        !url.includes("/tooling/") &&
        url.includes("/query") &&
        decodeURIComponent(url).includes("FlowDefinitionView")
          ? {
              status: 200,
              json: {
                totalSize: 2,
                records: [
                  { ApiName: "Renewal_Playbook", Label: "Renewal Playbook" },
                  { ApiName: "Discount_Approval", Label: "Discount Approval" },
                ],
              },
            }
          : undefined,
    ]);
    const adapter = new SalesforceAdapter(CREDS, impl);
    const flows = await adapter.listFlows();
    expect(flows.map((f) => f.api)).toEqual(["Renewal_Playbook", "Discount_Approval"]);
    expect(flows[0]?.label).toBe("Renewal Playbook");

    // Query error (no perms) → empty, not a throw.
    const { impl: impl2 } = fetchStub([
      tokenHandler(),
      (url) => (url.includes("/query") ? { status: 403, json: { error: "no access" } } : undefined),
    ]);
    expect(await new SalesforceAdapter(CREDS, impl2).listFlows()).toEqual([]);
  });

  it("getRelated queries the child object by its foreign-key field", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const { impl } = fetchStub(
      [
        tokenHandler(),
        (url) =>
          decodeURIComponent(url).includes("FROM OpportunityLineItem")
            ? { status: 200, json: { totalSize: 1, records: [{ Id: "0QLx", Name: "Line 1" }] } }
            : undefined,
      ],
      calls,
    );
    const adapter = new SalesforceAdapter(CREDS, impl);
    const page = await adapter.getRelated("006x", {
      object: "OpportunityLineItem",
      relationship: "OpportunityLineItems",
      foreignKey: "OpportunityId",
      columns: ["Name"],
      limit: 5,
    });
    expect(page.rows).toEqual([{ id: "0QLx", fields: { Name: "Line 1" } }]);
    const q = decodeURIComponent(calls.find((c) => c.url.includes("/query"))?.url ?? "");
    expect(q).toContain("FROM OpportunityLineItem WHERE OpportunityId = '006x'");
  });
});

  it("getFlowDefinition memoizes the definition (an interview refetches every step)", async () => {
    let queryCalls = 0;
    const { impl } = fetchStub([
      tokenHandler(),
      (url) => {
        if (url.includes("/query") && decodeURIComponent(url).includes("FlowDefinitionView")) {
          queryCalls += 1;
          return { status: 200, json: { totalSize: 1, records: [{ ActiveVersionId: "301X" }] } };
        }
        if (url.includes("/tooling/sobjects/Flow/301X")) {
          return {
            status: 200,
            json: { Metadata: { label: "Cached Flow", screens: [{ name: "S1", fields: [] }] } },
          };
        }
        return undefined;
      },
    ]);
    const adapter = new SalesforceAdapter(CREDS, impl);
    const first = await adapter.getFlowDefinition("Cached_Flow");
    const second = await adapter.getFlowDefinition("Cached_Flow");
    expect(first?.label).toBe("Cached Flow");
    expect(second).toBe(first); // same object — served from the memo
    expect(queryCalls).toBe(1);
  });
