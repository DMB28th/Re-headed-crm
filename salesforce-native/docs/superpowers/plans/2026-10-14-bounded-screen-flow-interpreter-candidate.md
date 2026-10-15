# Bounded Screen Flow interpreter candidate implementation handoff

> **For agentic workers:** Once the written spec and this candidate sequence are approved, use `superpowers:subagent-driven-development` task-by-task with distinct specification and quality reviews. This is a preparation artifact, not approval to execute.

**Goal:** Compile a published two-screen Salesforce metadata process, navigate it in the existing chat workspace, and confirm one exact current-record update through the existing shared lifecycle.

**Architecture:** Metadata acquisition supplies an immutable validated normalized plan. A pure Apex engine owns scalar resources and screen checkpoints; root-owned service/repository/capability seams expose projected screens and reuse the existing atomic writer, audit, receipt and recovery. Browser adapters use existing controls and send only current-screen answers and private handle/revisions.

**Tech stack:** Salesforce Apex / API 67.0; existing native policy and private interaction objects; existing self-contained MCP Apps renderer/SDK and native Studio. No retired Node runtime or external service.

**Spec:** `salesforce-native/docs/superpowers/specs/2026-10-14-bounded-screen-flow-interpreter-design.md`

**Related acquisition:** `salesforce-native/docs/FLOW_METADATA_ACQUISITION_CONTRACT_2026-10-14.md`

## Global constraints and owner gates

- Salesforce-only runtime; API 67.0; actor sharing/CRUD/FLS and published-policy intersection.
- Exactly one terminal CURRENT_RECORD update; no trial DML, nonterminal effects, create/delete or object-specific writer.
- Bounds: 64 KiB plan, 32 nodes, 8 screens, 20 screen inputs, 40 scalar resources, 4 region levels, 8 predicate atoms, 20 terminal fields, 32 automatic nodes/request, 16 KiB arguments, 32 KiB private state, 15-minute absolute expiry.
- Schema/plan/compiler/publication/rights/freshness drift fails closed according to the spec; external native active-version changes never mutate the pinned published imported plan.
- Preserve existing persisted schemas 1–4, archived resources/recovery, existing editor and five pre-dirty documents.
- Root approves/owns shared writer/controller/repository/types/schema integration and commits; metadata worker owns acquisition/compiler contract. Interpreter worker initially owns new pure engine/types/tests only after the written review gates are accepted.
- No org mutations, auth grants, new org, external hosting, token extraction, deploy or actual-host QA from this candidate handoff. Native acquisition transport and a real qualifying Flow are still open gates.

## Review focus

1. Required Boolean false and empty String/default/null/hidden value have different presence semantics; pure tests pin these distinctions.
2. Back into a different branch discards downstream inputs/computed state rather than saving obsolete answers; checkpoint tests pin replay.
3. A Flow update cannot select another record or use record-edit mappings as an authorization shortcut; service and terminal-capability tests pin this.
4. Unsupported semantic properties in unreachable nodes still block start; compiler tests pin complete-source validation.
5. Same-screen reveal and interrupted navigation cannot turn the browser into a visibility/cursor authority; adapter/server tests pin stale revisions and projected controls.

## Task 1 — Compiled plan contract and strict compatibility

**Owners:** metadata worker for acquisition/normalization; root for publication. No interpreter engine begins before this produces a trustworthy plan.

**Candidate files:** new `force-app/main/default/classes/CardstackFlowPlan.cls`, `CardstackFlowCompiler.cls`, `CardstackFlowCompatibilityReport.cls`, corresponding API-67 metadata and focused tests; metadata worker confirms names before authoring.

**Produces:** `CardstackFlowPlan.Plan`, `CardstackFlowCompiler.compile(String rawMetadata, CardstackFlowPlan.Identity trustedIdentity) -> CardstackFlowCompiler.Result`. Result contains either Plan plus source/plan hashes and compatibility report, or blocking issues. Plan schema `cardstack-flow-plan/1`, compiler `cardstack-flow-compiler/1`; typed nodes/resources/operands/readSet/writeSet and canonical encoding as defined by acquisition contract.

- [ ] Write compiler tests using future Salesforce-shaped raw metadata, not a hand-built normalized plan. The two-screen fixture compiles; duplicate identifiers, dangling connector, missing entry, unknown semantic property, unreachable upload, context/input shadowing, graph cycle, collection, numbered predicate logic, nonterminal update, alternate-target filter and system-mode declaration all block with stable path/code.
- [ ] Add canonical hash tests for semantic order, sorted map keys, numeric literal representation, null/empty padding, non-ASCII text and publication-envelope exclusion. Native/source hashes cannot rely on Python/JS formatting accidentally matching Apex.
- [ ] Run focused `sf apex run test --tests CardstackFlowCompilerTest --target-org cardstack-spike2 --wait 10 --result-format human` only in a separately authorized deployment/test scope; initial absence fails compilation, implementation then passes. No live source support verdict is inferred from synthetic tests.
- [ ] Implement strict typed compilation and review its allowed-property table against acquired API-67 shapes. Runtime schema authority comes from published plan storage, never browser input.
- [ ] Root reviews publication trust/freshness and native acquisition transport separately before integrating Studio publish. Commit only after scoped review.

## Task 2 — Pure scalar interpreter and checkpoint semantics

**Owner:** interpreter worker after spec and interface approval; no existing source files changed in this task.

**Candidate files:** new `CardstackFlowTypes.cls`, `CardstackFlowEngine.cls`, `CardstackFlowEngineTest.cls` and API-67 metadata; test data reads an explicitly synthetic raw-metadata fixture through Task 1 compiler. The existing JSON acceptance artifact is a behavior oracle, not an executable plan.

**Consumes:** Task 1 `CardstackFlowPlan.Plan` and compatible compiler result.

**Produces:** exact candidate signatures to freeze with root before coding:

```apex
CardstackFlowTypes.EngineState CardstackFlowEngine.begin(
    CardstackFlowPlan.Plan plan, CardstackFlowTypes.TrustedContext context);
CardstackFlowTypes.EngineResult CardstackFlowEngine.apply(
    CardstackFlowPlan.Plan plan, CardstackFlowTypes.EngineState state,
    List<CardstackFlowTypes.Answer> answers, String operation);
CardstackFlowTypes.ScreenProjection CardstackFlowEngine.project(
    CardstackFlowPlan.Plan plan, CardstackFlowTypes.EngineState state);
List<CardstackOpportunityEditTypes.FieldChange> CardstackFlowEngine.terminal(
    CardstackFlowPlan.Plan plan, CardstackFlowTypes.EngineState state);
```

`Answer={inputId,operation,value}`; EngineState contains server-only node/resources/checkpoints/visible input IDs; TrustedContext contains immutable current-record scalar snapshot and trusted bindings; EngineResult contains next private state, public projection, errors and terminal proposal flag. Types reject unknown keys on wire/state ingestion; engine trusts only already validated typed Plan. No engine SOQL/DML/clock/current-user calls.

- [ ] Add `twoScreensNoEffectUntilReview`, `falseIsPresentBoolean`, `defaultEvaluatedOnce`, `hiddenRequiredOmitted`, `hiddenAnswerRejected`, `backDropsDownstreamBranch`, `backHonorsMetadata`, `contextAndComputedInjectionDenied`, `typedPredicateNoGuess`, `decimalDateChoiceStrict`, `noChangesTerminal`, `cycleDefenseAndStepBudget` tests with exact assertions from the acceptance oracle.
- [ ] Add a presence test: hidden input propagates HIDDEN/ABSENT through SET and is omitted from terminal patch; explicit allowed clear is distinct and produces null. A null-sensitive decision uses its effective null but cannot regain a stale value.
- [ ] Run focused Apex class tests in the authorized test scope and confirm expected failing tests before the engine exists. Implement bounded traversal, scalar coercion, predicate evaluation, first-entry defaults, visibility and checkpoints; rerun only this class and compiler dependencies after changes.
- [ ] Compare `Limits.getQueries()/getDmlStatements()` around pure engine calls for a 1-node versus 32-node fixture; both deltas remain zero. Assert size/step/depth boundary errors rather than truncation.
- [ ] Distinct spec/quality review confirms no legacy frames/runtime/effect executor and no per-object logic; root commits reviewed isolated files.

## Task 3 — Durable state and shared terminal lifecycle

**Owner:** root integration; interpreter worker supplies engine types and test fixtures, never edits shared sources concurrently.

**Modify:** `CardstackOpportunityEditTypes.cls`, `CardstackOpportunityEditRepository.cls`, `CardstackRecordScreenCapability.cls`, `CardstackOpportunityWriteService.cls` under root's agreed seam; new `CardstackFlowService.cls` and adapter chosen with root. Preserve historical schema codecs and exact current routes.

**Produces:** `CardstackFlowService.start(String client, Id currentRecordId, String actionName)` and `transition(String client, CardstackFlowTypes.TransitionRequest request)` returning a versioned Flow envelope. Request has `interactionKey`, `operation`, `expectedRevision`, current-screen `answers` only for Next/Answer, and reviewRevision/reviewGrant only for Confirm. No caller plan/cursor/record on transition.

- [ ] Add service/repository tests rejecting alternate actor/client/record/context/cursor/graph/field/computed key, unknown property, absent expected revision, oversized arguments/state and unregistered family. Old persisted states still restore under exact old codec; corrupt new family fails closed.
- [ ] Add Start/Next/Back/Cancel/Resume tests proving only private state DML; `crmUpdateAttempts` stays zero before Confirm. Rollback/state persistence failures cannot leak a live grant or move the accepted cursor.
- [ ] Implement distinct schema-5 screen-flow state codec and root-approved terminal capability adapter: compiled Flow update fields intersect native Describe and published field policy; no impersonated record-edit action. Existing providers/canonicalize form the terminal reviewed patch.
- [ ] Add exact grant binding tests for plan/source/publication/compiler/schema/Flow-state digest, policy/setup/freshness/provider/currency and review revision. Back/correction/Cancel/publication/rights change/expiry revoke old authority. Resume of Review may rotate the exact grant/review revision but never approve altered values.
- [ ] Integrate root-approved reviewed-context seam into the existing shared USER_MODE writer. Tests assert one complete CRM update plus required audit/receipt, rollback on either persistence failure, exact receipt replay after duplicate Confirm, no write on lost-response Resume, and noChanges has no update/grant.
- [ ] Test atomicity/concurrency consistent setup → interaction → confirmation → record order; run targeted shared writer/repository regressions, not the entire native suite after every pure edit. Complete native suite remains the later release gate.

## Task 4 — Shared workspace Flow projection and navigation

**Owner:** root editor/controller integration; metadata/interpreter workers provide strict DTO and projection examples.

**Modify:** existing `ui/opportunity-edit/{fields,layout,view,workspace,controller,adapters}.mjs` only as root coordinates; new strict Flow contract adapter. No separate Flow form renderer or record-specific controller.

**Public Flow view:** `contractVersion='screen-flow/v1'`, existing authorized record header/status/revision/expiry/diff/errors/receipt, `screen={label, inputs, sections, plainTextBlocks, navigation:{canNext,canBack,canCancel}}`. Inputs carry inputId and checked scalar descriptor; private handle/grant remain `_meta`. No plan/conditions/computed resources/context.

- [ ] Add local browser contract tests for unique inputIds, allowed scalar shapes, section coverage/depth/columns, escaped DisplayText, no hidden values or private strings, invalid navigation DTO and unknown properties.
- [ ] Add controller tests: Next sends exactly current visible inputs; Back/Cancel/Resume send only required private/revision data; late prior-screen responses cannot replace a newer revision; unknown outcome requires Resume. Current workspace identity survives screen changes; heading and first-error focus move correctly.
- [ ] Reuse fields.mjs controls via inputId presentation adapter; actual CRM fields appear only in server review. Extend view with plain text blocks and server navigation without formulas or client cursor.
- [ ] If same-screen `answer` is approved, add serialized/debounced answer calls and tests for reveal/hide, partial required values and race/late responses. Otherwise expose only Next with explicit visibility-refresh copy; do not imply immediate reveal.
- [ ] Run relevant new browser tests with `node --test salesforce-native/tests/flow-interpreter-ui.test.cjs` and existing targeted renderer/recovery/fields tests. Static-resource build and native advertised artifact changes belong to root's build/review gate.

## Task 5 — Real metadata, ordinary-user and actual-host evidence

**Owner:** root only after concrete fixture/acquisition/deployment/host scopes are authorized; no approval is implied by this candidate document.

- [ ] Prove native Studio exact-version acquisition and publication through the selected supported admin route. Current CLI evidence does not satisfy this. If no qualifying existing Flow exists, return that specific fixture gap before proposing a separately authorized creation.
- [ ] Compile the real two-screen, sectioned Flow with exactly one supported current-record terminal update; record compatibility/source/plan/publication/artifact versions safely. Unsupported probe remains uncompiled rather than claiming it passed.
- [ ] Ordinary user completes Start/Next/Back/Cancel/Resume/Review; independent Salesforce read-back proves unchanged before Confirm. Confirm once, verify exact patch, required audit, receipt and refresh; repeat Confirm/reload/lost response never writes twice.
- [ ] Run actual ChatGPT and Claude separately on the exact deployed artifact: navigation, literal values, keyboard/focus/narrow viewport, disclosure, late response, unknown save recovery and failed refresh. Source/API/local tests cannot stand in for either host.
- [ ] Run scoped Code Analyzer, final complete native suite and package/install checks appropriate to the explicitly intended release. Preserve JWT/auth/runbook rules. Report evidence by boundary, not one undifferentiated pass label.

## Handoff status

Tasks are unexecuted. The engine architecture, terminal writer seam and candidate state tag are concrete review points. The initial first coherent implementation milestone is Tasks 1–4 on a synthetic raw-metadata fixture, independently reviewed before any live claims; Task 5 proves real delivery. No primitive is prepared as retained product code until root confirms the written stage approvals and owned file boundaries.
