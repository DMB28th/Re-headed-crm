# Cardstack Salesforce Admin Experience Scope of Work Proposal

October 13, 2026. Status: scope approved by the user for implementation planning. Written execution-plan review and deployment are separate steps.

## Purpose and intended outcome

Make Cardstack Studio an intuitive Salesforce admin console for configuring, governing, publishing, and verifying CRM experiences used in AI chat. An admin should understand what each screen does, why a setting matters, what will change for users, and what to do next. The proposed work combines the UX audit and every addition, removal, and simplification discussed in this chat.

The recommended order is to correct misleading review behavior and retire unwanted surfaces first, then improve orientation and setup, then simplify authoring and complete interaction quality. Home Card retirement is included. The user approved this scope on October 13, 2026; the changes are not yet implemented or released.

## Audience and constraints

Studio and its administrative backend are for Salesforce admins. End users receive the configured experiences in chat and connect using their own Salesforce accounts. They do not need Studio to configure cards, publish policy, or repair installation. Setup can explain the instructions admins give users without becoming an end-user onboarding portal.

Keep familiar Salesforce terms visible: objects, fields, permission sets, and flows. Explain Cardstack-specific concepts and consequences. Admin expertise does not imply familiarity with internal config keys, JSON schemas, protocol receipts, or release gates.

The implementation remains in the authoritative `salesforce-native/force-app/` package, using native LWC, Apex, and Salesforce-owned state. Preserve connected-user sharing and CRUD/FLS, published-policy restrictions, exact confirmation before CRM writes, freshness checks, cancellation, and repeat-safe completion. Drafts never authorize runtime changes. This work does not restore the retired Node/Railway application, introduce a separate account system, or rewrite proven OAuth behavior.

## Evidence and implementation baseline

The [admin UX audit](/Users/danielben-atar/Re-headed-crm/salesforce-native/docs/ADMIN_UX_SOURCE_CHECK_2026-10-13.md) provides the source evidence and qualifications. It covered main revision `451ba21`, newer delivery revision `dea00cc`, and dynamic lookup revision `af5416f`, plus the live QA org's Dashboard and Objects screen. The exact deployed revision of that org was not established. Source findings and live observations must retain that distinction.

Before implementation, identify the chosen branch and deployed baseline, including the newer connection guide and Opportunity preset authoring. Resolve differences explicitly rather than rebuilding newer work from the older main checkout. Read the native instructions, auth runbook, and current package constraints. The [removal and list dependency inventory](/Users/danielben-atar/Re-headed-crm/salesforce-native/docs/evidence/ADMIN_UX_REMOVAL_DEPENDENCIES_2026-10-13.md) identifies Home Card references, companion metadata, and list-view behavior that determine the removal and authoring contracts.

The inventory also establishes a second ineffective-configuration gap: Studio saves list exposure values under `exposures:{Object}`, but no authoritative runtime consumer was found. Salesforce list discovery and separately saved Cardstack filters exist; a new picker alone would not make exposure settings effective. The scope therefore includes a bounded published-list policy consumer, not just a replacement editor.

## Proposed navigation and screen responsibilities

Use one primary navigation sequence:

**Overview · Setup · Record Cards · Flow Launch Cards · Review & Publish · Activity**

Keep native Lightning navigation and controls. Avoid adding another competing navigation system inside the Salesforce shell. Record Cards may retain clearly named subviews; a short guided path should connect them rather than force a long wizard on experienced admins.

| Screen | Purpose and main contents | Primary next action |
| --- | --- | --- |
| Overview | Configured objects, publication state, pending drafts, recent activity, and actionable attention. Show a brief explanation of what Studio configures. | Continue the most relevant setup or configuration task. |
| Setup | Installation and per-client connection preparation, verification, and recovery. Show the current stage and the exact next action. | Continue setup or check current verification evidence. |
| Record Cards | Select an object; configure its fields, sections, lists, allowed edits, and actions. Show authoring prerequisites and publication state. | Save draft, then review its changes. |
| Flow Launch Cards | Choose an active launchable Salesforce flow, name its card, preview the handoff, and save a draft. | Review and publish the launch card. |
| Review & Publish | Review meaningful before/after changes, publish selected drafts, discard drafts, and inspect publication history. | Publish the reviewed selection. |
| Activity | Inspect admin publications and runtime activity with user/date/tool filters and expandable details. | Investigate an event or export the displayed results. |

Remove repeated Cardstack Studio titles within the page. Retain the Salesforce app identity, then use content headings for the current task or object. Remove the generic Salesforce Home item from this app's navigation; this is distinct from retiring the Cardstack Home Card feature and does not alter other Salesforce apps.

## Removals and simplifications

| Item | Proposed scope | Completion condition |
| --- | --- | --- |
| Home Card feature | Retire the Studio editor, preview, navigation, home-specific setup messaging, active chat-tool discovery/runtime bindings, and current documentation promises. Inventory Apex, widgets/types, renderer resources, package manifests, tests, and companion metadata for references. | Fresh discovery does not advertise a Home Card. Studio cannot create or publish new home configurations. Existing installations receive an explicit retirement path. |
| Assignment and nondefault Audience controls | Remove Assignment, Add Audience, and nondefault audience selection from supported authoring. Retain default layout routing and existing stored configurations. Remove or relabel the sample preview's View as control so it does not imply impersonation. | No screen promises audience membership, targeting, or user access simulation. Existing nondefault data is preserved without being presented as effective runtime targeting. |
| Legacy setup checklist | Remove the second visible checklist and manual history markers from the normal setup experience. Preserve historical state if needed for compatibility. | One current Setup experience explains current requirements. Old history does not count as connection verification. |
| Card Coverage fraction | Remove the configured-versus-total-objects fraction and progress bar. Replace it with useful object state and actionable attention. | Admins are not encouraged to configure every available object. They can find configured cards and unfinished work. |
| Primary JSON editors | Replace the Lists JSON workflow with declarative controls. Keep JSON inspection/export and compatibility editing under Advanced where appropriate. | Routine supported list configuration can be completed without writing JSON. Existing values survive round trips. |
| Ambiguous labels | Replace Stage Draft with Save draft; Publish Center with Review & Publish; draft Roll Back with Discard draft. Replace Load Live/Revert to live with an explicit description of replacing the working copy. | A discard operation never implies restoration of an earlier published version. Destructive effects on the working copy are clear. |
| Internal identifiers as primary labels | Use object/card names and human descriptions in draft lists, readiness messages, and activity summaries. Keep API names, config keys, revisions, and raw details available where useful. | An admin can identify the affected experience without decoding a config key. |

Home retirement must not blindly delete installed-package classes or immutable Salesforce types. Remove active exposure and authoring first; remove implementation metadata where the package upgrade path permits it. Preserve existing home configuration and history rather than silently purging records. Classify pending home drafts as retired and exclude them from normal publish actions, with an explanation and access to their history. If an already-known client calls a retained compatibility endpoint, return a clear retirement response rather than recreating the feature. Refresh advertised client discovery and verify the retirement in each supported client.

Keep unrelated task actions, record cards, and flow actions if they remain independently supported. Removing the Home Card should not remove functionality merely because it once appeared on that card.

## Additions and changes

### Overview and truthful status

Replace the large expanded setup runbook at the top of Dashboard with a compact Overview. Surface configured cards, pending drafts, recent activity, and a specific next action. Setup attention links to the relevant stage in Setup. Do not make a flow launch card the universal primary action before an admin has configured a record card.

Separate three kinds of status: the Salesforce org/context Studio is running in; per-client and per-user connection evidence; and whether a published CRM experience has been tested. Replace the broad Connected badge with wording that describes the actual fact. Unknown means a manual check is needed; it never becomes verified because an admin checked a history box. An org-level setup result does not prove every user's connection or Salesforce access.

### Dedicated guided Setup

Retain the technical requirements of the current connection guide, but organize them by stage. Each stage explains its purpose, the setting or input involved, the Salesforce Setup destination, the current result, and the next action. Show only the relevant detail initially; keep the complete runbook, version information, support summary, and troubleshooting reachable.

Preserve separate Claude and ChatGPT setup and evidence. Preserve the distinction between runtime OAuth apps and the deployment app, exact callback requirements, diagnostic exchange, and operator observation. Use clear labels for verified checks, manual inspection, saved intent, and instruction history. Do not imply that Studio automatically provisions settings it cannot inspect or modify.

Explain where an admin obtains required identifiers, including Site selection, when a native picker is not feasible. Maintain safe handling of internal identifiers and credentials. Present recovery for the current blocked stage before the full recovery table. Configuration work can proceed independently of client connection work; the guided path should not block draft authoring merely because verification is incomplete.

### Guided record card configuration

Use the sequence **Choose object → Configure fields → Allow edits → Configure actions → Save draft → Review & publish → Test in chat**. Provide direct navigation for experienced admins and a visible path for first-time setup.

Show configured objects and their states before requiring admins to search the full object catalog. An unconfigured object's empty state explains how to add highlights and its first section. Retain searchable fields, section columns, drag/drop, and keyboard alternatives. Make the target section clear when adding a field without dragging.

Add an object readiness summary with separate dimensions: layout content, edit policy, action prerequisites, draft/live state, and client test evidence if available. Every missing prerequisite has a link to the control that resolves it. Layout completeness is an authoring result; it is not proof of runtime availability or another user's permissions.

Extend the newer Opportunity preset's specific prerequisite messages to supported actions. Explain the dependency between field editability, object-level chat-write enablement, the denylist, and Salesforce access. Prefer a flow or process selection before displaying its specific mapping settings. Distinguish actions that run in chat from cards that open Salesforce. Do not present unsupported field types or workflows as delivered.

### Declarative lists and edit restrictions

Provide a list-view picker and chat-exposure controls using actual org metadata. Wire the supported published exposure policy into both list discovery and list execution, including calls that supply a list identifier directly. Draft changes have no runtime effect. Hiding a list is a Cardstack restriction and cannot grant Salesforce access. Define the migration behavior explicitly so existing installations without a published exposure policy retain their documented behavior until an admin publishes a policy.

Keep separately saved `listview:` Cardstack filters working; do not silently convert them into Salesforce saved-view filters. Explain named-view fallback limitations: choosing a Salesforce list view does not reproduce its filters, columns, or sorting when the runtime does not deliver them. Default-list and alias routing are not new capabilities in this scope. Preserve legacy values for inspection without presenting unsupported settings as effective controls. Any custom-list controls shown must have a verified runtime consumer.

Use a searchable field picker for chat edit restrictions, with field labels and API names available. Preserve denylist semantics and unknown existing entries rather than silently dropping values the picker cannot resolve. JSON validation alone is insufficient: validate supported configuration shape and render field-specific errors. Keep unsupported or legacy values inspectable under Advanced without advertising unsupported behavior.

### Draft state and review

Show persistent states for Unsaved changes, Draft saved, and Published. A saved draft and a live version can coexist; both must be visible. Avoid describing the whole object as Published when the admin is looking at unpublished changes. Display a pending count in Review & Publish navigation and refresh affected summaries after saves, discards, and publishes.

After saving, provide a durable next step to review the specific draft. Make it clear that layout, action, and permission changes currently share a layout draft; explain what Save draft includes. Protect unfinished work when changing objects or leaving an editor. Offer save, discard, or remain, preserving input if saving fails. Show busy states to prevent repeat clicks. Unknown save outcomes require authoritative reload/reconciliation before retrying.

Review must compare modern and supported legacy schemas. Include highlights, sections/columns, field order/placement, labels, required/read-only/editable flags, action definitions and mappings, action enablement, chat-write enablement, denylist changes, and the supported list-exposure policy. Show material before/after values. Never report No field changes when the schema could not be compared. Display comparison failure explicitly with a way to inspect details.

Provide review before either individual or selected bulk publishing. State which drafts will become live. Preserve sequential batch semantics and identify exactly which drafts succeeded or failed; never imply all-or-nothing publication. Preserve unpublished work after a failure. History records publication/discard events; restoring a previous live version is a separate feature and is not included here.

### Preview and post publication testing

Label the layout preview as a sample, not an actual chat-client screenshot or access simulation. Preserve the Flow launch-card preview's clear Salesforce destination. Do not label View as as user impersonation or an FLS test.

After publishing, show what became live and a concrete test handoff: which supported client to open, which object/card/action to request, and what behavior to expect. Separate a read-only card check from an optional governed edit test using a disposable record. A genuine edit test includes review, explicit confirmation, save, independent Salesforce read-back, and refreshed-card verification. Record or display test status only to the extent backed by real evidence; a manual completion marker is not automated verification.

### Admin access and interaction quality

Correct role guidance everywhere: Cardstack Admin configures Studio; Cardstack User enables the supported chat access lane. Preserve server-side administrative enforcement and existing connected-user execution. Do not add an end-user route into Studio or claim a new security vulnerability based solely on the inconsistent checklist copy.

Use native, keyboard-capable controls for object selection, audit-row expansion, and confirmations. Manage dialog focus, Escape dismissal, and focus return through platform components where appropriate. Retain keyboard reorder alternatives to dragging. Provide inline errors, clear empty/loading states, and actionable recovery rather than relying only on transient toasts. Check SLDS theme compatibility, narrower desktop panels, wrapping, and focus visibility. Expand Activity summaries with readable action names while retaining technical details and the existing filters/export behavior.

## Delivery approach and priorities

Choose targeted improvements to the existing native app. Copy-only polish would leave false capability and review claims unresolved. A complete replacement or mandatory all-purpose wizard would add migration risk and make repeat admin work slower. The recommended approach reuses working editors and backend contracts, adding guidance and accurate state around them.

| Phase | Work and dependencies | Reviewable deliverable |
| --- | --- | --- |
| 1 Correct behavior and retire surfaces | Confirm the working baseline and dependencies. Fix publish comparisons and draft terminology. Retire Home Card exposure; remove unsupported audience authoring, legacy setup UI, the coverage metric, and generic Home navigation. | Accurate review examples and a complete removal/compatibility inventory, with retained data and runtime features identified. |
| 2 Navigation and setup | Establish the six destinations, compact Overview, dedicated staged Setup, truthful statuses, role guidance, and contextual next actions. Reuse existing verification services. | First-run and returning-admin walkthroughs that show where each task starts and leads. |
| 3 Authoring and publication path | Add configured-object entry, readiness summaries, declarative lists/restrictions and published list-policy enforcement, specific action prerequisites, persistent draft state, work protection, refresh coordination, and post-publish test handoff. Depends on accurate review and the selected list contract. | One complete supported object workflow from configuration through published card and real-client verification, including effective list exposure. |
| 4 Interaction and release verification | Apply accessible controls, theme/layout fixes, error recovery, and remaining Activity polish. Test upgrade/install and advertised clients. Accessibility requirements apply throughout earlier phases as well. | Verified native app, documented compatibility handling, and release evidence with remaining limits stated. |

Phase 1 has the highest priority because misleading review and ineffective configuration undermine every later flow. Setup and Overview follow because they explain the product and unblock administrators. Declarative authoring is the largest variable in scope; published list-policy enforcement is required backend work and should be planned as its own bounded task before its controls are offered. No calendar estimate is proposed before the baseline and dependencies are reconciled.

For implementation, split the approved scope into bounded tasks with explicit dependencies, files, behavioral checks, and review gates. Use the native package's selected subagent development workflow after the written proposal and implementation plan are approved. Reuse an appropriate isolated worktree. Do not mix this UX work with unrelated renderer/auth migrations or overwrite work already completed on newer branches.

## Acceptance criteria

| Area | Required demonstration |
| --- | --- |
| Purpose and orientation | A Salesforce admin new to Cardstack can explain what Studio configures, distinguish admin versus chat-user access, locate Setup and Record Cards, and identify the next task without decoding config keys. |
| Removal completeness | Home Card is absent from normal Studio authoring, publishing, fresh tool discovery, active rendering promises, and current setup instructions. Retained compatibility artifacts and stored data have an explicit retirement disposition. Audience targeting is not offered as effective functionality. |
| Setup | One guide preserves resumable configuration, separates evidence from history, shows manual checks honestly, and identifies recovery for a blocked stage independently for each client. |
| Authoring | An admin can configure a supported record card, supported list exposure, and edit restrictions without writing JSON. Published exposure changes affect discovery and direct list calls; drafts do not. Existing saved Cardstack filters and migrations are verified, and saved-view fallback limits are visible. Missing action requirements link to the relevant settings. Advanced values survive save round trips. |
| Draft handling | Unsaved work is protected across navigation; save failures retain input. Saved and published states are distinct. Counts and summaries update after relevant mutations. |
| Review correctness | Adding a field while enabling its editing and object writes produces explicit before/after changes. Highlights, sections, action mappings, denylist changes, and supported legacy shapes are covered. Comparison failures cannot appear as no changes. |
| Publication | Individual and bulk flows review affected drafts before applying them. Partial failures identify successes and failures. Discarding a draft leaves the live policy unchanged. |
| Preview and testing | Samples are labeled accurately. Published behavior is checked in each advertised client, with independent read-back for governed writes. Connection proof and CRM-edit proof remain separate. |
| Accessibility and presentation | Key workflows operate by keyboard, including pickers, field ordering, audit expansion, and modal dismissal/focus return. Native themes and narrower desktop layouts remain usable. |
| Governance and release | Admin-only controls remain enforced. Drafts do not reach runtime. Salesforce sharing/FLS and confirmed-write invariants remain intact. Relevant local checks and the complete Apex suite pass before release; fresh install and upgrade behavior support the specific release claims. |

Use task-based walkthroughs for first-time and returning admins. Test the existing publish-summary reproduction, object-switch unsaved work, saved-versus-live differences, a blocked action, a partial publish failure, connection Unknown states, and Home Card retirement in a client with refreshed discovery. Use meaningful behavioral tests rather than tests that merely mirror markup. Capture actual results; do not equate passing model tests with live-client proof.

## Scope boundaries and decisions for review

This proposal retains native Salesforce hosting, default layouts, sections/highlights, supported chat actions, governed edit behavior, published Salesforce flow launch cards, drafts, publication history, and audit filters/export. Flow Launch Cards remains a distinct destination and explicitly states that Salesforce runs its screens and inputs.

It does not add audience membership/routing, actual user impersonation, exact saved-view reproduction beyond existing runtime support, earlier-version live rollback, automatic OAuth/Site provisioning, arbitrary Screen Flow interpretation, new CRM edit types, or a new chat renderer. Current renderer migration and Opportunity/lookup work remain separate initiatives whose delivered results may be reused.

The approved scope includes full Home Card retirement, removal of unsupported audience authoring while preserving stored data, the six-destination navigation, retention of Advanced JSON, bounded backend enforcement of published list exposure, and the phased delivery above. The written implementation plan records the exact branch/package baseline, list-policy migration contract, and installed-metadata compatibility approach for review. Scope approval permits preparing that plan; execution-plan review precedes product changes and does not establish release verification.

## Supporting references

- [Native package instructions](/Users/danielben-atar/Re-headed-crm/salesforce-native/AGENTS.md) and [native README](/Users/danielben-atar/Re-headed-crm/salesforce-native/README.md).
- [Admin UX audit and source evidence](/Users/danielben-atar/Re-headed-crm/salesforce-native/docs/ADMIN_UX_SOURCE_CHECK_2026-10-13.md).
- [Home retirement and list policy dependency inventory](/Users/danielben-atar/Re-headed-crm/salesforce-native/docs/evidence/ADMIN_UX_REMOVAL_DEPENDENCIES_2026-10-13.md).
- [Proven MCP Apps auth runbook](/Users/danielben-atar/Re-headed-crm/salesforce-native/docs/MCP_APPS_AUTH_RUNBOOK.md).
- [Client Side Caching of Apex Method Results](https://developer.salesforce.com/docs/platform/lwc/guide/apex-result-caching.html), Salesforce developer guide, for refreshing affected wired data.
- [Modal](https://developer.salesforce.com/docs/platform/lightning-component-reference/guide/lightning-modal.html), Salesforce component reference, for native dialog behavior.
- [Accessibility and Inclusive Design Patterns](https://architect.salesforce.com/docs/architect/well-architected/guide/fairness-accessibility-patterns.html), Salesforce Architects guidance, for keyboard and focus verification.
