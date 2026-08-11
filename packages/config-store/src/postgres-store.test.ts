/**
 * PostgresConfigStore against PGlite — real Postgres (WASM) in-process, so the
 * SQL (partial unique indexes, ON CONFLICT ... WHERE, jsonb, transactions) is
 * exercised for real without a daemon.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { DEFAULT_CUSTOM_SCREEN_SOURCE } from "@cardstack/core";
import { PostgresConfigStore, type SqlSession } from "./postgres-store.js";
import { DEMO_TENANT_ID, demoDealsLayout } from "./seed.js";
import { newWorkspaceId, type Account, type Workspace } from "./identity.js";

let store: PostgresConfigStore;

beforeEach(async () => {
  const db = new PGlite();
  const session: SqlSession = {
    query: async (text, params) =>
      (await db.query(text, params as never[])) as { rows: Record<string, unknown>[] },
  };
  store = new PostgresConfigStore(session);
});

const editedDraft = () => {
  const draft = structuredClone(demoDealsLayout);
  draft.recordCard.sections[0]!.fields = draft.recordCard.sections[0]!.fields.filter(
    (f) => f.api !== "next_step",
  );
  return draft;
};

const workspace = (id: string, overrides: Partial<Workspace> = {}): Workspace => ({
  id,
  name: "My workspace",
  createdAt: new Date().toISOString(),
  ...overrides,
});

const account = (id: string, email: string): Account => ({
  id,
  email,
  name: id,
  createdAt: new Date().toISOString(),
});

describe("PostgresConfigStore", () => {
  it("seeds the demo tenant on first boot", async () => {
    const layout = await store.getLayout(DEMO_TENANT_ID, "deals");
    expect(layout?.revision).toBe(4);
    expect(await store.listConfiguredObjects(DEMO_TENANT_ID)).toEqual(["deals"]);
    expect((await store.getViewExposures(DEMO_TENANT_ID, "deals")).length).toBe(3);
    expect((await store.getHomeCard(DEMO_TENANT_ID))?.blocks.length).toBe(3);
  });

  it("backfills the demo home card on databases seeded before home_cards existed", async () => {
    const db = new PGlite();
    const session: SqlSession = {
      query: async (text, params) =>
        (await db.query(text, params as never[])) as { rows: Record<string, unknown>[] },
    };
    const first = new PostgresConfigStore(session);
    // Simulate a pre-M4 database: layouts seeded, home_cards row missing.
    await first.getLayout(DEMO_TENANT_ID, "deals");
    await session.query("DELETE FROM home_cards", []);

    const rebooted = new PostgresConfigStore(session);
    expect((await rebooted.getHomeCard(DEMO_TENANT_ID))?.blocks.length).toBe(3);

    // ...and a later boot must not clobber an admin's published card.
    const current = (await rebooted.getHomeCard(DEMO_TENANT_ID))!;
    await rebooted.setHomeCard({
      ...current,
      blocks: current.blocks.filter((b) => b.type !== "recent"),
    });
    await rebooted.publishHomeCard(DEMO_TENANT_ID);
    const third = new PostgresConfigStore(session);
    expect((await third.getHomeCard(DEMO_TENANT_ID))!.blocks).toHaveLength(2);
  });

  it("draft → publish → rollback lifecycle matches the file store semantics", async () => {
    await store.saveDraft(editedDraft());
    // reps still see v4 while the draft exists
    expect((await store.getLayout(DEMO_TENANT_ID, "deals"))!.revision).toBe(4);

    const v5 = await store.publish(DEMO_TENANT_ID, "deals");
    expect(v5.revision).toBe(5);
    expect(v5.recordCard.sections[0]!.fields.map((f) => f.api)).not.toContain("next_step");

    const record = await store.getLayoutRecord(DEMO_TENANT_ID, "deals");
    expect(record.draft).toBeNull();
    expect(record.history.map((c) => c.revision)).toEqual([4]);

    const v6 = await store.rollback(DEMO_TENANT_ID, "deals", 4);
    expect(v6.revision).toBe(6);
    expect(v6.recordCard.sections[0]!.fields.map((f) => f.api)).toContain("next_step");

    const events = await store.listPublishes(DEMO_TENANT_ID);
    expect(events.map((e) => e.kind)).toEqual(["rollback", "publish"]);
  });

  it("saveDraft upserts; discardDraft removes", async () => {
    await store.saveDraft(editedDraft());
    await store.saveDraft(demoDealsLayout); // overwrite
    const record = await store.getLayoutRecord(DEMO_TENANT_ID, "deals");
    expect(record.draft?.recordCard.sections[0]!.fields.map((f) => f.api)).toContain("next_step");
    await store.discardDraft(DEMO_TENANT_ID, "deals");
    expect((await store.getLayoutRecord(DEMO_TENANT_ID, "deals")).draft).toBeNull();
  });

  it("publish with no draft rolls the transaction back cleanly", async () => {
    await expect(store.publish(DEMO_TENANT_ID, "deals")).rejects.toThrow("No draft");
    // store still usable after ROLLBACK
    expect((await store.getLayout(DEMO_TENANT_ID, "deals"))!.revision).toBe(4);
  });

  it("home card publish bumps revision and logs", async () => {
    const current = (await store.getHomeCard(DEMO_TENANT_ID))!;
    await store.setHomeCard({
      ...current,
      blocks: current.blocks.filter((b) => b.type !== "recent"),
    });
    // Staged, not live — reps keep the published card until publish.
    expect((await store.getHomeCard(DEMO_TENANT_ID))!.blocks).toHaveLength(current.blocks.length);

    const published = await store.publishHomeCard(DEMO_TENANT_ID);
    expect(published.revision).toBe(2);
    expect((await store.getHomeCard(DEMO_TENANT_ID))!.blocks).toHaveLength(2);
    expect((await store.listPublishes(DEMO_TENANT_ID))[0]).toMatchObject({
      object: "home card",
      revision: 2,
    });
  });

  it("connection defaults to connected mock; disconnect round-trips", async () => {
    // No row (databases initialized before the connections table) = connected.
    expect((await store.getConnection(DEMO_TENANT_ID)).status).toBe("connected");
    await store.setConnection({
      tenantId: DEMO_TENANT_ID,
      status: "disconnected",
      crm: "hubspot",
      label: "mock portal",
      changedAt: new Date().toISOString(),
    });
    expect((await store.getConnection(DEMO_TENANT_ID)).status).toBe("disconnected");
  });

  it("stores per-user OAuth connections", async () => {
    await store.setUserConnection({
      tenantId: DEMO_TENANT_ID,
      userId: "dana",
      status: "connected",
      crm: "salesforce",
      label: "user OAuth",
      changedAt: "2026-07-20T12:01:00.000Z",
      connectedUser: "Dana Seller",
      credentials: { authType: "oauth", clientId: "app", clientSecret: "secret", refreshToken: "user" },
    });
    expect((await store.getUserConnection(DEMO_TENANT_ID, "dana", "salesforce"))?.credentials?.refreshToken).toBe(
      "user",
    );
    expect(await store.getUserConnection(DEMO_TENANT_ID, "lee", "salesforce")).toBeUndefined();
    await store.deleteUserConnection(DEMO_TENANT_ID, "dana", "salesforce");
    expect(await store.getUserConnection(DEMO_TENANT_ID, "dana", "salesforce")).toBeUndefined();
  });

  it("custom lists ride inside the view_exposures jsonb", async () => {
    const config = (await store.getViewExposuresConfig(DEMO_TENANT_ID, "deals"))!;
    await store.setViewExposures({
      ...config,
      customLists: [{ id: "cl-pg", name: "PG list", filters: [], visibility: "workspace" }],
      views: [...config.views, { viewId: "cl-pg", exposed: true, aliases: [], isDefault: false }],
    });
    expect(await store.getCustomLists(DEMO_TENANT_ID, "deals")).toHaveLength(0);

    await store.publishViewExposures(DEMO_TENANT_ID, "deals");
    expect((await store.getCustomLists(DEMO_TENANT_ID, "deals"))[0]?.name).toBe("PG list");
  });

  it("stages every surface and publishes a batch, matching the file store", async () => {
    const config = (await store.getViewExposuresConfig(DEMO_TENANT_ID, "deals"))!;
    await store.setViewExposures({
      ...config,
      customLists: [{ id: "cl-batch", name: "Batch list", filters: [], visibility: "workspace" }],
      views: [...config.views, { viewId: "cl-batch", exposed: true, aliases: [], isDefault: false }],
    });
    const home = (await store.getHomeCard(DEMO_TENANT_ID))!;
    await store.setHomeCard({ ...home, blocks: [home.blocks[0]!] });

    const staged = await store.listStagedChanges(DEMO_TENANT_ID);
    expect(staged.map((change) => change.surface).sort()).toEqual(["exposures", "homecard"]);

    const results = await store.publishStaged(
      DEMO_TENANT_ID,
      staged.map(({ surface, object, audience }) => ({ surface, object, audience })),
    );
    expect(results.every((result) => result.ok)).toBe(true);
    expect(await store.listStagedChanges(DEMO_TENANT_ID)).toEqual([]);
    expect((await store.getCustomLists(DEMO_TENANT_ID, "deals"))[0]?.name).toBe("Batch list");

    const events = (await store.listPublishes(DEMO_TENANT_ID)).slice(0, 2);
    expect(new Set(events.map((event) => event.batchId)).size).toBe(1);
  });

  it("lists surface history and rolls back through the dispatcher, like the file store", async () => {
    const home = (await store.getHomeCard(DEMO_TENANT_ID))!;
    await store.setHomeCard({ ...home, blocks: [home.blocks[0]!] });
    await store.publishHomeCard(DEMO_TENANT_ID);

    const history = await store.listSurfaceHistory(DEMO_TENANT_ID);
    const card = history.find((entry) => entry.surface === "homecard")!;
    expect(card.publishedRevision).toBe(2);
    expect(card.revisions.map((r) => r.revision)).toEqual([1]);

    const restored = await store.rollbackStaged(
      DEMO_TENANT_ID,
      { surface: "homecard", object: "default", audience: "default" },
      1,
    );
    expect(restored.revision).toBe(3);
    expect((await store.getHomeCard(DEMO_TENANT_ID))!.blocks.length).toBe(home.blocks.length);
  });

  it("rolls exposures back under a NEW revision", async () => {
    const v1 = (await store.getViewExposuresConfig(DEMO_TENANT_ID, "deals"))!;
    await store.setViewExposures({
      ...v1,
      customLists: [{ id: "cl-rb", name: "Temp", filters: [], visibility: "workspace" }],
      views: [...v1.views, { viewId: "cl-rb", exposed: true, aliases: [], isDefault: false }],
    });
    await store.publishViewExposures(DEMO_TENANT_ID, "deals");

    const restored = await store.rollbackViewExposures(DEMO_TENANT_ID, "deals", 1);
    expect(restored.revision).toBe(3);
    expect(await store.getCustomLists(DEMO_TENANT_ID, "deals")).toHaveLength(0);
  });

  it("stores flow modes and custom screen publishes", async () => {
    await store.setFlowRenderMode({
      version: 1,
      tenantId: DEMO_TENANT_ID,
      flowApiName: "Renewal_Playbook",
      mode: "native",
      fallback: "open-in-salesforce",
    });
    expect(await store.getFlowRenderModes(DEMO_TENANT_ID)).toEqual([]);

    await store.publishFlowRenderMode(DEMO_TENANT_ID, "Renewal_Playbook");
    expect(await store.getFlowRenderModes(DEMO_TENANT_ID)).toMatchObject([
      { flowApiName: "Renewal_Playbook", mode: "native" },
    ]);

    await store.saveCustomScreenDraft({
      version: 1,
      tenantId: DEMO_TENANT_ID,
      id: "cs-onsite",
      label: "Onsite scheduling",
      // A custom screen only means anything as a screen-flow screen.
      flowApiName: "Renewal_Playbook",
      source: DEFAULT_CUSTOM_SCREEN_SOURCE,
      status: "draft",
      revision: 1,
    });
    const published = await store.publishCustomScreen(DEMO_TENANT_ID, "cs-onsite");
    expect(published).toMatchObject({ status: "published", revision: 1 });
    expect((await store.getCustomScreens(DEMO_TENANT_ID))[0]?.id).toBe("cs-onsite");
  });

  // ---- Identity (accounts / workspaces / memberships) ----

  it("creates an org-less workspace and an SF-less account (nullable org_key/sf_user_key)", async () => {
    const id = newWorkspaceId();
    await store.createWorkspace(workspace(id));
    expect((await store.getWorkspace(id))?.salesforceOrgId).toBeUndefined();

    await store.upsertAccount(account("dana@acme.example", "dana@acme.example"));
    expect((await store.getAccount("dana@acme.example"))?.salesforceUserId).toBeUndefined();
  });

  it("getAccountByEmail matches case-insensitively", async () => {
    await store.upsertAccount(account("dana@acme.example", "Dana@Acme.example"));
    expect((await store.getAccountByEmail("dana@acme.EXAMPLE"))?.id).toBe("dana@acme.example");
    expect(await store.getAccountByEmail("nobody@acme.example")).toBeUndefined();
  });

  it("claimOrg is exclusive: a second workspace claiming the same org gets a typed conflict", async () => {
    await store.createWorkspace(workspace("ws_a", { ownerAccountId: "dana@acme.example" }));
    await store.createWorkspace(workspace("ws_b", { ownerAccountId: "evan@acme.example" }));

    const first = await store.claimOrg("ws_a", "00D8Z000001aBcDEFG", "Acme Corp");
    expect(first).toMatchObject({ ok: true, workspace: { salesforceOrgId: "00D8Z000001aBcDEFG", name: "Acme Corp" } });

    // The DB's UNIQUE constraint on org_key (23505) is what decides the race,
    // not application logic — this is the loser's typed result, never a throw.
    const second = await store.claimOrg("ws_b", "00D8Z000001aBcD");
    expect(second).toEqual({ ok: false, reason: "org-already-claimed" });
    // The loser's own workspace is untouched.
    expect((await store.getWorkspace("ws_b"))?.salesforceOrgId).toBeUndefined();
  });

  it("claimOrg collapses the 15- and 18-char Salesforce id for the same org", async () => {
    await store.createWorkspace(workspace("ws_a"));
    await store.claimOrg("ws_a", "00D8Z000001aBcDEFG"); // 18-char
    expect((await store.getWorkspaceByOrgId("00D8Z000001aBcD"))?.id).toBe("ws_a"); // 15-char lookup

    await store.createWorkspace(workspace("ws_b"));
    // A second workspace claiming via the 15-char form of the SAME org still
    // collapses onto the same key and conflicts.
    const conflict = await store.claimOrg("ws_b", "00D8Z000001aBcD");
    expect(conflict).toEqual({ ok: false, reason: "org-already-claimed" });
  });

  it("claimOrg is idempotent for the current holder (self-re-claim never conflicts)", async () => {
    await store.createWorkspace(workspace("ws_a"));
    await store.claimOrg("ws_a", "00D8Z000001aBcDEFG");
    const again = await store.claimOrg("ws_a", "00D8Z000001aBcDEFG");
    expect(again.ok).toBe(true);
  });

  it("claimOrg throws for an unknown workspace (not a conflict result)", async () => {
    await expect(store.claimOrg("ws_missing", "00D8Z000001aBcDEFG")).rejects.toThrow(
      "Unknown workspace",
    );
  });

  it("releaseOrg clears both org_key and the config field, freeing the org to be reclaimed", async () => {
    await store.createWorkspace(workspace("ws_a"));
    await store.createWorkspace(workspace("ws_b"));
    await store.claimOrg("ws_a", "00D8Z000001aBcDEFG");

    await store.releaseOrg("ws_a");
    // config field cleared...
    expect((await store.getWorkspace("ws_a"))?.salesforceOrgId).toBeUndefined();
    // ...and org_key cleared too, not just shadowed — the org is claimable again.
    expect(await store.getWorkspaceByOrgId("00D8Z000001aBcDEFG")).toBeUndefined();
    const reclaimed = await store.claimOrg("ws_b", "00D8Z000001aBcDEFG");
    expect(reclaimed.ok).toBe(true);
  });

  it("setWorkspaceOwner stamps ownerAccountId; throws for an unknown workspace", async () => {
    await store.createWorkspace(workspace("ws_a"));
    await store.setWorkspaceOwner("ws_a", "dana@acme.example");
    expect((await store.getWorkspaceByOwner("dana@acme.example"))?.id).toBe("ws_a");

    await expect(store.setWorkspaceOwner("ws_missing", "dana@acme.example")).rejects.toThrow(
      "Unknown workspace",
    );
  });

  it("one owned workspace per account (spec §6): a signup double-submit is dropped, not forked", async () => {
    const first = workspace("ws_a", { ownerAccountId: "dana@acme.example" });
    const second = workspace("ws_b", { ownerAccountId: "dana@acme.example" });
    await store.createWorkspace(first);
    // Same shape a double-submitted signup produces: two INSERTs racing for
    // one owner. The second must not throw — workspaces_owner_uq's 23505 is
    // caught and swallowed, matching org_key's DO-NOTHING philosophy.
    await store.createWorkspace(second);

    expect((await store.getWorkspaceByOwner("dana@acme.example"))?.id).toBe("ws_a");
    expect(await store.getWorkspace("ws_b")).toBeUndefined();

    // Distinct owners are unaffected — both still insert.
    await store.createWorkspace(workspace("ws_c", { ownerAccountId: "evan@acme.example" }));
    expect((await store.getWorkspaceByOwner("evan@acme.example"))?.id).toBe("ws_c");
  });
});
