# Opportunity edit Task 2 — source-only behavioral RED proposal

October 11, 2026. This document describes tests and source-compatible scaffolds,
not implemented durable transitions or an observed native RED result. No org
query, authentication, deploy, test execution, package creation, or live fixture
operation was performed by this worker. The controller must review and obtain
separate authorization for the exact proposed native checkOnly bundle.

The first Task 2 dispatch deliberately stops before persistence or transition
algorithms. ActionPolicy and EditRepository throw bounded `NOT_IMPLEMENTED`
errors; repository entry points retain the existing application permission gate.
EditService returns `Rejected` with `NOT_IMPLEMENTED`, empty public view lists,
and no private interaction handle or grant. Its private test-visible request-size
guard also throws `NOT_IMPLEMENTED`. The only resolver change is an Opportunity
branch that invokes the fixed-preset policy boundary. Account resolver/edit,
legacy `updateSubject`, preview, write services, UI, permissions, and private
object metadata remain unchanged.

## Pinned boundaries

- `ActionPolicy.validate` accepts authoritative `CardstackPolicyService.Policy`:
  published edit-enabled intent and fields already restricted by native rights.
  Future EditService projects restrictive `EditTypes.Policy` for the existing
  domain; native Describe adds constraints.
- Actions remain `type=record-edit`. Opportunity permits exactly three ordered
  `{fieldApi,source:'current'}` mappings: StageName, CloseDate, Amount. Extra
  targets, alternate source mappings, and unused payload are rejected.
- Task 2 bounds `Blob.valueOf(JSON.serialize(typedTransitionRequest)).size()` at
  16,384 bytes before transition processing. This measures canonical typed JSON,
  not original decoded tool arguments. A narrowly private test-visible guard
  separates this budget from independent field grammar validity.
- Task 4 independently owns strict parsing/unknown-key rejection and the 16 KiB
  original decoded tool-argument byte budget; existing tighter ingress wins.
- Tagged `StoredState` is independently bounded at 32,768 serialized UTF-8 bytes.
  Exact and one-byte-over fixtures contain multibyte `é`; tag rejection is tested
  separately. The tag is `kind=opportunity-edit-v1`, process `opportunity-edit/v1`.
- First accepted Review must affect exactly two DML rows: one private confirmation
  insert and one interaction update. Setup fixtures already exist before measurement;
  setup locks and reads require no DML. Independent user-mode target readback checks
  all three values and SystemModstamp. The row budget detects trial/rollback CRM DML
  that a final-value-only assertion could miss. No new test trigger was authorized.
- No-op completion permits exactly one DML row, which must durably complete the
  private interaction. Independent user-mode readback preserves Stage/CloseDate/
  Amount/SystemModstamp; confirmation count is zero and audit count does not increase.
- Review Resume checks the actual first and resumed confirmation deadlines by grant
  hash against the original persisted interaction deadline. The test shortens both
  row and tagged-state expiry to a still-active two-minute deadline before first
  Review, so granting a fresh default lifetime cannot pass by preserving view text.

## Native assertion proposal

| Test class | Methods | Behavior that would fail on the scaffold |
| --- | ---: | --- |
| CardstackOpportunityActionPolicyTest | 7 | Valid preset acceptance, exact source/order/count, unused payload, published restrictions |
| CardstackOpportunityEditRepositoryTest | 8 | Durable create/lock/save, SHA-256-only handles, legacy-kind replay denial, client gate, exact/over state bytes |
| CardstackOpportunityEditServiceTest | 15 | Published launch; drafts; read-only review; Back/Cancel; expiry; actor replay; no-op; Resume rotation/drift/rights; retained receipt; typed-request bytes |
| CardstackRecordActionServiceTest | 10 | Eight preserved legacy tests plus fixed Opportunity resolution and extra-target rejection |

Tests call real production entry points and inspect real rolled-back private rows
and user-mode Opportunity reads. Only the existing private provider choices seam
and application-permission test override are used. A separate test User uses the
current test profile to exercise actual actor mismatch; User insert occurs first,
original actor data/start runs within `System.runAs(current)`, and replay runs
within `System.runAs(other)`. This does not prove ordinary-user MCP ingress.

Positive launch/persistence assertions reject generic placeholder denials.
Negative branches assert specific bounded codes so `NOT_IMPLEMENTED` cannot
satisfy them accidentally. Review-dependent assertions have an explicit accepted
Editing/Review prerequisite; in the first scaffold run they can fail at that
prerequisite. Later native runs must reach and verify their transition assertions.
One existing permission gate can already pass; source preparation does not claim
every proposed method must fail or that any test has actually executed.

## Exact proposed API 67 bundle

Private artifact directory:
`.superpowers/sdd/2026-10-11-opportunity-custom-mcp-apps/task-2-validation/`.

- ZIP: `task-2-red.zip`, SHA-256
  `1e724bf067fbd72d51c948c99e61a7f539f7f08ea90a3683cda9bcc68569097a`.
- Prior unrun proposal preserved as `task-2-red-prior-d7f3990-proposed.zip`, SHA-256
  `7d01c216b3c7db9d6ef9df331f72d7059b3e835cf7e76dbc4defcb55b551de7a`,
  with `inventory-prior-d7f3990-proposed.json`. The quality correction changes only
  the two existing ServiceTest methods above; the 17/35/8/111 scope is unchanged.
- Manifest: `package.xml`, API 67.0; 17 unique ApexClass members and 35 ZIP entries.
- Inventory: `inventory.json`, including exact source paths, member SHA-256 values,
  source origins, and all 111 method names; `run-specified-tests.txt` lists the eight
  proposed test classes.
- Includes Task 1's nine helper/test dependencies from frozen source
  `c48c90de59082bfbe8c52e8c403391e6e164a469`, including test-only EditTestData.
  Task 2 extends EditTypes; every other Task 1 source/metadata pair is unchanged.
  Task 1 checkOnly never persisted those classes to the target. Its prior archive
  remains preserved: SHA-256
  `2f490df1b18fdf86ec824066e7b51e774213469caec41239edb271aa9e310fff`.
- Target must already supply compatible baseline private interaction/confirmation,
  setup/config/draft objects and fields, application permissions, and legacy
  config/policy/connection/preview/edit classes. This union supplies no object or
  permission changes and authorizes no persistent deployment.

Proposed RunSpecifiedTests: CardstackOpportunityEditTypesTest,
CardstackOpportunityStageProviderTest, CardstackOpportunitySelectorTest,
CardstackOpportunityEditDomainTest, CardstackOpportunityActionPolicyTest,
CardstackOpportunityEditRepositoryTest, CardstackOpportunityEditServiceTest,
CardstackRecordActionServiceTest.

Offline checks verified ZIP integrity, every member against source, unchanged
Task 1 pairs against the frozen commit, API67 XML, 17/35/8/111 inventory counts,
and all owned Apex classes below 500 lines. `git diff --check` passed. These checks
do not compile Apex, establish behavioral RED, or prove transitions.

Native compilation/RED for this new scope remains pending. Analyzer remains
unavailable under the previously established missing-Java condition; no startup
retry or dependency installation was authorized. Typed patch/state restoration,
actual supported ConnectApi runtime, actual ordinary-user ingress, two actual
sales processes, live record UI/automation, and API67 package install remain
unproved. Durable algorithms wait for authorized, observed native behavioral RED.

## Concrete controller validation scope — awaiting user approval

Target is the existing `cardstack-spike2` only. Request checkOnly validation and
same-class/test-scope reruns after source fixes: API67, exactly the 17-member union,
eight RunSpecifiedTests classes, currently111 methods. This approval does not cover
persistent deployment, package creation, object/permission changes, live client QA,
or business-record writes. Fixtures exist only in rolled-back @IsTest transactions.

Use the existing managed opaque CLI session when valid. If a fresh managed login
is necessary, use the documented temporary deployment-app JWT OFF procedure and
restore/save/verify JWT ON afterward. Preserve the distinct proven runtime OAuth
apps. Current deployment JWT was previously restored and verified ON; no subsequent
settings were changed. If the Mac is locked when UI work is required, wait for the
user to unlock it rather than changing credentials or bypassing protections.

From `salesforce-native/`, the exact proposed command is below. Capture privately;
never print job IDs, credentials, private handles, grants, raw logs or CRM values.
The subshell uses owner-only permissions for new capture files.

```sh
(
  umask 077
  sf project deploy start --dry-run --target-org cardstack-spike2 \
    --api-version 67.0 \
    --metadata-dir ../.superpowers/sdd/2026-10-11-opportunity-custom-mcp-apps/task-2-validation/task-2-red.zip \
    --single-package --test-level RunSpecifiedTests \
    --tests CardstackOpportunityEditTypesTest \
    --tests CardstackOpportunityStageProviderTest \
    --tests CardstackOpportunitySelectorTest \
    --tests CardstackOpportunityEditDomainTest \
    --tests CardstackOpportunityActionPolicyTest \
    --tests CardstackOpportunityEditRepositoryTest \
    --tests CardstackOpportunityEditServiceTest \
    --tests CardstackRecordActionServiceTest \
    --wait 1 --json --junit \
    --results-dir ../.superpowers/sdd/2026-10-11-opportunity-custom-mcp-apps/task-2-validation/native-red-results \
    > ../.superpowers/sdd/2026-10-11-opportunity-custom-mcp-apps/task-2-validation/native-red.private.json \
    2> ../.superpowers/sdd/2026-10-11-opportunity-custom-mcp-apps/task-2-validation/native-red-stderr.private.log
)
```

Verify ZIP hash and exact member inventory immediately before submission. On wait
timeout, retrieve completion from the same privately captured job; never resubmit.
Only completed intended assertion failures after compilation establish behavioral
RED. Compile/setup failures, incomplete jobs or coverage-only rejection do not.
The controller records sanitized status/counts/names/hash receipts and preserves
original failure captures. Durable Task2 algorithms remain gated on observed RED.

## Final source readiness

Source `2bc8b329214233e9fe90a7c627123071d94510fe` was separately reviewed for spec
and quality; both re-reviews **Approved** after strengthening persisted grant
deadline and no-op DML/readback assertions. Current ZIP SHA-256 remains
`1e724bf067fbd72d51c948c99e61a7f539f7f08ea90a3683cda9bcc68569097a`.
Controller verified all35entries against current source/API67 metadata and all260
protected-file hashes. [Safe readiness receipt](evidence/opportunity-edit-2026-10-11/task-2-red-readiness.json).

Native compilation and initial intended assertion failures have **not run** for
this new17class/eighttest scope. The command above awaits separate user approval;
full Task2 algorithms remain unimplemented until observed native behavioral RED.

## Latest Task 2 algorithms — source review candidate

The preceding proposal is historical. The controller completed the authorized
API67 checkOnly RED at source `2bc8b32`: zero compile errors, 111 tests run,
80 passed and 31 intended System.AssertException failures. The observed archive
`task-2-observed-red-2bc8b32.zip` remains unchanged at SHA-256 `1e724bf067fbd72d51c948c99e61a7f539f7f08ea90a3683cda9bcc68569097a`.

Task 2 now implements published fixed-preset validation, actor/client/org-bound
private interaction persistence, Editing/Review/Back/Cancel/Resume, absolute expiry,
context conflict handling, private grant rotation and noChanges completion receipts.
Confirmation remains bounded `CONFIRM_NOT_IMPLEMENTED`; Task 3 owns CRM writes.
Setup → interaction → confirmation locks preserve one order. Grants independently
revalidate the canonical patch and published/current context, bind all pinned review
identities/revisions, and cap the actual persisted deadline at the original interaction
expiry. Raw handles/grants never enter stored state. Restoration explicitly restores
Opportunity data and leaves executable values to fresh Domain canonicalization.
Current policy/action/native access gates apply before receipt disclosure; Completed
Resume retrieves the original receipt without applying initial freshness/expiry.

Private mutation savepoints rollback on bounded failure and release in finally.
There is no Opportunity DML or legacy preview/update delegation. Existing assertions
still require exactly two private rows at first Review and one at noChanges completion,
with independent USER_MODE target values/SystemModstamp readback. The repository test
fixture now seeds both supported client setup rows; all eight test classes and
111 method names/assertions are preserved.

Fresh offline candidate: `task-2-validation/task-2-green.zip`, SHA-256
`9bd04e8640052814cef58b96d063f6ffe9e4617d44e0d1a69d5bcda3d785ecbe`.
API67 manifest remains 17 classes/35 entries/eight test classes/111 methods.
The interrupted candidate was stale for Repository source and is preserved as
`task-2-green-prior-728f214.zip` with its original inventory. The new candidate
matches all current source members; unchanged Task 1 dependencies match frozen
`c48c90de`. Native GREEN/coverage and independent algorithm reviews remain pending.
Analyzer remains unavailable under the established missing-Java/zero-source-files
result; no repeat startup, install, org/auth/test/deploy/package action was performed
by this worker. Actual provider, ordinary-user/client, automation and package gates
remain separate from this source candidate.

## Deadline precision correction — native evidence first

Native validation of `66a13e5` compiled with 111 tests: 99 passed/12 failed.
The tests-only `a0f5bee` diagnostic compiled with 112 tests: 99 passed/13 failed.
Its deterministic 777ms expiry survived tagged JSON exactly, while independent
native DateTime-field readback removed 777ms (row minus tagged = -777ms;
row millisecond = 0, tagged = 777). Safe evidence lives in the private validation
directory as `native-task2-deadline-evidence.sanitized.json`.

Repository creation now validates the original deadline, floors it once to whole
UTC seconds, rejects an already-expired result and serializes that accepted
deadline for both state and row. Exact restoration equality, immutable original
deadline and grant capping remain intact. No late normalization masks state drift.
The two manual ServiceTest expiry fixtures now use whole seconds for their paired
row/state writes; all existing assertions and the new regression remain unchanged.

Pending GREEN candidate: `task-2-deadline-green.zip`, SHA-256
`9d8592e3fe9c87f85b365bfa40907b61276a145d4259c8c22caebb32167f63c5`;
API67/17 classes/35 entries/eight test classes/112 methods. Failed GREEN and
tests-only diagnostic RED archives/captures are preserved. Offline exact-source,
manifest/inventory and protected-file checks passed; native GREEN and focused
reviews of this correction remain pending. Analyzer status is unchanged.

## Accepted Task 2 native unit validation

Source `515d87555f6eae01cc749b0784320a598780f763` completed the authorized
API67 checkOnly validation: **Succeeded**, zero compilation errors, **112/112
tests passed**, zero failures. The frozen 17-class/35-entry/eight-test archive
`task-2-deadline-green.zip` retains SHA-256
`9d8592e3fe9c87f85b365bfa40907b61276a145d4259c8c22caebb32167f63c5`.
All seven covered production classes exceeded 75%; both focused independent
reviews approved the precision correction.

[Safe acceptance receipt](evidence/opportunity-edit-2026-10-11/task-2-native-unit-green.json).
No metadata or business records persisted; only rolled-back test fixtures ran.
The deployment app was previously restored and verified JWT ON, with no
subsequent settings changes. Earlier failures remain preserved as historical
evidence. This accepts the Edit/Review flow at unit scope; confirmed saves,
MCP/UI delivery and the real provider/package/ordinary-user gates remain pending.
