import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileConfigStore } from "./file-store.js";
import { resetEncryptionKeyCache } from "./crypto.js";
import { InMemoryConfigStore } from "./memory-store.js";
import { diffLayouts } from "./diff.js";
import { DEMO_TENANT_ID, demoDealsLayout } from "./seed.js";
import { DEFAULT_CUSTOM_SCREEN_SOURCE, type UserContext } from "@cardstack/core";
import { mergeScopedViewExposures, scopeViewExposuresForUser } from "./list-visibility.js";

const editedDraft = () => ({
  ...structuredClone(demoDealsLayout),
  recordCard: {
    ...structuredClone(demoDealsLayout.recordCard),
    sections: [
      {
        label: "Deal details",
        columns: 2 as const,
        fields: structuredClone(demoDealsLayout.recordCard.sections[0]!.fields).filter(
          (f) => f.api !== "next_step",
        ),
      },
    ],
  },
});

describe("publish lifecycle", () => {
  it("draft → publish bumps revision, keeps history, clears draft", async () => {
    const store = new InMemoryConfigStore();
    await store.saveDraft(editedDraft());

    // Reps still see v4 while the draft exists
    expect((await store.getLayout(DEMO_TENANT_ID, "deals"))!.revision).toBe(4);

    const published = await store.publish(DEMO_TENANT_ID, "deals");
    expect(published.revision).toBe(5);
    expect(published.recordCard.sections[0]!.fields.map((f) => f.api)).not.toContain("next_step");

    const record = await store.getLayoutRecord(DEMO_TENANT_ID, "deals");
    expect(record.draft).toBeNull();
    expect(record.history.map((c) => c.revision)).toEqual([4]);
    expect((await store.listPublishes(DEMO_TENANT_ID))[0]).toMatchObject({
      revision: 5,
      kind: "publish",
    });
  });

  it("rollback restores an old layout under a NEW revision", async () => {
    const store = new InMemoryConfigStore();
    await store.saveDraft(editedDraft());
    await store.publish(DEMO_TENANT_ID, "deals"); // v5

    const rolledBack = await store.rollback(DEMO_TENANT_ID, "deals", 4);
    expect(rolledBack.revision).toBe(6);
    expect(rolledBack.recordCard.sections[0]!.fields.map((f) => f.api)).toContain("next_step");
    const record = await store.getLayoutRecord(DEMO_TENANT_ID, "deals");
    expect(record.history.map((c) => c.revision)).toEqual([4, 5]);
  });

  it("file store: a second instance sees the publish immediately (GP3)", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "cardstack-")), "config.json");
    const studio = new FileConfigStore(file);
    const server = new FileConfigStore(file);

    expect((await server.getLayout(DEMO_TENANT_ID, "deals"))!.revision).toBe(4);
    await studio.saveDraft(editedDraft());
    await studio.publish(DEMO_TENANT_ID, "deals");
    // No reload, no restart — the server-side instance reads fresh state.
    expect((await server.getLayout(DEMO_TENANT_ID, "deals"))!.revision).toBe(5);
  });
});

describe("removeObject", () => {
  it("drops layout, exposures and publish history but leaves other objects", async () => {
    const store = new InMemoryConfigStore();
    // Deals is seeded published; give it exposures + a publish event, then remove.
    await store.saveDraft(editedDraft());
    await store.publish(DEMO_TENANT_ID, "deals");
    expect(await store.listConfiguredObjects(DEMO_TENANT_ID)).toContain("deals");

    await store.removeObject(DEMO_TENANT_ID, "deals");

    expect(await store.getLayout(DEMO_TENANT_ID, "deals")).toBeFalsy();
    const record = await store.getLayoutRecord(DEMO_TENANT_ID, "deals");
    expect(record.draft).toBeNull();
    expect(record.published).toBeNull();
    expect(await store.listConfiguredObjects(DEMO_TENANT_ID)).not.toContain("deals");
    expect(await store.getCustomLists(DEMO_TENANT_ID, "deals")).toEqual([]);
    expect((await store.listPublishes(DEMO_TENANT_ID)).some((p) => p.object === "deals")).toBe(false);
  });

  it("is idempotent for an object that was never configured", async () => {
    const store = new InMemoryConfigStore();
    await expect(store.removeObject(DEMO_TENANT_ID, "never_configured")).resolves.toBeUndefined();
  });
});

describe("home card publish", () => {
  it("bumps revision from current and logs the event", async () => {
    const store = new InMemoryConfigStore();
    const current = (await store.getHomeCard(DEMO_TENANT_ID))!;
    expect(current.revision).toBe(1);
    await store.setHomeCard({
      ...current,
      blocks: current.blocks.filter((b) => b.type !== "recent"),
    });
    const published = await store.publishHomeCard(DEMO_TENANT_ID);
    expect(published.revision).toBe(2);
    expect((await store.getHomeCard(DEMO_TENANT_ID))!.blocks).toHaveLength(2);
    expect((await store.listPublishes(DEMO_TENANT_ID))[0]).toMatchObject({
      object: "home card",
      revision: 2,
      surface: "homecard",
    });
  });

  it("stages edits durably — a draft survives, but reps keep the published card", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "cardstack-")), "config.json");
    const studio = new FileConfigStore(file);
    const server = new FileConfigStore(file);
    const current = (await studio.getHomeCard(DEMO_TENANT_ID))!;
    await studio.setHomeCard({ ...current, blocks: [current.blocks[0]!] });

    // Reps still see the published card (this is the whole point).
    expect((await server.getHomeCard(DEMO_TENANT_ID))!.blocks).toHaveLength(current.blocks.length);
    // …and the draft is durable, not React state that dies with the tab.
    expect((await server.getHomeCardRecord(DEMO_TENANT_ID)).draft!.blocks).toHaveLength(1);

    await studio.publishHomeCard(DEMO_TENANT_ID);
    expect((await server.getHomeCard(DEMO_TENANT_ID))!.blocks).toHaveLength(1);
    expect((await server.getHomeCardRecord(DEMO_TENANT_ID)).draft).toBeNull();
  });

  it("rolls back to a previous revision under a NEW revision", async () => {
    const store = new InMemoryConfigStore();
    const v1 = (await store.getHomeCard(DEMO_TENANT_ID))!;
    await store.setHomeCard({ ...v1, blocks: [v1.blocks[0]!] });
    await store.publishHomeCard(DEMO_TENANT_ID);

    const restored = await store.rollbackHomeCard(DEMO_TENANT_ID, 1);
    expect(restored.revision).toBe(3);
    expect(restored.blocks).toHaveLength(v1.blocks.length);
  });
});

describe("connections (empty canvas)", () => {
  it("defaults to a connected mock portal when nothing is stored", async () => {
    const store = new InMemoryConfigStore();
    const connection = await store.getConnection(DEMO_TENANT_ID);
    expect(connection).toMatchObject({ status: "connected", crm: "hubspot" });
  });

  it("disconnect persists and survives a second file-store instance", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "cardstack-")), "config.json");
    const studio = new FileConfigStore(file);
    const server = new FileConfigStore(file);
    await studio.setConnection({
      tenantId: DEMO_TENANT_ID,
      status: "disconnected",
      crm: "hubspot",
      label: "mock portal",
      changedAt: new Date().toISOString(),
    });
    expect((await server.getConnection(DEMO_TENANT_ID)).status).toBe("disconnected");
  });

  it("stores per-user CRM authorization separately from admin connection", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "cardstack-")), "config.json");
    const studio = new FileConfigStore(file);
    const server = new FileConfigStore(file);
    await studio.setConnection({
      tenantId: DEMO_TENANT_ID,
      status: "connected",
      crm: "salesforce",
      label: "admin OAuth",
      changedAt: "2026-07-20T12:00:00.000Z",
      credentials: { authType: "oauth", clientId: "app", clientSecret: "secret", refreshToken: "admin" },
    });
    await studio.setUserConnection({
      tenantId: DEMO_TENANT_ID,
      userId: "dana",
      status: "connected",
      crm: "salesforce",
      label: "user OAuth",
      changedAt: "2026-07-20T12:01:00.000Z",
      connectedUser: "Dana Seller",
      credentials: { authType: "oauth", clientId: "app", clientSecret: "secret", refreshToken: "user" },
    });

    expect((await server.getConnection(DEMO_TENANT_ID)).credentials?.refreshToken).toBe("admin");
    expect((await server.getUserConnection(DEMO_TENANT_ID, "dana", "salesforce"))?.connectedUser).toBe(
      "Dana Seller",
    );
    expect(await server.getUserConnection(DEMO_TENANT_ID, "lee", "salesforce")).toBeUndefined();

    await studio.deleteUserConnection(DEMO_TENANT_ID, "dana", "salesforce");
    expect(await server.getUserConnection(DEMO_TENANT_ID, "dana", "salesforce")).toBeUndefined();
  });
});

describe("custom lists (view-exposures v2)", () => {
  it("stores custom lists alongside exposures and reads them back", async () => {
    const store = new InMemoryConfigStore();
    const config = (await store.getViewExposuresConfig(DEMO_TENANT_ID, "deals"))!;
    await store.setViewExposures({
      ...config,
      customLists: [
        {
          id: "cl-1",
          name: "Big renewals",
          filters: [{ field: "amount", op: "gt", value: 100000 }],
          visibility: "workspace",
        },
      ],
      views: [...config.views, { viewId: "cl-1", exposed: true, aliases: ["big renewals"], isDefault: false }],
    });
    // Staged, not live: exposing a list is a governance change, so chat sees
    // nothing until it is published.
    expect(await store.getCustomLists(DEMO_TENANT_ID, "deals")).toHaveLength(0);
    await store.publishViewExposures(DEMO_TENANT_ID, "deals");

    const lists = await store.getCustomLists(DEMO_TENANT_ID, "deals");
    expect(lists).toHaveLength(1);
    expect(lists[0]!.name).toBe("Big renewals");
    const exposed = await store.getViewExposures(DEMO_TENANT_ID, "deals");
    expect(exposed.map((v) => v.viewId)).toContain("cl-1");
  });

  it("merges a user-scoped edit without deleting another user's private list", async () => {
    const dana: UserContext = {
      tenantId: DEMO_TENANT_ID,
      userId: "dana",
      name: "Dana",
      audience: "default",
    };
    const lee: UserContext = {
      tenantId: DEMO_TENANT_ID,
      userId: "lee",
      name: "Lee",
      audience: "default",
    };
    const store = new InMemoryConfigStore();
    const config = (await store.getViewExposuresConfig(DEMO_TENANT_ID, "deals"))!;
    const full = {
      ...config,
      customLists: [
        {
          id: "cl-dana",
          name: "Dana's list",
          filters: [],
          visibility: "private" as const,
          createdByUserId: "dana",
          createdByName: "Dana",
        },
        {
          id: "cl-lee",
          name: "Lee's list",
          filters: [],
          visibility: "private" as const,
          createdByUserId: "lee",
          createdByName: "Lee",
        },
      ],
      views: [
        ...config.views,
        { viewId: "cl-dana", exposed: true, aliases: ["dana"], isDefault: false },
        { viewId: "cl-lee", exposed: true, aliases: ["lee"], isDefault: false },
      ],
    };
    await store.setViewExposures(full);

    const danaScoped = scopeViewExposuresForUser(full, dana);
    const merged = mergeScopedViewExposures(
      full,
      {
        ...danaScoped,
        customLists: danaScoped.customLists.map((list) =>
          list.id === "cl-dana" ? { ...list, name: "Dana renamed" } : list,
        ),
      },
      dana,
      "2026-07-20T12:00:00.000Z",
    );

    expect(scopeViewExposuresForUser(merged, dana).customLists.map((l) => l.id)).toEqual([
      "cl-dana",
    ]);
    expect(scopeViewExposuresForUser(merged, lee).customLists.map((l) => l.id)).toEqual(["cl-lee"]);
    expect(merged.customLists.find((l) => l.id === "cl-dana")?.name).toBe("Dana renamed");
    expect(merged.customLists.find((l) => l.id === "cl-lee")?.name).toBe("Lee's list");
  });
});

describe("shared capabilities", () => {
  it("stores flow render modes", async () => {
    const store = new InMemoryConfigStore();
    await store.setFlowRenderMode({
      version: 1,
      tenantId: DEMO_TENANT_ID,
      flowApiName: "Renewal_Playbook",
      mode: "embedded",
      fallback: "open-in-salesforce",
    });
    // Staged, not live — a render policy change goes through publish too.
    expect(await store.getFlowRenderModes(DEMO_TENANT_ID)).toEqual([]);

    await store.publishFlowRenderMode(DEMO_TENANT_ID, "Renewal_Playbook");
    expect(await store.getFlowRenderModes(DEMO_TENANT_ID)).toMatchObject([
      { flowApiName: "Renewal_Playbook", mode: "embedded" },
    ]);
  });

  it("publishes custom screens with draft/history lifecycle", async () => {
    const store = new InMemoryConfigStore();
    await store.saveCustomScreenDraft({
      version: 1,
      tenantId: DEMO_TENANT_ID,
      id: "cs-onsite",
      label: "Onsite scheduling",
      flowApiName: "Renewal_Playbook",
      source: DEFAULT_CUSTOM_SCREEN_SOURCE,
      status: "draft",
      revision: 1,
    });
    const v1 = await store.publishCustomScreen(DEMO_TENANT_ID, "cs-onsite");
    expect(v1).toMatchObject({ status: "published", revision: 1 });
    expect((await store.getCustomScreens(DEMO_TENANT_ID))[0]?.label).toBe("Onsite scheduling");

    await store.saveCustomScreenDraft({ ...v1, label: "Onsite scheduling v2" });
    const v2 = await store.publishCustomScreen(DEMO_TENANT_ID, "cs-onsite");
    const record = await store.getCustomScreenRecord(DEMO_TENANT_ID, "cs-onsite");
    expect(v2.revision).toBe(2);
    expect(record.history.map((screen) => screen.revision)).toEqual([1]);
  });
});

describe("diffLayouts (publish modal, 2b)", () => {
  it("reports removed/changed entries vs the published layout", () => {
    const diff = diffLayouts(demoDealsLayout, editedDraft());
    expect(diff.removed).toContain("next_step");
    expect(diff.added).toHaveLength(0);
  });

  it("renaming a section is one '~ section renamed' row, not a teardown", () => {
    const draft = structuredClone(demoDealsLayout);
    draft.recordCard.sections[0]!.label = "Renamed section";
    const diff = diffLayouts(demoDealsLayout, draft);
    // No field churn — fields are keyed by api, not "section · api".
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    // Each field in the renamed section reports "(moved: … → …)" and the section
    // itself reports "renamed"; the story is a rename, not 2N add/remove rows.
    expect(diff.changed.some((c) => c.includes("renamed: Deal details → Renamed section"))).toBe(
      true,
    );
  });

  it("a real change in a duplicate-labelled section is not swallowed", () => {
    const published = structuredClone(demoDealsLayout);
    // Two sections with the same label.
    published.recordCard.sections = [
      { label: "Details", columns: 2, fields: [{ api: "amount", editable: false }] },
      { label: "Details", columns: 2, fields: [{ api: "dealstage", editable: false }] },
    ];
    const draft = structuredClone(published);
    // Flip editability on the field in the SECOND "Details" section.
    draft.recordCard.sections[1]!.fields[0]!.editable = true;
    const diff = diffLayouts(published, draft);
    expect(diff.changed.some((c) => c.includes("dealstage") && c.includes("now editable"))).toBe(
      true,
    );
  });

  it("reports changed flow input mappings", () => {
    const published = structuredClone(demoDealsLayout);
    published.recordCard.actions.push({
      type: "screen_flow",
      flowApiName: "Renewal_Playbook",
      label: "Run renewal",
      embed: "auto",
      inputs: {
        recordId: { source: "context", key: "recordId", valueType: "recordId" },
      },
    });
    const draft = structuredClone(published);
    const action = draft.recordCard.actions.find(
      (candidate) => candidate.type === "screen_flow" && candidate.flowApiName === "Renewal_Playbook",
    );
    if (action?.type === "screen_flow") {
      action.inputs.recordId = { source: "field", field: "hs_object_id", valueType: "recordId" };
    }

    const diff = diffLayouts(published, draft);
    expect(diff.changed).toContain("action · flow Renewal_Playbook (inputs changed)");
  });
});

describe("pre-customLists rows (live-portal crash regression)", () => {
  it("normalizes stored exposures missing customLists through the schema", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "cardstack-")), "config.json");
    const store = new FileConfigStore(file);
    // Simulate a row written before view-exposures v2: strip customLists.
    const raw = JSON.parse(readFileSync(file, "utf-8"));
    const key = `${DEMO_TENANT_ID}::deals`;
    delete raw.viewExposures[key].customLists;
    writeFileSync(file, JSON.stringify(raw));

    const config = await store.getViewExposuresConfig(DEMO_TENANT_ID, "deals");
    expect(config?.customLists).toEqual([]); // defaulted, not undefined
    expect(await store.getCustomLists(DEMO_TENANT_ID, "deals")).toEqual([]);
  });
});

describe("credentials encryption at rest", () => {
  const KEY = Buffer.alloc(32, 3).toString("base64");

  it("encrypts credentials on disk and round-trips them", async () => {
    process.env.CARDSTACK_ENCRYPTION_KEY = KEY;
    resetEncryptionKeyCache();
    try {
      const file = path.join(mkdtempSync(path.join(tmpdir(), "cardstack-")), "config.json");
      const store = new FileConfigStore(file);
      await store.setConnection({
        tenantId: "t-enc",
        status: "connected",
        crm: "salesforce",
        label: "admin OAuth",
        changedAt: new Date(0).toISOString(),
        credentials: { authType: "oauth", refreshToken: "super-secret-rt", clientSecret: "cs" },
      });

      const rawFile = readFileSync(file, "utf-8");
      expect(rawFile).not.toContain("super-secret-rt"); // encrypted on disk
      expect(rawFile).toContain("enc:v1:");

      const back = await new FileConfigStore(file).getConnection("t-enc");
      expect(back.credentials).toEqual({
        authType: "oauth",
        refreshToken: "super-secret-rt",
        clientSecret: "cs",
      });
    } finally {
      delete process.env.CARDSTACK_ENCRYPTION_KEY;
      resetEncryptionKeyCache();
    }
  });

  it("still reads a legacy plaintext connection written before encryption", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "cardstack-")), "config.json");
    // Seed a plaintext credentials row (no key set), as older builds wrote.
    resetEncryptionKeyCache();
    const store = new FileConfigStore(file);
    await store.setConnection({
      tenantId: "t-legacy",
      status: "connected",
      crm: "salesforce",
      label: "admin OAuth",
      changedAt: new Date(0).toISOString(),
      credentials: { authType: "oauth", refreshToken: "legacy-rt" },
    });
    expect(readFileSync(file, "utf-8")).toContain("legacy-rt"); // stored plaintext

    // Now a key is configured: the legacy plaintext row must still decrypt-or-passthrough.
    process.env.CARDSTACK_ENCRYPTION_KEY = KEY;
    resetEncryptionKeyCache();
    try {
      const back = await new FileConfigStore(file).getConnection("t-legacy");
      expect(back.credentials?.refreshToken).toBe("legacy-rt");
    } finally {
      delete process.env.CARDSTACK_ENCRYPTION_KEY;
      resetEncryptionKeyCache();
    }
  });
});

describe("staging model (docs/studio-staging-model.md)", () => {
  it("reads a legacy BARE config as published, with no draft", async () => {
    // Config files written before the staging model stored exposures / home
    // cards / flow modes as bare configs. They must migrate to "published" —
    // the safe direction, since nothing a rep can see today disappears.
    const dir = mkdtempSync(path.join(tmpdir(), "cardstack-"));
    const file = path.join(dir, "config.json");
    writeFileSync(
      file,
      JSON.stringify({
        layouts: {},
        viewExposures: {
          [`${DEMO_TENANT_ID}::deals`]: {
            version: 1,
            tenantId: DEMO_TENANT_ID,
            object: "deals",
            views: [{ viewId: "v-legacy", exposed: true, aliases: [], isDefault: true }],
            customLists: [],
          },
        },
        homeCards: {
          [`${DEMO_TENANT_ID}::default`]: {
            version: 1,
            tenantId: DEMO_TENANT_ID,
            audience: "default",
            revision: 4,
            blocks: [{ type: "recent", limit: 3 }],
          },
        },
        flowRenderModes: {
          [`${DEMO_TENANT_ID}::Legacy_Flow`]: {
            version: 1,
            tenantId: DEMO_TENANT_ID,
            flowApiName: "Legacy_Flow",
            mode: "handoff",
            fallback: "open-in-salesforce",
          },
        },
        publishes: [],
      }),
    );
    const store = new FileConfigStore(file);

    // Still live for reps, exactly as before the migration.
    expect((await store.getViewExposures(DEMO_TENANT_ID, "deals")).map((v) => v.viewId)).toEqual([
      "v-legacy",
    ]);
    expect((await store.getHomeCard(DEMO_TENANT_ID))!.revision).toBe(4);
    expect(await store.getFlowRenderModes(DEMO_TENANT_ID)).toMatchObject([{ mode: "handoff" }]);

    // …and read back through the staged envelope with nothing pending.
    expect((await store.getViewExposuresRecord(DEMO_TENANT_ID, "deals")).draft).toBeNull();
    expect((await store.getHomeCardRecord(DEMO_TENANT_ID)).draft).toBeNull();
    expect(await store.listStagedChanges(DEMO_TENANT_ID)).toEqual([]);
  });

  it("lists staged changes across surfaces, with diffs", async () => {
    const store = new InMemoryConfigStore();
    const exposures = (await store.getViewExposuresConfig(DEMO_TENANT_ID, "deals"))!;
    await store.setViewExposures({
      ...exposures,
      customLists: [
        { id: "cl-9", name: "Big renewals", filters: [], visibility: "workspace" },
      ],
      views: [...exposures.views, { viewId: "cl-9", exposed: true, aliases: [], isDefault: false }],
    });
    const home = (await store.getHomeCard(DEMO_TENANT_ID))!;
    await store.setHomeCard({ ...home, blocks: [home.blocks[0]!] });

    const staged = await store.listStagedChanges(DEMO_TENANT_ID);
    expect(staged.map((change) => change.surface).sort()).toEqual(["exposures", "homecard"]);
    const lists = staged.find((change) => change.surface === "exposures")!;
    expect(lists.diff.added).toContain("custom list · Big renewals");
    expect(lists.publishedRevision).toBe(1);
  });

  it("does not list a draft that matches what is published", async () => {
    const store = new InMemoryConfigStore();
    const exposures = (await store.getViewExposuresConfig(DEMO_TENANT_ID, "deals"))!;
    // An admin who toggles something on and back off has no pending change.
    await store.setViewExposures({ ...exposures });
    expect(await store.listStagedChanges(DEMO_TENANT_ID)).toEqual([]);
  });

  it("publishes a batch sequentially and reports per-surface results", async () => {
    const store = new InMemoryConfigStore();
    const exposures = (await store.getViewExposuresConfig(DEMO_TENANT_ID, "deals"))!;
    await store.setViewExposures({
      ...exposures,
      views: exposures.views.map((view) => ({ ...view, exposed: true })),
    });
    const home = (await store.getHomeCard(DEMO_TENANT_ID))!;
    await store.setHomeCard({ ...home, blocks: [home.blocks[0]!] });

    const results = await store.publishStaged(DEMO_TENANT_ID, [
      { surface: "exposures", object: "deals" },
      { surface: "homecard", object: "default", audience: "default" },
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(await store.listStagedChanges(DEMO_TENANT_ID)).toEqual([]);

    // One batch, one batchId — the home page groups the run into a single row.
    const events = (await store.listPublishes(DEMO_TENANT_ID)).slice(0, 2);
    expect(new Set(events.map((event) => event.batchId)).size).toBe(1);
    expect(events[0]!.batchId).toBeDefined();
  });

  it("reports partial failure honestly instead of pretending the batch was atomic", async () => {
    const store = new InMemoryConfigStore();
    const exposures = (await store.getViewExposuresConfig(DEMO_TENANT_ID, "deals"))!;
    await store.setViewExposures({
      ...exposures,
      views: exposures.views.map((view) => ({ ...view, exposed: true })),
    });

    const results = await store.publishStaged(DEMO_TENANT_ID, [
      { surface: "exposures", object: "deals" },
      // No draft staged for this one — it must fail without unwinding the first.
      { surface: "flows", object: "Missing_Flow" },
    ]);
    expect(results[0]).toMatchObject({ ok: true, surface: "exposures" });
    expect(results[1]!.ok).toBe(false);
    expect(results[1]!.error).toMatch(/No draft to publish/);
    // The successful one STAYED published — that is what "not atomic" means.
    expect(await store.getViewExposures(DEMO_TENANT_ID, "deals")).not.toHaveLength(0);
  });

  it("never leaks a draft to the read side the MCP server renders from", async () => {
    const store = new InMemoryConfigStore();
    const exposures = (await store.getViewExposuresConfig(DEMO_TENANT_ID, "deals"))!;
    await store.setViewExposures({
      ...exposures,
      customLists: [{ id: "cl-x", name: "Secret", filters: [], visibility: "workspace" }],
      views: [...exposures.views, { viewId: "cl-x", exposed: true, aliases: [], isDefault: false }],
    });
    await store.setFlowRenderMode({
      version: 1,
      revision: 1,
      tenantId: DEMO_TENANT_ID,
      flowApiName: "Draft_Flow",
      mode: "handoff",
      fallback: "open-in-salesforce",
    });
    const home = (await store.getHomeCard(DEMO_TENANT_ID))!;
    await store.setHomeCard({ ...home, blocks: [home.blocks[0]!] });

    // Everything the ConfigStore read side exposes must still be the PUBLISHED
    // revision — drafts are Studio-only (hard rule 2's spirit for config).
    expect(await store.getCustomLists(DEMO_TENANT_ID, "deals")).toHaveLength(0);
    expect(
      (await store.getViewExposures(DEMO_TENANT_ID, "deals")).map((v) => v.viewId),
    ).not.toContain("cl-x");
    expect(await store.getFlowRenderModes(DEMO_TENANT_ID)).toEqual([]);
    expect((await store.getHomeCard(DEMO_TENANT_ID))!.blocks).toHaveLength(home.blocks.length);
  });

  it("rolls exposures back to a previous revision under a NEW revision", async () => {
    const store = new InMemoryConfigStore();
    const v1 = (await store.getViewExposuresConfig(DEMO_TENANT_ID, "deals"))!;
    await store.setViewExposures({
      ...v1,
      customLists: [{ id: "cl-2", name: "Temp", filters: [], visibility: "workspace" }],
      views: [...v1.views, { viewId: "cl-2", exposed: true, aliases: [], isDefault: false }],
    });
    await store.publishViewExposures(DEMO_TENANT_ID, "deals");
    expect(await store.getCustomLists(DEMO_TENANT_ID, "deals")).toHaveLength(1);

    const restored = await store.rollbackViewExposures(DEMO_TENANT_ID, "deals", 1);
    expect(restored.revision).toBe(3);
    expect(await store.getCustomLists(DEMO_TENANT_ID, "deals")).toHaveLength(0);
    expect((await store.listPublishes(DEMO_TENANT_ID))[0]).toMatchObject({
      kind: "rollback",
      surface: "exposures",
    });
  });
});

describe("custom screens belong to a screen flow", () => {
  const base = {
    version: 1 as const,
    tenantId: DEMO_TENANT_ID,
    label: "Onsite scheduling",
    source: DEFAULT_CUSTOM_SCREEN_SOURCE,
    status: "draft" as const,
    revision: 1,
  };

  it("refuses to publish a screen with no flow — nothing would ever render it", async () => {
    const store = new InMemoryConfigStore();
    await store.saveCustomScreenDraft({ ...base, id: "cs-orphan" });
    await expect(store.publishCustomScreen(DEMO_TENANT_ID, "cs-orphan")).rejects.toThrow(
      /Attach this screen to a flow/,
    );
  });

  it("publishes once the screen is attached to a flow", async () => {
    const store = new InMemoryConfigStore();
    await store.saveCustomScreenDraft({
      ...base,
      id: "cs-attached",
      flowApiName: "Renewal_Approval",
    });
    const published = await store.publishCustomScreen(DEMO_TENANT_ID, "cs-attached");
    expect(published).toMatchObject({ status: "published", flowApiName: "Renewal_Approval" });
  });

  it("still READS an unattached screen written before the rule, so it can be reassigned", async () => {
    const store = new InMemoryConfigStore();
    await store.saveCustomScreenDraft({ ...base, id: "cs-legacy" });
    const records = await store.listCustomScreenRecords(DEMO_TENANT_ID);
    expect(records.find((record) => record.id === "cs-legacy")?.draft?.label).toBe(
      "Onsite scheduling",
    );
  });
});
