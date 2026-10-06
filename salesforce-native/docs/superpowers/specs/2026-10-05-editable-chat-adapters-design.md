# Cardstack: editable Salesforce experiences inside chat

Plan date: October 5, 2026. This replaces the interpreter-first sequencing in the earlier delivery roadmap. The product outcome stays fixed; the UI implementation can evolve as HXL support improves.

## Product decision

Admins use Cardstack Studio in Salesforce to configure record cards and approved processes. Users view and edit records, review changes, confirm saves, and complete supported processes inside Claude or ChatGPT. For the community beta, clearly labeled Salesforce record and flow handoffs are supported outcomes. Full editable in-chat forms remain the preferred next milestone, and are not claimed as shipped.

Keep all runtime hosting in Salesforce as the default requirement. A hosted service outside Salesforce would be a separate architecture decision, never a quiet substitution.

HXL is one presentation adapter, not the definition of the product. Keep the working HXL record/list cards. Build the backend and admin configuration independently of its current form limitations. Pursue the Salesforce-hosted custom MCP App adapter as the alternate editable UI route; do not represent its client authentication as already solved.

## Architecture that can evolve

Studio publishes a versioned experience definition: object and field exposure, sections and column counts, required/read-only flags, action buttons, variable mappings, labels, example requests, and supported process steps.

A shared Apex policy and interaction service resolves the published definition, intersects it with the connected user's Salesforce access, validates typed answers, owns interaction state, previews changes, executes confirmed operations, and returns receipts. Draft configuration never authorizes runtime operations.

Both adapters consume the same versioned interaction model and call the same services:

- **Native HXL adapter:** Salesforce Hosted MCP + widget metadata. Use capabilities verified for the relevant client and release.
- **Custom MCP App adapter:** self-contained HTML/JavaScript resources and a custom MCP transport hosted in Salesforce. The disposable Apex REST prototype serves resources and echoes typed values successfully; client OAuth/discovery still needs proof.

No business rules, record authorization, or process execution belong exclusively in a renderer. When native HXL gains reliable forms, replace the UI adapter without migrating admin configuration or rewriting save/process logic. Active interactions pin their configuration and process versions.

## Delivery sequence

| Milestone | User-visible outcome | Completion evidence |
| --- | --- | --- |
| 1. One complete record edit | Open a record, edit a small form, review exact changes, confirm, see saved values | Real client save/read-back, validation, cancel, denied access, retry without duplicate effects |
| 2. One guided process | Start from a record button or chat request, answer two screens, go Back, review and finish | Variables retained, record context mapped, one approved operation executed, receipt returned |
| 3. Admin authoring | Configure fields/actions/processes in Studio and publish safely | Published configuration changes the actual chat experience; invalid dependencies cannot publish |
| 4. Broader records and flows | Picklists, dates, lookups, more actions and a bounded Screen Flow subset | Each supported capability has automated and real-client evidence; unsupported elements identified before launch |
| 5. Installable beta | An admin installs and connects the tested product | Clean-org installation and connector QA, matching source/setup, actual install URL |

Milestones include the admin configuration needed to exercise them; milestone 3 expands that into a polished authoring experience rather than postponing governance until after runtime development.

## Milestone 1: first vertical slice

Use a disposable Account and a published two-field layout: Description (text) and NumberOfEmployees (integer). This avoids a claim that every Salesforce field type is implemented. Demonstrate blank text and numeric zero intentionally; reject invalid numeric types instead of letting an AI guess or coerce them.

Build shared policy and interaction services while resolving client transport in a separate task. The first editable UI adapter is selected by evidence: native HXL if its missing submission mechanism becomes available, otherwise the Salesforce-hosted custom adapter if OAuth/discovery passes. Do not repeat broad HXL probes without a new documented capability or a specific explanation for the earlier failure.

The record interaction is: editing → review → confirmed execution → completed receipt. Back returns to editing with answers intact; cancel produces no write. Server state binds the actor, record, exact typed patch, policy revision, current revision, and expiry. Changing an answer invalidates its previous review. A completed interaction returns its saved receipt on duplicate confirmation.

Harden the existing write confirmation before adding new interactive writes. Current source uses an org-ID-derived signing key, permits missing confirmation, and binds update confirmation to field names rather than exact values. Preserve existing read behavior, but migrate write tools to the shared mandatory confirmation service. Tests must pin changed-value, wrong-user, expired, stale-record, and duplicate-submit behavior.

The transport task is time-bounded: one focused client authentication implementation and one real-client test per host. If Salesforce hosting cannot support the required discovery/authentication safely, record the blocker and make the explicit choice between a different Salesforce ingress, a small external transport service, or delaying editable beta. Continue independent policy/Studio work; do not advertise an editable beta through an unproved route.

## Milestone 2: guided processes before broad Screen Flow support

Define a small Cardstack process with two input screens and one approved operation. Inputs may come from record ID, readable record fields, typed constants, or user answers. Record buttons reference published action identifiers; chat example phrases help the agent discover those identifiers and are not exact-match triggers or authorization.

For executable Salesforce automation, use approved autolaunched flows or narrowly scoped Apex services where their input/output and execution contracts are verified. Salesforce executes that automation; Cardstack owns the chat interaction around it.

Importing an existing Screen Flow is a separate capability. Add a bounded interpreter only after editable transport and state work. It is Cardstack's interpretation of supported metadata, not Salesforce's native screen runtime. Studio must analyze the pinned version and explain unsupported components/elements. No dependency on undocumented Aura interview endpoints.

## Studio experience

Retain the Classic-inspired field palette, drag/drop layout, highlights, named sections, and per-section one/two/three-column choice. Required/read-only settings must affect runtime validation and permissions, not just preview.

Replace launch-only Flow configuration with Actions & Processes: choose the automation/process, define applicability, map variables, author the chat screens if needed, assign record buttons, and preview compatibility. Remove Custom Screens as a separate product concept. Screen authoring belongs within its process.

Include card/action names, descriptions, example requests, a published discovery catalog, and read-only Advanced → View JSON. Unsupported features have specific explanations. Publish Center reviews dependencies and versions; Audit Log shows confirmed execution and saved outcomes.

## Release gates

Editable beta requires all of these for every advertised client:

1. Exact multi-field receipt: zero, false, blank, Unicode, quotes, omitted values.
2. Salesforce-user identity, published exposure, sharing, CRUD/FLS, required and read-only enforcement.
3. Confirmed persistent save with independent read-back and refreshed card.
4. Cancel without save; duplicate submit cannot repeat the operation.
5. Two-screen retained state and useful validation/recovery behavior.
6. Clean installation and connector setup, including any companion metadata or hosting prerequisites.

Scope can be narrower in beta, but the product must state that scope. A client that fails a gate is excluded from that milestone's support claim rather than counted as passing through a text or browser fallback.

## Evidence and uncertainties

- Native HXL cards are working; seven controls render in ChatGPT.
- A single edited native HXL value reached Apex exactly. Six additional edited values were null in the multi-field server receipt.
- API 67 metadata rejects the draft mutable state provider/change-handler properties. Other releases remain untested.
- Custom MCP App multi-field transport and read-only two-screen interpretation passed in both clients in earlier probes, using a temporary external test host.
- The new Salesforce-only Apex REST prototype passed authenticated initialize, tools discovery, exact UI resource retrieval, typed seven-value echo, and type rejection. These were authenticated CLI/API tests, not Claude/ChatGPT connectivity tests.
- Salesforce's generic unauthenticated Apex REST challenge is `Token`; the tested org has no existing Salesforce Sites. Public resource discovery/authentication remains the alternate adapter's first gate.
- Full org Apex tests after the new disposable probe: 128 passed, zero failed, zero skipped. Probe source remains scratch-only; product source is unchanged.

See HXL-confidence-assessment.md and HXL-runtime-input-tests.md for the detailed native results. Temporary native probe remains inactive and JWT is ON.

## Execution

Implement in this chat, sequentially by milestone. Start with published policy and mandatory server-owned confirmation, alongside the bounded adapter authentication task. Use focused tests per change, real client QA at the transport milestones, and the full suite before release. Create later subsystem plans only when the preceding milestone has fixed their interfaces; no full-interpreter port before the first complete record edit.

## Community-beta execution update — October 5

The initial delivered slice reuses Studio’s `permissions.writeEnabled` and explicit per-field settings, adds a published policy resolver, and replaces stateless org-ID-derived tokens with private server-owned confirmations. Preview/update and task-completion tools enforce the user, policy, exact submitted values, record freshness, and repeat-safe receipts. A full Editing/Review/Back/Cancel/Resume interaction UI is still a later milestone, not a capability of this confirmation slice. Native read cards and labeled Salesforce flow launches remain the release surface. The unconfirmed create-record tool is excluded from the community MCP definition.

Structured HXL record rendering passed a single-input Claude call with real three-column and one-column sections. A batched three-record call could not render; the record tool now requires separate calls. Multi-field editable HXL submission, ChatGPT parity, and a native Screen Flow interpreter are not release claims.

## Proven native adapter update

The Account one-field-per-step HXL adapter passed live Claude input/review/save/read-back/refresh, Back/recovery, integer validation, stale-button rejection, and Cancel. It uses server-held interaction state and the proven single content transport. Multi-field submission and full Screen Flow interpretation remain unimplemented; ChatGPT parity for this editor is not claimed. The Salesforce-only architecture and shared authorization boundary are unchanged.
