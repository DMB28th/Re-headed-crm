# Configurable record-edit acceptance

Updated October 13, 2026. The reusable Contact scenario completed actual ordinary-user acceptance in both Claude and ChatGPT on the installed81e45fa QA build. Its temporary fixture, policy and permissions are cleaned up. This proves a second capability using the shared renderer and Salesforce lifecycle; it does not establish every scenario or production readiness.

## Representative second scenario

Contact LastName, Description and HasOptedOutOfEmail. Published/native eligibility must be verified. Name is display-only. LastName is required; Description supports explicit clearing; Boolean values remain exact true/false strings at the public boundary. Current values initialize the controls. One renderer/controller and one Salesforce lifecycle/writer serve both capabilities.

## Consolidated checkpoints

| Checkpoint | Required evidence | Current status |
| --- | --- | --- |
| Source and renderer | Opportunity regressions; actual shared Contact renderer with controlled bridge; malformed Boolean/clear/field membership; cross-family and stale-result rejection; built resource integrity; consolidated review | Passed:208/208 local tests, built resources and consolidated source review at5e3709b; later commits change only Apex tests |
| Native execution and compatibility | Exact candidate compilation; executed Contact/Opportunity/Account/config regressions; actor/rights/policy/freshness/replay/audit rollback; separately scoped package compatibility | Passed at81e45fa: nonpersisting API67 checkOnly,330/330 expected methods,0 errors;12 runtime classes above75%; independent org-source postcheck unchanged. Fresh corrected package install remains unproved |
| Actual clients | Owned ordinary-user Open/edit/review/Confirm/receipt/refresh in Claude and ChatGPT with native corroboration; invalid/cancel/clear/Boolean scenarios | Passed for Contact in both hosts: native corroboration, required-field errors, cancellation, three-field saves, receipts and Refresh; exact temporary setup cleaned up |

Each checkpoint reports source SHA, environment, commands, counts and observed limits. A successful dry-run compile is not an installed build or host walkthrough. A controlled bridge is renderer evidence. Native test transactions are not ordinary-user client acceptance.

## Distinct risks

- Generic results/private envelopes cannot be installed in an Opportunity controller or vice versa.
- Actual record and registered capability bind the object; Confirm cannot replace them.
- Configured field order/membership, native rights, policy revision and current-value context are rechecked before writes.
- Existing Opportunity state subjects and durable completed receipts preserve exact replay semantics.
- Boolean grammar is strict; excessive current text becomes unavailable, never truncated and submitted.
- Explicit Clear differs from blank, false and omission; unchanged initialization produces no patch.
- CRM write, required audit and durable receipt are atomic.
- Pending operations, record switches and access denial invalidate local authority and reject late callbacks.

## Remaining actual-host foundation work

The date/picklist/grouping update is installed and hash-verified. Claude demonstrated current Stage initialization, grouped Amount and actual native calendar selection followed by Review/Cancel. ChatGPT rendered older Opportunity controls, so updated ChatGPT controls remain unverified. Both hosts previously restored original Open snapshots after full chat reload without the later receipt/Resume reference; explicit Refresh obtained current values. One bounded ChatGPT interruption attempt completed normally and does not establish Unknown recovery. Delayed reply after switching records and ordinary actor B acceptance are unproved. These gaps remain alongside the second scenario; new renderer tests cannot close them.

## External action boundary (original source checkpoint)

Source approval does not add disposable records, Contact CRUD/FLS, a published Contact policy, a new package/org or a production cutover. Prepare exact changes, current owned-org availability, installation compatibility and cleanup before requesting the next external scope. Preserve existing connections/environments and the original QA eight-save/four-admin-edit limits; do not silently reuse their Opportunity-only fixtures for Contact. No new live QA action is authorized by this checklist.

## Evidence and limits

Local checkpoint: Node `--test salesforce-native/tests/*.test.cjs`,208 passed,0 failed/skipped, with the existing SDK dependencies. This exercises the real built renderer against controlled bridge responses and Studio authoring fixtures. It is not a chat-client save.

Native compatibility uses API67 in the already owned disposable QA org, a frozen root-manifest archive containing20 Apex classes,3 static resources and2 LWC bundles (54 entries), and18 specified test classes/330 regular methods. Compiler, packaging and test-fixture failures are retained. The test repairs read native typed field descriptors correctly and keep independent USER_MODE readback within the fresh Confirm request budget; runtime authorization is unchanged. Native test transactions and checkOnly do not install this candidate.

Static analysis could not scan Apex because the required Java runtime was unavailable. No clean analyzer result is claimed. A fresh corrected package install remains unproved. Actual Contact host evidence is recorded separately below.

Final checkpoint receipt: [source and native results](evidence/configurable-record-edit/source-native-checkpoint-2026-10-12.json). All330 expected regular methods executed exactly once, with no setup failures, coverage warnings or persistent source changes. The lowest runtime-class coverage was88.288%. Existing Account16 tests remain byte-exact, and all260 preserved artifacts are unchanged.

## October 13 initial setup checkpoint (superseded by completed acceptance below)

The user approved the exact Contact scope. Persistent deployment passed330/330 expected tests and independent retrieval agreement in the existing QA org. Narrow Contact access and one synthetic Contact are verified. ChatGPT tool refresh and Claude discovery show the new generic family. Studio publication and actual Contact edit/review/Confirm/receipt/Refresh in both hosts have not run; UI actions are paused for a stable QA browser window. Contact save effects remain0; total earlier Opportunity effects remain3/8. [Execution evidence](evidence/configurable-record-edit/live-qa-setup-2026-10-13.json).

## October 13 completed Contact acceptance

Actual ordinary QA user A completed Open, three-field editing, native Review, Confirm, receipt and Refresh in both ChatGPT and Claude. ChatGPT cleared Description and set Boolean true; Claude restored text and set Boolean false. Both hosts displayed required LastName error and correction focus. Cancellation before review in ChatGPT and after review in Claude had zero save effects. Independent native readback matched both records, audits and persisted receipts. Contact2/2 save allowance used; total5/8; no admin freshness edits. [Actual-client evidence](evidence/configurable-record-edit/contact-live-client-checkpoint-2026-10-13.json).

The exact Contact draft CD-000004 was published through Studio after native/visible verification. Its actual synthetic preview reached a three-field Review with Save disabled. Immediate post-stage UI returned an older cached working draft; normal reload displayed the saved draft. This authoring defect remains recorded.

Claude Opportunity compatibility also demonstrated selected current Stage, grouped Amount, native calendar selection and exact date Review/Cancel with no save. ChatGPT Opportunity rendered older controls despite current Salesforce resource bytes and prior tool refresh. Updated ChatGPT Opportunity controls are therefore NOT passed. A bounded source-only resource-versioning fix is being prepared; no different persistent candidate is authorized by the frozen81e45fa deployment approval.

Approved Contact cleanup is complete: one synthetic Contact, three drafts, one config, two permission assignments and one permission set were removed exactly. Rights returned to baseline; immutable audits, interactions, confirmation/grant rows and receipts were preserved. Opportunity data/policies/drafts and prior three-save audit count remained unchanged. The broader QA org, Site and connections were preserved for the outstanding acceptance work.

Save-response loss after commit/recovery, late results after record switching, ordinary actor B and a fresh corrected package remain unproved in actual hosts. Synthetic bridge tests and native test transactions do not close those gaps.

## Resource delivery correction: initial native compile failure retained (follow-up below)

Source candidate8ac080a introduces content-derived editor resource addresses so changed HTML is advertised under a changed URI. Its local regression checkpoint passed209/209 and source review was ready. The first API67 nonpersisting native validation failed before tests: three helper compiler errors caused seven dependent errors;0 tests ran. Apex resolves the parameter `family` case-insensitively against enum type `Family`. The parameter-only repair is committed ataa3e0c5 and scoped review is ready. Its local regression passed209/209. Corrected API67 checkOnly passed98/98 exact unique resource-delivery methods with0 compiler/test/setup failures or coverage warnings; all four changed runtime classes exceed90% coverage. This is distinct from the earlier330-method backend checkpoint and actual host proof. Independent postcheck confirms the installed81e45fa source, assets, policies and retained history are unchanged. This correction is not installed and actual ChatGPT cache behavior after it remains untested.

## October13 resource delivery acceptance complete

The user approved and the exactaa3e0c5 eight-Apex update deployed:98/98 expected native methods passed; independent source/XML retrieval agreed and assets/LWC remained byte-exact. After owned ChatGPT tool refresh, actual current Stage initialization, grouped Amount and native calendar selection now passed in ChatGPT as well as Claude. Both produced the exact date Review and cancelled; Refresh displayed original values. Independent native readback confirms unchanged records and0 new saves,5/8 total effects,Contact2/2,admin0. Both cancelled interactions have cleared review authority. [Consolidated live evidence](evidence/configurable-record-edit/resource-versioning-live-checkpoint-2026-10-13.json).

The exact cache tier and host-request digest URI were not directly observed. Existing CLI org-domain protocol read returned Site-context503 and stopped without auth changes. These limits do not change the actual observed current-control result.

The next user-directed milestone is metadata/configuration-driven editing for another supported object through this same engine. Current generic native code remains Contact-specific in several boundaries; the new [implementation plan](superpowers/plans/2026-10-13-metadata-configurable-record-editing.md) targets those gaps. No generalized-object source or actual Account custom-app acceptance is claimed yet.
