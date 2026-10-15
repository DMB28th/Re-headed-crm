# Cardstack materials and source coverage

> **Current status — October 15:** Case editing, explicit record discovery, related-list navigation and controlled recovery/stale-result checks passed in both hosts; combined source is `a9a304e`. Flow OAuth and managed user/org verification succeeded; Studio acquisition/compilation is being tested. Lookup remains unsupported. See [overnight progress and current evidence](OVERNIGHT_PROGRESS_2026-10-15.md). Earlier inventory and test results below retain their dated scope.


Review date October 14, 2026. This index separates current deployment evidence, historical product requirements and research proposals. It accompanies the [project documentation](PROJECT_DOCUMENTATION_2026-10-14.md); it does not establish universal access to every conversation or private document.

## Source locations

| Location | Role and reviewed coverage |
| --- | --- |
| Current checkout `original main checkout`, main `451ba21` | Root instructions, README, CLAUDE, PLAN, package scripts and design guide; native source, readme, beta guides, mapping/action docs and legacy-gap audits. Contains the earlier HXL baseline and existing uncommitted documentation. |
| `integration worktree`, `codex/cardstack-integration` | Current integration code, deployment and QA receipts, configurable scenarios, persistent record workspace, installation/auth, runtime/Studio evidence and native lookup qualification. HEAD at initial inventory: `b55db76`. Deployed application identity is recorded separately. |
| `Studio worktree`, `codex/studio-admin-experience` | Admin authoring workstream. Review its handoff and integration evidence before treating isolated source changes as deployed. Initial inventory HEAD `1fbc89b`. |
| `lookup worktree`, `codex/dynamic-lookup` | Lookup research and implementation workstream. A picker UI or successful native suggestions is not proof that reference editing is authorized. Initial inventory HEAD `94035dd`. |
| `local historical handoff outputs` | 28 historical Markdown handoff outputs screened by title and opening scope. Several duplicate the native repository audits/specifications; October 5–8 findings preserve earlier decisions, not October 14 capability status. |
| Codex and ChatGPT project chats | Reviewed decisions and acceptance reports, with per-chat coverage and access limits in the [chat review index](CHAT_REVIEW_INDEX_2026-10-14.md). |
| Salesforce `cardstack-spike2` | Read-only API67 inventory and source comparison performed by the architecture reviewer. Installed package and source overlay are separate. |
| Connected Railway account | Read-only service/deployment inventory performed by the architecture reviewer. Legacy services remain present despite the Salesforce-only architecture decision. |

The worktree versions above identify discovery snapshots; other project chats may continue work concurrently. Existing dirty files were preserved. Historical detached worktree `quizzical-pike-db3e8c` is a separate source snapshot, not current deployment authority.

## Current evidence to read first

Paths in this table are relative to the integration worktree's `salesforce-native/docs/`. Use a dated receipt and its source/application identity together.

| Material | What it establishes |
| --- | --- |
| `PERSISTENT_RECORD_WORKSPACE_2026-10-14.md` | Application `5275b7e`, persistent shared record workspace, ten-field Lead journeys in both clients, native corroboration and actual-host fault cases still not run. |
| `evidence/configurable-record-edit/persistent-workspace-live-clients-2026-10-14.json` | Sanitized workspace acceptance receipt; separates unchanged native baseline, UI delta, synthetic geometry and real-host evidence. |
| `CARDSTACK_CONFIGURABLE_SCENARIOS_2026-10-13.md` | Configurable action maintenance, scalar type expansion and October 14 Studio/client follow-up. Label, input membership and section order changed through configuration without redeployment. |
| `CONFIGURABLE_RECORD_EDIT_QA.md` | Shared-engine qualification and object/type scope. |
| `CARDSTACK_PERSISTENT_INTEGRATION_2026-10-13.md`, `CARDSTACK_CLAUDE_INTEGRATION_ACTIVATION_2026-10-13.md`, `CARDSTACK_INTEGRATION_CHECKPOINT.md` | Persistent-org integration and activation; supersede earlier disposable-probe cleanup observations. |
| `MCP_APPS_INSTALL.md`, `MCP_APPS_INSTALL_AUTH_QA.md` | Installation/auth procedures and bounded installation evidence. Older staged versions are not a release of the current editor. |
| `STUDIO_ADMIN_INTEGRATION_HANDOFF_2026-10-13.md`, `STUDIO_ADMIN_EXPERIENCE_QA_2026-10-13.md` | Admin source handoff, local verification and disclosed limitations; use later combined deployment evidence for live claims. |
| `STUDIO_LIST_EXPOSURE.md`, `STUDIO_HOME_RETIREMENT.md` | Native list-policy scope and retired Home configuration behavior. |
| `LOOKUP_NATIVE_CONTRACT_2026-10-14.md`, `LOOKUP_NATIVE_QUALIFICATION_2026-10-14.md`, `LOOKUP_INTEGRATION_HANDOFF_2026-10-14.md` | Native access, restriction and freshness requirements; no enabled REFERENCE provider is qualified. |
| `SALESFORCE_IN_AI_UX_2026-10-14.md` | Research/design recommendations. Its persistent-workspace proposal was followed by later implementation evidence; natural-name resolution remains separate. |

## Historical requirements and implementation context

| Material | How to use it |
| --- | --- |
| Root `README.md`, `CLAUDE.md`, `PLAN.md`, `package.json` | Historical Node/Next.js product and commands. Root claims about HubSpot, accounts, Postgres, hosting or milestone completion must not be transplanted into native status. |
| `design/README.md`, `design/Cardstack Designs.dc.html` | Product intent and annotated design mockups: cards, before/after review, list resolution, Studio, flows and custom screens. The canvas is a prototype, not deployable runtime proof. The design guide was reviewed; pixel-by-pixel canvas QA was outside this documentation task. |
| `docs/flow-rendering-spike.md`, retired `packages/core` and `packages/widgets` | Historical bounded TypeScript interpreter and generic rendering model. Evidence of an old implementation does not prove an Apex port or full Salesforce Flow semantics. |
| `docs/accounts-and-workspaces.md`, `docs/studio-staging-model.md`, `docs/confirmation-provenance.md` | Retired infrastructure/governance concepts; useful rationale with implementation-specific differences. |
| `docs/superpowers/specs/force-com/` | Earlier migration decomposition. Plans describe intended work; current source and later receipts establish delivered scope. |
| Native `package/UNLOCKED_PACKAGE.md`, `package/BETA_VERIFICATION.md`, `docs/RECORD_ACTIONS.md` | Beta 0.1.0.8 packaging and HXL/mapped-action milestones. Current development source overlays that installed package. |
| Native October 5–8 options, HXL, renderer and interpreter audits | Earlier feasibility boundaries and migration rationale. Avoid retaining obsolete absence claims after newer deployed/client evidence. |
| Native `docs/superpowers/specs/` and `plans/` | Decision and execution history. Checked boxes alone are not client, deployment or package-release evidence. |

## Connected materials search

Google Drive searches for `Cardstack`, `re-headed` and `card-stack` returned no files. ChatGPT Pages searches for `Cardstack` and `re-headed` returned only the unrelated generic **Your guide to pages**, with no continuation and no relevant project material. Those results do not prove the absence of materials in other accounts, unconnected services or private archives. No connected file or Page was changed.

The documentation lives in the native repository's established `docs/` location. No authentication changes, CRM writes, deployments, package releases or legacy-infrastructure deletion were performed for this review.

## October 15 incremental materials

Re-read the updated combined workspace milestone, dedicated Flow/Lookup activation notes and Flow acquisition contract; checked integration history showing `a9a304e`. The combined report now supplies actual Case, related paging/navigation and controlled fault results. Its Flow-credential-pending wording predates the newer owner message confirming authorized same-user/org managed access. Use [overnight progress](OVERNIGHT_PROGRESS_2026-10-15.md) to reconcile these sources. Salesforce and Railway live inventories were not repeated.
