import { mkdtempSync } from "node:fs";
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

describe("diffLayouts (publish modal, 2b)", () => {
  it("reports removed/changed entries vs the published layout", () => {
    const diff = diffLayouts(demoDealsLayout, editedDraft());
    expect(diff.removed).toContain("Deal details · next_step");
    expect(diff.added).toHaveLength(0);
  });
});
