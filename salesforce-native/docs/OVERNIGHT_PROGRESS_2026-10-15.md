# Cardstack overnight progress and current status

Reviewed October 15, 2026 against **Editor Chat**, the combined milestone report and integration source. This replaces the October 14 documentation update's “client acceptance in progress” status for Case editing, discovery, related navigation and controlled delivery faults. Flow metadata authorization has subsequently succeeded; metadata acquisition and interpreted Flow acceptance are still being checked in the active chat.

## Built deployed verified and pending

| Capability | Built and deployed | Verification now recorded | Still pending or bounded |
| --- | --- | --- | --- |
| Shared configurable record editing | Combined baseline committed as `a9a304e`; v6 developer QA artifact plus scoped native corrections deployed to `cardstack-spike2`, API67 | Both Claude and ChatGPT completed Case chooser/open, four-field editing, required validation, review, cancellation, fresh review/Confirm, receipt and Refresh. Native readback confirmed exact changes and one audit per successful save; cancellation had zero effects. | Exact developer QA variant was tested. No fresh-install/release claim or universal object/type support. |
| Case configuration reuse | Published `layout:Case:default`, action `case_details`, using the existing renderer, controller and native writer | Four configured fields saved in both clients. Read-only CaseNumber identity and required unmapped references remain separate from editable inputs. Claude's deliberately invalid email save was rejected with unchanged values and zero audit. | No Case-specific engine was needed. Other unsupported fields do not become editable through configuration. |
| Record discovery | Explicit-object search adapter and interactive chooser integrated | Both clients exercised exact-ID Case discovery. Owner also reports ambiguous Contact searches returning choices and opening the intended record only after explicit selection. | These bounded search/selection journeys do not qualify arbitrary natural-language intent or every search/object case. |
| Related lists | Published Account related configuration, native policy/selector/service/adapter, shared page and child navigation | Each host displayed all six Contact and six Opportunity fixture IDs over three pages per list, no duplicates. Checked Contact/Opportunity child open and parent return passed, with zero write/audit effects. | Native FLS/sharing and published restrictions remain authoritative; pagination is not a frozen concurrent-record snapshot. |
| Opportunity child compatibility | Five-class native patch deployed | Related CloseDate uses calendar-date projection. In Claude the child editor showed current Stage, date control and comma-formatted Amount; cancellation had no effects. Both hosts passed child navigation. | Do not infer a new full Opportunity save acceptance from this child navigation/cancel check. |
| Lost Confirm reply recovery | Existing native Resume/receipt lifecycle exercised through explicitly enabled QA delivery controls | In both hosts a real resolved Confirm reply was discarded, Unknown appeared, Resume returned the same native receipt and Refresh showed exact saved values. One save/audit per host; Resume added none. | Controlled SDK-to-renderer loss, not natural network outages, arbitrary transport failure or full-page reload recovery. |
| Late related-page rejection | QA control holds/releases a real page response | In both hosts, held Account page → native switch to Case → release old page preserved the new Case and displayed no old rows. | Recorded context-switch scenario, not every timing/failure combination. |
| Historical UI archive | Four exact Record/Opportunity bodies from `3daad61` and `5275b7e`, fixed URI/family allowlist and digest verification | Included in combined source and native qualification; bounded retained-resource support implemented. | No new proof that every old conversation reloads successfully, retains drafts or accepts new DTOs. |
| Studio related authoring | Native relationships and Contact column choices load | Actual Studio inspection succeeded without replacing existing drafts. Account related configuration was published through reviewed native publication. | Not every keyboard/theme/admin error-recovery acceptance row was repeated. |
| Studio Flow report transport | Four-class primitive-map projection correction deployed and sources independently matched | 114/114 targeted native tests; actual Studio displayed `ACQUISITION_FAILED` / `ACQUISITION_CONNECTION_UNAVAILABLE`. Native readback found zero Flow draft/publication rows at that checkpoint. | This verifies truthful report delivery, not successful metadata acquisition. The connection state changed afterward; see below. |
| Bounded native Flow interpreter | Compiler/plan/compatibility/service/provider/Studio foundation included; native two-screen fixture validated and deployed | Native/local qualification recorded. Dedicated Flow OAuth subsequently succeeded; a real Apex managed callout verified the expected QA user and persistent org. | Studio exact-version metadata loading/compilation is currently under test. No successful managed Flow acquisition, publication or actual interpreted host journey is yet recorded in the reviewed latest turn. |
| Reference lookup editing | Prepared dedicated connection and partial backend/qualification work | Latest chat confirms Lookup provider Client ID saved. Earlier narrow QA principal assignment/configuration evidence remains. | No successful Lookup OAuth/same-user callout or enabled provider demonstrated. Product-contract decision and native backend qualification remain separate. REFERENCE stays unsupported. |

## Exact source and deployment boundaries

`a9a304e` is the committed combined source baseline. The integration owner's report separately identifies the deployed v6 developer QA ZIP and its renderer hashes, then the five-class related compatibility patch and four-class Flow report transport patch. The source commit is not itself a claim that every deployed resource equals the ordinary generated assets in Git.

Normal local generated resources and demo fixtures were restored and independently verified, with 63 relevant renderer/delivery checks passing. **That restoration is local source preparation, not a deployment of ordinary UI resources.** The recorded org still used the v6 developer QA renderer hashes during the native patches. QA delivery controls default off in ordinary builds.

| Recorded qualification | Result and scope |
| --- | --- |
| Broad v5 native check-only | 232 components compiled; 938/940 tests passed, two catalog query-count assertions failed. Preserve the failures as historical evidence. |
| Corrected deployed native suite | 108/108, including the two catalog assertions. This is a focused correction, not another clean full 940-method run. |
| Final local integrated suite | 509/509. Local contracts/rendering do not establish native permissions or host execution. |
| Related compatibility patch | 103/103 focused native tests; exact five-class patch deployed; five source bodies matched. |
| Flow report transport patch | 114/114 targeted native tests; exact validated four-class job deployed; four source bodies matched. |
| Deployment integrity | Original v6 readback: 148 Apex sources matched after newline normalization, eight resource hashes matched. Later native patches separately matched and preserved the recorded QA renderer hashes. |

No new package release/promotion, fresh install or beta upgrade is established. The earlier installed beta 0.1.0.8 inventory and Railway observation were not re-queried during this documentation refresh. They remain dated observations, not fresh October 15 infrastructure verification.

## Flow connection has advanced beyond the older report

The committed combined report still describes Flow access as waiting for credential handoff. The newer October 15 active Editor Chat turn supersedes that connection status: the Flow provider was saved with the replacement secret confirmed by the user; dedicated per-user setup and the narrow QA assignment were completed; OAuth authorization succeeded; an actual Apex call through the managed connection verified the expected user and org. No credential values are reproduced here.

The owner is now testing Studio metadata loading and compilation. User/org verification proves the managed connection's identity for that call. It does not prove Flow metadata access, successful compilation, reviewed publication, ordinary-user execution or either host's interpreted interview. The earlier visible `ACQUISITION_CONNECTION_UNAVAILABLE` remains a valid historical report-display test, not necessarily the current error after authorization.

## What to do next

1. Finish Flow exact-version acquisition, compatibility/compilation and reviewed publication; then verify a supported interpreted journey, validation/Back/Cancel, review/Confirm, receipt and independent CRM readback in both hosts.
2. Finish the dedicated Lookup authorization and real same-user/org runtime qualification, resolve its separate bounded product contract, and qualify native restrictions/fresh selected-ID checks before enabling any reference field.
3. Record an ordinary-resource deployment and acceptance if the QA delivery variant is replaced; do not silently inherit acceptance across different resource hashes.
4. Qualify the exact integrated distribution artifact through fresh installation/upgrade before making release/onboarding claims.

## Evidence and review scope

- **Editor Chat**, ID `01a12b18-ea71-70a3-a73f-21ea0752cdfd`: completed milestone turn `01a13c38-78a9-77f0-a0c7-2c7010628a00`, final report naming `a9a304e`; subsequent Flow setup turns and active turn `01a13f72-7b8a-7141-ba5c-fdcf0a185276` reporting authorized identity verification.
- [Combined milestone report](COMBINED_WORKSPACE_MILESTONE_2026-10-14.md): native, deployed-byte, actual-host and controlled-fault results.
- [Related-list contracts](RELATED_LISTS_BACKEND_2026-10-14.md), [historical-resource/recovery contract](RECOVERY_AND_HISTORICAL_RESOURCE_2026-10-14.md), [Case candidate](CONFIGURATION_ONLY_CASE_REUSE_2026-10-14.md): earlier worker-level pending labels are superseded only by the later owner's actual qualification results.
- [Flow access preparation](FLOW_METADATA_ACCESS_ACTIVATION_2026-10-14.md), Lookup access preparation (private/local evidence reference omitted from this publication): preparatory configuration documents, not the latest authorization status. Use the later chat evidence above.

This refresh reads existing owner reports, current source history and documentation. It does not repeat host/native QA, change credentials/configuration, deploy source or contact another chat. The latest Flow turn remains active; this is a bounded snapshot, not a claim that all Editor Chat work is complete.
