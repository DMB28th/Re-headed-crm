# Opportunity Stage provider: Task 1 validation

October 11, 2026. **Native behavioral RED observed; Task 1 source implementation
passed all 53 scoped unit assertions; checkOnly failed solely on per-class coverage.
The 71-method typed-mapper RED is observed; original parsing is now extracted into
the shared mapper and current native GREEN/coverage acceptance remain pending.** The controller owns live validation,
authentication and cleanup. The source author performed no org/auth/query/deploy/
native-test/package actions. Broader renderer Task 5 remains gated.

## Exact scope and behavior

All nine ApexClass members have Active API **67.0** metadata. No existing runtime,
permission, object, UI or ingress class is supplied or changed.

| Manifest member | Role | Test methods |
| --- | --- | ---: |
| CardstackOpportunityEditTypes | Task 1 DTOs, platform actual/master checksum18 context and canonical digest helper | — |
| CardstackOpportunityStageProvider | Supported ConnectApi values/labels and fingerprint; shared private native-response mapper | — |
| CardstackOpportunitySelector | Sharing/user-mode bound single-record read, optional lock, currency and freshness | — |
| CardstackOpportunityEditDomain | Exact field/operation grammar, native/published constraints, typed patch/diff and no-ops | — |
| CardstackOpportunityEditTypesTest | Exact decimal transport and bounded null/object/context/digest denial | 6 |
| CardstackOpportunityStageProviderTest | Choices/context, source/malformed denial and typed native-response mapping | 20 |
| CardstackOpportunitySelectorTest | Typed read, lock, currency, invalid identities/fields | 6 |
| CardstackOpportunityEditDomainTest | Exact decimal/date, clear/omission, inactive Stage, required result, policy, digest and no DML | 39 |
| CardstackOpportunityEditTestData | SeeAllData=false test-only factory/synthetic context | — |

The original **53** methods/assertions are retained; five Types denials and thirteen
provider boundary/mapping specifications bring the current candidate to **71**. The only implementation-phase fixture
change supplies record CurrencyIsoCode in multicurrency schemas and
organization currency in scalar schemas. All IDs come from platform Describe/test
inserts and the existing checksum18 normalizer. Selector tests gate optional
RecordTypeId/CurrencyIsoCode columns through Describe and use bound USER_MODE reads.
The locked-read DML counter is captured/asserted before stopTest restores limits.

Production Stage choices delegate only to
[API 67 RecordUi.getPicklistValuesByRecordType](https://developer.salesforce.com/docs/atlas.en-us.262.0.apexref.meta/apexref/apex_ConnectAPI_RecordUi_static_methods.htm).
The rendered official references verify `PicklistValuesCollection.picklistFieldValues`
(`Map<String,PicklistValues>`), `PicklistValues.values` (`List<PicklistValue>`), and
`PicklistValue.value/label`. Only StageName is retained; absent/malformed/dependent
context fails closed. No generic Describe Stage fallback exists. Private test-visible
OptionsSource injection is used only under Test.isRunningTest(); no runtime setter.
The private @TestVisible pure mapper now contains the original native parsing.
NativeOptionsSource.fetch invokes the supported API then delegates to that same
mapper. Only StageName is copied with literal labels and the full authorized context;
no new validation rule, test API substitution or call fallback exists.

Selector uses actual RecordTypeId when exposed and platform master otherwise; no
user-default record type substitution. Currency is actual record CurrencyIsoCode
when exposed, otherwise
[UserInfo.getDefaultCurrency](https://developer.salesforce.com/docs/atlas.en-us.262.0.apexref.meta/apexref/apex_methods_system_userinfo.htm),
whose documented API>22 scalar behavior returns organization currency. Freshness
hashes ordered read fields including SystemModstamp, record identity, Stage/date/
Amount, required fields, actual/master context and currency. Locked reads retain
USER_MODE. Native locked-read tests passed in the controller regression checkOnly;
ordinary-user access/denial proof remains pending, with no system fallback.

Domain only accepts exact StageName/CloseDate/Amount and explicit set/clear; native
Describe and published policy both restrict edits. Dates use strict calendar parts
and exact round-trip strings. Plain decimals enforce native precision/scale before
Decimal conversion; no rounding, currency conversion or binary floating point.
[Decimal.toPlainString](https://developer.salesforce.com/docs/atlas.en-us.262.0.apexref.meta/apexref/apex_methods_system_decimal.htm)
plus removal of insignificant fractional zeros binds equivalent decimals identically.
Optional Amount clear retains explicit typed null; omission and typed no-ops produce
no entries. Effective post-patch required values are validated even for omitted fields,
empty lists and no-ops: published requiredFields plus native non-nillable editor
fields must remain nonnull/nonblank, otherwise FIELD_REQUIRED. Optional omitted-null
Amount remains allowed. Inactive current Stage may only be kept. Patch/diff order is
canonical. Labels retain bounded literal native/Unicode JSON text; HTML encoding
must occur at the rendering boundary, using future Task 5 plain-DOM textContent.
No HTML/innerHTML renderer exists here. Domain performs no SOQL/DML/callout/trial save.

Only Task 1 DTOs exist; future transition/view/private-state types, persistence,
save, ingress, UI and broader task algorithms remain outside this submission.
Existing CardstackConnectionTypes and CardstackPreviewUpdateAction.PatchEntry are
compile dependencies already on the target, and are not modified/supplied.

## Observed native RED and offline evidence

The earlier archive `6a69a37c77ae96cf52e18010f2be5bbc4394df8c342c8eb7a7bf951c433ab844`
failed with 2 compile errors/0 tests because the target Opportunity has no
RecordTypeId column. The portable test fix retained actual-type assertions when
available and master context otherwise. The first CLI invocation rejected
--results-dir without --junit locally and created no job.

For corrected RED source 4d0cfe0, the safe controller receipt reports API67,
checkOnly=true, done=true, Failed, **0 compile errors, 51 tests run, 49
System.AssertException failures and 2 no-op successes** (equivalentZeroCreatesNoChange,
inactiveCurrentStageCanOnlyBeKept). It proves newly supplied tests executed in
checkOnly and establishes behavioral RED before algorithms. It does not prove
production ConnectApi: provider choices were injected. The controller verified
JWT ON afterward, no persisted metadata or business CRM write. The receipt is
committed separately at d76e5fd, the implementation review base.

Scoped analyzer's existing attempt exited 1: no Java 11+ runtime; PMD/CPD/SFGE
engine startup errors across **0 scanned files**. No source finding/clean scan,
Apex parser, current mapper-candidate native compilation or full checkOnly success is claimed. No toolchain
install/change or repeated startup was attempted for this submission.

Private ignored artifacts live under
`.superpowers/sdd/2026-10-11-opportunity-custom-mcp-apps/task-1-validation/`.
`green-inventory.json` and `green-SHA256SUMS` record exact members, bytes/hashes,
API67 metadata and the original unchanged 51-method inventory. Standard-library verification
checks 19 ZIP entries, exact manifest membership, integrity and member/source bytes.
These are packaging checks, not Apex compiler/tests or mirrored domain tests.
Original RED archive/inventory and controller evidence remain preserved.

| Artifact | SHA-256 |
| --- | --- |
| package.xml | `895c082ffbe1907489e2159b83a82cb9df8a1b311eacc3b18f59395ad134e129` |
| task-1-observed-red.zip | `4c57b2e13060e8c574c687a90fc017942a7e865be82f1ce97310505967d4ef51` |
| task-1-green.zip (prior 51-method implementation candidate, preserved) | `d04eaa4c009e6b28082aa68b43ba63be8c72f8689c62f6632220f0289843857e` |
| task-1-review-regression-red.zip (53-method observed RED, preserved) | `462abbb02f2de08d535632f546ec30c58d4383999e92b14c17c2f4b98df25815` |
| task-1-review-fix-green.zip (53 assertions passed, coverage rejected; preserved) | `efc341ba63c3c85c94a36fdc26cc839ed8efea4d73d3577e97c4e4557b949fec` |
| task-1-mapper-red.zip (71-method observed RED, preserved) | `e35c03a64ab86baececd54cfe4ed9b2e235e5b6a7bb6eccca4d3ad5f05ac1a5a` |
| task-1-mapper-green.zip (71-method extraction candidate, not run) | `2f490df1b18fdf86ec824066e7b51e774213469caec41239edb271aa9e310fff` |

## Observed review regression RED and proposed controller GREEN

For f4090a6 / regression ZIP 462abbb..., the SAFE controller receipt reports API67,
checkOnly=true, done=true, **0 compile errors, 53 tests run, 50 passed and 3
System.AssertException failures**. Both omitted-required-null tests failed expecting
FIELD_REQUIRED. stageValuesUseRecordTypeApiValues expected literal Unicode
`Qualification affichée` but received `Qualification affich&eacute;e` from escapeHtml4.
The controller fetched completion from the same timed-out job, did not resubmit,
verified JWT ON and reported no persisted metadata/business CRM write. **Two generic
coverage warnings** were observed; the controller later classified StageProvider
coverage as 62.712% and Types as 70.588% for f4090a6. These are prior-source coverage
results, separate from assertion counts and pending fix validation.
All selector tests, including USER_MODE locked read, passed within this unit context.
These results establish actual regression RED, not ordinary-user/native provider proof.

Source fixes now validate effective proposed-or-current required values before
returning any patch, adding native-required editor fields and preserving policy
restrictions. Provider Choice.label and Domain DiffRow.label retain literal JSON
text. No tests/assertions changed, no additional coverage seam or renderer was added.
The preserved RED archive/ledger and prior 51-method implementation archive are
unchanged. New task-1-review-fix-green.zip and review-fix-green-inventory.json /
review-fix-green-SHA256SUMS pin the same nine classes/four tests/**53** methods.
The controller subsequently ran the source fixes: the receipt below supersedes
that previously pending assertion-run status; overall checkOnly success is pending.

## Passing assertions, coverage gate and observed typed mapper RED

Safe native-fix-green.sanitized.json records fcb2ec97/API67/checkOnly=true/done=true,
**0 compile errors, 53 tests run, 53 passed, 0 failed**. Overall status Failed solely
because Types covered **24/34 (70.588%)** and StageProvider **37/59 (62.712%)**.
Selector was 86.538%, Domain 90.141%. These are scoped native unit results, separate
from genuine ConnectApi execution/package/ordinary-user proof. Deployment JWT was
last saved/verified ON before this checkOnly; no subsequent app mutation, while
repeat UI verification was unavailable with Mac locked. Receipt commit a769563 is
separate from source. No fresh observation or cleanup result is invented.

Investigation identified actual behavior gaps in test evidence: bounded Types
null/wrong-object/foreign-context denials and provider source exception/malformed
choices; native typed collection parsing is unexecuted by OptionsSource fixtures.
New tests cover those denials plus real typed PicklistValuesCollection → StageName
extraction, exclusion of other fields, literal labels/full context, independent
empty controllers, null collection/map/Stage/values/item, missing Stage and unsupported
controlling values. They create typed output DTO fixtures, not a fake API response or
permission actor. No new DML fixture is introduced. Types foreign identity uses the
platform's current actor ID only within a future test; bounded errors expose no ID.

SAFE native-mapper-red.sanitized.json records a45f457/API67/checkOnly=true/done=true,
**0 compile errors, 71 run, 69 passed and 2 System.AssertException failures**:
`nativeCollectionMapsOnlyStageName` and `nativeCollectionAcceptsEmptyControllers`.
Original 53 passed; typed output DTO constructors/setters compiled. Types reached
26/34 (76.471%); StageProvider was 42/61 (68.852%). The same job was reported to
completion. This establishes actual mapper RED; it does not establish real native
ConnectApi execution or successful coverage acceptance.

Source now moves the existing StageName parsing block unchanged into the private
mapper and replaces the native fetch's block with delegation after its supported
ConnectApi call. Null/missing/controlling/null-item handling and API/context/labels
are unchanged. All **71** test sources/assertions are unchanged. No new algorithm,
API fallback, fixture seam, permission actor or coverage-only bypass was added.

mapper-green-inventory.json and mapper-green-SHA256SUMS pin exact source/member
bytes, manifest/archive hashes and all 71 methods within the same nine classes/four
tests. All older archives/controller evidence are preserved. Offline checks prove
packaging and extraction-source equivalence only; current native compilation/unit
GREEN/coverage acceptance and working analyzer remain pending.

This same nine-class/four-test request is **proposed only**. Scope must name the
existing cardstack-spike2, exact mapper GREEN hash, private results and no persistence/
CRM business writes. Rolled-back test fixture inserts depend on executing-user
permissions/default record type/required fields/target automation; setup failures
must be identified separately. No bulk effect is introduced.

From salesforce-native/, after separately authorized authentication if needed:

```sh
sf project deploy start --dry-run \
  --target-org cardstack-spike2 --api-version 67.0 \
  --metadata-dir ../.superpowers/sdd/2026-10-11-opportunity-custom-mcp-apps/task-1-validation/task-1-mapper-green.zip \
  --single-package --test-level RunSpecifiedTests \
  --tests CardstackOpportunityEditTypesTest \
  --tests CardstackOpportunityStageProviderTest \
  --tests CardstackOpportunitySelectorTest \
  --tests CardstackOpportunityEditDomainTest \
  --wait 1 --json --junit \
  --results-dir ../.superpowers/sdd/2026-10-11-opportunity-custom-mcp-apps/task-1-validation/native-mapper-green-results
```

If timeout occurs, report/resume the same job; never resubmit. Capture compile,
completed test names/counts and coverage separately. Injected provider tests do
not execute the native ConnectApi branch, so a coverage-only checkOnly rejection
must be distinguished from behavioral failures. No persistent deploy to obtain
coverage or alternate org is implied. API67 SOAP auth, if required, separately
uses JWT OFF/fresh managed opaque login/finally verified deployment JWT ON;
credentials/session/private identities never appear in safe evidence.

## Pending gates

Independent extraction review, current API67 unit GREEN/coverage acceptance and
working scoped analyzer
remain pending. Real supported ConnectApi execution, package creation/install
compatibility (the official method reference also restricts package push upgrades),
ordinary connected-user named-ingress reads/denials, actual two record types/sales
processes, both currency modes and context drift require separately approved proof.
Master-only Describe and synthetic option drift are **not two real sales processes**.
Unit labels/inactive fixtures are not live translated/inactive Stage evidence.
No release, beta promotion, HXL retirement, publish, push or merge is authorized.

## Latest scoped native unit acceptance — October 11, 2026

Pinned source `c48c90de59082bfbe8c52e8c403391e6e164a469`; ZIP SHA-256
`2f490df1b18fdf86ec824066e7b51e774213469caec41239edb271aa9e310fff`.
Completed API67 checkOnly **Succeeded**, 0 component errors, **71/71 tests passed**.
RunSpecifiedTests remained the four Task1 test classes, nine class members.
Coverage: Domain90.141%, StageProvider93.443%, Types76.471%, Selector86.538%; all
clear the per-class75% gate. Metadata was not persisted; test fixtures rolled back.
Both focused extraction reviews Approved. [Safe receipt](evidence/opportunity-edit-2026-10-11/task-1-native-unit-green.json).

This proves the scoped unit assertions, typed native-response construction/parser,
compilation and checkOnly coverage. It does not prove live RecordUi execution,
package creation/fresh install, ordinary-user named ingress/denials, two actual
sales processes, both currency modes or drift/read-back. Task5 renderer gate remains
closed. Analyzer remains unavailable from the existing missing-Java startup failure
with0source files scanned; no analyzer pass claim. Previous RED/coverage failures
and frozen archives remain historical evidence.

Deployment JWT was restored and verified ON earlier in this approved run, with no
subsequent app setting changes. A repeat read-only UI observation was unavailable
while the Mac was locked. Runtime OAuth apps, installed beta and connections were
preserved. No release, cutover, push or merge.

## October 12 screen-first revision

The user's revised milestone supersedes the earlier Task5 source-development
gate. Reusable renderer implementation proceeds alongside package and provider
work. Actual native Stage choices and installed compatibility still gate live
acceptance. Earlier failure and pending statuses above describe their dated
snapshots; they are not rewritten as success. See
[revised milestone](superpowers/specs/2026-10-12-reusable-screen-milestone.md) and
[acceptance evidence checklist](OPPORTUNITY_CUSTOM_UI_QA.md).
