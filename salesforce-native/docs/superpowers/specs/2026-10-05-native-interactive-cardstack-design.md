# Cardstack native: interactive Salesforce work inside AI UI

Written design and delivery roadmap, October 5, 2026. **Architecture under review; not approved for implementation.** Supersedes the Salesforce launch-link design as the primary product experience.

Official-documentation research found that HXL is documented as output-only UI configuration, with agent-directed buttons but no established general editable-form path for external clients. The interpreter-first architecture below is therefore a proposal to reassess, not a selected implementation. First evaluate supported task actions backed by autolaunched flows or invocable Apex, and resolve editable UI feasibility. See [supported architecture research](../../supported-ai-ui-options-research.md).

## Product outcome

People use their Salesforce data and complete supported business processes inside Claude or ChatGPT. Admins configure those experiences in Salesforce Studio. Cardstack stays an installable native Salesforce package using Hosted MCP and HXL, with no external servers.

The user agreed to carry over the identified interaction and governance capabilities from the retired product. This roadmap covers all ten source-audit gaps. It is not a commitment to execute every Salesforce Screen Flow unchanged; supported behavior must be explicit and verified.

The first release milestone is one complete interaction: record card → configured action button → editable supported flow screens → confirmation → Salesforce save → result and refreshed card. Existing record search, highlights, named sections, one/two/three-column sections, and Studio field flags remain supported.

## Constraints and source of truth

- Work only in `salesforce-native/`; `force-app/` is the authoritative deployable package. Retired `apps/` and `packages/` are read-only reference material.
- Use Salesforce API 67.0. Deploy sessions end with JWT ON, independently verified. Do not expose credential values or session tokens in logs.
- Salesforce sharing, CRUD, FLS, and user-mode queries/DML remain the permission boundary. Published Cardstack policies narrow access further; they never widen Salesforce permissions.
- Execution belongs to the OAuth-connected user. Describe and verify the context used by any invoked Salesforce automation rather than assuming its run mode.
- Keep the native no-delete-record decision. Do not port legacy delete execution.
- Do not restore standalone Custom Screens, Node/Railway hosting, Postgres, custom user accounts/OAuth proxies, multi-tenancy, or HubSpot code.
- Supported chat input, event, tool-call, and refresh behavior must be proved on each client claimed as supported. A mock or an Apex response is insufficient evidence of an editable working card.
- Beta packaging limits remain explicit: Hosted MCP companion setup and HXL packaging constraints cannot be hidden behind a core-package install link.

## Architecture

### Shared published policy and payload assembly

Introduce one Apex policy layer consumed by record rendering, update preview, writes, action start/continue, and discovery. Resolve the default object's published layout and intersect configured exposure/editability with Salesforce permissions. Required/read-only flags must affect real validation and actions, not just Studio preview.

Omitted layout policies retain existing read behavior, but do not grant new interactive-write exposure. For new interactive actions, an admin must publish an enabled action and its allowed inputs. Migration preserves stored legacy properties; affected legacy write behavior is surfaced in Studio with a migration notice rather than silently interpreted as a grant.

Tools return a coherent card model: approved fields, actions, provenance, availability, and structured errors. Studio preview uses the same configuration normalization and supported control definitions. Browser-supplied values never determine authorization or allowed field names.

### Flow interpretation and capability registry

Port the legacy capability registry, analysis, formula subset, and interview algorithms into bounded native services. Reuse captured fixtures as acceptance contracts; do not invoke the TypeScript runtime in production. Do not depend on Salesforce's undocumented Aura/Screen Flow runtime endpoints.

Registry entries describe supported screen components and traversal elements, limits, and reasons for unsupported behavior. Static analysis and runtime dispatch consult the same registry. Initial coverage is deliberately narrow: display text, basic scalar inputs, common choices, screens, assignments, decisions, readable record lookups, and individually confirmed create/update operations. Extend coverage to bounded loops, formulas, grouped fields, tables, collections, and limited subflows only after the first complete path is verified.

Custom LWCs, file upload, secret/password entry, waits, orchestration, and unproved elements remain unsupported. Studio shows a compatibility report with specific blockers. A user starting an unsupported flow gets an explanation, never a false success. A Salesforce link may be offered as an explicitly labeled fallback, but is not counted as in-chat completion.

Interpreter behavior is Cardstack's supported interpretation, not Salesforce's native interview engine. Publish pins an analyzed flow version and configuration revision. If metadata changes, require revalidation before starting new interviews; do not quietly switch an existing interview to a different definition. Old assumptions about self-REST and Named Credentials are not evidence of metadata access under Hosted MCP.

### Interview state, confirmation, and execution

Prefer server-owned Salesforce session state with an opaque token bound to the org, actor, record, flow version, configuration revision, current step, and expiry. User answers and pending operations remain server-validated. Use locks/consumption records to prevent concurrent or repeated submit from repeating a non-idempotent action. Token signing must use protected random material if signatures are needed; public org identifiers are not secrets.

Preview a create/update operation before execution. Confirmation commits to the exact target, typed input/patch values, and actor. Changing any confirmed value requires a new preview. Recheck published policy and Salesforce access when executing. Track confirmed execution and return the stored outcome on a safe duplicate request.

Do not permit Back to reverse already committed effects or repeat them. Each confirmed write boundary is explicit; show when a process has already changed Salesforce. Do not offer a fresh Salesforce launch of the whole flow after partial writes as if it were a safe continuation. Cancellation ends the Cardstack interview and does not undo prior committed actions.

### Chat UI and action discovery

Render editable controls and step navigation through supported HXL features proved by the feasibility milestone. Record action buttons initiate an in-chat interaction instead of opening Salesforce as the normal path. If HXL can only send a message through the host agent, verify that exact values survive and that the server controls the resulting action; do not assume deterministic direct dispatch.

Flow/action input mappings support current record context, readable fields, typed constants, and user-entered answers. A single resolver serves record buttons and requests initiated through chat. Do not expose credentials, arbitrary expressions, or arbitrary SOQL as mapping sources.

Published action descriptors include label, description, applicable objects, example requests, required inputs, compatibility, and tool identifiers. A read-only MCP catalog makes them discoverable. Example phrases are guidance, not exact-match triggers or trusted instructions. Ambiguous matches lead to a choice. Drafts are excluded.

## Delivery phases

Each phase receives its own implementation plan. It is complete only after appropriate component/Apex checks and real Studio/connector QA, with evidence saved. Do not plan all implementation details before feasibility is established.

### Phase 0 — prove the native interaction boundary

Deliver a narrowly scoped prototype in the current native project: an editable Text control, a Boolean/choice control, submit, and a response showing the received typed values in a real Claude card. Use a read-only test backend; no business mutation is needed. Prove metadata access for one org-authored Screen Flow and active version.

Check client control availability, input binding, submit transport, rerender behavior, and connected-user identity. Repeat the relevant client proof in ChatGPT before advertising that client as working. Treat prototype code as isolated test scaffolding until promoted through the later plan.

Exit: real evidence supports the native route. If HXL input or metadata access is blocked, report the precise platform limit and present a concrete alternative requiring the smallest constraint change. Do not silently replace editable cards with chat-text prompts or external links.

### Phase 1 — one complete supported record/flow action

Deliver the shared published policy layer, protected session/confirmation contracts, core editable controls, configured record-card flow button, and minimal interpreter subset needed by one real test flow. Include inputs from record context plus one user-entered answer, validation, a decision, confirmed Salesforce update/create, completion, and refreshed data.

Studio configures the action and its mappings without normal JSON editing. Show flow compatibility and availability; prevent invalid dependencies from publishing. Advanced View JSON remains read-only. Record-card and flow example requests appear in the published catalog.

Exit: real Claude path finishes without leaving chat, changes only the intended test record/field under the connected user's access, and duplicate submit cannot repeat the mutation. The native controls honor required/read-only and published editable policy. No-token, altered-value, stale, expired, wrong-user, denied-field, and changed-version calls fail safely. Refresh reflects the actual saved data.

### Phase 2 — richer editing, quick actions, and interpreter coverage

Deliver normal record-card edit → diff → confirm → receipt → refresh. Add typed picklists, dates, lookups, and readable validation messages. Use Salesforce metadata for available values and reference targets; don't invent them.

Port quick-action mini-layout/default handling and supported execution, initially New Task and Log a Call where available. Action-specific fields and predefined values must be respected. Verify actual Salesforce quick-action execution rather than substituting a generic record create without explanation.

Expand interpreter coverage incrementally using legacy element/kitchen-sink fixtures. Add formulas, visibility, tables/selections, bounded collections/loops, and limited subflows with an explicit capability report. Do not import unsupported functions just to claim coverage.

Exit: each action/control added has regression evidence and a real connector path. Permission errors, defaulted fields, invalid choices, timezone conversions, and repeated submissions behave correctly.

### Phase 3 — navigation, lists, and useful home

Compose related lists and reference drill-through into record cards, with pagination and Back navigation inside chat. Preserve the parent context and refresh only data affected by an action. Failures in one related list do not destroy the record card.

Port curated/exposed views, defaults, aliases, ambiguity choices, and appropriate per-user preference storage. Distinguish Salesforce list-view membership from Cardstack ad-hoc filters; do not promise real-view fidelity when Hosted MCP cannot obtain it. Any fallback is labeled explicitly.

Replace normal Home Card JSON authoring with configurable blocks and connect published configuration to actual home output. Support curated list tiles, recent records sorted across configured objects, and follow-ups. Distinguish unknown count from zero. Keep task completion confirmed and refresh its result.

Exit: navigation works in chat; exposed/default view policy is enforced server-side; publishing home changes what users see; unconfigured/inaccessible blocks degrade clearly.

### Phase 4 — restore, provenance, and recovery

Add published configuration revisions, previous-version restore as a new revision, and stale-draft detection. Preserve in-flight drafts. Explain flags, column/section changes, action changes, and dependency differences in Publish Center.

Standardize provenance, fetched-time/freshness, execution receipts, recoverable read errors, and reconnect guidance. Retain unsaved input where supported. Do not automatically retry non-idempotent writes. Extend existing audit storage/UI with flow/version/action outcomes, actor, confirmation provenance, and mutation details. Existing audit filters, CSV export, and visual diffs remain in place.

Exit: an admin can restore a published configuration without losing a draft; stale publication is detected; a recoverable read can be retried; committed results remain recognizable after client or network failures.

### Phase 5 — install and beta release

Verify the full package test suite and build a new unpromoted beta version. Verify core package installation plus companion Hosted MCP/HXL setup in an appropriate clean target org. Update admin installation guidance and record any unsupported packaging types, daily build limits, or org prerequisites plainly.

Provide an install URL only for the version actually built and verified. Commit/push native source and documented setup matching the deployed behavior. Verify JWT ON and restore temporary debug/QA settings. Remove or roll back disposable QA data/config without changing the user's original drafts.

Exit: the documented installation yields the tested product. A source deployment in the existing org alone does not prove package installation.

## Verification and implementation process

Use the existing native baseline of 123 Apex and 18 component tests as a starting point, not proof of the new features. Port relevant legacy fixtures/test expectations into native tests; do not rely on stale overview documentation or old deployment claims.

For code changes, run focused meaningful regression tests, then the full suite before release. Review runtime policy, input validation, state transitions, replay, governor limits, metadata boundaries, and client support. No tests or deployments are needed merely to approve this written design.

Recommended execution is in this chat, with the primary agent implementing sequentially and one independent review at milestone boundaries. The phases share policy, session, and payload contracts; parallel product edits before those contracts settle would create integration churn. Use read-only research/review delegation where useful, and keep legacy source untouched.

## Source references

- `salesforce-native/docs/legacy-runtime-gap-research.md`
- `salesforce-native/docs/legacy-governance-gap-research.md`
- `salesforce-native/docs/superpowers/specs/2026-10-05-in-chat-flow-feasibility.md`
- `docs/superpowers/specs/force-com/07-flow-interpreter.md` (historical port intent, not current delivery evidence)
- `packages/core/src/flow-capabilities.ts`, `flow-analysis.ts`, `flow-interview.ts`, `flow-expressions.ts` (read-only source and algorithm references)
- `packages/widgets/src/record-card/`, `flow-run/`, `home-card/` (read-only interaction contracts; React must not be copied into HXL blindly)
