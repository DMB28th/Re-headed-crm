import { describe, expect, it } from "vitest";
import { InMemoryConfigStore } from "@cardstack/config-store";
import { describeAdmins, workspaceAdmins, workspaceMembers } from "./admins";

const CREATED = "2026-08-01T00:00:00.000Z";

async function seed() {
  const store = new InMemoryConfigStore();
  await store.createWorkspace({ id: "w1", salesforceOrgId: "00D1", name: "Acme", createdAt: CREATED });
  const people: [string, string, string, "admin" | "member"][] = [
    ["zoe@acme.test", "Zoe Admin", "005A", "admin"],
    ["ada@acme.test", "Ada Admin", "005B", "admin"],
    ["rex@acme.test", "Rex Rep", "005C", "member"],
  ];
  for (const [id, name, sfId, role] of people) {
    await store.upsertAccount({ id, salesforceUserId: sfId, name, email: id, createdAt: CREATED });
    await store.setMembership({ accountId: id, workspaceId: "w1", role, createdAt: CREATED });
  }
  return store;
}

describe("workspaceMembers", () => {
  it("lists admins first, then members, each by name", async () => {
    const rows = await workspaceMembers(await seed(), "w1");
    expect(rows.map((r) => r.account.name)).toEqual(["Ada Admin", "Zoe Admin", "Rex Rep"]);
  });

  it("drops memberships whose account row is missing rather than throwing", async () => {
    const store = await seed();
    await store.setMembership({
      accountId: "ghost@acme.test",
      workspaceId: "w1",
      role: "member",
      createdAt: CREATED,
    });
    const rows = await workspaceMembers(store, "w1");
    expect(rows.map((r) => r.account.id)).not.toContain("ghost@acme.test");
  });
});

describe("workspaceAdmins", () => {
  it("returns only admins", async () => {
    const admins = await workspaceAdmins(await seed(), "w1");
    expect(admins.map((a) => a.id)).toEqual(["ada@acme.test", "zoe@acme.test"]);
  });
});

describe("describeAdmins", () => {
  const account = (name: string, email?: string) => ({
    id: email ?? name,
    salesforceUserId: name,
    name,
    ...(email ? { email } : {}),
    createdAt: CREATED,
  });

  it("is undefined when there is no one to ask", () => {
    expect(describeAdmins([])).toBeUndefined();
  });

  it("names a single admin with their email", () => {
    expect(describeAdmins([account("Ada", "ada@acme.test")])).toBe("Ada (ada@acme.test)");
  });

  it("joins two with or", () => {
    expect(describeAdmins([account("Ada", "a@x"), account("Zoe", "z@x")])).toBe(
      "Ada (a@x) or Zoe (z@x)",
    );
  });

  it("caps the list rather than printing every name", () => {
    const many = ["A", "B", "C", "D", "E"].map((n) => account(n, `${n}@x`));
    expect(describeAdmins(many)).toBe("A (A@x), B (B@x) or C (C@x), or 2 other admins");
  });
});
