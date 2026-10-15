# Four-component permission bootstrap review boundary

This is an offline preparation document, not approval to deploy. Task2 remains
incomplete. Controller green-r4 (2026-10-09 11:37:21Z) compiled with zero errors,
completed26 tests and failed the same two named-set native permission assertions.
The independent ownedPermissionSetEvaluatesNativeUserGate passed. Thus native
FeatureManagement with test-created grant DML succeeds while staged existing-set
updates remain ineffective in those tests. This isolates the observed paths; it
does not establish a documented cache mechanism or predict deployment success.

## Exact persisted authority proposed

API67 manifest permission-bootstrap-package.xml contains exactly four components:

| Type | Component | Proposed change |
|---|---|---|
| CustomPermission | Cardstack_Manage_Connections | Create reviewed unlicensed definition |
| CustomPermission | Cardstack_Use_Connections | Create reviewed unlicensed definition |
| PermissionSet | Cardstack_Admin | Add enabled Manage and Use custom permissions only |
| PermissionSet | Cardstack_User | Add enabled Use custom permission only |

Existing holders inherit this new authority when deployed. Controller baseline
summary shows one assignment per set, no group membership, no current custom
permission grants and zero persisted new definitions. Do not treat a count as an
identity inventory or future-state guarantee; controller must recheck drift and
assignment/group scope at action time. Full baselines remain private and have not
been read, copied, abbreviated into deployable metadata, or committed here.

The accompanying permission-bootstrap-custom-permissions.zip contains only two
CustomPermission source files, byte-identical to reviewed Task2 source. It has no
PermissionSet files or manifest and is not a complete deployment bundle. Inventory
records its SHA256 and the separate four-component manifest hash.

## Controller preparation and review before action-time approval

1. Privately combine both complete captured target PermissionSet baselines with
   ONLY the customPermissions additions above. Preserve every other semantic
   property, including complete original class, object, field, page, user,
   application, tab and any other grants/settings present. Do not use repository
   permission-set files: those include facade class access outside this bootstrap.
2. Group customPermissions in proper Metadata API XML order. Compare parsed
   before/after semantic metadata, accepting only Admin Manage+Use and User Use
   additions. Preserve namespace, descriptions, labels and all baseline settings.
   Reject missing, changed or deleted baseline properties and unrelated components.
3. Reconcile baseline freshness and dependencies privately; hash the complete
   prepared deployment and rollback artifacts and provide the exact delta/counts
   for review without exposing private identity or grants data. This source-only
   archive cannot supply or reconstruct either full target baseline.
4. Ask for concrete action-time approval for this four-component persisted grant
   and the required authentication procedure. Previous check-only authorization
   does not authorize persistent deployment, inherited authority, JWT changes,
   permission assignments or component deletion. Review can proceed offline.

## Approved execution boundary and subsequent verification

Only after that approval, controller uses the project API67 SOAP Metadata deploy
procedure: disable JWT on Card Stack SFAPP, obtain fresh opaque-token CLI login,
restore JWT in cleanup/finally and verify JWT ends ON even after failure. Do not
reuse presumed token state, expose credentials or delegate this procedure to the
worker. The bootstrap deploy must contain only the four manifest components.
It creates no classes, private object, Site/guest/ECA/CRM changes or user assignments.

Controller verifies persisted exact definitions and full named-set grant graph,
unchanged baseline semantic properties and expected assignment/group scope. Then
run the byte-verified full Task2 clean-source check-only bundle with its fixed
SetupTest/ContextTest scope28. Retain both named-set native assertions, owned-set
diagnostic and private CRUD denial; do not skip or relabel failures. A complete
passing receipt requires every reviewed method. Subsequent review of the exact
stale-guard mutation remains separate; compiler/profile failures are not behavioral
red. Task2 full deployment, ingress and ordinary-user OAuth remain independent
approvals/proofs; passing unit runAs does not establish an OAuth user matrix.

## Rollback and limits

Preserve both full pre-action PermissionSet baselines privately before mutation.
On approved rollback, restore both baselines exactly and verify semantic equality
and assignment/group scope; then check for all references/dependencies to the two
new owned custom permissions. Remove only these two newly created definitions
when dependency checks establish safe deletion and deletion is concretely approved.
If new references or baseline drift exist, stop rather than deleting authority or
overwriting later administrator changes. Restoration cannot reverse actions taken
while inherited authority was enabled; there is a security-sensitive exposure
window. No automatic rollback/deletion or broad destructive manifest is provided.

## Concrete controller-prepared artifact

Sanitized permission-baseline-receipt.json records the private baseline SHA256
`8a940a2357199abb447082d856e531eb6cea9ac64c609eef1b2efacd3484b991`.
permission-bootstrap-preparation-receipt.json records the privately assembled
four-component MDAPI ZIP SHA256
`30e491ed6e11e9cef33743f20feb1d60bf2db031ee26f776a70803c296b336d3`,
no new class access, other baseline semantic properties unchanged, persisted=false.
Its MDAPI manifest serialization has its own receipt hash; the separate source
manifest supplied here defines the same exact four-component API67 boundary.
Worker reviewed only these sanitized receipts, not private baseline or ZIP.

The future approval request is **bootstrap four components only**, not full Task2
deployment. Controller may separately validate this exact ZIP checkOnly=true,
NoTestRun before requesting persistent authority and JWT procedure approval.
A check-only receipt does not establish inherited authorization behavior or
persistence; no bootstrap success is claimed without the actual approved receipt.
Controller privately prepared rollback of both full baseline PermissionSets plus
post-destructive removal of the two owned definitions, subject to dependency,
drift and approval checks above. No rollback deployment is authorized now.

## Approved bootstrap executed; Task2 source validation pending

Controller received concrete approval and executed the exact reviewed four-component
bootstrap. permission-bootstrap-check-receipt.json records prior check-only success
11:41:18.188Z (NoTestRun, four components, zero errors). Actual deployment receipt
records Succeeded11:55:00.583Z, four components, zero errors, NoTestRun. Verification
11:55:15.916Z confirms two definitions, exact permission-set semantic delta and
grant graph, unchanged assignment/group counts and no new facade class access.

jwt-restoration-receipt.json records saved JWT ON verification11:58:23.285917Z.
Controller's first header Save did not retain restoration; checkbox interaction
and primary footer Save corrected it, followed by saved disabled-checkbox checked
verification. Fresh default managed opaque CLI login was controller-verified
11:54:44Z before deployment. No credentials or private screenshot copied here.

Only bootstrap rights persisted. Task2 classes/private object were not deployed;
connection/Site/ECA configuration remained untouched apart from approved deployment
app temporary JWT OFF followed by restored ON. No fresh Claude/ChatGPT or HXL
connectivity test was performed; preserved configuration is not a new client QA pass.
Post-bootstrap clean-source check-only green-r5 scope28 is running. Its compile/test
result and fullTask2 completion remain pending; prior named-set failures are retained
in history and hard assertions remain in source. Frozen Task2 source commit f64706d,
ZIP SHA2561f88f989a21c1289197e86779a9f67640ee268b23033361c605a5e1d1d519319.
