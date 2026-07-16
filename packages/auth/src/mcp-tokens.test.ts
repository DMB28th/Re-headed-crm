import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { McpTokenStore, demoRunningUser } from "./mcp-tokens.js";

function wrap(db: PGlite) {
  return {
    query: async (text: string, params?: unknown[]) => {
      const result = await db.query(text, params);
      return { rows: result.rows as Record<string, unknown>[] };
    },
  };
}

describe("McpTokenStore", () => {
  it("mints, resolves, lists, and revokes tokens", async () => {
    const db = new PGlite();
    const store = new McpTokenStore(wrap(db));

    const { record, rawToken } = await store.create({
      tenantId: "org_abc",
      userId: "user_1",
      label: "Claude connector",
      role: "admin",
      userEmail: "admin@acme.test",
      userName: "Ada Admin",
    });

    expect(rawToken.startsWith("cs_live_")).toBe(true);
    expect(record.tokenPrefix.startsWith("cs_live_")).toBe(true);

    const resolved = await store.resolve(rawToken);
    expect(resolved?.tenantId).toBe("org_abc");
    expect(resolved?.user.displayName).toBe("Ada Admin");
    expect(resolved?.user.authMethod).toBe("mcp_token");
    expect(resolved?.user.role).toBe("admin");

    expect(await store.resolve("cs_live_bogus")).toBeNull();
    expect(await store.list("org_abc")).toHaveLength(1);

    expect(await store.revoke("org_abc", record.id)).toBe(true);
    expect(await store.resolve(rawToken)).toBeNull();
    expect(await store.list("org_abc")).toHaveLength(0);
  });

  it("demoRunningUser marks system principal", () => {
    expect(demoRunningUser("demo").role).toBe("system");
    expect(demoRunningUser("shared_secret").authMethod).toBe("shared_secret");
  });
});
