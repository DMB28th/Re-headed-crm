# Opportunity screen product feedback

October 12, 2026. The strongest product direction is a short, trustworthy task: change Stage, Close Date and Amount together, review the exact changes, confirm once, then see a receipt and current record. Keep that workflow and improve input clarity and recovery explanations before expanding the feature set.

This feedback separates source assessment from actual Studio observations. Corrected source `8ffd115f` has 35 passing renderer tests and consolidated source review. The installed beta still contains the earlier `95acd7d7` renderer. Whole-source checkOnly failed four unchanged legacy coverage thresholds; actual package installation and installed tests passed separately. Neither result establishes actual Claude/ChatGPT Opportunity editing. See [acceptance evidence](OPPORTUNITY_CUSTOM_UI_QA.md) and the [revised milestone](superpowers/specs/2026-10-12-reusable-screen-milestone.md).

Separate live installation evidence now passes: unreleased full UI beta 0.1.0.11 has 89% package coverage, installed successfully, and passed all 530 expected methods in a serial 44-class control. Actual ordinary-user journeys now passed in both Claude and ChatGPT against that installed beta plus the reviewed two-resource QA correction. Each host completed Open, edit3, server Review, explicit Confirm, receipt and fresh read. Native corroboration found exactly two saves with matching ordinary-actor audits and persisted receipts. Recovery and other-actor acceptance remain separate.

## What works well

The task fits a sales rep’s intent better than separate field edits. Server-owned review rows make the proposed effect explicit. Back and Cancel revoke local confirmation authority; a fresh review is required before saving again. That is a useful product contract, not merely an implementation detail.

Recovery is a particular strength. An interrupted request becomes Unknown; status checking precedes further action. A known save keeps its receipt when a subsequent read fails, while explicit access denial clears unauthorized presentation. Receipt and refreshed record are separate, so a later CRM change need not rewrite history. Preserve those distinctions in the user experience. [Controller](../ui/opportunity-edit/controller.mjs), [view](../ui/opportunity-edit/view.mjs).

The shared field registry and checked sections provide a practical reusable foundation. Exact decimal strings, calendar validation without timezone conversion, explicit clearing, field errors and focus to the first invalid input all serve real correction tasks. Unknown field types remain unavailable. [Fields](../ui/opportunity-edit/fields.mjs), [layout](../ui/opportunity-edit/layout.mjs).

Studio offers a named governed preset, explains draft versus publication, and uses the shared renderer for a visibly synthetic preview with Save disabled. Admins can learn the screen without mistaking sample choices for native Stage proof. [Studio authoring](../force-app/main/default/lwc/cardstackObjectConfig/cardstackObjectConfig.html), [preview](../force-app/main/default/lwc/cardstackOpportunityPreview/cardstackOpportunityPreview.html).

## What feels awkward in the source

Stage initially displays “Keep the current record value” instead of selecting the loaded Stage; the actual value appears underneath. This preserves intent but makes a familiar dropdown behave unusually. Optional fields combine an editable value with a separate Clear checkbox. Users must understand Keep, blank and Clear before they can confidently remove Amount.

Date is a text input with `YYYY-MM-DD`; money uses decimal keyboard hints but rejects separators and exponents. These rules preserve exactness, yet entering a familiar date or pasting `12,500.25` could become unnecessary correction work. Currency context appears in edit labels and card values, while review rows show raw before/after strings. [View and validation](../ui/opportunity-edit/view.mjs).

Pending operations replace the form or review with status content. Inputs survive in drafts, but the screen may feel as though the work disappeared. Recovery messages mention “host-provided private state,” which describes the mechanism rather than helping a rep decide what to do. Global errors sit outside field rows; actual focus, announcement timing and readability need observation.

## What the actual chat clients revealed

Both hosts rendered the real card and completed the governed three-field journey under ordinary QA actor A. Alpha offered Prospecting/Qualification; Beta offered Prospecting/Needs Analysis. Native readback matched both saves, one success audit and durable confirmation receipt each. Invalid inputs retained correction text and focused the first error. Cancel and the reserved native rule-rejection attempt produced zero save effects; the corrected proposal required a fresh review. This is actual-client/native evidence, not inferred from renderer tests.

The user’s direct feedback is now the immediate shared-control work: add a date picker, select the existing/server-provided initial picklist value and display commas in numbers. Apply these once in the reusable field registry/view, preserving exact canonical values, native choices and explicit Clear. These changes are implemented at fccf5162, with40/40 renderer tests passing and consolidated source review complete. The [approved QA update](SHARED_CONTROL_UX_QA_SCOPE_2026-10-12.md) is deployed and independently verified. Studio shows the native picker, selected initial Stage and grouped Amount. Final calendar selection and both updated host walkthroughs remain pending, so this is partial visual acceptance.

Both clients’ full chat reloads restored the original Open snapshot, without the later receipt or a Resume control. The old snapshot still called itself “Current Salesforce record.” That wording is misleading after a known save. A record snapshot must say what it is, and an explicit refresh must establish current values. Client-specific private-state retention remains a limitation; persisted Salesforce receipt state does not mean a host can restore its private recovery reference.

After native save rejection, the form retained the proposed values but called them “Loaded value.” I would call them “Starting value” and make the rejection reason more useful without leaking raw provider errors. The present generic message only asks for a new review; it does not identify the business-rule correction. That error-detail improvement is deferred, not delivered by the input refinements.

## What I would change first

These are unbuilt ideas, not delivered capabilities or implementation approval.

1. **A Stage picker with native context.** Show the current Stage clearly and offer only server-provided choices for the actual record type and sales process. Explain unavailable choices without inventing a frontend fallback. Pair it with an explicit unchanged/changed indicator.
2. **Exact date and currency inputs.** Add accessible calendar assistance while preserving the exact submitted date. Show currency and readable amounts alongside the canonical string; handle pasted formatting explicitly without JS Number conversion or silent rounding. Make clearing an obvious field action with an undo path.
3. **Reusable change rows and recovery panel.** Carry currency/date context into Review, distinguish removal from empty text, and retain a readable task summary while preparing or saving. Explain “Save outcome unknown,” offer Check status, and keep “Saved; refresh failed” visibly different. Show a context-switch indicator when changing records so discarded edit authority is understandable.

Later, reusable conditional groups could make larger tasks manageable, but only where the server publishes their policy and validates execution. Presentation reuse does not add backend capabilities: this Opportunity process still governs three fields. No arbitrary save API, frontend authorization or latent Flow engine follows from reusable controls.

## What the actual Studio session revealed

The installed preview displayed Stage, Close Date and Amount together, with synthetic labeling and Save disabled. But clicking Review did nothing. Chrome reported that the iframe sandbox blocked native form submission. Our previous JSDOM tests dispatched submit events directly and missed that browser behavior. This was a real usability failure, found before any governed save.

The source correction makes Review a direct JavaScript button action and handles single-line Enter without native submission. It preserves the sandbox and multiline input behavior. The revised 35-test renderer suite passes, and generated resources match the reviewed source. The approved two-resource QA correction has now deployed, and independent retrieval matched all four prepared hashes. Actual Studio then passed three-field Review, invalid-date correction/focus, Back, single-line Enter, Cancel and disabled Save. The generic showcase also preserved textarea Enter, exact large integers and explicit Clear. These observations establish Salesforce-hosted synthetic preview behavior, not governed saves or either chat client.

Studio makes the preset's requirements visible: enable chat edits and expose all three fields as editable. That helps an admin diagnose an incomplete configuration. The long setup guide and a contract label referring to package 0.1.0.8 while testing artifact 0.1.0.11 are confusing. I would shorten the first-run path and distinguish protocol contract version from installed artifact version in admin-facing text.

During actual authoring, switching chat edits on was insufficient until Stage Permissions was saved. After adding the action, the success toast appeared but the screen still showed an older draft. Native readback verified the exact saved action, and a normal reload exposed the correct publication candidate. I would unify the working draft across tabs, refresh it after mutations, and make saved, staged and published states immediately clear. This is observed admin friction; no additional correction is claimed here.

These observations reinforce the sequencing lesson: run the complete preview in its real sandbox early. A component can render correctly and still have an unusable primary action. Keep the browser checkpoint small but complete: edit, validation, review, Back and Cancel, with Save visibly disabled in preview. Then test the real server-owned confirmation and receipt in each host.

## Process and future live observations

Use the [three consolidated checkpoints](superpowers/plans/2026-10-12-screen-first-checkpoints.md): working screen, compatible execution, actual client acceptance. Stop adding microgates for lexical fixes or mirrored tests. Ask for decisions when scope or authority changes; report meaningful evidence once.

My sequencing needed to change. I let small backend validation steps consume too much of the milestone before there was a complete screen to assess. Passing assertions answered narrow questions, but they did not give the user a usable product. Next time I would build the complete edit/review/receipt path earlier, run necessary backend and package checks alongside it, and reserve the consolidated review for distinct security and recovery risks.

I would also check host setup permissions and disposable-org capacity before proposing a live-test environment. A disabled connector option in one workspace is different from the user's available personal QA session; neither should trigger another broad auth investigation. Environment checks should prevent wasted setup, while actual client acceptance remains the test of the product.

For live feedback, observe narrow-screen review, keyboard and screen-reader correction, native Stage contexts, task visibility during loading, receipt readability, reload retention and recovery in each host. Record observed outcomes separately from hypotheses; screenshots and a synthetic preview cannot prove a governed Salesforce save.

The bounded ChatGPT interruption experiment received a normal completion receipt and produced one matching native save. It did not induce a lost response; I would not count it as recovery acceptance. Total owned save effects are now3 of8, with temporary network throttling restored and logging kept off.

## Applying the foundation to a second scenario

The approved next milestone adds configurable Contact current-value actions through the shared custom renderer/controller and existing governed server lifecycle. LastName, Description and HasOptedOutOfEmail exercise required text, optional clearing and Boolean; an additional FirstName preview verifies configuration beyond the preset. Checked sections now travel into runtime. This source work is not installed Contact or actual-host acceptance.

Consolidated review caught important reuse gaps: the first preview remained tied to three sample fields, runtime discarded configured sections, and Contact tests had overwritten the legacy Account suite. The fixes make preview metadata-driven, retain checked layout and restore all16 Account tests byte-for-byte. Native compiler evidence caught a duplicate semicolon in the Contact tests; that was corrected without changing runtime behavior.

The first complete native batch executed330 unique methods, with291 passes and39 failures. Existing Opportunity and Account regressions passed. New Contact cases stopped at native field-access checks; the test factory had granted package access without the necessary Contact field rights. Read-only Describe confirms writable LastName/Description but omits HasOptedOutOfEmail for the QA admin, so its access must be established rather than presumed. A transient test-only permission helper now grants the exact native-permissionable inputs; it does not modify live actors or weaken runtime USER_MODE. Two discovery assertions were also updated to retain the original six tools and check the four additive tools. Later native runs established correct fixture access and exposed test-context issues: same-user permission evaluation, a malformed expiry fixture, and several separate MCP requests combined into one governor-limit budget. The latest attempt compiled successfully and passed329 of330 tests, with all12 runtime classes above75% coverage; its remaining failure was a test casting a native typed descriptor as a JSON map. The typed-descriptor repair advanced the same journey through Confirm, receipt replay and Refresh; independent readback then exhausted the restored outer test budget. Moving that one readback before Test.stopTest preserves the exact assertions and request-budget boundary. The final native batch at81e45fa passed330/330 expected methods, compilation and per-class coverage, with independent unchanged-source postcheck. This proves the native test checkpoint; live Contact acceptance is still pending.

For future scenarios, check native field eligibility for both authoring and runtime actors before relying on sample controls. Use representative complete journeys through the actual ingress, retain compatibility suites, and keep a configured-field/layout test that reaches beyond the preset. Source review and local tests missed native test-fixture permissions, so they cannot substitute for executed Salesforce tests.

The useful scaling unit is a registered scenario capability plus a configured screen, using the common interaction lifecycle. The second scenario exercises text, optional clearing and Boolean instead of copying an Opportunity screen. A future capability should supply native descriptors and authorization, exact canonical values, checked layouts and atomic writes; the renderer should reuse controls, change rows, review, receipts and recovery. Creation, search and multi-step work need their own execution contracts rather than being treated as generic record edits.

Components I would prototype next are a persistent record-context strip, explicit Changed/Unchanged/Cleared field states, compact section-aware review rows, and a receipt panel with Refresh and Check status. These are product ideas, not built claims. The most valuable next evidence remains a complete second scenario in both clients, followed by actual lost-response and record-switch behavior.

## October 13: the second scenario in real clients

Contact completed the whole shared flow in both ChatGPT and Claude under ordinary actor A. Native starting values populated required text, optional text and Boolean. Three-field reviews retained explicit Clear and exact false; each Confirm produced one native audit and persisted receipt, and Refresh retained the receipt while showing current values. Required-value correction focused the text input; cancellation before/after review produced zero effects. This establishes a real second scenario, not only a synthetic reuse demonstration. Temporary Contact setup was cleaned up exactly after evidence.

Studio's immediate post-save view still returned an older working draft and reset the visible form. Normal reload restored the native-staged fields and policy. A saved-draft indicator and reliable refresh across tabs are essential before scaling authoring to many scenarios. The Contact preview's accessible container still calls itself an Opportunity preview; that inherited label should be corrected alongside the authoring polish.

Host artifact identity is another application-wide concern. Claude loaded current Opportunity controls and a native calendar selection reached exact date Review/Cancel. ChatGPT, after tool refresh, still loaded older Opportunity HTML: a keep-current Stage sentinel, text date and ungrouped amount. The newly introduced Contact URI loaded the current shared renderer in both hosts. The installed Salesforce bytes were independently verified; constant UI resource addresses across changing bytes permit stale reuse. The exact cache tier is not established. Give every current editor build a content address, retain explicitly documented legacy aliases, and verify the loaded screen in each host after upgrade. This fix is source preparation until separately validated and observed live.

ChatGPT's model prose said no edits were submitted while the interactive screen later showed a native save receipt. The model's initial Open narration describes its own action, but reads as a statement about the entire ongoing task. Scope such wording to the Open call or avoid it. A persistent context strip should identify the starting snapshot, last refresh time and completed receipt; after another client changes the record, a previous “fresh read” needs a timestamp rather than an implication that it remains current forever.

I would prioritize an observable build identity for delivery diagnostics, a coherent saved/staged/published authoring state, a context-and-refresh strip and section-aware review rows. Keep diagnostic build details out of the everyday user path. Actual after-commit response loss and record-switch delay remain unexercised; backend and synthetic fixtures cannot substitute for those host observations.

The delivery correction also exposed a validation gap: source review and209 local checks did not detect an Apex enum/parameter naming collision. The first native dry run failed before tests, leaving the deployed app unchanged. Keep a real native compiler checkpoint early for Apex changes, then consolidate the behavior suite and actual host checks. Renaming the shadowing parameter is the complete causal source repair; more mirrored local tests would not establish native compilation.

## Delivery update: actual host observations

The approved content-address update deployed and the actual ChatGPT screen now shows the intended current Stage, native date picker and comma-formatted Amount. Both hosts selected a calendar date, received the exact native diff and cancelled. This closes the observed old-control symptom for these walkthroughs, without identifying the cache tier or claiming every future host upgrade is proven.

Claude’s accessibility calendar action focused the month segment without opening the calendar; clicking the visually observed icon worked, and keyboard date selection then worked in both hosts. ChatGPT prose said it could not verify rendering while the interactive card was visibly present. Keep model narration scoped to its own observations; the UI’s status and receipt should carry task progress. Browser focus changed repeatedly during testing, reinforcing the need for fresh observations before actions and a dedicated stable QA window.


## October 13 persistent integration and scaling

The persistent baseline now brings the shared editor and admin source together in
cardstack-spike2. Account Name/Description/NumberOfEmployees works through published
configuration using the existing generic controller and writer. Opportunity and Contact
also complete the actual native MCP journey. These are backend observations; this
persistent environment's actual host and Studio screens remain unobserved while personal
Chrome is paused. Earlier temporary-org host results retain their original scope.

What worked: one source/deployment owner prevented competing versions, immutable artifacts
made deployment and readback reviewable, and checking exact test identities exposed an
important omission in RunLocalTests. The complete run passed 772 methods. Keeping native
metadata authoritative also surfaced INTEGER precision0 and the live actor's limited
Contact fields early enough to support the actual configured journey without new grants.

What did not work well: native syntax, CSS-token compatibility and incomplete test fixtures
cost successive native cycles. A private acceptance runner initially treated an org display
field as an Authorization token; existing CLI-managed HTTP worked without an auth change.
Importing a native multiline callback registry as one entry was also rejected before
persistence. Standard preparation should include correct registry parsing, and native
compilation should precede a large behavior run when a new platform boundary changes.

I would keep compatibility, source review and the full native regression at coherent
integration milestones, while allowing renderer work and independent provider research
to proceed alongside them. The useful next product proof is configuration and field-type
reuse in the actual hosts. Lookup must earn its supported status through native search,
filter and selected-ID validation; a polished picker cannot establish that backend.

For the broader experience, I would build a stable record context strip with refresh time,
Changed/Unchanged/Cleared indicators, section-aware review rows and a receipt panel with
Refresh and Check status. Studio should show which fields are supported, why a provider
is unavailable, and whether a scenario is staged or published. These components should
serve many configured scenarios through the shared contracts. Build identity and deployment
diagnostics belong in a support view. The first three fields are an acceptance fixture;
they should never define the permanent screen architecture.

The current native recovery check deliberately leaves the Confirm response unconsumed,
then resumes and verifies one audit. It does not induce network loss inside a host. Actual
response loss and delayed results after a record switch remain the next browser observations.
See [the persistent integration report](CARDSTACK_PERSISTENT_INTEGRATION_2026-10-13.md).

### Personal Chrome checkpoint after resuming

Actual Studio staging, review and publication now passed for the Account section
label, with independent native readback. The earlier paused status above belongs
to the preceding checkpoint. Working authentication and the existing ChatGPT
connection were preserved.

ChatGPT tool refresh found a real integration issue: app-only transition/refresh
helpers also advertised widget templates. Only Open should render a component;
helpers should return data to the existing screen. Correction `54c3b02` changes
only those descriptors and their existing tests. Native and actual-host acceptance
of that correction are pending. This is why protocol and renderer tests cannot
replace real host discovery.

Studio review should filter serializer defaults from meaningful changes: one
section-label edit produced 23 review rows. The authoring stepper also retained
an attention state on Save draft after the saved indicator was present. Existing
Flow drafts displayed a raw `undefined` JSON comparison error. I would address
these together as review clarity work after the working editor milestone, using
semantic change summaries, a reliable Saved state, and an actionable comparison
error component. These observations do not invalidate the successful Account
publication.

### Working persistent ChatGPT screens

The corrected descriptor catalog now refreshes on the existing Delivery Probe
connection. Actual Opportunity and Account screens passed edit/review/Confirm,
receipt and Refresh in personal Chrome, with exact Salesforce readback and one
audit per save. Account's configured Overview/Account details sections appeared
without adding a controller or renderer. This is the useful reuse checkpoint.

Date uses the native calendar, Stage initially loads Qualification, and decimal
and integer inputs load with commas. Invalid decimal and fractional-integer errors
are clear and cancellation works both before and after review. Chrome automation
needed keyboard navigation for the native calendar popup; that is an automation
observation, not evidence that the picker is missing.

I would keep the Stage's current label visible after a validation rerender; it
currently changes to Keep the current record value, with the original value only
on the Starting value line. Currency display should retain its configured scale
across input, review, receipt and refreshed values. The value 32,500.50 currently
displays as 32,500.5 in later views; the native value remains exact.

The attempted real-host response-loss check used Chrome's custom download throttle
with fast uploads. A normal receipt still arrived and native readback showed one
save. This does not prove host recovery. Normal networking was restored and the
temporary profile removed. I would add a reliable client test harness at the host
bridge boundary before spending more writes on timing guesses. Its native calls
must remain real; local fault simulations must retain their renderer-only label.


### Persistent Claude parity and the next product checkpoint

The approved current Claude ingress is connected as **Cardstack Integration Claude**
in personal Chrome. Actual Opportunity and Account edit/review/Confirm/receipt/Refresh
passed, including the native date picker, existing Stage selection, visible decimal
validation and cancellation. Salesforce independently confirms exact values, one audit
per save and the connected native actor. This supersedes the earlier pending discovery
and host-acceptance notes. Existing ChatGPT/HXL/QA connections and the expired legacy
Claude entry remain intact.

The useful result is one published configuration reaching both hosts through one engine.
Account's Overview and Account details sections, required text, optional multiline text
and integer behave through the generic route. I would now expand the same supported-type
contract through a complete native lookup provider, then prove selected-ID validation,
permissions, review, cancellation and recovery before importing the picker. References
and ordinary picklists must keep an explicit unsupported status until those providers
exist. No second object controller or save engine is needed.

The next UI clarity checkpoint should combine the observed Stage label after validation,
configured currency scale, meaningful Studio review rows and reliable saved state. A
shared record context strip, section-aware change list and compact receipt/status panel
would make configured scenarios easier to trust. Keep these driven by metadata and
policy rather than growing bespoke screens. Date-picker automation used actual native
calendar navigation in both hosts; the control itself is present and working.

The two remaining host fault demonstrations require a reliable way to interrupt a real
response after commit and deliver a delayed result after an in-place record switch. The
Chrome throttle attempt delivered a normal receipt. Separate record cards do not prove
an in-place stale result. Keep backend recovery, local renderer guards and actual-host
proof labeled separately; do not spend additional writes on the same inconclusive method.


## Studio scenarios and field types: October 13 expansion

Current deployed source checkpoint: `8f1b138`, with runtime UI unchanged from the
435-pass local checkpoint. Native qualification passed 808/808 tests with 90.38%
coverage; independent retrieval verified all 329 deployed files. A real Lead MCP
journey passed 43 checks, saved all ten fields with one audit, and recovered the same
receipt through Resume/replay. Configuration-only maintenance passed seven checks
without another deployment or save. New actual Studio, Claude and ChatGPT checks
are blocked by the locked Mac; prior host evidence retains its original scope.

What works well in the implementation: the existing form now maintains a named
current-value action without changing its launch identity. Reordering inputs and
changing membership reuse native draft/review/publication. Opening an invalid
existing action permits repair, while Update and Save still enforce current native
eligibility, layout and denylist. One shared field registry and save lifecycle admit
independent picklists and bounded Email/Phone/URL; the preview remains explicitly
synthetic with Save disabled.

What needed correction: the original new provider path fetched options again after
a successful write, and completed recovery also depended on that availability.
The revised source carries write-time context through completion and uses a separate
static metadata pin for terminal receipt checks. Terminal capability cannot write;
pending edits still need fresh native options. Source review, local tests and native regression cover
this separation; the live API journey now also qualifies the complete adapter path. The first native run also exposed
redundant scalar record reads, counter comparisons across governor windows and an
unsupported native output-DTO fixture. The consolidated correction removes only
the redundant read, preserves all explicit native access/freshness/lock checks,
measures counters in one window and tests the production codec without guessing
undocumented DTO members. Full local
regression also exposed Contact fixture expectations that still excluded Email;
the correction retained permission, denylist, duplicate and Boolean checks.

The adapter correction and four distinct native tests resolved the live Start
failure. The later currency rejection was an incorrect QA proposal: native
AnnualRevenue is scale0 here. Respect actual metadata in acceptance fixtures as
well as the product; do not weaken validation to fit a test value.

The live failure adds a concrete lesson: field support must cross the entire public
adapter boundary, not just the provider, service and renderer. A passing native suite
is insufficient when its adapter fixtures exercise only old scalar fields. Add a
focused expanded-type adapter journey and retain live API acceptance as a separate
checkpoint; do not duplicate every service test at every layer.

What I would improve next: keep one owner and one immutable deployment procedure;
use supported-type changes to expand actual configured scenarios rather than add
controllers. Add precise, safe correction messages for native business-rule
rejections. Keep current values visibly selected after validation and label
starting snapshots and refresh times honestly. Maintain a small acceptance matrix
that separates component behavior, native execution and actual host observation.

Useful shared components to consider next (ideas, not delivered claims):

- A record context strip showing record identity, unsaved changes and last refresh.
- Changed/Unchanged/Cleared field indicators and section-aware review rows.
- A receipt and recovery panel distinguishing Saved, Unknown and refresh failure.
- A field support panel explaining native eligibility/provider limits and offering
  a repair path in Studio without implying permission or execution authority.

The Lead fixture now has native choices, exact multi-field confirmation, one audit
and independent readback. It still needs actual new screens in both hosts.
Lookup still requires a supported source-field restriction evaluator; ordinary
search or a polished picker does not establish that backend contract.


## Actual screens and admin learning October 14

What worked: both real hosts loaded existing native picklists, kept selections after
validation, formatted numbers with commas, reviewed eight fields together, saved
once, displayed receipts and refreshed exact native values. Studio Edit/Cancel kept
launch identity; actual draft review/publication changed another object's field
membership and section order without changing code. Native readback, rather than
an assistant's claim that a card opened, resolved the result.

What needs polish: the primary action form lists many raw unsupported-field error
codes before its controls. The preview includes Opportunity/Contact demo navigation.
Loading metadata briefly makes valid fields look invalid. Review expanded three
meaningful edits into 39 raw rows because defaults were materialized and moved fields
were compared by array index. Older unrelated flow drafts display a raw JSON parsing
error. Those drafts were preserved. The in-app browser's discard confirmation stayed
on a loading overlay; native cleanup succeeded separately, so GUI discard is not proved.

What I would change next: show eligible fields first, with a collapsed searchable
support panel for exclusions; retain native gating and precise reasons. Summarize
moves/additions/label changes by stable field identity while retaining exact raw
review and digest checks. Make metadata loading a pending state. Keep developer
fixture navigation outside the production preview. Explain that action ordering
controls field/review order and section layout controls placement in the form.

Useful shared components: a record-context strip with unsaved/refresh status, a
sticky Review/Cancel action bar for long embedded forms, a section-aware semantic
change list, and a receipt panel whose fresh read is visibly separate from historical
saved values. These remain proposals, not delivered claims.

Integration learning: after a resource version change, refresh existing ChatGPT tool
discovery and issue a fresh Open before investigating OAuth. This repaired rendering
without a new connection or security change. Browser iframe handles can change as
hosts remount cards; re-derive targets from current UI and never repeat Confirm to
recover a missing locator. Actual host network-loss and delayed-record-switch faults
still need a reliable method; do not treat normal successful receipts as those tests.

## Persistent workspace learning October 14

The deployed `5275b7e` shared workspace now has actual ChatGPT acceptance for the
configured ten-field Lead journey. Invalid Employees `1.5` produced a client error,
Back retained the proposal, re-review and one Confirm produced a receipt with one
new native save audit, and Refresh updated the header to the checked current name.
Cancellation before and after Review each left native values unchanged and added
zero audits. These outcomes qualify the supported scalar-field journey, not
REFERENCE lookup or natural name resolution.

The initial actual-host sizing check exposed a concrete defect: Claude's
`maxHeight:5000` was treated as a desired height, creating a 760px app whose action
footer exceeded the visible host area. The correction treats maximum height as a
ceiling over a preferred 500px overall envelope, preserves fixed-height semantics,
and retains the measured chrome-fit scrolling fallback. Synthetic normal/narrow,
long-name and fifty-action checks establish renderer geometry; actual-host
visibility remains separately observed.

Claude's existing conversation still failed to load the new resource after the
existing tool discovery was refreshed. A fresh conversation after that same refresh
loaded the corrected 500px app and then passed the complete ten-field journey:
invalid Employees `1.5` was blocked; Back retained the proposal; re-review, one
Confirm, receipt and Refresh matched the fresh name and every reviewed native
value. Both Claude cancellations preserved native values and LastModifiedDate
and added zero audits. The combined audit delta was two, one per host. The
historical-conversation loading failure remains a limitation despite that fresh
conversation success. No authentication or connection changes were made.

Both corrected apps had visible footers. At Claude's measured pre-Review and
post-Refresh checkpoints, its outer iframe stayed height 500/top 134/bottom 634 in a
720px viewport and the enclosing ancestor scrollTop 186 stayed unchanged. This
supports observed continuity at those checkpoints; it does not establish control
of the host viewport or qualify uninduced response-loss/switch faults.

Qualification stayed coherent: the `3daad61` baseline passed 808/808 native tests
at 90.38% coverage with 329 reconciled metadata readbacks and nine explained native
XML defaults. Only three StaticResources changed for `5275b7e`; all 357 non-UI core
files are byte identical. The UI delta passed 124/124 exact resource/adapter methods
and six exact retrieved resource/body metadata files; final renderer checks passed
93 tests. Unchanged backend code did not undergo another claimed full 808-method
run. Actual-host lost Confirm response and delayed stale-record-switch faults
remain NOT_RUN. Root owns the final actual-host evidence and preservation receipts.

The next reusable experience improvement should address record resolution and deployment discovery continuity. A compact record chooser can disambiguate matching native records before opening the shared workspace. A clearer unavailable-screen recovery message should distinguish a changed UI resource from authentication trouble. Both belong to shared contracts rather than another object-specific screen. Keep the persistent identity, sectioned review and compact receipt as reusable components; implement lookup selection only when its native eligibility and save-time validation are complete.


## Combined-workspace learning, October 14 — qualification in progress

The new source adds an explicit native record chooser, configuration-only Case editing, related-list tabs and a bounded in-chat Flow lifecycle to the existing engine. These are implemented source claims while native qualification and new host acceptance remain incomplete. The deployed host evidence above still belongs to `5275b7e`.

The interface should spend clicks on decisions users understand: choose the right record, review the actual change and confirm once. Conditional fields should update from accepted server answers without an extra “Apply” button. Related children should open the same workspace with a clear parent breadcrumb, including the existing Stage-aware Opportunity route. Distinct tool families are implementation contracts; they should not force users into different-looking applications.

Native qualification exposed repeated publication/policy reads that exceed the SOQL budget across Flow lifecycle tests, plus unrelated archive fallback authorization reads. Local renderer checks did not and could not prove those native budgets. The fix must reuse validated metadata only within one operation, refresh authority at each new operation and always retain the final locked-record and provider checks. A UI improvement cannot come at the cost of stale authority.

Useful reusable components are now the compact record chooser, sectioned edit/review surface, lazy related-list table, parent breadcrumb and receipt/recovery panel. The next design assessment should observe these in actual hosts together: correct record selection, retained input after validation, quiet conditional updates, visible action footer, navigation back to the parent and a readable known/unknown save outcome. Host screenshots and native readback are the evidence; synthetic fixtures remain development tools.

I would preserve one source owner and one deployment artifact, and treat authentication setup as a separate exact-purpose dependency. Preparing a credential form is not a working native metadata connection. Unsupported fields, unsupported Flow elements and pending lookup authority should stay explicit while the supported path becomes usable.

Operational QA must follow the same metadata discipline as the editor. The persistent org has no Case RecordTypeId field; assuming it exists rejected fixture preparation before execution. Describe the actual fields and record-type defaults, represent a missing physical field explicitly, and retain the native Master context separately. This was a fixture-script issue, not evidence of a failure in the shared Case editor.

### October 14: combined workspace acceptance

What works: Case now uses the same editor through published configuration, and actual Claude and ChatGPT both complete a four-field review/save/receipt/refresh. Required fields, native rejected values, cancellation, and controlled reply recovery remain inside that lifecycle. The recorded inline screen stays 500px and confirm/refresh does not move the host chat scroll. Related lists page through native rows and open checked Contact and Opportunity children with a return to the parent. Opportunity editing loads the existing Stage, uses a date input, and formats Amount with commas.

What needs improvement: an admin preparation action must always leave a durable, readable result. The actual Flow preparation check exposed a report-display gap even though no candidate was saved. Existing admin drafts also need clear separation from the live layout; opening Account correctly shows its older saved draft, which must not be silently overwritten by integration QA configuration. The current related-list buttons and headings can be simplified after the contracts settle, without removing explicit review and confirmation.

Next UI components to consider: a Salesforce-style record header with compact actions; a persistent parent breadcrumb; related tabs with loading, empty, retry and paging states; a field-level error summary that focuses the relevant input; and a compact completion receipt that can expand to the exact saved diff. Keep ordinary navigation and input changes smooth while making Salesforce writes deliberate. These are product ideas, not delivered capabilities or authorization for new access.
