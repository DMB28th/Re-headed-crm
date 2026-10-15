# Lookup and Salesforce-in-AI coordination

October 14, 2026. This integration chat owns combined source, contract decisions,
native deployment and actual-client acceptance. The user requested parallel
subagents for lookup and the experience inside AI. Agents work in this chat's
team; existing user-owned chats are not messaged or given separate deployments.

## Baseline and boundaries

- Persistent integration org: `cardstack-spike2`, API 67.0.
- Integration checkout: `mcp-apps-delivery-proof/Re-headed-crm`, branch
  `codex/cardstack-integration`; initial HEAD `f6eebd1`.
- Deployed application source: `8f1b138`. Current documentation changes and
  configuration publication do not constitute a new application deployment.
- Lookup checkout `dynamic-lookup/Re-headed-crm` is preserved. Its UI coverage
  does not establish a working native eligibility provider.
- Keep one renderer, controller, native save lifecycle and deployment owner.
  Preserve working host connections and deployment JWT ON.
- Five pre-existing dirty files remain untouched. No production, org creation,
  new authentication or undocumented Salesforce runtime endpoints are in scope.

## Parallel ownership

| Workstream | Owner | Output | Dependency |
| --- | --- | --- | --- |
| Native lookup search and selected-ID eligibility | `lookup_native_contract` | Official-source contract and supported provider boundary | Gates enabling reference editing |
| Picker/shared-engine reconciliation | `lookup_integration_inventory` | Exact integration points and focused verification handoff | Can inspect now; positive integration depends on native contract |
| Salesforce-in-AI experience | `salesforce_in_ai_ux` | Source/evidence-based design and acceptance criteria | Independent of positive lookup provider |
| Combined baseline, sequencing and acceptance | Root integration owner | Reconciled work and one deployed milestone | Integrates agents' outputs; agents do not deploy |

## Experience brief

Help users find the correct record through conversation, then maintain a compact,
recognizable Salesforce workspace inside the AI. Show record identity throughout
loading, editing, review and completion. Ambiguous names require disambiguation;
do not quietly treat the first match as the user's choice.

Field changes, validation and lookup results should update in place. Preserve
draft values, active control, caret and the app's scroll anchor during same-phase
updates. Phase transitions should provide deliberate accessible focus. App-owned
scroll behavior and outer chat scroll are separate acceptance obligations; do not
promise iframe code can control the host page.

Use familiar Salesforce field labels, required indicators, sections, input styles
and lookup selection. Keep the primary action obvious and reachable. Reduce
redundant navigation and status controls while retaining exact review, explicit
confirmation, cancellation, native validation and durable receipts.

## Coherent verification checkpoints

1. Establish the native provider contract, including source record/field,
   controlling values, permitted target types and exact selected-ID semantics.
   Readable candidates alone cannot authorize a reference assignment.
2. Integrate through the existing engine. Focus tests on forged selections,
   changed eligibility at confirmation, stale asynchronous results, exact value
   handling and record/actor/policy binding. Keep unsupported fields explicit.
3. Verify renderer identity, keyboard/focus/caret retention, validation placement,
   long-form action access and record-switch invalidation in a real browser.
   DOM-only tests cannot prove geometry or outer host scrolling.
4. Prepare the exact reviewed deployment artifact and run the relevant combined
   native regression once at the integrated milestone. Reuse the persistent org.
5. In actual Claude and ChatGPT, identify/open the intended record, edit, review,
   confirm, observe receipt and independently refresh/read back. Demonstrate
   ambiguous names, cancellation, invalid/obsolete selections and scroll behavior.
   Existing backend recovery and renderer stale-result tests are not substitutes
   for actual host response-loss and delayed-switch demonstrations.

## Status

The parallel investigation and experience review produced these handoffs:

- [Native lookup contract](LOOKUP_NATIVE_CONTRACT_2026-10-14.md): native DML remains
  final write authority, but field-specific suggestion and pre-Review eligibility
  need a demonstrated provider. API67 RecordUi documents picklist methods, not a
  lookup evaluator. Supported HTTP lookup suggestions are an avenue to investigate,
  with actor-preserving transport, effective controlling values and exact selection
  qualification still to prove. This is a concrete gap, not proof that lookup is
  impossible.
- [Integration inventory](LOOKUP_INTEGRATION_HANDOFF_2026-10-14.md): reusable picker
  passes 70/70 local tests and strict TypeScript. Import its component subset through
  an explicit adapter, never the old independent form controller or save engine.
- [Experience review](SALESFORCE_IN_AI_UX_2026-10-14.md): preserve one compact record
  workspace, its identity header, configured sections and reachable action bar.
  Full DOM replacement and busy phases that remove the form are concrete continuity
  risks. Historical screenshots establish tall forms, not outer-host scroll jumps.
- [Acceptance handoff](LOOKUP_AND_AI_UX_ACCEPTANCE_2026-10-14.md): separate backend,
  renderer/browser and actual-host evidence, reusing existing checks for existing
  risks and adding coverage only for distinct missing behavior.

## Recommended sequence

Build the persistent workspace against the current configured ten-field Lead
scenario, retaining the existing governed lifecycle. Verify in-place validation,
loading, Review/Back/Confirm, receipt and fresh read in both actual hosts. Keep
Opportunity and Contact as regression fixtures. Lookup provider qualification can
proceed alongside this work; it must not delay supported-field UX improvements.

Natural name-based resolution is a separate read capability: the custom Open
requires a known ID, and the legacy resolver chooses the first of several matches.
Resolve that gap explicitly with authorized discriminators and user choice before
calling known-ID Open. General record discovery and reference-field selection are
different contracts even though both involve finding a record.

Enable reference editing only after its positive native contract is qualified,
then connect the reusable picker to this same workspace. Do not promote generic
target Name search or a client selection into field-specific authority. Native
save-time rejection remains final protection, not a substitute for the promised
pre-Review qualification. Any new credential/access configuration must be prepared
concretely before a genuinely new external-action approval is requested.

This checkpoint changes documentation only. It does not enable lookup, deploy new
UX, or establish new actual-host acceptance. All implementation goes through the
single integration owner and one coherent verification milestone per delivered
scope, with focused development checks and broader repeats only when justified.
