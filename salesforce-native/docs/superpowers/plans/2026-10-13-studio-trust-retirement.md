# Studio Publishing and Retirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire ineffective surfaces and make each published change match a meaningful reviewed configuration.

**Architecture:** Retain installed global compatibility types, remove active Home exposure, and reject retired authoring in Apex. Extract a pure semantic comparison model and use reviewed draft/live digests for Studio publication. Changes keep the existing config storage and sequential publication model.

**Tech Stack:** Apex/LWC API 67.0, LightningModal, native Node model tests.

**Spec:** [Approved scope](/Users/danielben-atar/Re-headed-crm/salesforce-native/docs/superpowers/specs/2026-10-13-studio-admin-experience-scope.md).

## Global Constraints

Inherit every constraint and baseline from the [master plan](/Users/danielben-atar/Re-headed-crm/salesforce-native/docs/superpowers/plans/2026-10-13-studio-admin-experience.md). Preserve CRM confirmation/FLS, retained configuration/history, existing non-Home discovery, and API 67.0; no speculative subscriber deletion.

## Review Focus

Retired draft direct calls, cached Home tools, malformed/legacy schema, concurrent publication, and partial batches are tested in Tasks 1–3 respectively.

## File boundaries

All file paths below are repository-relative. New LWC JavaScript modules require accompanying API-67 `.js-meta.xml`. New Apex classes/tests require corresponding `.cls-meta.xml`; add class access only to the appropriate permission set. Preserve newer Contact/Opportunity authoring and candidate validators.

### Task 1 Retire Home and unsupported audience authoring

**Files:** Modify `salesforce-native/force-app/main/default/{lwc/cardstackStudio/cardstackStudio.html,lwc/cardstackObjectConfig/cardstackObjectConfig.html,lwc/cardstackObjectConfig/cardstackObjectConfig.js,classes/CardstackHomeAction.cls,classes/CardstackHomeActionTest.cls,classes/CardstackConfigService.cls,classes/CardstackConfigServiceTest.cls,classes/CardstackStudioController.cls,mcpServerDefinitions/Cardstack.mcpServerDefinition-meta.xml,applications/Cardstack_Studio.app-meta.xml,tabs/Cardstack_Studio.tab-meta.xml}`; remove `lwc/cardstackHomeCardConfig/` from new package source; update `salesforce-native/package/{package.xml,companion.xml}` and `salesforce-native/scripts/build-package.py` only where required by the inventory. Create `salesforce-native/tests/studio-retirement.test.cjs`; extend `tests/package-stage.test.cjs`. Retain Home Apex output signatures and Home Lightning types for upgrade compatibility; remove their active discovery/resource bindings. Record their disposition in `salesforce-native/docs/STUDIO_HOME_RETIREMENT.md`.

**Interfaces:** Produce `CardstackConfigService.isRetiredKey(String key): Boolean`, true only for `homecard`; `CardstackConfigService.isSupportedStudioKey(String key): Boolean`, true for default object layouts, `exposures:{Object}`, and `flows`. Existing list/get-history methods still return retained records. Retired keys reject save and publish with `RETIRED_CONFIGURATION`; discarding an old draft remains permitted. `CardstackHomeAction.home(List<HomeRequest>): List<HomeResponse>` retains its schema but returns empty CRM collections and `summary = 'Home Card has been retired. Request a record or list instead.'` without queries.

- [ ] **Step 1:** Add failing behavior tests `retiredDraftCannotPublish`, `retiredDraftCanBeDiscardedWithoutDeletingHistory`, and `cachedHomeReturnsRetirementWithoutQueries`. Assert saved/live values and audits remain unchanged after rejected publication, `Limits.getQueries()` does not increase for Home, and Home rows/tasks contain no CRM data. Test checksum18 config/draft identities. Add a package/discovery test that parses the actual definition and asserts Home tool/resource are absent while record/list/flow/task tools remain.

```apex
Integer beforeQueries = Limits.getQueries();
List<CardstackHomeAction.HomeResponse> result = CardstackHomeAction.home(
    new List<CardstackHomeAction.HomeRequest>{new CardstackHomeAction.HomeRequest()});
Assert.areEqual(beforeQueries, Limits.getQueries());
Assert.areEqual(0, result[0].tasks.size());
Assert.areEqual('Home Card has been retired. Request a record or list instead.', result[0].summary);
```

- [ ] **Step 2:** Run `node --test salesforce-native/tests/studio-retirement.test.cjs salesforce-native/tests/package-stage.test.cjs`; confirm new assertions fail for Home discovery/authoring. Run the new failing Apex methods in the authorized org after deploying test fixtures with the required skills; record the expected behavioral failure.
- [ ] **Step 3:** Implement the interfaces, guard retired keys on both draft/save and publish paths, remove Home editor and claims, remove Assignment/nondefault Audience controls, and keep `layout:{Object}:default` routing. Existing nondefault values remain inspectable in history but do not enter active publish/Overview counts. Remove generic `standard-home` app navigation separately. Do not remove `cardstackSetupChecklist` until Experience Task 2 moves its connection guide.
- [ ] **Step 4:** Rerun local tests, scoped analyzer and `CardstackHomeActionTest,CardstackConfigServiceTest,CardstackStudioControllerTest`. Require passing assertions and unchanged supported-tool behavior. Stage source and verify the removed editor is absent, not merely absent from a manifest.
- [ ] **Step 5:** Commit only this task's source, tests, metadata, and current retirement documentation with `feat(studio): retire home card and unsupported audience authoring`.

### Task 2 Implement semantic configuration comparison

**Files:** Create `salesforce-native/force-app/main/default/lwc/cardstackConfigDiff/cardstackConfigDiff.js` and metadata; modify `lwc/cardstackPublishCenter/cardstackPublishCenter.js`; create `salesforce-native/tests/studio-config-diff.test.cjs`.

**Interfaces:** Produce `compareConfig(key: string, liveJson: string|null, draftJson: string): {status:'changed'|'unchanged'|'unavailable', changes:Array<{path:string,label:string,before:unknown,after:unknown}>, message:string}`. Consume it in Publish Center; expose no executable payload from the diff. Normalize only supported legacy layout placement, not unknown data. Preserve raw original values for inspection.

- [ ] **Step 1:** Write tests `modernSectionsAndPolicyHaveExplicitDiff`, `legacyAndModernEquivalentLayoutsCompareEqual`, `actionsAndMappingsAreCompared`, `listExposureChangesAreCompared`, and `unknownOrMalformedSchemaIsUnavailable`. Example: adding NumberOfEmployees and enabling Description/edit policy must yield paths for added field, `editable`, and `permissions.writeEnabled`, with false → true values. Changing section columns, highlights, required/readOnly flags, order or labels must be visible. Identical valid JSON must return unchanged; unparsable/unsupported structures must never return unchanged.

```js
assert.equal(compareConfig('layout:Account:default', null, '{broken').status, 'unavailable');
const live = JSON.stringify({sections:[{label:'Details',columns:1,fields:[{api:'Description',editable:false}]}],permissions:{writeEnabled:false}});
const draft = JSON.stringify({sections:[{label:'Details',columns:1,fields:[{api:'Description',editable:true},{api:'NumberOfEmployees',editable:true}]}],permissions:{writeEnabled:true}});
const review = compareConfig('layout:Account:default', live, draft);
assert.equal(review.status, 'changed');
assert.ok(review.changes.some(change => change.path === 'permissions.writeEnabled' && change.before === false && change.after === true));
```

- [ ] **Step 2:** Run `node --test salesforce-native/tests/studio-config-diff.test.cjs`; require failure due to the missing model or wrong real comparison.
- [ ] **Step 3:** Implement `compareConfig` in the module. Compare top-level highlights/sections, legacy fields/recordCard sections, actions including mappings/enabled state, permissions/denylist, and supported exposure/flow configuration. Report unknown preserved keys as changed details or unavailable rather than suppressing them. Show explicit comparison errors in Publish Center; keep Advanced raw inspection and readable labels with API identifiers accessible.
- [ ] **Step 4:** Rerun the focused tests and existing layout/Contact/Opportunity authoring tests. Reproduce the audit's false No field changes case with the new model and require explicit material before/after values.
- [ ] **Step 5:** Commit with `fix(studio): compare published configuration semantically`.

### Task 3 Review individual and selected bulk publication

**Files:** Modify `classes/CardstackConfigService.cls`, `classes/CardstackStudioController.cls`, their tests, and `lwc/cardstackPublishCenter/{cardstackPublishCenter.js,cardstackPublishCenter.html,cardstackPublishCenter.css}`. Create `lwc/cardstackReviewDialog/{cardstackReviewDialog.js,cardstackReviewDialog.html,cardstackReviewDialog.js-meta.xml}`, `lwc/cardstackPublishModel/{cardstackPublishModel.js,cardstackPublishModel.js-meta.xml}`, and `salesforce-native/tests/studio-publish.test.cjs`.

**Interfaces:** Add admin controller `getDraftReview(String draftId): Map<String,Object>` returning `{draftId,key,liveValue,draftValue,liveDigest,draftDigest}`; digests are lowercase SHA-256 of `JSON.serialize(new List<String>{rawStoredValue})`, distinguishing null from empty text. Add `publishReviewedDraft(String draftId,String expectedLiveDigest,String expectedDraftDigest): void`. Service locks config then draft rows in a consistent order, rechecks permissions, candidate validators, retired/supported classification and both digests before existing publication mutation; mismatch returns `STALE_REVIEW` without mutation. Retain existing methods for compatibility; Studio uses reviewed publication. Publish model `publishSelection(reviews, publishOne): Promise<Array<{draftId,status:'published'|'failed',errorCode?:string}>>` runs sequentially. PublishCenter exposes `@api refresh(): Promise<void>` and `@api focusDraft(draftId): Promise<void>`; the latter loads pending drafts and focuses the selected draft's native review button. Emit `configchange` with `{keys:string[],operation:'publish'|'discard'}` after authoritative refresh.

- [ ] **Step 1:** Add failing tests `changedLiveOrDraftRejectsReviewedPublish`, `individualPublishUsesReviewedDigests`, `partialBatchNamesSuccessfulAndFailedDrafts`, and `retiredOrUnsupportedDraftCannotEnterStudioSelection`. Assert a two-draft batch with the second rejected reports both identities and retains the failed draft. A repeat click while busy issues one request. Include more than 200 pending drafts: an explicit selected set must be published, never a silent subset labeled All drafts.

```js
const results = await publishSelection([{draftId:'first'},{draftId:'second'}], async review => {
  if (review.draftId === 'second') throw Object.assign(new Error('STALE_REVIEW'), {errorCode:'STALE_REVIEW'});
});
assert.deepEqual(results.map(({draftId,status}) => ({draftId,status})), [
  {draftId:'first',status:'published'}, {draftId:'second',status:'failed'}
]);
```

- [ ] **Step 2:** Run `node --test salesforce-native/tests/studio-publish.test.cjs`; verify failures. Run scoped failing Apex tests under authorized deployment workflow.
- [ ] **Step 3:** Implement review snapshots/locked digest checks, individual and selected-bulk review via LightningModal, `Publish selected (N)` rather than ambiguous Publish All, busy states, persistent errors and exact per-draft results. Rename rollback UI to Discard draft and use a platform confirmation. A comparison unavailable result requires detail inspection and an explicit review choice; it cannot masquerade as an empty diff. On a lost publication response, reload authoritative draft status before offering retry; sequential batch operations never claim atomicity.
- [ ] **Step 4:** Run focused and complete local suites, scoped analyzer and affected config/controller Apex tests. Click the native modal during release QA to prove keyboard focus and dismissal; Node tests do not prove native rendering.
- [ ] **Step 5:** Commit with `feat(studio): review and reconcile configuration publication`.
