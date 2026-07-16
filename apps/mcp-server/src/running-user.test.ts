import { describe, expect, it } from "vitest";
import { demoRunningUser } from "@cardstack/auth";
import { auditUserLabel } from "./server.js";

describe("auditUserLabel", () => {
  it("uses CRM user in demo mode", () => {
    expect(auditUserLabel(demoRunningUser("demo"), "Demo rep")).toBe("Demo rep");
  });

  it("prefixes Cardstack identity for MCP tokens", () => {
    const user = {
      userId: "u1",
      displayName: "Ada Admin",
      email: "ada@acme.test",
      role: "admin" as const,
      authMethod: "mcp_token" as const,
      crmUserId: "005SF",
    };
    expect(auditUserLabel(user, "HubSpot private app")).toBe(
      "Ada Admin (CRM: HubSpot private app)",
    );
  });
});

describe("owner=me user variables", () => {
  it("filters search to the running user's CRM owner", async () => {
    const { createCardstackServer } = await import("./server.js");
    const { MockCrmAdapter } = await import("@cardstack/crm-adapters");
    const { InMemoryConfigStore, DEMO_TENANT_ID } = await import("./config/store.js");
    const { InMemoryAuditLog } = await import("./audit.js");
    const { InMemoryPreferenceStore } = await import("./config/preferences.js");
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
    const { demoRunningUser } = await import("@cardstack/auth");

    const server = await createCardstackServer({
      adapter: new MockCrmAdapter(),
      configStore: new InMemoryConfigStore(),
      auditLog: new InMemoryAuditLog(),
      preferences: new InMemoryPreferenceStore(),
      tenantId: DEMO_TENANT_ID,
      runningUser: demoRunningUser(),
    });
    const client = new Client({ name: "test", version: "0.0.1" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(st), client.connect(ct)]);

    const result = await client.callTool({
      name: "crm_search",
      arguments: { object: "deals", owner: "me", openOnly: true, limit: 50 },
    });
    const payload = result.structuredContent as {
      page?: { rows?: { fields?: Record<string, unknown> }[] };
    };
    const owners = (payload.page?.rows ?? []).map((r) => r.fields?.deal_owner);
    expect(owners.length).toBeGreaterThan(0);
    expect(owners.every((o) => o === "Demo rep")).toBe(true);
  });
});
