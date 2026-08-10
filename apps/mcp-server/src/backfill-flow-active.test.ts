/**
 * The opt-in-flows deploy migration. This runs against production data once,
 * so its discrimination — which flows get switched on and which are left
 * alone — is worth a test rather than a careful read.
 */
import { describe, expect, it } from "vitest";
import { InMemoryConfigStore, DEMO_TENANT_ID } from "@cardstack/config-store";
import type { LayoutConfig } from "@cardstack/core";
import { backfillFlowActive } from "../scripts/backfill-flow-active.js";

/** Publish a layout carrying the given flows as screen_flow card actions. */
async function layoutWithFlows(store: InMemoryConfigStore, flows: string[]) {
  const record = await store.getLayoutRecord(DEMO_TENANT_ID, "deals");
  const layout: LayoutConfig = structuredClone(record.published!);
  layout.recordCard.actions = [
    ...layout.recordCard.actions.filter((a) => a.type !== "screen_flow"),
    ...flows.map((flowApiName) => ({
      type: "screen_flow" as const,
      flowApiName,
      label: `Run ${flowApiName}`,
      embed: "auto" as const,
      inputs: {},
    })),
  ];
  await store.saveDraft(layout);
  await store.publish(DEMO_TENANT_ID, "deals");
}

describe("backfillFlowActive", () => {
  it("activates a flow reps can already run, and publishes it so it's live", async () => {
    const store = new InMemoryConfigStore();
    await layoutWithFlows(store, ["Renewal_Playbook"]);

    const result = await backfillFlowActive(store, DEMO_TENANT_ID, { apply: true });
    expect(result.activated).toEqual(["Renewal_Playbook"]);

    // PUBLISHED, not staged — a staged policy would leave the flow dark.
    const live = await store.getFlowRenderModes(DEMO_TENANT_ID);
    expect(live).toMatchObject([{ flowApiName: "Renewal_Playbook", active: true, mode: "auto" }]);
  });

  it("never touches a flow an admin already configured — including one turned OFF", async () => {
    const store = new InMemoryConfigStore();
    await layoutWithFlows(store, ["Kept_Off", "Never_Configured"]);
    await store.setFlowRenderMode({
      version: 1,
      revision: 1,
      tenantId: DEMO_TENANT_ID,
      flowApiName: "Kept_Off",
      active: false,
      mode: "auto",
      fallback: "open-in-salesforce",
    });
    await store.publishFlowRenderMode(DEMO_TENANT_ID, "Kept_Off");

    const result = await backfillFlowActive(store, DEMO_TENANT_ID, { apply: true });
    expect(result.activated).toEqual(["Never_Configured"]);
    expect(result.skipped.map((s) => s.flow)).toEqual(["Kept_Off"]);

    const modes = await store.getFlowRenderModes(DEMO_TENANT_ID);
    expect(modes.find((m) => m.flowApiName === "Kept_Off")!.active).toBe(false);
  });

  it("activates a PRE-UPGRADE policy and keeps its render mode", async () => {
    // The regression this exists to prevent: a row written before `active`
    // existed parses with active absent. Skipping it would darken exactly the
    // flows an admin configured most deliberately.
    const store = new InMemoryConfigStore();
    await layoutWithFlows(store, ["Customized"]);
    await store.setFlowRenderMode({
      version: 1,
      revision: 1,
      tenantId: DEMO_TENANT_ID,
      flowApiName: "Customized",
      // No `active` — this is what a pre-upgrade row looks like.
      mode: "embedded",
      fallback: "open-in-salesforce",
    });
    await store.publishFlowRenderMode(DEMO_TENANT_ID, "Customized");

    const result = await backfillFlowActive(store, DEMO_TENANT_ID, { apply: true });
    expect(result.activated).toEqual(["Customized"]);

    const live = await store.getFlowRenderModes(DEMO_TENANT_ID);
    expect(live).toMatchObject([{ flowApiName: "Customized", active: true, mode: "embedded" }]);
  });

  it("distinguishes an explicit off from a pre-upgrade row", async () => {
    const store = new InMemoryConfigStore();
    await layoutWithFlows(store, ["Explicit_Off", "Legacy"]);
    await store.setFlowRenderMode({
      version: 1,
      revision: 1,
      tenantId: DEMO_TENANT_ID,
      flowApiName: "Explicit_Off",
      active: false, // a decision, not an absence
      mode: "auto",
      fallback: "open-in-salesforce",
    });
    await store.publishFlowRenderMode(DEMO_TENANT_ID, "Explicit_Off");
    await store.setFlowRenderMode({
      version: 1,
      revision: 1,
      tenantId: DEMO_TENANT_ID,
      flowApiName: "Legacy",
      mode: "native",
      fallback: "open-in-salesforce",
    });
    await store.publishFlowRenderMode(DEMO_TENANT_ID, "Legacy");

    const result = await backfillFlowActive(store, DEMO_TENANT_ID, { apply: true });
    expect(result.activated).toEqual(["Legacy"]);
    expect(result.skipped.map((s) => s.flow)).toEqual(["Explicit_Off"]);

    const modes = await store.getFlowRenderModes(DEMO_TENANT_ID);
    expect(modes.find((m) => m.flowApiName === "Explicit_Off")!.active).toBe(false);
    expect(modes.find((m) => m.flowApiName === "Legacy")!.active).toBe(true);
  });

  it("is safe to re-run — a second pass activates nothing", async () => {
    const store = new InMemoryConfigStore();
    await layoutWithFlows(store, ["Renewal_Playbook"]);
    await backfillFlowActive(store, DEMO_TENANT_ID, { apply: true });

    const second = await backfillFlowActive(store, DEMO_TENANT_ID, { apply: true });
    expect(second.activated).toEqual([]);
    expect(second.skipped).toHaveLength(1);
  });

  it("ignores flows that are synced but not attached to a published card", async () => {
    const store = new InMemoryConfigStore();
    // No screen_flow actions at all: nothing is startable today, so nothing
    // should be switched on. "Synced" is not "in use".
    await layoutWithFlows(store, []);
    const result = await backfillFlowActive(store, DEMO_TENANT_ID, { apply: true });
    expect(result.activated).toEqual([]);
    expect(await store.getFlowRenderModes(DEMO_TENANT_ID)).toEqual([]);
  });

  it("dry run reports without writing", async () => {
    const store = new InMemoryConfigStore();
    await layoutWithFlows(store, ["Renewal_Playbook"]);

    const result = await backfillFlowActive(store, DEMO_TENANT_ID, { apply: false });
    expect(result.activated).toEqual(["Renewal_Playbook"]);
    expect(await store.getFlowRenderModes(DEMO_TENANT_ID)).toEqual([]);
  });
});
