# Full private Task2 foundation: deployment review scope

The approved private Task2 foundation is installed and verified; see final status
below. Historical preparation and approval boundaries remain documented.
The post-bootstrap-green-receipt.json records API67 clean-source
checkOnly success2026-10-09 12:02:50.363Z: componentErrors0, testErrors0,28completed.
Controller privately verified every reviewed method passed exactly once. This
establishes source compilation and Apex unit behavior after persisted bootstrap;
it does not persist Task2 classes/schema, prove OAuth, or clear Task1/Task3 gates.
Reviewed stale-guard mutation red-r5 failed exactly saveRejectsStaleRevision
12:03:43.380Z:27 passed, one expected behavioral failure, zero compiler errors.
Restored-clean green-r6 succeeded12:06:37.715Z:28/28, zero component/test errors;
controller independently verified each declared method passed exactly once.
Both behavioral receipts are reconciled. A mutation compiler error is not expected red.

## Exact API67 metadata boundary

Existing package.xml supplies the member scope; source.zip (26files) frozen at
f64706d, SHA2561f88f989a21c1289197e86779a9f67640ee268b23033361c605a5e1d1d519319.
Controller privately rebuilds target PermissionSet files as described below;
repository PermissionSet files are not an authoritative target baseline.

| Type | Exact members and purpose |
|---|---|
| ApexClass | CardstackConnectionTypes, CardstackConnectionAccess, CardstackConnectionContext, CardstackConnectionSetup, CardstackConnectionSetupRepository, CardstackConnectionContextTest, CardstackConnectionSetupTest, CardstackConnectionTestFactory; eight class sources and eight API67 metadata files |
| CustomObject | Cardstack_Connection_Setup__c, Private sharing, AutoNumber name; Client__c Text16 unique, Revision__c Number18,0, Configuration__c LongText32768, Configuration_Digest__c Text64 |
| CustomPermission | Cardstack_Manage_Connections and Cardstack_Use_Connections, unchanged already-approved definitions |
| PermissionSet | Cardstack_Admin and Cardstack_User: ADD enabled classAccesses for CardstackConnectionSetup only to each complete fresh target baseline |

Persisted new authority is facade Apex class access for existing Admin/User set
holders plus private setup code/schema. Admin keeps approved Manage+Use; User keeps
approved Use only. Existing assignments/groups unchanged by deployment. There is
no repository class-access grant or direct private-object/field CRUD grant. The
facade public Apex methods are internal calls, with no AuraEnabled, RestResource,
InvocableMethod or other new remote/public entry point. Every storage entry retains
fresh custom-permission gates; adding class access does not replace authorization.
No Site, guest grants, REST ingress, Aura UI, ECA, CRM data, runtime OAuth config,
legacy beta code or package downgrade is in scope. No additional permission
assignments, broad permission updates or full-plan activation are authorized.

## Controller preparation before approval

1. Retrieve complete fresh target Admin/User metadata privately, preserving the
   already-approved custom-permission grants and every existing semantic property.
   Add ONLY enabled CardstackConnectionSetup classAccess to both. Reject all other
   deltas; preserve class/object/field/tab/app/page/user/settings properties and
   XML schema order. Independently compare baseline/assembled semantics and count
   assignments/groups; keep identities and full baseline artifacts private.
2. Assemble exact scope above using frozen archive class/object/permission bytes.
   Inventory and hash actual final MDAPI payload, verify all eight converted Apex
   bytes against reviewed source and the full object/four fields, and record safe
   preservation/delta receipt. The current sourceZIP hash is not a hash of this
   later target-baseline-derived MDAPI payload.
3. Verify reviewed mutation rejects saveRejectsStaleRevision with STALE_SETUP
   regression, then restored clean source passes all28. Mutation remains a
   checkOnly isolated copy; never deploy it persistently. Reconcile receipts,
   baseline freshness, dependencies and rollback package before concrete approval.
4. Request action-time approval for this full private Task2 scope and exact payload
   hash, new inherited facade access/private persistence, RunSpecifiedTests and
   JWT procedure. Bootstrap approval does not cover this additional authority.

## Approved execution and verification

Controller only, after concrete approval: standard API67 SOAP Metadata deploy,
RunSpecifiedTests with CardstackConnectionSetupTest and CardstackConnectionContextTest
(all28 reviewed methods required; never RunLocalTests/NoTestRun/broad defaults).
Disable Card Stack SFAPP deployment JWT, acquire fresh verified opaque CLI login,
restore/save JWT ON in finally and verify saved disabled checkbox checked. No
credential logging, raw CLI failures, debug logs or private metadata dumps.

Safe deployment receipt must distinguish persisted success, compiler errors,
profile prerequisites and actual behavioral failures. Controller verifies exact
persisted class/schema hashes, target-set semantic preservation plus facade-only
delta, approved CP grants, unchanged assignment/group counts and no private CRUD
or repository access grants. Existing connection/Site/ECA configuration remains
preserved except temporary deployment-app JWT procedure; this is not fresh
Claude/ChatGPT/HXL connectivity evidence. Task1 full readiness, Task3 source gate,
production ingress, activation and ordinary-user OAuth stay independent.

## Rollback boundary and limits

Capture full fresh pre-deploy target baselines and precise owned-component list
privately. Restore both baseline PermissionSets (which include approved bootstrap
custom-permission grants) only if no intervening administrator drift; verify full
semantic equality. Newly deployed Task2 classes/private object may be removed only
with explicit rollback approval after dependency checks and confirmation no future
references/data require preservation. Private object deletion may destroy setup
data; preserve needed data first or stop. Do not remove pre-existing beta components,
downgrade the beta package, delete already-approved custom permissions, or use a
broad destructive manifest. Bootstrap rollback is a separate reviewed action.
Metadata rollback cannot undo actions taken while inherited authority was present.

## Exact target-baseline-derived payload prepared

foundation-baseline-receipt.json records zero persisted owned connection classes,
private object absent, approved CP grants retained and one assignment/group0 per
set. Private baseline SHA256
3d0e454ecc644d6ff72236847520c4e7eeb1e896f76282e44baabc68046158a2.
foundation-preparation-receipt.json records exact private full MDAPI ZIP SHA256
759facd963b8a3e82494853831d5adc5eccb7048497af0b4cd80ca8bdb36564b,22 converted
files, only Setup facade class access added to both complete target sets, no
private CRUD or remote endpoint addition, bootstrap CP unchanged, persisted=false.
Controller artifact review confirms eight class/meta bytes and every non-PS file
match reviewed green source; full target sets preserve all other semantic properties.
Worker reviewed sanitized receipts only, not private target baseline/ZIP.

The exact final ZIP above separately passed API67 checkOnly2026-10-09
12:14:55.682Z:17components,28completed, componentErrors0/testErrors0. Controller
independently verified each reviewed method passed exactly once. See
exact-foundation-check-receipt.json. This validates the target-baseline-derived
PermissionSet serialization as well as frozen source; no foundation persistence
occurred. Prior preparation receipt persisted=false remains accurate.

## Concrete action-time approval scope

Approval may now be requested for **only** private full Task2 ZIP
759facd963b8a3e82494853831d5adc5eccb7048497af0b4cd80ca8bdb36564b:
eight Apex classes/meta, private setup object/four exact fields and both complete
target PermissionSets with Setup facade class access added only. The two included
custom permissions are unchanged approved bootstrap definitions/grants. Required
execution: API67 SOAP Metadata deploy, RunSpecifiedTests fixed two classes/all28,
fresh verified opaque deployment login and temporary deployment-app JWT OFF with
saved verified ON restoration in finally. Preserve baseline semantics and verify
unchanged assignment/group counts, no repository/directCRUD/remote-entry grants.
Bounded rollback restores post-bootstrap baselines and removes only new owned
Task2 components after approval/dependency/data/drift checks; keeps approved CP.

Human approval for the exact foundation ZIP and bounded procedure is recorded;
actual persistence subsequently succeeded and was verified (final status below). No Site/guest/ECA/CRM mutation,
production ingress, OAuth QA, Task3 implementation or full-plan release approval
is implied by this reviewed scope or its passing check-only receipt.

## Approved deployment awaiting fresh sign-in

The human approved exact ZIP759facd963b8a3e82494853831d5adc5eccb7048497af0b4cd80ca8bdb36564b
and its reviewed private-foundation scope. Read-only preflight12:26:35.238Z
confirmed target baseline, assignment identities and groups unchanged; owned
foundation components absent. See foundation-preflight-receipt.json.

Controller fresh managed web login opened a different Chrome profile and awaited
user Salesforce sign-in; the CLI login timed out. Controller immediately restored
and saved deployment JWT ON, verifying saved checked-disabled checkbox and Edit
present, with private screenshot proof. foundation-signin-handoff-receipt.json
12:33:47.698103Z confirms foundationSubmitted=false and freshManagedLoginComplete=false.
No foundation attempt/job or persistent foundation metadata was created.

The remaining handoff is user sign-in, not a plan/security rejection. Approval
persists for the exact reviewed deployment retry after fresh successful managed
opaque login and required current preflight/cleanup checks. No repeated approval
is needed unless payload/scope/state changes. Task2 remains incomplete until
actual submission, persisted success and post-verification receipts establish it.

## Final approved foundation installed and verified

foundation-deployment-receipt.json confirms actual checkOnly=false Succeeded
2026-10-09T14:41:46.634Z: exact approved ZIP759facd963b8a3e82494853831d5adc5eccb7048497af0b4cd80ca8bdb36564b,
17components, RunSpecifiedTests,28/28 exact reviewed methods once, zero component
or test errors. The prior sign-in handoff was resolved with fresh managed login.
foundation-jwt-final-receipt.json records saved JWT ON14:38:42.145970Z, verified
read-only checked-disabled checkbox and Edit present, with private screenshot
proof provided by controller.

foundation-verification-receipt.json14:42:57.289Z confirms persisted eight Active
API67 classes, private schema/four fields, exact facade-only PermissionSet delta,
no repository access/private CRUD, preserved bootstrap grants, unchanged assignment
identities/groups, setupRows0 and exact28 methods passed. Salesforce returned each
of the eight class bodies with one terminal LF omitted. Controller's initial
strict hash comparison detected this; verification permits only exact bytes or
exact omission of one terminal LF, not arbitrary whitespace normalization.
Scoped review of this bounded verification adjustment was clean; no production
source change or redeployment occurred.

Task2 reviewed private foundation requirements are achieved; rollback was unused.
This does not install the full connection feature or establish release readiness.
Unreadable admin metadata remains Unknown/manual verification by approved design.
Task1 ordinary-user OAuth and required RFC resource/application binding evidence,
Task3 prerequisites/ingress, Site activation and full-feature/release gates remain
outstanding independently. No new Claude/ChatGPT/HXL client connectivity QA is
implied. Historical pending statements above describe their earlier checkpoints.
