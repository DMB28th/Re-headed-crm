# Reusable Cardstack screen — revised milestone

October12,2026. Source implementation and sequence change authorized directly by
the user: prioritize a working end-to-end screen, reusable supported field/layout
architecture, authoritative Salesforce execution, consolidated checkpoints. This
supersedes the October11 Task5 pre-development package/Stage gate and fixed-form
presentation limit. Prior security/hosting/identifier/private-state contracts remain.

## Outcome and scope

First acceptance: open Opportunity → edit Stage/CloseDate/Amount together → server
review → explicit Confirm → durable receipt → authoritative refresh. Demonstrate
invalid inputs, Back/Cancel, noChanges, lost response/status recovery and stale
responses after record switch. Three fields are the first governed backend scenario,
not a field-name restriction in the renderer. No generic arbitrary CRM patch API.

## Reusable presentation contract

Use a plain-DOM field registry and a checked layout resolver independent of MCP
and Opportunity names. Supported controls initially: STRING/text, TEXTAREA, BOOLEAN,
INTEGER, DOUBLE/DECIMAL/CURRENCY, DATE, PICKLIST(single). Canonical submitted values
remain strings (Boolean true/false strings, exact integer/decimal/date/picklist API
values); explicit allowed clearing is separate from blank. Never convert decimal/
currency/integer values through JS Number. DATE calendar validation does not shift
timezones. Unknown types render bounded read-only/unavailable, never invent a
coercion or executable control. Generic client validation assists correction;
Salesforce still validates every accepted value and controls actual writable fields.

Renderer model contains public checked fields/current values/errors/diff/receipt
and local drafts only. Optional versioned layout has sections {id,label,fields:
[fieldApi],columns:1|2}; reject duplicate/unknown refs and dangerous metadata; no
expressions, HTML, arbitrary styles/scripts or graph execution. Without explicit
layout, use descriptor order and responsive stacked/two-column form. Layout changes
never expand server authorization. Current Salesforce View/Card DTOs adapt into
this model without legacy transport casts or changing their public versions.

Keep renderer modules separate from controller. Controller owns private keys,
confirmation request and identity/generation counters only in closure. Register
SDK handlers before connect; SDK remains1.7.4, no new dependency install/network
assets/runtime server. Build self-contained app + separate synthetic preview from
the same renderer. Preview has no MCP bridge/private keys; isolated sandbox and
parent/source checks. All labels/values use textContent and safe properties.

## Process and recovery

Card → Editing → Preparing review → Review → Saving → Completed receipt; explicit
local Unknown after possible dispatch is distinct from rejected predispatch. Review
diff is server-owned; Confirm carries only current handle/grant/revisions, never a
new record or patch. Back/Cancel drop local confirmation authority. Pending/stale/
expired context disables Confirm. Refresh failure after known save preserves receipt
and offers only refresh retry. Unknown offers Resume/status before any exact-request
retry. Never call a failed response unsaved unless authoritative status proves it.

Bind every async reply to record identity, interview and request generation. A
record switch/teardown drops old authority and prevents delayed replies from enabling
Confirm or replacing another record. Host-provided accepted result _meta may enable
resume after reload; if the actual host does not retain it, show truthful inability
to recover that interaction rather than invent storage or imply no save. This host
behavior is measured separately, not inferred from test doubles.

## Real blockers versus parallel work

Renderer source/build/controlled-browser work starts now. Package coverage, fresh
install/full-suite and real native Stage API checks run alongside it. Native Stage
choices must be available before claiming real Stage editing; no Describe fallback.
Installed compatibility, ordinary-user rights and real host delivery are prerequisites
for live acceptance, not for building/testing reusable controls. Package/SDK/runtime
failures block the corresponding live capability only.

## Evidence and approval boundaries

Backend: actual scoped272 native assertions; fresh package/full-suite tracked
separately. Renderer: meaningful behavior tests and controlled-browser demonstration
clearly marked synthetic. Actual Claude/ChatGPT: only observed OAuth/discovery/
iframe/bridge/governed save/readback/recovery counts as live-client evidence.
No synthetic/mock result is called live Salesforce behavior.

Continue existing approvals for source, local/native unit validation and the reviewed
package-only gate. No per-fix permission or review gates. Genuinely new external
CRM fixtures/client connections/org changes require one concrete reviewed scope
before execution. Preserve beta/currentconnections/five dirty docs/frozen evidence;
no promotion/release/cutover/push/merge.
