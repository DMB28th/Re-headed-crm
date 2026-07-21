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

describe("PostgresConfigStore", () => {
  it("seeds the demo tenant on first boot", async () => {
    const layout = await store.getLayout(DEMO_TENANT_ID, "deals");
    expect(layout?.revision).toBe(4);
    expect(await store.listConfiguredObjects(DEMO_TENANT_ID)).toEqual(["deals"]);
    expect((await store.getViewExposures(DEMO_TENANT_ID, "deals")).length).toBe(3);
    expect((await store.getHomeCard(DEMO_TENANT_ID))?.blocks.length).toBe(3);
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
    const published = await store.publishHomeCard({
      ...current,
      blocks: current.blocks.filter((b) => b.type !== "recent"),
    });
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
    expect((await store.getCustomLists(DEMO_TENANT_ID, "deals"))[0]?.name).toBe("PG list");
  });

  it("stores flow modes and custom screen publishes", async () => {
    await store.setFlowRenderMode({
      version: 1,
      tenantId: DEMO_TENANT_ID,
      flowApiName: "Renewal_Playbook",
      mode: "native",
      fallback: "open-in-salesforce",
    });
    expect(await store.getFlowRenderModes(DEMO_TENANT_ID)).toMatchObject([
      { flowApiName: "Renewal_Playbook", mode: "native" },
    ]);

    await store.saveCustomScreenDraft({
      version: 1,
      tenantId: DEMO_TENANT_ID,
      id: "cs-onsite",
      label: "Onsite scheduling",
      source: DEFAULT_CUSTOM_SCREEN_SOURCE,
      status: "draft",
      revision: 1,
    });
    const published = await store.publishCustomScreen(DEMO_TENANT_ID, "cs-onsite");
    expect(published).toMatchObject({ status: "published", revision: 1 });
    expect((await store.getCustomScreens(DEMO_TENANT_ID))[0]?.id).toBe("cs-onsite");
  });
});
