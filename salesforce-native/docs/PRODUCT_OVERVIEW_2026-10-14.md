# Cardstack product overview and requirements

> **Current status — October 15:** Case editing, explicit record discovery, related-list navigation and controlled recovery/stale-result checks passed in both hosts; combined source is `a9a304e`. Flow OAuth and managed user/org verification succeeded; Studio acquisition/compilation is being tested. Lookup remains unsupported. See [overnight progress and current evidence](OVERNIGHT_PROGRESS_2026-10-15.md). Earlier inventory and test results below retain their dated scope.


Updated October 15, 2026; original review October 14. This is a PRD-style inventory of the existing product and its intended next steps, not a new implementation authorization. [Review coverage](CHAT_REVIEW_INDEX_2026-10-14.md) lists sources and limits. Architecture, mappings and deployment are documented in the companion review files.

## Product purpose

Cardstack makes Salesforce usable inside AI chat. A user opens a CRM record, edits a familiar form, reviews the exact changes, confirms, receives a trustworthy receipt, and refreshes the current record. A Salesforce admin determines which objects, fields, layouts, actions and lists are exposed through Studio.

The latest requirement is **one metadata/configuration-driven engine**: Account, Contact, Opportunity and Lead are acceptance fixtures, rather than independent applications. Adding an already supported object/field scenario should require published configuration, not another renderer/controller/writer. The user's October13 feedback explicitly rejects repeatedly building an object-specific proof while postponing the reusable experience.

## Users and needs

| User | Need | Product responsibility |
| --- | --- | --- |
| Salesforce admin | Understand setup, configure safe experiences, preview, stage and publish changes | Native Lightning Studio, guided configuration, honest eligibility and semantic review |
| Connected CRM user | Find the right record and complete edits in chat | Shared interactive workspace, useful validation, exact review/confirmation, receipt and refreshed values |
| Installer/support maintainer | Install, connect, diagnose and upgrade reliably | Org-specific setup, explicit permissions, sanitized diagnostics and reproducible release evidence |
| Organization owner | Salesforce authority and an audit trail | Connected-user execution, sharing/CRUD/FLS, published policy, durable interaction and repeat-safe writes |

Custom Cardstack accounts, Railway runtime hosting, Node runtime and Postgres are retired architecture. The product's backend, Studio, state and HTML resource delivery are Salesforce hosted. Local Node builds browser assets.

The deployment audit still found the legacy Railway production MCP service, Studio service and Postgres18 running. Architectural retirement has not decommissioned that environment; see the companion deployment inventory for current reachability and ownership.

## Authoritative decisions versus proposed direction

| Decision | Source | Status |
| --- | --- | --- |
| Salesforce hosts the entire product | Continue Cardstack Salesforce work, October8 user instruction; native AGENTS | Selected and implemented direction |
| Keep Apex and Studio; retire HXL after verified replacement | Pinned Continue Cardstack Salesforce work, October8 | Selected migration; existing beta preserved during transition |
| One shared record editor, metadata and published configuration | Speed Up CRM Editing and Editor Chat, October13 | Selected; deployed reuse now demonstrated |
| One persistent integration org and one deployment owner | User coordination prompt in Editor/lookup/admin chats | cardstack-spike2; Editor Chat owns combined source/deployment |
| Consolidate qualification around coherent milestones | Editor Chat, October14 user instruction | Use focused risk checks during development; broad checks at justified milestones |
| Carry bounded Flow interpreter into Apex-owned execution | Migration direction and research | Bounded native foundation built/deployed; managed acquisition and interpreted host acceptance remain pending |
| Lookup after shared editing | Latest Editor Chat | Active work; no enabled provider or governed lookup write yet |
| Record search, recovery, expansion, admin ease and release readiness | Latest Editor Chat assistant priorities | Suggested ordering; not a separately approved implementation spec |

## Main journeys

**Admin authoring:** enter Studio → choose an object/scenario → select native supported fields and sections → configure actions and policy → save draft → inspect exact semantic review → publish → fresh chat Open uses that published configuration. Drafts must not authorize runtime behavior. Studio publication and configuration-only changes to Lead label, field membership/order and sections have actual native UI and host proof.

**Record editing:** known record ID Open → existing values and configured action → edit supported fields → validation correction → Review → Back and re-review if needed → explicit Confirm → Salesforce validation and update → durable receipt/audit → Refresh. Actual Claude and ChatGPT completed the October14 ten-field Lead journey with one save/audit per host.

**Cancellation/recovery:** cancel while editing or reviewing produces no save/audit. Recoverable validation preserves inputs. Backend Resume/repeated Confirm returns an existing receipt without repeating a completed write. Controlled actual-host discarded-Confirm-reply recovery and delayed related-page rejection now passed in both hosts, with independent proof of no duplicate writes. Natural network outage and full reload recovery remain separate.

**Flow launch:** published launch card → Salesforce Lightning Flow URL with current recordId → Salesforce runs the interview. This is a handoff; Cardstack does not thereby interpret flow screens in chat.

**Record discovery:** explicit object/query search → interactive chooser → explicit record selection → shared workspace. Exact-ID Case and ambiguous Contact choices passed in both hosts. Unrestricted natural-language intent routing remains broader than these bounded checks.

## Functional requirements and status

| Capability | Built / deployed / proof | Remaining boundary |
| --- | --- | --- |
| Shared persistent record workspace | Lead milestone 5275b7e followed by combined v6 QA deployment/native patches; source a9a304e; Case journeys passed both hosts | Does not guarantee recovery of every historical cached chat card |
| Text, integer, decimal/currency/date editing and native Stage | Shared native editor/providers, configured object fixtures | Metadata/precision/scale and supported-field eligibility govern admission |
| Independent single-select picklist, Email, Phone, URL | Native expansion deployed; Lead fixtures exercised both hosts | Live picklist proof uses this org's Master record-type context |
| Lead ten-field edit | Company, LastName, Description, Rating, LeadSource, Email, Phone, Website, NumberOfEmployees, AnnualRevenue; both hosts passed | Not every Salesforce type or object is implied supported |
| Configuration-driven object reuse | Opportunity StageName/CloseDate/Amount; Account Name/Description/NumberOfEmployees; Contact LastName/Description native journeys | Persistent actual-host Opportunity/Account proof, later Lead proof; do not assume every Contact scenario has equivalent host proof |
| Scenario maintenance | Edit/Update/Cancel, field ordering and published configuration | Repair may open an ineligible action; Update/Save stays gated |
| Studio admin UX | Reviewed contributor source merged and deployed into combined integration baseline; publication/scenario maintenance actual UI proof | Every planned keyboard/theme/error/package acceptance row is not thereby passed |
| Draft/review/publish | Native policy/configuration and semantic review; actual publication proof | Older GUI discard overlay remained unverified in one check; controller rollback was verified separately |
| Runtime permission/validation/confirmation/audit | Native authority, review binding, durable receipt and one audit per completed save | Fixture evidence is bounded to actors/configurations checked |
| Native lookup editing | Picker and adapter local focused checks; native acquisition research | REFERENCE unsupported; effective restrictions, actor-bound runtime access and fresh selected-ID validation not qualified |
| Dependent/multiselect picklists, Percent, DateTime, Time, compound and rich text editing | Explicitly unsupported in current field expansion | Native providers/validation and UI qualification required |
| Explicit record search/disambiguation | Integrated chooser; exact-ID Case and ambiguous Contact choice/open passed in both hosts | Does not prove every natural-language retrieval intent |
| Case reuse | Four configured fields through shared editor; full lifecycle and independent readback passed both hosts | No new object-specific writer; unsupported types stay excluded |
| Related lists | Six Contacts and six Opportunities across three pages/list in each host; checked child open/parent return passed | Read/navigation had zero write/audit effects; no frozen-snapshot guarantee |
| Controlled delivery recovery | Lost Confirm reply recovered through Resume; delayed related page rejected after record switch, both hosts | Controlled QA variant; not natural network loss or full-page reload |
| Historical UI archive | Four exact retained resource bodies with family/hash verification integrated | Universal historical conversation/draft recovery not established |
| Bounded native Screen Flow interpreter | Native compiler/plan/service/provider/Studio foundation deployed; fixture installed; Flow OAuth and real managed user/org identity check succeeded | Studio metadata loading/compilation under active test; acquisition/publication/interpreted host journey not yet proved; no full engine parity |
| Salesforce flow launch cards | Published native handoff with recordId | Arbitrary launch-variable mapping and in-chat interview advancement not delivered |
| Home card | Legacy implementation existed; native admin retirement integrated | Historical root M4 completion is not a current custom-runtime feature guarantee |
| Arbitrary custom screens | Historical configs/designs existed; native Studio retired Custom Screens | No current general custom-screen execution claim |
| Create/delete | Legacy create compatibility action excluded from community MCP until governed; no delete tool | Not advertised current governed operations |
| Installation/auth validation package | Unreleased 0.1.0.10 fresh disposable-org install and synthetic host auth/delivery proof | Latest integrated shared-editor build has no fresh-install/release claim |
| HXL beta | Historical installed 0.1.0.8 preserved | Long-term direction is retirement; preservation is not a new HXL feature roadmap |
| Copilot / HubSpot | Historical root vision and retired adapters | No current Salesforce-native custom-editor acceptance claim |

## Nonfunctional requirements

1. Salesforce connected-user identity, sharing and CRUD/FLS are authoritative; Studio only narrows native rights.
2. A write binds exact submitted values, actor, record, published policy/config revision, review revision, expiry and fresh state. Defaults and drafts never authorize a write.
3. Confirm replay and recovery must be repeat safe; uncertain outcomes need receipt/status recovery, not blind repetition.
4. Field controls preserve exact drafts, explicit clear intent, focus and selection across updates; Review/Save keeps task context and prevents duplicate actions.
5. The chat workspace has a stable identity header, configured sections, scrolling content and reachable actions. The preferred 500px envelope is capped by host maxHeight; tiny-container fallback remains scroll reachable.
6. Errors need safe messages, stable codes, field references where available, retained input and private diagnostic support references. Earlier plans describe broader desired error coverage; a checklist alone is not runtime proof.
7. API67 and the deployment JWT procedure remain required. Runtime opaque OAuth apps and deployment SFAPP JWT settings are distinct.
8. Installability, upgrade safety and advertised host compatibility require evidence for the exact distributed artifact.

## Evidence ladder

The [October 15 evidence table](OVERNIGHT_PROGRESS_2026-10-15.md) adds combined deployment, 509 local checks, corrected 108 native checks, 103 related compatibility checks and 114 Flow report checks. The broad run remains 938/940, followed by scoped corrections. Actual Case, discovery, related-list and controlled recovery checks passed both clients. Flow identity authorization subsequently succeeded; metadata/interpretation acceptance remains active. Earlier qualification follows for historical scope.

The October14 workspace report qualifies unchanged native backend baseline 3daad61 (808/808 native methods, 90.38% aggregate coverage) plus a presentation-only 5275b7e delta (three StaticResources; 357 non-UI core files unchanged). The delta passed 93 renderer/contract checks and 124 native resource/adapter methods, with six retrieved resource/body files matching.

Those checks are distinct from actual-client proof: both Claude and ChatGPT completed open → edit ten fields → validation → review → cancellation → Confirm → receipt → Refresh, with independent Salesforce readback and zero cancellation effects. A fresh Claude conversation was needed after tool discovery refresh; no new connection/authentication was required.

The earlier unreleased 0.1.0.10 validation package proved fresh installation, 332 installed Apex tests, 88% package coverage, synthetic seven-value exchange, ordinary-user boundaries, configuration/wrong-org rejection and natural OAuth expiry/refresh in both hosts. It did not prove real CRM writes or the latest integrated editor's fresh install. Direct client-held revoked-token rejection and refresh-token rotation remained independently unmeasured.

## Suggested next milestones

These are a synthesis of the latest chat priorities, not new approvals:

1. Finish lookup's native eligibility and fresh save-time validation; enable only a qualified bounded provider, then verify actual search/selection/review/Confirm/readback in both hosts.
2. Extend already-verified explicit search/choice to broader natural-language retrieval acceptance.
3. Preserve the passed controlled recovery/stale-result evidence; qualify ordinary UI resource cutover and any broader network/reload recovery claims separately.
4. Extend supported fields/objects through native metadata and published configuration, keeping unsupported types explicit.
5. Complete admin setup/recovery acceptance and a fresh installation/upgrade of the exact integrated editor artifact.
6. Complete managed Flow metadata acquisition, compatibility/compilation and reviewed publication, then interpreted journeys with independent native readback in both hosts.

No adoption, latency, conversion or completion-rate baseline was found. Suggested future product measures are admin time to publish a supported new scenario, user task completion/validation recovery rate, and duplicate-write count; these are proposed metrics, not observed results.

## Primary material

Current implementation and proof live in the integration worktree at
`integration worktree`, branch `codex/cardstack-integration`. The source links below resolve in this PR; revision identifiers distinguish earlier evidence:

- [Persistent workspace proof](PERSISTENT_RECORD_WORKSPACE_2026-10-14.md)
- [Configuration and field types](CARDSTACK_CONFIGURABLE_SCENARIOS_2026-10-13.md)
- [Persistent integration](CARDSTACK_PERSISTENT_INTEGRATION_2026-10-13.md)
- [Lookup qualification](LOOKUP_NATIVE_QUALIFICATION_2026-10-14.md)
- [Native README historical beta boundary](../README.md), [record actions historical beta contract](RECORD_ACTIONS.md), and [migration design](superpowers/specs/2026-10-08-custom-mcp-apps-migration-design.md)

Root README, CLAUDE and PLAN describe the retired Node product. Primary-checkout native README/AGENTS retain October8 status. Preserve them as historical sources; resolve current status using dated integration proof rather than interpreting old “pending” rows as the latest outcome.
