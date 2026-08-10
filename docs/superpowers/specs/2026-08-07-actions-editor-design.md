# Actions editor (design 3a)

Date: 2026-08-07
Status: design agreed in brainstorming; awaiting spec review

## Problem

`RecordCardConfig.actions` has existed in the layout schema since M2, but nothing
in the product lets an admin edit it, and the widget only partly honors it.

Studio has no editor at all, so a card's action row can only be changed by editing
the config store by hand.

The record card renders only one of the four action types
(`packages/widgets/src/record-card/card.tsx:553-585`):

- the primary button is a hardcoded "Edit fields" gated on `canEdit` — it does not
  use `update_record`'s configured label;
- `create_related` actions render as secondary buttons, selected by a type filter;
- `quick_action` and `screen_flow` never become buttons — the file contains no
  reference to either type;
- array order affects nothing.

So both halves need work: an editor, and a card that honors what the editor
produces. Without the second half, design 3a's central gesture — reorder to set
the primary action — would be an editor control with no effect.

**There is already one write path, and it disagrees with this design.** The Flows
admin page can add and remove `screen_flow` and `quick_action` actions on any
object's card (`apps/studio/app/api/flows/assign/route.ts`), and `/api/flows`
already performs the discovery this spec's section 3 describes. Its semantics
differ from the editor's on every point that matters:

| | Flows page (shipped) | Actions editor (this spec) |
|---|---|---|
| "Off" | deletes the action from the array | sets `enabled: false`, keeps it |
| Save | publishes immediately | saves to draft |
| Inputs | auto-mapped by name convention | hand-mapped by the admin |

Left alone, an admin who hand-maps a flow's inputs in the editor and later toggles
that flow on the Flows page loses the mappings — `assign` rebuilds the action from
scratch. Unifying the write path is therefore part of this work, not a follow-on.

Design reference: `design/README.md:51` (3a) — "reorderable list, first = Primary,
built-ins + record actions, toggles; trust line non-removable."

## Scope

In:

- A Studio route for editing a card's actions, with reorder, add, remove, and
  enable/disable.
- An `enabled` flag on `CardAction`, honored by both the widget and the server.
- Discovery of addable actions from the CRM adapter.
- An input-mapping editor for `screen_flow` actions.
- A record-card action row that honors configured order, configured labels, and
  all four action types.
- A single shared write path for `recordCard.actions`, used by both the new editor
  and the existing Flows admin toggle.

Out (deliberate, with reasons):

- **Live widget preview inside the actions route.** The route is a config surface,
  not a second builder. The real card is already previewable in the layout builder.
- **Input mappings for `quick_action`.** The `quick_action` variant has no
  `inputs` field, by design: Salesforce owns the mini-layout, and
  `describeQuickAction` / `getQuickActionDefaults` supply it at run time
  (`packages/core/src/layout-config.ts:152`). A Cardstack-side mapping would be a
  second, competing source for the same values.
- **The other open M3 surfaces** (3b related-list picker, 3c object picker, 3d
  requirements pass-through, 3e audience picker, 2f–2i assignment). Separate specs.

## Design

### 1. Schema (`packages/core/src/layout-config.ts`)

Add to all four `CardAction` variants:

```ts
enabled: z.boolean().default(true)
```

`.default(true)` keeps every stored config parsing unchanged — the flag is
additive and backward-compatible, and no existing config becomes invalid or
loses an action. (Rendering does change, but from section 5, not from this flag;
section 5's back-compat rule covers that.)

Requires a migration note in the file's header comment, per hard rule 1.

**Semantics.** A disabled action stays in `recordCard.actions` with its label,
order, and input mappings intact. It is hidden from the rep and refused by the
server; it remains visible and re-enableable in Studio. This is the reason for a
persisted flag rather than removal from the array: removal would discard the
configuration that makes re-enabling one click.

### 2. Server enforcement (`apps/mcp-server/src/server.ts`)

Hard rule 2: enforcement is server-side only. A disabled action must be refused,
or the toggle is cosmetic — a disabled `screen_flow` still carries a valid
`flowApiName` that a caller could pass directly.

Both chokepoints already exist and already reject unconfigured actions:

- `crm_flow_start` / `crm_flow_continue` — `server.ts:1537-1546`, a single shared
  handler covering both tools
- `crm_quick_action_start` — `server.ts:1835`

The change is to extend each existing `.find()` predicate to also require
`a.enabled !== false`. The error message stays in the same shape as the current
"is not configured on the … card" text.

### 2b. Shared action module (`packages/core/src/card-actions.ts`, new)

Every mutation of `recordCard.actions` and every decision about what renders goes
through one set of pure functions. `packages/widgets` has no test runner — its
`test` script is a CSS coverage check — so putting this logic in `core`, which
runs vitest, is what makes it testable at all. It also removes the duplication
between the editor and the Flows admin toggle.

```ts
/** Identifies an action within a list, independent of position. */
export type ActionRef =
  | { type: "update_record" }
  | { type: "create_related"; object: string }
  | { type: "quick_action"; actionApiName: string }
  | { type: "screen_flow"; flowApiName: string };

export function actionRef(action: CardAction): ActionRef;
export function findAction(actions: CardAction[], ref: ActionRef): CardAction | undefined;

/** Adds if absent; if present, MERGES — preserving hand-mapped `inputs` and
 *  the existing label unless explicitly overridden. */
export function upsertAction(
  actions: CardAction[],
  action: CardAction,
  opts?: { overwriteInputs?: boolean },
): CardAction[];

export function removeAction(actions: CardAction[], ref: ActionRef): CardAction[];
export function setActionEnabled(actions: CardAction[], ref: ActionRef, enabled: boolean): CardAction[];
export function reorderActions(actions: CardAction[], from: number, to: number): CardAction[];

/** What the record card should render, in order. Skips disabled actions and
 *  skips `update_record` when editing is not permitted. */
export function selectRenderableActions(
  actions: CardAction[],
  opts: { canEdit: boolean },
): CardAction[];
```

`upsertAction`'s merge behavior is the fix for the data-loss case: re-enabling a
flow from the Flows page must not discard mappings the admin made in the editor.

### 3. Discovery API (`apps/studio/app/api/objects/[object]/available-actions`)

`GET` returns the actions an admin can add:

- **Built-ins**: `update_record`; `create_related` fanned out over `listObjects()`.
- **Quick actions**: `listQuickActions(object)`.
- **Screen flows**: `listFlows()`, each entry carrying its input variables from
  `getFlowDefinition(api)` — `variables[]` filtered to `isInput`, with `name`,
  `dataType`, `isCollection` (`packages/core/src/flow-interview.ts:204-210`).

`listQuickActions`, `describeQuickAction` and `getFlowDefinition` are optional on
`CrmAdapter`, and the Salesforce adapter's `listFlows` returns `[]` when Tooling
API metadata is unreadable (`packages/crm-adapters/src/salesforce/salesforce-adapter.ts:14`).
Both are normal states, not errors. Each source in the response therefore carries
its own `unavailable` marker, and a source that throws or is absent degrades that
group alone rather than failing the request.

### 4. Editor UI

`apps/studio/app/objects/[object]/actions/page.tsx` plus
`apps/studio/components/actions-editor.tsx`.

Follows `apps/studio/components/permissions-editor.tsx`: load draft-or-published
from `/api/layout/[object]`, save edits to the **draft**, show the "Saved to
draft" flash, and leave publishing to the builder. Sibling routes already work
this way, so the publish diff needs no changes. A new component file keeps
`canvas.tsx` (1537 lines) from growing.

**Configured list.** A single `SortableContext` (`@dnd-kit/sortable`, already a
Studio dependency) over `recordCard.actions`. Each row carries a drag handle, a
type chip, an inline-editable label, an on/off switch, and remove. The first
*enabled* row shows a "Primary" badge; reordering is what makes an action primary.

Disabled rows stay in place in the same list, dimmed, switch off — findable, one
click from returning, and holding their position for when they come back. A
separate "off" bucket would discard the ordering the flag exists to preserve.

**Add picker.** "Add action" opens a panel grouped by source: built-ins, quick
actions, screen flows. Already-configured entries appear checked and disabled
rather than hidden, so an admin does not hunt for something already on the card.
An empty source renders a teaching state — "No screen flows found in this org" —
with a note when the source reported itself unavailable. CRM-discovered entries
use the metadata purple `#f0edf7` / `#5a4a8a` from the design tokens.

**Mapping editor (screen flows only).** Expanding a screen-flow row lists one row
per discovered input variable. Each row selects one of the five sources in
`ActionInputMapping` — `context`, `field`, `literal`, `ask`, `selection` — with
the variable's `dataType` and `isCollection` preselecting `valueType` and gating
which sources are offered (a `recordIds` collection offers `selection`, not
`literal`). Unmapped variables are simply absent from `inputs`, which is the
existing default (`layout-config.ts:139`) and parses fine. When a flow definition
cannot be fetched, the row degrades to free-text entry with the caution tint
rather than blocking the action.

**Trust line.** A pinned, un-removable footer row reading "Writes require
confirmation". UI only, no config behind it — it states hard rule 8 at the point
where an admin is arranging write buttons.

Microcopy is sentence case with verb-first buttons, per the design conventions.

### 5. Record-card action row (`packages/widgets/src/record-card/card.tsx`)

The footer's `ready` state stops filtering by type and instead walks
`recordCard.actions` in order, skipping disabled ones. The first surviving action
renders as `cs-btn--primary`; the rest as `cs-btn`. Each type dispatches as
follows:

- **`update_record`** — opens the existing edit mode, using the action's
  configured label instead of the hardcoded "Edit fields". Still gated on
  `canEdit`; when editing is not permitted the action is skipped, and the next
  enabled action becomes primary.
- **`create_related`** — unchanged behavior (`host.sendFollowup`, model drives
  `crm_create_record`).
- **`screen_flow`** and **`quick_action`** — `host.sendFollowup` with a phrasing
  that names the action, so the model calls `crm_flow_start` /
  `crm_quick_action_start` and the host renders the flow-run widget.

Using `sendFollowup` for flows rather than a direct `callTool` is deliberate: a
flow start returns an interview screen, and the card should not try to host a flow
interview inside itself — `packages/widgets/src/flow-run` already exists for that.
It also keeps the card on the established handoff path (`card.tsx:302`) and inside
hard rule 4.

If no action survives (all disabled, or only `update_record` with `canEdit` false),
the footer renders no buttons. The trust line still renders wherever writes are
possible.

**Back-compat.** A layout whose actions list is empty — every config predating
this work that never configured actions — currently shows "Edit fields" from the
hardcoded path. Walking the array would show nothing instead, silently removing
the edit button from existing cards. So when `actions` is empty and `canEdit` is
true, the card falls back to today's "Edit fields" button. This fallback is
behavior-preserving, and a test pins it.

### 6. Unifying the Flows admin write path (`apps/studio/app/api/flows/assign/route.ts`)

The route keeps its shape and its toggle, but changes three behaviors so that
"off" means one thing product-wide:

- **Disabling sets `enabled: false` via `setActionEnabled`** instead of filtering
  the action out. The action, its label, and its input mappings survive, and the
  actions editor shows it dimmed and re-enableable.
- **Enabling uses `upsertAction`**, so an action that already exists keeps its
  hand-mapped `inputs` rather than being rebuilt. Auto-mapping by name convention
  still applies when the action is genuinely new.
- **It saves to draft and no longer auto-publishes.** The route's current comment
  argues immediate publish is right because "exposing a flow IS the admin's
  intent". That rationale is superseded: two surfaces editing one field cannot
  have opposite publish semantics, and the draft/publish/rollback path is the
  product's model everywhere else. The Flows page gains the same "Saved to draft"
  affordance the other editors use.

This is a deliberate behavior change to a shipped surface. It is called out here
so it appears in the PR note required by hard rule 6.

## Testing

Written test-first. `packages/widgets` has no test runner — its `test` script is
`node scripts/check-css-coverage.mjs` — and this work does not add one. That is
the reason the render decision lives in `selectRenderableActions` in `core`:
the logic is unit-tested there, and `card.tsx` is left as a thin renderer whose
behavior the golden-path demos exercise.

**`packages/core` — schema**
- A layout fixture with no `enabled` key parses, and every action defaults to enabled.
- `enabled: false` round-trips through parse and serialize.

**`packages/core` — `card-actions.ts`**
- `selectRenderableActions` drops disabled actions and preserves configured order.
- It skips `update_record` when `canEdit` is false, so the next enabled action
  leads the list.
- It returns `[]` when every action is disabled.
- `upsertAction` on an existing action preserves hand-mapped `inputs` and the
  existing label — the Flows-page data-loss case.
- `upsertAction` with `overwriteInputs: true` replaces them.
- `setActionEnabled` flips the flag without changing position or dropping the action.
- `reorderActions` moves an action and leaves the rest in relative order.
- `actionRef` / `findAction` match on identity, not array index.

**`apps/mcp-server`**
- `crm_flow_start` rejects a screen flow that is configured but disabled.
- `crm_quick_action_start` rejects a quick action that is configured but disabled.
- Both mirror the existing unconfigured-action test at `server.test.ts:963`.

**`apps/studio`**
- The discovery route returns partial results with an `unavailable` marker when a
  source throws or returns empty, rather than failing the whole request.
- Discovered entries already present in `recordCard.actions` are marked as
  already-configured.
- `flows/assign` disabling sets `enabled: false` and leaves the action in place.
- `flows/assign` re-enabling a previously hand-mapped flow preserves its `inputs`.
- `flows/assign` saves to draft and does not publish.

## Verification

- `pnpm test`, `pnpm typecheck`, `pnpm lint`
- `pnpm demo:m1` and `pnpm demo:m2` — the record card and the confirmed-write path
  both render the action row, so a regression there surfaces in the golden paths.
- Manual: `pnpm --filter @cardstack/studio dev` → `/objects/<object>/actions`.
  Against a real org, `dev:sf` exercises real quick actions and flows; the mock
  portal exercises the empty-source teaching states.

## Resolved during review

- **`crm_flow_continue` needs no separate change.** It and `crm_flow_start` share
  one handler (`server.ts:1530-1546`), so extending the single `.find()` predicate
  covers both. A test should still assert continue-side rejection, since the
  sharing is an implementation detail that could be refactored apart.
- **`create_related` offers every object from `listObjects()`, unfiltered.** The
  action posts a followup and the model drives `crm_create_record`, which does not
  require the target to have a configured layout. Filtering would hide valid
  targets for no gain.

## Deployment

Not part of this work. Any deploy is a separate, explicitly confirmed step, and
this repo has a known sharp edge: the Salesforce connected app rotates refresh
tokens with reuse detection, so the local file store and Railway Postgres can
invalidate each other's tokens.
