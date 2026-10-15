# Cardstack persistent integration October 13

The shared editor and admin source are combined and deployed in the owned persistent
Developer Edition org **cardstack-spike2**, API67. The native editing journeys work for
Opportunity, Account and Contact. Actual Studio publication passed in the user's personal
Chrome. ChatGPT discovery exposed a tool-metadata compatibility defect; the corrected
version is deployed and actual Opportunity and Account screen journeys passed. The
approved Claude activation is applied; actual Opportunity and Account journeys also passed
in personal Chrome.

## Source and deployed version

This chat owns source integration and deployment. The named baseline is
`codex/cardstack-integration`, using application commit
`b582651203dbc8aecf8c1b0aad8f7e54271ae3be` in the existing `mcp-apps-delivery-proof`
checkout. Reviewed admin work is integrated; all original uncommitted work and contributor
checkouts are preserved. Lookup remains outside the baseline: its picker is reviewed, but
native search and selected-ID validation are incomplete and return provider-unavailable.
Reference editing stays explicitly unsupported.

The deployed ZIP SHA256 is
`9befd5bc4946bd719c8d98e762fb77629b44a1959581d5d3b8e93704ed3b9bbb`. It contains 354 core
source files and four persistent-only retained test files. Independent retrieval found all
323 expected metadata files. Executable Apex/LWC source matches after native final-newline
omission; renderer resources match exact bytes. Permission sets match full semantics.
Object fields/properties, XML defaults and the numbered Studio tab icon were checked
separately, with no unexplained drift. The reusable preparation and deployment procedure
is in [CARDSTACK_INTEGRATION_CHECKPOINT.md](CARDSTACK_INTEGRATION_CHECKPOINT.md).

The org is persistent, non-scratch and non-sandbox. Native deployment works with its
existing managed CLI authentication. Deployment OAuth metadata is unchanged and JWT is ON.
No org, package version, runtime host or OAuth app was created. The explicitly approved
new **Cardstack Integration Claude** host entry uses the existing dedicated runtime app;
production and existing HXL bindings were preserved. Temporary QA remains separate and its
earlier host observations do not establish this environment's screen behavior.

## Configurable editing that is live

Salesforce metadata and published layout/action configuration drive the shared renderer,
controller, private interaction store and governed writer. Native permissions, validation,
confirmation, audit and receipts remain authoritative. Stage uses its specialized native
provider; the actual provider returned ten choices in this org. Generic picklists and
references remain unsupported until their providers are complete.

| Published scenario | Editable fields | Deployed native journey |
| --- | --- | --- |
| Opportunity | StageName, CloseDate, Amount | Three-field review, Confirm, receipt, Refresh and exact readback passed. |
| Account | Name, Description, NumberOfEmployees | Configuration-only reuse of the existing generic route/controller/writer passed. |
| Contact | LastName, Description | Shared required text and explicit optional clearing passed with current actor access. |

The Account candidate preserves its previous layout and adds supported editable
placements/action configuration. All three candidates were staged, freshly reviewed, and
published using the exact native live/draft digests. The current admin's Studio, Manage
Connections and Use permissions work. Published policy narrows native rights; no Contact
field grants were added to make a sample work.

## Verification boundaries

| Evidence | Actual result | What it establishes |
| --- | --- | --- |
| Local renderer and Studio regression | 409/409 passed on the integrated UI; later affected authoring checks 16/16 and preparation checks 14/14 passed. | Renderer/authoring contract and local behavior. |
| Native complete checkpoint | 772/772 passed, every 765 expected Cardstack method present, 90.27% coverage, zero component/test errors. | Native compilation, regressions and security/lifecycle tests, including retained package tests. |
| Actual deployed MCP HTTP | 65 checks passed; three saves, one native audit each, independent record readback. | Runtime provider, publication and Open/Edit/Review/Confirm/receipt/Refresh in this org. |
| Native validation and cancellation | Invalid calendar, decimal, Stage, required text and integer rejected; cancellation before/after review preserved CRM values and audits. | Server-owned validation and cancellation. |
| Native recovery | Account Confirm response was not consumed by the acceptance client; Resume and repeated Confirm returned the same receipt with one save audit. | Durable backend recovery and replay; no network loss or iframe behavior claim. |
| Actual Salesforce Studio screen | PASSED Account label change → Save draft → Review → Publish in personal Chrome, with independent native readback. | Persistent LWC staging/publication works; five unrelated drafts preserved. |
| Actual ChatGPT screen | Same Delivery Probe discovery refresh passed after correction. Opportunity and configuration-driven Account open/edit/review/Confirm/receipt/Refresh passed, exact native values and one audit per save verified. Invalid decimal/integer errors and cancellation before/after review passed. | Real personal-Chrome host evidence. Account uses published Overview/Account details sections and the same renderer/controller/writer. |
| Actual cross-host persistence | The preserved ChatGPT Delivery Probe refreshed the Account to the exact values just saved in Claude: name Cardstack Integration Claude QA, description Confirmed through the shared editor in personal Claude., Employees 34,567. | Both actual hosts reach the same persistent org. No extra write or connection recreation. |
| Actual host lost-response attempt | Chrome response throttling was applied to one reviewed Account save. Its normal receipt arrived; native readback verified one save. Networking was restored, the temporary profile removed and DevTools closed. | NOT_PROVEN: this did not induce response loss or exercise host Resume. Do not reinterpret the earlier backend recovery test as a host result. |
| Actual Claude screen | Approved current Site route connected through the existing runtime client. Actual Opportunity open/edit/three-field review/Confirm/receipt/Refresh passed; visible decimal error and cancellation passed. Configuration-driven Account also passed with the published Overview/Account details sections. Independent native readback confirms exact values and one audit per save; both latest Claude audits match the current native actor. | Persistent personal-Chrome proof, separate from the old scratch connection. The same renderer, controller and native writer serve both fixtures. |
| Fresh package installation | NOT_RUN. | Persistent deployment compatibility does not prove a fresh install. |

The native run deliberately used RunAllTestsInOrg: RunLocalTests omitted some tests
belonging to the installed unlocked package. Expected method identities were checked,
including the original 16 Account regressions. Seven ordinary org tests ran in addition.
The original successful validation was reused for the first deployment. The actual host
metadata failure justified focused corrections and a fresh coherent checkpoint. The final
corrected artifact qualified and deployed in one atomic RunAll job with default rollback;
all 772 tests passed, with no duplicated qualification/deploy run.

## Remaining work

Use only the user's **personal Chrome**, never Contextary or Optio. The exact `b582651`
artifact is deployed, independently retrieved and working in the existing ChatGPT
connection and the approved **Cardstack Integration Claude** connection. Three native HTTP
saves, three actual ChatGPT saves and two actual Claude saves occurred on owned fixtures;
every save has one native audit. The third ChatGPT save was the unsuccessful response-loss
induction attempt, not another required scenario.

The working acceptance chats are
[ChatGPT](https://chatgpt.com/c/6acebd7b-c7b0-83e9-9d0b-528d6fbee11c) and
[Claude](https://claude.ai/chat/f510d81a-2fb6-48a4-850c-ef886b185488). Both show actual
receipts and refreshed Salesforce values.

Reliable actual-host after-commit response loss and delayed results after switching
records remain unproven. Local renderer guards, separate cards and backend recovery do not
establish those host behaviors. No additional save is justified merely to repeat network
emulation that did not interrupt this bridge's response.

The existing direct endpoint is enrolled at revision 1 with the Delivery Probe app's
current public ID and both registered callbacks. The existing ChatGPT and other working
host entries were not recreated or repointed. The user explicitly approved the [Claude
activation](CARDSTACK_CLAUDE_INTEGRATION_ACTIVATION_2026-10-13.md), which is now applied:
existing Site active, existing runtime app enabled with opaque issuance, native enrollment
revision 1, and **Cardstack Integration Claude** added and authorized.
Anonymous/fabricated bearer tool and resource requests return 401; guest object rights and
extra permission sets remain zero. Effective guest executable access is exactly the
ingress class and constant home page. Deployment SFAPP JWT remains ON. The expired legacy
entry stays intact.

Complete the native lookup provider before importing its picker into the shared editor.
Keep one shared-editor owner and one deployment owner. Use focused checks for development
and repeat a broader checkpoint when source changes, failures or a release justify it.