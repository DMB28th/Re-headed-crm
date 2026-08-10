# Actions Editor (design 3a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Cardstack admins a Studio editor for a record card's action row, and make the card and server honor what it produces.

**Architecture:** All mutation and render decisions for `recordCard.actions` move into one pure module in `packages/core` (`card-actions.ts`). The new Studio editor, the existing Flows admin toggle, and the record-card widget all consume it, so "off" means one thing everywhere. A new `enabled` flag on `CardAction` is enforced server-side at the two existing action lookups.

**Tech Stack:** TypeScript, zod 3, vitest 3, Next.js (App Router) for Studio, React 18 for widgets, `@dnd-kit/sortable` for reordering, pnpm + turbo workspaces.

**Spec:** `docs/superpowers/specs/2026-08-07-actions-editor-design.md`

## Global Constraints

- **Hard rule 1:** any layout config schema change requires updating the zod schema in `packages/core` AND a migration note in the changed file's header comment.
- **Hard rule 2:** denylist/allowlist enforcement is server-side only. Never trust the iframe.
- **Hard rule 4:** widgets never call our API directly — writes go widget → host → MCP tool call.
- **Hard rule 6:** UI must match `/design`; deviations require a PR note. This plan contains one deliberate deviation (Task 7, Flows page publish semantics) that must appear in the PR description.
- **Hard rule 8:** every write is preceded by a confirmation diff; `requireConfirmation` is locked ON. Nothing in this plan weakens a write path.
- `packages/widgets` has no test runner today (`test` is `node scripts/check-css-coverage.mjs`). **Task 4b adds one** (vitest + jsdom), and it must keep the existing CSS-coverage check running as part of `pnpm --filter @cardstack/widgets test`. Pure logic still belongs in `packages/core`; the widget suite covers JSX and interaction only.
- Adapters never import from `apps/*`.
- Microcopy: sentence case, verb-first buttons, errors say what happened + what to do.
- Run `pnpm typecheck` before every commit; it catches cross-package breakage turbo would otherwise surface late.

---

## File Structure

**Create:**
- `packages/core/src/card-actions.ts` — pure action-list operations and the render decision. The single owner of what "off", "primary", and "already configured" mean.
- `packages/core/src/card-actions.test.ts` — its tests.
- `apps/studio/app/api/objects/[object]/available-actions/route.ts` — per-object action discovery.
- `apps/studio/app/api/objects/[object]/available-actions/route.test.ts` — its tests.
- `apps/studio/app/objects/[object]/actions/page.tsx` — route shell.
- `apps/studio/components/actions-editor.tsx` — the editor.
- `apps/studio/components/action-inputs-editor.tsx` — the screen-flow mapping sub-editor.

**Modify:**
- `packages/core/src/layout-config.ts` — `enabled` on all four `CardAction` variants + migration note.
- `packages/core/src/index.ts` — export the new module.
- `apps/mcp-server/src/server.ts:1537-1546`, `:1835` — honor `enabled`.
- `packages/widgets/src/record-card/card.tsx:297-305`, `:553-585` — render via `selectRenderableActions`.
- `apps/studio/app/api/flows/assign/route.ts` — use the shared module; draft instead of publish.

---

## Task 1: `enabled` flag on CardAction

**Files:**
- Modify: `packages/core/src/layout-config.ts:1-32` (header note), `:142-171` (schema)
- Test: `packages/core/src/layout-config.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: every `CardAction` variant gains `enabled: boolean` (defaulted `true` by zod, so the parsed type is required, not optional).

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/layout-config.test.ts`:

```ts
describe("CardAction.enabled", () => {
  const base = {
    version: 1 as const,
    tenantId: "t1",
    crm: "hubspot" as const,
    object: "deals",
    listView: { columns: ["dealname"] },
    permissions: { writeEnabled: true, fieldDenylist: [], requireConfirmation: true as const },
  };

  it("defaults every action to enabled when the key is absent", () => {
    const parsed = parseLayoutConfig({
      ...base,
      recordCard: {
        header: { title: "dealname" },
        sections: [{ label: "Details", fields: [{ api: "dealname" }] }],
        actions: [
          { type: "update_record", label: "Edit fields" },
          { type: "create_related", object: "tasks", label: "Log a task" },
          { type: "quick_action", actionApiName: "NewTask", label: "New task" },
          { type: "screen_flow", flowApiName: "Renewal", label: "Renewal", embed: "auto" },
        ],
      },
    });
    expect(parsed.recordCard.actions.map((a) => a.enabled)).toEqual([true, true, true, true]);
  });

  it("round-trips enabled: false", () => {
    const parsed = parseLayoutConfig({
      ...base,
      recordCard: {
        header: { title: "dealname" },
        sections: [{ label: "Details", fields: [{ api: "dealname" }] }],
        actions: [{ type: "update_record", label: "Edit fields", enabled: false }],
      },
    });
    expect(parsed.recordCard.actions[0].enabled).toBe(false);
    expect(parseLayoutConfig(JSON.parse(JSON.stringify(parsed))).recordCard.actions[0].enabled).toBe(
      false,
    );
  });
});
```

If `parseLayoutConfig` is not already imported in this file, add it to the existing import from `./layout-config.js`.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @cardstack/core test -- layout-config
```

Expected: FAIL — the first test errors because `enabled` is `undefined`, not `true`.

- [ ] **Step 3: Add the field to all four variants**

In `packages/core/src/layout-config.ts`, add `enabled: z.boolean().default(true),` to each member of the `CardAction` discriminated union:

```ts
export const CardAction = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("update_record"),
    label: z.string().min(1),
    enabled: z.boolean().default(true),
  }),
  z.object({
    type: z.literal("create_related"),
    object: z.string().min(1),
    label: z.string().min(1),
    enabled: z.boolean().default(true),
  }),
  z.object({
    type: z.literal("quick_action"),
    actionApiName: z.string().min(1),
    label: z.string().min(1),
    enabled: z.boolean().default(true),
  }),
  z.object({
    type: z.literal("screen_flow"),
    flowApiName: z.string().min(1),
    label: z.string().min(1),
    embed: z.enum(["auto", "native", "embedded", "iframe"]).default("auto"),
    inputs: ActionInputMappings,
    enabled: z.boolean().default(true),
  }),
]);
```

Keep the existing comments above the `quick_action` and `screen_flow` members.

- [ ] **Step 4: Add the migration note (hard rule 1)**

Add to the header comment block at the top of `packages/core/src/layout-config.ts`, following the existing dated-entry format:

```
 * - 2026-08-07: CardAction gains `enabled` (default true) on every variant.
 *   A disabled action stays in the array with its label, order and input
 *   mappings intact; it is hidden from the card and REFUSED by the server
 *   (crm_flow_start / crm_flow_continue / crm_quick_action_start), and stays
 *   visible and re-enableable in Studio. Defaulted, so stored configs parse
 *   unchanged. Removal from the array remains a separate, destructive
 *   operation — do not conflate the two.
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm --filter @cardstack/core test -- layout-config
pnpm typecheck
```

Expected: PASS. Typecheck may surface downstream sites constructing `CardAction` literals — those are addressed in later tasks; if any block typecheck now, add `enabled: true` to the literal.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/layout-config.ts packages/core/src/layout-config.test.ts
git commit -m "feat: add enabled flag to card actions"
```

---

## Task 2: Shared action module — mutations

**Files:**
- Create: `packages/core/src/card-actions.ts`, `packages/core/src/card-actions.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `CardAction` from Task 1 (now carrying `enabled`).
- Produces: `ActionRef`, `actionRef()`, `findAction()`, `upsertAction()`, `removeAction()`, `setActionEnabled()`, `reorderActions()`. Task 5 (widget), Task 6 (flows/assign), Task 8 (editor) all import from `@cardstack/core`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/card-actions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CardAction } from "./layout-config.js";
import {
  actionRef,
  findAction,
  removeAction,
  reorderActions,
  setActionEnabled,
  upsertAction,
} from "./card-actions.js";

const edit: CardAction = { type: "update_record", label: "Edit fields", enabled: true };
const flow: CardAction = {
  type: "screen_flow",
  flowApiName: "Renewal",
  label: "Run renewal",
  embed: "auto",
  enabled: true,
  inputs: { renewalDate: { source: "field", field: "Renewal_Date__c" } },
};
const task: CardAction = {
  type: "create_related",
  object: "tasks",
  label: "Log a task",
  enabled: true,
};

describe("actionRef / findAction", () => {
  it("identifies an action independently of its position", () => {
    const found = findAction([edit, task, flow], actionRef(flow));
    expect(found).toEqual(flow);
  });

  it("does not confuse two create_related actions on different objects", () => {
    const notes: CardAction = {
      type: "create_related",
      object: "notes",
      label: "Log a note",
      enabled: true,
    };
    expect(findAction([task, notes], actionRef(notes))?.label).toBe("Log a note");
  });
});

describe("upsertAction", () => {
  it("appends an action that is not present", () => {
    expect(upsertAction([edit], task)).toEqual([edit, task]);
  });

  it("preserves hand-mapped inputs when the action already exists", () => {
    const rebuilt: CardAction = { ...flow, label: "Renewal", inputs: {} };
    const [result] = upsertAction([flow], rebuilt).filter((a) => a.type === "screen_flow");
    expect(result).toMatchObject({ inputs: flow.type === "screen_flow" ? flow.inputs : {} });
  });

  it("keeps the existing label when the incoming one is a bare api name", () => {
    const rebuilt: CardAction = { ...flow, label: "Renewal", inputs: {} };
    const [result] = upsertAction([flow], rebuilt).filter((a) => a.type === "screen_flow");
    expect(result.label).toBe("Run renewal");
  });

  it("keeps an admin-renamed QUICK ACTION label too", () => {
    const renamed: CardAction = {
      type: "quick_action",
      actionApiName: "NewTask",
      label: "Book a follow-up",
      enabled: true,
    };
    const rebuilt: CardAction = { ...renamed, label: "NewTask" };
    const [result] = upsertAction([renamed], rebuilt);
    expect(result.label).toBe("Book a follow-up");
  });

  it("accepts a genuinely new label for any type", () => {
    const renamed: CardAction = {
      type: "quick_action",
      actionApiName: "NewTask",
      label: "Book a follow-up",
      enabled: true,
    };
    const [result] = upsertAction([renamed], { ...renamed, label: "New task" });
    expect(result.label).toBe("New task");
  });

  it("replaces inputs when overwriteInputs is set", () => {
    const rebuilt: CardAction = { ...flow, inputs: {} };
    const [result] = upsertAction([flow], rebuilt, { overwriteInputs: true }).filter(
      (a) => a.type === "screen_flow",
    );
    expect(result.type === "screen_flow" && result.inputs).toEqual({});
  });

  it("does not change position when updating in place", () => {
    const result = upsertAction([edit, flow, task], { ...flow, label: "x" });
    expect(result.map((a) => a.type)).toEqual(["update_record", "screen_flow", "create_related"]);
  });
});

describe("setActionEnabled", () => {
  it("flips the flag without removing or moving the action", () => {
    const result = setActionEnabled([edit, flow, task], actionRef(flow), false);
    expect(result).toHaveLength(3);
    expect(result[1].enabled).toBe(false);
    expect(result[1].type).toBe("screen_flow");
  });

  it("preserves input mappings on a disabled action", () => {
    const [, disabled] = setActionEnabled([edit, flow], actionRef(flow), false);
    expect(disabled.type === "screen_flow" && Object.keys(disabled.inputs)).toEqual([
      "renewalDate",
    ]);
  });

  it("is a no-op when the ref matches nothing", () => {
    expect(setActionEnabled([edit], actionRef(flow), false)).toEqual([edit]);
  });
});

describe("removeAction", () => {
  it("drops only the referenced action", () => {
    expect(removeAction([edit, flow, task], actionRef(flow))).toEqual([edit, task]);
  });
});

describe("reorderActions", () => {
  it("moves an action and preserves the relative order of the rest", () => {
    expect(reorderActions([edit, flow, task], 2, 0).map((a) => a.type)).toEqual([
      "create_related",
      "update_record",
      "screen_flow",
    ]);
  });

  it("returns the list unchanged for out-of-range indices", () => {
    expect(reorderActions([edit, flow], 5, 0)).toEqual([edit, flow]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @cardstack/core test -- card-actions
```

Expected: FAIL — `Cannot find module './card-actions.js'`.

- [ ] **Step 3: Implement the module**

Create `packages/core/src/card-actions.ts`:

```ts
/**
 * The single owner of what "off", "primary", and "already configured" mean for
 * a record card's action row.
 *
 * Every mutation of `recordCard.actions` goes through here — the Studio actions
 * editor, the Flows admin toggle (`/api/flows/assign`), and the record card's
 * render decision. Two surfaces editing this array with different semantics is
 * what this module exists to prevent: before it, disabling a flow from the Flows
 * page DELETED the action and destroyed any hand-mapped inputs.
 *
 * Pure by design. `packages/widgets` has no test runner, so the card's render
 * decision lives here where vitest can reach it.
 */
import type { CardAction } from "./layout-config.js";

/** Identifies an action within a list, independent of position. */
export type ActionRef =
  | { type: "update_record" }
  | { type: "create_related"; object: string }
  | { type: "quick_action"; actionApiName: string }
  | { type: "screen_flow"; flowApiName: string };

export function actionRef(action: CardAction): ActionRef {
  switch (action.type) {
    case "update_record":
      return { type: "update_record" };
    case "create_related":
      return { type: "create_related", object: action.object };
    case "quick_action":
      return { type: "quick_action", actionApiName: action.actionApiName };
    case "screen_flow":
      return { type: "screen_flow", flowApiName: action.flowApiName };
  }
}

function sameRef(a: ActionRef, b: ActionRef): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case "update_record":
      return true;
    case "create_related":
      return a.object === (b as Extract<ActionRef, { type: "create_related" }>).object;
    case "quick_action":
      return (
        a.actionApiName === (b as Extract<ActionRef, { type: "quick_action" }>).actionApiName
      );
    case "screen_flow":
      return a.flowApiName === (b as Extract<ActionRef, { type: "screen_flow" }>).flowApiName;
  }
}

export function findAction(actions: CardAction[], ref: ActionRef): CardAction | undefined {
  return actions.find((a) => sameRef(actionRef(a), ref));
}

/**
 * Adds the action if absent. If present, MERGES rather than replaces:
 * hand-mapped `inputs` and a customized label survive a re-add from a surface
 * that rebuilds the action from CRM metadata.
 */
export function upsertAction(
  actions: CardAction[],
  action: CardAction,
  opts: { overwriteInputs?: boolean } = {},
): CardAction[] {
  const ref = actionRef(action);
  const index = actions.findIndex((a) => sameRef(actionRef(a), ref));
  if (index === -1) return [...actions, action];

  const existing = actions[index];
  // An incoming label equal to the action's own api name carries no admin
  // intent — it is what a discovery source emits when the CRM gave it nothing
  // better. It must never overwrite a label the admin chose. This applies to
  // EVERY type: a renamed quick action is as much the admin's work as a
  // renamed flow.
  const bareApiName =
    action.type === "screen_flow"
      ? action.flowApiName
      : action.type === "quick_action"
        ? action.actionApiName
        : undefined;
  let merged: CardAction = {
    ...action,
    label: bareApiName !== undefined && action.label === bareApiName ? existing.label : action.label,
  };
  // Only screen_flow carries `inputs`, so only it can lose hand-mapped ones.
  if (existing.type === "screen_flow" && merged.type === "screen_flow") {
    merged = {
      ...merged,
      inputs: opts.overwriteInputs
        ? merged.inputs
        : { ...merged.inputs, ...existing.inputs },
    };
  }
  const next = [...actions];
  next[index] = merged;
  return next;
}

export function removeAction(actions: CardAction[], ref: ActionRef): CardAction[] {
  return actions.filter((a) => !sameRef(actionRef(a), ref));
}

export function setActionEnabled(
  actions: CardAction[],
  ref: ActionRef,
  enabled: boolean,
): CardAction[] {
  return actions.map((a) => (sameRef(actionRef(a), ref) ? { ...a, enabled } : a));
}

export function reorderActions(actions: CardAction[], from: number, to: number): CardAction[] {
  if (from < 0 || to < 0 || from >= actions.length || to >= actions.length) return actions;
  const next = [...actions];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
```

- [ ] **Step 4: Export from the package index**

Add to `packages/core/src/index.ts`, following the existing export style in that file:

```ts
export * from "./card-actions.js";
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm --filter @cardstack/core test -- card-actions
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/card-actions.ts packages/core/src/card-actions.test.ts packages/core/src/index.ts
git commit -m "feat: shared pure module for card action mutations"
```

---

## Task 3: The render decision — `selectRenderableActions`

**Files:**
- Modify: `packages/core/src/card-actions.ts`, `packages/core/src/card-actions.test.ts`

**Interfaces:**
- Consumes: `CardAction`, the module from Task 2.
- Produces: `selectRenderableActions(actions, { canEdit }): CardAction[]`. Task 5 consumes it.

**Why here and not in the widget:** `packages/widgets` has no test runner. Keeping this decision in `core` is what makes "disabled actions never render" a tested claim rather than an asserted one.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/card-actions.test.ts`:

```ts
import { selectRenderableActions } from "./card-actions.js";

describe("selectRenderableActions", () => {
  it("preserves configured order rather than grouping by type", () => {
    const result = selectRenderableActions([task, edit, flow], { canEdit: true });
    expect(result.map((a) => a.type)).toEqual([
      "create_related",
      "update_record",
      "screen_flow",
    ]);
  });

  it("drops disabled actions", () => {
    const result = selectRenderableActions([edit, { ...flow, enabled: false }, task], {
      canEdit: true,
    });
    expect(result.map((a) => a.type)).toEqual(["update_record", "create_related"]);
  });

  it("skips update_record when editing is not permitted, promoting the next action", () => {
    const result = selectRenderableActions([edit, flow], { canEdit: false });
    expect(result.map((a) => a.type)).toEqual(["screen_flow"]);
  });

  it("returns an empty list when every action is disabled", () => {
    const result = selectRenderableActions(
      [
        { ...edit, enabled: false },
        { ...flow, enabled: false },
      ],
      { canEdit: true },
    );
    expect(result).toEqual([]);
  });

  it("returns an empty list for an empty configuration", () => {
    expect(selectRenderableActions([], { canEdit: true })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @cardstack/core test -- card-actions
```

Expected: FAIL — `selectRenderableActions is not exported`.

- [ ] **Step 3: Implement it**

Append to `packages/core/src/card-actions.ts`:

```ts
/**
 * What the record card should render, in configured order.
 *
 * The FIRST element is the primary button — order is the admin's control over
 * which action leads (design 3a). Disabled actions never render, and
 * `update_record` is skipped when permissions or the layout leave nothing
 * editable, so the next enabled action is promoted rather than leaving a gap.
 *
 * Callers must handle the empty result: an empty CONFIGURATION is not the same
 * as an empty RESULT, and the card falls back to its legacy edit button only in
 * the former case.
 */
export function selectRenderableActions(
  actions: CardAction[],
  opts: { canEdit: boolean },
): CardAction[] {
  return actions.filter((action) => {
    if (action.enabled === false) return false;
    if (action.type === "update_record" && !opts.canEdit) return false;
    return true;
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @cardstack/core test -- card-actions
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/card-actions.ts packages/core/src/card-actions.test.ts
git commit -m "feat: card action render selection"
```

---

## Task 4: Server refuses disabled actions

**Files:**
- Modify: `apps/mcp-server/src/server.ts:1537-1546` (shared flow handler), `:1830-1840` (quick action)
- Test: `apps/mcp-server/src/server.test.ts`

**Interfaces:**
- Consumes: `enabled` from Task 1.
- Produces: no new exports. Behavior only.

**Why this matters:** hard rule 2 — enforcement is server-side only. A disabled `screen_flow` still carries a valid `flowApiName`, so without this the toggle is decorative. Both chokepoints already reject *unconfigured* actions; this extends them to *disabled* ones.

- [ ] **Step 1: Write the failing tests**

In `apps/mcp-server/src/server.test.ts`, add a helper beside the existing `serverWithFlowLayout` (around line 876) that disables the flow action:

```ts
async function serverWithDisabledFlowLayout() {
  const configStore = new InMemoryConfigStore();
  const layout: LayoutConfig = {
    ...structuredClone(demoDealsLayout),
    recordCard: {
      ...structuredClone(demoDealsLayout.recordCard),
      actions: [
        ...structuredClone(demoDealsLayout.recordCard.actions),
        {
          type: "screen_flow",
          flowApiName: "Renewal_Playbook",
          label: "Run renewal playbook",
          embed: "auto",
          enabled: false,
          inputs: { recordId: { source: "context", key: "recordId" } },
        },
      ],
    },
  };
  await configStore.saveDraft(layout);
  await configStore.publish(DEMO_TENANT_ID, "deals");
  return createCardstackServer({ adapter: new MockCrmAdapter(), configStore });
}
```

Match the exact argument shape of the existing `createCardstackServer(...)` call in `serverWithFlowLayout` — copy it rather than retyping, since it may pass more than `adapter` and `configStore`.

Then add the tests, beside the existing "rejects a flow not configured on the card" case at line 959:

```ts
it("crm_flow_start refuses a flow that is configured but disabled", async () => {
  const local = await serverWithDisabledFlowLayout();
  const result = await local.callTool({
    name: "crm_flow_start",
    arguments: { object: "deals", recordId: "d-001", flowApiName: "Renewal_Playbook" },
  });
  expect(result.isError).toBe(true);
  expect(textOf(result)).toContain("not configured");
});

it("crm_flow_continue refuses a disabled flow too", async () => {
  const local = await serverWithDisabledFlowLayout();
  const result = await local.callTool({
    name: "crm_flow_continue",
    arguments: {
      object: "deals",
      recordId: "d-001",
      flowApiName: "Renewal_Playbook",
      actionSessionId: "s-1",
    },
  });
  expect(result.isError).toBe(true);
});
```

The continue-side test is deliberate even though both tools share a handler today: the sharing is an implementation detail, and this test fails loudly if they are ever split apart.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @cardstack/mcp-server test -- server
```

Expected: FAIL — the disabled flow currently starts successfully, so `isError` is falsy.

- [ ] **Step 3: Extend the flow lookup**

In `apps/mcp-server/src/server.ts`, change the `.find()` at line 1537:

```ts
      const action = config.recordCard.actions.find(
        (a): a is Extract<CardAction, { type: "screen_flow" }> =>
          a.type === "screen_flow" &&
          a.flowApiName === args.flowApiName &&
          a.enabled !== false,
      );
```

Leave the existing `if (!action) throw ...` message unchanged — a disabled action is, from the caller's perspective, not available on the card, and a distinct message would tell an unauthorized caller that the action exists.

- [ ] **Step 4: Extend the quick-action lookup**

Find the equivalent `.find()` guarding the error at `server.ts:1835` and add the same `&& a.enabled !== false` clause to its predicate.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm --filter @cardstack/mcp-server test
```

Expected: PASS, including the pre-existing flow tests — `serverWithFlowLayout` builds an action without `enabled`, which parses to `true`, so it must still start successfully.

- [ ] **Step 6: Commit**

```bash
git add apps/mcp-server/src/server.ts apps/mcp-server/src/server.test.ts
git commit -m "fix: refuse disabled card actions server-side"
```

---

## Task 4b: Widget test harness

**Files:**
- Modify: `packages/widgets/package.json`
- Create: `packages/widgets/vitest.config.ts`, `packages/widgets/src/record-card/card.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `pnpm --filter @cardstack/widgets test` that runs BOTH the existing CSS-coverage script and a vitest suite. Task 5 adds cases to `card.test.tsx`.

**Why:** `packages/widgets` has had no test runner. Task 5 changes the card's most user-visible logic, and covering it only through `core` plus demos leaves the JSX dispatch itself unverified.

- [ ] **Step 1: Add the dev dependencies**

```bash
pnpm --filter @cardstack/widgets add -D vitest@^3.0.0 jsdom @testing-library/react @testing-library/dom
```

Pin `vitest@^3.0.0` to match the version `packages/core`, `apps/studio`, and `apps/mcp-server` already use — a second major in one workspace causes duplicate-instance failures.

- [ ] **Step 2: Add the vitest config**

Create `packages/widgets/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.tsx"],
  },
});
```

`@vitejs/plugin-react` is already a devDependency — the build uses it.

- [ ] **Step 3: Keep the CSS check in the test script**

In `packages/widgets/package.json`, change:

```json
    "test": "node scripts/check-css-coverage.mjs && vitest run",
```

The CSS-coverage check must keep running. Dropping it to make room for vitest would silently retire an existing guard.

- [ ] **Step 4: Write one smoke test**

Create `packages/widgets/src/record-card/card.test.tsx` with a single test that renders the card with a minimal payload and asserts the record title appears. Read `packages/widgets/src/record-card/card.tsx` to find the component's exported name and its required props, and build the payload from the same shape the existing demos use. This test exists to prove the harness works; Task 5 adds the behavioral cases.

- [ ] **Step 5: Run it**

```bash
pnpm --filter @cardstack/widgets test
```

Expected: the CSS-coverage check passes, then 1 vitest test passes.

- [ ] **Step 6: Confirm the build still works**

```bash
pnpm --filter @cardstack/widgets build
```

Expected: all four HTML bundles build. The new config must not interfere — `vite build` reads `vite.config.*`, not `vitest.config.ts`.

- [ ] **Step 7: Commit**

```bash
git add packages/widgets/package.json packages/widgets/vitest.config.ts packages/widgets/src/record-card/card.test.tsx pnpm-lock.yaml
git commit -m "test: add a vitest harness to the widgets package"
```

---

## Task 5: Record card renders the configured action row

**Files:**
- Modify: `packages/widgets/src/record-card/card.tsx:297-305`, `:530-590`

**Interfaces:**
- Consumes: `selectRenderableActions` (Task 3), `CardAction` with `enabled` (Task 1).
- Produces: no exports. The card now renders all four action types in configured order.

**Current behavior being replaced:** the footer hardcodes an "Edit fields" primary button gated on `canEdit`, then renders only `create_related` actions via a type filter. `quick_action` and `screen_flow` never appear, and array order is ignored.

- [ ] **Step 1: Add the flow/quick-action handoff**

In `card.tsx`, beside the existing `runCreateRelated` at line 302, add:

```tsx
  const runFlowAction = (action: Extract<CardAction, { type: "screen_flow" }>) =>
    host?.sendFollowup?.(`Run the "${action.label}" flow on "${titleText}" (id ${record.id})`);

  const runQuickAction = (action: Extract<CardAction, { type: "quick_action" }>) =>
    host?.sendFollowup?.(`Run the "${action.label}" action on "${titleText}" (id ${record.id})`);
```

`sendFollowup` rather than `callTool` is deliberate: starting a flow returns an interview screen, and `packages/widgets/src/flow-run` already renders those. The card must not host a flow interview inside itself. This also keeps the card on the host handoff path required by hard rule 4.

- [ ] **Step 2: Replace the footer's ready state**

Replace the `case "ready":` block (around line 557) with:

```tsx
    case "ready": {
      const rendered = selectRenderableActions(actions, { canEdit });
      // An empty CONFIGURATION keeps the legacy button — every layout predating
      // the actions editor has `actions: []` and must not silently lose its edit
      // affordance. An empty RESULT (everything disabled) correctly renders none.
      if (actions.length === 0) {
        return (
          <span className="rc-footer-left">
            {canEdit && (
              <button type="button" className="cs-btn cs-btn--primary" onClick={onEdit}>
                Edit fields
              </button>
            )}
          </span>
        );
      }
      return (
        <span className="rc-footer-left">
          {rendered.map((action, i) => {
            const className = i === 0 ? "cs-btn cs-btn--primary" : "cs-btn";
            switch (action.type) {
              case "update_record":
                return (
                  <button key="update_record" type="button" className={className} onClick={onEdit}>
                    {action.label}
                  </button>
                );
              case "create_related":
                return (
                  <button
                    key={`create_related:${action.object}`}
                    type="button"
                    className={className}
                    onClick={() => onCreateRelated(action)}
                  >
                    {action.label}
                  </button>
                );
              case "quick_action":
                return (
                  <button
                    key={`quick_action:${action.actionApiName}`}
                    type="button"
                    className={className}
                    onClick={() => onQuickAction(action)}
                  >
                    {action.label}
                  </button>
                );
              case "screen_flow":
                return (
                  <button
                    key={`screen_flow:${action.flowApiName}`}
                    type="button"
                    className={className}
                    onClick={() => onFlowAction(action)}
                  >
                    {action.label}
                  </button>
                );
            }
          })}
        </span>
      );
    }
```

Keys are `type:identity` rather than `label`, so renaming an action does not remount its button.

- [ ] **Step 3: Thread the new props**

Add `onFlowAction` and `onQuickAction` to the footer component's props type (beside `onCreateRelated` at line 545) with the signatures:

```tsx
  onFlowAction: (action: Extract<CardAction, { type: "screen_flow" }>) => void;
  onQuickAction: (action: Extract<CardAction, { type: "quick_action" }>) => void;
```

Destructure them alongside `onCreateRelated`, and pass `onFlowAction={runFlowAction}` / `onQuickAction={runQuickAction}` at the call site near line 503 where `actions={actions}` is already passed.

Import `selectRenderableActions` from `@cardstack/core` at the top of the file, alongside the existing `CardAction` type import.

- [ ] **Step 4: Update the stale comment**

Replace the comment at line 297-299, which describes the behavior this task removes:

```tsx
  // Configured layout actions (design 1a/3a). Order is the admin's control over
  // which action is primary; `selectRenderableActions` drops disabled ones and
  // skips update_record when nothing is editable. Flow and quick actions hand
  // off to the host so the model starts them and flow-run renders the screens.
  const actions = layout.recordCard.actions;
```

- [ ] **Step 5: Add the behavioral tests**

Extend `packages/widgets/src/record-card/card.test.tsx` (harness from Task 4b) with cases asserting, against a rendered card:

- actions render in configured array order, not grouped by type — assert the rendered button labels in order;
- the first rendered button carries the `cs-btn--primary` class and later ones do not;
- a disabled action produces no button;
- an `update_record` action's configured label is used, not "Edit fields";
- a `screen_flow` button click calls the host's `sendFollowup` with text naming the action — pass a stub host whose `sendFollowup` is a `vi.fn()`;
- with `canEdit` false, the `update_record` button is absent and the next action carries `cs-btn--primary`;
- **back-compat:** an empty `actions` array with `canEdit` true still renders an "Edit fields" button.

Build each payload from the same shape the Task 4b smoke test established.

```bash
pnpm --filter @cardstack/widgets test
```

Expected: all pass.

- [ ] **Step 6: Verify the build and the golden paths**

```bash
pnpm --filter @cardstack/widgets typecheck && pnpm build && pnpm demo:m1 && pnpm demo:m2
```

Expected: build succeeds; both demos pass. `demo:m2` is the confirmed-write path and exercises the edit button, which is now label-driven — if the demo layout configures an `update_record` action, its label appears instead of "Edit fields".

- [ ] **Step 7: Commit**

```bash
git add packages/widgets/src/record-card/card.tsx packages/widgets/src/record-card/card.test.tsx
git commit -m "feat: record card renders configured action row in order"
```

---

## Task 6: Unify the Flows admin write path

**Files:**
- Modify: `apps/studio/app/api/flows/assign/route.ts`
- Test: `apps/studio/app/api/flows/assign/route.test.ts` (create)

**Interfaces:**
- Consumes: `upsertAction`, `setActionEnabled`, `actionRef` (Task 2).
- Produces: no new exports. The route's contract is unchanged; its semantics change.

**Deliberate behavior change — must appear in the PR note (hard rule 6):** disabling now preserves the action instead of deleting it, and the route saves to draft instead of publishing immediately. The route's current comment argues for immediate publish because "exposing a flow IS the admin's intent"; that rationale is superseded because two surfaces editing one array cannot hold opposite publish semantics.

**Note on testing strategy:** Studio has no route-test harness — `apps/studio/lib/studio-session.test.ts` and `login-flow.test.ts` are pure unit tests with no mocking of `getStore` / `getAdapter`. Rather than invent a Next.js route mocking harness, extract the route's decision into a pure function in `lib/` and test that. The route becomes fetch-and-persist wiring around it.

- [ ] **Step 1: Write the failing tests**

Create `apps/studio/lib/action-assignment.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CardAction } from "@cardstack/core";
import { planActionAssignment } from "./action-assignment";

const renewal: CardAction = {
  type: "screen_flow",
  flowApiName: "Renewal",
  label: "Run renewal",
  embed: "auto",
  enabled: true,
  inputs: { renewalDate: { source: "field", field: "Custom__c" } },
};

describe("planActionAssignment", () => {
  it("disabling preserves the action and marks it disabled", () => {
    const next = planActionAssignment({
      actions: [renewal],
      kind: "screen_flow",
      apiName: "Renewal",
      enabled: false,
      autoMappedInputs: {},
      discoveredLabel: "Renewal",
    });
    expect(next.actions).toHaveLength(1);
    expect(next.actions[0].enabled).toBe(false);
    expect(next.actions[0].type).toBe("screen_flow");
  });

  it("re-enabling preserves hand-mapped inputs", () => {
    const next = planActionAssignment({
      actions: [{ ...renewal, enabled: false }],
      kind: "screen_flow",
      apiName: "Renewal",
      enabled: true,
      // the name-convention auto-mapper would produce this
      autoMappedInputs: { renewalDate: { source: "field", field: "Renewal_Date__c" } },
      discoveredLabel: "Renewal",
    });
    const action = next.actions[0];
    expect(action.type === "screen_flow" && action.inputs.renewalDate).toEqual({
      source: "field",
      field: "Custom__c",
    });
  });

  it("keeps the admin's label when the discovered one is the bare api name", () => {
    const next = planActionAssignment({
      actions: [renewal],
      kind: "screen_flow",
      apiName: "Renewal",
      enabled: true,
      autoMappedInputs: {},
      discoveredLabel: "Renewal",
    });
    expect(next.actions[0].label).toBe("Run renewal");
  });

  it("auto-maps inputs for a genuinely new action", () => {
    const next = planActionAssignment({
      actions: [],
      kind: "screen_flow",
      apiName: "Onboarding",
      enabled: true,
      autoMappedInputs: { owner: { source: "field", field: "OwnerId" } },
      discoveredLabel: "Onboarding flow",
    });
    const action = next.actions[0];
    expect(action.type === "screen_flow" && action.inputs.owner).toEqual({
      source: "field",
      field: "OwnerId",
    });
    expect(action.label).toBe("Onboarding flow");
  });

  it("disabling an action that was never configured is a no-op", () => {
    const next = planActionAssignment({
      actions: [],
      kind: "screen_flow",
      apiName: "Ghost",
      enabled: false,
      autoMappedInputs: {},
      discoveredLabel: "Ghost",
    });
    expect(next.actions).toEqual([]);
  });

  it("adds a quick action without inputs", () => {
    const next = planActionAssignment({
      actions: [],
      kind: "quick_action",
      apiName: "NewTask",
      enabled: true,
      autoMappedInputs: {},
      discoveredLabel: "New task",
    });
    expect(next.actions[0]).toEqual({
      type: "quick_action",
      actionApiName: "NewTask",
      label: "New task",
      enabled: true,
    });
  });
});
```

- [ ] **Step 1b: Implement the pure function**

Create `apps/studio/lib/action-assignment.ts`:

```ts
/**
 * The decision behind /api/flows/assign, separated from its I/O so it is
 * testable without a Next.js route harness.
 *
 * Disabling sets `enabled: false` rather than removing: the action keeps its
 * label, position and hand-mapped inputs, and stays re-enableable from the
 * actions editor. Enabling MERGES, so auto-mapping seeds a genuinely new action
 * but never overwrites what an admin mapped by hand.
 */
import {
  setActionEnabled,
  upsertAction,
  type ActionInputMappings,
  type ActionRef,
  type CardAction,
} from "@cardstack/core";

export function planActionAssignment(input: {
  actions: CardAction[];
  kind: "screen_flow" | "quick_action";
  apiName: string;
  enabled: boolean;
  autoMappedInputs: ActionInputMappings;
  discoveredLabel: string;
}): { actions: CardAction[]; mappedInputs: string[] } {
  const ref: ActionRef =
    input.kind === "quick_action"
      ? { type: "quick_action", actionApiName: input.apiName }
      : { type: "screen_flow", flowApiName: input.apiName };

  if (!input.enabled) {
    return { actions: setActionEnabled(input.actions, ref, false), mappedInputs: [] };
  }

  if (input.kind === "quick_action") {
    return {
      actions: upsertAction(input.actions, {
        type: "quick_action",
        actionApiName: input.apiName,
        label: input.discoveredLabel,
        enabled: true,
      }),
      mappedInputs: [],
    };
  }

  return {
    actions: upsertAction(input.actions, {
      type: "screen_flow",
      flowApiName: input.apiName,
      label: input.discoveredLabel,
      embed: "auto",
      enabled: true,
      inputs: input.autoMappedInputs,
    }),
    mappedInputs: Object.keys(input.autoMappedInputs),
  };
}
```

Note this relies on `upsertAction`'s label rule from Task 2: an incoming label equal to the bare api name carries no admin intent and loses to the existing one.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @cardstack/studio test -- action-assignment
```

Expected: FAIL — `Cannot find module './action-assignment'`. After Step 1b it passes; run it again to confirm before continuing.

- [ ] **Step 3: Rewire the route onto the pure function**

In `apps/studio/app/api/flows/assign/route.ts`, keep the existing request parsing, the `store.getLayoutRecord` load, the `if (!base)` 404, and the auto-mapping loop that builds `inputs` from `def.variables` — that loop is I/O-shaped and stays in the route. Replace only the mutation block (the `let actions = base.recordCard.actions.filter(...)` line and both `actions = [...actions, {...}]` assignments) with a call to the pure function:

```ts
import { planActionAssignment } from "../../../../lib/action-assignment";

    // ... existing adapter fetches and the auto-mapping loop produce `inputs`
    // and `discoveredLabel` ...

    const { actions, mappedInputs } = planActionAssignment({
      actions: base.recordCard.actions,
      kind,
      apiName: flowApiName,
      enabled: body.enabled,
      autoMappedInputs: inputs,
      discoveredLabel,
    });
```

For a quick action, `discoveredLabel` is `describe?.label ?? flowApiName` and `inputs` is `{}`. For a screen flow it is `def?.label ?? flowApiName`. Skip the adapter fetches entirely when `body.enabled` is false — disabling needs no CRM metadata, and avoiding the round-trip means disabling still works when the org is unreachable.

- [ ] **Step 4: Stop auto-publishing**

Replace the save-and-publish tail:

```ts
    const draft = parseLayoutConfig({
      ...base,
      recordCard: { ...base.recordCard, actions },
    });
    await store.saveDraft(draft);
    return NextResponse.json({
      ok: true,
      object,
      enabled: body.enabled,
      mappedInputs,
      saved: "draft",
    });
```

- [ ] **Step 5: Update the route's header comment**

Rewrite the doc comment to describe the new semantics — that disabling sets `enabled: false` rather than removing, that enabling merges rather than rebuilds, and that changes land in the draft and go live at the next publish. Remove the superseded "The publish is immediate…" paragraph.

- [ ] **Step 6: Fix the Flows page's expectations**

The Flows admin page reads `revision` from this response and reflects an immediately-live state. Search for its fetch of `/api/flows/assign` in `apps/studio` and update the success copy to the draft language used elsewhere ("Saved to draft"), matching `permissions-editor.tsx`. Also update `/api/flows/route.ts`'s `exposed` / `assignedTo` computation to treat an action with `enabled === false` as not exposed, so the Flows page toggle reflects the flag.

- [ ] **Step 7: Run the tests to verify they pass**

```bash
pnpm --filter @cardstack/studio test && pnpm typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/studio/app/api/flows apps/studio/components apps/studio/app/flows
git commit -m "fix: one write path for card actions

Disabling a flow from the Flows page deleted the action and destroyed
hand-mapped inputs. It now sets enabled: false via the shared module and
saves to draft, matching the actions editor."
```

---

## Task 7: Per-object action discovery route

**Files:**
- Create: `apps/studio/app/api/objects/[object]/available-actions/route.ts`, `.../route.test.ts`

**Interfaces:**
- Consumes: `actionRef`, `findAction` (Task 2).
- Produces: `GET /api/objects/[object]/available-actions` returning `AvailableActionsResponse` (exported from the route module for the editor's use in Task 8):

```ts
export interface DiscoveredAction {
  ref: ActionRef;
  label: string;
  /** Present for screen_flow only. */
  inputVariables?: { name: string; dataType: string; isCollection: boolean }[];
  alreadyConfigured: boolean;
}
export interface ActionSource {
  kind: "builtin" | "quick_action" | "screen_flow";
  entries: DiscoveredAction[];
  /** Set when the source could not be read — an empty org is not an error. */
  unavailable?: string;
}
export interface AvailableActionsResponse {
  sources: ActionSource[];
}
```

Note `isCollection` is carried through, unlike `/api/flows` which filters collection variables out. The mapping editor needs it to offer `selection` for `recordIds` inputs.

**Same split as Task 6:** the shaping decision is a pure function in `lib/`, tested directly; the route is fetch-and-degrade wiring around it.

- [ ] **Step 1: Write the failing tests**

Create `apps/studio/lib/action-catalog.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CardAction } from "@cardstack/core";
import { buildActionCatalog } from "./action-catalog";

const configured: CardAction[] = [
  {
    type: "screen_flow",
    flowApiName: "Renewal",
    label: "Run renewal",
    embed: "auto",
    enabled: true,
    inputs: {},
  },
];

describe("buildActionCatalog", () => {
  it("returns builtins even when both CRM sources are unavailable", () => {
    const catalog = buildActionCatalog({
      configured: [],
      objects: ["tasks", "notes"],
      quickActions: null,
      flows: null,
    });
    const builtin = catalog.sources.find((s) => s.kind === "builtin");
    expect(builtin?.entries.map((e) => e.ref.type)).toEqual([
      "update_record",
      "create_related",
      "create_related",
    ]);
    expect(catalog.sources.find((s) => s.kind === "quick_action")?.unavailable).toBeTruthy();
    expect(catalog.sources.find((s) => s.kind === "screen_flow")?.unavailable).toBeTruthy();
  });

  it("distinguishes an empty source from an unavailable one", () => {
    const catalog = buildActionCatalog({
      configured: [],
      objects: [],
      quickActions: [],
      flows: [],
    });
    expect(catalog.sources.find((s) => s.kind === "screen_flow")?.unavailable).toBeUndefined();
    expect(catalog.sources.find((s) => s.kind === "screen_flow")?.entries).toEqual([]);
  });

  it("marks already-configured actions", () => {
    const catalog = buildActionCatalog({
      configured,
      objects: [],
      quickActions: [],
      flows: [
        { api: "Renewal", label: "Renewal", inputVariables: [] },
        { api: "Onboarding", label: "Onboarding", inputVariables: [] },
      ],
    });
    const entries = catalog.sources.find((s) => s.kind === "screen_flow")!.entries;
    expect(entries.find((e) => e.label === "Renewal")?.alreadyConfigured).toBe(true);
    expect(entries.find((e) => e.label === "Onboarding")?.alreadyConfigured).toBe(false);
  });

  it("treats a configured-but-disabled action as already configured", () => {
    const catalog = buildActionCatalog({
      configured: [{ ...configured[0], enabled: false }],
      objects: [],
      quickActions: [],
      flows: [{ api: "Renewal", label: "Renewal", inputVariables: [] }],
    });
    const entries = catalog.sources.find((s) => s.kind === "screen_flow")!.entries;
    expect(entries[0].alreadyConfigured).toBe(true);
  });

  it("carries input variables including collections", () => {
    const catalog = buildActionCatalog({
      configured: [],
      objects: [],
      quickActions: [],
      flows: [
        {
          api: "Bulk",
          label: "Bulk",
          inputVariables: [
            { name: "recordIds", dataType: "String", isCollection: true },
            { name: "note", dataType: "String", isCollection: false },
          ],
        },
      ],
    });
    const entry = catalog.sources.find((s) => s.kind === "screen_flow")!.entries[0];
    expect(entry.inputVariables?.map((v) => v.isCollection)).toEqual([true, false]);
  });
});
```

`null` means the source could not be read; `[]` means the org genuinely has none. Keeping them distinct is what lets the picker show a teaching state rather than an error.

- [ ] **Step 1b: Implement the pure function**

Create `apps/studio/lib/action-catalog.ts` exporting `buildActionCatalog(input): AvailableActionsResponse`, with the `DiscoveredAction` / `ActionSource` / `AvailableActionsResponse` types from this task's Interfaces block. It uses `findAction` from `@cardstack/core` against `configured` to compute `alreadyConfigured`, so a disabled action still counts. `create_related` entries come from `objects` unfiltered — the action posts a followup and the model drives `crm_create_record`, which does not require the target to have a layout.

- [ ] **Step 2: Run the tests to verify they pass**

```bash
pnpm --filter @cardstack/studio test -- action-catalog
```

Expected: FAIL before Step 1b, PASS after.

- [ ] **Step 3: Implement the route around it**

Follow `apps/studio/app/api/objects/[object]/route.ts` for params and auth, and `apps/studio/app/api/flows/route.ts` for adapter access and degradation. The route fetches, then calls `buildActionCatalog`. Key requirements:

- `const { tenantId } = await getUserContextFromRequest(req)`; `type Params = { params: Promise<{ object: string }> }`.
- If the connection is not `connected`, return the builtin source only, with both CRM sources marked `unavailable: "Not connected to a CRM."`.
- Wrap `listQuickActions` and `listFlows` individually so one failing does not fail the other: `.catch(() => null)`, and `null` becomes `unavailable`, while `[]` is a legitimate empty result.
- Apply the same `DEFINITION_FETCH_CAP = 40` guardrail `/api/flows` uses before fetching flow definitions.
- Pass `configured: (record.draft ?? record.published)?.recordCard.actions ?? []` so a disabled action still counts as configured.
- Errors return `{ error: String(error) }` with status 502, matching `/api/flows`.

- [ ] **Step 4: Verify the route by hand**

```bash
pnpm --filter @cardstack/studio dev
```

```bash
curl -s localhost:3002/api/objects/deals/available-actions | head -40
```

Expected: HTTP 200 with a `sources` array. Against the mock portal the quick-action and screen-flow sources are empty rather than `unavailable`, since the mock adapter implements neither optional method — confirm that distinction holds, because the picker's teaching state depends on it.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/lib/action-catalog.ts apps/studio/lib/action-catalog.test.ts "apps/studio/app/api/objects/[object]/available-actions"
git commit -m "feat: per-object action discovery route"
```

---

## Task 8: The actions editor

**Files:**
- Create: `apps/studio/app/objects/[object]/actions/page.tsx`, `apps/studio/components/actions-editor.tsx`

**Interfaces:**
- Consumes: `AvailableActionsResponse` (Task 7); `reorderActions`, `setActionEnabled`, `removeAction`, `upsertAction`, `actionRef` (Task 2).
- Produces: the editor UI. Task 9 adds the mapping sub-editor to its screen-flow rows.

**Pattern to follow:** read `apps/studio/components/permissions-editor.tsx` in full first. This component mirrors it — load draft-or-published from `/api/layout/[object]`, save to the draft, show the "Saved to draft" flash, leave publishing to the builder. Read `apps/studio/components/builder/canvas.tsx` for the established `@dnd-kit` setup (`DndContext`, `SortableContext`, `useSortable`, `CSS.Transform.toString`) and copy that idiom rather than inventing one.

- [ ] **Step 1: Create the route shell**

`apps/studio/app/objects/[object]/actions/page.tsx`, matching the shape of the sibling `permissions/page.tsx`:

```tsx
import { ActionsEditor } from "../../../../components/actions-editor";

export default async function ActionsPage({ params }: { params: Promise<{ object: string }> }) {
  const { object } = await params;
  return <ActionsEditor object={object} />;
}
```

Check `permissions/page.tsx` for whether it wraps children in a shell component; match it exactly.

- [ ] **Step 2: Build the configured list**

`apps/studio/components/actions-editor.tsx`, a client component (`"use client"`). Requirements:

- Load `/api/layout/${object}` and `/api/objects/${object}/available-actions` in parallel on mount.
- Render `config.recordCard.actions` inside a `DndContext` + `SortableContext` with `verticalListSortingStrategy`.
- Each row: drag handle, a type chip, an inline-editable label input, an on/off switch bound to `setActionEnabled`, and a remove button bound to `removeAction`.
- The **first enabled** row carries a "Primary" badge. Compute it as the index of the first action with `enabled !== false` — not index 0, which may be disabled.
- Disabled rows stay in place, dimmed (reduced opacity), switch off. Do not move them to a separate list; their position is what `enabled` exists to preserve.
- On drag end, call `reorderActions(actions, from, to)` and save.
- Every mutation saves the whole draft via the same `PUT`/`POST` shape `permissions-editor.tsx` uses against `/api/layout/${object}`, then shows "Saved to draft" for ~1600ms.
- A pinned, un-removable footer row reading "Writes require confirmation" — plain text, no switch, no config behind it.

- [ ] **Step 3: Build the add picker**

- An "Add action" button opens a panel grouped by the three sources from the discovery response.
- Entries with `alreadyConfigured: true` render checked and disabled, not hidden.
- A source with `unavailable` set renders its message as a teaching state, e.g. "No screen flows found in this org." — never as an error banner.
- CRM-discovered entries (quick actions, screen flows) use the metadata purple from the design tokens: background `#f0edf7`, text `#5a4a8a`.
- Selecting an entry calls `upsertAction` with a new action built from the entry, `enabled: true`, and (for screen flows) `inputs: {}`, then saves.

- [ ] **Step 4: Verify in the running app**

```bash
pnpm --filter @cardstack/studio dev
```

Open `http://localhost:3002/objects/deals/actions`. Confirm: actions list and reorder; toggling off dims the row in place and keeps it; the Primary badge follows the first enabled row; the add picker shows already-configured entries as checked; the mock portal shows the empty teaching states for flows and quick actions.

- [ ] **Step 5: Commit**

```bash
git add "apps/studio/app/objects/[object]/actions" apps/studio/components/actions-editor.tsx
git commit -m "feat: actions editor route"
```

---

## Task 9: Screen-flow input mapping editor

**Files:**
- Create: `apps/studio/components/action-inputs-editor.tsx`
- Modify: `apps/studio/components/actions-editor.tsx`

**Interfaces:**
- Consumes: `inputVariables` from the discovery response (Task 7); `ActionInputMapping` from `@cardstack/core`.
- Produces: `<ActionInputsEditor variables={...} value={inputs} onChange={(next) => ...} />`.

**Scope:** screen flows only. `quick_action` has no `inputs` field — Salesforce owns its mini-layout via `describeQuickAction` / `getQuickActionDefaults`, and a Cardstack-side mapping would be a second competing source for the same values.

- [ ] **Step 1: Build the per-variable rows**

One row per entry in `inputVariables`. Each row shows the variable name, its `dataType`, and a source selector over the five `ActionInputMapping` sources, plus the fields that source needs:

- `context` → a select over `ActionContextKey` (`recordId`, `objectApiName`, `userId`, `userEmail`, `audience`, `actionSessionId` — read the enum in `layout-config.ts` and use it as the source of truth rather than this list).
- `field` → a field API name input.
- `literal` → a value input.
- `ask` → a prompt input plus a required switch.
- `selection` → optional object and relationship inputs.

- [ ] **Step 2: Gate the sources by the variable's type**

- When `isCollection` is true, offer `selection` and nothing else — the schema pins `valueType: "recordIds"` for that source.
- When `isCollection` is false, offer `context`, `field`, `literal`, and `ask`.
- Preselect `valueType` from `dataType` (`Date` → `date`, `Number`/`Currency` → `number`, `Boolean` → `boolean`, otherwise `string`).

This gating is not in `/design` — it is this plan's addition to stop admins producing mappings the runtime cannot resolve. If it proves too restrictive, relaxing it to "offer all five, warn on mismatch" is a one-line change to the filter.

- [ ] **Step 3: Handle an unreadable flow definition**

When the discovery response carried no `inputVariables` for the flow (definition unreadable — installed or managed flows), render a caution-tinted note using the design's draft/caution tokens (`#faf3dd` background, `#8a5a10` text): "We couldn't read this flow's variables, so we can't list its inputs. The flow's own screens will collect them." Do not block adding or keeping the action.

- [ ] **Step 4: Wire it into the editor**

Expanding a screen-flow row in `actions-editor.tsx` renders `<ActionInputsEditor>`. Its `onChange` produces the next `inputs` record, which goes through `upsertAction(actions, { ...action, inputs: next }, { overwriteInputs: true })` — the admin's explicit edit is exactly the case where overwrite is correct — and then saves the draft.

- [ ] **Step 5: Verify against a real org**

```bash
pnpm --filter @cardstack/studio dev:sf
```

Open an object's actions route, add a real screen flow, and confirm its input variables list with the right sources offered. Requires the `sf` CLI authenticated to the dev org; see CLAUDE.md's local-dev section.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/components/action-inputs-editor.tsx apps/studio/components/actions-editor.tsx
git commit -m "feat: screen flow input mapping editor"
```

---

## Task 10: Full verification

- [ ] **Step 1: Run everything**

```bash
pnpm test && pnpm typecheck && pnpm lint && pnpm build
```

- [ ] **Step 2: Run every golden path**

```bash
pnpm demo:m1 && pnpm demo:m2 && pnpm demo:m2.5 && pnpm demo:m3 && pnpm demo:m4
```

All five must pass. `demo:m1` and `demo:m2` cover the record card and the confirmed-write path, which Task 5 changed.

- [ ] **Step 3: Confirm tenant isolation still holds**

```bash
pnpm --filter @cardstack/config-store test -- tenant-isolation
```

CLAUDE.md requires this suite stay passing.

- [ ] **Step 4: Do not deploy**

Deployment is out of scope for this plan and needs explicit confirmation. The Salesforce connected app rotates refresh tokens with reuse detection, so a careless deploy can revoke the live connection's grant family.

- [ ] **Step 5: Write the PR note**

Hard rule 6 requires a note for design deviations. Cover: the Flows page toggle no longer deletes and no longer auto-publishes (Task 6); the mapping editor's type-gating of sources, which `/design` does not specify (Task 9); and the empty-`actions` fallback that keeps "Edit fields" on pre-existing layouts (Task 5).
