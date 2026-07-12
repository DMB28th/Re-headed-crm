import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileConfigStore } from "./file-store.js";
import { InMemoryConfigStore } from "./memory-store.js";
import { diffLayouts } from "./diff.js";
import { DEMO_TENANT_ID, demoDealsLayout } from "./seed.js";

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

describe("home card publish", () => {
  it("bumps revision from current and logs the event", async () => {
    const store = new InMemoryConfigStore();
    const current = (await store.getHomeCard(DEMO_TENANT_ID))!;
    expect(current.revision).toBe(1);
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
});

describe("custom lists (view-exposures v2)", () => {
  it("stores custom lists alongside exposures and reads them back", async () => {
    const store = new InMemoryConfigStore();
    const config = (await store.getViewExposuresConfig(DEMO_TENANT_ID, "deals"))!;
    await store.setViewExposures({
      ...config,
      customLists: [
        { id: "cl-1", name: "Big renewals", filters: [{ field: "amount", op: "gt", value: 100000 }] },
      ],
      views: [...config.views, { viewId: "cl-1", exposed: true, aliases: ["big renewals"], isDefault: false }],
    });
    const lists = await store.getCustomLists(DEMO_TENANT_ID, "deals");
    expect(lists).toHaveLength(1);
    expect(lists[0]!.name).toBe("Big renewals");
    const exposed = await store.getViewExposures(DEMO_TENANT_ID, "deals");
    expect(exposed.map((v) => v.viewId)).toContain("cl-1");
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
