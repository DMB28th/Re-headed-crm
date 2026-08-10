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
- **Review & publish** is a dialog listing each staged surface with its diff,
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
