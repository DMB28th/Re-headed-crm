# Opportunity confirmed-save Task 3 — source RED bundle

This proposal contains native behavior tests and fail-closed scaffolds only.
Confirmed Opportunity CRM writes, mandatory audit insertion, grant consumption and
completion algorithms have not been implemented. Native compilation and behavioral
RED are NotRun. Task 2's 112/112 checkOnly GREEN establishes its existing transitions;
it does not establish Task 3 behavior or authorize the expanded validation scope.

## Exact proposed scope

API 67.0; 21 Apex classes; 43 ZIP entries; ten RunSpecifiedTests classes;
154 test methods (112 preserved and 42 new). The four new classes are WriteService,
WriteServiceTest, WriteAudit and WriteAuditTest. Existing Repository/Service and
their tests receive narrow Task 3 additions. Types and all other dependencies stay
byte-identical to frozen Task 2 source. Unchanged dependencies are included because
previous checkOnly validations did not persist metadata. No object/permission/UI/
MCP/legacy Account class change is included.

Archive SHA-256: `4895d6ae9c98a6e60e10e63e9b6de40556a81092e7f60959482d8475f59a2b73`.
Manifest SHA-256: `7526ac8689ae31c35783ea03be2eb2dfec18fea505e5eb770e0f2999b58633db`.
Controller artifacts: `.superpowers/sdd/2026-10-11-opportunity-custom-mcp-apps/task-3-validation/`.
The exact class/method/member inventory, proposed command and controller-only runner
are saved there. New-scope user approval is required before controller execution;
no org/auth/test/deploy/package or live fixture action was performed by this worker.

## Behavior and authority boundary

Tests demand one all-fields user-mode CRM update, one mandatory audit, and identical
durable confirmation/interaction receipts. Audit/receipt fault cases independently
read all three target values/SystemModstamp, zero audit count, original private
state JSON, pending grant and absent receipts after rollback. Inert private test
flags/counters reserve narrowly scoped fail/observe boundaries; future consumers
must use Test.isRunningTest and cannot bypass production authorization or persistence.

Consumed-grant duplicate Confirm binds the original private confirmation identity,
exact hash/grant and reviewed revision plus the original consumed interaction
revision. Current actor/org/client/application/access/setup/action/policy gates hold.
Already Completed outcome retrieval skips old expiry/initial freshness only; it
cannot re-mint authority, rewrite receipt, or repeat a save after later CRM changes.
Completed noChanges receipts support Resume only. Invalid grants/revisions, redirected
interaction, injected patch, context drift and permission loss reject without values.

The existing audit schema supports a dedicated required system insert with Action
UPDATE, Tool_Name crm_opportunity_edit_confirm, current User, normalized Opportunity
Record_Id, server Timestamp and versioned receipt/exact reviewed diff in Details.
Audit validation must reject non-Opportunity targets, noChanges/empty/unknown-field
diffs. No ordinary audit CRUD is granted and best-effort logAction is not reused.

Known CRM DML errors roll back the attempt, invalidate grant, retain answers and
require a new review. Mandatory write failures roll back without reporting Completed.
The attempt counters support verifying the failure happened after CRM update; they
are currently inert because all execution algorithms await observed native RED.

## Verification and limits

Fresh offline checks passed: all 43 archive members match exact source, ZIP integrity,
API67 XML, 21/ten/154 inventory, class line limits, 260 preservation hashes, unchanged
Task 2 dependency bytes and frozen Task 2 archive hash. Whitespace/source-scope checks
are reported with the scoped commit in task-3-report.md. Analyzer remains unavailable
under the previously observed missing-Java/zero-source-files condition; no retry or
installation was performed. No native compile/test/coverage/RED/GREEN claim is made.

Lost-response and cancel/confirm tests are unit simulations and serial order checks;
they do not prove real network loss, transaction contention, host behavior or live
automation. Actual ConnectApi under the lock sequence, native ordinary-user ingress,
real sales-process/currency modes, full-suite/package/live-client QA remain later gates.
No interaction purge/schedule, new helper, dependency or permission was introduced.

## Controller readiness review

Frozen source `bd3dec4f7e7542648ae8122391c3e4d0b041a008` received separate
spec and quality approvals with no blocking findings. Controller independently
verified all 43 archive entries against source, API67 manifest/class metadata,
21 classes/ten test classes/154 methods, preservation of the prior112 method
names and all260 protected-file hashes.
[Safe readiness receipt](evidence/opportunity-edit-2026-10-11/task-3-red-readiness.json).
Native compilation and behavioral RED remain NotRun. The proposed command is
checkOnly on `cardstack-spike2`; no persistent deployment or business-record
save is proposed. This expands the prior17-class/eight-test validation scope
and awaits separate authorization under the approved implementation plan.

## Observed native RED

After explicit user approval, source `bd3dec4` completed API67 checkOnly
with zero compilation errors: 154 tests ran, 113 passed and exactly41 new
missing-behavior cases failed with System.AssertException. All prior112 tests
and the new mandatory named-user gate passed.
[Safe native RED receipt](evidence/opportunity-edit-2026-10-11/task-3-native-red.json).
The observed archive is frozen as `task-3-observed-red.zip` with the original
SHA-256. No metadata/business-record persistence or auth-settings mutation
occurred. Task3 algorithm implementation may now proceed; unit GREEN and
actual provider/concurrency/package/client evidence remain pending.


## Latest source algorithms after native RED

Controller frozen bd3dec4 API67 checkOnly completed0compile/154run/113pass/41
expected missing-behavior assertion failures. The atomic save implementation now
uses setup→interaction→confirmation→Opportunity locks, current access/context checks,
exact Domain typed-patch reconstruction, one USER_MODE update, required server audit
and identical durable completion receipts. Savepoint rollback covers required writes;
known CRM DML failure invalidates authority, preserves answers and requires new Review.
Completed consumed-grant replay authenticates its exact original revisions/subject
and current rights, returns original immutable receipt without DML after edit expiry.
Types consumed-revision overload and existing Service presentation reuse are narrow
approved helpers; no new class/permission/retention/UI/MCP/legacy changes.

All154 assertions/test bytes stay frozen. Faults are Test.isRunningTest-only fail/
observe boundaries, including a real USER_MODE required-field CRM DML failure and
required audit insert failure. Unit simulations do not establish actual contention,
network loss, native ConnectApi inside locks, ordinary-user, automation or client proof.

Proposed GREEN ZIP SHA256: `4a8b79578fa0761a90d9ae5469afa07e0b5e68774742ae55dd79c289fdeb40c1`.
API67/21classes/43entries/tenTestClasses/154methods. All member/source hashes, class
line limits, preserved test bytes,260 protected files and frozen prior archives were
verified offline. Full source/report/commands in task-3-validation and task-3-report.md.
Native GREEN is NotRun; independent source reviews and controller same-scope native
validation follow. Analyzer remains unavailable under established missingJava; no
retry/install or live action was performed by worker.

## Accepted Task3 native unit validation

Source `65aa5d04ffd0962c052266efa5ae4e3bd124bcab`, frozen GREEN archive
SHA-256 `4a8b79578fa0761a90d9ae5469afa07e0b5e68774742ae55dd79c289fdeb40c1`,
completed API67 checkOnly **Succeeded**: zero compilation errors, **154/154
tests passed**, zero failures, all nine covered production classes above75%.
Both separate algorithm reviews approved with no blockers.
[Safe unit acceptance receipt](evidence/opportunity-edit-2026-10-11/task-3-native-unit-green.json).
The CLI initial wait expired; reports continued the same job until completion,
without another deployment submission. No metadata/business-record persistence
or auth-settings changes occurred. This accepts atomic save/audit/receipt/replay
at native unit scope; actual provider/automation/concurrency/package/client gates
remain pending.
