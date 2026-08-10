import { describe, expect, it } from "vitest";
import { InMemoryConfigStore } from "./memory-store.js";
import { newWorkspaceId } from "./identity.js";
import { resolveSignIn, UnclaimedOrgError } from "./sign-in.js";

const firstSigner = {
  orgId: "00D000000000001AAA",
  salesforceUserId: "005000000000001AAA",
  name: "Ada Admin",
  email: "ada@example.com",
  orgName: "Acme",
};

describe("resolveSignIn", () => {
  it("refuses a signer whose org no workspace has claimed", async () => {
    const store = new InMemoryConfigStore();

    const attempt = resolveSignIn(store, firstSigner, () => "2026-07-27T00:00:00.000Z");

    await expect(attempt).rejects.toBeInstanceOf(UnclaimedOrgError);
    await expect(attempt).rejects.toMatchObject({ orgId: firstSigner.orgId });
  });

  it("routes a signer to the workspace that claimed their org", async () => {
    const store = new InMemoryConfigStore();
    const ownerId = newWorkspaceId();
    await store.createWorkspace({
      id: ownerId,
      ownerAccountId: "owner@acme.example",
      name: "My workspace",
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    await store.claimOrg(ownerId, firstSigner.orgId, firstSigner.orgName);

    const signedIn = await resolveSignIn(store, firstSigner, () => "2026-07-27T00:00:00.000Z");

    expect(signedIn.workspace.id).toBe(ownerId);
    expect(signedIn.role).toBe("member");
  });

  it("keeps the original account id when Salesforce profile details change", async () => {
    const store = new InMemoryConfigStore();
    const ownerId = newWorkspaceId();
    await store.createWorkspace({
      id: ownerId,
      ownerAccountId: "owner@acme.example",
      name: "My workspace",
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    await store.claimOrg(ownerId, firstSigner.orgId, firstSigner.orgName);

    const original = await resolveSignIn(store, firstSigner);
    const returning = await resolveSignIn(store, {
      ...firstSigner,
      name: "Ada Lovelace",
      email: "ada.lovelace@example.com",
    });

    expect(returning.account.id).toBe(original.account.id);
    expect(returning.account.name).toBe("Ada Lovelace");
    expect(returning.account.email).toBe("ada.lovelace@example.com");
  });

  it("converges the owner's chat sign-in onto their real account", async () => {
    const store = new InMemoryConfigStore();
    const ownerId = newWorkspaceId();
    await store.createWorkspace({
      id: ownerId,
      ownerAccountId: "owner@acme.example",
      name: "My workspace",
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    await store.claimOrg(ownerId, firstSigner.orgId, firstSigner.orgName);
    await store.upsertAccount({
      id: "owner@acme.example",
      email: "owner@acme.example",
      name: "Owner",
      salesforceUserId: firstSigner.salesforceUserId,
      createdAt: "2026-07-01T00:00:00.000Z",
    });

    const signedIn = await resolveSignIn(store, {
      ...firstSigner,
      email: "different-email@example.com",
    });

    expect(signedIn.account.id).toBe("owner@acme.example");
  });

  it("never promotes: a signer into an empty claimed workspace is a member", async () => {
    const store = new InMemoryConfigStore();
    const ownerId = newWorkspaceId();
    await store.createWorkspace({
      id: ownerId,
      ownerAccountId: "owner@acme.example",
      name: "My workspace",
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    await store.claimOrg(ownerId, firstSigner.orgId, firstSigner.orgName);
    expect(await store.listMembershipsForWorkspace(ownerId)).toHaveLength(0);

    const signedIn = await resolveSignIn(store, firstSigner);

    expect(signedIn.role).toBe("member");
  });
});
