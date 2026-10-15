# Task 2 offline validation bundle

Prepared October 9, 2026. Source implementation is reviewable; no org action has
been performed by this worker. Task 1 production readiness and Task 3 remain gated.

## Exact scope

API 67.0 manifest: `package.xml`; deterministic source-format archive: `source.zip`;
SHA-256 inventory: `source-inventory.json`; mutation hashes: `mutation-inventory.json`. Rebuild offline with
`python3 salesforce-native/scripts/build-connection-bundle.py`.
This archive requires normal offline Salesforce source conversion before a SOAP
Metadata API deployment; it is not itself a SOAP metadata ZIP.

New Apex classes (each with API67 metadata):
CardstackConnectionTypes, CardstackConnectionAccess, CardstackConnectionContext,
CardstackConnectionSetup, CardstackConnectionSetupRepository,
CardstackConnectionSetupTest, CardstackConnectionContextTest,
CardstackConnectionTestFactory.

New private object: Cardstack_Connection_Setup__c, with unique case-insensitive
Client__c (Text16), Revision__c (Number18,0), Configuration__c (LongText32768),
Configuration_Digest__c (Text64). No direct CRUD or field permissions added to
any permission set. The system-mode repository checks explicit permission at
**every** public storage entry. CRM execution is outside this boundary.

New custom permissions: Cardstack_Manage_Connections, Cardstack_Use_Connections.
Existing Cardstack_Admin receives both custom permissions and class access to
CardstackConnectionSetup. Existing Cardstack_User receives only the User custom
permission and class access to CardstackConnectionSetup. No repository class
access, guest grants, Site, ECA, OAuth, CRM, HXL or existing beta runtime changes.
Existing holders of these permission sets would inherit these two new authorities
if this metadata is deployed; deployment permission must cover that concrete scope.
The facade has no AuraEnabled/REST/invocable entry; snapshot is an internal named
service contract, not a user-readable setup tool.

## Proposed controller validation (not executed or authorized here)

1. Review exact archive hashes and permission-set diff. Obtain concrete approval
   for API67 check-only validation and/or eventual deployment of this exact bundle,
   including inherited permission-set grants. Prefer check-only validation first.
2. Check-only validation requires an independently verified current managed
   opaque CLI session; do not assume that an existing session is valid or that
   JWT ON invalidates an already-issued opaque session. Authentication/status
   verification belongs to the controller. If fresh login/settings changes are
   needed, they require their concrete approved procedure. For a real deployment,
   use the project JWT OFF/fresh opaque/deploy/finally restore/save/verify JWT ON
   procedure. Runner itself does not change authentication/settings or deploy.
3. RunSpecifiedTests: CardstackConnectionSetupTest and
   CardstackConnectionContextTest only. Class dependency includes test factory and
   repository. Class/schema compilation errors are compile failures; a missing
   Minimum Access - Salesforce profile with Salesforce license is the explicit
   PROFILE_PREREQUISITE test setup failure. Permission-set assignment/license
   failures are prerequisites, not behavioral red proof.
4. Actual behavioral red is still pending. For check-only red validation the
   controller may review/apply `stale-revision-behavioral-red.patch` to a separate
   extracted source copy, never authoritative source or persisted deployment.
   It removes only expectedRevision rejection. Expected failure:
   CardstackConnectionSetupTest.saveRejectsStaleRevision (stale save accepted).
   Restore clean source for green check-only validation of the exact archive.
   The patch is not permission to execute validation and is never release code.
5. Only after approved deployment, focused runner invocation from repository root:
   `node salesforce-native/scripts/run-apex-checks.cjs --controller-approved --target-org cardstack-spike2`.
   Use the controller-reviewed target alias. Runner invokes managed `sf apex run
   test`, captures JSON in a mode700 temporary directory/mode600 file, emits only
   counts/allowlisted failure names, then deletes capture in finally. No raw CLI
   stderr, messages, stacks, auth display or debug logs are printed. Malformed/
   incomplete counts produce APEX_RUNNER_FAILED, never a fabricated pass.
   Success additionally requires process exit0, CLI JSON status0 and exactly one
   Pass/Fail result for every one of the 28 reviewed methods in the fixed two
   classes, with per-method outcomes matching summary counts. Missing, partial,
   duplicate, unknown or invalid results are rejected. Nonzero CLI completion
   returns a bounded runner error and can never produce a passing receipt.

Apex runAs permission tests use actual Minimum Access - Salesforce users and real
Cardstack_Admin/User assignments, all test-transaction-local. They do not establish
live ordinary-user OAuth, external-client policy or CRM permission behavior.
Bulk251 tests are not applicable: this service has exactly two client rows and a
bounded ten-callback configuration contract, no trigger or bulk CRM work.

## Rollback limits

Check-only validation commits no metadata/data. A real deployment adds private
schema/classes and modifies existing permission sets; rollback requires an
independent reviewed deployment restoring the **prior** two permission sets and
removing only owned new components after confirming dependencies and absence of
retained setup data. Do not delete setup records/schema after users start saving
configuration. No blanket destructive rollback or beta-package downgrade is
provided. Controller must preserve JWT ON and existing Site/app/guest settings.

## Context limitation and evidence

Outside a matching current Site context, resolve retains selected full Site ID,
normalized prefix and setup intent while reporting Unknown/UNKNOWN_METADATA and
no canonical endpoint. It does not query privileged metadata or self-REST.
Public descriptor never reads private state or returns Site/org/actor identity.
Supported API67 Site methods derive context URLs, including the prefix once;
issuer comes from URL.getOrgDomainUrl. Official API67 Site Class rendered by this
worker confirms `public static String getSiteId()` and null outside Site requests:
https://developer.salesforce.com/docs/atlas.en-us.262.0.apexref.meta/apexref/apex_classes_sites.htm
Task1 public-context evidence supports getBaseRequestUrl/getPathPrefix/org URL in
its measured org; portable installed-admin Site/OAuth readers remain Unknown.
No dev-org URL constants or headers/caller issuer determine endpoints.

## Previous check-only compile result

Controller check-only red run failed compilation/metadata parsing (20 components,
8 component errors, 0 tests completed): see compile-failure-receipt.json. It did
not persist metadata or execute behavioral tests. Corrected String DML status
comparison, SObjectType describe receiver and permission-set schema grouping are
now in this rebuilt bundle; actual compiler retry remains pending controller
review/authorization. Offline tests and PMD are not Apex compilation evidence.


## Test-only permission prerequisite trace

The subsequent controller check-only run compiled clean source (zero component
errors), completed 24 tests and reported two native FeatureManagement grant
failures. It did not execute the intended stale-revision mutation because source
conversion selected canonical source instead of the extracted copy. See
clean-permission-failure-receipt.json; this is not mutation red evidence.

This bundle adds test-only trace before the two grant tests: exact CustomPermission
definitions, expected SetupEntityAccess grants on the selected existing
Cardstack_Admin/User and actor assignment count. Missing stages emit respectively
CUSTOM_PERMISSION_METADATA_PREREQUISITE, PERMISSION_SET_METADATA_PREREQUISITE,
PERMISSION_SET_GRANT_PREREQUISITE or PERMISSION_ASSIGNMENT_PREREQUISITE, no IDs.
No production Access gate/seam or permission metadata was changed by the trace.
Independent unassigned-user private CRUD denial retains its own test.

## Owned-set diagnostic after terminal trace

permission-trace-receipt.json records clean-source green-r3: zero component
errors, 25 completed tests, two unchanged native FM assertion failures. No
prerequisite category fired: exact definitions, existing named-set grant graph,
and actor assignments are query-visible. Missing metadata bootstrap is therefore
not supported. Query visibility does not establish native evaluator staging or
cache behavior; no undocumented refresh is attempted.

This bundle retains both named-set tests and trace unchanged and adds one
independent ownedPermissionSetEvaluatesNativeUserGate test (28 total methods).
It inserts one test-local PermissionSet, one Use-only SetupEntityAccess and actor
assignment before runAs; safely normalizes both actor IDs to checksum18 for an
internal boolean assertion, checks native Use=true/Manage=false, then exercises
snapshot access and admin denial. No production source or permission metadata
change. All diagnostic DML rolls back with the test/check-only validation.

API67 rendered official references establish create support for PermissionSet
and SetupEntityAccess, Create properties for Name/Label and ParentId/SetupEntityId,
and CustomPermission entity support since API31:
https://developer.salesforce.com/docs/atlas.en-us.262.0.object_reference.meta/object_reference/sforce_api_objects_permissionset.htm
https://developer.salesforce.com/docs/atlas.en-us.262.0.object_reference.meta/object_reference/sforce_api_objects_setupentityaccess.htm
The references do not guarantee native FM evaluation of staged definitions.

Next action: controller review, byte-verified clean-source check-only of all28
methods. Owned-set success isolates test-DML grants from existing-set staging;
it does not prove deployed named-set/OAuth authority or make the two retained
failures acceptable. Owned-set failure leaves evaluator/fixture staging unresolved.
No persisted bootstrap proposal, production gate weakening, skipped assertions,
or real deployment is authorized by this diagnostic bundle.

## Subsequent green-r4 and separately reviewed persisted boundary

owned-set-diagnostic-receipt.json records compiler errors0, completed26,
named-set failures2. The owned-set native diagnostic passed; both named tests
remain required. No full Task2 success is claimed. See permission-bootstrap-review.md
for the separate proposed four-component authority boundary, API67 manifest,
custom-permission-only archive, baseline preservation, action-time approval and
rollback limits. This proposal does not authorize persistent deployment or JWT
changes; controller privately prepares full target PermissionSet baselines.

## Final private Task2 deployment status

Actual approved foundation ZIP759facd963b8a3e82494853831d5adc5eccb7048497af0b4cd80ca8bdb36564b
Succeeded14:41:46.634Z,17components,RunSpecifiedTests28/28,zero errors; persisted
verification14:42:57.289Z confirms8API67classes/private4field schema/facade-only
authority/unchanged identities+groups/setupRows0. JWT saved ON verified14:38:42Z.
See foundation-deployment-receipt.json, foundation-verification-receipt.json,
foundation-jwt-final-receipt.json and private-foundation-deployment-review.md.
Task2 private foundation achieved; rollback unused. Task1 binding/ordinary OAuth,
Task3 and full-feature release remain gated. Sourcef64706d/archive1f88 frozen.
