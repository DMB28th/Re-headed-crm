# Studio Admin Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved admin-only Studio experience, retire Home Card, and make published configuration accurately reviewable and effective.

**Architecture:** Improve the existing native LWC/Apex application in three independently testable workstreams: trust/retirement, navigation/authoring, and list-policy enforcement. Reuse current connection verification and governed record editors; use small pure LWC model modules for shared state and diffs. A coordinated verification task closes the work across all three streams.

**Tech Stack:** Salesforce API 67.0, Apex, native Lightning base components, LWC, Node's built-in test runner and existing jsdom dependency.

**Spec:** [Approved scope](/Users/danielben-atar/Re-headed-crm/salesforce-native/docs/superpowers/specs/2026-10-13-studio-admin-experience-scope.md).

## Global Constraints

- Studio and its administrative backend are for Salesforce admins.
- Drafts never authorize runtime changes. Published Studio policy can restrict access, never expand it.
- Preserve connected-user sharing and CRUD/FLS, exact confirmation before CRM writes, freshness checks, cancellation, and repeat-safe completion.
- Use authoritative `salesforce-native/force-app/`; do not reactivate Node/Railway, add accounts, reinterpret Screen Flows, or change proven OAuth behavior.
- Keep default layouts and supported Account, Opportunity, Contact, list, task, and Salesforce flow behavior. Do not extend field-type capabilities as part of this plan.
- Use API **67.0** and checksum18 Salesforce IDs; normalize valid 15-character inputs with `CardstackConnectionTypes.normalizeId`, compare full IDs.
- Preserve configuration/history; no bulk purging, subscriber Apex/type deletion, package promotion, or speculative companion destructive deployment.
- Deployment JWT must end **ON**. Runtime apps and their opaque-token settings remain distinct from the deployment app; use the proven runbook and cleanup verification.
- Preserve historical proof reports; update current capability documentation without rewriting history.

## Review Focus

1. Retained Home drafts or a cached Home tool call must not restore Home functionality or disclose CRM data — Trust Task 1.
2. Malformed/unknown configuration and legacy layout shapes must not become No changes or lose preserved values — Trust Task 2 and Lists Task 2.
3. Concurrent publication, partial batches, or a lost save response must not publish a different review or discard working input — Trust Task 3 and Experience Task 4.
4. A hidden list requested by ID, label, fuzzy name, or saved-list collision must remain restricted for ordinary users — Lists Task 1.
5. Setup history, cached dashboard counts, or admin-visible metadata must not imply verified client access or another user's FLS — Experience Tasks 1–3.

## Baseline and execution order

Create or reuse an isolated managed worktree at **`e761020b200feb5811fce1dc40918cb78f9d15be`**, the current committed delivery source. This includes newer Contact authoring and shared renderer work. The existing delivery checkout contains unrelated uncommitted documentation; do not edit/reset it. Main remains older. The sibling `codex/dynamic-lookup` contains divergent lookup/diagnostic work; do not merge or delete it as part of this task. Integrate these UX commits into the eventual target through reviewed Git operations after verification.

At execution, read applicable AGENTS.md in the new worktree, attach it to this chat, copy the approved scope, audit, removal inventory, and these plan files into it, and commit only those planning artifacts. Record the selected source SHA, branch, worktree, task status, reviewers, and verification evidence in `salesforce-native/docs/superpowers/plans/2026-10-13-studio-admin-experience-ledger.md`. A later ref advance is not permission to silently change the reviewed baseline.

| Workstream | Plan | Execution dependencies |
| --- | --- | --- |
| Publishing and retirement | [Trust plan](/Users/danielben-atar/Re-headed-crm/salesforce-native/docs/superpowers/plans/2026-10-13-studio-trust-retirement.md) | Tasks 1–3 first. |
| Native app experience | [Experience plan](/Users/danielben-atar/Re-headed-crm/salesforce-native/docs/superpowers/plans/2026-10-13-studio-navigation-authoring.md) | Tasks 1–3 after Trust; Task 4 after Lists Task 1. |
| Effective list exposure | [Lists plan](/Users/danielben-atar/Re-headed-crm/salesforce-native/docs/superpowers/plans/2026-10-13-studio-list-policy.md) | Backend can follow Trust; editor follows Experience Task 4. |
| Coordinated release verification | Task R below | All workstream reviews complete. |

Preserve the selected subagent execution method. Dispatch one independently reviewable implementation task at a time; parallelize only work with independent files/contracts. Each task receives its plan, approved scope, global constraints, relevant skills, and consumed interfaces. Apply LWC/Apex/test skills before editing their respective files, meaningful red/green behavior tests, then specification and code review. Do not write implementation during plan review.

## Verified local test command

From the execution worktree's repository root:

```sh
export CARDSTACK_UI_DEPENDENCIES=/Users/danielben-atar/Re-headed-crm/packages/widgets/node_modules
export NODE_PATH=/Users/danielben-atar/Re-headed-crm/packages/widgets/node_modules
node --test salesforce-native/tests/*.test.cjs
```

Planning baseline on `e761020`: **208 tests passed, 0 failed**, October 13, 2026. Without those dependency variables, jsdom resolution fails and `record-ui.test.cjs` also lacks its required dependency path. No product change was needed to run the baseline. Re-resolve the dependency path if the machine changes. This is local model/DOM-fixture evidence, not Salesforce LWC rendering, Apex, or live-client proof.

Run task-local Node files first. Before committing an Apex task, run its scoped analyzer and specified tests in the authorized dev org under API 67.0; capture actual result counts and coverage. Do not assume documentation of prior passing suites establishes current results. Root `pnpm lint` is not a meaningful check; the retired workspace build is not required for these native model tests.

## Task R Release verification and delivery

**Files:** Create `salesforce-native/docs/STUDIO_ADMIN_EXPERIENCE_QA_2026-10-13.md`; update current `salesforce-native/README.md`, `salesforce-native/AGENTS.md`, package guide and relevant current docs only after verified behavior; preserve older evidence.

**Interfaces:** Consumes all workstream contracts and reviewed commits. Produces the QA report and a recoverable branch with package/companion upgrade disposition.

- [ ] **Step 1:** Run the complete local command above; require zero failures and record actual counts. Run `git diff --check` and scoped Salesforce Code Analyzer over changed Apex/LWC; resolve introduced high-severity findings and distinguish pre-existing findings.
- [ ] **Step 2:** In the authorized dev org, validate/deploy the selected source and run `sf apex run test --target-org cardstack-spike2 --test-level RunLocalTests --result-format json --wait 10 --api-version 67.0`. Inspect completion rather than treating a queued run as success. Follow the JWT cleanup rule; do not switch another chat's QA org/configuration without explicit authorization for that target.
- [ ] **Step 3:** Click native Studio as an admin: first-run Overview → Setup; configured/unconfigured object; fields/restrictions/action; save → review → publish; preview/test handoff; Activity filters/details/export. Repeat by keyboard, at narrower desktop width, and in the available native theme. Verify modal Escape/focus return and field reorder without dragging. Test lost-response recovery, a stale reviewed draft, a partial publish, and ordinary-user denial of admin entry points.
- [ ] **Step 4:** With disposable records and separate ordinary-user credentials, exercise advertised clients independently. Verify refreshed discovery omits Home, cached Home calls yield retirement only, hidden lists reject direct calls, allowed lists retain fallback explanation, and supported record edits retain review/confirm/save/independent read-back/refresh. Restore temporary configuration and records; do not claim parity where a client could not be tested.
- [ ] **Step 5:** Stage an unpromoted package with the existing builder into a new directory outside source; verify no per-org credentials enter it. Test a fresh install and upgrade from the installed beta in disposable authorized orgs. Apply the documented companion retirement update without deleting unknown subscriber dependencies. Record whether retained global classes/types are required. Core installation alone is not companion cleanup proof.
- [ ] **Step 6:** Request whole-branch review, address verified feedback, record acceptance coverage and unresolved release limitations, then commit current docs and QA evidence. Use the finishing-a-development-branch skill for integration. Release claims require completed gates; package promotion and unsupported client/install claims remain excluded.

## Scope coverage and plan review

Trust implements accurate review, Home retirement, unsupported audience removal, and draft terminology. Experience implements the six destinations, Overview/Setup, role messaging, guided object readiness, safe drafts, refresh, previews/testing and Activity accessibility. Lists implements declarative controls plus effective published restrictions and legacy preservation. Task R verifies the complete scope, upgrade behavior, and supported clients.

Scope and execution plans were approved by the user on October 13, 2026. The selected method remains subagent-driven development; execute without renewed between-task approvals.
