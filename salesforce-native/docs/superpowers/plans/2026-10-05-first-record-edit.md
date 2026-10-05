# Cardstack First Record Edit Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task in this chat. Steps use checkbox syntax for tracking. Do not delegate product edits without user authorization.

**Goal:** Complete one governed, persistent Salesforce record edit inside chat, with an interchangeable UI adapter.

**Architecture:** Apex owns published field policy, interaction state, validation, confirmation, and persistence. Native HXL or a Salesforce-hosted custom MCP App renders the same versioned model. Client transport readiness is a separate release gate; backend implementation proceeds independently.

**Tech Stack:** Salesforce API 67.0, Apex, custom objects, LWC Studio, HXL/Lightning Types, and a self-contained MCP App UI where needed.

**Spec:** `2026-10-05-editable-chat-adapters-design.md` in `salesforce-native/docs/superpowers/specs/` (user-facing copy: Cardstack-editable-chat-plan.md).

## Global Constraints

- Modify authoritative `salesforce-native/` only. Legacy `apps/` and `packages/` remain read-only references.
- Runtime hosting stays in Salesforce unless the user explicitly changes that requirement.
- API 67.0; opaque login for Metadata deployments; final JWT ON.
- No credential or interaction-key values in logs, screenshots, or output.
- No undocumented Aura/Screen Flow endpoints; no delete-record tool.
- Shared server policy and confirmation apply regardless of renderer or tool caller.
- Beta write scope: published Account Description and NumberOfEmployees only for the first acceptance demonstration; design interfaces may support later fields without advertising them.
- QA is performed by the implementer in Studio and real clients. Installation and client support claims require actual evidence.

## Review Focus

- A changed value under a previously reviewed interaction must require a new review (Task 2).
- A different actor, expired interaction, or changed published policy must fail before mutation (Tasks 1–2).
- Concurrent/retried confirmation must return one stored receipt, not repeat execution (Task 2).
- A record changed since review must be reported as stale instead of overwriting it silently (Task 3).
- A transport/client outage must retain the last server state and expose recovery without automatic write retries (Tasks 4–5).

## File boundaries and interfaces

All paths below are relative to `salesforce-native/force-app/main/default/` unless stated otherwise. New Apex classes/tests include matching API 67 `.cls-meta.xml` files.

`CardstackPolicyService.cls` owns published layout normalization and field exposure. Its interface is `resolve(String objectApiName) -> Policy`, where Policy contains `objectApiName`, `revision`, `editEnabled`, and `fields: Map<String,FieldPolicy>`. FieldPolicy contains canonical `apiName`, `dataType`, `required`, and `readOnly`. It resolves the active `layout:{Object}:default` configuration and current Salesforce field access. Missing `editEnabled` means false for legacy layouts.

`CardstackInteractionService.cls` owns the record-edit state machine. Interfaces:

- `start(Id recordId) -> InteractionView`
- `preview(String interactionKey, Map<String,Object> answers, Integer expectedRevision) -> InteractionView`
- `confirm(String interactionKey, Integer expectedRevision) -> InteractionView`
- `back(String interactionKey, Integer expectedRevision) -> InteractionView`
- `cancel(String interactionKey, Integer expectedRevision) -> InteractionView`

InteractionView is the canonical v1 JSON model: `schemaVersion:1`, `kind:'recordEdit'`, `status`, `revision`, `interactionKey`, `objectApiName`, `recordId`, `policyRevision`, field descriptors/values, exact before/after diff, field errors, expiry, and an optional stored receipt. Status is one of Editing, Review, Completed, Cancelled, Expired. Error results carry stable codes: DENIED, INVALID_INPUT, STALE, EXPIRED, CANCELLED. Clients cannot author record identity, allowed fields, policy revision, or saved receipts.

`Cardstack_Interaction__c` stores only hashes of random interaction keys, actor, record/action identity, policy revision, answers, preview, receipt, status, revision, and expiry. It uses private sharing and no end-user object CRUD grant; the with-sharing service locates only actor-owned interactions and performs explicit ownership checks. Backend fields are not arbitrary user-controlled JSON authorization inputs. Keep interaction TTL at 15 minutes for this slice.

## Task 1: Published editable field policy

**Files:** Create `classes/CardstackPolicyService.cls` and `CardstackPolicyServiceTest.cls`; modify `lwc/cardstackObjectConfig/cardstackObjectConfig.js` and `.html` to author `editEnabled`; reuse `CardstackConfigService` published access and existing record layout normalization patterns. Inspect `CardstackGetRecordAction` field normalization before extracting shared code; preserve its current read response.

- [ ] Add tests `publishedPolicyExcludesDrafts`, `legacyLayoutDoesNotEnableEditing`, `readOnlyOverridesEditability`, `unknownOrInaccessibleFieldsCannotBeExposed`. Assertions: draft-only configuration grants no editing; omitted editEnabled is false; readOnly=true never becomes writable; required settings do not bypass Salesforce access. Include flat and sectioned existing layout shapes.
- [ ] Run focused tests and verify failure before implementing the new service.
- [ ] Implement `resolve(String objectApiName)` and stable policy revision from canonical normalized configuration. The effective editable set requires editEnabled plus published field exposure plus Salesforce update access; duplicate field references use the most restrictive policy.
- [ ] Add the Studio toggle, default OFF for old layouts, and a migration explanation. Preserve drafts and unknown legacy properties.
- [ ] Deploy with JWT procedure, run focused Apex/component checks, and verify Stage Draft does not enable a live edit. Publish a disposable layout and verify policy resolution. Commit this independent change.

## Task 2: Durable actor-bound interaction and exact review

**Files:** Create `objects/Cardstack_Interaction__c/` and its fields; create `classes/CardstackInteractionService.cls` and `CardstackInteractionServiceTest.cls`. Store key hash (unique text 64), actor lookup, record ID, object API name, policy revision, status, integer revision, expiry, and long-text answer/preview/receipt JSON. Do not log keys or grants.

- [ ] Add tests `changedValueRequiresNewReview`, `wrongActorIsDenied`, `expiredInteractionIsDenied`, `changedPolicyIsStale`, `cancelNeverWrites`, `duplicateConfirmationReturnsReceipt`, and `revisionMismatchIsStale`. Assertion example: preview Description='A', then change to 'B'; confirmation of the old revision cannot save B. Test zero and blank as intentional answers; omitted means unchanged.
- [ ] Run tests and observe the expected failure; implement start/preview/back/cancel using Task 1 policy. Generate 256-bit random keys; store only SHA-256 hashes. Required validation evaluates the resulting record, not just supplied answers.
- [ ] Implement locked confirmation using `FOR UPDATE`, rechecking actor, expiry, policy and revision before execution. Record write and completed receipt must be in the same Salesforce transaction. Repeated confirmation of Completed returns the prior receipt.
- [ ] Reject unexpected fields and wrong typed values; do not silently coerce an AI-provided string into a number or Boolean. Add bounded string/patch sizes.
- [ ] Run focused tests including concurrency review, verify no cancel/review DML affects the Account, and commit. Keep transport adapters out of this service.

## Task 3: Governed persistence and existing update tools

**Files:** Modify `classes/CardstackPreviewUpdateAction.cls`, `CardstackUpdateRecordAction.cls` and their tests; add `classes/CardstackRecordEditAction.cls` and test as the adapter-facing typed/JSON bridge to Task 2. Reuse existing audit service and user-mode DML. Do not use the existing org-ID-derived HMAC as authorization for the new path.

- [ ] Add tests `missingConfirmationCannotWrite`, `tamperedPatchCannotWrite`, `staleRecordCannotWrite`, `userModeWriteFailurePreservesReview`, `exactConfirmedPatchIsAudited`. Preview and confirm bind exact values, actor and target, not merely field names.
- [ ] Route record-edit preview/write wrappers through Task 2, preserving existing public response fields where compatible. Use the opaque interaction key in existing confirmToken response/request fields for migration; old stateless tokens cannot authorize new writes.
- [ ] Capture the reviewed record version and recheck under a lock before user-mode mutation. On transaction failure return truthful field/error state and retain a valid review where safe. Return the actual stored receipt and fresh readable record values on success.
- [ ] Independently query the disposable Account after confirm and cancel. Verify Description blank and NumberOfEmployees zero persist correctly, and unauthorized fields cannot be submitted through direct tool calls.
- [ ] Run update/audit regressions and full Apex suite; commit. Migrate or disable any remaining legacy write tool that cannot meet mandatory confirmation before an editable beta release.

## Task 4: Select and implement the first editable adapter

**Files:** Extend the relevant `uiWidgets/`, `lightningTypes/`, and `mcpServerDefinitions/Cardstack.mcpServerDefinition-meta.xml` for a proven native path; otherwise create `classes/CardstackMcpEndpoint.cls`, its tests, and `staticresources/CardstackChatUi.*` from reviewed source. Disposable probe files are references, not production code to copy wholesale.

- [ ] Give the adapter exactly the Task 2 model and revisioned operations. Add serialization tests for zero/false/blank/Unicode/quotes and unknown schemaVersion; UI must never invent omitted answers.
- [ ] Native route: implement only a documented or demonstrated complete input submission mechanism. Do not repeat `inputs:auto` plus extra sendMessage attributes and expect a different result without new evidence.
- [ ] Custom route: prove authenticated connected-user execution and safe public OAuth/resource discovery before guest/public deployment. No guest CRM access, exposed bearer credentials, or service-user substitution. Use a disposable identity/read-only echo first. Obtain any required approval for public exposure at that concrete step.
- [ ] Make one focused OAuth implementation/test attempt per client, with logs limited to safe statuses. If blocked, document the exact boundary and the smallest architecture choice; continue independent backend/Studio work rather than replacing forms with conversational prompts.
- [ ] In each successful client, render/edit two fields, submit, review, Back, cancel, confirm, refresh, and repeat confirm. Save screenshots and server/read-back receipts. Commit only the adapter that passes; list unsupported clients explicitly.

## Task 5: Studio preview, acceptance, and beta scope

**Files:** Modify `lwc/cardstackObjectConfig/`, `cardstackPublishCenter/`, `cardstackAuditViewer/` as needed; add adapter-independent interaction fixtures under `salesforce-native/tests/`; update native installation/QA documentation.

- [ ] Add tests `previewMatchesPublishedRuntimePolicy`, `invalidEditableDependencyBlocksPublish`, `clientRecoveryRestoresLastServerState`. Required/read-only flags and field errors in Studio match the runtime contract.
- [ ] Add a read-only Advanced View JSON for the canonical experience definition. Show actual client capability status, rather than implying every preview control is supported in chat.
- [ ] Complete real Studio and connector QA on disposable data; restore original drafts/config/data. Run full checks after final changes, verify JWT ON, and record which client/version passed each release gate.
- [ ] Document the first slice's supported scope, remaining auth/installation prerequisites, and actual beta package/companion contents. Do not count installation as verified from a source deploy.
- [ ] Commit/push the reviewed native source. Write the guided-process subsystem plan next, using these now-stable state and adapter interfaces.

## Execution order and stop conditions

Start Tasks 1–2 immediately after plan review; resolve Task 4 authentication as a bounded independent gate, without parallel product edits. Task 3 depends on Tasks 1–2; full client acceptance depends on all four. Task 5 closes the milestone.

A blocked adapter does not block policy/configuration implementation, but it blocks claiming a completed editable beta. No broad Screen Flow interpreter implementation precedes the first successful record edit. If a hosting change becomes necessary, bring a concrete tested alternative and its exact tradeoff to the user.
