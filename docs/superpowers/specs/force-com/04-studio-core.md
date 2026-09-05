# Session 4 — Studio core

**Goal:** Golden Path 3 through a real Lightning UI — edit a layout →
pending changes → publish → live change in chat → rollback.

## Deliver

- **Lightning app `MCPforce`** with tabs Home, Pending changes, Objects,
  Home card (placeholder until Session 5), Flows (placeholder until 6),
  Audit log (placeholder until 6), Connect (placeholder until 6). SLDS
  and base components only. Visible to `MCPforce_Admin`.
- **Home tab:** recent publishes (from `Publish_Event__c`), objects with
  drafts, a "Connect your chat app" pointer.
- **Objects tab:** left list of objects that have a layout or that the admin
  adds via an object picker (`Schema.getGlobalDescribe`, filtered to
  queryable, non-system objects). Right pane sub-tabs Layout / Exposures
  (Session 6) / Actions (Session 6).
- **Layout builder (LWC `cardLayoutBuilder`)**: card-shaped canvas —
  header (title, subtitle, badge), sections with 1/2/3-column grid, related
  lists, actions. Field palette from `DescribeService`. HTML5 drag between
  and within sections plus keyboard reorder (arrow keys with a grabbed
  state, announced via `aria-live`). One settings popover per field: Access
  (read / edit / hidden) and Input control (per field type). Autosaves the
  Draft through `StagingService.saveDraft` with a save-status chip.
- **Live preview:** collapsed panel; on open, an `@AuraEnabled` method
  assembles a real record-card payload for a sample record (picker) and the
  LWC `postMessage`s it into an iframe pointed at the record-card static
  resource. Reuse the same host-message shape the widgets' `use-widget.ts`
  expects.
- **Pending changes tab:** list from `StagingService.listStaged()` with
  per-surface diff, select-all / per-row publish, sequential publish with
  per-row results, rollback picker from `history()`. Count badge on the tab
  via a lightweight `@AuraEnabled(cacheable=false)` poll.
- **Shared LWC primitives:** confirm popover, error notice with details,
  status chip — the LWC versions of `apps/studio/components/ui/`.

## Out of scope

Exposures, actions, flows, home card, audit UI, Connect page content.

## Read first

- `design/README.md` ids 2a, 2b, 2e, 6b, 12b — what each surface must do (behaviour, not styling).
- `apps/studio/app/objects/[object]/` and `apps/studio/components/` — current builder behaviour, the one-settings-menu rule, keyboard reorder.
- `apps/studio/components/ui/` (`StatusChip`, `useSaveStatus`, `ConfirmPopover`, `ErrorNotice`) — the save/publish vocabulary to keep.
- `docs/studio-staging-model.md` — pending-changes and rollback semantics.

## Acceptance

- Publish a layout change in the app; the next `crm_get_record` in Claude
  reflects it; roll back; the following call reflects the old layout.
- Jest: builder renders sections from a config, drag and keyboard reorder
  both produce the same updated config, settings popover changes Access.
- Apex tests for every `@AuraEnabled` method, including that a
  `MCPforce_User` calling them gets an access error.
