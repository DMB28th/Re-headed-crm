# Screen flows in chat — rendering spike (2026-07-25)

Goal: decide how Cardstack should propagate CRM screen flows into AI chat.
Test subject: `Test_Screen_Flow` in the Contextary.ai dev org — 5 screens,
every common element type (display text, text/number/currency/date/boolean
inputs, long text area, radio, multi-select checkboxes, record-choice dropdown,
`flowruntime:datatable` over a Get Records, a decision, a Create Records).

## Approaches evaluated

| # | Approach | Verdict |
|---|----------|---------|
| 1 | **Handoff** (status quo): resolve inputs, open the flow in the CRM | Works, zero risk — but the rep leaves chat; nothing renders. Keep as the universal fallback. |
| 2 | **Native interpreter** (built in this spike): fetch the flow definition via the Tooling API, walk it server-side, render each screen in the flow-run widget | **Winner.** Proven end-to-end against the live org: all field kinds render, decisions branch, data tables carry real rows, the write pauses at a confirm diff (rule 8), state round-trips through an opaque token — server stays stateless. |
| 3 | **Salesforce flow runtime REST** (`/connect/interaction/runtime/startFlow`) | Exists (it's what `flowruntime:flowLightningOut` calls via Aura) and returns screens + `serializedEncodedState`, but it is undocumented, param shape unknown, CSRF/Aura-bound. Rejected: nothing to build a product on. The documented invocable-actions REST only runs *autolaunched* flows. |
| 4 | **Iframe embed** of the CRM's flow page in the widget | Dead: `X-Frame-Options: DENY` / `frame-ancestors 'none'`, plus sandboxed-iframe cookie isolation. The existing `embedded` stub stays opt-in for orgs that whitelist origins, nothing more. |
| 5 | **Conversational rendering** (model narrates the screen, collects answers in chat, calls `crm_flow_continue`) | Free byproduct of #2 — the tool's text mirrors the screen and the same `interviewState` token drives it. This is the degraded mode for hosts without MCP-Apps widget support. |
| 6 | Per-flow codegen widgets | Unnecessary — the generic screen model covers it with far less operational surface. |

## What shipped in the spike

- `packages/core/src/flow-interview.ts` — CRM-agnostic interview interpreter
  (screens → widget-ready field model, decisions, lazy record lookups,
  confirm-gated record creates, back navigation, base64 state token).
  Tests: `flow-interview.test.ts` runs the REAL captured definition
  (`__fixtures__/test-screen-flow.json`).
- `CrmAdapter.getFlowDefinition` / `queryRows` (optional) + Salesforce
  implementations (FlowDefinitionView → Tooling `Flow.Metadata`).
- `crm_flow_start`/`crm_flow_continue` native path (auto-falls back to
  handoff), new continue params: `interviewState`, `confirmWrite`, `back`.
- `flow-run` widget: full interview form (all field kinds incl. data table),
  confirm-write diff, finished state; "Open in Salesforce" always available.
- Bug fix: `listFlows` queried `FlowDefinitionView` via **tooling**/query —
  INVALID_TYPE, silently `[]` on every real org. It is a regular sObject.

## Gotchas learned (they will bite again)

- Tooling-API JSON writes explicit `null` into every unused value slot
  (`{stringValue: null, booleanValue: true}`) — `!== undefined` checks are
  wrong; treat null as absent.
- `sf org display` redacts tokens; `SF_TEMP_SHOW_SECRETS=true` un-redacts
  (temporary CLI workaround, will be removed).
- Installed/managed screen flows (namespaced, `manageableState=installed`) are
  invisible to Metadata retrieve AND Tooling queries — only org-authored flows
  can be interpreted. Fine: those are exactly the flows admins care about.

## Coverage build-out (second pass, same day)

The spike graduated: the interpreter is now the primary rung, governed by a
machine-readable capability registry (`packages/core/src/flow-capabilities.ts`)
that maps the FULL Salesforce Flow surface — every element type and screen
component — to one of four levels: `interpret`, `confirm` (writes), 
`transparent` (definition-level constructs), `degrade` (hands off, with an
admin-facing reason). The registry is the single source of truth: static
analysis (`flow-analysis.ts → analyzeFlowSupport`) and the runtime interpreter
both consult it, so they can never disagree.

**Interpreted now:** screens (display, all scalar inputs, textarea, radio /
dropdown / multiselect, toggle, slider, email/phone/url, name/address
composites, sections/columns, ObjectProvided basics, data tables), decisions
(typed comparisons), record lookups (eager, bounded, filter-aware),
assignments (Assign/Add/Subtract), loops, Sort/Filter collection processors,
subflows (frame stack, input/output mapping, auto-stored outputs), formulas
(bounded evaluator: arithmetic/logic/string/date + ~35 functions; unevaluable
formulas degrade, never guess), text templates, constants, variables,
custom errors, per-field **visibility rules** (same-screen rules evaluate live
in the widget; cross-screen on the server) and **validation rules** (evaluator-
checked on continue, error re-rendered on the field).

**Confirm-gated:** recordCreates, recordUpdates (id-targeted or single-record
reference; mass filtered updates deliberately degrade), recordDeletes
(degrade until CrmAdapter grows a delete surface).

**Degrade (by design):** actionCalls/Apex (run only inside Salesforce), waits,
rollbacks, transforms, orchestrations, password fields (secrets never transit
chat), file upload, dependent picklists, lookup type-ahead, custom LWCs.

**Hardening:** interview state tokens are HMAC-signed by the server
(CARDSTACK_ENCRYPTION_KEY) — a tampered token is rejected, so write targets
can't be forged; lookup row limits are enforced interpreter-side so an
over-returning adapter can't widen a single-record write into bulk.

Verified against the org: `Test_Kitchen_Sink` + `Test_Sub_Flow` (deployed
2026-07-25) run live end-to-end — sections/toggle/slider render, the
visibility rule ships to the widget, invalid input re-renders with the flow's
own error message, formula + assignment + subflow compute, and the record
update pauses at the confirm diff before writing. Fixtures captured under
`packages/core/src/__fixtures__/` keep the real Tooling-API JSON shapes under
test (43 core tests).

**The scaling strategy remains static analysis at config time**: Studio labels
each flow full / partial / handoff-only from `analyzeFlowSupport` before an
admin publishes the action; `crm_flow_start` carries `supportLevel`, and a
mid-run unsupported element returns a typed degrade with the reason on the
handoff card.

## Next steps to see it in this chat

1. Deploy (`railway up` both services — remember `/packages/**` isn't in the
   watch patterns; touch both apps).
2. Re-auth Salesforce in Studio → Connections (the deployed refresh-token
   family is dead; one click, plus "Connect my Salesforce user").
3. Add the `screen_flow` action for `Test_Screen_Flow` to a card config.
4. In Claude: "run the order intake flow on <account>" → the interview renders
   in the card.
