# Studio Scenarios and Field Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax for tracking.

**Goal:** Configure and maintain another editing scenario in Studio and use native picklists/typed strings through the existing shared engine in both hosts.

**Architecture:** Extend native capability/provider and strict shared DTOs first, then connect existing visual authoring to that frozen eligibility contract and add action maintenance. Root alone integrates, deploys and verifies actual screens.

**Tech Stack:** Salesforce Apex/LWC API67, existing plain-DOM renderer and MCP Apps SDK1.7.4, existing offline builds/checkpoint tooling.

**Spec:** ../specs/2026-10-13-studio-scenarios-field-types-design.md

## Global Constraints

- Authoritative integration checkout and branch: mcp-apps-delivery-proof, codex/cardstack-integration; application baseline b582651 and documentation baseline05d1536.
- One renderer/controller/native save lifecycle; Salesforce sharing, CRUD/FLS, USER_MODE DML, confirmation, audit and receipts remain authoritative.
- Explicit schema4/process record-edit/v3/capability record-current/v3; retain schema3 record-current/v2, schema2 Contact and schema1 Opportunity interpretation.
- Add independent single-select Picklist, Email, Phone, URL only. Dependent/multiselect/reference/Percent/DateTime/Time/compound/rich text remain unsupported.
- Exact record values load; null stays null, retired current values unchanged only, native labels never write authority.
- Preserve five original predirty files, all worktrees and private failure/evidence archives. Source workers do not deploy, mutate org/auth, browse or spawn agents.
- Persistent cardstack-spike2 API67 only; existing auth/connections and deployment JWT ON preserved. Root alone prepares/publishes owned QA configurations and records within existing approvals.

## Review Focus

1. Actual record type versus actor default and source record/metadata drift after Review: provider and lifecycle tests reject stale authority.
2. Retired/null picklist values and labels resembling API values: unchanged stays unchanged, forged/new invalid sets reject.
3. Historical schema3 completed/pending state: receipt replay retained and old state cannot gain new fields/types.
4. Existing-action Edit/Cancel and object switch: identity/unknown properties preserved, no unintended staging or stale editor overwrite.
5. Native eligibility versus synthetic preview: disabled preview cannot grant execution and unsupported descriptors remain rejected.

## Task 1: Expand the shared native capability and renderer contract

**Files:** Create CardstackNativePicklistProvider.cls and test/metadata pairs plus a small native context helper only if needed. Modify force-app/main/default/classes/CardstackRecordScreenCapability.cls, CardstackOpportunityEditTypes/Service/Repository/WriteService/WriteAudit.cls where version/context handling requires it; ui/opportunity-edit/fields.mjs and record-contract.mjs. Relevant existing capability/service/repository/writer/adapter tests and tests/record-ui.test.cjs/record-fields.test.cjs. Extend scripts/record-editor-checkpoint-inventory.json for reviewed new components/methods, but do not remove original ordinary test identities. Do not edit Studio files in this task.

**Interfaces:** The generic resolveDefinition(Id,String)/resolveDefinition(StoredState), readContext, describeFields and canonicalize remain the shared entry points. New provider resolves verified canonical object/actual native record-type context and requested independent picklist fields to bounded literal choices and fingerprints through one ConnectApi.RecordUi native collection; no input default, global Describe fallback or second save. Definition carries provider/record-type freshness privately. Public FieldView continues exact value/API choices; native typed strings use EMAIL/PHONE/URL. Public schema stays strict record-card/v1/record-edit/v1, expanded admitted types; private persisted interpretation is schema4. Existing Stage provider remains specialized.

- [x] Add focused failing tests: two fields/types with disjoint choices, actor-default mismatch, malformed/missing/dependent provider responses, retired unchanged/null/clear, metadata/type drift after Review, typed-string length/exactness, historical schema3 replay and forged public choice payloads. Capture runnable local RED; do not call unexecuted native source tests GREEN.
- [x] Implement provider and versioned context restoration in the existing engine. Fetch/bind from authorized record identity and re-fetch after locked Confirm. Preserve atomic audit/receipt and repeat-safe completion.
- [x] Extend shared field registry/strict generic DTO decoding for types and choice controls without adding a renderer/controller. Run focused local renderer checks, self-review and focused analysis; native qualification belongs to root's consolidated checkpoint.
- [x] Commit only owned files, report concrete commands/results and freeze the runtime/Studio eligibility descriptor for Task2. Keep native tests and actual non-Master behavior explicitly unexecuted until qualified.

## Task 2: Maintain scenarios in existing Studio authoring

**Files:** force-app/main/default/lwc/cardstackObjectConfig/{js,html,css}; cardstackRecordAuthoring/cardstackRecordAuthoring.js; cardstackOpportunityPreview where strict preview delivery requires it; ui/opportunity-edit/view.mjs for unchanged picklist display after validation. Existing tests/record-authoring.test.cjs, studio-authoring.test.cjs and studio-editor-refresh.test.cjs. Extend native Studio/Config tests only for a distinct authoring/publication risk.

**Interfaces:** Consume Task1's versioned eligibility descriptor; eligible independent Picklist/Email/Phone/URL fields use current-value mappings and existing staging/publication APIs. Existing native candidate validation remains authoritative. Public preview FieldView uses explicit synthetic choices/values and disabled Save, never a caller-defined execution provider.

- [x] Add failing focused tests for Edit preserving action name and retained properties while changing ordered mappings/label, Cancel preserving state, stale object-switch edit context, legacy Account/specialized Stage safety, and native eligibility/denylist intersection across Add/Edit/Save.
- [x] Reuse the current new-action form for Edit/Update with explicit mode/Cancel; preserve selected identity and avoid new configuration/storage/publication services.
- [x] Extend descriptor/preview allowlists for Task1 types, with clearly synthetic picklist examples. Fix only authoring saved/readiness issues directly encountered in this milestone; preserve unrelated drafts and fields.
- [x] Preserve visible current picklist selection after validation rerender for keep, without adding it to submitted changes; explicit clear and retired unchanged-only semantics remain exact.
- [x] Run focused authoring/preview checks, self-review and commit owned changes. Root reviews the coherent task once, with scoped fix reviews only for material findings.

## Task 3: One integrated deployment and actual authoring-to-host checkpoint

**Files:** generated staticresources and existing UI demo fixtures via scripts/build-opportunity-ui.mjs; checkpoint inventory/preparation as required; native milestone runbook/report and product feedback. Root owns all org/browser actions.

**Interfaces:** Existing prepare-record-editor-checkpoint.py with spike2-retained-tests/v1 overlay; API67 immutable root ZIP and exact ordinary test inventory. Existing native Setup/host connections, Studio exact-review publication, generic Open and shared edit lifecycle.

- [x] Build shared resources using already-installed SDK1.7.4; run one relevant complete local regression after integration. Get one whole-change review and resolve material findings together.
- [x] Prepare immutable exact artifact, preserve native before-state, then run atomic qualifying deployment with RunAllTestsInOrg/default rollback in cardstack-spike2. Inspect every expected ordinary identity, errors/coverage and independent retrieved source/semantics before acceptance. No redundant broad reruns without a relevant change/failure.
- [x] Native/API alternative while Mac locked: prepare the owned Lead through real native metadata; stage/review/publish exact configuration via the existing controller, complete 43 live MCP checks, then publish/verify changed label/order/membership without code/deployment changes. This is not Studio clicks or actual-host acceptance.
- [x] Use current native eligibility to prepare owned Lead fixtures without grants/schema changes. Configure sections/fields/write policy/action entirely through actual Studio in the user-authorized in-app browser; review and publish only exact owned draft.
- [x] Actual Claude and ChatGPT: open Lead, existing choices/strings, invalid choice/length where practical, Cancel, valid multi-field Review/Confirm/receipt/Refresh. Independent record/audit readback; preserve old working connections.
- [x] Edit published action membership/order/label through Studio and publish exact review, then verify changed screen without code/deployment changes. Include focused Opportunity/Account smoke for affected shared runtime.
- [x] Save verified native deployment/source/API results and product feedback; preserve all original configuration/drafts and private failure/evidence archives. No new clean-install org, production change or package release.
- [x] Save actual Studio/Claude/ChatGPT screenshots and native-readback evidence in the October14 checkpoint.

## Authorization and execution

The user selected priorities1/2 and said full permission to scope and build while going to bed. Root makes and records the concrete design/plan decisions within the existing persistent integration scope; no repeat approval handoff is required for these delegated choices. Subagent-driven execution remains selected. New security-sensitive external access outside this scope still requires concrete action-time approval.

## October 13 checkpoint

Application `8f1b138` is deployed to `cardstack-spike2`: 808/808 native tests,
90.38% coverage, and 329/329 retrieved files verified. Unchanged UI/Studio assets
retain the 435/435 local result. Live Lead API acceptance passed 43 checks with one
save and one audit; configuration-only maintenance passed seven checks with no
additional save. Five original configurations and five original drafts are unchanged.
Failed checkpoints and captures remain preserved.

Actual new Studio/Claude/ChatGPT checks remain blocked by the locked Mac. Leave
those checkboxes open and keep prior `b582651` host evidence separate. Live record-type
proof is Master-only; regression fixtures cover other contexts. See the
[milestone report](../../CARDSTACK_CONFIGURABLE_SCENARIOS_2026-10-13.md).


October14 actual-client checkpoint: the user authorized another browser while using
Chrome. In-app-browser Studio/Claude/ChatGPT checks completed; one eight-field save
and audit per host, native readback, validation/cancellation and refresh verified.
Actual Studio published ten-field membership, label and layout changes; ChatGPT
rendered them without a deployment. Five original configs/drafts are unchanged.
The superseded owned draft was rolled back natively; GUI discard is not proved.
Host network-loss, delayed-record-switch fault injection, non-Master live contexts
and lookup remain separate limits. See the updated milestone report.
