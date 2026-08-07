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

## Testing

Written test-first, at four levels:

**`packages/core`**
- A layout fixture with no `enabled` key parses, and every action defaults to enabled.
- `enabled: false` round-trips through parse and serialize.

**`apps/mcp-server`**
- `crm_flow_start` rejects a screen flow that is configured but disabled.
- `crm_quick_action_start` rejects a quick action that is configured but disabled.
- Both mirror the existing unconfigured-action test at `server.test.ts:963`.

**`packages/widgets`**
- Disabled actions do not render in the record card's action row.
- The first enabled action is the primary button when earlier actions are disabled.
- Actions render in configured array order, not grouped by type.
- `update_record` uses its configured label rather than "Edit fields".
- `screen_flow` and `quick_action` render as buttons and call `sendFollowup`
  naming the action.
- With `canEdit` false, `update_record` is skipped and the next enabled action
  becomes primary.
- **Back-compat:** an empty `actions` array with `canEdit` true still renders the
  "Edit fields" button.

**`apps/studio`**
- The discovery route returns partial results with an `unavailable` marker when a
  source throws or returns empty, rather than failing the whole request.
- Discovered entries already present in `recordCard.actions` are marked as
  already-configured.

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
