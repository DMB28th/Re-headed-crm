# Studio List Exposure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace primary Lists JSON with declarative controls whose published settings actually restrict chat list discovery and execution.

**Architecture:** Introduce a versioned exposure contract under the existing `exposures:{Object}` key. Enforce it before list discovery/selection/execution, resolving names only among allowed, connected-user-readable targets. Reuse current Salesforce view metadata and saved Cardstack filter execution; preserve their distinct semantics and fallback labels.

**Tech Stack:** API-67 Apex/LWC, user-mode metadata reads, existing config drafts, Node model tests and Apex user-context tests.

**Spec:** [Approved scope](/Users/danielben-atar/Re-headed-crm/salesforce-native/docs/superpowers/specs/2026-10-13-studio-admin-experience-scope.md).

## Global Constraints

Inherit the [master plan](/Users/danielben-atar/Re-headed-crm/salesforce-native/docs/superpowers/plans/2026-10-13-studio-admin-experience.md). No full Salesforce saved-view fidelity, alias/default routing, self-REST session, new CRM grants, or silently rewritten saved filters. Admin-visible metadata never demonstrates another user's access. Draft policy has no runtime effect.

## Review Focus

Test direct/fuzzy hidden-list calls, name collisions, deleted/inaccessible view IDs, malformed/unknown policy, and legacy/unknown round trips. Absence of policy and failure to read a configured policy are different states.

## Published contract and migration decision

Version 1 uses `{"version":1,"allowAdHoc":false,"views":[{"viewId":"checksum18","enabled":true}],"customLists":[{"key":"listview:Opportunity:approved_name","enabled":true}]}`. Persist canonical identity rather than a user-editable alias. Labels/developer names come from current metadata; preserve unrelated top-level and row properties during editing but do not interpret them as runtime capabilities. `allowAdHoc` explicitly controls requests without a named list; false is the default for a new policy, preventing an unnamed request from silently bypassing the configured named-list choices. An unknown nonempty viewName is denied, even when allowAdHoc is true.

No active policy, or a recognized legacy unversioned exposure value, preserves the documented legacy runtime until an admin explicitly saves and publishes version 1. Show that legacy exposure settings are not enforced. Invalid JSON, unknown explicit versions, or inability to read a configured policy fail closed with a renderable error, never an unrestricted fallback. Empty version-1 selections deny all named lists. Do not auto-activate policy or purge old data. Preserve active `listview:` configurations separately. Admin migration chooses explicit selections; unsupported legacy settings remain inspectable.

This migration and the small Allow unnamed filtered requests control are concrete implementation decisions for plan review. They make policy enforcement complete without claiming Salesforce saved-view reproduction or default/alias routing.

### Task 1 Implement the policy, metadata adapter and runtime enforcement

**Files:** Create `salesforce-native/force-app/main/default/classes/{CardstackListExposurePolicy.cls,CardstackListExposurePolicyTest.cls,CardstackListCatalog.cls,CardstackListCatalogTest.cls}` plus metadata. Modify `classes/{CardstackListViewAction.cls,CardstackListViewActionTest.cls,CardstackListViewsAction.cls,CardstackListViewsActionTest.cls,CardstackConfigService.cls,CardstackConfigServiceTest.cls,CardstackStudioController.cls,CardstackStudioControllerTest.cls}`. Add Admin class access for catalog/authoring adapters; do not expose admin metadata via User. Create `salesforce-native/tests/list-policy-contract.test.cjs` only for cross-language fixture/contract behavior, not as a substitute for Apex enforcement tests.

**Interfaces:** `CardstackListExposurePolicy.loadPublished(String objectApi): Policy`; `validateCandidate(String key,String json): void`; `isAllowed(Policy policy,String targetKind,String canonicalKey): Boolean`; `allowsAdHoc(Policy policy): Boolean`. `Policy` contains version/mode and allowed canonical target sets. `CardstackListCatalog.available(String objectApi): List<Map<String,Object>>` returns `{kind:'salesforce'|'cardstack',key,label,developerName?,viewId?,availability}` for accessible live metadata/saved filters. Controller `getStudioListCatalog(String objectApi): List<Map<String,Object>>` and `getStudioFieldCatalog(String objectApi): List<Map<String,Object>>` are cacheable admin-only wrappers; field rows include api/label/type and Boolean updateable. Normalize view IDs using the existing checksum18 helper. Keep existing invocable/Lightning output fields: filter the existing Salesforce discovery response without adding immutable output schemas. Saved Cardstack lists remain available through their explicit allowed canonical keys; this plan does not introduce a new chat list-selection renderer.

- [ ] **Step 1:** Add failing tests `draftCannotRestrictRuntime`, `publishedPolicyFiltersDiscoveryAndDirectExecution`, `hiddenNamesCannotReturnThroughFuzzyOrIdResolution`, `unknownNameDeniedEvenWhenAdHocAllowed`, `collisionRequiresUnambiguousAllowedTarget`, `missingOrLegacyPolicyPreservesBaseline`, `corruptUnknownOrUnreadableConfiguredPolicyDenies`, and `connectedUserStillNeedsNativeAccess`. Assert zero returned CRM rows for denied calls and no saveViewAs mutation; ordinary users cannot call admin catalog APIs. Use a test metadata provider seam for ListView fixtures rather than assuming subscribers have specific saved views. Include 251 target rows to test bulk catalog filtering without queries per row.

```apex
// Under the ordinary-user fixture, after an admin publishes a policy excluding this view.
CardstackListViewAction.ListViewRequest request = new CardstackListViewAction.ListViewRequest();
request.objectName = 'Opportunity'; request.viewName = 'Hidden_View';
List<CardstackListViewAction.ListViewResponse> result = CardstackListViewAction.listView(
    new List<CardstackListViewAction.ListViewRequest>{request});
Assert.areEqual(0, result[0].count);
Assert.areEqual(0, result[0].rows.size());
Assert.isTrue(result[0].summary.contains('not available in chat'));
```

- [ ] **Step 2:** Run scoped new/affected failing Apex tests under API 67.0 with the required Apex test skill. Record expected failures before implementation. Local fixture checks must agree on version/field names.
- [ ] **Step 3:** Implement candidate validation in both saveDraft and publishDraft paths, alongside existing record capability validators. Resolve full IDs/names only among allowed native-readable targets before existing fallback execution. In explicit-policy mode, disable broad exception catches that convert authorization/read failures into unrestricted execution. If normalized names collide across Salesforce and saved Cardstack sources, return a renderable choice/error without data; allow canonical ID or full saved key. Preserve My-owner filtering, limits, saved-filter semantics, and exact existing fallback note. Denied calls cannot create a saved filter; their summary contains `not available in chat`. Check config object/field read access before querying published policy under USER_MODE; an access/query exception is denial, never absence. The shipping Config sharing model is ReadWrite; do not weaken CRUD/FLS/sharing to recover missing policy. Never elevate CRM queries.
- [ ] **Step 4:** Run scoped analyzer and policy/catalog/config/controller/list tests, then the complete local baseline. Verify unchanged legacy path and server enforcement independently of UI. Task R repeats against ordinary-user real-client calls.
- [ ] **Step 5:** Commit with `feat(studio): enforce published list exposure policy`.

### Task 2 Deliver declarative Lists editing and policy review

**Files:** Create `lwc/cardstackListConfig/{cardstackListConfig.js,cardstackListConfig.html,cardstackListConfig.css,cardstackListConfig.js-meta.xml}`, `lwc/cardstackListConfigModel/{cardstackListConfigModel.js,cardstackListConfigModel.js-meta.xml}`, and `salesforce-native/tests/studio-list-config.test.cjs`. Modify `lwc/cardstackObjectConfig/{cardstackObjectConfig.js,cardstackObjectConfig.html}`, `lwc/cardstackConfigDiff/cardstackConfigDiff.js`, and its tests; update current native README and add `salesforce-native/docs/STUDIO_LIST_EXPOSURE.md`.

**Interfaces:** Model `parseExposure(json,catalog): {mode:'legacy'|'v1'|'unavailable',working,preserved,issues}`; `setExposure(model,kind,key,enabled): model`; `serializeExposure(model): string`. Child `@api objectApi`; `@api requestLeave(): Promise<boolean>` uses the shared draft-leave contract; `@api refresh(): Promise<void>` reads current saved/live exposure state. Emits `configchange` `{keys:['exposures:'+objectApi],operation:'save'}` after confirmed save. Working values remain separate from live, and each row identifies Salesforce fallback versus saved Cardstack filter.

- [ ] **Step 1:** Test `unversionedValuesNeedExplicitMigration`, `unknownValuesAndUnresolvedSelectionsSurviveRoundTrip`, `zeroAndFalseDoNotBecomeDefaults`, `failedSaveRetainsSelection`, and `publishedListDiffNamesAffectedTargetsAndAdHocChange`. A save must retain unknown object/row properties; a deleted selected view remains visible as unavailable rather than disappearing. A label collision shows source and canonical target. Version-1 empty selection stays deny-all, not select-all.

```js
const model = parseExposure('{"version":1,"allowAdHoc":false,"views":[],"customLists":[],"legacyHint":"retain"}', []);
const value = JSON.parse(serializeExposure(model));
assert.equal(value.allowAdHoc, false);
assert.equal(value.views.length, 0);
assert.equal(value.legacyHint, 'retain');
assert.equal(parseExposure('{"views":[],"customLists":[]}', []).mode, 'legacy');
```

- [ ] **Step 2:** Run `node --test salesforce-native/tests/studio-list-config.test.cjs salesforce-native/tests/studio-config-diff.test.cjs`; require expected new failures.
- [ ] **Step 3:** Implement searchable list choices, visible source/fallback explanation, enabled selections, Allow unnamed filtered requests, unavailable preserved entries, draft state and Save draft → Review & Publish handoff. First migration requires explicit selection/review; no silent conversion. Place read-only legacy JSON inspection/export under Advanced; permit compatible version-1 editing only through validated supported values. Do not offer alias/default controls or exact Salesforce filter previews. Extend semantic diff with enablement/canonical target/allowAdHoc before/after descriptions. Keep the underlying saved-filter records untouched.
- [ ] **Step 4:** Run focused and complete local suites and affected Apex authoring validation tests. Native QA proves searchable controls, dirty-state handling and ordinary-user enforcement agree with published selections.
- [ ] **Step 5:** Commit with `feat(studio): add declarative list exposure configuration`.
