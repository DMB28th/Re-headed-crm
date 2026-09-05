# Session 1 — Config objects and staging

**Goal:** the on-platform equivalent of `packages/config-store`: the custom
objects, the permission sets, and one `StagingService` implementing
draft / publish / rollback and per-surface diff.

## Deliver

- **Objects** per the overview's data model: `Card_Layout__c`,
  `View_Exposure__c`, `Flow_Render_Mode__c`, `Home_Card__c`,
  `Publish_Event__c`, `Audit_Entry__c`, plus the protected custom setting
  `Cardstack_Settings__c` (`Signing_Key__c`, `Consumer_Secret__c`).
- **Uniqueness trigger** computing `Unique_Key__c` (external id, unique) so
  each key has at most one Draft and one Published row.
- **`StagingService`** (Apex, `with sharing`):
  `getRecord(surface, key, audience)` → draft / published / history;
  `saveDraft`, `discardDraft`, `publish(List<StagedKey>)` → sequential,
  one `Publish_Event__c` per surface under a shared batch id, partial
  failure reported per row; `rollback(key, revision)`; `listStaged()` →
  pending changes with diff; `history(key)`.
- **`ConfigDiff`**: Apex port of `packages/config-store/src/diff.ts` for the
  four surfaces (custom screens excluded). Empty diff ⇒ not a pending change.
- **`ConfigValidator`**: hand-written shape validation for each surface's
  JSON, mirroring `packages/core/src/layout-config.ts`, `view-exposures.ts`,
  `home-card.ts`. Reject on save with a field-level message.
- **Permission sets** `Cardstack_Admin` and `Cardstack_User`.
- **Seed script** (`scripts/seed-scratch.apex`) that creates a published
  Account and Opportunity layout so later sessions have data.

## Out of scope

Any tool, any UI, the HMAC signing (Session 3 seeds and uses the key).

## Read first

- `docs/studio-staging-model.md` including its four addenda — the semantics being ported.
- `packages/config-store/src/staging.ts` and `diff.ts` — port these.
- `packages/config-store/src/types.ts` — `StagedRecord`, `PublishEvent`, `StagedChange`.
- `packages/core/src/layout-config.ts` header comment — the schema and its migration notes.

## Acceptance

- Apex tests cover: draft equals published is not pending; publish increments
  revision and moves the old Published to History; rollback republishes a
  History revision as a new revision with `Kind__c = rollback`; a batch with
  one failing surface still publishes the others and reports the failure.
- A user with only `Cardstack_User` cannot insert or update any config row
  through the API.
