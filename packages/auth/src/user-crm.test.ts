import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { McpTokenStore, demoRunningUser } from "./mcp-tokens.js";
import { UserCrmStore } from "./user-crm.js";
import { isMeOwnerAsk, meFilterId } from "./types.js";

function wrap(db: PGlite) {
  return {
    query: async (text: string, params?: unknown[]) => {
      const result = await db.query(text, params);
      return { rows: result.rows as Record<string, unknown>[] };
    },
  };
}

describe("UserCrmStore + MCP token CRM stamps", () => {
  it("links SSO identity and stamps it onto minted tokens", async () => {
    const db = new PGlite();
    const sql = wrap(db);
    const links = new UserCrmStore(sql);
    const tokens = new McpTokenStore(sql);

    await links.upsertLink({
      tenantId: "org_1",
      userId: "user_1",
      crm: "salesforce",
      crmUserId: "005SFUSER",
      crmEmail: "ada@acme.test",
      source: "sso",
    });

    const link = await links.getLink("org_1", "user_1", "salesforce");
    expect(link?.crmUserId).toBe("005SFUSER");

    const { rawToken, record } = await tokens.create({
      tenantId: "org_1",
      userId: "user_1",
      label: "Claude",
      role: "admin",
      userName: "Ada",
      userEmail: "ada@acme.test",
      crmUserId: link!.crmUserId,
      crmOwnerId: link!.crmOwnerId ?? undefined,
      crm: "salesforce",
    });

    expect(record.crmUserId).toBe("005SFUSER");
    const resolved = await tokens.resolve(rawToken);
    expect(resolved?.user.crmUserId).toBe("005SFUSER");
    expect(meFilterId(resolved!.user)).toBe("005SFUSER");
  });

  it("scaffolds per-rep CRM tokens", async () => {
    const db = new PGlite();
    const store = new UserCrmStore(wrap(db));
    await store.upsertToken({
      tenantId: "org_1",
      userId: "user_1",
      crm: "hubspot",
      accessToken: "pat-xxx",
      refreshToken: "refresh-xxx",
      portalId: "12345",
    });
    const tok = await store.getToken("org_1", "user_1", "hubspot");
    expect(tok?.accessToken).toBe("pat-xxx");
    expect(tok?.portalId).toBe("12345");
  });

  it("me helpers", () => {
    expect(isMeOwnerAsk("me")).toBe(true);
    expect(isMeOwnerAsk("$me")).toBe(true);
    expect(isMeOwnerAsk("Priya")).toBe(false);
    expect(meFilterId(demoRunningUser())).toBe("Demo rep");
  });
});
