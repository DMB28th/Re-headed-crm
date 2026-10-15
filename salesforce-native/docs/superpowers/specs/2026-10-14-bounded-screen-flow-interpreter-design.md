# Bounded metadata-derived Screen Flow interpreter

Status: architectural proposal and planning handoff, October 14, 2026. No product implementation, deployment, published configuration, Flow execution or actual-host proof is claimed by this document. User authorization covers preparing this concrete design; the written architecture and execution plan still need review before broad implementation. Root owns shared editor/controller/writer/schema integration, commits and live gates. Interpreter worker owns this new document and interpreter-specific artifacts only.

## Intended outcome

An admin explicitly publishes a supported Salesforce Screen Flow process. An ordinary connected user completes two real metadata-derived screens in the existing chat record workspace, navigates Next/Back/Cancel/Resume, reviews the exact resulting current-record patch, and confirms one atomic user-mode update. Durable audit, receipt, replay and refresh reuse the native lifecycle. This is a supported Cardstack interpretation of metadata, not Salesforce's full Flow engine or execution permissions.

The current record editor is a finite edit/review/confirm process. `CardstackFlowStartAction` and `CardstackFlowContinueAction` are launch cards, not interpreters. The legacy `packages/core/src/flow-{capabilities,analysis,interview,expressions}.ts` files are read-only conceptual/fixture references. Their client-carried state, permissive analysis, arbitrary answer merge, partial fallback, loose formulas and mutation executors must not return.

## Approaches and recommendation

1. **Immutable compiled plan interpreted in Apex (recommended):** compile and publish metadata in Salesforce; keep cursor/variables/checkpoints/private authority in Apex; adapt supported screen descriptors to the existing workspace. It requires explicit state and capability seams but preserves the existing security and writer boundary.
2. **Generate a fixed form from Flow metadata:** simpler presentation, but cannot faithfully support two-screen decisions, Back or visibility and would repeat the present finite editor rather than meet this outcome.
3. **Port the old TypeScript runtime into the iframe or a Node service:** substantial apparent reuse, but incompatible with Salesforce-only hosting and server ownership. Excluded by the established project direction.

## Ownership and reuse

| Source | Reuse | Required integration boundary |
| --- | --- | --- |
| `CardstackOpportunityEditTypes` | FieldView, Choice, DiffRow, FieldError, CanonicalPatch, Receipt, exact review binding | Distinct state tag and Flow payload; screen inputs are not CRM field names |
| `CardstackOpportunityEditRepository` | Random opaque handles, actor gates, setup/interaction/confirmation lock order, private state, exact grant, completion | Strict codec for a new family; no existing schema reinterpretation |
| `CardstackOpportunityEditService` | Published context, expiry, drift, review/back/cancel/resume concepts | Flow transitions come from compiled graph and checkpoints |
| `CardstackRecordScreenCapability` | Describe/CRUD/FLS/policy intersection, scalar canonicalization, record freshness and existing native providers | Published Flow action cannot impersonate a `record-edit` action; add a terminal capability adapter |
| `CardstackOpportunityWriteService` | The single `Database.update(target, AccessLevel.USER_MODE)` path, required audit, stored receipt and replay | One reviewed-terminal-context seam; no new object-specific writer |
| `ui/opportunity-edit/{fields,layout,view,workspace,controller,record-contract,adapters}.mjs` | Checked scalar controls, flat sections, persistent workspace, recovery, diff/receipt | Versioned Flow view adapter plus server navigation buttons; do not send graph or computed resources |

Current persisted generic record state is schema 4 / `record-edit/v3`; repository restoration accepts only schemas 1–4. Proposed schema 5 is `kind=screen-flow-v1`, `processVersion=screen-flow/v1`, with a strictly typed `flowState` member and the existing base record/actor/policy/setup/review/completion bindings. This proposal requires root review; it is not a compatibility claim. Never load schema 5 as schema 4, silently discard unknown properties, or deserialize caller-selected SObject types. Historical state/resource recovery remains governed by its registered codec and archive contract.

## Metadata and normalized plan contract

Metadata acquisition/publication is owned by the metadata workstream; see [the acquisition contract](../../FLOW_METADATA_ACQUISITION_CONTRACT_2026-10-14.md). Proposed names agreed at the planning boundary:

- `schemaVersion = cardstack-flow-plan/1`, `compilerVersion = cardstack-flow-compiler/1`.
- `identity = {definitionId18, versionId18, versionNumber, namespace, apiName, apiVersion:'67.0', sourceHash}`.
- `publication = {revision, planHash, policyRevision}` plus the existing published action binding.
- `entryNode`, ordered `nodes[]`, typed scalar `resources[]`, and a declared terminal update field set.
- Resource origin is `INPUT`, `CONTEXT` or `COMPUTED`; no collections. Context contains the immutable current record and approved readable snapshot. Input identifiers cannot shadow context, node names, computed resources or CRM identity.
- Operands are discriminated `literal`, `resource` or `currentRecordField`, always with a declared scalar type. Resolve only declared references. No dotted arbitrary property traversal.

`sourceHash` binds canonical acquired metadata. `planHash` binds canonical normalized identity, compiler/schema versions, graph, resources and effect semantics; exclude the publication block to avoid self-reference and publication-revision cycles. Ordered node/rule/input arrays retain semantic order; unordered maps canonicalize by sorted keys. A hash is an integrity binding, not authorization. Publish revalidates the subset and native/policy intersection; drafts never launch. The server stores exact private version identities; public receipts may name safe publication revision/hash without private Flow identities.

Acquisition and immediately-before-publication checks pin the exact active version and source. Runtime loads that immutable published plan by trusted action binding and checks current Cardstack publication/policy revision, stored identity/hash/schema/compiler integrity, native permissions and providers. Runtime does not call Tooling or silently resolve a newer native active version. External Salesforce active-version changes leave the explicitly published imported plan pinned until admin refresh/review; Studio shows the mismatch. A Cardstack publication/policy change returns Conflict for active runs before traversal or confirmation. Native fallback may start a different currently active Salesforce version and must say so. The acquisition workstream must first prove its authorized Salesforce-native transport; no browser metadata API access, Node acquisition service or extracted tokens. Exact CLI acquisition proves only its admin lane, not native Studio acquisition.

## First supported subset

The first coherent implementation contains at least one two-screen metadata fixture and exactly one terminal update. General configured limits are small and explicit:

| Construct | Contract |
| --- | --- |
| Start | Exactly one resolvable start connector; ambiguous/missing entry fails compilation |
| Screens | 1–8 screens; scalar InputField/LargeTextArea, static single-choice dropdown/radio mapped to shared select, plain DisplayText, RegionContainer/Region |
| Scalars | String/Textarea, Boolean, Integer, Decimal/Currency, calendar Date; no DateTime in v1 |
| Sections | Flatten verified region tree to existing layout v1 sections, 1–2 columns, maximum depth 4; unsupported layouts reject rather than silently rearrange |
| Defaults | Typed literal, approved current-record scalar or previously accepted resource; evaluated on first screen entry only |
| Assignments | Typed SET only, targeting a declared COMPUTED resource; no Add/Subtract, context/input reassignment or output collection |
| Decisions and visibility | Ordered decision rules; predicate ALL/ANY of at most 8 atoms; EQ/NE/IS_NULL/GT/GTE/LT/LTE over compatible declared scalars; Boolean EQ supports checkbox visibility |
| Logic | Only precisely normalized simple metadata AND/OR; numbered or nested formula logic rejects. Matched terminal outcome terminates; it must not fall through to default |
| Effects | Exactly one declared terminal CURRENT_RECORD update; no filters, dynamic record ID, lookup-derived target or subsequent nodes |
| Choices | Literal, unique, bounded API values; existing native picklist provider only where a record-bound supported descriptor explicitly uses it |
| Text | Escaped plain text, 256-character labels; no HTML interpolation, arbitrary links, scripts, CSS or rich text in v1 |

Reject the entire plan before starting for loops, subflows, record lookups/collections/processors, custom LWCs, component extensions, uploads/passwords/repeaters, waits, action/Apex calls, arbitrary formulas/templates/globals, system-mode Flow execution, create/delete, multi-record updates, fault connectors, nonterminal effects and unknown semantic metadata. Explicitly ignore only compiler-registered cosmetic metadata. Unrecognized semantic keys are blockers, not guessed defaults. The full plan is validated, including unreachable source constructs; no later partial-support surprise.

Published policy can narrow native access, never enlarge it. A Flow marked for system-mode execution is unsupported by this interpreter; the ordinary native Salesforce fallback may have its own Salesforce semantics, visibly separate from Cardstack.

## Screen answer and visibility semantics

A screen input has `inputId` and its own scalar descriptor; the terminal compiler binding maps resource values to authorized CRM fields. The presentation adapter may project `inputId` into the existing control's `fieldApi` key internally so shared controls can render; this key is never a CRM field target. Review rows use actual authorized CRM field names, independent of input keys.

Every Next submission is a strict list of `{inputId, operation:'set'|'clear', value?}` for only the current screen. Omission preserves the last accepted value or first-entry default; clear is explicit and allowed only by descriptor/policy. Unknown, duplicated, protected, previous-screen or computed keys fail the whole request. Reject values on non-answer operations. Validation is server-owned even when browser helpers provide early feedback.

Server coercion preserves exact decimal strings/zero/false/empty text, strict valid calendar dates and static choice membership. Native terminal bounds and published policy further restrict values. Null, omitted, empty String and false differ; required Boolean means a present Boolean, not necessarily true. Required visible strings cannot be blank. Excess scale/precision, exponents, non-finite/grouped numeric strings and unsupported types fail without rounding. Browser formatting may remove permitted grouping only before submitting its literal; Apex does not infer locale.

For same-screen visibility, the compiler builds an acyclic dependency order between screen inputs. Server processes all candidate answers, evaluates predicates in that order, then enforces **CLEAR hidden answers**: an input becoming hidden has null effective resource and no terminal patch contribution, even if a previous accepted value/default exists. A submitted hidden key is rejected and returns a refreshed server projection; no hidden value is trusted. Cascading visibility uses cleared effective values. Only visible required inputs are validated. Reject cycles, computed same-screen references and metadata demanding retained hidden values or incompatible revisit semantics. State stores allowed answer presence separately from defaults/null so hidden clear cannot accidentally reinstall its default during the same visit. A resource also carries provenance/presence: SET from a HIDDEN/ABSENT resource propagates absence; terminal assignments derived from it are omitted. Explicit allowed clear has CLEAR presence and produces null. Predicates can inspect the effective null without reactivating hidden stale values.

Browser receives no predicates. To support immediate same-screen reveal without granting authority, an optional `answer` transition persists validated current-screen partial answers, recomputes visibility and returns the projection; it does not traverse, require all visible required fields, mint a grant or write CRM. It increments revision, uses the same size/budget rules and is serialized/debounced by the shared controller. Next runs full required validation. The first fixture can use cross-screen visibility, so `answer` is a separately reviewable implementation task; without it, UI labels explain that Next updates visibility.

## Apex state and transitions

Private `FlowState` stores plan/publication/version bindings, current node, canonical resources with origins/types, accepted screen history/checkpoints and visible input IDs. No frames, cursor, targets, policy or computed variables arrive from the client. Proposed pure interfaces:

```text
CardstackFlowPlan.validate(Plan plan) -> ValidationReport
CardstackFlowEngine.begin(Plan plan, TrustedContext context) -> EngineState
CardstackFlowEngine.apply(Plan plan, EngineState state, ScreenAnswers answers, String operation) -> EngineResult
CardstackFlowEngine.project(Plan plan, EngineState state) -> ScreenProjection
CardstackFlowEngine.terminal(Plan plan, EngineState state) -> List<FieldChange>
```

These signatures are conceptual typed Apex interfaces to pin before implementation. The engine has no SOQL/DML/tooling/clock/current-user calls; service supplies trusted time/context and repository persists its result. `terminal` emits proposed field changes only, never an executable SObject or target identifier. A root-owned adapter rebuilds the current generic terminal capability and canonical patch using existing native providers.

| Operation | Server behavior |
| --- | --- |
| Start | Revalidate published supported plan/actor/record; seed protected context; walk to first screen; persist Editing revision 1 |
| Answer (optional) | Accept current-screen partial values, authoritative visibility recomputation; persist same cursor at revision +1 |
| Next | Validate current visible answers; apply typed assignments/decision traversal up to next screen or terminal proposal; persist revision +1 |
| Back from Editing | Enforce screen metadata allowBack; restore preceding authoritative checkpoint and discard downstream inputs/computed values; recompute that screen |
| Back from Review | Invalidate grant, restore last screen checkpoint with last accepted screen answers; clear reviewed patch; Editing revision +1 |
| Cancel | Revoke grant, clear draft resources/checkpoints and proposal; Cancelled; zero CRM mutations |
| Resume | Actor/access/bindings/expiry check and authoritative projection; cannot extend absolute expiry or silently approve a different patch |
| Confirm | Current exact review/grant/revisions only; delegated shared writer locks/revalidates/updates/audits/completes once |

A checkpoint records screen-entry resource values and accepted answers needed to revisit that screen. Back to an earlier screen retains that screen's prior accepted answers, restores computed state at its entry and drops all later screen answers/checkpoints. Re-running Next recomputes downstream assignments/branches from the corrected earlier input. Never preserve obsolete downstream values across a branch change. Back cannot undo a completed effect; Completed only offers receipt and refresh.

At terminal arrival the service evaluates exactly the declared field assignments, excludes cleared hidden-input contributions, canonicalizes against current record/policy/provider context, and enters shared Review. A zero-change patch completes with `noChanges`, no grant/audit save/CRM DML. A nonempty patch mints the exact shared grant. Back, Answer, Next, Cancel, expiry or drift invalidate any previous grant.

## Confirmation, privacy and recovery

The grant subject includes all existing actor/org/client/record/action/policy/setup/freshness/native-provider/currency/review/expiry/patch bindings plus planHash, sourceHash, publication revision, compiler/schema version and Flow-state digest. Grant creation follows server canonicalization only. Confirm does not accept answers, a cursor, graph, record, policy, effect or patch.

Reuse setup → interaction → confirmation → CRM record lock order. The shared writer reconstructs canonical typed values from the stored terminal proposal and exact pinned bindings, validates the locked current record, performs the one complete USER_MODE update, persists required audit and receipt in the same transaction, and returns the completion. Audit/receipt failure rolls back the transactional update. Salesforce automation at confirmed save may have nontransactional effects; this design does not promise universal rollback. Review and navigation perform zero trial CRM DML.

Raw handle/grant appear only in result `_meta` and host-mediated app arguments. Keep them out of public structuredContent, model text/context, DOM, logs, storage and receipts. Screen projections expose only visible authorized values, display text, sections, navigation availability and revision. Do not send protected context or full plan. Recheck rights before returning draft or completed values; losing access denies rather than leaking historical data. Safe errors carry input IDs/codes, not raw private values/identities.

Duplicate Confirm and Resume after completion return the stored receipt without another write, after current actor/access checks. Existing repository source retains completed state beyond edit expiry but contains no cleanup schedule/retention days; do not invent a retention SLA. Follow current archive/recovery lifetime, then explicitly design cleanup before publishing a retention claim. Active state has a 15-minute absolute deadline. Lost confirmation response is Unknown until Resume/status resolves it; a refresh failure after known save shows the durable receipt and retry-refresh without retrying the write.

Version/publication/schema/compiler/native context drift or expired active state disables mutation. No silent migration/merge. Native fallback is a **new Salesforce interview**, offered only before interpreter CRM side effects and clearly requiring user launch. It carries approved original context only, never interpreter cursor/hidden draft/confirmation. Runtime budget or corrupt-state failure stops fail-closed; starting native execution is never an automatic continuation of an uncertain saved outcome.

## Budgets

API 67.0; Salesforce-only runtime; no org changes from this planning work. Maximum 64 KiB normalized plan, 32 graph nodes, 8 screens, 20 inputs per screen, 40 scalar resources, 4 region levels, 8 atoms per predicate, 20 terminal CRM fields, 32 automatic nodes traversed per request, 16 KiB serialized transition arguments and 32 KiB private serialized state. Existing ingress limits remain tighter where applicable. Labels 256 chars; scalar wire values 4096 chars or stricter native bounds. Reject before mutation/state persistence when any budget exceeds its bound; never truncate.

Graph cycles are rejected at compilation; traversal still enforces visited-node/step guards defensively. Check state size before grant issue and after checkpoint changes. Providers resolve once per context phase, never per input in a loop. Pure traversal performs zero queries/DML. The service's query/DML counts reuse bounded shared context phases; resource/node counts cannot cause SOQL/DML growth. Distinct governor tests vary 1 versus 32 nodes and prove no extra business reads/writes during pure navigation, alongside a separate exhausted-budget test.

## First fixture and acceptance

Create a clearly synthetic **Salesforce-shaped raw metadata fixture**, then compile it without a hand-built normalized shortcut: screen `ChooseDetails` collects `ChangePhone` Boolean and String `ProposedName` defaulted from current record Name; screen `PhoneDetails` has a Details region and `ProposedPhone` String visible/required only when ChangePhone is true, defaulted from current record Phone; terminal update maps ProposedName and visible ProposedPhone to CURRENT_RECORD Name/Phone. Use Account only as the first fixture target, not as an object-specific controller; native eligibility and published policy still decide runtime availability.

A real acquired supported two-screen definition and actual-host proof are separate gates; the known active probe must not be relabeled as positive two-screen interpreter evidence if it lacks this structure.

Behavior tests prove:

- Compiler detects duplicate/missing references, unreachable unsupported constructs, cycles, forbidden effect targets, malformed logic, system-mode metadata and unsupported retention semantics before start.
- Two-screen raw metadata compiles; no CRM update at Start/Answer/Next/Back/Review; empty/false/zero survive canonical resources; required hidden Phone contributes nothing.
- Default set once; Back changes ChangePhone from true to false, removes old phone and downstream computed state; Cancel/Resume do not revive it.
- Tampering with context/computed/other-screen input, hidden key, unknown properties, malformed date/decimal/choice and oversized state is rejected without cursor movement or grant.
- Cardstack published-version/rights/options/freshness drift after review invalidates authority; active-pointer drift during acquisition/publication blocks publication; external native active drift cannot alter an existing immutable plan; wrong actor/client/grant/revision and expiry cannot write.
- Confirm writes exact reviewed patch once with mandatory audit/receipt; required persistence failure rolls it back; replay/lost response/resume never causes a second CRM update.
- Shared workspace stays present across screens; focus/errors/keyboard/narrow scroll/late-response/reload recovery work in isolated browser tests, then actual ChatGPT and Claude on the exact new artifact.

## Approval boundary and open integration decisions

Review this architecture before product primitives or shared integrations. See the [candidate implementation handoff](../plans/2026-10-14-bounded-screen-flow-interpreter-candidate.md) and synthetic acceptance oracle (local evidence retained by the integration owner; excluded from this PR). Root must accept the schema-5 codec shape, terminal capability/writer seam and whether same-screen partial `answer` belongs in the first slice. Metadata workstream must approve the exact acquisition freshness contract, observed source shapes and canonical plan encoding. These are decisions visible here, not permission requests to recreate auth, provision an org or deploy.

Self-review: distinction from Flow parity and current editor is explicit; input/resource/CRM-field namespaces differ; hidden/default/Back behavior is deterministic; all effects are terminal; exact review/replay/privacy/budget and native fallback boundaries are stated. No legacy service or per-object writer is reintroduced.
