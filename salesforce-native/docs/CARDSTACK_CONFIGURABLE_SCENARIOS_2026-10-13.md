# Configurable Cardstack scenarios

October 13, 2026. The Studio scenario-maintenance and field-type expansion is built
and deployed to the owned persistent development org **cardstack-spike2**, API67.
Application source is `8f1b13836f11c80baa54fa0c5db0ebc2eb369162` on
`codex/cardstack-integration` in the `mcp-apps-delivery-proof` checkout. This chat
remains the sole integration and deployment owner. No new org, host connection or
production change was made.

## Built and deployed

The existing Studio form can Edit, Update, Cancel and reorder current-value actions
while preserving launch identity, retained properties and unrelated configuration.
Native eligibility, published layouts and policy restrict the editable inputs.
Repair can open an ineligible action; Update and Save remain gated. Synthetic
preview is labeled and cannot save.

The shared engine now admits independent single-select Picklist and bounded Email,
Phone and URL fields alongside its existing scalar types. Actual record-type
choices come from Salesforce RecordUi; existing values load without applying input
defaults. New selections require exact native API values. Terminal receipts contain
bounded historical values without selectable choices. Salesforce permissions,
locked-record freshness, native validation, confirmation, audit and receipts remain
authoritative. There is no additional object-specific renderer, controller or save
engine.

## Verified result

| Evidence | Result | Scope |
| --- | --- | --- |
| Renderer and Studio local regression | 435/435 passed | Source/component and synthetic fixture checks; UI assets unchanged by later native corrections |
| Package preparation | 3/3 passed; immutable API67 ZIP | Authentication, Sites and per-org connection settings excluded; no fresh-install claim |
| Native regression and deployment | 808/808 passed; 90.38% coverage | All 801 expected methods plus the same seven existing org methods; zero compile/test/coverage errors |
| Independent native retrieval | 329/329 files verified | 320 exact or normalized matches; nine unchanged verified Salesforce XML defaults; exact renderer bytes |
| Live Lead MCP API journey | 43 checks passed; one save, one audit | Real native choices, ten-field review/confirmation, receipt, refresh and independent native readback |
| Configuration-only maintenance | Seven checks passed; zero additional save/audit | Changed label, eight-field order and membership through native draft/review/publication, with no code change or deployment |
| Original configuration preservation | Five original configs and five original drafts unchanged | Owned Lead configuration was added separately |

The ten-field acceptance edited Company, LastName, Description, Rating, LeadSource,
Email, Phone, Website, NumberOfEmployees and AnnualRevenue together. Invalid
picklist, overlength typed string, fractional integer, required clear and currency
scale submissions rejected. Cancellation before and after review changed neither
record nor audit. Confirm's response was left unconsumed by the acceptance client;
Resume and consumed Confirm replay returned the same receipt without another save.
This is backend recovery evidence, not an induced host network loss. Native
AnnualRevenue has scale0 here; the initially fractional QA proposal correctly
rejected and the valid proposal used its native scale.

The current maintained Lead action keeps identity `studio_qualification`, is labeled
**Update lead details**, and maps ten supported fields. Its Identity section places
Company, Description and LastName in that order. Studio published this configuration
through actual Edit/Update, saved-draft review and confirmation. Native readback
matched the exact reviewed candidate. ChatGPT then rendered the changed ten-field
editor with the new label and section order, without another deployment.

## Actual screens verified October 14

The user authorized another browser while using personal Chrome. Edge was unavailable;
Codex's in-app browser used existing personal Claude and ChatGPT accounts. Chrome
was untouched, no browser was installed, and existing host connections were retained.
Studio used a fresh managed sign-in to the same persistent org; transient sign-in
URLs were kept private and removed after use. No authentication settings changed.

Both **Claude and ChatGPT completed actual eight-field Open/Edit/Review/Confirm/
receipt/Refresh**, with exact independent Salesforce readback and one new audit each.
Claude showed integer validation and cancellation before and after review with no CRM
or audit effect. ChatGPT showed native currency-scale validation and cancellation
with no effects. Current picklists stayed selected after validation; numbers used
commas. ChatGPT also refreshed the exact values saved through Claude.

ChatGPT initially failed to load the app after the resource version changed. Refreshing
**the existing app's tool discovery**, followed by a fresh Open, restored rendering.
No reconnection, app recreation or permission changes were required. Historical cached
app cards can remain unavailable; the new interactive screens are the verified result.

Actual Studio Edit cancellation preserved the original action. The published update
changed label, membership, action input order and section placement while retaining
launch identity and write policy. One superseded draft created during this check was
rolled back through the native controller with its history retained; its GUI discard
dialog remained on a loading overlay and is not claimed verified. Original five
configurations and five drafts remain unchanged. All package source remains `8f1b138`;
the October13 native 808-pass and local 435-pass checkpoints were not repeated for
configuration-only changes.

[Sanitized actual-client evidence](evidence/configurable-record-edit/studio-field-types-live-clients-2026-10-14.json)
records each host separately. Actual host response-loss and delayed-record-switch
fault demonstrations remain unproved; successful backend recovery is separate.

Live picklist evidence uses this org's Master record-type context. Other record-type
and actor-default cases are regression fixtures, not live-org proof. Actual host
lost-response and delayed-result-after-record-switch demonstrations also remain
unproved; backend recovery and renderer stale-result guards are separate evidence.

Lookup remains unsupported: its native search and source-field restriction backend
is incomplete. Dependent/multiselect picklists, Percent, DateTime, Time, compound
and rich-text editing also remain explicit unsupported types. No new clean-install
org or package release was created.

See [the deployment runbook](CARDSTACK_INTEGRATION_CHECKPOINT.md),
[the product feedback](OPPORTUNITY_SCREEN_PRODUCT_FEEDBACK_2026-10-12.md), and
[the implementation plan](superpowers/plans/2026-10-13-studio-scenarios-field-types.md).
