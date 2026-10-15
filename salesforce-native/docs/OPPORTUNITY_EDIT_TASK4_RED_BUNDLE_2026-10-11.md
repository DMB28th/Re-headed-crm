# Opportunity product MCP initial RED bundle — October 11, 2026

Task4 source preparation adds the exact product dispatcher routes and a fail-closed
Apex adapter scaffold. The adapter performs no CRM service dispatch, registers no
product descriptors yet, and returns safe unavailable results; missing UI returns a
sanitized protocol error, never placeholder HTML. Existing diagnostic routes/auth and
Account tool contracts retain their behavior. API67 and existing SDK1.7.4 stay pinned.

Native candidate: 25 classes, 51 metadata ZIP entries, 12 specified test classes,
222 test methods (154 unchanged prior Task3 methods, 23 dispatcher methods including
4 new, and 45 new adapter methods). Tests define strict per-operation arguments,
16 KiB decoded UTF-8, checksum18 normalization, app-only helpers, exact visibility/
resource metadata, private keys exclusively in result metadata, controlled Start/
Review/Confirm/replay/recovery, separate authoritative Refresh, and read-only card
policy filtering. At the initial source freeze, native compilation/RED/coverage had
not run. Its later compile failure and corrected candidate are recorded below.

Observed local checks: seven Opportunity source-contract tests, two passing and five
intended failures on missing product behavior; all 22 diagnostic protocol tests pass.
These source checks do not emulate Apex or establish native/live-client proof.
Analyzer remains unavailable from the established missing-Java result (zero source
files); no analyzer retry or dependency installation occurred.

Frozen candidate SHA256:
`043f3bbddc1f6c511414f0555d8b632a84fe2cd0184a97acf77983369ce49197`.
The ignored plan workspace contains task-4-report.md and task-4-validation inventory,
local output, exact API67 manifest/test union and proposed controller checkOnly command.
All 260 preservation baseline files and prior frozen SDD ZIPs were verified unchanged.

The controller pinned the public read-only `opportunity-card/v1` contract to recordId,
recordName, fixed ordered published/native-readable Stage/CloseDate/Amount field rows
with exact string values, and safe name/label/type fixed-preset actions. Open/Refresh
need current enabled client setup but not write-enabled policy or Stage choices.
Editing uses `opportunity-edit/v1`; Start/transition retain existing governed services.

Five unchanged existing dispatcher/foundation dependencies are source-hash pinned;
installed-source parity is unverified by the source worker. Target dependency drift
must be distinguished from intended behavioral RED before any outside-class change.
Controller handles the source reviews and authorized nonpersistent native unit cycle.
No persistent metadata, business CRM or client QA occurred. Task4 implementation awaits
native RED; Task5 still awaits real provider/package feasibility proof.

## Corrected candidate after dependency failure

The initial native candidate failed compilation with seven errors and zero tests:
missing current diagnostic class/type members in the target. No behavioral RED was
established. Production adapter/dispatcher source remains unchanged and fail-closed.

Focused source-review fixes add exact advertised descriptor/property/type/required/
oneOf tests, rejected-input private-channel checks, mixed enabled Flow/invalid/disabled
action fixtures, required-field policy denial, and Refresh after published policy changes.
All prior test methods/assertions remain; no adapter algorithms were implemented.

The approved bundle-only closure includes unchanged ConnectionTypes, Diagnostics,
DiagnosticsTest, Context, ContextTest and TestFactory. No TypesTest exists; ContextTest
provides the existing Types ID/client contract cases. This adds no foundation source
changes or object/permission/profile metadata. Existing target private schema and named
user profile/permission prerequisites remain unverified; their failure is separate from
intended assertion RED. Prior override-based unit GREEN does not prove those prerequisites.

Corrected candidate: 31 classes, 63 entries, 14 test classes, 272 methods. Predicted
223 passes/49 assertion failures are contingent on compile/prerequisites and remain
unobserved. Corrected candidate compilation, native RED and coverage have not run.
Frozen corrected ZIP SHA256:
`c2c7d0f62aa7537d3f83296b97951c06156079cfe7775685c04f21d5c3100fa5`.
The task workspace holds the corrected inventory, exact expected method set and proposed
controller command. Initial archive/evidence and all260 baseline files are preserved.

## Schema-complete checkOnly candidate

The corrected candidate failed native compilation with61 errors and zero tests;
controller investigation traced the cause to missing target private diagnostic object
`Cardstack_Connection_Check__c`, followed by dependent type cascades. This is schema
drift, not behavioral RED. The reviewed tests and adapter scaffold remain unchanged.

The controller approved bundle-only inclusion of the unmodified authoritative private
object and exactly its seven existing fields. An offline MetadataAPI XML merge preserves
all source object/field properties, Private sharing, AutoNumber name and standard User
lookup. Inventory pins all eight source XML hashes and records structural equivalence.
No permissions, ordinary CRUD/FLS, other objects or source metadata were changed.

Schema-complete candidate:31 Apex classes,14 test classes,272 unchanged methods,
one private object/seven fields,64 ZIP members. SHA256:
`a7e1b7ba213e5bfc215321692226a9b9345c4f643af67b8fbc3f420cdf6a2dd0`.
Exact inventory, merge-equivalence proof and proposed controller --dry-run/checkOnly
command are retained in the task workspace. Earlier archives/captures are preserved.
This candidate has not compiled/run;49 failures/223 passes remain a contingent prediction.
No persistent schema installation occurred. Adapter algorithms still await native RED.

## Private fixture query correction

Schema-complete native execution reached272 tests with zero compile errors:222 passed,
49 failures matched the intended adapter assertion RED, and one private fixture query
failed before its assertions. The safe classification is NO_SUCH_COLUMN for the bare
setup-configuration fixture read. Passing diagnostics read that same private field
through the established repository's explicit system-mode path.

The controller approved adding `WITH SYSTEM_MODE` to that single test-only fixture
SELECT. All272 methods/assertions, runtime source, object fields and permission scope
remain unchanged. Raw failure messages and values remain private; only static source
classification and boolean corroboration are in the task's safe diagnostic proof.

Frozen same-scope ZIP SHA256:
`0e756d4cbd0dce3e2d7dda31c48b88278d3c2967656f4caa838ce69734d863ad`.
31classes14tests272methods/private object-seven fields/64members. Focused reviews and
native rerun must confirm the fixture hypothesis; expected223passes49assertion failures
remain unobserved for this candidate. Adapter algorithms remain on hold.

## Implemented MCP adapter candidate

The fixture-query native rerun completed zero compile errors and272 tests:223 passed,
49 intended adapter assertion failures, no other failures. Both focused reviews approved;
this observed native RED authorized the adapter implementation.

Source now implements strict closed tool schemas/arguments, setup and named-user gates,
checksum18 record normalization, current published read-only cards/actions, Start and
fixed transitions, authoritative Refresh, checked public View/receipt serialization,
and private envelope keys only in result metadata. Unexpected post-Confirm errors report
an unavailable outcome with Resume/Refresh guidance, never an unsaved/save-failed claim.
The actual UI resource is still absent: only exact registered versioned HTML lookup is
implemented; missing/empty/invalid resource remains truthfully unavailable. Task5 stays gated.

An approved server-only transitionFromMcp entry independently limits compact typed JSON
(suppressing absent null properties) while the adapter bounds strict decoded arguments.
Both limits are16KiB. It shares the unchanged transition core and accepts no caller budget
flag. Existing typed transition and its full-JSON budget/tests retain their contract.

Published field projection limits exported rows. The existing selector additionally
requires native access to every fixed base field; native FLS loss can deny the whole
card. Partial native-FLS cards are not claimed, and no permissions were expanded.

Local source/protocol checks pass7/7 Opportunity and22/22 diagnostic checks. Native
compilation/GREEN/coverage and independent algorithm reviews remain pending. Candidate
same31classes14tests272unchangedtests/private object-seven fields/64members SHA256:
`270a555e26315d402eaa8c12b87e0077215434e6766c22e15fcc5f5c0a2744f3`.
All native test bytes, foundation/schema and prior frozen evidence are preserved.
No persistent deployment, package, business CRM, provider or live-client QA occurred.

## Adapter lexical compiler correction

The implemented22f3cc5 candidate failed native compilation with three primary lexical
errors and dependent cascades; zero tests ran. Renamed schema locals so START remains
the tool-name String, renamed the card field-row list so FIELDS remains the fixed String
list, and replaced the reserved local identifier number with parsedRevision.

The approved fourth correction renames resource input requestedUri so static URI is
compared to the caller input and output remains canonical. The existing unknown-resource
assertion already guards this contract. All272 tests/assertions, Service/runtime contracts,
foundation/schema/permissions and bundle scope remain unchanged.

Scoped local checks pass7/7 and22/22. Native compilation/GREEN/coverage for this fix
remain pending. Frozen same-scope fix ZIP SHA256:
`14aee5a378e00a56af77d42d5d2fdcd6b5c233e9accc4d039a531fce59d23d5b`.
Prior failed archive/captures and compile-failed offline package source snapshot are
preserved; no usable-package claim, persistent deployment or live QA follows from them.

## Exact-byte fixture prerequisite

The lexical-fix native candidate compiled without errors and passed271 of272 tests.
The exact16KiB test received CONNECTION_UNAVAILABLE because it had no named-client
setup fixture, preventing its expected INVALID_INTERACTION lookup. Its raw byte guard
accepted the input; the intended later path still needed its setup prerequisite.

The test now seeds only the existing private setup before Test.startTest, through a
same-class helper also reused by existing fixtures. No business record/layout is added.
All272 methods/assertions, exact16384 target, runtime gates and budget semantics remain
unchanged. Same-scope frozen candidate SHA256:
`1f6d03b213206c408a577deeb1f8d725aa5b3f9821e0c82c183f2e10cc0366d2`.
Focused reviews/native rerun remain pending; no full GREEN or package proof is claimed.

## Accepted Task4 native unit validation

Frozen source `0f1662f545a5d99b2fbffe32ffe4ccd609657de2`, archive SHA-256
`1f6d03b213206c408a577deeb1f8d725aa5b3f9821e0c82c183f2e10cc0366d2`,
completed API67 checkOnly **Succeeded**: zero compilation errors, **272/272
tests passed**, zero failures. All ten covered Opportunity production classes
exceeded75%; MCP adapter92.975%, WriteService93.458%, required Audit100%.
Both independent algorithm/focused correction reviews approved. Local protocol
checks passed7/7 Opportunity and22/22 diagnostics.
[Safe unit acceptance receipt](evidence/opportunity-edit-2026-10-11/task-4-native-unit-green.json).
No metadata or business records persisted, and no auth setting changed. The
private diagnostic schema existed only in the rolled-back validation overlay.
Earlier compiler/fixture failures remain preserved. This is backend/MCP unit
acceptance; actual UI/provider/package/ordinary-user/client proof remains pending.
