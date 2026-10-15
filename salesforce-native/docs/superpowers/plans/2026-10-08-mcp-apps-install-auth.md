# Guided MCP Apps Installation and Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver guided, resumable per-org setup and independently evidenced
Claude/ChatGPT synthetic connections, without migrating CRM editing or retiring HXL.

**Architecture:** Salesforce Site ingress supplies public discovery and rejects
anonymous execution; named requests use a private Apex dispatcher and diagnostic
service. Studio guides per-org Salesforce Setup, stores private configuration and
shows version-bound diagnostic evidence. Separate Local OAuth apps remain owned
by Salesforce and their respective client.

**Tech Stack:** API67 Apex/Metadata, Salesforce private objects and custom
permissions, Studio LWC, self-contained StaticResource HTML, ext-apps1.7.4,
local Node build/test tooling, existing Salesforce CLI managed auth.

**Spec:** [approved install/auth design](../specs/2026-10-08-mcp-apps-install-auth-design.md).
User approved October 8, 2026. Plan awaiting review. Execution method already
selected in native AGENTS.md: subagent-driven development.

## Global Constraints

- API67; working org cardstack-spike2; no product/org mutations during planning.
- Salesforce-only runtime. No custom accounts, external gateway, Railway or Node runtime.
- Separate dedicated runtime OAuth apps per client per org; opaque JWT OFF.
- Card Stack SFAPP deployment JWT must end ON, verified even on deploy failure.
- Required PKCE/refresh rotation; public client ID, blank secret; api/refresh_token.
- Guest may access discovery/challenge only, never HTML/tools/private setup/CRM.
- Explicit named Cardstack permission; sharing/CRUD/FLS/user-mode CRM enforcement.
- Keep SDK1.7.4 and beta/HXL unchanged; no SDK upgrade or governed edit implementation.
- Attempts expire 10 minutes; challenge 256 bits stored hashed; history retained 30 days.
- Canonical route /services/apexrest/cardstack/v1/{claude|chatgpt}/{mcp|metadata}.
- Do not emit credentials, codes/state, private actor IDs, raw logs or diagnostic challenges.
- Studio guides manual Salesforce mutations; never silently activate Site or grant access.
- Pass/Fail/Unknown/Stale with evidence source/revision; no permanent connected badge.

## Review Focus

1. Two admins save stale forms: reject lost updates, preserve the other client's setup (Task2).
2. User rights removed after a successful check: deny new calls and never reuse cached actor authorization (Tasks3/4).
3. Unicode/newlines/empty values and extra JSON keys: preserve exact valid values, reject extra/invalid values (Tasks4/5).
4. Lost reply or duplicate submission: same accepted attempt returns one receipt; altered replay fails (Task4).
5. Old manual flags or hidden dismissed checklist: cannot manufacture readiness or suppress changed configuration (Task6).

## Execution and file map

Reuse the attached codex/mcp-apps-delivery-proof worktree after inspecting current
artifacts; preserve unrelated modifications. Read native AGENTS and spec before
execution. Apply Apex, Apex-test, LWC, MCP Apps, systematic-debugging, TDD and
code-analyzer skills to their relevant tasks. Controller keeps a task ledger;
fresh task implementer, spec review, code review, then a final branch review.
No new Codex chats are needed. Independent reviews do not authorize deployment.

New classes (each gets .cls-meta.xml API67 and focused *Test.cls/meta):
CardstackConnectionTypes (DTOs); CardstackConnectionAccess (permission checks);
CardstackConnectionContext (validated org/Site derivation); CardstackConnectionSetup
(private state); CardstackConnectionDiagnostics (attempt/echo); CardstackConnectionRetention
(bounded cleanup); CardstackMcpIngress (REST boundary); CardstackMcpDispatcher
(protocol); CardstackConnectionController (Studio API). Keep responsibilities separate.

New private metadata: objects/Cardstack_Connection_Setup__c and
objects/Cardstack_Connection_Check__c; customPermissions/Cardstack_Manage_Connections
and Cardstack_Use_Connections. No direct end-user CRUD on either private object.
Modify Cardstack_Admin/User permission sets only for intended class/custom access.

New Studio component: lwc/cardstackConnectionSetup; integrate through existing
cardstackSetupChecklist and CardstackStudioController.getChecklistState.
New renderer source: salesforce-native/ui/connection-diagnostic/{index.html,app.js};
output staticresources/CardstackConnectionDiagnostic.resource/meta.
New tooling: salesforce-native/scripts/{build-connection-ui.mjs,verify-mcp-connection.cjs,
run-apex-checks.cjs}; tests/{connection-protocol.test.cjs,connection-ui.test.cjs,
connection-setup-model.test.cjs}; docs/{MCP_APPS_INSTALL.md,MCP_APPS_PLATFORM_GATE.md}.
Runner/build code is local tooling only. Preserve retired packages/apps unchanged.

## Shared contracts

Define in CardstackConnectionTypes; Aura DTO properties use @AuraEnabled.
Client enum is exactly claude/chatgpt; reject all other values.

- SetupInput: client, publicClientId, callbacks(List<String>), siteId(Id),
  sitePrefix, enabledIntent(Boolean), expectedRevision(Integer).
- SetupView: client, revision, publicClientId, callbacks, resourceUrl, metadataUrl,
  issuer, enabledIntent, versions(Map<String,String>), checks(List<CheckView>), summary.
- CheckView: stage, status(Pass|Fail|Unknown|Stale), source, checkedAt(Datetime),
  errorCode; no raw error, token, actor ID or executable arbitrary URL.
- DiagnosticOpen: attemptKey, challenge, expiresAt, configurationRevision,
  resourceUri, fixture(Map<String,Object>); key/challenge remain private protocol data.
- DiagnosticReceipt: reference, configurationRevision, checkedAt,
  exactValues(Boolean), stages(List<CheckView>); exported view excludes attemptKey/challenge.
- SetupSnapshot: setupView plus configurationDigest and private org-local identity.
- ContextView: siteId, sitePrefix, resourceUrl, metadataUrl, issuer, checks.

Exact service interfaces and consumers are specified by task below. Test clocks
and context/permission providers can be injected through @TestVisible seams;
production actor is always UserInfo, never caller-supplied. Error codes are
INVALID_CLIENT, INVALID_SETUP, STALE_SETUP, NOT_AUTHORIZED, CONNECTION_DISABLED,
INVALID_ATTEMPT, EXPIRED_ATTEMPT, STALE_ATTEMPT, INVALID_VALUES, UNKNOWN_METADATA.

### Task1: Validate platform capabilities before production implementation

**Files:** Create docs/MCP_APPS_PLATFORM_GATE.md under salesforce-native and a
sanitized evidence directory docs/evidence/install-auth-platform. Reuse archived
probe fixture source, not deployable product classes.
**Interfaces:** Produce a documented GateResult with publicContextSupported,
issuerResourceEnforcementSupported, wrongOrgRejected, metadataReadCapabilities,
actualChatGptCallbackSequence, approvalRequiredForLiveActions and evidence links.
No invented production API is an output.

- [ ] Identify exact supported API67 org/Site context access sufficient to derive
  canonical public metadata without querying private setup records as guest.
- [ ] Establish supported issuer/resource/audience enforcement for opaque tokens;
  test wrong-org rejection and document application-binding requirements. Separate
  client paths must not be reported as proof of token/client identity isolation.
- [ ] Inventory readable Site/ECA settings and required admin rights. For every
  unreadable field specify Unknown/manual inspection rather than privileged fallback.
- [ ] Verify new ChatGPT connection draft -> exact callback registration -> consent;
  preserve other apps and never reuse the dev callback ID.
- [ ] Record read-only evidence first. For needed live tests prepare exact disposable
  changes and obtain action-time approval; cleanup guest grants/Site/apps/traces.
- [ ] Review gate evidence. Public context, wrong-org rejection and required
  authorization binding must pass before Task3/live product use. If unsupported,
  stop and propose spec revision; do not patch with token parsing or external host.
- [ ] Commit only sanitized gate artifacts; record pass/stop in task ledger.

### Task2: Private setup state, permission model and revision contract

**Files:** Create Types, Access, Context, Setup classes/tests and private objects;
modify Cardstack_Admin/User permission sets; create the two custom permissions.
**Interfaces:** Access.requireAdmin():void; Access.requireUser():void;
Context.resolve(String client,Id siteId,String prefix):ContextView;
Context.publicDescriptor(String client):ContextView (no private queries);
Setup.get(String client):SetupView; Setup.save(SetupInput input):SetupView;
Setup.snapshot(String client):SetupSnapshot. Context implements Task1 proven APIs.

- [ ] Write SetupTest.saveRejectsStaleRevision: save revision1, update to2, submit
  expectedRevision1 -> STALE_SETUP; assert stored revision2 and other client unchanged.
- [ ] Write access/validation tests: user without admin cannot read/save setup;
  missing user custom permission fails; unknown client/external domain/control chars
  rejected; empty/duplicate callbacks normalized; no dev-org constants in descriptors.
- [ ] Write ContextTest.publicDescriptorHasNoPrivateQueries and unreadable metadata
  -> CheckView.status Unknown/errorCode UNKNOWN_METADATA, never Fail or Pass.
- [ ] Create the safe runner scaffold specified below, then run focused tests after approved safe deployment;
  expect behavioral failures, distinguish compiler/permission setup errors.
- [ ] Implement private Setup object with unique Client__c(Text16), Revision__c(Number),
  Configuration__c(LongText32768), Configuration_Digest__c(Text64). Private sharing;
  system-mode repository access only inside explicit admin/user authorization gates.
  Validate input length: public client ID256, callback URL2048, max10 callbacks,
  prefix80; derive endpoints/issuer through Context, never accept arbitrary issuer.
- [ ] Save under row lock with expectedRevision; revision increments only for actual
  relevant changes. Stable serialization/digest includes versions and permission-policy
  revision. Snapshot never exports private actor/org identity.
- [ ] Implement run-apex-checks.cjs: managed CLI auth, private JSON capture, sanitized
  counts/failure names only; no raw CLI auth or debug-log output. Deployment remains
  the explicit JWT OFF/fresh opaque/deploy/finally ON verified procedure.
- [ ] Run focused Apex tests; inspect permission set metadata for no private-object
  user CRUD. Run PMD via installed analyzer skill; resolve Critical/High findings.
- [ ] Commit Task2 files and obtain task spec/code reviews.

### Task3: Production REST boundary and synthetic MCP dispatcher

**Files:** Create Ingress/Dispatcher classes/tests; use Access/Context/Setup.
**Interfaces:** Ingress.get():void and post():void via @HttpGet/@HttpPost at
@RestResource(urlMapping='/cardstack/v1/*'); Dispatcher.handle(String client,
Map<String,Object> request):Map<String,Object>. Dispatcher exposes only diagnostics
in this plan; no existing CRM/HXL tool aliases or writes.

- [ ] Write IngressTest.guestCannotExecuteOrReadResources: anonymous metadata200,
  mcp401 with exact pointer; POST resources/read/tools/call401 before dispatcher.
  Test fabricated bearer in integration runner; do not simulate platform auth in unit code.
- [ ] Write namedWithoutPermission403, revokedPermissionDeniedOnNextCall,
  invalidRoute404, metadataResourceExact, malformedJson32700, notification202.
- [ ] Write DispatcherTest.toolsAndResourceContract: one interactive
  cardstack_connection_diagnostic, one app-only cardstack_connection_echo;
  ui://cardstack/connection-diagnostic-v1.html; text/html;profile=mcp-app;
  protocols2025-06-18/2025-11-25; bad params -32602; unknown method -32601.
- [ ] Run focused tests red; implement auth-first ingress and exact route parser.
  Body limit16KiB, reject batch input, no outbound callouts or bearer inspection.
  Named branch requires fresh custom-permission check and enabled setup intent.
- [ ] Implement dispatcher typed JSON-RPC envelopes and constant StaticResource
  lookup WITH USER_MODE. Guest class grant is ingress only; dispatcher remains private.
  Until Task4/5 complete, unsupported diagnostic invocation returns explicit unavailable
  result rather than falsely successful proof.
- [ ] Run focused tests green and protocol fixture tests under node --test. Task3 unit
  resource tests use an injected synthetic lookup; absent real resource returns an
  explicit unavailable error until Task5. Do not claim real HTML loading at Task3.
  Verify zero CRM DML/callouts and that private setup data never reaches guest responses.
- [ ] Commit/review only this boundary; no Site activation without live authorization.

### Task4: Actor-bound synthetic diagnostics, replay and retention

**Files:** Create Diagnostics/Retention classes/tests; private Check object;
wire dispatcher diagnostic handlers.
**Interfaces:** Diagnostics.open(String client):DiagnosticOpen;
Diagnostics.echo(String attemptKey,String challenge,Map<String,Object> values):DiagnosticReceipt;
Diagnostics.mine(String client):List<DiagnosticReceipt>;
Diagnostics.observe(String receiptReference):DiagnosticReceipt (admin observer only);
Retention.execute(SchedulableContext context):void; purgeBatch(Integer limit):Integer.

- [ ] Write exactSevenValuesPreserved: text='café ✓ "quoted"', amount=0,
  accepted=false, choice='beta', rating='hot', notes='first\nsecond', enabled=false;
  assert exact keys/types/values. Empty text remains ''; reject null/NaN/extra keys.
- [ ] Write wrongActorCannotReadOrSubmit, expiresAtTenMinutes, revisionChangeStales,
  duplicateEchoReturnsSameReceipt, alteredReplayRejected, permissionRemovalDenied.
  Lock setup before attempt consistently; test no second receipt/state transition.
- [ ] Write observedRequiresPassingCurrentReceipt: an admin observation alone cannot
  create Diagnostic passed; store observer separately and never label host attestation.
- [ ] Write retentionDeletesOnlyChecksOlderThanThirtyDays, max200PerBatch,
  active/new receipts retained and zero Account/Contact/Opportunity mutations.
- [ ] Run red tests; implement Check object private: Attempt_Hash__c(Text64 unique),
  Challenge_Hash__c(Text64), Actor__c(LookupUser), Client__c(Text16),
  Revision__c(Number), Expires_At__c(DateTime), State__c(LongText32768).
  Generate 256-bit attempt key and challenge; persist hashes only. Service-owned
  system access guarded by current actor/custom permission on every operation.
- [ ] Use exact-key/type fixture validation and deterministic accepted-payload digest;
  successful replay returns original receipt only for same actor/revision/payload.
  Rejection never writes CRM or returns another actor's existence/state.
- [ ] Implement bounded retention and document explicit admin scheduling. No
  opportunistic guest cleanup, broad deletes or silent production schedule creation.
- [ ] Run tests green; PMD; commit/review diagnostic service and schema.

### Task5: Real MCP App diagnostic renderer and local protocol harness

**Files:** Create ui/connection-diagnostic/index.html, app.js; resource/meta;
scripts/build-connection-ui.mjs, verify-mcp-connection.cjs;
tests/connection-protocol.test.cjs, connection-ui.test.cjs.
**Interfaces:** Renderer consumes DiagnosticOpen tool result; app.callServerTool
invokes cardstack_connection_echo with attemptKey/challenge/values. It displays
DiagnosticReceipt only; app bridge lifecycle owns readiness, not model prose.
Runner accepts approved org alias + client and writes sanitized stage receipts.

- [ ] Write host harness test bridgeReadyRequiresInitialResult, exactSevenValues,
  emptyText, disconnectDisablesSubmit, staleReplyIgnored, reloadFreshAttempt,
  hostDeniedShowsErrorWithoutSuccess. Compare structured receipt independently.
- [ ] Write protocol tests public401Pointer, resourceMimeAndHash, notifications,
  bodyBounds, anonymousResourceDenied and supportOutputContainsNoCredentials.
- [ ] Run node --test red. Reuse unchanged pinned SDK1.7.4 bridge patterns from
  archived proof; build self-contained HTML with no external assets/fetch/auth code.
  Build tooling lives under native scripts; do not restart retired runtime packages.
- [ ] Implement seven labeled controls, explicit bridge states, exact receipt,
  bounded error/retry and teardown. Diagnostic data stays synthetic. Do not render
  actor IDs/challenges in visible receipts; no direct HTTP to Salesforce from iframe.
- [ ] Implement CLI runner using existing managed Salesforce auth; no stdin token,
  no credential file dumps, no raw network logs. It reports resource/identity gates
  separately from actual-host gates, leaving unobserved stages Unknown.
- [ ] Run build and node --test; inspect generated HTML offline; confirm resource
  hash and restrictive CSP. Commit/review resource plus its source/build scripts.

### Task6: Guided Studio setup, evidence states and user recovery

**Files:** Create Controller/test and lwc/cardstackConnectionSetup files;
modify cardstackSetupChecklist JS/HTML, StudioController/checklist tests;
create connection-setup-model.test.cjs and reusable component model JS.
**Interfaces:** Controller.load(String client):SetupView;
save(SetupInput input):SetupView; check(String client):SetupView;
observe(String receiptReference):DiagnosticReceipt;
exportSummary(String client):String. UI events connectionchange and navigatetab
preserve existing dashboard behavior. No Salesforce metadata mutation API.

- [ ] Write model tests unreadableSettingUnknown, manualFlagCannotVerify,
  dismissedLegacyChecklistCannotHideStaleConnection, independentClientStatuses,
  staleSavePreservesDraft, ordinaryUserCannotSave, errorOutputSanitized.
- [ ] Write controller tests JSONSerializationHasNoPrivateFields and
  changedConfigInvalidatesOnlyAffectedChecks. Exports allowlist stage/errorCode/
  versions/timestamps/status only; never raw error/body/user/private attempt fields.
- [ ] Run red tests; implement SetupController adapter using Task2/4 services,
  no mixed permission modes or caller-supplied actor. Evidence source displayed.
- [ ] Build guided steps: installation, Site, Claude, ChatGPT, verify, next gate.
  Exact client callback registration, public client ID only, per-user instructions;
  runtime opaque versus deployment JWT clearly separated. Save resumes unfinished
  steps, prevents lost revision writes, marks contracts Stale, preserves user drafts.
- [ ] Integrate checklist: legacy setup:mcpServerConfirmed/claudeConnected flags
  are history only for new transport; never become verified connection status.
  Users may collapse UI but dismissal cannot conceal current Needs attention.
- [ ] Implement recovery table from spec; show specific blocked stage and safe
  Salesforce links. No arbitrary URL execution or broader permission grant.
- [ ] Run node model tests and focused Apex tests. Own live Studio browser QA for
  keyboard operation, labels, resume, two-client status, unreadable settings and
  save conflicts; screenshots are required. Apply LWC skill's relevant checks.
- [ ] Commit/review UI and integration; do not modify HXL card/action behavior.

### Task7: Fresh installation, real-client auth lifecycle and release evidence

**Files:** Create docs/MCP_APPS_INSTALL.md and docs/MCP_APPS_INSTALL_AUTH_QA.md;
modify scripts/build-package.py exclusions for sites/guest/ECA companion metadata
only if such metadata exists in source; tests/package-stage.test.cjs.
**Interfaces:** ReleaseEvidence includes packageVersion, contractVersions,
configurationRevision, orgAliasLabel, perClientStages, cleanup and remaining gates.
No token values, private org/actor IDs or falsely inherited dev proof.

- [ ] Write staging regression test excludesCompanionSecretsAndSites and
  includesOnlyPackageableTransport; assert no credentials embedded in package files.
- [ ] Run red then implement packaging filters. Preserve existing beta package path
  and companion behavior; no HXL removal or new supported-client release claim.
- [ ] Stage fresh source outside repository with build-package.py --core-only;
  validate package creation/install through supported API67 tools. Obtain explicit
  authority for second-org installation and disposable live changes when needed.
- [ ] Follow Studio setup in second suitable org, two Local apps, approved guest
  allowlist. Run anonymous/fabricated/expired/wrong-org/ordinary/denied-user checks;
  resource/app token binding must match Task1 security evidence. Stop if any gate fails.
- [ ] In actual Claude and ChatGPT observe consent/discovery/iframe/exact echo,
  empty value and reload/fresh attempt. Verify named actor privately, no CRM writes.
  Save separate screenshots and sanitized receipts; do not mark one client from other.
- [ ] Test real refresh across Salesforce token expiry, revoke authorization and
  verify old requests/refresh fail, reconnect, then repeat named diagnostics.
  Set bounded test policy only with approval; do not lower org-wide protections.
- [ ] Verify one client's revocation leaves the other's settings and actual
  connectivity intact; test upgrade/resume/Stale contracts/permission removal.
- [ ] Run node --test salesforce-native/tests/*.test.cjs, complete Apex RunLocalTests
  via sanitized runner, relevant analyzer/LWC checks and fresh package install.
  Failures receive systematic debugging; do not invent a passing full suite.
- [ ] Clean disposable records/checks/test users/access as approved; restore
  deployment JWT ON, remove owned traces and temporary guest exposure. Retain intended
  production settings only under explicit deployment authorization.
- [ ] Commit release guide/evidence, perform final independent branch review.
  Report install/auth result and remaining governed Account/complete migration gates.

## Verification commands and expected results

From the repository root, the safe Apex runner interface is:
`node salesforce-native/scripts/run-apex-checks.cjs --org cardstack-spike2 --classes ClassName1,ClassName2`
and full suite uses `--all` instead of `--classes`. The runner captures CLI output
privately and emits only test counts/safe identifiers, with nonzero exit on failed,
incomplete or unparseable results. Green means failures0 with all requested tests
completed, not merely process exit0. Red means the named behavioral assertion fails;
missing dependencies/compile failures do not count as the intended red result.
Task2 creates this small support scaffold before its first org test run.

Use focused class pairs in Tasks2/3/4/6; Task7 uses --all. Local commands:
`node --test salesforce-native/tests/connection-protocol.test.cjs`
`node --test salesforce-native/tests/connection-ui.test.cjs`
`node --test salesforce-native/tests/connection-setup-model.test.cjs`
`node salesforce-native/scripts/build-connection-ui.mjs`
`node salesforce-native/scripts/verify-mcp-connection.cjs --org cardstack-spike2 --client claude`
(the analogous chatgpt command runs separately). Unit green means all defined tests
pass; build green means one self-contained expected resource emitted; API green
means every required protocol gate true and actual-client stages remain Unknown.
Do not run legacy pnpm demo/runtime servers to verify native work.

## Gate and coverage ledger

Task1 covers spec2/4/7 supported context, metadata and authorization limitations.
Task2 covers spec2/3/5 setup/schema/private access/revision.
Task3 covers spec2/4 protocol/guest/named boundary.
Task4 covers spec5 diagnostic binding/replay/retention.
Task5 covers spec5/7 resource/bridge/fixture and safe local runner.
Task6 covers spec3/5/6 setup UX, evidence, drift/recovery.
Task7 covers spec6/7 lifecycle, packaging, ordinary users, both clients, second org,
upgrade and release evidence. Spec1 Account editing, interpreter and HXL cutover
are explicit follow-on dependencies, not omitted work in this plan.

Commit only reviewed task changes; no push/merge/release until separately authorized.
Every live approval request must describe a concrete prepared change, target,
access and cleanup. Checkpoint decisions and gates in the task ledger before work
crosses reviews. No unsupported capability should be hidden behind a green badge.
