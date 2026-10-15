# Opportunity editing with custom MCP Apps — proposed design

Date: October 11, 2026. Status: **Design and implementation plan approved by the user on October 11, 2026; source implementation underway.**
Worktree: `codex/mcp-apps-delivery-proof`, inspected at `d713bd8`.

This is a reviewable design, not an implementation plan or deployment approval.
It replaces the presentation proposal for this scenario in the October 8
Opportunity spec. The approved Salesforce-native migration direction remains in
force. Opportunity is approved as the next governed custom UI scenario, adjusting
the earlier Account-first sequence.
Account remains a regression fixture, not a second new product feature.

## 1. Intended experience and recommendation

A rep opens an existing Opportunity in Claude or ChatGPT, clicks a published
**Edit opportunity** action, edits Stage, Close Date, and Amount together, reviews
the server-generated changes, explicitly clicks **Confirm and save**, then sees a
receipt and a refreshed record. Admins govern that action in native Studio.

Use one custom MCP App resource with a record view, one edit form, one review view,
and completion/recovery states. Apex owns the process, authorization and durable
state. Copy suitable presentation components into `salesforce-native/`; the
retired packages remain references. Salesforce serves the bundled HTML through
the existing authenticated Site MCP ingress and `resources/read`.

| Presentation option | Tradeoff | Decision proposed |
| --- | --- | --- |
| One three-field form followed by review | All values visible together; one literal submission; small new batch adapter | Recommended |
| Three sequential field screens | Closest to the old Account editor, but poor overview and preserves its presentation limits | Decline for this scenario |
| General metadata-driven Screen Flow renderer | More flexibility, but imports graph, expression, authoring and compatibility risks before a useful edit | Defer to a separate approved scope |

This milestone delivers the Opportunity card/action/editor in both clients. Search,
home, aggregate and other process surfaces remain later migration scopes. HXL
retirement remains selected, with deployed beta UI preserved until the complete
replacement and cutover gates pass.

## 2. Recovered evidence and what can be reused

The final source/evidence review (local evidence retained by the integration owner; excluded from this PR)
and final ledger entry (local evidence retained by the integration owner; excluded from this PR)
resolve older Pending statements. Recorded evidence for unreleased 0.1.0.10:
actual package coverage 88%, installed Apex 332/332, local native 124/124, actual
ordinary-user Claude and ChatGPT iframe/bridge/exact synthetic exchange, empty
text, reload, Studio checks, wrong-org/configuration drift, Claude revoke/reconnect
and ChatGPT isolation. Both clients automatically refreshed after more than
16 minutes idle on independently verified 900-second sessions. Owned cleanup
passed; the scratch org and QA connections no longer exist.

These are recovered observations, not fresh executions this turn. They establish
synthetic delivery, not governed custom-UI CRM saves. Source `394cdb7`, artifact
0.1.0.10 and fixed runtime contract identifier 0.1.0.8 are distinct identities.
The [consolidated receipt](../../evidence/install-auth-package/fresh-release-evidence-0.1.0.10.json)
is read with the later final review: its remaining “Final evidence review” item
was completed by `d713bd8`. Historical 0.1.0.9 deadline-precision failure and prior
Claude route failures remain failures at their recorded boundaries.

| Existing source | Reuse | Required adaptation |
| --- | --- | --- |
| `CardstackMcpIngress`, connection access/context/setup | Named-user ingress, exact discovery route, setup revision checks | Add separately governed CRM dispatch; diagnostics retain their existing contract |
| `CardstackMcpDispatcher`, `ui/connection-diagnostic` | StaticResource delivery, pinned SDK 1.7.4, host calls, theme/safe-area and late-response guards | Dispatcher currently exposes diagnostics only; add a versioned product resource and strict DTO validation |
| `CardstackPolicyService`, configuration and action services | Published-only policy, field exposure, required/read-only rules, native Studio staging | Action resolver currently restricts record-edit to Account/text/integer; add a narrow Opportunity capability |
| `CardstackConfirmToken`, private interaction/confirmation objects | Actor/subject/version/expiry binding, row locks, stored receipts | Bind process/review/connection revisions and Stage context; exact atomic patch contract |
| `CardstackPreviewUpdateAction`, `CardstackUpdateRecordAction`, audit/error services | Diff, coercion and receipt concepts; permission checks and structured errors | Reuse extracted safe helpers, not these entry points unchanged: preview does trial DML; update can save a subset of coercible fields and audit errors are swallowed |
| Legacy record controls, write-state presentation, process fixtures | Layout/diff concepts, input controls, graph/state concepts and targeted fixtures | Native payload adapter; decimal strings; record identity guards; truthful uncertain-outcome recovery; reject audited fail-open interpreter behavior |
| `CardstackRecordEditService` | Account regression behavior and revisioned interaction pattern | Account-only single-input API is not a multi-field form API; keep its deployed contract intact |

The five pre-existing dirty documents and all frozen evidence stay untouched.
No dependency installation, legacy build, broad test rerun, CRM write or org
configuration action is necessary to prepare this proposal.

## 3. Concrete screens

Illustrative values below are synthetic, not a Salesforce read or write.

```text
Opportunity: Example renewal                  Stage: Qualification
Close Date: 2026-11-30                        Amount: USD 10000.00
[Edit opportunity]

Edit opportunity — Example renewal
Stage *         [Negotiation / Review v]
Close Date *    [2026-12-15]
Amount (USD)    [12500.25]   [Clear amount]   [Use current values]
No changes saved.
[Cancel]                                    [Review changes]

Review changes — Example renewal
Stage          Qualification       → Negotiation / Review
Close Date     2026-11-30           → 2026-12-15
Amount         USD 10000.00         → USD 12500.25
Salesforce validates business rules when you save.
[Cancel] [Back to edit]                       [Confirm and save]

Saved — 3 fields changed · actor display name · time
Receipt: the exact reviewed before → proposed values
Refreshed Opportunity card: current Salesforce values
```

The published layout supplies record sections and field labels. The action controls
the fixed three-field form; missing permissions/configuration make it unavailable
with a specific explanation, never an executable partial action. Support narrow
inline containers with stacked inputs; no fullscreen or nested Salesforce iframe
requirement. All controls have labels, keyboard operation, visible focus, inline
errors and an announced status. Review moves focus to its heading; invalid input
moves focus to the first error. Primary controls remain reachable by scrolling in
both clients. Follow existing record/edit/review/receipt design references 1a–1d/4c.

Back retains accepted answers and invalidates the review. Cancel discards the
interaction's draft without CRM DML. After confirmation is sent, replace Cancel
with **Check save status** until the server outcome is known. A host denial before
dispatch is unsaved; a timeout after possible dispatch is **Save status unknown**.

## 4. Studio configuration and supported interpreter boundary

Add one native **Opportunity edit** action preset using the existing action name,
label, enabled state and layout publication workflow. It targets only StageName,
CloseDate and Amount, with current-record defaults, in that order. Existing mapping
types remain stored for existing actions; alternate-field/constant/answer defaults
are outside this new preset. Record identity is implicit server-bound context.
Drafts cannot launch it. The Studio preview uses the same presentation component
and a clearly marked synthetic fixture; a preview never authorizes CRM access.

The smallest interpreter slice is a server-owned, immutable versioned Cardstack
process: `edit → review → completion`, with explicit Back and Cancel transitions
and exactly one update effect to the current Opportunity. Reuse earlier graph/input/
effect concepts in Apex, after correcting the re-audit findings. This first slice
does not import Salesforce Flow metadata or require the full legacy expression engine.

Bounds: three states, three inputs, one current-record effect, no user-authored
expressions or graph, no traversal beyond one declared transition per request,
15-minute absolute interaction lifetime, 16 KiB decoded tool arguments, 32 KiB
serialized private interaction state. Retain the ingress's existing tighter
limits where applicable. Bound text by field describe limits; reject oversized
state and unknown fields/operations before execution. The only choice provider is
the specifically implemented Stage provider. Display text is escaped plain text.

Reject loops, subflows, dynamic/dependent custom choices, lookups, custom LWCs,
file uploads, waits, action calls, arbitrary formulas, create/delete, multi-record
updates and general transaction/rollback semantics. Labels say **Cardstack
Opportunity edit**, not “Run Salesforce Screen Flow.” Later two-screen authored
processes and metadata imports need separate compatibility and acquisition designs.

## 5. Field contract and Stage feasibility gate

Stage submits the exact API value; labels are display only. The provider uses the
record's actual RecordTypeId, not the user's default record type. No-record-type
records use the platform-defined master context with a valid checksum18 ID.
Recommended provider: `ConnectApi.RecordUi.getPicklistValuesByRecordType` in Apex,
extracting only StageName options after object/field/record/policy checks. No new
credential, token handling or browser call to Salesforce is proposed.

The [API 67 RecordUi reference](https://developer.salesforce.com/docs/atlas.en-us.262.0.apexref.meta/apexref/apex_ConnectAPI_RecordUi_static_methods.htm)
documents the method from API 66, no Chatter requirement, and a restriction on
packages using push upgrades. The reference body was read in a rendered browser
with API 67 selected on October 11; plain web extraction returned a shell and the
skill's optional Python extractor lacked Playwright. No dependency was installed.
Documentation establishes an available API, not working Cardstack installation.
Current distribution is unlocked; package creation/install and ordinary-user Site
execution must still prove compatibility. Guest availability in this API never
overrides Cardstack's guest denial.

Before broader renderer work, establish API 67 compile/package compatibility,
connected-user operation and faithful Stage options for two distinct record
types/sales processes, including inactive/disallowed choices. Fetch options at
open, review and confirm; compare a canonical options/context fingerprint. Missing,
changed or unreadable context fails closed. Generic Apex describe choices or a
free-text Stage field do not pass this gate. If this provider fails, return the
specific unsupported capability and revisit the design; no credential workaround
is implicitly authorized. A no-longer-selectable current Stage is shown separately
and may remain unchanged; it cannot be selected as a new value.

The [official picklist reference](https://developer.salesforce.com/docs/platform/lwc/guide/reference-wire-adapters-picklist-values)
supports record-type scoping and distinct display labels/API values. Sales-process
fidelity through the chosen Apex method remains a live acceptance gate.

Close Date is a calendar date: strict valid `YYYY-MM-DD`, no timezone conversion.
Stage and Close Date cannot be cleared. Amount uses plain decimal text plus
`inputmode=decimal`, transported as a string and parsed to Apex Decimal. Preserve
zero and exact precision; enforce field precision/scale; reject grouping, symbols,
exponents, non-finite values and silent rounding. Negative values remain permitted
when field/published policy and Salesforce business rules permit them. Show record
CurrencyIsoCode in multicurrency orgs, otherwise the verified org currency; missing
currency context makes editing unavailable. No currency editing or conversion.

Amount clearing is an explicit operation producing null only when allowed.
Blank date/amount input is an error, never an inferred clear. An omitted field means
keep current; a set operation carries a literal string; clear carries no value.
Canonical typed equality removes no-op changes; all no-ops produce a no-change
completion without confirmation or CRM DML. Canonicalization is visible in the
server review and cannot change after confirmation.

## 6. Tools, authority and durable confirmation

Proposed product URI: `ui://cardstack/opportunity-edit-v1.html`, matching
`text/html;profile=mcp-app` and self-contained StaticResource content. Keep SDK
1.7.4. No Node server, custom accounts, external assets or CRM data in the bundle.
Register result/context/teardown handlers before connecting. Host-proxied calls
are the only data path. Strictly check schema/contract versions; ignore late results
for a different record, interview, revision or browser request generation.

| Proposed tool | Visibility | Contract |
| --- | --- | --- |
| `cardstack_opportunity_open` | model + app | Record card and published available actions; record ID normalized/validated to checksum18 |
| `cardstack_opportunity_edit_start` | app | Bound record/action context, editable values, options, private interaction handle |
| `cardstack_opportunity_edit_transition` | app | Review / Back / Cancel / Resume / Confirm operations with exact schemas and expected revision |
| `cardstack_opportunity_refresh` | app | Authoritative user-mode record read; also follows successful save |

Text fallback reports safe state/action availability but cannot confirm this UI
flow. App-only visibility reduces model exposure; it is not authorization or proof
of a human gesture. Do not expose an alternative model-visible save endpoint for
this scenario. Existing Hosted MCP beta tools retain their separate contracts.

Private handles and one-use review grants arrive only in MCP result `_meta`, kept
in closure memory and host-mediated arguments. They are absent from text,
structuredContent, DOM text, browser storage, model-context updates, logs and safe
receipts. This is routing hygiene, not secrecy from the host. Server authorization
always rechecks the connected actor and current rights.

Apex stores actor, normalized record ID, published action/process version/hash,
published policy hash, connection configuration revision, interaction revision,
start expiry, initial SystemModstamp/read values, Stage/currency context, canonical
answers, reviewed patch, review revision and final outcome. System-mode private
state access is narrow and actor-gated; CRM queries and writes use user mode/sharing.

Review performs reads and strict validation only; private review-state persistence
is allowed. It performs **no trial CRM DML**. The old preview's update/rollback is
not safe to reuse for this guarantee: [Salesforce documents](https://developer.salesforce.com/docs/platform/platform-events/guide/platform-events-intro-emp.html)
that immediate events can survive transaction failure/rollback. Review does not
promise to predict validation rules, triggers or automation; those run at save.

Only the final **Confirm and save** gesture dispatches Confirm for the current
server-generated review. Confirm accepts its private grant and expected review/
interaction revision, not new values, a new record/action or a caller Boolean.
The server recomputes the exact canonical patch from pinned state and binds its
grant to actor, record, policy/config/process revisions, review revision, expiry,
record freshness and option/currency context. Back, Cancel, correction, expiry and
drift invalidate an outstanding grant. Resume never silently creates approval for
different values.

Use a consistent lock order: connection setup → interaction → confirmation →
Opportunity. Serialize concurrent confirms/cancellation; lock and reread the
Opportunity before comparing freshness and validating all fields. A cancel wins
only before save commits; afterward return the completed receipt. Save the entire
reviewed patch in one user-mode update. No partial-field coercion/write fallback.
Durable audit, completion state and receipt commit with that update; failure to
persist required audit/receipt rolls back the transactional record changes. Known
DML errors roll back the save attempt, invalidate the grant and preserve answers
for a new review. Org automation may have nontransactional effects at confirmed
save; this flow does not promise universal rollback of those effects.

Duplicate Confirm/Resume returns the stored completion without another CRM update,
after current actor/access checks. It never consumes a fresh grant to replay.
Completed receipt lookup survives the edit expiry for the existing private-state
retention period; it does not extend write authority. The implementation plan must
pin the existing retention/cleanup contract and lock order in integration tests.

## 7. Failures, resume and refresh

| Condition | User-visible behavior and server action |
| --- | --- |
| Invalid field value | Inline field error; retain all answers; no review grant or CRM DML |
| Business validation/automation rejects save | Clearly unsaved; preserve draft; correct → new review → new confirmation |
| Record, record type, Stage options, currency, policy/process or setup changes | Old review invalid; offer reload/new edit; display latest values and explicitly reapply retained proposals before fresh review; no silent merge |
| Rights removed or wrong actor/record | Deny; do not return inaccessible draft/receipt/record values |
| Expired editing/review | No save; start a new interaction; do not extend expiry on use |
| Multiple tabs/stale revision | Reject stale mutation; Resume latest state; invalidate any obsolete visible review |
| Reload | Resume server-accepted draft/review or completion; unsent local keystrokes can be lost and are described as such |
| Lost Confirm response | Show unknown outcome; Resume/status first. Completed returns receipt; pending review requires status resolution before reusing the exact request; no new edit or inferred “nothing saved” |
| Save committed but refresh fails | “Saved; refresh unavailable” plus stored receipt and Retry refresh; never retry the write |
| Reconnect as another user | Old interaction denied; fresh card/edit for that actor |

After success, perform a fresh user-mode read and show the compact receipt above
the refreshed card. Distinguish reviewed values from actual current values if
automation changes them or a later edit occurs. An optional supported model-context
update contains only an authorized completion summary; its failure cannot undo or
repeat a save. No reliance on draft spec APIs, sampling or model-generated forms.

## 8. Acceptance and release boundaries

These are proposed gates, currently unproved for this new editor. Run separately
in actual Claude and ChatGPT; passing one never passes the other.

1. Published Opportunity action renders the actual custom card/form inside the
   host. Ordinary connected actor matches privately by full checksum18. Draft,
   disabled and denied actions cannot launch; guest cannot read or execute CRM tools.
2. Stage options match two distinct sales processes/record types; submissions use
   exact API values. Changed options/type invalidate review. Test master context,
   inactive current values, missing context and translated labels where available.
3. Submit all three fields literally; preserve zero/decimals; reject impossible
   dates, ambiguous formats and excess precision/scale. Prove explicit null versus
   omission and required/read-only behavior. No business automation runs at review.
4. Independent Salesforce read-back before final confirmation is unchanged; the
   UI shows the exact server diff. Tampered grants/values, wrong actors, alternate
   IDs/actions, stale revisions, expiry and drift cannot save.
5. Confirm once; independent read-back matches the expected patch and allowed
   automation effects. Receipt and refreshed card render correctly. Duplicate
   confirms, lost responses and reload/reconnect cause no repeated CRM effects.
6. Exercise Back/correction, Cancel, no-op, validation failure, stale record,
   two-tab concurrency, denied host calls, disconnected bridge and failed refresh.
   Unknown outcomes remain unknown until authoritative recovery. Both clients
   pass keyboard/focus/narrow-container and scroll-to-primary-action checks.
7. Test policy/permission removal, installed upgrade/contract drift and access
   loss during review/recovery on the exact new artifact. Account HXL regressions
   remain covered; the new path has no HXL dependency.
8. Relevant native/Studio/bridge tests, scoped Code Analyzer, complete dev-org
   Apex suite, fresh package coverage/install/installed suite and actual client
   QA record new counts/source/version/revisions. Prior 124/332 counts are historical.

Direct wire rejection with client-held revoked access/refresh tokens and actual
refresh-token rotation remain independently unmeasured. They do not block design
work, and the bounded refresh/reconnect evidence is reusable background. Before
production release, require a separately reviewed provider-supported verification
or an explicit acceptance of the narrower lifecycle claim. Do not extract host
credentials or reopen broad auth investigation just to produce a green label.
Full MCP audience/resource conformance and portability remain separate open limits.

Live tests need a newly authorized disposable org/client/fixture bundle: the old
scratch org and owned QA connections were removed. Preserve original beta, apps,
connections and settings. Restore temporary configuration and owned QA resources;
API 67 deployments follow the documented JWT procedure and Card Stack SFAPP ends
JWT ON. No publish, promotion, push/merge, original beta upgrade or HXL binding
retirement is authorized by this design.

## 9. Approval requested

Approve or amend: one three-field custom form, read-only server review, explicit
Confirm and save, atomic exact-patch execution, receipt plus refreshed card,
ConnectApi Stage provider subject to its feasibility gate, and the fixed bounded
Cardstack process. Approval permits writing the detailed implementation plan;
implementation follows plan approval using the selected scoped subagent workflow
and separate spec/quality reviews. Live deployment/CRM QA and release/cutover need
their own concrete authorized scopes.

Self-review: source reuse limits, presentation alternatives, literal-value and
confirmation boundaries, interpreter exclusions, failure/replay handling and
per-client acceptance are explicit. No product code or live state changed.
