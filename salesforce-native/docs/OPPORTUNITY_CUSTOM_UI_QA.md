# Working-screen acceptance evidence

October 12, 2026. Acceptance follows the revised reusable-screen milestone.
This is the execution checklist; an unchecked scenario is not delivered proof.

| Checkpoint | Current evidence | What it establishes |
| --- | --- | --- |
| Backend scoped tests | API67 checkOnly 272/272 at c8d8e73 | Native compilation and scoped assertions, with test Stage seam |
| Package compatibility | Full UI beta0.1.0.11,89% package coverage, fresh install SUCCESS; serial44classes/530unique methods PASS,0setup failures | Frozen UI/Studio/backend package installs and its complete regular-method inventory passes; earlier backend-only parallel failure remains preserved |
| Renderer | Corrected source8ffd115f,35/35 local tests; generated bundles verified in consolidated review | Source Review no longer depends on native form submission; actual Studio synthetic behavior also observed below |
| Actual installed Studio | Two-resource correction deployed/retrieved byte-exact; three-field and generic synthetic preview checks PASS | Native sandbox integration now observed; environment is beta0.1.0.11 plus reviewed UI corrections, not a freshly packaged fix |
| Claude governed Opportunity editing | Ordinary A: Open/edit3/Review/Confirm/receipt/refresh PASS, native corroboration; invalid/Cancel/rule rejection also observed | One exact save; full reload restored original Open snapshot, not completed receipt |
| ChatGPT governed Opportunity editing | Ordinary A: Open/edit3/Review/Confirm/receipt/refresh PASS with native corroboration; invalid date/decimal observed | One exact save; recovery and record-switch late responses remain separate |

## First screen walkthrough

Run the same scenario in a clearly labelled synthetic browser harness, then in
each actual client separately when the authorized integration environment is ready.
The synthetic run establishes controls and controller behavior only.

1. Open an Opportunity card; enter the published edit action.
2. Change Stage, Close Date and Amount together. Verify exact date and decimal
   strings reach Review, and the review displays the server-returned diff.
3. Confirm explicitly. Verify the receipt remains separate from the refreshed
   record. In live QA, independently read the record and required audit before
   marking the write accepted; Review alone must leave the record unchanged.
4. Enter invalid date, blank required value and unavailable Stage; display errors
   beside the fields and retain correction inputs. Server errors remain authoritative.
5. Back from Review, review again, then Cancel. No old grant can authorize a save.
6. Lose the Confirm response after dispatch. Show Unknown, then Resume/status.
   A completed outcome shows the original receipt; an exact retry cannot duplicate
   the effect. Missing reload recovery context must be reported truthfully.
7. Switch records with a response pending. Release the old reply; it must neither
   replace the new record nor enable Confirm. Exercise both review and save replies.
8. Fail refresh after a known save. Keep the receipt and retry only the record read.

## Reusable renderer checks

Exercise text, textarea, Boolean, exact integer/decimal/currency, date and single
picklist controls in synthetic layouts independent of Opportunity field names.
Check one/two-column responsiveness, keyboard focus, literal Unicode/HTML-like
labels, explicit optional clearing, unknown-type read-only handling and rejection
of duplicate/unknown layout references. These controls do not add server CRUD.
Studio preview uses the shared view in an isolated no-bridge sandbox with Save
disabled; the local interaction harness is a separate test fixture.

## Live prerequisites and evidence record

Live Stage acceptance requires actual RecordUi record-type-scoped choices under
an ordinary connected actor, compared across two distinct sales-process contexts.
No Describe fallback or test seam proves it. Installed package/full Apex suite,
published preset and real host delivery must pass before live acceptance.

For each checkpoint record the exact source/artifact hash, test counts, client,
scenario outcomes and cleanup. Public receipts contain safe references/counts only;
private handles, grants, CRM values and internal identifiers remain private.
Current beta/apps/connections are preserved. Release/cutover is outside this scope.

## October12 renderer source acceptance

The runtime, bridge-free preview and self-contained synthetic interaction demo are
built and reviewed. [Local demo artifact](../tests/fixtures/opportunity-screen-demo.html)
supports the full three-field path, validation/cancel/lost-response/stale-switch
fixtures. Its synthetic transport and effect count are labelled; no actual CRM
write or client behavior is established. Direct file-protocol browser navigation
was rejected by browser policy. No workaround was attempted; actual browser visual
QA remains unobserved. The four added recovery regressions cover SDK refresh-error
receipt preservation, stale same-record interviews and resumed visible proposals.

Runtime SHA256: `5d8722f502bc712959b1b6add50f39f866418fc2dd06364495ed0d3d9c214ccf`.
Preview SHA256: `bf3d1c6708f6a3e46621d1bb8f80aef3646af8d1835e794bdd710580a0c4d4b2`.
Demo SHA256: `e89aa3b5c1512c10f11ac285429fa719048b79277b4d8509313cf01aa53394cf`.

## Installed-suite result and next consolidated control

Frozen backend source8893ffb successfully created an unreleased coverage beta and
installed in its owned one-day scratch org. The completed RunLocalTests run failed:
535 summary entries,497 passing,38 failing. Detailed results contain517 regular
methods,482 passes and35 failures, all in permission-assignment setup stacks for
StudioController(21), ListViewAction(10) and PreviewUpdateAction(4). The installed
CLI SDK includes18 setup results in its summary but omits them from emitted tests,
accounting for15 additional passes and3 failures. This is not a passing full suite.
Shared-actor setup contention is the supported hypothesis, not a proven scheduler
observation or a justified production change. The next full installed QA should
run every installed class sequentially using the supported single-class synchronous
mode, then aggregate exact class/method/coverage results. Do not repeat asynchronous
RunLocalTests expecting its synchronous flag to serialize multiple classes.

[Safe installed receipt](evidence/opportunity-edit-2026-10-11/fresh-install-full-suite-8893ffb.json).
Cleanup deleted only the created org after identity checks and preserved the failed
run; DevHub independently confirms Deleted through the created scratch-info identity.
The backend-only package excludes the newly built renderer/Studio revision, so
it cannot establish their package/native compilation or live acceptance.

## Final source checkpoint

Source95acd7d7 includes the corrected restored-Review → Resume → Back path;
33 renderer tests and rebuilt bundles pass. Studio source2d65d72 includes exact
preset authoring, shared preview and before-DML validation at the native staging/
publication choke point, with case-equivalent config keys recognized. Task and
final cross-component source reviews pass. The complete local native Node suite
passed175 tests before the final one-regression JS-only correction; its covering
renderer suite passed33 afterward. No redundant broad rerun is claimed.

A native API67 checkOnly of93classes/LWC/core metadata succeeded with0compile
errors and395/395 tests. Those results omit the changed packaged Studio test
class, so they do not prove its13new cases. Explicit44source-class validation of
the same native ZIP is pending. Final JS-only source changes do not alter any
Apex/LWC bytes; their runtime artifact must be accepted separately in real hosts.

Final runtime SHA256: `2c354b3191d0d5c581aa9fb551d71fd2fc5ad043c9d5ba1794a389a52b37c79c`.
Preview remains `bf3d1c6708f6a3e46621d1bb8f80aef3646af8d1835e794bdd710580a0c4d4b2`.
Final demo SHA256: `ecab8ce327eacf8e413102f897d8ea93a350ebe860073d72eafdac31c901dae7`.

## Explicit native source assertions completed

The exact44source-class selection completed530/530 passing methods, including
all13 new Studio tests, with0compile errors. It verifies the Apex authoring cases
and relevant existing native regressions; no CRM fixture persisted. Overall
checkOnly status is Failed solely for four unchanged legacy per-class coverage
shortfalls: FlowContinue27.083%, QuickActionStart49.180%, DmlError71.698% and
FlowStart50.725%. Changed production coverage is OpportunityActionPolicy95.833%,
ConfigService88.073%, StudioController94.348% and PolicyService97.222%.
[Safe source assertion receipt](evidence/opportunity-edit-2026-10-11/screen-studio-native-assertions-2d65d72.json).
This is neither a successful whole-source deployment nor live Stage/client proof.
The legacy coverage warnings remain visible; no skip-validation or coverage-only
implementation/test milestone is introduced. Package-level coverage and a fresh
serial installed suite for the final UI remain part of the concrete live QA scope.

## Full UI fresh installation and serial regression gate

The approved additional beta0.1.0.11 was created from frozen95acd7d7 with actual
89% package aggregate coverage and a passing provider coverage check. It installed
SUCCESS in the single owned one-day Developer org. All93 installed Apex bodies
match frozen source content; Salesforce omits exactly one terminal LF. Installed
class and method identities reconcile with the frozen candidate.

The complete44-class synchronous serial control passed530/530 unique expected
regular methods with zero setup failures, omissions or duplicates. Studio passed
34/34, including all13 new cases. Every class completed before the next began;
no fixture, setup or deployment mutation overlapped. Package coverage and installed
test coverage are distinct observations. This pass preserves the earlier failed
backend-only asynchronous run and the historical per-class metadata coverage
warnings; it does not establish native Stage contexts or either client screen.
[Safe full UI receipt](evidence/opportunity-edit-2026-10-11/full-ui-fresh-install-0.1.0.11.json).

Actual Developer capacity is two Salesforce CRM licenses, one occupied by the
setup admin. The two approved ordinary identities will run serially, with at most
one ordinary actor active while the admin stays active. Only owned QA actors are
activated/deactivated; no edition, org count or privilege expansion. An inactive
opposite actor means live misuse checks cannot claim simultaneous-active isolation.
Fixture readiness is recorded below; governed Opportunity client acceptance remains unrun.

## Native fixture readiness and browser handoff

Native fixture creation and readback now verify exactly two minimal ordinary
identities, one Account, four Opportunities, two temporary Edit shares, two distinct
SalesProcesses/record types, one QA-prefix validation rule and two owned minimal
permission sets. A is inactive, B and admin active. Effective profiles and all
assigned sets grant no broad or ordinary private-object CRUD; Amount Edit is
present only in the removable owned set. The initial XML deployment rolled back;
the corrected deployment and independent retrieval passed. A partial CLI user
creation was reconciled before permission assignment, without duplicate actors.
[Safe fixture receipt](evidence/opportunity-edit-2026-10-11/full-ui-native-fixtures-0.1.0.11.json).

The user requested CLI org opening, which succeeded without exposing credentials. Native Studio opened in the authenticated owned org. Its synthetic preview rendered the three fields, but Review click and Enter were blocked by the iframe's native form-submission restriction. Chrome's Console reported the exact sandbox failure. No CRM write, draft publication or confirmed save was performed by that preview observation.

After the user's explicit Terms/domain-registration approval, the single owned Site was registered and activated. Native readback verifies Aura, portal pages and registration disabled; the guest has only ingress plus constant landing/error-page access, zero object CRUD rows and no new object/FLS grants. Thirty anonymous protocol observations across both routes passed metadata/challenge checks and rejected missing/fabricated bearer requests to tools, HTML and record operations. No actual named OAuth or host screen is established by these checks. [Safe Site receipt](evidence/opportunity-edit-2026-10-11/full-ui-owned-site-0.1.0.11.json).

Source correction8ffd115f dispatches Review directly through JavaScript and preserves the existing sandbox. All35 renderer tests pass; three generated bundles rebuild identically and consolidated source review found no blocker. This does not alter the installed frozen beta. The [narrow two-resource QA correction](OPPORTUNITY_SCREEN_SANDBOX_CORRECTION_SCOPE_2026-10-12.md) was approved and executed; no additional package or org was created.

Both owned runtime ECAs now passed independent API67 readback of Local identity, exact callbacks, api/refresh_token scopes, required PKCE, rotation and JWT issuance OFF. Actual native Studio has published the exact Opportunity preset; independent readback confirms live policy and published draft agree. Draft-only configuration had no executable action before publication. Both client setups were saved at revision1. Host connections and actual execution remain pending. A is now active and B inactive, with the admin active. Native OAuth userinfo through A’s existing managed session independently matches the exact owned actor and org full18 identities. A’s browser has not been opened. B has no managed auth and needs genuine ordinary sign-in or a supported, actor-verified consent path. Neither admin sign-in nor inactive-actor probes count as ordinary runtime proof. The owned one-day org and Site are retained for this unfinished workflow; exact owned cleanup remains pending completion or failure. No actual-client governed save is claimed.

## Actual corrected Studio walkthrough

The separately approved API67 two-resource patch deployed successfully (2 components, 0 errors), and independent retrieval matched all4 files. Actual Studio passed invalid date correction with retained values and focus, click Review of all3 changes, Back preserving drafts, single-line Enter Review, Cancel resetting the synthetic draft and disabled Save. Its generic controls also passed multiline Enter, required-value focus, an integer larger than JS safe precision and explicit Clear review. No sandbox permission was added. This is actual Salesforce-hosted synthetic renderer evidence; no native Stage/CRM write or chat-client result follows. [Safe correction and Studio receipt](evidence/opportunity-edit-2026-10-11/ui-correction-studio-8ffd115f.json).

## Ordinary browser handoff

Native OAuth userinfo verified ordinary A against the exact owned actor/org before the supported CLI browser open. That open succeeded, but Salesforce displayed its first-login Change Your Password screen. A human credential-entry handoff is pending; no password was entered, generated or stored by the agent. This is distinct from managed-session identity readiness and does not establish ordinary client consent. Both host setup drafts remain unfinished; no governed save effect has occurred.

## First of many scenarios

The user reaffirmed that this is the first of an open-ended set of scenarios. Reuse supported field controls, declarative layouts and the edit/validation/review/confirmation/receipt/recovery lifecycle. The actual generic Studio showcase provides initial browser evidence beyond the three-field preset. Each additional scenario still needs an explicit Salesforce-owned capability and policy: presentation reuse does not grant new execution rights, arbitrary writes or a full Flow engine. Test complete journeys early in their actual environment, then consolidate source, native and client evidence without treating one as the other.

## Actual-client principal acceptance

Both actual clients consented as ordinary QA A and rendered the installed Salesforce-hosted App. ChatGPT Alpha offered native Prospecting/Qualification; Claude Beta offered Prospecting/Needs Analysis. Each completed all3 edits, server Review, explicit Confirm, durable receipt and fresh record read. Native readback verified the exact target values, unchanged owner/record type, exactly one actor-matched success audit and matching persisted receipt per record; total2 save effects. Cancel and the reserved rule-value rejection attempt added zero effects. The rejection retained inputs and required a fresh corrected review; its exact native error text was not exposed. [Sanitized principal receipt](evidence/opportunity-edit-2026-10-11/actual-principal-clients-8ffd115f.json).

Both full chat reloads restored their original Open snapshots, without the completed receipt or Resume control. Explicit Refresh obtained current native values. Persisted receipts and local metadata-resume tests do not establish host reload recovery. One bounded ChatGPT network-interruption attempt completed normally, with one additional natively corroborated save (3 of 8 allowed effects in total); no lost response or Unknown recovery was induced. Network recording stayed off, No throttling was restored and DevTools closed.

Shared-control refinements are implemented at source fccf5162: native date picker, server-initialized picklists and exact comma grouping. All40 renderer tests pass and consolidated review reproduced all three bundles byte-exactly. These are source/renderer results, not live-control acceptance. The [approved two-resource QA update](SHARED_CONTROL_UX_QA_SCOPE_2026-10-12.md) deployed successfully and independent retrieval matched all4 files. Actual Studio shows the native calendar, initialized picklist and comma-formatted Amount. Final calendar selection and updated Claude/ChatGPT checks remain pending; Chrome changed foreground windows during testing. No new native save occurred. [Safe update receipt](evidence/opportunity-edit-2026-10-11/shared-control-ux-fccf516.json).
