# Studio admin experience verification — October 13, 2026

Local source checkpoint; combined-source deployment and native/host acceptance remain pending under Editor Chat. This report makes no release or deployed-behavior claim.

## Completed prefix

Completed initial prefix `cd58b8442290022b85db5afb03a80b7a948582dd`; final reviewed product source `dae0483`, branch `codex/studio-admin-experience`, baseline `e761020b200feb5811fce1dc40918cb78f9d15be`. The task ledger records reviewed retirement, semantic comparison, reviewed publishing, admin gate/overview, navigation/setup, list-policy backend and guided authoring. L2 declarative list editing was committed as `7aae9f4`, followed by fix `aa8f172` for a reproduced parent/child leave race. The whole-branch review then found retained-editor refresh and two UX gaps. Fix `dae0483` addresses publication/discard refresh, configured-first Overview and friendly review names. Final scoped re-review approves source integration with the manual-list-retry limitation below. The fresh final local run passed 378 tests with zero failures/skips; all 11 final-wave LWC files compiled at API67 with zero warnings.

| Check actually run on completed prefix | Result | Limit |
| --- | --- | --- |
| Complete local Node suite with existing widgets dependency paths at dae0483 | 378 passed, 0 failed/skipped | Model/DOM fixtures; no Apex or native Lightning execution |
| E4 focused behavior suite | 114 passed | Authoring/recovery behavior in local harness |
| Affected LWC compile at API 67 | 25 files, 0 errors/warnings | Compiler acceptance; no rendered keyboard/theme/focus proof |
| Consolidated Recommended analyzer at aa8f172 | 485 findings: 7 High, 145 Moderate, 324 Low, 9 Info. Exact starting-source comparison: 369 findings, 13 High. All seven remaining High findings match baseline sites; no introduced Critical/High identified | CPD cannot tokenize ConfigDiff; inherited React detection warning. Static analysis is not authorization/runtime proof; final review triaged retained sites; final-wave delta has the same two inherited Moderate/Info findings and zero Critical/High |
| Source reviews | All task reviews approved; whole-branch findings fixed and scoped re-review approved | One disclosed Minor retry limit; native acceptance pending |

The existing-org baseline Apex run recorded earlier in the ledger exercised previously installed source only. It does not prove any source introduced on this branch.

## Owner-coordinated acceptance dependencies

| Gate | Required evidence | Current disposition |
| --- | --- | --- |
| Combined source and deployment | Frozen merged revision, complete artifact, verified persistent target/access, API67 compile/deploy receipts and cleanup | Editor Chat owns; owner verified cardstack-spike2 as persistent and existing REST/SOAP metadata-read access; combined checkOnly/deployment remains pending |
| Apex regression | Complete relevant source classes/method counts and coverage; explicit admin/ordinary-user, policy, stale/review and retirement fixtures | Authored but unexecuted on new source; installed-package exclusion means RunLocalTests alone may be insufficient |
| Native admin Studio | Overview → Setup; default object layout; fields/restrictions/actions; declarative lists; save → semantic review → publish; exact test handoff; Activity | Pending combined deployment |
| Native interaction/recovery | Keyboard reorder, modal Escape/focus, narrower desktop/theme, unsaved navigation, stale review, partial publish, delayed/unknown save recovery | Local behavior tests exist; native rendering pending |
| Ordinary-user and advertised hosts | Denied admin entry; Home discovery/cached retirement; hidden direct/fuzzy lists; honest allowed fallback; governed edit/confirm/receipt/independent read-back/refresh in Claude and ChatGPT separately | Pending owner-coordinated acceptance; admin metadata is not another user's access proof |
| Package installation/upgrade | Unpromoted core staging without per-org setup; fresh install and beta upgrade; retained globals and separate companion retirement disposition | No install/upgrade run yet; only specific required tests may use owner-coordinated temporary orgs |

Temporary records/configuration must be restored after coordinated QA. Preserve working auth and host connections; do not run competing deployment or browser/security sessions. No separate object-specific renderer or save engine is introduced by this workstream.

## Integration preparation

The existing package manifest omits multiple dependencies, including newly introduced admin gate/list classes and LWC modules. Build a complete reviewed combined artifact; the package builder includes packageable families but local staging does not establish installation or upgrade success.

See [integration handoff](STUDIO_ADMIN_INTEGRATION_HANDOFF_2026-10-13.md) and [task ledger](superpowers/plans/2026-10-13-studio-admin-experience-ledger.md) for contracts, reviewed commit ranges and retained findings. This report will be updated after the local final milestone; owner-supplied deployed proof must identify the combined revision rather than attributing another source version's results to this branch.

## Final source disposition

Source integration approved after one final correction and scoped re-review. Retained record/list/flow editors now refresh affected published/discarded keys through existing fresh reads and preserve working inputs, unknown-save guards and exact publication identities. Local component additions are ObjectConfig/FlowConfig `refresh(keys)` and `refreshPending()`, FlowWizard `leaveReady`, and shared StudioKeys `studioConfigLabel`. No Apex method signature or runtime save engine changed in that correction.

Nonblocking limit: if the list child catches a saved-state read failure, the parent clears its retry key, so returning to the tab does not automatically retry. The error remains visible and inputs remain intact; use **Refresh saved state and choices**. Include that explicit recovery in native acceptance.

Existing analyzer findings remain disclosed rather than described as clean: describe-resolved/bound user-mode ListView query warning, gated Organization/Flow metadata-query warnings, inherited empty-catch observability, and test/complexity/style findings. These received source triage; actual query/access behavior remains an owner native gate.
