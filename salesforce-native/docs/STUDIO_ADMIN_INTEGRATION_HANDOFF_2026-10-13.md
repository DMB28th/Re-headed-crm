# Admin UX integration handoff — October 13, 2026

Editor Chat owns the combined source baseline and persistent integration org. This workstream has made no org creation, deployment, authentication, host-connection, browser or security-setting changes. The owner verified `cardstack-spike2` as persistent Developer Edition, non-scratch, with no expiry. Existing credentials passed REST and API67 SOAP metadata reads without authentication changes; combined checkOnly/deploy is still pending.

## Source checkpoint

- Worktree: `/Users/danielben-atar/.codex/worktrees/studio-admin-experience/Re-headed-crm`
- Branch: `codex/studio-admin-experience`
- Initial reviewed prefix already merged by owner: `cd58b8442290022b85db5afb03a80b7a948582dd`
- Final reviewed product source: `dae0483`; remaining suffix begins after `cd58b84`: L2 `7aae9f4`, leave fix `aa8f172`, checkpoint docs `a5f5b88`, final refresh/UX fix `dae0483`, followed by final handoff documentation. All original whole-branch findings are addressed; source integration approved with the retry limit below.
- Starting baseline: `e761020b200feb5811fce1dc40918cb78f9d15be`
- Product changes are committed. This handoff/QA/ledger are committed separately. Inspect status before integration; ignored validation tools/reports stay local.

## Completed and checked locally

Home authoring/tool retirement retains upgrade-compatible global types and a no-data retirement response. Unsupported audience authoring is removed without purging history. Semantic review, digest-bound publication, independent pending counts, admin permission gating, six-destination navigation, staged setup, guided authoring, draft leave/recovery guards and list-policy backend/catalog have passed task reviews.

The final local product checkpoint passed 378 local Node model/DOM-fixture tests; L2 focused coverage passed 79 tests. Affected LWC files passed API 67 compiler checks. Scoped analyzer results distinguish unchanged baseline findings; no introduced Critical/High finding was reported. These checks do not establish Apex compilation/execution, native Lightning rendering or host behavior.

## Shared contracts and overlaps

- `CardstackConfigService`, `CardstackStudioController` and tests: supported/default configuration, exact fresh draft review, digest-bound publication, admin-only catalog and noncacheable `getStagingInfoFresh`.
- `CardstackListViewAction`/`CardstackListViewsAction` and tests: published exposure policy restricts connected-user execution; sharing/CRUD/FLS remains authoritative.
- Exposure v1: version 1; `allowAdHoc` defaults false; arrays contain checksum18 `viewId` or canonical `listview:Object:key` targets with Boolean `enabled`. Recognized legacy policy remains unenforced until explicit migration/publication; malformed/unknown explicit policy fails closed. Saved filter records remain separate.
- Studio/ObjectConfig/Flow authoring LWC: native `requestLeave(): Promise<boolean>`, exact confirmed-save `configchange {keys,operation}`, optional confirmed-publish `publishedContexts [{key,draftId}]`. L2 adds the synchronous list-child `leaveReady` getter to guard both editors after asynchronous navigation work. Drafts never authorize runtime execution.
- `Cardstack_Admin` permission set and new `Cardstack_Manage_Studio` permission; `Cardstack.mcpServerDefinition` removes Home discovery. Retained Home invocable compatibility must survive package upgrade.

No separate object-specific runtime engine or renderer was added. Existing shared renderer, Salesforce-owned confirmation, audit and save lifecycle remain the integration target. Full changed-file inventory is available with `git diff --name-only e761020b200feb5811fce1dc40918cb78f9d15be <accepted-head>`.

## Remaining dependencies

L2 declarative list editing and strict policy diff integration are complete and task-reviewed, including delayed parent/child navigation guards. Full local regression passed; whole-branch findings were fixed and scoped re-review approved source integration. Owner-coordinated gates remain: combined-source Apex/native regression, Studio admin/ordinary-user QA, independent Claude/ChatGPT acceptance, and specific fresh-install/upgrade checks. Temporary package-test orgs must stay separate from everyday development and require owner coordination.

No concrete authentication blocker has been reproduced by this workstream. The owner verified the persistent target and metadata read access. The combined candidate checkOnly must still establish deployment access. Existing `package/package.xml` omits several existing/new dependencies; use a complete reviewed combined artifact rather than treating that manifest as the deployment source of truth. The local package builder includes all packageable classes, LWC and custom permissions and excludes per-org setup; staging does not prove installability.

The owner merged the completed `cd58b84` prefix into integration revision `7110134` (source only; not deployed). The shared descriptor contract is `record-edit-eligibility/v1`, produced by `CardstackRecordScreenCapability.describeEligibility(objectApi)` and exposed through the admin-gated controller by the owner. The owner will align inherited object-specific authoring options/validation/readiness with that descriptor. The final exact revision/status handoff identifies the accepted suffix after `cd58b84`; integrate that frozen snapshot, then validate the combined revision.

Existing local analyzer Java runtime shared with owner: `.superpowers/sdd/2026-10-13-studio-admin-experience/java-validation/jdk-21.0.12.1+1/Contents/Home`. Use its absolute worktree-prefixed path for JAVA_HOME and per-command bin PATH; leave the ignored workspace intact while integration relies on it.

Final correction adds ObjectConfig/FlowConfig `refresh(keys)` / `refreshPending()`, FlowWizard `leaveReady`, and shared `studioConfigLabel`. These are reusable local admin component contracts, with existing fresh backend reads and exact publication identities preserved. Record/list/flow states reconcile after publication/discard without overwriting dirty or newer working inputs.

One disclosed nonblocking limit: a caught list-child read failure does not remain in the parent’s automatic retry queue. Inputs/error remain visible; the explicit **Refresh saved state and choices** control retries. Native QA should exercise it. No concrete authentication blocker is outstanding in this workstream; owner checkOnly/deployment and actual native/host/package verification are still required. Git-tracked/untracked product changes are committed; ignored local validation artifacts are intentionally retained for the owner.
