# Lookup and Salesforce-in-AI acceptance handoff

October 14, 2026. Documentation-only source/evidence review. Canonical checkout:
`mcp-apps-delivery-proof/Re-headed-crm`, inspected baseline `f6eebd1`; the current
integration checkpoint records deployed application `8f1b138`. Root alone owns
deployment, fixture/configuration changes, native runs and actual-client QA in
`cardstack-spike2`, API67. Preserve working connections and deployment JWT ON.
No browser/org action, test execution or product change was performed here. The
five pre-existing dirty files are outside this report's ownership.

## Gates and evidence boundary

The [current checkpoint](CARDSTACK_INTEGRATION_CHECKPOINT.md) records 808 passing
native methods, 90.38% coverage and deployed-byte retrieval for `8f1b138`, plus
separate actual Studio/Claude/ChatGPT field-type journeys. Those are existing
checkpoint claims, not fresh verification by this review. They do not establish
same-phase caret/scroll continuity, actual response-loss recovery, or delayed
host record-switch behavior.

Use four distinct evidence columns: **N** native Apex/provider authority and
independent Salesforce read-back; **D** DOM/controller fixture behavior; **B** real
browser layout/keyboard behavior; **H** actual Claude and actual ChatGPT, recorded
separately. A JSDOM fixture or generated-SDK JSON-RPC test is D, even if its name
says “real JSON-RPC.” A synthetic preview in a real browser is B and cannot prove
native completion. API-only acceptance is N/transport evidence, never H. Every
result must identify source/resource version, fixture, evidence tier and PASS,
FAIL, BLOCKED or NOT_RUN; do not inherit H proof across a changed resource.

There are three independent capabilities:

- **Existing known-ID workspace:** executable first milestone after UX changes.
- **Natural record resolution:** future read contract; duplicate-name prompts need
  an authorized resolver, not the reference-field picker. Known-ID Open cannot
  qualify this path.
- **Reference editing:** blocked by complete restriction evaluation, live freshness
  and exact-ID eligibility. Keep REFERENCE unsupported until the
  [native contract](LOOKUP_NATIVE_CONTRACT_2026-10-14.md) qualifies it. The
  [picker handoff](LOOKUP_INTEGRATION_HANDOFF_2026-10-14.md) supplies presentation
  reuse, not this authority.

## Minimal acceptance matrix

Rows are distinct failure boundaries. Repeat the common happy journey once per
host; reuse its receipt/read-back rather than create a save for every visual row.
New test descriptions below are requirements, not existing test identities.

| Boundary | Smallest stimulus and pass condition | Evidence/dependency |
| --- | --- | --- |
| Correct record from conversation | Two accessible records share a name and have permitted discriminators. A genuine host prompt must offer a choice without opening the first candidate. Select the second; header and server identity match its full checksum18 ID. Unique match opens only that record; no match supports refinement; denied candidates disclose no protected fields. | New resolver N contract + each H. BLOCKED until resolver exists. Existing direct known-ID Open remains a separate baseline. |
| Lookup eligibility, forged ID and drift | Use one eligible target and one readable-but-ineligible target. Search excludes the latter; submit its exact ID directly to Review and it is rejected without grant/write/audit. Separately reject malformed checksum/wrong native target IDs. Review an eligible selection, then change a controlling value/restriction/access before Confirm; fresh locked validation rejects without CRM write or save audit. Test effective simultaneously changed controls, not only persisted source values. | New provider N positives/negatives and shared adapter D; H safe visible errors after integration. BLOCKED until complete native predicate/freshness qualifies. A generic target search, provider-unavailable test or final DML error alone cannot pass this row. |
| Same-phase continuity | In the ten-field Lead, focus a middle/bottom input with a selection/caret and exact unsaved text; retain another field's explicit clear intent. Trigger a same-Editing update/lookup-result update. Same node, active field, selection, draft and touched/clear intent survive; unrelated control changes do not steal focus. Inner scroll anchor stays stable. | New D node/selection assertions; B real focus and measured inner geometry; each H app and outer conversation position. Do not claim DOM scroll geometry. Deliberate invalid-field reveal is assessed separately. |
| Loading remains recognizable | Delay Review, Confirm and Refresh separately. Header plus draft/review/known receipt remain recognizable, status explains the pending operation, actions disable duplicate dispatch and remain reachable. No blank task; pending Confirm must not offer a misleading cancellation. | New D busy-content assertions; B normal/narrow widths, safe areas and no resize loop; each H visible latency. Transport delay is an explicit fault stimulus, not simulated CSS loading. |
| Governed happy journey and cancellation | In each host: known-ID Lead Open → Edit middle/bottom fields → invalid Review correction → valid Review → Back → Review → Confirm → receipt → Refresh. Review displays exact server before/after values in section order; Confirm alone writes. Independent native read-back equals reviewed typed values, exactly one save audit and one durable receipt identity; replay returns that receipt. Cancel before and after Review yields zero CRM changes/save audits and revokes authority. Receipt persists if Refresh fails; fresh current values are distinct from history. | Reuse existing N lifecycle tests and extend only new section/presentation D checks. B keyboard-only navigation/tab order/date control; each H plus N read-back/audit. Workspace/action visibility, inner scroll and outer viewport recorded at every phase. |
| Lost Confirm response | Actually withhold/drop the returning Confirm response after the backend may commit. UI reports unknown outcome and offers status recovery; it does not issue another Confirm. Resume returns authoritative original receipt or safe current pending/denied state. Independent read-back/audit proves at most one save. | Existing D/N recovery tests reused; new controlled each-H fault evidence. Leaving an HTTP response unconsumed proves backend recovery only. If host fault injection is unavailable, mark H NOT_RUN and retain that limitation. |
| Delayed stale-record switch | Hold old Review/search/read reply; switch to a different record/object and, separately, a fresh same-record interview. Release old success and old rejection. New identity/draft/focus remain; old choices/grant/errors cannot replace it or enable Confirm. Detached picker callbacks/timers are inert. | Existing D controller tests + new picker integration D; B context switch; controlled each-H delayed reply. Actual host test depends on a supported fault seam and switch path; do not reopen auth or inject unsupported host internals to create one. |

Record outer conversation movement independently of inner `scrollTop`: capture the
app's viewport rectangle and stable neighboring conversation anchor before/after
each transition, together with focus and inner position. A deliberate phase-heading
focus or invalid-field reveal may move the app's inner region to the relevant
control. Passing means the same workspace and primary action remain reachable
without hunting through chat after each local transition. The iframe cannot promise
control of the host's outer viewport. No parent-document access or extra model
messages are an acceptable scroll workaround.

## Existing tests to reuse

Exact identities inspected in canonical source; no runs were performed here.
Paths below are relative to `salesforce-native/`.

| Coverage already represented | Existing identity |
| --- | --- |
| Draft/error retention | `tests/opportunity-ui.test.cjs`: `server validation returns editing with field errors and retained drafts`; `restored Review resumed then Back preserves complete displayed proposals through the next server review` |
| Enter/focus compatibility | Same file: `single-line Enter reviews directly while textarea, choice, composition and disabled forms retain their behavior` (contains textarea-focus and first-error checks; does not prove same-phase node/caret preservation) |
| Known completion/read failure | Same file: `known completion survives failed refresh; fresh card is separate from immutable receipt` |
| Unknown outcome recovery | Same file: `lost save response offers status recovery only; Resume recovers receipt without repeating confirm` |
| Controller stale authority | Same file: `record input switch and late response cannot replace new card or enable old confirmation`; `delayed response for same record but wrong interview cannot grant confirmation` |
| Generic cross-object switch | `tests/record-ui.test.cjs`: `cross-object host switch discards delayed review and private authority`; `same-ID cross-object awaited response cannot install review authority` |
| Lead compatibility | Same file: `generic Lead renderer uses independent selects and literal native string controls`; `generic controller retains checked published sections and columns` |
| Review/cancel native boundary | `CardstackOpportunityEditServiceTest.reviewDoesNoCrmDml`, `.backAndCancelInvalidateGrant`, `.confirmCannotReplaceReviewedPatch` |
| Save/audit/recovery native boundary | `CardstackOpportunityWriteServiceTest.repeatConfirmReturnsOriginalReceipt`, `.lostResponseResumeReturnsOriginalReceipt`, `.requiredAuditFailureRollsBack`, `.receiptFailureRollsBack`, `.changedFreshnessCannotWrite`, `.cancelAndConfirmSerialize` |
| Disabled type baseline | `CardstackRecordScreenCapabilityTest.shouldRejectUnsupportedConfiguredField` |

Reuse canonical `record-fields`, `record-ui`, `opportunity-ui` and
`opportunity-protocol` local suites. The lookup checkout's 70 passing picker/form
fixture tests are separately recorded by its owner; use picker checks when imported,
but do not replace the shared lifecycle with that standalone form. Add focused
checks only for adapter nonce/revision/fingerprint mismatch, node/caret/busy-content
retention and detached picker lifetime. Existing scalar freshness tests need new
lookup-specific native cases before supporting lookup claims.

## One meaningful milestone regression gate

Qualify **one complete current ten-field Lead workspace in both hosts**, retaining
Opportunity and Contact compatibility. Use the persistent shell, visible action
bar, retained busy content, section-aware Review and receipt/current-read update
defined in [the UX design](SALESFORCE_IN_AI_UX_2026-10-14.md). Keep natural resolver
and positive lookup enablement gated; their blockers need not prevent this useful
UX milestone. An isolated screenshot or CSS change is insufficient acceptance.

1. Root integrates/reviews exact source and runs focused local renderer/contracts,
   resource and applicable Studio checks once. B preview covers narrow/normal
   widths, keyboard, inner scrolling and sizing; Save remains disabled there.
2. Prepare one immutable artifact through the existing inventory/checkpoint tool.
   Run consolidated API67 `RunAllTestsInOrg` once for the integrated milestone,
   reconcile exact expected ordinary test identities (including the retained 40),
   errors and deployment coverage. Updated test/component counts must come from
   the artifact inventory, not blindly from the old 808 summary. A subsequent
   executable fix requires a fresh artifact and qualification.
3. Root deploys that identical qualified artifact in the already authorized scope,
   verifies retrieved source/resource parity and JWT ON. After a changed HTML
   address, refresh existing discovery as required; preserve current connections.
4. Run the matrix's applicable known-ID Lead journey in actual Claude and ChatGPT
   separately, corroborated by native read-back/audit. Use short Opportunity and
   Contact smoke checks for shared-engine compatibility, not duplicate ten-field
   journeys. Capture normal/narrow continuity; label uninduced fault rows NOT_RUN.

Release/production-install claims still need the separately requested fresh-install
checkpoint. Enabled lookup requires its provider/authority gate and corresponding
native + both-host rows; natural retrieval requires its resolver row. Report the
Lead UX milestone as accepted only for its actually verified scope, with any host
fault/outer-scroll limitations explicit. Root owns all execution and final claims.
