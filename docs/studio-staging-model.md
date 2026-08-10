# Studio: one staging model + shared UI primitives

Design doc. Outcome of a brainstorming pass over the Studio admin UI
("the backend UI"). Two problems, one root cause each.

## Problem 1 — Studio has three publish models and a data-loss bug

Six config surfaces, three different answers to "did that go live?":

| Surface | Today |
| --- | --- |
| Layouts | draft (autosaved) → publish → revision + diff + rollback |
| Permissions | draft (autosaved) → rides the layout publish |
| Custom screens | durable draft → its own publish |
| Lists / views | **live to reps on toggle** (`views-editor.tsx` `save()`) |
| Flows | **live to reps on change** (`flows-editor.tsx` `saveMode()`) |
| Home card | **neither** — edits live in React state only; publish is the first write |

Two consequences:

1. **Governance gap.** Exposing a list or changing a flow's render mode
   changes what every rep sees in chat, with no diff, no confirmation and no
   rollback. That contradicts the product's spine (CLAUDE.md hard rule 8) on
   the two surfaces where it is easiest to make a wide-blast-radius mistake.
2. **Data loss.** `home-card-builder.tsx` never persists until Publish and has
   no `beforeunload` guard. Closing the tab discards the work silently.

### Fix — every surface is `draft | published | history`

Generalize the shape `LayoutRecord` already has:

```ts
// packages/config-store/src/types.ts
export interface StagedRecord<T> {
  draft: T | null;
  published: T | null;
  /** Previous published revisions, oldest first. */
  history: T[];
}
export type LayoutRecord = StagedRecord<LayoutConfig>;  // unchanged in shape
```

Applied to view exposures, flow render modes and the home card. The read side
(`ConfigStore` — what the MCP server sees) keeps its exact signatures and
returns **published only**; drafts are reachable only through
`AdminConfigStore`. That boundary already exists and is what keeps drafts out
of chat — we are widening what it covers, not weakening it.

`AdminConfigStore` gains, per surface, the four verbs layouts already have:

```ts
getViewExposuresRecord(tenantId, object): Promise<StagedRecord<ViewExposuresConfig>>
saveViewExposuresDraft(config): Promise<void>
discardViewExposuresDraft(tenantId, object): Promise<void>
publishViewExposures(tenantId, object): Promise<ViewExposuresConfig>
rollbackViewExposures(tenantId, object, toRevision): Promise<ViewExposuresConfig>
```

…and the same for flows and the home card. `setViewExposures` /
`setFlowRenderMode` / `setHomeCard` become draft writes;
`publishHomeCard(config)` splits into `saveHomeCardDraft` + `publishHomeCard`.

#### Schema changes (CLAUDE.md hard rule 1)

`ViewExposuresConfig` and `FlowRenderModeConfig` need
`revision: z.number().int().positive().default(1)` in `packages/core` so they
can carry history the way `HomeCardConfig` already does. Both files get a
migration note in the header comment.

#### Storage migration

`file-store.ts` and `postgres-store.ts` hold bare configs under
`exposures::`, `flow::` and `homecard::` keys. Migration is lazy and
read-shaped, so there is no downtime and no migration script:

```ts
const asRecord = <T>(stored: unknown): StagedRecord<T> =>
  isStagedRecord(stored)
    ? stored
    : { draft: null, published: (stored as T) ?? null, history: [] };
```

Anything already stored becomes *published* — the safe direction, since
nothing a rep can see today disappears. Writes always use the new envelope.
Both store files get a migration note in their header comments, and
`store.test.ts` / `postgres-store.test.ts` get a case asserting a legacy bare
config reads back as published-with-no-draft.

### Fix — one review-and-publish flow

New `GET /api/pending` returns everything staged for the tenant, grouped by
surface, with a diff per entry. New `POST /api/publish` takes a list of
surface keys and publishes them.

- The nav rail grows a **Pending changes (N)** entry above `Objects`, driven
  by `/api/pending`. It replaces the per-object amber dot as the source of
  truth (the dot stays, but the tray is the place that lists everything).
- **Review & publish** is a route (`/publish`), not a dialog as first drafted:
  every editor's "Staged" chip links to it, so it needs an address. It lists
  each staged surface with its diff,
  checkboxes (default all), and one primary action. Layout diffs reuse
  `diff.ts`; `diff.ts` grows `diffViewExposures`, `diffFlowModes` and
  `diffHomeCard` returning the same `LayoutDiff`-ish added/removed/changed
  shape so the modal renders one component per entry.
- Publishing is **sequential, not atomic** — the file store can't transact
  across keys and we should not imply otherwise. Each surface emits its own
  `PublishEvent`, all tagged with a shared `batchId` so the home page's
  "Recent publishes" can group them into one row. Partial failure is reported
  explicitly: what published, what didn't, and why.
- `PublishEvent` gains `batchId?: string` and `surface: "layout" | "exposures"
  | "flows" | "homecard" | "screen"`. Existing events without them still
  render (both optional at the render site).

Rollback comes free on every surface, since history is now uniform.

## Problem 2 — the surface reads unfinished

Three shared primitives, each replacing a pattern currently hand-rolled per
editor. All three are exercised by the publish flow above, which is why they
ship together.

### `components/ui/confirm.tsx`

`<ConfirmPopover>` and `<Dialog>`. Today confirmations expand a sentence plus
two buttons *inside* the flex row that holds them — `builder.tsx` regenerate
shoves "Publish layout…" sideways mid-interaction; the Versions dropdown and
`remove-object-zone.tsx` do the same thing. The primitive is anchored and
overlaid, so nothing reflows, and it handles Escape, outside-click and focus
return — none of which the current bare `<details>` dropdowns do.

Call sites: regenerate, discard draft, rollback, remove object, and the new
Review & publish dialog.

### `lib/crm-error.ts` + `components/ui/error-notice.tsx`

`String(error)` currently renders verbatim in at least six places. Replace
with a classifier:

```ts
type CrmErrorKind = "scope" | "auth-expired" | "rate-limit" | "timeout"
                  | "network" | "not-found" | "unknown";
classifyCrmError(err: unknown): { kind; title; action; raw: string }
```

`<ErrorNotice>` renders title + the action that fixes it, with `raw` behind a
"Details" disclosure. The home page's hand-written "if this mentions
403/scopes…" hint becomes the `scope` case, stated up front instead of as a
guess appended to a stack trace. `load-failed.tsx` and every API `catch` that
currently returns `{ error: String(error) }` route through it, so the classifier
runs server-side and the kind travels to the client.

### `components/ui/status-chip.tsx`

One vocabulary — `clean | saving | saved | staged | publishing | published |
failed` — with one copy table and one timing constant, replacing "Saved just
now" / "Saved to draft" / a green `saved` chip / nothing, at 1.4s, 1.6s and
2.0s. `staged` is new and is what the four converted editors show after an
edit; it links to the pending-changes tray, so the rail and the editor can
never disagree about whether something is live.

## Status

Steps 1-4 shipped. Verified end to end against the running Studio: staging a
list, a flow policy and a home-card edit leaves all three invisible to the MCP
read side; publishing the batch flips all three and writes three events under
one `batchId`; publishing a batch containing one bad key returns 207 with
per-surface results and leaves the successful surface live.

Still open: the keyboard/focus pass (KeyboardSensor on both dnd canvases), and
`remove-object-zone` keeps its type-the-name confirmation rather than moving to
`ConfirmPopover` — a destructive, irreversible-feeling action deserves the
heavier gesture.

## Sequencing

1. **Store.** `StagedRecord<T>`, lazy migration, draft/publish/rollback for
   exposures + flows + home card, `revision` on the two configs that lack it,
   extended `diff.ts`, tests (including legacy-shape reads).
2. **API.** `/api/pending`, `/api/publish`, per-surface draft endpoints;
   existing routes switch to draft writes.
3. **Primitives.** Confirm/Dialog, ErrorNotice + classifier, StatusChip —
   landed and adopted by existing call sites first, so they're proven before
   the publish flow depends on them.
4. **Editors + tray.** Views, flows and home card move to draft-save +
   StatusChip (this fixes the home-card data loss). Rail tray + Review &
   publish dialog.
5. **Verify.** MCP server reads published only; `demo:m3` / `demo:m4` updated
   for the split home-card verbs; full `pnpm test` + `typecheck`.

## Risks

- **Drafts must never reach chat.** Mitigated structurally: the `ConfigStore`
  read side keeps returning published only, and drafts exist solely on
  `AdminConfigStore`. Worth an explicit test per surface.
- **Behavior change for lists and flows.** Toggling a list no longer takes
  effect immediately. The `staged` chip links straight into Review & publish
  so the extra step is one click, not a hunt.
- **Demo scripts write to the store directly** and will need updating in step 5.

## Explicitly not in scope

View-as / audience preview, a record picker in the preview pane, command
palette, keyboard dnd, audit-log filtering, dark mode. All real, none load-
bearing for the two problems above.


---

## Addendum (2026-08-10b): custom screens fold into flows

Studio had two rail entries covering one workflow. **Flows** held per-flow
render policy; **Custom screens** held the SDK editor for replacement screens.
Design 12b does list both under SHARED — but the connective tissue 10c
specifies (a "Map inputs" / "Build screen" fork on a flow with an unsupported
screen) was never built, so `flows-editor.tsx` had zero references to screens
and the two read as unrelated areas.

Worse, `CustomScreenConfig.flowApiName` was optional and the editor offered an
explicit "Unassigned" option. Since the flow render ladder is the only thing
that executes a screen, an unattached screen is config that can never run.

**Change.** Custom screens are no longer a top-level area:

- The rail entry is gone. Each flow on `/flows` lists its screens with a
  "+ Build screen" action — 10c's fork, finally built.
- `/custom-screens/[id]` is where the code pane lives (it needs the room).
  `/custom-screens` redirects to `/flows` so old links land somewhere useful.
- Creating a screen requires a flow (`POST /api/custom-screens` 400s without
  one), and the editor's flow picker has no "Unassigned" option.
- Publishing requires a flow, enforced in BOTH stores.

`flowApiName` stays **optional in the zod schema** deliberately. Making it
required would throw on parse for any row written earlier, and one bad row
sinking a whole list is a regression this codebase has already fixed once (see
commit f8852a7 for exposures). Instead the rule is enforced at the publish
boundary, and pre-existing unattached screens surface in a "Screens with no
flow" card on `/flows` so they can be reassigned rather than silently orphaned.

**Design deviation (hard rule 6):** this departs from 12b's SHARED group of
Home card / Custom screens / Flows. Noted in `custom-screen-editor.tsx`'s
header and here. The milestone map is also relevant: PLAN.md scopes the custom
screen SDK to **M6** ("do not start before M5 lands"), and the page still
carries a `RuntimePendingBanner` for the M6 runtime — so this is tidying a
surface that shipped ahead of its milestone, not building M6 early.


---

## Addendum (2026-08-10c): flows are opt-in and render in chat

The Flows page presented four render modes as equal choices, one of which —
`handoff` — is the only one the runtime actually implements. The flow-run
widget's sole action is `host.openLink(launchUrl)`: a chat card whose button
opens a Salesforce browser tab. That is the opposite of the product's premise,
and Studio was quietly recommending it.

**Change.**

- `FlowRenderModeConfig` gains **`active`** (default **false**). A flow synced
  from the CRM is a candidate, not an offering — the same rule lists already
  follow. **Behavior change:** before this, every synced flow was startable
  from chat whether or not it had a stored policy.
- The toggle is a real gate, not decoration: `crm_flow_start` refuses a flow
  that isn't switched on, with a message pointing at Studio → Flows.
- Render mode becomes a **pick list** offering only in-chat rungs —
  `auto` / `native` / `embedded`. `handoff` stays in the zod enum so configs
  written earlier still parse (same storage-tolerance pattern as
  `flowApiName`), but it is no longer something an admin can choose.
  `IN_CHAT_RENDER_MODES` in `packages/core` is the list Studio renders.
- The layout builder's flow-action chip said "handoff live"; it now reads
  `active` or `flow is off`, because an action attached to an inactive flow
  does nothing.

**What this does NOT fix.** In-card rendering still doesn't exist. A flow
switched on today still finishes in a browser tab — the page says so in the
banner and again on every active flow. Removing the handoff runtime outright
would leave flows with no path at all, so it stays as runtime fallback while
ceasing to be a design choice. Native and embedded rendering are the M5/M6
runtime work; `MODES[].delivered` in `flows-editor.tsx` is the flag to flip
when a widget actually branches on `renderMode`.

**Design deviation (hard rule 6):** 11c/11d specify a three-rung ladder ending
in HANDOFF, and a per-flow mode set of Auto / Native only / Embedded
end-to-end. The ladder is unchanged in the runtime; what changed is that
Studio no longer offers the third rung as a destination, and flows are
off-by-default rather than implicitly on.


---

## Addendum (2026-08-10d): the builder edits a card, not a list of rows

The layout builder had three columns — palette, an abstract list of field rows,
and a live preview — and the middle column looked nothing like what a rep
sees. Every field also carried two toggles plus a popover of switches, so
"is this required?" was answered in three places.

**Change.**

- The canvas is a **card-shaped surface**: one frame, a header region, sections
  rendered in their real 1/2/3-column grid, then related lists and actions.
  Fields render the way the card renders them — label on top, and the api name
  in the value slot. It shows the api rather than a fabricated value, because
  inventing data in a builder is how you ship a layout that looks fine and
  reads wrong.
- Field sorting moved from `verticalListSortingStrategy` to
  `rectSortingStrategy`, so dragging works across a grid rather than down a
  single column. Keyboard reorder (Space, arrows, Space) works in the grid too.
- Everything configurable about a field is behind **one menu**: Access
  (Read-only / Editable / Editable & required) and Input control (Auto, or one
  of the eleven `FieldControl` values — which were in the schema with no UI at
  all until now), plus the CRM description, the denylist link, and Remove.
- The preview pane now starts **collapsed**. It is still the only real fidelity
  check — the actual widget against a server-assembled payload, the same
  codepath the MCP server uses — so it is one click away, not gone. Collapsing
  it by default buys the canvas the width the three-column layout was starving
  it of.

**Why not edit the preview directly.** It was considered and rejected: the
widget package is deliberately CRM-agnostic and knows nothing about Studio
(hard rules 3–5). Layering builder affordances onto it would mean either
leaking Studio concerns into the widget or forking it, and the preview's whole
value is that it is the untouched thing reps get.


---

## Addendum (2026-08-10e): rollback for every surface

The staging model gave all six surfaces `history` and a rollback verb, but only
layouts ever exposed it — there were no API routes at all for the others. A
rollback path that exists in the store and nowhere else is not a rollback path.

- `rollbackCustomScreen` was the one verb still missing; both stores have it now.
- `collectSurfaceHistory` and `runStagedRollback` live in `staging.ts`, so the
  five per-surface shapes are dispatched once and the two stores can't disagree.
- `POST /api/rollback` takes a `StagedKey` + revision. `GET /api/pending` also
  returns `history`, because rollback is about PUBLISHED revisions and is
  exactly what you reach for when nothing is staged.
- `/publish` grows a **Roll back** section listing each surface's restorable
  revisions behind a `ConfirmPopover`. Restoring republishes under a NEW
  revision, so the chain stays linear and nothing is lost.

Verified end to end: home card published v2, rolled back to v1, republished as
v3 with the restored blocks, a `rollback` event logged against the `homecard`
surface, and history then offering v2 and v1.

**Custom screens: decision.** They stay VISIBLE rather than going behind a
flag. The config is durable and may already be authored; hiding it would strand
that work, and the surface is now correctly scoped (reachable only from a flow,
uncreatable and unpublishable without one). What it must not do is imply a
publish did something — so the publish confirmation now says the screen is
stored as a revision and won't run until the M6 runtime ships, alongside the
`RuntimePendingBanner` that was already there.


---

## Deploy runbook

Two changes in this pass alter behavior on deploy. Both are intentional;
neither should be a surprise.

### 1. Postgres schema migration (highest risk)

`postgres-store.ts` runs idempotent `ALTER`s on boot: `status` / `revision`
columns on `view_exposures`, `home_cards` and `flow_render_modes`,
`DROP CONSTRAINT IF EXISTS` on their primary keys, new partial unique indexes,
and `surface` / `batch_id` on `publish_events`.

**RAN ON PRODUCTION 2026-08-10 — verified, no longer a design intent.** Studio
deployed `c34911c` and migrated the live database lazily on its first request.
Read-only inspection afterwards confirmed all three predictions:

- `status` / `revision` present on `view_exposures`, `home_cards` and
  `flow_render_modes`; `surface` / `batch_id` on `publish_events`,
- every pre-existing row read back as `published` with **zero drafts**
  (`view_exposures` 3, `home_cards` 1, `flow_render_modes` empty),
- nothing 500'd; Studio served normally throughout.

**The window this opened, and why it closed.** The migration is additive and
safe on its own, but for ~48 minutes Studio ran the new code while
`@cardstack/mcp-server` was still serving pre-merge code whose reads
(`SELECT config FROM view_exposures WHERE tenant_id=$1 AND object=$2`) carry no
status filter. Nothing broke, because a freshly migrated table still holds
exactly one published row per key — but the FIRST staged draft would have been
served to reps at random. The operational rule during that window was "don't
stage drafts in Studio". It no longer applies: since `6aeb6be` both services
run the same code and read published config only.

The lesson worth keeping: **a lazy migration run by one service is a coupling
between services.** Whoever migrates first defines the schema the other must
already understand. Deploy the reader before, or with, the migrator.

### 2. Flows are off by default → run the backfill

`FlowRenderModeConfig.active` defaults to false and `crm_flow_start` refuses an
inactive flow, so without intervention every working flow goes dark on deploy.

```
pnpm migrate:flows-active              # dry run, reports what it would do
pnpm migrate:flows-active -- --apply   # write
```

It activates exactly the flows that work today: those attached as a
`screen_flow` action on a **published** layout. It does **not** activate every
synced flow — synced is not in use. It never touches a flow that already has a
stored policy, so an admin's deliberate "off" survives, and a second run
activates nothing. Covered by `apps/mcp-server/src/backfill-flow-active.test.ts`.

**On the current production database this is a no-op** (checked 2026-08-10):
`flow_render_modes` is empty and no published layout carries a `screen_flow`
action, so no flow can go dark. Run it anyway before the first deploy that
follows an admin attaching a flow to a card — the dry run costs nothing and
prints exactly what it would change.

Run it once per tenant after the new code is live (it reads `DATABASE_URL`, or
the file store otherwise, and `CARDSTACK_TENANT_ID`).
