import { describe, expect, it } from "vitest";
import { InMemoryConfigStore } from "./memory-store.js";
import { resolveSignIn } from "./sign-in.js";

const firstSigner = {
  orgId: "00D000000000001AAA",
  salesforceUserId: "005000000000001AAA",
  name: "Ada Admin",
  email: "ada@example.com",
  orgName: "Acme",
};

describe("resolveSignIn", () => {
  it("creates one workspace and makes its first signer an admin", async () => {
    const store = new InMemoryConfigStore();
    const signedIn = await resolveSignIn(store, firstSigner, () => "2026-07-27T00:00:00.000Z");

    expect(signedIn.workspace).toMatchObject({
      id: "sf_00d000000000001",
      name: "Acme",
    });
    expect(signedIn.account).toMatchObject({
      id: "ada@example.com",
      email: "ada@example.com",
    });
    expect(signedIn.role).toBe("admin");
  });

  it("auto-joins a later signer from the same org as a member", async () => {
    const store = new InMemoryConfigStore();
    const first = await resolveSignIn(store, firstSigner);
    const second = await resolveSignIn(store, {
      ...firstSigner,
      salesforceUserId: "005000000000002AAA",
      name: "Grace Rep",
      email: "grace@example.com",
    });

    expect(second.workspace.id).toBe(first.workspace.id);
    expect(second.role).toBe("member");
    expect(await store.listMembershipsForWorkspace(first.workspace.id)).toHaveLength(2);
  });

  it("keeps the original account id when Salesforce profile details change", async () => {
    const store = new InMemoryConfigStore();
    const original = await resolveSignIn(store, firstSigner);
    const returning = await resolveSignIn(store, {
      ...firstSigner,
      name: "Ada Lovelace",
      email: "ada.lovelace@example.com",
    });

    expect(returning.account.id).toBe(original.account.id);
    expect(returning.account.name).toBe("Ada Lovelace");
    expect(returning.account.email).toBe("ada.lovelace@example.com");
    expect(returning.role).toBe("admin");
  });
});
