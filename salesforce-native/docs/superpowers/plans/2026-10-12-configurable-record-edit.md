# Configurable Record Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax for tracking.

**Goal:** Support configurable Contact editing through the same Salesforce-owned custom-app lifecycle as Opportunity.

**Architecture:** Share the newer lifecycle, persistence, writer and renderer through bounded server capabilities and trusted presentation adapters. Preserve Opportunity v1 compatibility and the older Account route. New generic routes are additive and require published policy and native eligibility.

**Tech Stack:** Apex API67, LWC, plain-DOM ES modules, existing MCP Apps SDK1.7.4 and local Node build tooling.

**Spec:** ../specs/2026-10-12-configurable-record-edit-design.md

## Global Constraints

- Native package is authoritative; no retired Node/Railway runtime or dependencies.
- Salesforce sharing/CRUD/FLS/USER_MODE are authoritative; public descriptors grant no writes.
- All Salesforce identity comparisons use full checksum18.
- Private handles/grants remain closures and private MCP metadata; no DOM/storage/debug exports.
- One shared lifecycle/writer; preserve legacy Opportunity persistence/digests/replay and Account route.
- No external fixture/deploy/publication/access changes under source work.
- Preserve five pre-dirty files, original260 artifacts and all QA ledgers/failures.

## Review Focus

- Cross-family/cross-object payloads must not install another interview's authority.
- Native Boolean grammar and long current text must fail safely without silent conversion/truncation.
- Action field/order/policy or FLS drift must invalidate reviews and prevent DML.
- Migrated completed Opportunity interactions must replay the same receipt without a new write.
- New additive resource/tool wiring must remain compatible with existing Opportunity and Account clients.

### Task 1: Shared presentation adapter and generic contract

**Files:** ui/opportunity-edit/controller.mjs, contract.mjs; new record-contract.mjs and trusted adapter module(s); entry/build script and a new generic static resource with metadata; tests/opportunity-ui.test.cjs and focused generic renderer tests/fixture.

**Interfaces:** Existing mountOpportunity(app,document,options) remains. Add mountRecordEdit(app,document,options) using the same controller. Trusted adapters select strict publicView, recordId validation, fixed tools and privateMeta key. Generic record-card/v1 and record-edit/v1 carry objectApiName and bounded fields (1–20); generic Review/Completed retain descriptors and diffs must reference those fields. Generic objectApiName is Contact; the private metadata key is cardstack/recordEdit and the resource name is CardstackRecordEditUi. Opportunity contracts remain unchanged.

- [x] Write failing tests for Contact multi-field initialization, strict Boolean and clear, exact outgoing changes, Review/Confirm/receipt/refresh, cross-family rejection, checksum18 rejection, record switch/delayed reply and failed-read receipt retention.
- [x] Run focused tests and capture genuine RED.
- [x] Extract shared controller; implement strict generic projection and build-time adapter/resource without accepting runtime-controlled tool targets. Add local Contact fixture using the actual renderer, explicitly synthetic.
- [x] Run existing40-test Opportunity suite plus new generic suite; build all assets with existing dependencies; record output hashes and source/renderer boundary.
- [x] Commit only owned files and provide consolidated review package.

### Task 2: Shared native capability and execution

**Files:** CardstackOpportunityEditTypes/Service/Repository/WriteService/WriteAudit/Selector/Domain/ActionPolicy/McpAdapter, CardstackRecordActionService, CardstackMcpDispatcher and relevant existing tests; new focused CardstackRecordScreen capability/domain/selector/adapter classes and tests as needed. API67 metadata for new classes. No LWC/UI files.

**Interfaces:** Capability Definition/RecordContext/FieldChange/CanonicalPatch and transition semantics are specified in the spec. Expose additive generic open/start/transition/refresh through the same lifecycle. Preserve old public Apex signatures via thin compatibility facades where extraction requires them; no second lifecycle. Object/capability dispatch derives from server-validated record identity and pinned state, not Confirm arguments. Generic wire DTOs must match Task1 record-contract projection.

- [x] Write focused Apex tests for Contact text/Boolean/clear, noChanges, required/4096 rejection, native permissions, omitted/unpublished/duplicate/unsupported fields, injected object/field names, policy drift, freshness, wrong actor/client/capability, expiry, cancellation and replay/atomic audit failure.
- [x] Preserve existing Opportunity tests and legacy Account tests as compatibility checks; inspect pending native execution availability before claiming RED/GREEN.
- [x] Extract/share the existing process and add bounded Contact capability, strict parser, generic descriptor projection/adapter/dispatcher/resource route. Maintain legacy state interpretation and grant digest.
- [x] Run available local structural/build checks; attempt permitted analyzer tooling without installing Java/dependencies. Prepare exact early compile/test manifest and report unavailable native execution honestly when source is not installed.
- [x] Commit only owned native files and provide consolidated review package. Do not deploy to make tests executable without a concrete approved scope.

### Task 3: Studio authoring and integrated compatibility checkpoint

**Files:** lwc/cardstackObjectConfig JS/HTML and relevant tests, CardstackConfigService/Test and capability authoring validation as needed; QA/design docs and evidence receipts.

**Interfaces:** Candidate validator uses native supported field eligibility, current-only mappings and one-to-twenty bound. Runtime uses published definitions. Generic synthetic preview uses the shared renderer and Save disabled; no authority or live object reads inferred from sample controls.

- [x] Write tests for Contact preset, optional clear/Boolean, field eligibility, duplicates/order, candidate rejection and draft-versus-published distinction.
- [x] Implement authoring after native Task2 interfaces are fixed; preserve existing Account/Opportunity behavior.
- [x] Consolidate source/spec and security review across all tasks, resolve material findings once, then run relevant renderer/build/native compatibility checks once.
- [x] Prepare concrete exact Contact QA/deployment scope using existing org capacity, permissions and remaining budgets; require new approval only for genuinely new external actions. Record remaining old-host acceptance gaps separately.
- [x] Commit reviewed source and evidence. Report source, renderer, backend and actual-client results separately; no release/cutover/push/merge claim.

## Execution

The user selected autonomous execution and subagent-driven development previously and approved this strategic sequence. Contact/current-only selection is a reversible implementation decision within that scope. Continue source tasks without per-fix approvals. The private ledger is .superpowers/sdd/2026-10-12-configurable-record-edit; preserve it until required evidence is retained. Tasks1 and2 may proceed with disjoint ownership against the fixed public DTO contract; Task3 waits for Task2. Broader creation/search/multi-step capabilities are subsequent sub-projects.

## Checkpoint status

Shared presentation, bounded Contact capability, Studio authoring and consolidated source review are complete.208 local tests passed. The final API67 nonpersisting checkOnly at81e45fa passed compilation and330/330 expected regular methods, with0 setup/test/compiler failures and all12 runtime classes above75% coverage. Independent postcheck verified unchanged org source. Historic failed attempts are retained. No Contact deployment, permission grant, fixture creation, publication or actual-host acceptance is claimed. The concrete new live QA proposal is prepared separately and remains unapproved.
