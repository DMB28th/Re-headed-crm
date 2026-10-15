# Cardstack project documentation

> **Current status — October 15:** Case editing, explicit record discovery, related-list navigation and controlled recovery/stale-result checks passed in both hosts; combined source is `a9a304e`. Flow OAuth and managed user/org verification succeeded; Studio acquisition/compilation is being tested. Lookup remains unsupported. See [overnight progress and current evidence](OVERNIGHT_PROGRESS_2026-10-15.md). Earlier inventory and test results below retain their dated scope.


Reviewed October 14, 2026. Cardstack lets Salesforce admins publish governed record experiences that people can use inside AI chat. Salesforce owns configuration, access checks, review, confirmation, writes and durable results; a shared MCP App renders the experience in Claude and ChatGPT.

The original review found deployed code newer than its primary checkout. This PR now reconciles the verified code snapshot and documentation. `main` at `451ba21` contains the earlier HXL implementation; the `codex/cardstack-integration` worktree contains the newer custom MCP App. The earlier Lead acceptance identifies application `5275b7e`; the later combined QA deployment and native patches are reconciled with committed source `a9a304e` in the October 15 progress report. Both use the persistent `cardstack-spike2` development org. Later source commits and experimental branches do not automatically describe deployed behavior. Read the deployment inventory before choosing a source baseline.

Publication scope and fresh checks are recorded in [GitHub reconciliation](GITHUB_RECONCILIATION_2026-10-15.md).

## Reading guide

| Question | Document |
| --- | --- |
| What changed overnight and what is verified now? | [October 15 current status](OVERNIGHT_PROGRESS_2026-10-15.md) |
| What is the product, who uses it, and what is built? | [Product overview and capability status](PRODUCT_OVERVIEW_2026-10-14.md) |
| How do runtime, Studio, Salesforce state and deployment fit together? | [Architecture and deployment inventory](ARCHITECTURE_AND_DEPLOYMENT_2026-10-14.md) |
| Which fields become which JSON properties and HTML controls? | [Field mapping guide](FIELD_MAPPING_GUIDE_2026-10-14.md) |
| How do we extend mappings, and how do records differ from flows? | [Field mapping guide](FIELD_MAPPING_GUIDE_2026-10-14.md) |
| Which chats were reviewed and which decisions supersede older ones? | [Chat review index](CHAT_REVIEW_INDEX_2026-10-14.md) |
| Which materials describe historical plans versus current evidence? | [Materials and source coverage](MATERIALS_REVIEW_2026-10-14.md) |

## The important distinctions

**A field is not mapped to a separate HTML file.** Published configuration selects field API names and actions; Salesforce supplies checked descriptors, allowed values and current record values. The shared browser renderer turns that JSON into controls and sections. Supporting another field of an already supported type can be configuration work. Supporting a new type or a new source of native choices requires backend, contract, renderer and acceptance work.

**A record editor is not a Screen Flow interpreter.** The current generic editor supports a governed record-update lifecycle. Salesforce flow launch cards hand off to Salesforce. The new bounded native interpreter foundation is built/deployed but its managed acquisition and interpreted journeys are still under acceptance. A purpose-built screen process, the legacy TypeScript interpreter and Salesforce’s full Flow engine are different capabilities; the detailed guide identifies which mappings apply to each.

**Deployed development is not a released package.** The installed beta, later source-deployed application, disposable installation proofs and current experimental branches have different verification boundaries. The architecture document records them separately.

**Current evidence supersedes older absence claims.** The October 14 report records actual ten-field Lead journeys in both Claude and ChatGPT, with independent native readback and one save per host. The later combined milestone adds actual two-client Case, related navigation, explicit search/disambiguation and controlled lost-reply/stale-result proof. Generic reference lookup remains unsupported; controlled faults do not prove natural network outages or universal historical-card recovery.

## Evidence rules for maintaining this documentation

Use current source for implemented behavior, live metadata for deployed inventory, and dated acceptance receipts for verified client behavior. Keep suggested designs, approved scope, implemented source, deployed development, client acceptance and released distribution as separate statuses. Cite a source revision when describing code outside this checkout. Treat root `README.md`, `CLAUDE.md`, `PLAN.md` and the original design canvas as historical product context where they describe Node, Railway, HubSpot or the earlier HXL-only scope.

No product implementation or deployment is part of this documentation review. Existing source changes and configuration are preserved.
