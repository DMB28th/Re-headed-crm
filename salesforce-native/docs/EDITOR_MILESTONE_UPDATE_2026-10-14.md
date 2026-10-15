# Latest Editor Chat integration status

> **Current status — October 15:** Case editing, explicit record discovery, related-list navigation and controlled recovery/stale-result checks passed in both hosts; combined source is `a9a304e`. Flow OAuth and managed user/org verification succeeded; Studio acquisition/compilation is being tested. Lookup remains unsupported. See [overnight progress and current evidence](OVERNIGHT_PROGRESS_2026-10-15.md). Earlier inventory and test results below retain their dated scope.

October 14, 2026. This update supersedes the initial documentation's current-status statements where noted below. **Editor Chat is still active; the new milestone is deployed for developer QA, with actual Claude/ChatGPT acceptance in progress.** The earlier `5275b7e` Lead milestone remains the completed client-acceptance baseline, rather than the identity of the latest deployment.

## What changed

| Subject | Latest evidence | Documentation implication |
| --- | --- | --- |
| Integrated application | Editor Chat reports exact v6 QA artifact deployed; 148 Apex sources matched after newline normalization and eight resource hashes matched. | Earlier live inventory of 121 classes/117 source matches and five resources is a historical observation, not the new inventory. v6 is a frozen QA artifact designation, not a released package version or Git commit. |
| Qualification | 509/509 local checks; broad v5 native run 938/940, with two catalog-query assertions failing; corrected deployed focused suite 108/108. | Record the broad failures and focused correction separately. Do not describe this as a new clean full 940-test run. |
| Configuration-only Case reuse | Case editing is published through reviewed native configuration; owned fixtures prepared. | Reuse extends to Case without a separate Case renderer/controller/writer. Full client acceptance remains in progress. |
| Record discovery | `CardstackRecordDiscovery` and its MCP adapter are included in the combined milestone; `cardstack_record_search` produced interactive Case choosers during current host checks. | The former blanket absence of discovery is stale. Explicit object/query discovery is implemented and under acceptance; unrestricted natural-language resolution/disambiguation is not thereby proved. |
| Related lists | Native policy, selector, service, adapter and shared UI integration are included; Account lists published. | Document read-only pagination and checked child navigation. Child editing retains the existing record authority; Opportunity uses the Stage-aware route. Parent return and stale-response checks have focused renderer evidence; actual-host acceptance remains pending. |
| Bounded Screen Flow interpreter | Compiler, plan, compatibility report, service, metadata provider and Studio authoring are present in the integrated source. Native two-screen fixture validated and deployed at API67. | “No native interpreter built” is stale. This is a supported-subset interpreter under qualification, not Salesforce's complete Flow engine or a verified end-to-end host interview. Existing Flow launch cards remain a separate route. |
| Flow metadata access | Dedicated managed connection approved/prepared; direct human credential handoff pending. | No successful managed metadata acquisition or real interpreted Flow publication/journey is established yet. Approval/preparation does not mean connected. |
| Historical resources | Four exact retained Record/Opportunity UI bodies from `3daad61` and `5275b7e`, fixed family/hash allowlist and integrity checks. | Bounded historical resource delivery is implemented. Every old conversation, retained draft or changed native DTO is not guaranteed compatible. |
| Fault recovery acceptance | QA-only build can discard a real Confirm reply or hold/release a related-page reply. Ordinary builds default these controls off. | Test facilities are built, but actual-host recovery/stale-switch success must await recorded results. Controlled delivery faults do not prove natural network loss or full reload persistence. |
| Lookup | Native qualification and dedicated credential dependency still incomplete. | Keep REFERENCE editing unsupported. Discovery of records and related-list navigation do not enable reference-field writes. |

## Mapping additions

The existing scalar field-to-control mappings remain the baseline. The latest changes add read/navigation and interpreted-process contracts rather than another per-object HTML renderer.

**Case:** `layout:Case:default`, action `case_details`, maps `SuppliedEmail` (EMAIL), `Subject` (STRING), `Description` (TEXTAREA), and `SuppliedPhone` (STRING). The phone-like API name does not select the PHONE codec. `CaseNumber` is the read-only auto-number identity; `OwnerId` is a required native REFERENCE used in freshness/required-record validation, not an editable input. Action membership/order and section placement remain separate.

**Related lists:** canonical `layout.relatedLists` overrides legacy `recordCard.relatedLists`, including an explicit empty array. Native child relationship, ordered scalar columns, sort and page-size configuration produce `record-related-definitions/v1` and `record-related-page/v1`. Rows carry record identity/name and ordered literal cells; native metadata supplies field labels/types and monetary context. App-only definitions/page/open-child tools enforce parent/child access and checked navigation. Private continuation context is not field-write authority.

**Flow:** treat four surfaces separately: generic record editing, the fixed Opportunity process, Salesforce Flow launch handoff, and the new bounded native interpreter candidate. The last adds metadata acquisition, compatibility analysis, a compiled plan and server-owned interview state. Its supported metadata/component subset and exact variable/control/write contracts must be documented from the qualified version once connection and end-to-end acceptance finish. Do not reuse the launch-card's note echo as proof of interpreted variable submission.

## Remaining acceptance boundaries

The latest owner commentary says Case and Account related-list configurations are published and client checks have begun. Successful chooser rendering and opening a Case are narrower than a completed edit/review/Confirm/receipt/Refresh journey. The milestone report still contains older “pending deployment” and predeployment gate wording; its deployment/readback rows and later owner commentary supersede those rows only for deployment. They do not establish successful host acceptance.

No fresh installation, package release, new full-suite pass, enabled lookup provider, completed Flow metadata connection, universal historical-card recovery, or completed actual-host fault acceptance is claimed by this update. The earlier Lead two-client proof remains valid for its exact application and scope.

## Sources and next reconciliation

- [Editor Chat](codex://threads/01a12b18-ea71-70a3-a73f-21ea0752cdfd), active turn `01a13c38-78a9-77f0-a0c7-2c7010628a00`: deployment/readback, focused 108-test correction and current client checks.
- [Combined workspace milestone](COMBINED_WORKSPACE_MILESTONE_2026-10-14.md).
- [Related-list backend contracts](RELATED_LISTS_BACKEND_2026-10-14.md).
- [Configuration-only Case candidate](CONFIGURATION_ONLY_CASE_REUSE_2026-10-14.md): candidate's earlier unexecuted status is superseded by combined deployment/focused regression and the owner's publication report, not by client completion.
- [Recovery and historical resources](RECOVERY_AND_HISTORICAL_RESOURCE_2026-10-14.md).
- [Flow metadata activation](FLOW_METADATA_ACCESS_ACTIVATION_2026-10-14.md).

After Editor Chat finishes this milestone, reconcile exact deployed artifact/build identity, normal versus QA resource restoration, completed host results, fault outcomes, Flow connection/acquisition and configuration cleanup. Update the status matrix from the final receipts rather than anticipated outcomes. This documentation update performs no deployment, configuration change or credential operation.
