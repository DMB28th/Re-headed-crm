# Proposed Opportunity screen live acceptance scope — October 12, 2026

**Prepared for one scope review and then one human approval; no live action executed.**
Approve, if accepted, **one additional unreleased full-UI beta, one new one-day
Developer scratch org, and its bounded Salesforce/Claude/ChatGPT acceptance and
owned cleanup described below**. Prior source/local/native-unit authorization
continues. The earlier one-beta/one-org package-only scope was used and cleaned up;
it does not authorize this new version, org, CRM fixtures, Site, OAuth apps or host
connections. This document is the concrete reviewable proposal, not an approval.

## Frozen source and honest starting evidence

Proposed source: `95acd7d7776625cb28496d5996db9404f449c4b0`, in the existing
`codex/mcp-apps-delivery-proof` worktree. Native Apex/LWC bytes equal checkpoint
`2d65d7224fe47dec4adf05f2feff6dd28b097448`. The exact four-file later delta changes
the controller, its regression, the generated runtime resource and synthetic demo;
restored Review → Resume → Back preserves server-retained proposals. Source spec
and quality rereview both PASS; UI suite 33/33 and pinned SDK 1.7.4 build are recorded.
Those are source/local evidence, not observed browser or client acceptance.

Native API67 checkOnly compiled the 93-class/LWC checkpoint with 395/395 executed
assertions, but omitted the packaged Studio test class. The explicit 44-class
selection against that same ZIP completed **530/530 regular tests passing**, all
**13 new Studio cases executed**, with zero component errors. Overall checkOnly
status remains **Failed**, solely for four unchanged legacy per-class coverage
warnings: FlowContinue27.083%, QuickActionStart49.180%, DmlError71.698%,
FlowStart50.725%. Changed production coverage: OpportunityActionPolicy95.833%,
ConfigService88.073%, StudioController94.348%, PolicyService97.222%. No skip-validation
or coverage-only legacy rewrite is proposed. See the [safe native receipt](evidence/opportunity-edit-2026-10-11/screen-studio-native-assertions-2d65d72.json).
An earlier diagnostic counted16 names because it included three helpers; the
actual new executable count is13. Assertions passed, but full metadata deployment
is not green. Actual full-UI package aggregate coverage, installation, serial
installed suite and real Stage/provider behavior remain separate live gates.

Frozen backend-only `8893ffb` created a coverage beta (89%) and installed
successfully. Its complete asynchronous RunLocalTests failed: summary 535 entries,
497 pass, 38 fail; exported detail 517 regular methods, 482 pass, 35 fail. Three
legacy PermissionSetAssignment setup failures propagated to their methods; setup
contention is a supported hypothesis, not observed scheduling. Preserve this failed
run. The created org's deletion was independently verified. It contains neither
the final renderer nor Studio source and cannot satisfy the new live gate.

Offline stage prepared with the existing `scripts/build-package.py --core-only`
helper: `/private/tmp/cardstack-live-screen-qa-source-95acd7d7`. It has 290 files;
every staged force-app file is byte-equal to frozen source. It excludes per-org
OAuth metadata, Sites/guests, Hosted MCP definitions and HXL companion families.
No package version was created. Private `full-ui-stage-inventory.json` pins every
file, including generated resources and the intentional project/org-definition
transforms. Before an approved build, recheck the frozen package-source identity and every hash;
source drift requires a revised reviewed artifact, not a silent restage. The later
controller documentation commit `cc314ad` leaves proposed source `95acd7d7` pinned.

Final runtime SHA256: `2c354b3191d0d5c581aa9fb551d71fd2fc5ad043c9d5ba1794a389a52b37c79c`.
Preview: `bf3d1c6708f6a3e46621d1bb8f80aef3646af8d1835e794bdd710580a0c4d4b2`.
Synthetic demo: `ecab8ce327eacf8e413102f897d8ea93a350ebe860073d72eafdac31c901dae7`.

## Exact resource budget and preservation

Use the **existing configured Dev Hub**, resolved and verified privately from
actual local CLI `target-dev-hub` configuration and matching managed-auth Dev Hub
flag. Keep its alias/username private and reverify the configured Dev Hub before
package creation. A working/native-validation role does not preclude a Dev Hub
role; no separate alias is assumed. Use Salesforce hosting and API **67.0**.
Keep installed beta **0.1.0.8**, its companion, every existing app, Site, host
connection and the five pre-dirty documents. No promotion, cutover, release,
primary-org deployment, push, merge, dependency installation, Node runtime,
product refactor or new hosted gateway is proposed.

| Resource | Exact proposed limit / name |
| --- | --- |
| Additional package | One unreleased full-UI coverage beta from the pinned stage; actual version number assigned by provider, never guessed |
| Scratch org | One Developer org, one day; alias `cardstack-opportunity-screen-qa-95acd7d`; org name `Cardstack Screen QA 95acd7d` |
| People | Existing new-org admin plus two newly created ordinary actors A/B, aliases `csqa95a` / `csqa95b` |
| Native contexts | Two SalesProcesses and two Opportunity RecordTypes: `CSQA95_Alpha`, `CSQA95_Beta` |
| CRM fixtures | At most one Account and four Opportunities, fixed names in private manifest |
| Sharing | Opportunity Private in the owned scratch org; at most two temporary Edit shares for A-owned Alpha/Beta to B |
| Subscriber ingress | One owned Site `CSQA95Screen`, prefix `csqa95screen` |
| Local ECAs | `CSQA95_Claude`, `CSQA95_ChatGPT`, one each |
| Actual host entries | `Cardstack QA 95acd7d Claude`, `Cardstack QA 95acd7d ChatGPT`, one entry in each host |
| Rule | One owned `CSQA95_RejectAmount` validation rule restricted to the fixed fixture-name prefix |
| Native grants | At most two owned minimal CRM permission sets, `CSQA95_Crm` and removable `CSQA95_AmountEdit` |
| Acceptance writes | At most eight confirmed Opportunity save effects and four admin fixture freshness edits; retries/noChanges/cancel create zero save effects |

Package creation uses installation-key bypass, code coverage, the existing staged
Developer package-org definition, existing Dev Hub and API67. Capture the returned
version identity privately. One pending creation request is polled; do not submit
another creation on timeout. Failure stops package/client acceptance and retains
the failure record. A second version or org needs a revised scope. Org creation
must use one-day duration and CLI `--wait` **at least 2 minutes**; it cannot fall
back to an existing org. Match the returned org and ScratchOrgInfo identities
privately before any install, fixture mutation or deletion.

## Installed test gate before fixtures and clients

Install only the returned new full-UI version into that owned org. Require actual
installation Success. The offline expected inventory contains **44 executable
packaged classes, 530 regular methods and 18 TestSetup methods**. StudioController
has 34 regular methods (old21 + new13). This replaces the old517-method inventory
for this candidate; helpers/TestData are not executable test classes.

Resolve the installed class inventory and compare installed source identities to
the pinned stage before running tests. Run each of the 44 classes **one at a time**
using existing supported Salesforce CLI single-class synchronous execution. Await
process completion and inspect completed result before submitting the next class;
no test job, metadata deploy, setup assignment or CRM operation may overlap the
control. Do not use async RunLocalTests or assume a synchronous flag serializes
multiple classes. The command template is:

```sh
sf apex run test --target-org cardstack-opportunity-screen-qa-95acd7d \
  --class-names "$qa_class" --synchronous --code-coverage \
  --api-version 67.0 --result-format json --wait 10
```

Redirect each result/stderr into its own mode0600 private capture; do not print raw
provider output. A wrapper may iterate the frozen class list only with blocking
awaits, never Promise.all/background launches. Aggregate **each expected class/
method exactly once**, outcome, setup failures, actual counts, completed status,
coverage and command exit status. No omitted/setup-failed/queued method is a pass.
Do not compare a summary including setup rows blindly with530 regular methods.
Native source and installed inventory must reconcile; preserve any unexpected
platform-generated classes separately. Full installed acceptance requires every
expected regular method pass and no setup failure. Report package creation
coverage separately from test-run/org coverage. Existing Account/action, config,
permissions and backend regressions are included in this complete control; avoid
mirrored additional batches. A failed control blocks live acceptance claims.

## Minimal ordinary access, fixtures and published configuration

A/B use ordinary Salesforce users, no administrator profile, ViewAll/ModifyAll,
ManageUsers, AuthorApex, Studio management or broad metadata permissions. Assign
installed Cardstack_User with its use gate, config read/FLS and minimum installed
entry-class access. Verify the effective profile and all assigned grants; permission
removal is meaningful only if no other set/profile still grants it. Give Opportunity
Read/Edit and native access needed to read Name/StageName/CloseDate/Amount/
RecordTypeId/SystemModstamp and currency context if present. Universally required
Opportunity fields, including Name, have unavoidable native access with object
Edit; do not claim Name can be made read-only through FLS. Omit unsupported
fieldPermissions entries for required/system fields. Use FLS entries only for
fields the actual org supports as permissionable, and verify effective access.
**Published Cardstack policy and the server's exact preset restrict all Cardstack
writes to StageName/CloseDate/Amount**, even where native Salesforce rights permit
other fields. Do not weaken native CRUD/FLS or broaden the tool/preset to express
this distinction. Actors need both QA record types. Account
read is sufficient; admin creates all fixtures and users need no Create/Delete.
Do not grant A/B direct CRUD on private Interaction, Confirmation, connection setup/
diagnostic or Audit objects. Required audit writes remain server-owned. The setup
admin uses installed Cardstack_Admin and existing native administrative authority
for fixtures, publication and independent record/audit readback.

Split Amount Edit into the removable `CSQA95_AmountEdit`; baseline ordinary profile
must not already grant it. The other owned set holds minimum native rights.
Temporarily remove/restore Amount Edit and Cardstack_User from B only to test FLS
and connection-use removal separately. Read remains available for the FLS case.
Use roles/sharing with no implicit all-record access; privately verify B loses
Alpha/Beta access after the two exact temporary shares are removed. No user may
inspect another actor's private interaction authority.

Create A-owned Alpha (process Alpha), Beta (process Beta), Stale (Alpha), B-owned
Actor B (Beta), and the one Account. Fixed dates start `2026-11-30`; exact Amount
strings start10000.00/20000.00/30000.00/40000.00. Target dates use `2026-12-15`;
success targets use exact decimal strings such as `12500.25` or `22500.25`.
Repeated scenarios reuse these fixtures within the write budget. No invented
Salesforce ID or Stage API value appears in deployable source. Inspect this fresh
org's active native Stage API values privately, choose two valid distinct process
sets with at least one different Stage, and populate the unresolved template.
Each process must have an available initial and target Stage. If distinct valid
contexts cannot be formed within these bounds, record Blocked rather than broaden
metadata or use Describe as runtime proof. RecordTypes point at those actual
SalesProcesses. Disable any irrelevant automatic data seeding; no extra records.

In native Studio stage and publish only `layout:Opportunity:default` using the
prepared candidate. The action is `qa95_edit_opportunity`, type `record-edit`,
explicit enabled true, with **exact ordered mappings**:

```json
[{"fieldApi":"StageName","source":"current"},
 {"fieldApi":"CloseDate","source":"current"},
 {"fieldApi":"Amount","source":"current"}]
```

Expose all three as editable, Stage/CloseDate required and optional Amount Clear.
No constants, alternate sources, extra fields or arbitrary patch operation.
Demonstrate draft has no executable action, publication enables it, and an exact
shape disabled preset reduces access. Save baseline and restore the enabled
candidate after bounded denial tests. Inspect actual native Studio preview/LWS/
CSP/layout, keyboard/focus and synthetic labeling; Save stays disabled in preview.
A Studio preview is renderer evidence and cannot authorize a real save.

Deploy the single fixture validation rule from the unresolved template only in the
owned org. It rejects changed Amount `999999.99` only on the QA prefix. This is a
real Salesforce DML rejection, not the test-only failCrmUpdate/failAppend seam.
A failed save must retain corrective inputs and require a fresh review.

## Owned Site, OAuth and two actual clients

Follow MCP_APPS_INSTALL.md and MCP_APPS_AUTH_RUNBOOK.md. Derive issuer/Site URLs
from the actual new org/Site context; never guess them or copy the development-org
endpoint. Guest receives only ingress and required constant landing-page access:
no CRM/private/config object grant, renderer class or HTML/tool access. Verify
exact anonymous401 Bearer resource-metadata challenge, matching metadata resource/
issuer, and missing/fabricated bearer rejection for HTML/tools/records.

Create the two **Local** ECAs as authorization-code public clients with only
`api` + `refresh_token`, required PKCE, rotation and runtime opaque-token issuance
(**JWT OFF**). Client secret stays blank. Copy each callback from its **actual
current host connection screen** into the matching ECA; the historical Claude
callback is reference, not permission to guess the new screen. Unknown IDs/URLs/
callbacks remain null in preparation, privately populated and normalized to
checksum18 only from actual returned records. Do not dump ConsumerKey/Secret pages.

Save/check separate Claude/ChatGPT Studio setups against the selected owned Site.
Resolve expected-revision errors against latest state; manual checkboxes are not
runtime proof. Consent in the two owned host entries as A/B serially, replacing
only the owned entry's session when switching actors. Verify each named actor
privately; an admin success cannot stand for an ordinary user. Preserve all prior
host entries. Discovery exposes only Open as model-visible; Start/Transition/
Refresh are app-only. Actual iframe and host readiness, exact resource hash and
host-mediated tool execution must be observed independently in each client.

Card Stack SFAPP is separate deployment OAuth. If any approved API67 Metadata
step touches it, use the existing opaque CLI recipe and restore/verify its JWT
**ON in finally**, even on failure. Runtime app JWT remains OFF while active;
disabled-QA cleanup does not change beta apps. No bearer/auth code/state/refresh
token is inspected, saved to a store, logged or pasted into chat.

## Acceptance cases and evidence levels

Use four labels: **native** (real Salesforce operation under ordinary actor),
**protocol** (transport/API observation), **renderer** (DOM/SDK or synthetic
preview), **actual-client** (observed Claude or ChatGPT iframe/bridge interaction).
Record each client's outcomes separately. Screenshots show UI without credentials
or private envelope. Independent admin readback is native corroboration; it cannot
stand for client rendering. Mock/JSDOM assertions never count as live.

| Case | Concrete procedure and decisive evidence |
| --- | --- |
| Actual Stage contexts | A and B start shared Alpha/Beta through named installed runtime; compare exact API choices/labels with native RecordUi context for each actual RecordType. Choice sets must differ as configured. No test seam or Describe fallback. A new session never offers the other process's exclusive Stage. |
| Confirmed lock path | Under ordinary A/B, Review all3 leaves CRM unchanged; explicit Confirm follows native USER_MODE record FOR UPDATE and fresh RecordUi validation, saves once, returns bound receipt and one required audit. Compare fresh record and audit/receipt diff and actor. This proves functional execution of the installed lock path, not lock scheduling. |
| Freshness fence | Review Stale; admin changes its Amount or RecordType (within four total fixture edits); Confirm must reject/conflict and preserve admin state, with no successful-save audit/receipt. Repeat a process-context change before Confirm. No speculative concurrency or lock-row timing claim. |
| Each-host success | Open → Edit3 values together → server Review → explicit Confirm → durable receipt → Refresh. Exact API Stage/date/decimal values match independent CRM/audit readback. At most four principal saves across actors/hosts. |
| Validation | Invalid calendar, blank required, unavailable native Stage, malformed decimal: field errors retain correction input. Additionally real rule Amount999999.99 causes DML rejection, no write/success audit; corrected fresh review may use a principal-save budget slot. |
| Back/Cancel/noChanges | Back invalidates old confirmation; restore Review→Resume→Back retains displayed3 proposals if real host metadata is available. Cancel writes nothing. Unchanged review returns noChanges without update audit; optional Amount Clear only through explicit Clear (at most two extra successful saves). |
| Actor/client/access | B cannot use A's in-memory authority; opposite route cannot reuse the same authority. Reuse only within private protocol/host argument memory, never model text. Remove shared-record access, B's Amount Edit and connection-use grant separately; denial cannot save or display stale unauthorized receipt. Restore only owned baseline grants. |
| Lost response | At most one experiment per host (two save-effect slots). Only use a genuinely observed supported host interruption after dispatch; Unknown → Resume/status first; recovered completion returns original receipt, exact retry has one total CRM/audit effect. If dispatch/loss cannot be measured, record Unknown/not exercised. No host fault-injection capability is assumed. |
| Receipt/read refresh | After known save, observe a genuine failed read/host disconnect if available; receipt persists for nonaccess transport failure, retry reads only. Explicit access denial clears unauthorized presentation. If no genuine failure can be induced, mark client experiment unobserved; preserve local renderer coverage separately. |
| Record-switch late reply | Attempt supported actual host record switch while review/save response pending; old response never replaces new record or enables Confirm. If host cannot delay/release replies observably, mark unobserved; synthetic generation checks are renderer-only evidence. |
| Reload retention | Reload whole chat, observe whether accepted host _meta survives. If present, Resume/status precedes renewed confirmation; if absent, truthful recovery-unavailable state and independent CRM readback, never claim unsaved. Retention is client-specific measurement, not a promised capability. |

Private interaction keys/grants exist only in controller closure, accepted private
_meta and actual host tool-argument memory. Never place them in DOM, data attributes,
URL, local/session storage, console/provider debug logs, screenshots, fixture
files, model context or public receipts. Use no debug trace that could record them.
Public receipt references may be sanitized; raw CRM values/identity/authority and
provider errors stay out of public summary. Do not copy private envelopes into
commands/loggable scripts for replay. If the supported runtime cannot perform an
actor/client misuse experiment without exposing authority, retain native test
coverage and mark that live case unobserved.

## Completion, stop conditions and owned cleanup

Record frozen head, actual artifact version/coverage, installed530-method gate,
UTC timestamps, native Stage context outcomes, each client/actor/scenario result,
separate receipt/readback/audit agreement and remaining Unknowns. A failed security,
Stage, installed-suite or actor gate stops affected acceptance; perform cleanup.
Any additional package/org/fixture/app/grant/host entry beyond the manifest bounds
requires updated concrete scope. Approval permits this bounded experiment and
cleanup; it does not make outcomes pass or authorize release.

Cleanup runs in finally even on failure: disconnect/remove only two exact owned
host entries; deactivate owned Site/ECAs; remove owned guest class/page grants,
shares and temporary assignments; verify deployment JWT ON if touched; match
alias/org/ScratchOrgInfo identities before deleting only the created org; verify
Deleted independently in Dev Hub and inaccessible owned routes. Org deletion
removes owned fixtures/config/metadata. If deletion fails, keep them disabled,
record the failure and retain exact ownership for later cleanup; never delete by
wildcard or substitute another org. Preserve baseline beta/apps/connections and
historical failed-run evidence. The additional version remains unreleased and
unpromoted evidence; no automatic version deletion/promotion is proposed.

Private bundle: `.superpowers/sdd/2026-10-11-opportunity-custom-mcp-apps/live-screen-qa-prepared/`.
It contains fixed-name mutation/cleanup arrays, unresolved private resolution map,
fixture/rule templates, candidate config, source/class inventories and exact JS
delta. The preparation report records hashes and limits for controller review.
