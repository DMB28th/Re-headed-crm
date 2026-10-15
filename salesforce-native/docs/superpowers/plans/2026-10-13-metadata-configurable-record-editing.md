# Configurable Record Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax for tracking.

**Goal:** Enable another supported CRM object through metadata and published configuration using one shared editor and save lifecycle.

**Architecture:** Generalize the existing Contact capability and object-neutral public contracts while preserving the Opportunity specialization and legacy interpretation. One owner changes the shared engine; Studio consumes its eligibility contract. No additional object renderer/controller/writer.

**Tech Stack:** Salesforce Apex/LWC API67, existing plain-DOM renderer and MCP Apps SDK; offline local build/preparation tooling.

**Spec:** ../specs/2026-10-13-metadata-configurable-record-editing-design.md

## Constraints and review focus

Preserve original260 artifacts and five predirty files, all failures, full18 identities, native CRUD/FLS/sharing, private authority and existing environments. Source tasks add no rights, fixtures, publication, persistent deployment, package, org or production cutover.

Review object/state/snapshot substitution, unsupported setup/type ingress, policy/FLS/metadata drift after Review, numeric/date canonicalization and bounds, old completed-state replay, cross-object stale callbacks and atomic write/audit/receipt rollback. These distinct risks own tests; avoid new mirrored lexical tests.

## Task1: Shared metadata capability and contracts — one owner

**Modify:** CardstackRecordScreenCapability.cls; CardstackRecordMcpAdapter.cls; CardstackRecordActionService.cls; CardstackOpportunityEditTypes/Service/Repository/WriteService/WriteAudit.cls; ui/opportunity-edit/record-contract.mjs and controller identity checks where necessary. Relevant existing native capability/service/adapter/repository/writer/audit tests and tests/record-ui.test.cjs. Add focused metadata/codec helper classes only where they separate a real shared responsibility.

**Interfaces:** Entry `CardstackRecordScreenCapability.resolveDefinition(Id recordId,String actionName)` resolves canonical record-derived object and published action. Definition carries native object type, ordered fields, descriptors, required/clearable projection, layout, fingerprint and capability version. Shared read/canonicalize/validate-context methods consume it; repository/write/audit must use this same definition. Preserve old public signatures through compatibility facades. Generic tools keep names/input/private-envelope shape; public record-card/v1 and record-edit/v1 accept checked supported canonical object/field descriptors.

- [ ] Write focused failing tests for config-only Account Name/Description/NumberOfEmployees using the same engine; cross-object/snapshot substitution; setup/unsupported field rejection; INTEGER canonical bounds; required/clear; drift and atomic audit rollback.
- [ ] Capture actual focused RED where executable; native source tests are not native RED until run.
- [ ] Generalize metadata resolution/state restoration and shared DML/audit without object-specific engine branches. Preserve schema1/schema2 compatibility; explicitly version new state when needed.
- [ ] Expand generic INTEGER and qualified DATE/decimal/currency codecs; preserve specialized Stage provider and reject unsupported generic choice/lookup fields.
- [ ] Make public DTO/object identity validation generic while preserving stale-result/private-envelope protections. Run focused renderer/backend source checks; commit owned changes and freeze the admin eligibility interface for Task2.

## Task2: Studio against the shared eligibility contract

**Modify:** CardstackStudioController.cls, CardstackConfigService.cls and relevant tests; lwc/cardstackObjectConfig and cardstackOpportunityPreview; existing authoring/preview tests.

**Interfaces:** `CardstackStudioController.getRecordEditCapability(String objectApi)` returns versioned native authoring descriptor: canonical object, eligible fields, supported types/constraints and exclusion reasons. Authoring consumes that contract; runtime still resolves published policy and connected-user rights separately. Preserve existing legacy Account action mappings and Opportunity-specific actions. New generic actions are current-value inputs.

- [ ] Test another object's current-value action, arbitrary configured field order/sections, unsupported inputs and draft-versus-published distinction.
- [ ] Replace Contact-only eligibility/preview switches with shared metadata descriptors; keep synthetic Save disabled and the same renderer.
- [ ] Stage/publication validation calls the shared capability validator and cannot expand native authorization. Run focused authoring/preview checks; commit owned changes.

## Task3: Reusable preparation and one coherent checkpoint

**Create:** salesforce-native/scripts/prepare-record-editor-checkpoint.py and focused offline preparation tests; a reusable native checkpoint runbook. **Modify:** relevant QA evidence and product feedback docs.

**Interfaces:** Offline preparation accepts explicit source root, component manifest and selected test classes; produces API67 root ZIP, SHA256/source inventory, expected unique regular method identities and safe preparation receipt. No org mutation/default target/auth changes. Execution runbook reuses prepare → native regression/checkOnly → approved exact deployment → independent retrieve/readback, retaining failures and private archives.

- [ ] Test unsupported/unlisted components, deterministic content inventory, root-manifest/API67 shape and absent/malformed test inventory; use existing convert/build tools.
- [ ] Implement one preparation path and use it for this candidate; retain earlier failed preparation evidence.
- [ ] Build assets and run one consolidated local regression after Tasks1/2 integrate. Obtain one whole-change review and resolve material findings together.
- [ ] Run one native regression/compatibility checkpoint with exact expected methods in the existing owned available QA org; retain no fresh-package/install claim.
- [ ] Prepare a concrete Account live-acceptance scope only after source/native compatibility: actual rights/eligible fields, config/fixture ownership, host journeys, budgets and cleanup. Ask only for new external actions outside existing approvals; do not deploy/create/grant early.

## Acceptance and reporting

Another object must work through published configuration with the same generic tool/controller/state machine/writer/resource; a handcoded Account capability or copied save flow fails acceptance. Show field/order/layout change from configuration and distinct INTEGER validation, then edit/Review/Confirm/receipt/Refresh in actual hosts after the exact external scope is approved. Separate source/renderer/native/live evidence and preserve remaining recovery/switch/package gaps. Root owns docs; shared-engine owner has exclusive shared source ownership; Studio waits for the fixed descriptor contract.
