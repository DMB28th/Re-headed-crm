# Cardstack development memory

Updated October 8, 2026. These are persistent project instructions for future
Cardstack sessions. Apply the skills below to the relevant work; do not load every
skill for every task. Read the selected skill's SKILL.md before using it. User
instructions take precedence over skill defaults and this file.

## Product and source

Make it easy for Salesforce admins to configure CRM experiences that users can
complete inside AI chat. `salesforce-native/force-app/` is the authoritative package
source. `apps/` and `packages/` are retired reference implementations: read them
when evaluating reuse, but do not modify or reactivate them without explicit user
instruction. Keep admin configuration, validation, authorization, confirmation,
and durable interaction state in Salesforce.

## Skills to use consistently

| Work | Required skill guidance |
| --- | --- |
| New features or architecture changes | `superpowers:brainstorming` before implementation; `superpowers:writing-plans` after an architectural spec is approved |
| Implementation from an approved plan | `superpowers:subagent-driven-development` is the user's selected execution method; follow its task briefs, ledger, task reviews, and final review |
| Isolated feature implementation | `superpowers:using-git-worktrees`; inspect existing attachments/checkouts before creating another |
| Product code or bug fixes | `superpowers:test-driven-development`; choose tests that establish behavior rather than mirror implementation |
| Bugs, failed tests, unexpected platform behavior | `superpowers:systematic-debugging` |
| Apex services, invocables, REST endpoints, or Apex review | `platform-apex-generate` |
| Apex test creation, corrections, or coverage work | `platform-apex-test-generate` |
| Studio Lightning Web Components | `experience-lwc-generate` |
| Custom MCP App HTML resources, tool metadata, and host bridge | `add-app-to-server` |
| Salesforce API/platform facts and difficult documentation retrieval | `platform-docs-get`; ground claims in current official documentation |
| Code analysis, including the Apex skill's validation step | `dx-code-analyzer-run` |
| Completing substantial code changes | `superpowers:requesting-code-review`, then `superpowers:verification-before-completion` before success claims or release |
| Integration after verified implementation | `superpowers:finishing-a-development-branch`; preserve integration authorization already given by the user |

Use `superpowers:receiving-code-review` when acting on review feedback. For a task
that cannot use the selected subagent workflow, explain the concrete limitation
and use `superpowers:executing-plans` when appropriate. Documentation-only memory
updates do not require a feature implementation process or product test suite.

The five installed Salesforce skills are pinned to forcedotcom/sf-skills revision
`e5164d94d7511c00fa02a5b8b60754b2361e178f`. The installed MCP Apps skill is pinned to
modelcontextprotocol/ext-apps revision
`82221c0c8ce7661efa6771c9d461511b1650495f`. Review upstream changes before updating.
Skills are guidance, not proof a capability exists or permission to deploy/publish.
Apply Cardstack-specific constraints instead of generic API or hosting defaults.

## Platform invariants

- Working org: `cardstack-spike2`. Use API **67.0**; this org rejected 68/69.
- JWT must end **ON** after every deployment session. Before an API 67 SOAP
  Metadata deploy, disable JWT on Card Stack SFAPP and obtain a fresh opaque-token
  CLI login. Restore JWT in a cleanup/finally step and verify restoration.
- Never print credentials, token files, Salesforce session IDs, private interaction
  keys, or confirmation tokens. Do not embed them in static HTML resources.
- Salesforce reads/writes execute as the connected user with sharing and CRUD/FLS
  enforced. Published Studio policy can restrict access, never expand it.
- Exact submitted values, actor, record, published policy, review revision, expiry,
  and freshness must bind confirmed writes. Preserve cancellation and repeat-safe
  completion. Drafts do not authorize execution. There is no delete-record tool.
- Do not depend on undocumented Aura/Screen Flow runtime endpoints. An interpreted
  subset of flow metadata is not equivalent to Salesforce's full Screen Flow engine.
- Keep runtime hosting in Salesforce unless the user approves a different hosting
  architecture. Do not restore Node/Railway, custom accounts, or Postgres by default.

## Current decisions and proof boundaries

Updated October 15, 2026 for GitHub reconciliation of verified source `a9a304e`.
The whole runtime remains Salesforce hosted; Railway is retired architecture.
Keep native Apex execution/state and Studio. HXL beta 0.1.0.8 is retained for
compatibility during the selected migration, not the custom editor scope ceiling.

The combined developer QA milestone passed actual Claude and ChatGPT Case editing,
explicit record discovery/choice, related pagination/child/parent navigation,
controlled lost-Confirm-reply recovery and stale related-page rejection. Normal
local resources were restored, but that is not a claim of ordinary-resource cutover
in the org. Controlled SDK delivery faults do not prove natural network outage or
full-page reload recovery. See docs/OVERNIGHT_PROGRESS_2026-10-15.md and the combined
milestone for exact backend, renderer, deployment and client evidence.

A bounded native Flow interpreter foundation is built. Dedicated per-user Flow
OAuth and actual managed user/org identity verification succeeded in the owner
chat; Studio metadata acquisition/compilation is under test. Successful Flow
publication and interpreted host journeys are not yet proved. Reference lookup
remains unsupported pending separate product/access/backend qualification. No
fresh-install/release claim for the latest integrated application is established.

Do not change existing OAuth clients or deployment settings while reconciling
source. Consult docs/MCP_APPS_AUTH_RUNBOOK.md and docs/MCP_APPS_INSTALL.md before
runtime setup. Preserve the working connected-user authority and current host
connections. New uncommitted Flow work belongs to the integration owner; this
snapshot deliberately excludes it.

## Verification

Own QA: click through Studio, test real cards in each advertised chat client, check
independent Salesforce read-back, and run relevant local tests plus the complete
Apex suite before release. Test a fresh package install for release claims. Use
disposable records and restore temporary configurations/settings. Report actual
results, distinguish protocol/API evidence from live-client proof, and state
platform limits plainly.

## Salesforce identifier format

User instruction: always use 18-character Salesforce IDs. Normalize valid 15-character platform inputs to checksum18 at ingestion, validate 18-character checksums and compare full IDs; never truncate comparisons to 15 characters. Keep private identifiers out of logs and receipts.
