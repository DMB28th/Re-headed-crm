/**
 * PLAN.md §Security, non-negotiable: "per-tenant isolation on every query (no
 * cross-tenant config/record leakage — test this explicitly)".
 *
 * Now that one deployment serves many Salesforce orgs, this is the test that
 * says two customers cannot see each other. It exercises the boundary the way a
 * real request does: sign in as two different orgs, write config as each, and
 * assert that neither read path crosses over.
 */
import { describe, expect, it } from "vitest";
import { InMemoryConfigStore } from "./memory-store.js";
import { resolveSignIn } from "./sign-in.js";
import { workspaceIdForOrg } from "./identity.js";

const acme = {
  orgId: "00D000000000001AAA",
  salesforceUserId: "005000000000001AAA",
  name: "Ada Admin",
  email: "ada@acme.example",
  orgName: "Acme",
};

const globex = {
  orgId: "00D000000000002AAA",
  salesforceUserId: "005000000000002AAA",
  name: "Hank Scorpio",
  email: "hank@globex.example",
  orgName: "Globex",
};

const layoutFor = (tenantId: string, object: string) => ({
  version: 1 as const,
  tenantId,
  crm: "salesforce" as const,
  object,
  revision: 1,
  recordCard: { sections: [], actions: [] },
});

describe("cross-tenant isolation", () => {
  it("gives two Salesforce orgs separate workspaces", async () => {
    const store = new InMemoryConfigStore();
    const a = await resolveSignIn(store, acme);
    const b = await resolveSignIn(store, globex);

    expect(a.workspace.id).toBe(workspaceIdForOrg(acme.orgId));
    expect(b.workspace.id).toBe(workspaceIdForOrg(globex.orgId));
    expect(a.workspace.id).not.toBe(b.workspace.id);
    // Each org's first signer administers their OWN workspace only.
    expect(a.role).toBe("admin");
    expect(b.role).toBe("admin");
    expect(await store.getMembership(a.account.id, b.workspace.id)).toBeUndefined();
    expect(await store.getMembership(b.account.id, a.workspace.id)).toBeUndefined();
  });

  it("never leaks layouts, connections, or user tokens across workspaces", async () => {
    const store = new InMemoryConfigStore();
    const a = await resolveSignIn(store, acme);
    const b = await resolveSignIn(store, globex);

    await store.saveDraft(layoutFor(a.workspace.id, "Opportunity"));
    await store.publish(a.workspace.id, "Opportunity");
    await store.setConnection({
      tenantId: a.workspace.id,
      status: "connected",
      crm: "salesforce",
      label: "admin OAuth",
      changedAt: new Date().toISOString(),
      credentials: { authType: "oauth", refreshToken: "acme-secret-token" },
    });
    await store.setUserConnection({
      tenantId: a.workspace.id,
      userId: a.account.id,
      status: "connected",
      crm: "salesforce",
      label: "user OAuth",
      changedAt: new Date().toISOString(),
      credentials: { refreshToken: "acme-user-token" },
    });

    // Globex sees none of it.
    expect(await store.getLayout(b.workspace.id, "Opportunity")).toBeUndefined();
    expect(await store.listConfiguredObjects(b.workspace.id)).toEqual([]);
    expect((await store.getConnection(b.workspace.id)).credentials).toBeUndefined();
    expect(await store.listUserConnections(b.workspace.id)).toEqual([]);
    // Not even by guessing Acme's account id.
    expect(
      await store.getUserConnection(b.workspace.id, a.account.id, "salesforce"),
    ).toBeUndefined();

    // ...and Acme still sees its own.
    expect(await store.getLayout(a.workspace.id, "Opportunity")).toBeDefined();
    expect(await store.listConfiguredObjects(a.workspace.id)).toEqual(["Opportunity"]);
  });

  it("treats the 15- and 18-char forms of one org id as the same workspace", async () => {
    const store = new InMemoryConfigStore();
    const eighteen = await resolveSignIn(store, acme);
    // Salesforce APIs disagree about id length; two forms must not fork a
    // customer's workspace in half.
    const fifteen = await resolveSignIn(store, { ...acme, orgId: acme.orgId.slice(0, 15) });

    expect(fifteen.workspace.id).toBe(eighteen.workspace.id);
    expect(await store.listMembershipsForWorkspace(eighteen.workspace.id)).toHaveLength(1);
  });
});
