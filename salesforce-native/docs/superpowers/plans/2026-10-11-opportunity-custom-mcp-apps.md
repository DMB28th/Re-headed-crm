# Opportunity Custom MCP Apps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user already selected scoped implementers with separate spec and quality reviews.

**Goal:** Deliver Stage, Close Date and Amount editing, exact review/confirmation, atomic save, recovery and refreshed Opportunity cards inside actual Claude and ChatGPT.

**Architecture:** Salesforce Site MCP ingress serves a self-contained custom App; a narrow Apex process owns actor-bound private interactions and exact confirmed effects. Native Studio publishes one fixed three-field action. New helpers reuse governance concepts without invoking the legacy trial-DML preview or partial-field update paths.

**Tech Stack:** Salesforce Apex/LWC API 67.0, private Salesforce objects, StaticResource HTML, existing ext-apps SDK 1.7.4 and existing local build/test dependencies; no external runtime.

**Spec:** [Approved design](../specs/2026-10-11-opportunity-custom-mcp-apps-design.md).

**Status:** Approved by the user on October 11, 2026; source implementation authorized. Deployment, package creation and CRM QA retain separate authorization gates.

## Global Constraints

- API **67.0**; SDK **1.7.4**. Salesforce hosts Studio, execution, durable state and custom MCP Apps delivery.
- Three states, three inputs, one current-record update effect; no user-authored graph or expressions; one declared transition per request.
- 15-minute absolute interaction lifetime; 16 KiB decoded tool arguments; 32 KiB serialized private state; existing tighter ingress limits take precedence.
- All CRM queries/writes execute with sharing and user mode as the connected actor. Published policy only restricts access.
- Normalize valid platform IDs to checksum18; validate supplied full checksum18 IDs; never compare truncated IDs or emit private IDs in safe evidence.
- Stage API value, calendar date `YYYY-MM-DD`, decimal string Amount; explicit optional clearing; no inferred clear, conversion or rounding.
- Exact values, actor, record, policy/config/process revisions, review revision, expiry, freshness and Stage/currency context bind confirmation.
- No CRM trial DML at review; confirmed patch saves atomically with required durable audit and receipt; duplicate confirmation never repeats CRM DML.
- Private handles/grants only in result `_meta` and host-mediated arguments; no tokens in text, structuredContent, DOM, storage, logs or safe receipts.
- No delete-record tool, generic Flow importer, loops/subflows/lookups/action calls, external services, custom accounts or retired runtime rebuild.
- Reuse the existing worktree; preserve the five pre-existing dirty documents and frozen evidence. New documents supersede dated status without rewriting history.
- No HXL retirement/beta upgrade/promotion/push/merge under this plan. A new QA org/client scope needs concrete authorization. Card Stack SFAPP must end JWT ON after any authorized deployment.

## Review Focus

1. Lost response after save commits: recover the original receipt; never claim unsaved or repeat the effect (Tasks 3, 5, 7).
2. Access removed after review or completion: deny without leaking historical answers or receipt fields (Tasks 2, 3, 7).
3. Inactive current Stage absent from choices: permit keep-current without permitting re-selection as a new value (Tasks 1, 2, 5).
4. Decimal/date equivalence and empty inputs: no accidental null, binary floating-point loss or timezone shift (Tasks 1, 2, 5).
5. Two tabs or delayed results after switching record: stale results cannot enable another record's confirmation (Tasks 3, 5, 7).

## Source layout and decisions

Paths below are relative to this worktree. `Apex` means `salesforce-native/force-app/main/default/classes/`; every new Apex class/test includes its API 67 `.cls-meta.xml`. Keep units below 500 lines; split helpers if needed, without changing these public interfaces.

| Unit | Ownership |
| --- | --- |
| `Apex/CardstackOpportunityEditTypes.cls` | Versioned public views/private envelope/requests and stored-state schema |
| `Apex/CardstackOpportunityStageProvider.cls` | Record-type Stage values and canonical fingerprint; injectable provider for tests |
| `Apex/CardstackOpportunitySelector.cls` | User-mode record/required-field/currency reads and locked freshness read |
| `Apex/CardstackOpportunityEditDomain.cls` | Exact value parsing, no-op detection, typed patch/diff; no persistence |
| `Apex/CardstackOpportunityEditRepository.cls` | Actor-gated interaction/grant locks and persistence; no CRM execution |
| `Apex/CardstackOpportunityEditService.cls` | Fixed edit/review/completion transitions and recovery orchestration |
| `Apex/CardstackOpportunityWriteService.cls` | One atomic confirmed update + mandatory audit + completion receipt |
| `Apex/CardstackOpportunityMcpAdapter.cls` | Strict schemas, tools/resource linkage, serialization and sanitized errors |
| `salesforce-native/ui/opportunity-edit/` | Separate transport controller and shared plain-DOM presentation; copied/adapted renderer concepts |
| `Apex/CardstackOpportunityActionPolicy.cls` | Exact preset validation shared by launch and Studio publication |
| Native Object Config LWC + preview child | Preset authoring and shared-renderer synthetic preview |

Keep Account editor/confirmation entry points unchanged. Use existing private `Cardstack_Interaction__c` and `Cardstack_Confirmation__c` fields with tagged state (`kind=opportunity-edit-v1`). Never locate/replay a different state kind. Interaction/confirmation CRUD remains ungranted. New repository system-mode operations require `CardstackConnectionAccess.requireUser()` and actor match; admin cleanup does not become a runtime capability.

Receipt retention: existing record-edit interactions/confirmations have no scheduled purge. Preserve that behavior: completed actor-owned receipts remain resumable after 15 minutes until explicitly authorized administrative cleanup removes them. Do not apply `CardstackConnectionRetention`'s diagnostic-only 30-day policy or add scheduling. Audit retains its existing storage lifecycle. Denied current access prevents receipt disclosure regardless of retention.

## Shared contract (pin before task briefs)

`CardstackOpportunityEditTypes` owns these nested types:

- `FieldChange { String fieldApi; String operation; String value; }`: operation `set` requires value; `clear` requires absent value; missing field means keep-current. Only StageName, CloseDate, Amount; duplicates/unknown keys rejected.
- `TransitionRequest { String interactionKey; Integer expectedRevision; String operation; List<FieldChange> changes; Integer reviewRevision; String reviewGrant; }`: review alone accepts changes; confirm alone requires reviewRevision/grant and forbids changes; Back/Cancel/Resume forbid both. Resume permits omitted expectedRevision.
- `View { String contractVersion; String status; String recordId; String recordName; Integer revision; Integer reviewRevision; String expiresAt; List<FieldView> fields; List<DiffRow> diff; List<FieldError> errors; Receipt receipt; }`: contract `opportunity-edit/v1`; statuses `Editing`, `Review`, `Completed`, `Cancelled`, `Expired`, `Conflict`, `Rejected`.
- `FieldView { String fieldApi; String label; String value; String dataType; Boolean required; Boolean canClear; List<Choice> choices; String currencyCode; }`; `DiffRow { String fieldApi; String label; String beforeValue; String afterValue; }`; `FieldError { String fieldApi; String code; String message; }`. Decimal/date values remain strings; null is explicit. Errors use bounded public messages.
- `Envelope { View view; String interactionKey; String reviewGrant; }`: adapter exports only `view` in structuredContent; private strings only in `_meta.cardstack/opportunityEdit`.
- `StageContext { String recordTypeId; List<Choice> choices; String fingerprint; }`; `Choice { String label; String value; }`.
- `RecordContext { SObject record; String currencyCode; String freshness; }`; freshness covers SystemModstamp, target/required read values, RecordTypeId and currency context.
- `CanonicalPatch { List<CardstackPreviewUpdateAction.PatchEntry> entries; Map<String,Object> typedValues; List<DiffRow> diff; String digest; }`: entries use canonical strings/null; digest is sorted exact field/value pairs; zero remains a decimal value.
- `StoredState`: schema/kind, actor/org/client/record identities, action/process/policy/setup digests and revisions, start expiry, initial record/Stage/currency context, answers, canonical patch/diff, review revision, confirmation ID, status and final receipt. Never persist raw interaction or grant keys.
- `Receipt`: opaque public reference, safe actor display name/time, exact reviewed diff and completed status (`saved` or `noChanges`); current record read is separate. Private CRM values stay out of exported QA/support receipts.

Public tool names/URI are exactly those in spec §6. StaticResource `CardstackOpportunityEditUi` serves `ui://cardstack/opportunity-edit-v1.html`. Only open is model-visible; all four tools are app-callable. Result text is safe summary, never an alternate text confirmation API.

## Execution and verification rules

Before execution, create `.superpowers/sdd/2026-10-11-opportunity-edit/progress.md`, record approved spec/plan, existing branch/head, exact dirty-file/evidence hashes and task/interface dependency scan. Each task has a fresh scoped implementer, then separate spec and quality reviewers; controller owns live actions. Do not dispatch product implementation during plan review.

Use TDD per task: write named behavior tests, establish assertion failure, implement, pass, run scoped analyzer for authored Apex/LWC, obtain both reviews, then commit only owned explicit paths. Compilation failure is not a behavioral red test. Existing helper `run-apex-checks.cjs` runs two fixed connection classes and cannot run these new tests. Use supported CLI `sf apex run test --target-org "$qa_target" --class-names <listed classes> --api-version 67.0 --result-format json --wait 10` only for a separately authorized target, privately capturing output as in `MCP_APPS_INSTALL.md` §5. Fetch completion after timeout; publish only safe counts. Deployment follows the same guide/runbook with JWT restoration.

Local tests below use `node --test <exact path>`; resolve build dependencies from the existing `packages/widgets/node_modules`, never install. Scoped runtime/build tests establish local behavior, not live host proof. Read applicable Apex/test/LWC/MCP Apps/analyzer skills at execution; use systematic-debugging for failures and receiving-code-review before acting on reviews.

### Task 1: Stage feasibility and exact field domain

**Files:** Create Types, StageProvider, Selector, EditDomain and corresponding `*Test.cls` under `Apex`; create `salesforce-native/docs/OPPORTUNITY_STAGE_PROVIDER_QA.md`. No UI or ingress mutation.

**Interfaces:** Produce `StageProvider.resolve(String objectApi, String recordTypeId) -> StageContext`; `Selector.read(Id recordId, Set<String> requiredFields, Boolean lockRecord) -> RecordContext`; `EditDomain.canonicalize(RecordContext current, StageContext stages, Policy policy, List<FieldChange> changes) -> CanonicalPatch`. Test provider seam supplies deterministic contexts; production delegates to ConnectApi.RecordUi. Types own the shared contract above.

- [ ] Write `stageValuesUseRecordTypeApiValues`, `missingContextFailsClosed`, `inactiveCurrentStageCanOnlyBeKept`, `decimalZeroAndPrecisionStayExact`, `calendarDateHasNoTimezone`, `duplicateAndUnknownFieldsRejected`. Assert distinct fixtures return distinct Stage sets; `0`/`0.00` compare equal; `12500.25` remains exact; `2026-02-30`, `1e3`, blank amount and excess scale fail; optional clear produces null; omitted fields never create entries.
- [ ] Run the new Apex classes on an authorized test target and establish behavioral failures using the test seam before implementing the provider/domain. Keep private capture; require completed failure names matching the new assertions.
- [ ] Implement exact grammar and native Describe precision/scale/required checks. Selector derives object from validated record identity, requires Opportunity, reads accessible published/required fields, actual record type, and single/multicurrency context. Provider checks object/field access before fetching choices and never substitutes generic Describe options. Canonical fingerprints use sorted API values/context; labels are escaped display data.
- [ ] Pass scoped tests/analyzer. Prepare a concrete separately approved fixture/package bundle; prove API 67 compile and package compatibility, ordinary-user named ingress execution, and two sales-process contexts using supported Salesforce read-back. Record master/inactive/translated-label tests where available. No assumption that unit mocks prove these facts.
- [ ] Gate: until live provider/package checks pass, do not begin broader renderer Task 5. Tasks 2–4 may proceed source-only against the injected provider after their own plan authorization. If provider fails, stop Stage capability and report the exact unsupported boundary; no new credentials/permissions workaround.
- [ ] Obtain independent spec/quality reviews and commit only the new helper/test/docs paths.

### Task 2: Published action and read-only durable review process

**Files:** Create ActionPolicy, EditRepository, EditService and corresponding tests under `Apex`; modify `CardstackRecordActionService.cls` and its test only for the new preset; no legacy editor API widening.

**Interfaces:** `ActionPolicy.validate(String objectApi, Definition action, Policy policy) -> void`; `EditService.start(String client, Id recordId, String actionName) -> Envelope`; `EditService.transition(String client, TransitionRequest request) -> Envelope`. Repository provides `create(StoredState state) -> String`, `lockOwned(String client, String key) -> LockedInteraction`, `save(LockedInteraction interaction, StoredState state) -> void`; `LockedInteraction` owns the private row and deserialized state. `create` returns a random 64-hex key and stores only its SHA-256 hash.

- [ ] Write `draftActionCannotStart`, `fixedPresetRejectsMappingsOrExtraFields`, `reviewDoesNoCrmDml`, `backAndCancelInvalidateGrant`, `absoluteExpiryIsNotExtended`, `wrongActorCannotResume`, `noOpCompletesWithoutGrant`, `stateKindAndSizeRejected`. Assert fixed current mappings in Stage/CloseDate/Amount order; no changes to target SystemModstamp or an instrumented Opportunity trigger counter at review; review grant absent on error/no-op; repeated Resume never extends expiry.
- [ ] Establish red assertions with source-compatible scaffolding on authorized target; no preview/update delegation merely to make review tests pass.
- [ ] Implement pinned process `opportunity-edit/v1`: Editing → Review → Completed, plus Back/Cancel terminal handling. Validate inputs through Task 1 domain; review persists canonical answers/diff and mints a private actor-bound grant with deadline capped at original interaction expiry. New grant subject includes review/process/policy/setup/Stage/currency digests. Do not change legacy `updateSubject` or invoke legacy preview.
- [ ] Persist tagged bounded state using existing private fields. Acquire setup row then owned interaction locks; check org/client/setup enabled intent/digest, current action/policy/rights and initial freshness before mutation. Drift returns Conflict without new authority; Back invalidates review; Cancel clears drafts. Resume returns latest accepted state; after rights loss return Rejected without sensitive view fields.
- [ ] Test `reviewResumeReissuesSamePatchWithoutExtendingExpiry`: raw grants are never stored, so Review Resume revalidates pinned patch/context, invalidates the prior grant and creates a new grant/review revision for the identical displayed diff, capped at original expiry. The UI must show this latest review and await a new explicit Confirm gesture. Changed context returns Conflict; expired review returns Expired; completion Resume only retrieves the stored receipt.
- [ ] Pass tests/analyzer and inspect no raw keys in state/audit/messages. Test 16 KiB arguments/32 KiB state at exact boundary and over-limit UTF-8 values. Obtain both reviews; commit exact task paths.

### Task 3: Atomic confirmed save, mandatory audit and replay recovery

**Files:** Create WriteService and `CardstackOpportunityWriteServiceTest.cls` under `Apex`; modify EditService/Repository and their tests; create `CardstackOpportunityWriteAudit.cls` and test under `Apex`.

**Interfaces:** `WriteService.confirm(String client, TransitionRequest request) -> Envelope`; `WriteAudit.appendRequired(Id recordId, Receipt receipt) -> void` throws on failure. EditService delegates only Confirm to WriteService. Repository exposes `lockGrant(LockedInteraction interaction, String rawGrant) -> Cardstack_Confirmation__c` and `complete(LockedInteraction interaction, Cardstack_Confirmation__c grant, Receipt receipt) -> void`. No interface accepts a new record ID or patch on confirm.

- [ ] Write `alteredGrantOrReviewCannotWrite`, `allFieldsOrNone`, `requiredAuditFailureRollsBack`, `receiptFailureRollsBack`, `repeatConfirmReturnsOriginalReceipt`, `expiredCompletedResumeDoesNotWrite`, `validationFailureRequiresNewReview`, `accessRemovedHidesReceipt`, `cancelAndConfirmSerialize`. Assert one successful CRM update/audit/receipt; same receipt on replay; full rollback on injected audit/receipt failure; new review required after a known DML error.
- [ ] Establish red assertions; use narrowly scoped test injection to count effects/fail required writes, never a production bypass flag.
- [ ] Implement lock order setup → interaction → confirmation → Opportunity, then current action/policy/rights/context and exact patch validation. Completed-state replay checks current actor/access before returning receipt and bypasses expiry only for outcome retrieval. Pending grants expire at original deadline; altered revisions/grants cannot write.
- [ ] After all checks, savepoint the save attempt; execute exactly one user-mode Opportunity update with all validated values. Required audit is a narrowly scoped server-owned insert recording validated actor, normalized target and reviewed diff; do not grant ordinary audit CRUD or call best-effort `logAction`. Persist audit/completion/receipt in the same transaction. On known DML failure, rollback attempt, invalidate grant, preserve answers and return Editing/errors requiring new review. Unexpected infrastructure failure propagates sanitized rejection after rollback; never report success.
- [ ] Test lost-response simulation by committing Confirm, discarding its returned envelope, then Resume/duplicate Confirm: original receipt and no second effect. Real concurrent transactions/locks are separately verified in Task 7; unit tests cannot attest actual contention. Confirm Stage provider behavior inside the lock sequence; if ConnectApi introduces unsupported transaction behavior, stop and resolve before changing lock order.
- [ ] Pass tests/analyzer, Account editor/action regressions and both reviews; commit exact owned paths. Document no new interaction purge/schedule and completion retrieval after edit expiry.

### Task 4: Product MCP tools, resource and safe serialization

**Files:** Create McpAdapter and test under `Apex`; modify `CardstackMcpDispatcher.cls`, `CardstackMcpDispatcherTest.cls`; extend `salesforce-native/tests/connection-protocol.test.cjs`; create `salesforce-native/tests/opportunity-protocol.test.cjs`. Add resource lookup seam until Task 5 supplies bundle.

**Interfaces:** `McpAdapter.tools() -> List<Object>`; `McpAdapter.call(String client, String name, Map<String,Object> args) -> Map<String,Object>`; `McpAdapter.readResource(String uri) -> Map<String,Object>`. Dispatcher retains existing diagnostics and delegates only exact new names/URI. Resource not yet built returns sanitized unavailable, not placeholder success.

- [ ] Write `openIsOnlyModelVisible`, `confirmationKeysOnlyInMeta`, `confirmRejectsPatchOrRedirect`, `resourceMimeAndCspMatch`, `guestDeniedBeforeCrmDispatch`, `legacyDiagnosticsUnchanged`. Assert exact keys/types, tool names/visibility, URI/MIME; raw key/grant absent from serialized text/structuredContent; unknown keys/Boolean confirmation rejected.
- [ ] Run `node --test salesforce-native/tests/opportunity-protocol.test.cjs` and scoped Apex adapter/dispatcher tests; record red assertions.
- [ ] Implement strict per-operation request parsing, UTF-8 limits and normalized IDs. Open reads the authorized configured card/action set. Start/transition map to Task 2/3. Refresh is a separate authoritative read. Set meaningful safe text + checked view in structuredContent, private envelope only in `_meta`; no model save fallback. Return sanitized isError for rejected calls without swallowing committed receipt state.
- [ ] Serve only registered versioned HTML with empty external connect/resource/frame domains, and retain existing compatible metadata aliases used by actual clients. Keep ingress authorization/discovery routes unchanged. Do not bump the diagnostic contract package label to match a new artifact.
- [ ] Pass protocol/dispatcher tests and scoped analyzer; inspect resource-unavailable and no-UI-client behavior. Obtain both reviews; commit exact task paths.

### Task 5: Three-field custom App and truthful host recovery

**Files:** Create `salesforce-native/ui/opportunity-edit/{app.js,controller.mjs,view.mjs,index.html,preview.js,preview.html}`; `scripts/build-opportunity-ui.mjs`; StaticResources `CardstackOpportunityEditUi` and `CardstackOpportunityPreviewUi` with `.resource-meta.xml`; `tests/opportunity-ui.test.cjs`; update package staging test only as needed for these resources.

**Interfaces:** `view.mjs` exports `renderOpportunity(root, model, onIntent) -> disposeFunction`; `controller.mjs` exports `mountOpportunity(app, document, options) -> controller` with `dispose()`; `model` carries checked View plus local draft/status only. `onIntent` emits `start`, `review`, `back`, `cancel`, `confirm`, `resume`, `refresh`; only controller has private closure handles. Builder accepts `--dependencies EXISTING_NODE_MODULES` and verifies SDK 1.7.4, producing both self-contained bundles from shared view.

- [ ] Write `threeLiteralFieldsSubmitTogether`, `amountNeverBecomesJsNumber`, `backRetainsDraft`, `recordSwitchDropsOldAuthority`, `lateReplyCannotEnableConfirm`, `lostSaveResponseShowsUnknown`, `savedRefreshFailureNeverRetriesWrite`, `reloadResumesAcceptedState`, `teardownIgnoresResponses`. Assert Stage exact API value, date string, Amount `12500.25` string, explicit clear and zero; confirm uses only current grant/revisions. Mock host deny versus timeout after dispatch as distinct failures.
- [ ] Run `node --test salesforce-native/tests/opportunity-ui.test.cjs` and establish failure, then implement the plain-DOM view with copied/adapted existing card/control/diff concepts. No legacy DTO casts or floating-point coercion.
- [ ] Implement handlers before App.connect, identity/request-generation correlation and closure-only credentials. Editing → preparing → review → saving → receipt or unknown outcome are distinct local states. Disable confirm until validated current review exists; Unknown offers Resume/status before exact-request retry, never a fresh write. Server-accepted drafts resume from original result `_meta`; unsent keystrokes may be lost. Expired/stale review cannot auto-enable save.
- [ ] Add stacked responsive controls, field labels, keyboard/focus and aria-live status. Review shows server diff only; return/back invalidates local grant. Display current inactive Stage separately. Render all text safely; show receipt distinct from refreshed automation/current values. Optional model context failures do not change save outcome.
- [ ] Build with `node salesforce-native/scripts/build-opportunity-ui.mjs --dependencies /Users/danielben-atar/Re-headed-crm/packages/widgets/node_modules`. Validate no external requests/imports, matching MIME/hash/CSP, no tenant data/secrets and reproducible resource contents. Run UI tests and controlled-browser keyboard/narrow viewport/reload/late-reply tests. Gate Task 1 must have passed before this task.
- [ ] Obtain both reviews; commit only authored UI, builder, generated resources and tests. Local controlled browser is not actual Claude/ChatGPT acceptance.

### Task 6: Native Studio preset and shared synthetic preview

**Files:** Modify native `lwc/cardstackObjectConfig/{cardstackObjectConfig.js,cardstackObjectConfig.html}`; create `lwc/cardstackOpportunityPreview/{cardstackOpportunityPreview.js,cardstackOpportunityPreview.html,cardstackOpportunityPreview.js-meta.xml}`; modify `Apex/CardstackStudioController.cls`/test for preset validation; create `tests/opportunity-studio.test.cjs`; extend `tests/layout-builder.test.cjs`.

**Interfaces:** Existing layout actions keep `type=record-edit`; Opportunity requires the exact three ordered `{fieldApi,source:'current'}` mappings. Studio and ActionPolicy use the same constraints. Preview child receives sanitized layout fixture, loads `CardstackOpportunityPreviewUi` through imported StaticResource URL and renders the shared Task 5 view. Preview has no App bridge or private keys; no CRM transition tool can be called.

- [ ] Write `opportunityPresetIsExactAndOrdered`, `missingOrReadonlyFieldBlocksPreset`, `draftDoesNotAffectLaunch`, `accountMappingsRoundTripUnchanged`, `sharedPreviewHasNoExecutionAuthority`, `unknownLayoutMetadataSurvivesSave`. Assert label/enabled state survive save/reload, invalid constants/extra fields fail server publication, fixture clearly says preview.
- [ ] Run `node --test salesforce-native/tests/opportunity-studio.test.cjs salesforce-native/tests/layout-builder.test.cjs`; establish red assertions and implement only the scoped action/preview surfaces in the large existing component.
- [ ] Add native preset picker and fixed current-value inputs. Apply ActionPolicy validation on draft save and publication without changing unrelated stored mappings. Keep server launch checks independently enforced. Missing field exposure/write flags produce specific authoring errors; drafts cannot create executable buttons.
- [ ] Preview uses a sandboxed `allow-scripts` iframe with no same-origin permission and the separate preview entry. On load, parent sends sanitized synthetic fixture/layout only; preview accepts messages only from its actual parent, parent accepts replies only from its iframe. No secrets/private CRM values; no dangerous HTML. Preview simulates edit/review states via shared view; Save is visibly disabled. The preview flag cannot bypass server authority because it never reaches a tool.
- [ ] Pass scoped tests/analyzer and authorized live Studio keyboard/save/reload/stale-draft/publish/rollback tests when scope exists; record local-only evidence otherwise. Obtain both reviews; commit exact owned paths.

### Task 7: Integrated tests, actual clients and fresh-install acceptance

**Files:** Create `salesforce-native/docs/OPPORTUNITY_CUSTOM_UI_QA.md`, new owned `docs/evidence/opportunity-edit/` safe receipts and `tests/opportunity-integration.test.cjs`; create `Apex/CardstackOpportunityEditIntegrationTest.cls`/metadata. Update owned task ledger/final review only; preserve existing dirty documentation/evidence.

**Interfaces:** Consume Tasks 1–6 unchanged. Publish separate source/artifact/client/revision/actor-match/cleanup evidence; never reuse synthetic transport Pass as CRM edit Pass.

- [ ] Write integration tests for full start/review/confirm/replay path, private-object direct CRUD denial, removed CRM/config rights, unknown operation/state kinds, inherited Account regressions and malicious IDs/field payloads. Run red assertions; add only integration fixes through reviewed owning task scopes.
- [ ] Run `CARDSTACK_UI_DEPENDENCIES=/Users/danielben-atar/Re-headed-crm/packages/widgets/node_modules node --test salesforce-native/tests/*.test.cjs`, scoped Code Analyzer and complete authorized dev-org Apex suite. Require fresh completed counts; document baseline High Studio findings separately from new findings. Use verification-before-completion; do not call no-op lint evidence.
- [ ] Prepare a concrete QA bundle naming disposable org, two owned client apps/connections, minimum user permissions, two sales processes/record types, fixture records/config, new unreleased package, deploy steps and cleanup. Capture private baselines and obtain required authorization before any live mutation. Old deleted scratch org is not an available target. Do not alter original beta/apps/connections.
- [ ] Fresh package creation uses API 67, actual coverage gate and authorized Dev Hub; fresh install and full installed Apex suite. Independently verify package source identity, provider ordinary-user behavior and private-state permissions. Test upgrade/contract drift and permissions removed after review/completion against this exact artifact. Package creation is not promotion.
- [ ] In each actual client separately: discover/open card → click preset → submit three literals → read-only review and independent unchanged read-back → confirm → independent exact save/audit/receipt → refreshed card. Prove zero/decimal/clear, invalid-input correction, Back, Cancel, no-op, Stage fidelity, expired/stale/config-changed review, real concurrent tabs, dropped confirmation response, reload/reconnect and refresh-only retry. Actual host-denied call remains Unknown unless directly observed; simulated denial is separate evidence.
- [ ] Record lifecycle gaps accurately: direct revoked access/refresh rejection and rotation remain independently unmeasured unless a separately approved supported test establishes them. Before production release, obtain reviewed verification or explicit acceptance of the narrower claim; full resource/audience conformance and portability remain unclaimed.
- [ ] Restore temporary configs/drafts/settings, deactivate/remove only owned resources and verify cleanup independently; deploy JWT ON. Safe evidence excludes credentials/private keys/provider logs/CRM values/IDs. Final independent spec/quality whole-branch review uses requesting-code-review; resolve feedback with receiving-code-review. No release/cutover/merge/push. Only after all relevant gates pass may report the exact accepted artifact/client scope; use finishing-a-development-branch when integration is actually authorized.

## Dependency and authorization checkpoints

Task 1 defines Types/Stage/Selector/Domain; Task 2 depends on 1, Task 3 on 2, Task 4 on 3, Task 5 on 4 and live Stage gate, Task 6 on 2/5, Task 7 on all. Use sequential task dispatch for shared files. Fresh spec and quality reviewers do not implement their reviewed task. Controller dispatch may use up to three available worker/reviewer slots but never parallel writes to shared files.

Plan approval permits source implementation under this workflow. It does not approve live setup, package builds, deployment or business-record writes; workers may prepare those concrete bundles and stop at the relevant authorization checkpoint. Failure of Stage/live/security gates cannot silently weaken scope or switch hosting. A successful Opportunity milestone does not retire all HXL surfaces.

## Self-review and handoff

Coverage: spec §1/3 → Tasks 5–6; §2 → reuse boundaries and all tasks; §4 → Tasks 2/6; §5 → Task 1; §6 → Tasks 2–4; §7 → Tasks 3/5; §8 → Task 7. All five Review Focus conditions have explicit owning tests. Types/signatures/tool names/resource contracts match across tasks. Retention is explicitly distinguished from diagnostic cleanup; live evidence and source tests remain separate. No implementation steps executed while preparing this plan.

User approved this plan before Task 1 dispatch. Preserve the selected subagent-driven execution method and explicit live-action gates.
