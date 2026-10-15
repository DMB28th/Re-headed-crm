# Lookup integration inventory and handoff — October 14, 2026

Lookup is **not integrated**. The reusable picker is locally verified; the native
positive search and selected-ID eligibility provider is incomplete. REFERENCE
must remain `UNSUPPORTED_FIELD_TYPE` until the provider and its native validation
are complete. This is a read-only source inventory plus this documentation file,
not permission to deploy or change authentication/configuration.

## Source ownership and reconciled state

- Sole integration/source/deployment owner: root Cardstack integration chat.
- Canonical checkout: `/Users/danielben-atar/.codex/worktrees/mcp-apps-delivery-proof/Re-headed-crm`, inspected HEAD `f6eebd1`.
- Owner-reported deployed revision: `8f1b138`; this inventory did not inspect an org or establish deployed-byte parity.
- Lookup checkout: `/Users/danielben-atar/.codex/worktrees/dynamic-lookup/Re-headed-crm`, inspected clean HEAD `94035dd`. Preserve that checkout and its reviewed work.
- Canonical pre-existing dirty files preserved: `salesforce-native/AGENTS.md`, `salesforce-native/README.md`, `docs/CLAUDE_SALESFORCE_AUTH_INVESTIGATION_2026-10-08.md`, `docs/MCP_APPS_DELIVERY_PROOF_2026-10-08.md`, and `docs/superpowers/plans/2026-10-08-mcp-apps-install-auth.md` (last three paths relative to `salesforce-native/`).
- Platform: persistent `cardstack-spike2`, API67, existing authentication, deployment SFAPP JWT ON. The current owner instruction/runbook overrides historical AGENTS advice to toggle JWT.
- Root `CLAUDE.md`, `README.md`, `PLAN.md` contain retired Node/mock implementation details. Native AGENTS and the canonical shared-engine source govern this integration. Salesforce owns metadata, published policy, execution, confirmation and durable state; local Node builds assets only.

The October 12 platform ledger's absent-ingress observation is historical: the
canonical tree now contains `CardstackMcpDispatcher`, `CardstackRecordMcpAdapter`
and `CardstackEditorUiResource`. It is not a reason to build a second ingress.
The October 13 handoff/shared contract supersedes the original plan's independent
RecordForm/controller/writer. Missing native lookup eligibility remains current.

## Completed contributions and exact reuse boundary

Paths below are relative to `salesforce-native/`; lookup-only paths refer to the
lookup checkout unless explicitly marked canonical.

| Contribution | Exact symbols/files | What is actually complete |
| --- | --- | --- |
| Picker/state | `ui/record-form/lookup-picker.mjs::mountLookupPicker`, `lookup-state.mjs::createLookupState` | Injected plain DOM picker, debounce 300ms, query 2–100 UTF-16 units, max10 results, loading/empty/error/duplicate presentation, keyboard/IME/pointer behavior, clear/replacement, focus/ARIA, retained caller disabling and context/lifetime invalidation. |
| Decoder/type subset | `ui/record-form/contracts.mjs::{recordId,decodeSelection,decodeLookupMetadata,decodeLookupContext,decodeLookupView,sameLookupContext}`, `contracts.ts` | Strict local component contracts/checksum18 checks. Shapes differ from the frozen shared editor envelope and need an explicit adapter. |
| Assets | `ui/record-form/icons.mjs`, `icons/*`, `styles.css` | Bundled allowlisted SLDS PNG glyphs/colors; carry LICENSE/NOTICE with distribution. No runtime image URL or network loading. |
| Provider boundary | `force-app/main/default/classes/CardstackNativeLookupProvider.cls::{resolve,describe,search,validateSelection}`, companion metadata and Test | Server-issued transaction-local definition; native source/reference/single-target schema and access preflight; actor/org recheck; safe malformed context/query/ID/type denial. Valid describe/search/selection operations deliberately throw `NATIVE_LOOKUP_PROVIDER_UNAVAILABLE`. No CRM query, DML, callout, eligible result or non-null verified fingerprint. |
| Optional old units | `CardstackRecordFormTypes`, `CardstackLookupTypes`, `CardstackFormError`, `CardstackFormDiagnostics`, retention/tests | Earlier reviewed DTO/error/diagnostic work belongs to the superseded standalone form shape. Not prerequisites for the canonical engine; reconcile only an actually needed subset. |

Fresh offline verification in lookup HEAD `94035dd`: 70/70 tests passed in
`tests/record-form-lookup.test.cjs` and `tests/record-form-ui.test.cjs`; strict
`tsc --project ui/record-form/tsconfig.json` exited0. The latter form tests verify
a local harness, not the production controller/native bridge. No Apex compilation,
native GREEN, coverage, deployment or actual-host lookup QA was run here.
Historical provider candidate tests remain unqualified; the unknown-prefix
typed-ID fixture must be checked for a failure before provider entry.

Exact local commands, run from the lookup checkout on the shared macOS/zsh
workspace with pre-existing repository dependencies and no installs:

```sh
NODE_PATH=/Users/danielben-atar/Re-headed-crm/node_modules/.pnpm/jsdom@30.0.1/node_modules node --test salesforce-native/tests/record-form-lookup.test.cjs salesforce-native/tests/record-form-ui.test.cjs
/Users/danielben-atar/Re-headed-crm/node_modules/.bin/tsc --project salesforce-native/ui/record-form/tsconfig.json
```

Do not import `ui/record-form/record-form.mjs::mountRecordForm`, its public FormView
lifecycle, the lookup checkout's older Opportunity controller/scalar extraction,
or whole permission sets. Do not merge the lookup branch wholesale: its dependency
baseline predates canonical capability, picklist, Studio, resource versioning and
shared-engine changes. Copy only reviewed picker/state/decoder/assets plus exact
provider files that the owner chooses to qualify.

## Canonical shared-engine hooks

| Layer | Existing canonical files/symbols | Minimum extension point |
| --- | --- | --- |
| Published/native capability | `classes/CardstackRecordScreenCapability.cls::{fieldExclusion,describeEligibility,buildDefinition,projection,readContext,describeFields,canonicalize,decode,validateCapabilityContext,validateVerifiedContext}` | REFERENCE currently excluded by scalar/expanded type allowlists. Only a verified provider may admit a source/field. Declare controlling/native source projections and provider freshness in capability binding; do not infer authority from browser metadata. |
| Public/stored types | `classes/CardstackOpportunityEditTypes.cls::{FieldView,DiffRow,StoredState,reviewSubject}` | Version strict persisted/public shapes deliberately. Optional `lookup`/`selection` on eligible field descriptors and `beforeSelection`/`afterSelection` on diff presentation. Exact ID/null patch remains authoritative; bind verified lookup freshness into reviewed context. |
| Review and recovery | `classes/CardstackOpportunityEditService.cls::{startRecord,transitionRecordFromMcp,transitionCore,currentContext,canonicalize,envelope}` | Current Review canonicalizes fresh source; resumed Review re-canonicalizes and issues a fresh revision/grant. Add provider resolve/selected-ID validation to this path; preserve Back/Cancel/Expired/Conflict and no-change completion. |
| Ownership and grants | `classes/CardstackOpportunityEditRepository.cls::{lockOwned,lockGrant,issueReviewGrant,invalidateReviewGrant,complete,restore,requireOwner,requireSetup}` | Reuse private actor/org/client/setup-bound state, locking and strict recovery. Search may use owned-state validation but must not call save/issue/consume grants or advance revision. |
| Confirm and atomic completion | `classes/CardstackOpportunityWriteService.cls::{confirmRecord,confirmCore,currentContext,validatedPatch,updateRecord,validationFailure}`, `CardstackOpportunityWriteAudit::appendRequired` | Revalidate selection and provider freshness after source lock, before existing USER_MODE DML. Preserve exact patch/reviewSubject checks, CRM+required audit+receipt atomicity, rollback, grant consumption and repeated-confirm receipt. |
| Native bridge | `classes/CardstackRecordMcpAdapter.cls::{tools,call,readResource}`, `CardstackMcpDispatcher::{toolList,toolCall}` | Add fixed interaction-bound app-only search route with exact strict request/result decoding only when provider ready. Keep private handle in `_meta.cardstack`/existing private adapter closure as appropriate, never public View/model text. |
| Browser | `ui/opportunity-edit/fields.mjs::{registry,checkedFields,validateChanges,draftsFromFields}`, `record-contract.mjs::publicView`, `view.mjs::renderScreen`, `controller.mjs::mountEditor`, `adapters.mjs::recordAdapter` | Add lookup presenter through existing renderer; same controller owns drafts/state/grants. Strict fields currently reject lookup/selection keys and registry has no REFERENCE. Add explicit checked descriptor/result adapter and picker disposal/invalidation. |
| Resource/build | `scripts/build-opportunity-ui.mjs`, `CardstackEditorUiResource`, `CardstackRecordMcpAdapter::resourceUri/readResource` | Bundle selected modules/styles into existing RecordEditUi, SDK1.7.4, preserve content-addressed resource versioning. Builder currently emits `img-src 'none'`; bundled glyphs require scoped `img-src data:` and retained asset notices. No external runtime hosting. |

Existing `classes/CardstackLookupSearchAction.cls::lookupSearch` is generic
caller-target `Name LIKE` search with sharing/USER_MODE. It neither binds source
record/field/policy/interaction nor proves native filters/special rules/selected-ID
eligibility. Its public invocable response/Lightning schemas must not be cast into
the private editor search contract or treated as the missing provider.

## Contracts that must remain separate

1. **Read-only native search.** Reserve `CardstackContextLookupSearchAction`;
   transport args exactly `{interactionKey,expectedRevision,fieldApi,query,requestNonce}`.
   Derive source record/object/action/target and policy from owned stored state.
   Recheck current actor/org/client/setup/access, Editing status, expiry, revision,
   published capability, source USER_MODE read and native provider freshness.
   Query 2–100 UTF-16 units; nonce1–64 ASCII alphanumeric/underscore/hyphen is
   correlation only. At most50 candidates and10 returned matches; count is rows,
   not total records. No state/grant/CRM mutation or revision advancement.
2. **Checked presentation.** Frozen descriptor uses `contractVersion:'record-lookup/v1'`,
   `fieldApi`, targets and `providerFingerprint`. Result echoes
   `{contractVersion,objectApiName,recordId,fieldApi,revision,providerFingerprint,query,requestNonce,matches,count,truncated,error?}`.
   Selection is `{recordId,objectApiName,name,secondaryText?}`; display field is
   derived/readable, not automatically `Name`. Full checksum18 IDs only.
3. **Selected-ID write authority.** FieldChange remains `{fieldApi,operation,value}`:
   set exact ID, clear null, omit untouched. Never labels/query/nonces in patches.
   Validate native target type, target record read/sharing/FLS, native filters,
   controlling values, special relationships and fresh metadata at canonicalization,
   fresh Review/resumed Review and locked Confirm. Owner required/canClear rules
   decide clear. Salesforce native DML at actual Confirm enforces applicable
   native write constraints, including lookup filters. Successful USER_MODE DML
   establishes that actual write outcome; it does not establish the earlier
   search/pre-Review membership or the provider's metadata freshness. Retain it
   as final write/race authority alongside the pre-Review eligibility checks.
   Exact-ID validation is independent of any prior search page; evaluate the
   same predicate against controlling values from the effective reviewed patch,
   including simultaneously changed controls, not merely the old source snapshot.
4. **Confirmation/completion.** Existing actor/source/action/policy/setup/revision/
   expiry/freshness/patch bindings stay mandatory. Add provider fingerprint to
   canonical reviewed context with an intentional stored-state version strategy.
   Back/new review invalidates old grant; Cancel cannot save; interrupted save
   recovers authoritative outcome before retry; repeat Confirm returns original
   receipt. Readable selection presentation in review/receipt must distinguish
   same-name records while exact IDs still decide equality and patch binding.

The local picker decoder expects `fieldApiName`, `restrictionRevision`,
`targetObjectApiNames`, `schemaVersion:1`, source-prefixed identity and policy
revision; its search call includes client context/source/policy and no nonce.
Explicitly map `fieldApi <-> fieldApiName`, verified `providerFingerprint <->
restrictionRevision`, derive target-name list from verified targets, and translate
the checked nonce/revision response into the local decoder. Strip all client
source/action/policy/filter arguments from transport. Policy/context identity may
be retained privately or the component contract may be versioned; never invent a
revision/fingerprint just to satisfy the old decoder.

## Stale-switch and recovery defenses

Canonical `mountEditor` already rejects late progression through generation,
request generation, record/interview identity and retired handles; complete host
input resets even the same record, unsolicited success cannot replace bound
interactions, and disconnect/teardown revokes authority. Host context callback
currently applies styles; it is not an actor/connection-authority signal.

Picker query/context/IME/dismiss/selection invalidations guard success, rejection
and finally independently. Wire those into the shared controller's record/object/
field/action/revision/provider/policy/connection lifetime. A renderer rebuild must
dispose detached picker timers/listeners and retain drafts/selections deliberately;
no old dropdown callback may act after switching. Disable picker during Review,
Confirm, pending recovery and disconnect. Search correlation must not compete with
transition request generation or set the whole editor busy. Unfinished replacement
must block Review rather than silently becoming clear on blur. Recovered ID drafts
need authorized current labels or an unresolved-draft state; never fabricate a
label or authorize a stale retained selection. Preserve Unknown/recover/status,
completion receipt and refresh-failure behavior in the one existing controller.

## Dependency graph and safe minimum patch sequence

`exact supported API67 evaluator + live freshness proof` -> `qualified provider`
-> `native capability + selected-ID canonicalization/review/locked-confirm`
-> `interaction-bound search adapter + strict public contract`
-> `picker presenter in existing renderer/controller + existing resource build`
-> `combined native regression` -> `both actual hosts + independent read-back`.

Ready independently: reconcile frozen transport/descriptor types; specify strict
decoder adapter and stale-lifetime tests; preserve/copy reusable component assets;
qualify default-unavailable provider tests with owner-run API67 checkpoint; keep
unsupported-reference exclusions covered. These can remain disabled contributions.

Blocked: any enabled REFERENCE descriptor/search/selection/write until exact
native restriction/special-rule evaluator and fresh acquisition contract exist.
Sibling native-contract research reports that API67 ConnectApi.RecordUi exists
but the documented surface only establishes `getPicklistValuesByRecordType`,
not a native lookup evaluator. Its HTTP UI API lookup findings require source
record/controlling input, document TypeAhead minimum3 versus the frozen picker2,
and do not establish exact selected-ID membership validation. See that sibling's
final contract/evidence for primary-source details; these are not positive provider
qualification by this inventory. Null describe filter information,
absent retrieved XML, stored snapshot hash, generic Name search and successful DML
do not establish native eligibility. No self-REST/session forwarding, new auth/
Named Credential route, unfiltered fallback or second engine is authorized.

After that gate, root delivers one coherent integration milestone covering provider
qualification, capability/canonicalization/freshness, app-only search, strict
browser adapter/presenter and resource packaging. Use focused development checks
while implementing, then one consolidated review and native regression; repeat
or broaden verification only when new changes, failures or unresolved risks
justify it. Reuse current
permission/inventory preparation and add exact allowlisted grants/components/test
identities. Do not replace entire permission sets or bypass checkpoint inventory.

## Focused verification ownership

| Gate | Distinct tests/evidence required |
| --- | --- |
| Component | Existing 70 picker/harness tests plus explicit shared adapter tests: descriptor translation, result nonce/revision/fingerprint mismatch, missing authorized label, unfinished replacement, retained disabling, teardown/detached callbacks, concurrent search versus transition. Run canonical `tests/record-fields.test.cjs`, `record-ui.test.cjs`, `opportunity-ui.test.cjs`, `opportunity-protocol.test.cjs`; do not import standalone harness lifecycle as production. |
| Provider API67 | Compile/run `CardstackNativeLookupProviderTest` and real positive provider tests; prove malformed IDs never leak exceptions, source/field type/access, target access/sharing, restrictions/special semantics, Unicode/query escaping, candidate/result limits and live metadata/control drift. Fixture construction must reach the provider in each claimed denial test. |
| Search adapter | New focused native tests for strict args, app-only visibility, actor/org/client/setup/revision/expiry/status mismatch, caller-source rejection, authorized display projection, safe errors; prove no revision/grant/write/audit mutation. Existing `CardstackLookupSearchActionTest` tests a different contract. |
| Reviewed write | Extend canonical `CardstackRecordScreenCapabilityTest`, generic/direct record/service/repository/write/audit suites: selected-ID tampering, disallowed clear, same-name distinct IDs, fresh Review, stale provider/policy/source/control/target between Review and Confirm, full18 identity, repeat Confirm, no-op, cancel, audit/completion rollback and interrupted-save recovery. Run complete Apex suite before release. |
| Build/resource | Existing content-addressed resource tests (`CardstackEditorUiResourceTest`, adapter/protocol tests and checkpoint inventory tests), bundled icons/CSS/CSP, byte/digest parity, no static private data or network dependency. Stage exact artifact using existing checkpoint tooling. |
| Actual Claude and ChatGPT | Each host must demonstrate actual HTML/bridge discovery, fixed app-only search behavior/approval denial, responsive/light-dark presentation, keyboard/IME/duplicate-name selection, optional clear/required replacement, Review exact ID-bound diff, Back/Cancel, Confirm one save/receipt, independent Salesforce read-back, refreshed card, late search after record/field/context switch, disconnect/reload recovery and stale target/provider/policy rejection. Synthetic component success or protocol-only calls do not prove these. |

Root owns native runs/deployments and actual-host fixture/read-back work. This
inventory performed no browser use, org/auth change, deployment or credential read.
