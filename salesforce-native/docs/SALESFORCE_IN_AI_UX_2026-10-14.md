# Salesforce in AI: record workspace recommendations

October 14, 2026. Design/research assessment, **not an approved implementation spec**.
Read against canonical checkout HEAD `f6eebd1` and deployed application `8f1b138`.
No product code, external account state, connection, deployment or package was changed.

The intended experience is straightforward: ask naturally for the correct Salesforce
record, recognize it immediately, edit familiar fields, review exact changes once,
confirm once, and see the result in the same workspace. The user explicitly asked
for fewer unnecessary buttons and rerenders that do not require scrolling down.
Preserving server confirmation, native validation and recoverable receipts is a
constraint of that experience, not a reason to expose internal machinery.

## Evidence and its limits

The [October 14 actual-host evidence](evidence/configurable-record-edit/studio-field-types-live-clients-2026-10-14.json)
establishes eight-field edit → server Review → Confirm → receipt → Refresh in actual
Claude and ChatGPT. Each save has independent Salesforce readback and one native
audit. Studio published a ten-field action and section ordering through config;
ChatGPT rendered that configuration without deployment. This proves the common
engine can scale beyond an Opportunity preset. It does not prove natural record
resolution, lost-response recovery in either actual host, delayed responses after a
record switch, non-Master live record-type contexts, or fresh installation.

Screens inspected from the ignored acceptance directory:
`chatgpt-configured-ten-fields.png` and `claude-lead-review-eight.png`. The first
shows the middle of a tall ten-field editor; the second shows an eight-row review
extending toward the host composer with its actions below the visible crop. They
support the observation that task controls become distant. A screenshot cannot
identify which ancestor currently owns scrolling or establish a before/after jump.
Do not call them proof that every rerender scrolls the outer conversation.

The [existing feedback](OPPORTUNITY_SCREEN_PRODUCT_FEEDBACK_2026-10-12.md) records
actual host reloads restoring an older Open snapshot, shared date/picklist/number
improvements, and artifact-cache friction. The [current scenarios report](CARDSTACK_CONFIGURABLE_SCENARIOS_2026-10-13.md)
records successful discovery refresh through the existing ChatGPT connection.
Keep content-addressed resources; avoid promising historical cards always recover.

## Concrete source findings

| Finding | Source and implication |
| --- | --- |
| The custom editor Open requires a record ID. | `CardstackRecordMcpAdapter.tools()` publishes `cardstack_record_open` with only required `recordId`. The proven edit journey begins after identity resolution; it is not a complete natural-name retrieval journey. |
| A legacy name resolver chooses the first match. | `CardstackGetRecordAction.doGetRecord()` searches up to three matches and chooses index zero, adding a summary suffix for others. That is a concrete ambiguity risk in that route; it does not establish that this legacy resolver is part of the custom Open path. `CardstackSearchAction` is Account-name-specific, not generic cross-object search. |
| Card, edit, review and receipt use different presentations. | `ui/opportunity-edit/view.mjs` shows Card fields as a flat `dl`, resolves sections only for Editing, shows Review as a flat before/after table, and appends the current read after receipt. Identity and section continuity are weak. |
| Every render replaces all child nodes. | `renderScreen()` ends with `root.replaceChildren(fragment)`. On same-state rerenders, existing controls, local touched flags, DOM identity and caret are not retained. This is not a keystroke rerender: input/change currently updates local touched state without invoking render. |
| Explicit focus exists, but preservation does not. | Error renders focus the first invalid input; phase renders can focus the heading. Existing tests near `opportunity-ui.test.cjs:1128–1157` verify textarea Enter retains focus and first-error focus. They do not test input-node survival, caret, selection or scroll across a same-state rerender. Ordinary `.focus()` may scroll; no `preventScroll` option is used. |
| Busy transitions remove the working form/review. | `controller.mjs.dispatch()` changes status to Preparing/Saving/Pending/Refreshing, then renders. The view renders form only for Editing and diff only for Review. Drafts are retained around review, but visible work disappears during latency. Completion refresh retains receipt and is already distinct from failed refresh. |
| Late-result and identity guards already exist. | Controller checks generation, request generation, record and interview before accepting awaited results, and checks object/record identity. Preserve these guards. They are source behavior and fixture coverage, not actual-host delayed-record-switch acceptance. |
| Height grows with content. | Current CSS has no bounded workspace scroll region or persistent action footer. Actions follow the entire form/table. `record-app.js` applies theme, variables and safe-area padding; it does not consume container dimensions or display modes. |

## Approaches

1. **Compact persistent record workspace — recommended.** Keep a stable identity
   header, sectioned content area, and visible task action bar inside the same app.
   Card/Edit/Review/receipt update its body in place. A bounded inner scroll region
   keeps controls close, with responsive fallback when the host cannot provide a
   useful bounded height. It solves the immediate task without another renderer or
   per-object screen. Tradeoff: inner and conversation scrolling require careful
   keyboard, touch and accessibility testing.
2. **Expand long tasks into an advertised host display mode.** Use the same engine
   in fullscreen when the host actually advertises it. This gives long forms more
   space, but adds a transition and cannot be the baseline in unverified clients.
   Treat expansion as progressive enhancement to approach 1, not another required
   button or a universal promise.
3. **Guided section-by-section editing.** Present one configured section at a time
   and then one global server review. This bounds height but adds Next/Back actions,
   hides surrounding record context and makes cross-field editing harder. Reserve
   it for genuinely multi-step governed scenarios, not the current ten-field edit.

Recommend approach 1, with approach 2 optional only after actual-host evidence.
Do not solve ten fields by adding a mandatory wizard.

## Proposed experience and stable contracts

**Resolve and open.** Natural language should reach an authorized resolver capable
of explicit object context and bounded search. Return typed NoMatch, Matches or
Resolved results. Show discriminators such as company/account, title, stage or
location only when permitted; name alone is insufficient for duplicates. Open
automatically only for a uniquely resolved record. Multiple plausible matches
require an inline choice; zero matches offer query refinement. Never select the
first match by revenue/order and imply certainty. IDs normalize to valid checksum
18-character form at ingestion and remain bound to all later actions. Model text
and candidate descriptions cannot authorize writes. This is a future read contract,
not an assertion that general record lookup is delivered. Reference-field Lookup
editing remains separately unsupported.

**Recognize the record.** A compact header persists across phases: object label,
record name, a few authorized identifying/highlight values, and snapshot/read time.
Salesforce familiarity comes from hierarchy, labels, compact highlights, section
headers, native choice values, required markers and clear field errors. Reuse
appropriate SLDS visual conventions within host theme variables; do not claim the
iframe runs Lightning Record Page or native LWC controls. Object label/icon and
header fields need checked server descriptors, never guesses from field API names.
Keep build identity diagnostic rather than everyday UI copy.

**Edit.** One published eligible task can appear as a single primary Edit/action
label; several distinct tasks need their actual task names or an action menu. Do
not silently combine separate policy/action scopes. A natural request to edit may
eventually open the selected eligible draft directly, but it still must call the
server-owned Start lifecycle. That is a separately designed entry path, not removal
of Start authorization. Today Start is app-only in `CardstackRecordMcpAdapter`;
the model-visible Open accepts only `recordId`, so direct conversational editing
requires a reviewed tool/entry contract change. Route “show this record” to the
read-only snapshot and “edit this record” to a resolved, explicitly selected
published action. Start creates a governed draft and does not write the record;
the later server Review and explicit Confirm remain mandatory. Use the configured
section order in Edit and Review.
Distinguish action membership from layout order: membership declares allowed
inputs; checked layout declares visual sequence. Additive order hints are not
authority and cannot hide an authorized required input.

**Review and confirm.** Review changes is the primary edit action. It obtains the
exact server diff and grant; it never saves. Review shows changed fields only,
section order, clear removals, empty text, Boolean meaning, and date/currency
context without altering exact canonical values. Confirm and save is the sole
write authorization. Back to edit and Cancel remain secondary because they have
different effects. They can be visually quieter, but must remain accessible.
No extra Open, Continue, Submit or confirmation modal follows this screen.
Do not collapse server Review and Confirm into one immediate write, even if the
product uses a shorter label. A no-change result explains that no save was needed.

**Stay in place.** Render pending feedback as an overlay/status within the stable
workspace while retaining recognizable draft/review content. Disable dispatches
during busy states; do not conceal the task or imply a pending save was cancelled.
Reconcile field nodes by interaction identity + field API. Preserve exact local
drafts, touched/clear intent, active field, selection/caret and inner scroll on
same-phase updates. Update labels/errors/disabled state without rebuilding the
entire form. Explicit phase changes may deliberately move focus once to the new
heading, using `preventScroll` where supported. Field-error focus deliberately
reveals the invalid control inside the app; that intentional correction movement
must not be mistaken for unwanted rerender scrolling. Start a new interaction on
context switches and reject delayed old results. Never restore a grant as part of
focus or scroll restoration.

**Complete and recover.** Show a compact saved acknowledgement and historical
receipt; fold detailed receipt rows behind an accessible disclosure when useful.
Refresh current values in the same workspace, retain the receipt, and timestamp
the read. Automatic post-save read is an optional future improvement: it should
require no new confirmation and must preserve Saved if read fails. Refresh remains
available for stale snapshots; Check save status appears only for unknown outcomes
or recoverable state. A reload without a recovery reference must explain that a
previous save may have completed, rather than claim it did not. Avoid exposing
private metadata mechanics in ordinary rep copy. Access denial clears unauthorized
presentation even if earlier content was visible.

## Host sizing and scroll boundaries

Installed local SDK `@modelcontextprotocol/ext-apps` **1.7.4** declares `autoResize`
(default enabled), `sendSizeChanged()`, `containerDimensions` and
`requestDisplayMode()`. The current app constructor uses defaults. Published
[App API documentation](https://apps.extensions.modelcontextprotocol.io/api/classes/app.App.html)
confirms automatic size reporting and that a mode request returns the actual mode,
which may differ from the requested one. The
[host-context documentation](https://apps.extensions.modelcontextprotocol.io/api/interfaces/app.McpUiHostContext.html)
describes container dimensions and advertised display modes. These are protocol
capabilities, not proof of Claude/ChatGPT behavior in this session.

Distinguish three things: preserving an inner element's `scrollTop`, focusing a
control inside the app, and moving the outer conversation viewport. The app owns
only the first two. The SDK surfaces inspected do not provide a conversation-scroll
command. Do not touch `window.parent.document`, assume top-level scroll access,
or create a model message/tool output on every local transition to force visibility.
Keep existing app-only transition calls in the same instance.

Proposed sizing: use host fixed/max dimensions when provided, maintain stable
header/footer and one `overflow:auto` content region, and report the actual outer
app size. Pick a tested fallback size when dimensions are absent; do not hardcode
an unverified universal 500px rule. Reconcile host-context updates and safe-area
insets, cap content within available height, and measure for resize feedback loops.
For hosts that cannot honor the bounded presentation, use compact flowing content
and a top action bar as fallback. CSS sticky within a long iframe does not guarantee
visibility against the host's outer scroll viewport. The acceptance claim should
be “local transitions remain in the same visible workspace in tested hosts,” not
“the app controls chat scrolling.”

## Exact component scope for a future approved milestone

| Component | Proposed responsibility |
| --- | --- |
| `ui/opportunity-edit/view.mjs` | Persistent shell/header/actionbar; keyed controls; sectioned review; compact receipt; targeted focus and scroll management. Keep the same renderer for supported objects. |
| `ui/opportunity-edit/controller.mjs` | Separate interaction phase from busy operation; preserve rendered draft/review during latency; expose public snapshot timestamps and phase transitions without weakening existing generations/grants/guards. |
| `ui/opportunity-edit/layout.mjs` | Shared checked visual ordering for card/edit/review; preserve complete coverage and required-input validation. |
| `ui/opportunity-edit/fields.mjs` | Retain exact strings/native descriptors and explicit clear; share readable review formatting. No expansion to unsupported types as part of visual polish. |
| `record-app.js`, `app.js`, shared entry styles | Consume dimensions/display context, apply safe areas, handle bounded height and resize reporting consistently. |
| `CardstackRecordMcpAdapter` and checked public contract | Only additive authorized identity/timestamp/layout descriptors if needed; read-resolution contract requires separate backend design. Do not change Confirm authority. |
| Studio preview | Run the same persistent renderer with synthetic identity and Save disabled; identify field capability support explicitly and preserve draft/published distinctions. |

The raw unsupported-field codes, transient metadata-invalid display and 39-row
configuration semantic diff are separate Studio authoring issues noted in acceptance
work. Improve human labels/reasons, represent metadata loading as loading rather
than invalid, and group true config changes. Do not bundle those into the rep-workspace
milestone or treat config semantic diff as the rep's server write diff.

## Acceptance and the smallest meaningful milestone

First milestone: **one complete existing Lead workspace in both hosts**, with its
current ten supported fields and sections, stable header, persistent action bar,
visible pending state, section-aware server review and receipt/current-read update.
This is the smallest milestone that exercises real length and every task phase;
an isolated CSS screenshot does not settle the user's complaint. Preserve existing
Opportunity and Contact compatibility. Keep generic natural record retrieval as
the next separately scoped milestone unless a verified upstream resolver already
supplies the correct ID.

Renderer/component verification and actual-host verification answer different questions:

- Renderer tests: same-phase control reference survives, focus/caret/selection and
  exact draft/clear intent survive, busy phase retains visible content, one primary
  action per phase, section order drives displayed diff, error focus deliberately
  reveals only the needed app region, Back/Cancel revoke confirmation, stale old
  results are ignored, known receipt survives refresh failure, authoritative denial
  clears presentation. Preserve textarea/composition/Enter behavior. DOM fixtures
  cannot establish real host viewport position or resize behavior.
- Real browser/synthetic preview: keyboard-only edit and review, native date picker,
  sandbox action activation, narrow layout, long text, tab order, stable action bar,
  inner scrolling, safe-area overlap and absence of resize loops. Save stays disabled.
- Actual Claude and actual ChatGPT, separately: open known record, recognize header,
  edit a middle/bottom field, induce validation correction, Review, Back, Review,
  Confirm, receipt and Refresh while recording app and outer viewport positions.
  Controls must remain reachable without a new conversation-scroll hunt after each
  transition; edited values and receipt remain visible in the same app. Observe
  focus and height before/after phase changes at narrow and normal widths. Verify
  exact independent native values, one audit/receipt, repeat-safe completion and
  zero effects for cancellation. Discovery refresh after a new resource address is
  separate delivery acceptance. Delayed switch/lost-response fault tests must be
  reported as unproved unless actually induced and observed.
- Natural retrieval acceptance for its later milestone: duplicate names never
  silently select a record; candidates reveal only permitted discriminators; a
  unique choice opens exactly its full 18-character identity; no-match/loading/
  denied states help refine without exposing inaccessible records. Test genuine
  prompts and host model behavior, not only direct known-ID API calls.

Success depends on user-observed continuity plus Salesforce corroboration. Local
renderer passes, API journeys and screenshots each support narrower claims.
