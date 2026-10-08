# Custom MCP Apps migration and interpreter carryover

Date: October 8, 2026
Status: Proposed for written review; no implementation or deployed cutover yet.
User-selected direction: retire HXL, reuse the custom renderer and bounded earlier
interpreter, keep the native Apex backend and Studio.

## Outcome and boundaries

Cardstack Studio remains the installed Salesforce admin application. Its published
configuration determines record layouts, actions, supported process inputs, and
permissions. End users interact through custom MCP Apps HTML/React cards in AI chat.
Apex remains authoritative for connected-user identity, access, durable state,
validation, exact review/confirmation, CRM changes, audit, and completion receipts.

The target release has no HXL dependency. HXL will not be maintained as a parallel
adapter. During migration the existing deployed beta remains available until a
replacement passes the cutover gates. This is a release sequence, not a change to
the user's chosen architecture. Do not delete immutable metadata from installed
package versions; remove dependencies from the new release and retire active
bindings through supported Salesforce operations.

Runtime hosting stays in Salesforce. Browser bundles may be built with local Node
utilities; this does not introduce a Node runtime server. Reuse from apps/ and
packages/ is a source reference/copy into salesforce-native, not reactivation of
Railway, Postgres, legacy tenancy, or custom accounts.

## Three distinct pieces

1. **Custom presentation:** reuse suitable React record/table/home/flow components,
   styling, typed editor controls, and host bridge patterns. Adapt them to versioned
   native DTOs rather than aliasing legacy tool names or casting arbitrary results.
   The browser keeps unsent drafts, never execution authority. Reset or bind all
   draft/review state to record ID, action, policy revision, and interview identity.
2. **MCP delivery:** a Salesforce-hosted endpoint serves bundled StaticResource HTML
   via resources/read and routes tool calls to native services. Resource/tool
   linkage, MIME, initialization, capability negotiation, errors, and app-only
   visibility follow the stable MCP Apps contract. No Salesforce credentials are
   placed in the iframe. Authentication/discovery must work in actual clients.
3. **Apex process interpreter:** adapt the earlier expression/graph/component
   concepts and fixtures into a bounded server-owned engine. Store immutable
   published definitions and private, actor-bound, expiring, revisioned interviews.
   Recompute effects from that pinned definition and validated answers; the client
   cannot select another record, change the process, or provide an executable plan.

No claim that Salesforce Hosted MCP can serve arbitrary custom HTML is assumed.
The existing authenticated Apex REST probe is protocol evidence, not proof of
client login or a production transport. Its echo handler is not the implementation
of the new CRM endpoint.

## Delivery order and separate implementation scopes

This is the migration direction and acceptance framework. The subsystems require
separate, reviewed implementation plans; do not port the whole legacy system in
one task.

### First: prove delivery and one governed record edit

Use a disposable Account and a small published layout. The custom record card must
collect multiple values in a single form, including zero and blank text, submit
exact values to Apex, display the server's before/after review, confirm the exact
review, save once, and refresh from Salesforce. Include validation, cancellation,
Back, record-switch handling, and uncertain-outcome recovery.

Reuse the native preview/update/confirmation services, with any necessary general
interaction adapter explicitly designed and tested. Do not assume the current
one-field editor API is a multi-field form contract. Transport failures must query
or resume the authoritative outcome before retrying; a lost response cannot be
reported as proof nothing was written.

Per-user client authentication/discovery is the first checkpoint, before substantial
renderer migration. Prove it in Claude and ChatGPT separately. A failed Salesforce-
only ingress cannot silently become an external gateway or public guest CRM API.
If no supported route is available, report the specific platform boundary and seek
an architecture decision before external runtime hosting or broader access.

### Second: carry over a bounded executable interpreter

Begin with a two-screen process and one confirmation-gated update to the current
record. Candidate initial elements: supported scalar inputs, escaped display text,
static single-select choices, simple assignments, and decisions with an explicitly
validated operator/condition grammar. Reuse algorithms only after correcting audit
findings and proving parity with fixed fixtures.

An admin-authorized supported metadata acquisition path must produce a published,
version-pinned process snapshot. End users must not need administrative Tooling API
access. If that acquisition path cannot be verified, importing a Salesforce Flow
remains unavailable; authored Cardstack processes must be labeled distinctly.

The initial compatibility report rejects loops, subflows, dynamic/dependent choices,
lookups, custom LWCs, file uploads, waits, action calls, arbitrary formulas, create,
delete, and transaction/rollback semantics. Broader constructs require later
specifications and execution evidence. Unknown elements or unsupported expressions
fail compatibility before launch; they do not silently evaluate to a default value.

Accept only declared, currently visible input names. Validate type, required rules,
and constraints on the server. Bind record context independently of writable Flow
variables. Reject non-finite numbers, invalid dates, ambiguous conditions, and
unbounded graph traversal. Define limits for screens, inputs, steps, lookups, and
state size in the interpreter implementation spec before coding it.

Confirmed effects must come from the exact reviewed pinned definition, record
context, answers, and effect plan. Replays return the stored receipt without
re-executing writes. There is no delete capability. Supported process interpretation
is not advertised as Salesforce's full Screen Flow runtime.

### Third: cut over the complete presentation surface

Migrate the published record, search/list, home, aggregate, and process experiences
and reconcile Studio's previews with the custom runtime contract. Do not leave
published actions pointing to obsolete HXL-only behavior. Remove HXL resource
bindings from the new MCP release; retire the previous connector/bindings after the
replacement is installed and verified. Identify packageable source versus any
per-org transport/OAuth setup explicitly in the release guide.

Only after this cutover is HXL retirement complete. Existing Opportunity Stage,
CloseDate, and Amount requirements remain a subsequent typed-edit expansion.

## Validation and release claims

Use source-based regression tests, explicit native contract tests, and negative
fixtures for each audit finding. Test permissions, altered answers, alternate
record IDs, expired/stale/wrong-user state, changed published definitions, duplicate
confirmation, and unknown outcomes. Passing legacy tests alone does not close gaps
absent from their coverage.

Real-client gates: login/discovery, HTML retrieval/handshake, exact multi-field
submission, no write before confirmation, persistent save/read-back, refreshed
card, Cancel, Back, reconnect/retry without repeated effects, and supported
interpreter navigation/validation. A text result or browser handoff is not an
in-chat pass. Exclude any unverified client from release support claims.

Retain API 67, the JWT OFF/fresh opaque login/deploy/ON procedure, and current
sharing/FLS/published policy constraints. Own live QA, preserve original drafts and
configuration, remove disposable fixtures, and never log credential/session/private
confirmation values. Run native regression and fresh package-install checks before
release. Record actual results and evidence.

## Current evidence

Prior external-host testing established one read-only two-screen custom UI shape in
Claude and ChatGPT. Prior Salesforce-only authenticated API testing established
initialization, resource retrieval, and typed echo. It did not prove real-client
Salesforce-only authentication or confirmed writes.

This re-audit reran 42 existing source-based tests: 34 interpreter/expression/input
mapping tests and 8 record-card tests. They passed. Additional targeted probes and
source review identify gaps outside those passing cases; see [the re-audit report](../../CUSTOM_UI_REAUDIT_2026-10-08.md).
No org changes or live client tests were performed during this source audit.
