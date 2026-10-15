# Studio Navigation and Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Salesforce admins a clear native path from setup and card configuration through reviewed publication and testing.

**Architecture:** Keep the existing component names and editors, add a small shared state model and an admin Overview API, and move connection setup into its own tab. Public component methods and events coordinate navigation, dirty-state protection, and refresh. Pure model tests and native QA cover different proof boundaries.

**Tech Stack:** API-67 Apex/LWC, Lightning base components, LightningModal, existing Node/jsdom tests.

**Spec:** [Approved scope](/Users/danielben-atar/Re-headed-crm/salesforce-native/docs/superpowers/specs/2026-10-13-studio-admin-experience-scope.md).

## Global Constraints

Inherit the [master plan](/Users/danielben-atar/Re-headed-crm/salesforce-native/docs/superpowers/plans/2026-10-13-studio-admin-experience.md) baseline/constraints. Studio remains admin-only; preserve existing connection evidence and Contact/Opportunity candidate validators. Samples never prove client parity or FLS. Draft authoring does not require completed connection setup.

## Review Focus

Setup history versus verification, ordinary-user admin denial, cached/truncated summaries, delayed saves versus newer edits, and keyboard navigation are exercised in Tasks 1–4 and release QA.

### Task 1 Add accurate admin Overview and shared UI state contracts

**Files:** Create `salesforce-native/force-app/main/default/customPermissions/Cardstack_Manage_Studio.customPermission-meta.xml`, `classes/CardstackStudioAccess.cls`, `classes/CardstackStudioAccessTest.cls`, their metadata, `lwc/cardstackStudioModel/{cardstackStudioModel.js,cardstackStudioModel.js-meta.xml}`, and `salesforce-native/tests/studio-state.test.cjs`. Modify `classes/CardstackStudioController.cls`, its tests, and `permissionsets/Cardstack_Admin.permissionset-meta.xml`.

**Interfaces:** `CardstackStudioAccess.requireAdmin(): void` requires non-guest `Cardstack_Manage_Studio`; add it to Admin only and gate Studio controller entry points, retaining the setup controller's independent connection permission. `getStudioOverview(): Map<String,Object>` is cacheable and returns `{org,objects:Array<{objectApi,label,hasLive,hasDraft,latestDraftId}>,activePendingDraftCount,recentActivity}`. Query supported default layouts and draft states in bulk, count supported pending drafts independently of the existing 200-row list limit, preserve unavailable metadata as unavailable. Model exports `NAV_ITEMS` with exact values `overview,setup,objects,flows,publish,audit`, labels from the approved navigation; `draftState({workingJson,savedJson,liveJson,busy,error}): {dirty,hasDraft,hasLive,label}`; `readiness({layout,fieldMetadata,actionErrors}): Array<{key,status:'ready'|'attention'|'unavailable',message,target}>`; `configchange` payload is `{keys,operation}` and `navigatetab` payload is `{tab,objectApi?,draftId?,action?,setupStage?}`.

- [ ] **Step 1:** Write failing tests `onlyAdminCanUseStudioEvenWithConfigReadAccess`, `overviewCountsDefaultSupportedDraftsBeyondReturnedWindow`, `savedDraftAndLiveCoexist`, and `metadataOrClientProofUnknownCannotBecomeReady`. `draftState` labels include Unsaved changes, Draft saved, Published; saved and live badges coexist. Count tests seed at least 251 drafts plus retired Home/nondefault layouts and assert exact supported total.

```js
const state = draftState({workingJson:'{"fields":["Name"]}',savedJson:'{"fields":["Name"]}',liveJson:'{"fields":["Phone"]}',busy:false,error:null});
assert.equal(state.dirty, false);
assert.equal(state.hasDraft, true);
assert.equal(state.hasLive, true);
assert.equal(state.label, 'Draft saved');
assert.deepEqual(NAV_ITEMS.map(item => item.value), ['overview','setup','objects','flows','publish','audit']);
```

- [ ] **Step 2:** Run `node --test salesforce-native/tests/studio-state.test.cjs` and scoped failing controller/access tests through the authorized Apex workflow. Require expected failures before implementation.
- [ ] **Step 3:** Implement the APIs/model, API-67 metadata, permission assignment and checks. Keep connected-user runtime reads outside the Studio admin gate. Do not add Studio class/app access to Cardstack User. Preserve existing public controller signatures and role errors explaining Admin for Studio/User for chat.
- [ ] **Step 4:** Run focused tests, scoped analyzer and `CardstackStudioAccessTest,CardstackStudioControllerTest` plus existing connection controller tests. Require ordinary-user refusal and existing admin/setup success.
- [ ] **Step 5:** Commit with `feat(studio): add accurate admin overview and state contracts`.

### Task 2 Establish navigation and compact Overview

**Files:** Modify `lwc/cardstackStudio/{cardstackStudio.js,cardstackStudio.html}`, `lwc/cardstackDashboard/{cardstackDashboard.js,cardstackDashboard.html}`, `lwc/cardstackObjectConfig/cardstackObjectConfig.js`, and `lwc/cardstackFlowConfig/{cardstackFlowConfig.js,cardstackFlowConfig.html}`. Create `lwc/cardstackDashboard/cardstackDashboard.css` and `salesforce-native/tests/studio-navigation.test.cjs`; update `salesforce-native/tests/{layout-builder.test.cjs,contact-studio.test.cjs,opportunity-studio.test.cjs}` decorator stripping for the added public API methods where needed. Remove the legacy `lwc/cardstackSetupChecklist/` from new source only after its connection guide is mounted directly in Setup. Update `salesforce-native/package/package.xml` and current app/tab descriptions.

**Interfaces:** Dashboard `@api refresh(): Promise<void>` refreshes its stored wire result. Add ObjectConfig `@api openObject(objectApi): Promise<void>` using the existing loadStaging path; Task 4 extends it with dirty-work protection. Consume PublishCenter's Trust Task 3 `focusDraft` and `refresh` public methods. Shell `handleNavigateTab(event): Promise<void>` waits for the target tab to render before invoking its child's public method. It routes Task 1's navigation detail, refreshes affected wire summaries on `configchange`, and exposes the actual pending count in Review & Publish. Keep child names stable; labels change. Until Task 3 adds `openStage`, Setup navigation opens its guide without a stage-specific call.

- [ ] **Step 1:** Test `overviewIsDefaultWithSixDestinations`, `overviewActionOpensExactObjectOrDraft`, `configChangeRefreshesOverviewAndPendingCount`, and `firstRunCanAuthorBeforeConnectionVerification`. Assert exact navigation labels, targeted detail, and awaited refresh calls; no new flow wizard opens merely because setup is unfinished.

```js
// Use the actual VM-loaded shell; stub child public methods and observe its state.
assert.equal(shell.activeTab, 'overview');
await shell.handleNavigateTab({detail:{tab:'objects',objectApi:'Contact'}});
assert.equal(shell.activeTab, 'objects');
assert.deepEqual(objectOpenCalls, ['Contact']);
```

- [ ] **Step 2:** Run `node --test salesforce-native/tests/studio-navigation.test.cjs`; confirm expected failures using existing VM component-harness patterns. Stubs must exercise actual handlers, not a duplicate implementation.
- [ ] **Step 3:** Implement the six native tab destinations, direct Setup guide mount, compact Overview of object states/drafts/activity, contextual next action, truthful Salesforce org-context label and human draft names. Remove coverage percentage, legacy checklist, repeated internal Studio headings and universal Add flow CTA. Keep Flow Launch Cards' Salesforce handoff explanation and existing editor accessible. Route object/draft/client-stage targets through the defined events.
- [ ] **Step 4:** Run navigation/state/flow/local suites. Verify no legacy-checklist history is treated as connection proof and setup state is not discarded by moving the component. Live UI checks remain in Task R.
- [ ] **Step 5:** Commit with `feat(studio): organize native admin navigation and overview`.

### Task 3 Turn the connection runbook into staged Setup

**Files:** Modify `lwc/cardstackConnectionSetup/{cardstackConnectionSetup.js,cardstackConnectionSetup.html}`, add CSS, and extend `lwc/cardstackConnectionSetupModel/cardstackConnectionSetupModel.js`, `tests/connection-setup-model.test.cjs`; create `salesforce-native/tests/studio-setup.test.cjs`. Preserve `classes/CardstackConnectionSetupController.cls` and its API contracts unless a validated read-only presentation adapter is required.

**Interfaces:** Connection model adds `setupStages(entry): Array<{key,title,status,nextAction,recovery}>` and `nextSetupStage(entry): string`; use the existing model's STEPS keys, including `site`, rather than inventing new evidence-stage identifiers. Component accepts `@api openStage(stageKey): void`; stage selection never writes history or verification. Existing `connectionchange` and per-client saved-draft state remain authoritative. Technical versions, support summary, full recovery table and history are expandable Advanced sections.

- [ ] **Step 1:** Test `historyDoesNotVerifyStage`, `clientsKeepIndependentDraftAndEvidence`, `unknownMetadataOffersManualInspection`, `switchingStageDoesNotLoseInputs`, and `expiredOrChangedSetupInvalidatesOnlyAffectedEvidence`. Assert an instruction checkbox cannot produce verified status; clicking nextStage changes presentation only; a stale-save error preserves draft values.

```js
// Build entry fixtures through the existing createState/acceptView/editDraft exports.
const beforeDraft = JSON.stringify(component.draft);
component.openStage('site');
assert.equal(JSON.stringify(component.draft), beforeDraft);
assert.notEqual(setupStages(entry).find(stage => stage.key === 'site').status, 'verified');
```

- [ ] **Step 2:** Run `node --test salesforce-native/tests/connection-setup-model.test.cjs salesforce-native/tests/studio-setup.test.cjs`; confirm new cases fail while old connection contracts remain meaningful.
- [ ] **Step 3:** Implement stage navigation with purpose, exact Setup link, required input help, current result and next action. Retain Site/public-client-ID/callback inputs, independent Claude/ChatGPT apps, seven-value diagnostics, operator observation and runtime/deployment JWT distinction. Prefer current blocked recovery before Advanced details. Add instructions to locate Site identifiers; do not fabricate metadata pickers, automatic provisioning or universal callbacks.
- [ ] **Step 4:** Run setup, protocol and connection UI suites; require existing actor/client/revision evidence validation remains intact. Native QA verifies real form retention/focus and concise first rendering.
- [ ] **Step 5:** Commit with `feat(studio): guide admins through connection setup stages`.

### Task 4 Guide authoring and preserve unfinished work

**Files:** Modify `lwc/cardstackObjectConfig/{cardstackObjectConfig.js,cardstackObjectConfig.html,cardstackObjectConfig.css}`, `lwc/cardstackLayoutField/{cardstackLayoutField.js,cardstackLayoutField.html}`, `lwc/cardstackFlowWizard/{cardstackFlowWizard.js,cardstackFlowWizard.html}`, `lwc/cardstackStudio/cardstackStudio.js`, and `lwc/cardstackAuditViewer/{cardstackAuditViewer.js,cardstackAuditViewer.html,cardstackAuditViewer.css}`. Create `lwc/cardstackDraftDialog/{cardstackDraftDialog.js,cardstackDraftDialog.html,cardstackDraftDialog.js-meta.xml}`, `lwc/cardstackRecordReadiness/{cardstackRecordReadiness.js,cardstackRecordReadiness.html,cardstackRecordReadiness.js-meta.xml}`, and `salesforce-native/tests/studio-authoring.test.cjs`. Extend layout/Contact/Opportunity/flow tests. Consume Lists Task 1 field/list metadata, so run after that API exists.

**Interfaces:** Editors expose `@api requestLeave(): Promise<boolean>` (clean:true; dirty modal Save/Discard/Stay); `@api openObject(objectApi): Promise<void>` loads only after leave approval. Shell restores the prior active tab until requestLeave resolves. A request-generation counter rejects responses for previous objects/edits. Emit `{keys,operation:'save'}` only after authoritative saved-state reconciliation. Readiness consumes Task 1's model. Post-publish panel consumes `{key,draftId}` and generates read-only/manual test instructions, never verified status.

- [ ] **Step 1:** Add failing tests `stayKeepsObjectAndValues`, `failedOrUnknownSaveCannotNavigateOrLoseNewerEdits`, `lateObjectLoadCannotReplaceNewObject`, `permissionAndActionSaveIncludesSharedLayoutDraft`, `unknownDenylistEntriesRoundTrip`, and `samplePreviewAndManualTestAreNotAccessEvidence`. Assertions exercise actual handlers with delayed/rejected promises. Extend existing Contact/Opportunity tests so supported candidate validation and disabled preserved actions still work.

```js
// Actual VM-loaded ObjectConfig with modal/Apex calls stubbed by the test.
editor.selectedObject = 'Account';
editor.requestLeave = async () => false;
const before = editor.buildLayoutJson();
await editor.openObject('Contact');
assert.equal(editor.selectedObject, 'Account');
assert.equal(editor.buildLayoutJson(), before);
```

- [ ] **Step 2:** Run `node --test salesforce-native/tests/studio-authoring.test.cjs salesforce-native/tests/layout-builder.test.cjs salesforce-native/tests/contact-studio.test.cjs salesforce-native/tests/opportunity-studio.test.cjs`; require new behavior failures before editing.
- [ ] **Step 3:** Implement readiness links through fields → allowed edits → actions → Save draft → Review & Publish → Test in chat. Keep direct subview navigation. Preserve section targets and keyboard reorder; use a keyboard-capable searchable object choice instead of mouse-only rows. Add searchable denylist/restriction selection with labels/API names; retain unknown entries and reject invalid new values. Keep required/readOnly/editability and object write-policy dependencies clear. Put process selection before mappings, show specific prerequisites and chat-versus-Salesforce destination. Preserve supported newer presets and renderer previews.
- [ ] **Step 4:** Implement persistent saved/live/dirty labels, Save draft busy states, shared-layout explanation, Save/Discard/Stay platform dialog, generation guards and authoritative reload after unknown response. Store the normalized saved JSON separately from current working inputs so save completion cannot erase newer edits. Remove arbitrary field/permission duplicate paths only where existing behavior remains available. Label sample layout previews without View as; show post-publication read-only instructions and optional disposable governed-edit test steps with no fake success marker. Use native button expansion in Activity, readable action labels, visible loading/errors and existing filters/export.
- [ ] **Step 5:** Run authoring and complete local suites. Native QA covers focus, narrower panel wrapping, accessible alternative to dragging, and failure recovery. No tests that merely assert cosmetic markup strings are required.
- [ ] **Step 6:** Commit with `feat(studio): guide card authoring and preserve unfinished work`.
