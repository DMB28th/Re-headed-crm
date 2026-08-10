import { describe, expect, it } from "vitest";
import { InMemoryConfigStore } from "./memory-store.js";
import { newWorkspaceId, salesforceIdKey, type Account, type Workspace } from "./identity.js";

const account = (id: string, email: string): Account => ({
  id,
  email,
  name: id,
  createdAt: new Date().toISOString(),
});

const ownedWorkspace = (id: string, ownerAccountId: string): Workspace => ({
  id,
  ownerAccountId,
  name: "My workspace",
  createdAt: new Date().toISOString(),
});

describe("identity model", () => {
  it("generates ws_-prefixed workspace ids and 15-char org keys", () => {
    expect(newWorkspaceId()).toMatch(/^ws_[A-Za-z0-9_-]{16}$/);
    expect(newWorkspaceId()).not.toEqual(newWorkspaceId());
    expect(salesforceIdKey("00D8Z000001aBcDEFG")).toBe("00d8z000001abcd");
  });

  it("finds accounts by email, case-insensitively", async () => {
    const store = new InMemoryConfigStore();
    await store.upsertAccount(account("dana@acme.example", "Dana@Acme.example"));
    expect((await store.getAccountByEmail("dana@acme.EXAMPLE"))?.id).toBe("dana@acme.example");
    expect(await store.getAccountByEmail("nobody@acme.example")).toBeUndefined();
  });

  it("creates a workspace without an org and finds it by owner", async () => {
    const store = new InMemoryConfigStore();
    const ws = ownedWorkspace(newWorkspaceId(), "dana@acme.example");
    await store.createWorkspace(ws);
    expect((await store.getWorkspaceByOwner("dana@acme.example"))?.id).toBe(ws.id);
    expect(await store.getWorkspaceByOwner("other@acme.example")).toBeUndefined();
  });

  it("claims an org exclusively: second workspace gets a conflict", async () => {
    const store = new InMemoryConfigStore();
    const a = ownedWorkspace("ws_a", "a@x.example");
    const b = ownedWorkspace("ws_b", "b@y.example");
    await store.createWorkspace(a);
    await store.createWorkspace(b);

    const first = await store.claimOrg("ws_a", "00D8Z000001aBcDEFG", "Acme Corp");
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.workspace.salesforceOrgId).toBe("00D8Z000001aBcDEFG");
      expect(first.workspace.name).toBe("Acme Corp");
    }
    // 15-char form of the same org must also conflict.
    const second = await store.claimOrg("ws_b", "00D8Z000001aBcD");
    expect(second).toEqual({ ok: false, reason: "org-already-claimed" });
    // Routing by org id resolves to the claiming workspace.
    expect((await store.getWorkspaceByOrgId("00D8Z000001aBcD"))?.id).toBe("ws_a");
    // Re-claiming your own org is idempotent, not a conflict.
    expect((await store.claimOrg("ws_a", "00D8Z000001aBcDEFG")).ok).toBe(true);
  });

  it("releases a claim so the org routes nowhere, then another workspace can claim it", async () => {
    const store = new InMemoryConfigStore();
    await store.createWorkspace(ownedWorkspace("ws_a", "a@x.example"));
    await store.createWorkspace(ownedWorkspace("ws_b", "b@y.example"));
    await store.claimOrg("ws_a", "00D8Z000001aBcDEFG");
    await store.releaseOrg("ws_a");
    expect(await store.getWorkspaceByOrgId("00D8Z000001aBcDEFG")).toBeUndefined();
    expect((await store.claimOrg("ws_b", "00D8Z000001aBcDEFG")).ok).toBe(true);
  });

  it("sets a workspace owner (attach script path)", async () => {
    const store = new InMemoryConfigStore();
    await store.createWorkspace({ id: "t_demo", name: "Legacy", createdAt: new Date().toISOString() });
    await store.setWorkspaceOwner("t_demo", "dana@acme.example");
    expect((await store.getWorkspaceByOwner("dana@acme.example"))?.id).toBe("t_demo");
  });
});
