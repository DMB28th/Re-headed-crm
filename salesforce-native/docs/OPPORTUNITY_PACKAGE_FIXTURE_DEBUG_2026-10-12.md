# Clean package-validation fixture permissions

Prepared October 12, 2026. Test-only correction; native/package reruns pending.

The approved API67 coverage package creation from frozen source
`0f1662f545a5d99b2fbffe32ffe4ccd609657de2` failed test validation with 62 errors.
No installable version or package version was returned; no fresh QA org exists.
The safe failure receipt is
[evidence/opportunity-edit-2026-10-11/package-create-failure-0f1662f.json](evidence/opportunity-edit-2026-10-11/package-create-failure-0f1662f.json).
The earlier 272/272 existing-org checkOnly success does not prove clean-package FLS.

| New test class | Config read exceptions | Secondary adapter assertions |
| --- | ---: | ---: |
| Opportunity Edit Repository | 3 | 0 |
| Opportunity Edit Service | 15 | 0 |
| Opportunity MCP Adapter | 4 | 10 |
| Opportunity Write Service | 30 | 0 |

All 52 direct exceptions target existing Config Value field reads: 47 begin in
ConfigService.getConfig's WITH USER_MODE query and five in fixture config SELECTs.
The ten adapter assertions fail at card/start prerequisites; source tracing shows
its generic exception handler converts failed reads to safe unavailable results.
There are no observed unsupported native picklist-method errors.

The four classes previously seeded config as system and bypassed the named
application gate without assigning fixture FLS. Existing config/action tests
explicitly assign a package permission set in @TestSetup. Both existing packaged
User/Admin permission sets already grant Config Value read; no metadata defect is
supported. All 283 immutable package snapshot files match the inventory, and all
281 staged metadata files match authoritative source and frozen source commit.

The correction assigns only existing Cardstack_User to the normalized checksum18
current test actor through an idempotent helper in existing Opportunity Edit
TestData. Exactly four @TestSetup callers run it before business DML in the test
methods. These setup transactions contain only setup-object assignment. The
secondary actor receives no assignment. System mode is confined to test setup
lookup; production config reads and all existing false named-gate overrides remain
unchanged. No Admin grant, private-object CRUD or new metadata is introduced.

All prior test method bodies/assertions and the 272-method native scope are
byte-preserved. The candidate retains 31 classes, 14 test classes and the unchanged
private Check object/seven-field validation overlay, 64 ZIP members. Its SHA-256 is
`8a916aae5bf7399bd4860e324d2e5634cba73aad09cac276b41f513b699f182d`.
Only five test .cls members changed; production, class metadata, schema and manifest
bytes match the accepted native ZIP. Whitespace and local identity/preservation
checks pass; the 260 protected files and five preexisting dirty documents remain
untouched. The failed package snapshot and previous archives remain immutable.

The actual package failure is the fixture-prerequisite failing observation. The
missing clean-actor config FLS hypothesis requires a successful package rerun for
confirmation. Native compilation/272 assertions, coverage package rebuild and
fresh installation/full Apex suite are NotRun for this candidate. The controller
owns those executions and fresh scoped reviews. Analyzer remains unavailable
without Java; no dependency, org/client/JWT, deployment, push or merge action was
performed by the worker. Actual Stage provider/client proof remains a later gate.

## Consolidated package retry diagnosis

The assignment-only correction `c8d8e739ef39abfbbbe05813eca712a4bbabe3b4`
passed 272/272 native checkOnly but actual package coverage validation still failed:
50 Config Value QueryExceptions and ten adapter prerequisite assertions, 60 total.
No installable/package version exists. Forty-five first stacks are ConfigService;
five are direct fixture config SELECTs. No new failing method names appeared.
The first hypothesis was incomplete; assignment alone did not make the fresh
packaging actor's execution context use the grants.

Exactly two prior failures disappeared: EditServiceTest.wrongActorCannotResume and
WriteServiceTest.wrongActorCannotConfirm. Both already reenter the current actor
with System.runAs before reading fixture configuration, then separately enter the
other actor for denial. All 60 remaining affected methods lack that context.
Existing ConfigService 5/5, Policy 4/4, RecordAction 10/10 and RecordEdit 16/16 tests
follow the same current-actor runAs pattern after setup permission assignment;
none appears in either package failure report.

Both complete 283-file failed snapshots remain inventory-identical; the second
snapshot differs only in the five reviewed test .cls files. Field metadata and
existing User role config-read permissions are present. The generated packaging
actor's exact effective permission-cache state is absent from the reports. The
source evidence supports reentering the same actor to make assigned grants
effective; it does not establish platform cache internals or a production defect.

The consolidated correction wraps exactly 60 affected methods in the existing
same-current-actor System.runAs pattern: Repository 3, EditService 14, Adapter 14,
WriteService 29. Only four existing test files change. Original method bodies and
assertions are byte-preserved; the helper, metadata, production USER_MODE behavior,
roles, two other-actor denial methods and negative permission overrides are intact.
The wrapper begins before Test.startTest and preserves measured native budgets.
The scoped suite stays 272 methods; no duplicated tests or grants were added.

One scoped review and actual package coverage validation directly are pending.
No duplicate 272 native gate is prepared and no package green is claimed. The
controller owns that result and later fresh installation/full suite. This package
hypothesis does not gate source UI work. The first fixture commit's actual parent
is `7cbfe63`; `2dad7cb` was its initial source base. All old failure evidence is retained.
