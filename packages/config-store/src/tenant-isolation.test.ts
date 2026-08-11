/**
 * PLAN.md §Security, non-negotiable: "per-tenant isolation on every query (no
 * cross-tenant config/record leakage — test this explicitly)".
 *
 * Now that workspaces are account-owned and orgs are claimed exclusively
 * (docs/superpowers/specs/2026-08-10-self-serve-accounts-design.md §7/§8),
 * this is the test that says two customers cannot see each other. It
 * exercises the boundary the way a real request does: an owner claims an
 * org, a rep signs in through it, config is written as each workspace, and
 * neither read path — nor a claim race, nor a release-and-reclaim — crosses
 * a customer's data into another's.
 */
import { describe, expect, it } from "vitest";
import { InMemoryConfigStore } from "./memory-store.js";
import { resolveSignIn } from "./sign-in.js";
import { newWorkspaceId } from "./identity.js";

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

/** Claim-a-workspace-for-an-owner, the way Studio's self-serve signup does
 *  it: create the account, create their (org-less) workspace, then claim the
 *  org exclusively. Every isolation test below builds its workspaces this
 *  way — a workspace exists only because an owner claimed it. */
async function claimedWorkspace(
  store: InMemoryConfigStore,
  ownerEmail: string,
  orgId: string,
  orgName: string,
): Promise<{ ownerId: string; workspaceId: string }> {
  const ownerId = ownerEmail; // normalizeUserId(email) is identity for plain emails
  await store.upsertAccount({
    id: ownerId,
    email: ownerEmail,
    name: orgName,
    createdAt: new Date().toISOString(),
  });
  const wsId = newWorkspaceId();
  await store.createWorkspace({
    id: wsId,
    ownerAccountId: ownerId,
    name: "My workspace",
    createdAt: new Date().toISOString(),
  });
  const claim = await store.claimOrg(wsId, orgId, orgName);
  if (!claim.ok) throw new Error("setup claim failed");
  return { ownerId, workspaceId: wsId };
}

describe("cross-tenant isolation", () => {
  it("two accounts claiming two orgs get two workspaces", async () => {
    const store = new InMemoryConfigStore();
    const ownerA = await claimedWorkspace(store, "owner-a@acme.example", acme.orgId, acme.orgName);
    const ownerB = await claimedWorkspace(
      store,
      "owner-b@globex.example",
      globex.orgId,
      globex.orgName,
    );

    // A rep from each org signs in through the chat lane.
    const a = await resolveSignIn(store, acme);
    const b = await resolveSignIn(store, globex);

    expect(a.workspace.id).toBe(ownerA.workspaceId);
    expect(b.workspace.id).toBe(ownerB.workspaceId);
    expect(a.workspace.id).not.toBe(b.workspace.id);
    // Chat-lane sign-in always populates membership, never authority.
    expect(a.role).toBe("member");
    expect(b.role).toBe("member");
    expect(await store.getMembership(a.account.id, b.workspace.id)).toBeUndefined();
    expect(await store.getMembership(b.account.id, a.workspace.id)).toBeUndefined();
  });

  it("never leaks layouts, connections, or user tokens across workspaces", async () => {
    const store = new InMemoryConfigStore();
    const a = await claimedWorkspace(store, "owner-a@acme.example", acme.orgId, acme.orgName);
    const b = await claimedWorkspace(
      store,
      "owner-b@globex.example",
      globex.orgId,
      globex.orgName,
    );

    await store.saveDraft(layoutFor(a.workspaceId, "Opportunity"));
    await store.publish(a.workspaceId, "Opportunity");
    await store.setConnection({
      tenantId: a.workspaceId,
      status: "connected",
      crm: "salesforce",
      label: "admin OAuth",
      changedAt: new Date().toISOString(),
      credentials: { authType: "oauth", refreshToken: "acme-secret-token" },
    });
    await store.setUserConnection({
      tenantId: a.workspaceId,
      userId: a.ownerId,
      status: "connected",
      crm: "salesforce",
      label: "user OAuth",
      changedAt: new Date().toISOString(),
      credentials: { refreshToken: "acme-user-token" },
    });

    // Globex sees none of it.
    expect(await store.getLayout(b.workspaceId, "Opportunity")).toBeUndefined();
    expect(await store.listConfiguredObjects(b.workspaceId)).toEqual([]);
    expect((await store.getConnection(b.workspaceId)).credentials).toBeUndefined();
    expect(await store.listUserConnections(b.workspaceId)).toEqual([]);
    // Not even by guessing Acme's account id.
    expect(
      await store.getUserConnection(b.workspaceId, a.ownerId, "salesforce"),
    ).toBeUndefined();

    // ...and Acme still sees its own.
    expect(await store.getLayout(a.workspaceId, "Opportunity")).toBeDefined();
    expect(await store.listConfiguredObjects(a.workspaceId)).toEqual(["Opportunity"]);
  });

  it("treats the 15- and 18-char forms of one org id as the same workspace", async () => {
    const store = new InMemoryConfigStore();
    // Claim with the 18-char id...
    const owner = await claimedWorkspace(store, "owner@acme.example", acme.orgId, acme.orgName);
    // ...a rep presenting the 15-char form must land in the SAME workspace.
    // Salesforce APIs disagree about id length; two forms must not fork a
    // customer's workspace in half.
    const fifteen = await resolveSignIn(store, { ...acme, orgId: acme.orgId.slice(0, 15) });

    expect(fifteen.workspace.id).toBe(owner.workspaceId);
    expect(await store.listMembershipsForWorkspace(owner.workspaceId)).toHaveLength(1);
  });

  it("decides a claim race by uniqueness: the loser gets a typed refusal and no data", async () => {
    const store = new InMemoryConfigStore();
    const a = await claimedWorkspace(store, "a@one.example", "00D111111111111AAA", "One");
    // Second owner, same org:
    await store.upsertAccount({
      id: "b@two.example",
      email: "b@two.example",
      name: "B",
      createdAt: new Date().toISOString(),
    });
    const wsB = newWorkspaceId();
    await store.createWorkspace({
      id: wsB,
      ownerAccountId: "b@two.example",
      name: "My workspace",
      createdAt: new Date().toISOString(),
    });
    expect(await store.claimOrg(wsB, "00D111111111111AAA")).toEqual({
      ok: false,
      reason: "org-already-claimed",
    });
    // The loser's workspace holds nothing of the winner's:
    expect((await store.getWorkspaceByOrgId("00D111111111111AAA"))?.id).toBe(a.workspaceId);
    expect((await store.getWorkspace(wsB))?.salesforceOrgId).toBeUndefined();
  });

  it("re-claim after release moves the ROUTE, never the DATA (spec §7)", async () => {
    const store = new InMemoryConfigStore();
    const a = await claimedWorkspace(store, "a@one.example", "00D111111111111AAA", "One");
    // A's config exists under A's workspace id (reuse the file's existing layout-seeding idiom):
    await store.saveDraft(layoutFor(a.workspaceId, "Opportunity"));
    await store.publish(a.workspaceId, "Opportunity");
    await store.releaseOrg(a.workspaceId);
    const b = await claimedWorkspace(store, "b@two.example", "00D111111111111AAA", "One again");
    // Routing now reaches B's workspace:
    expect((await store.getWorkspaceByOrgId("00D111111111111AAA"))?.id).toBe(b.workspaceId);
    // B's workspace has no layouts; A's workspace still has its layout, using
    // the same read calls the existing leak test uses.
    expect(await store.getLayout(b.workspaceId, "Opportunity")).toBeUndefined();
    expect(await store.listConfiguredObjects(b.workspaceId)).toEqual([]);
    expect(await store.getLayout(a.workspaceId, "Opportunity")).toBeDefined();
    expect(await store.listConfiguredObjects(a.workspaceId)).toEqual(["Opportunity"]);
  });
});
