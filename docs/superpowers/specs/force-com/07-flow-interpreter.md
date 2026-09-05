# Session 7 — Screen-flow interpreter

**Goal:** the NATIVE rung on-platform — a screen flow renders and runs inside
the chat, writes pause at a confirmation diff, and the kitchen-sink test flow
completes end to end. Quick actions ship as the single-screen sibling. This
is a launch requirement; it is last only because it is the biggest port.

## Deliver

- **`FlowCapabilities.cls`**: the port of `flow-capabilities.ts` — every
  element type and screen component mapped to interpret / confirm /
  transparent / degrade with an admin-facing note. Single source of truth.
- **`FlowAnalysis.cls`**: `analyzeFlowSupport(definition)` → support level
  (full / partial / handoff) + blockers. Surfaced on the Flows page as a
  column and a per-flow detail popover ("degrades at screen 3: custom
  Lightning component `c:foo`").
- **`FlowDefinitions.cls`**: list from `FlowDefinitionView` (regular sObject,
  never Tooling), fetch a version's definition via Tooling API through
  `OrgApi` (runtime) or the `MCPforce_Self` Named Credential (Studio),
  Platform Cache memo keyed by version id, 60 s. Treat explicit JSON `null`
  value slots as absent (`{stringValue: null, booleanValue: true}`).
- **`FlowFormula.cls`**: port of `flow-expressions.ts` (`evaluateFormula`
  with the same function set and the same `{ok,value}|{ok:false,reason}`
  result).
- **`FlowInterview.cls`**: port of `flow-interview.ts` — `start(flowApiName,
  inputs)` and `continue(state, answers, confirmWrite, back)` returning a
  `FlowStepResult` (screen / pending write / finished / handoff). Screens,
  decisions, assignments, record lookups (SOQL as the rep, capped rows),
  loops, collection processors, formulas, visibility rules, data tables,
  choice sets, record-choice lookups. Writes execute as the rep's DML only
  after `confirmWrite` with a verified token. Unsupported elements degrade
  to handoff mid-interview with the reason in the tool text and the audit
  trail.
- **State token**: same frame-stack shape as `FlowInterviewSession`,
  base64 JSON signed by `ConfirmationSigner`; `pendingWrite` lives inside
  it, which is the confirmation gate for flow writes (hard rule 8).
- **Tools**: native branch of `crm_flow_start` / `crm_flow_continue` /
  `crm_flow_cancel` (mode `auto` picks native when analysis says full or
  partial, `native` forces it, `embedded` stays a stub that degrades to
  handoff as today); `crm_quick_action_start` plus token-shape routing in
  `crm_flow_continue`.
- **Quick actions**: `QuickActions.cls` — describe via
  `/quickActions/{name}/describe` (not under `/sobjects`), map the
  mini-layout to `FlowRenderScreen`, relax required for `defaultedOnCreate`
  fields and hide defaulted references, execute via
  `POST /quickActions/{name}` with layout fields only.
- **Test metadata**: deploy `unpackaged/main/default/flows/Test_Screen_Flow`,
  `Test_Sub_Flow`, `Test_Kitchen_Sink` (moved from `salesforce-metadata/`
  in Session 0) to the scratch org; Apex tests load
  `packages/core/src/__fixtures__/test-screen-flow.json` as a static
  resource fixture so the interpreter is unit-tested offline against the
  real captured definition.

## Out of scope

Embedded rendering (the `embedded` mode remains a stub), custom screens,
managed-package flows (labelled handoff-only, by design).

## Read first

- `docs/flow-rendering-spike.md` — decisions and gotchas; do not relitigate the approach.
- Memory note `flow-native-rendering-spike` — the same gotchas plus quick-action ones.
- `packages/core/src/flow-capabilities.ts`, `flow-analysis.ts`, `flow-expressions.ts`, `flow-interview.ts`, `quick-action.ts` — port these, in that order.
- `packages/core/src/flow-interview.test.ts`, `flow-interview-elements.test.ts`, `flow-kitchen-sink.test.ts` — port these tests; they are the acceptance bar.
- `packages/widgets/src/flow-run/` — what the widget expects; it does not change.
- `design/README.md` ids 10a, 10c, 11c/11d (rendering ladder).

## Acceptance

- In Claude: start `Test_Kitchen_Sink` from a record card action; every
  screen renders in the flow-run widget; the Create Records step shows a
  confirm diff; confirming writes the record as the rep; the finished
  state shows; the audit entry records the write as confirmed.
- The Flows page labels `Test_Screen_Flow` full, a flow with a custom
  Lightning component partial, and an installed flow handoff-only.
- Apex tests: the ported kitchen-sink and element tests pass; a tampered
  state token is refused; a step exceeding the SOQL budget degrades to
  handoff rather than throwing; quick-action execute sends only layout
  fields.
