# Persistent record workspace implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development. Tasks use checkbox steps for tracking. User approved this scope on October 14 and previously delegated implementation choices; proceed without repeated plan approvals.

**Goal:** Deliver one stable Salesforce-like record workspace through the existing shared editor in both actual hosts.

**Architecture:** Preserve one renderer/controller and Salesforce-owned lifecycle. A persistent shell contains identity, scrollable configured content and reachable actions. Busy operations retain their last authoritative presentation while disabling dispatch; keyed controls preserve editing continuity without restoring revoked authority.

**Tech stack:** Existing vanilla DOM modules, ext-apps SDK 1.7.4, Salesforce API67; existing local build/deployment preparation.

**Spec:** ../../SALESFORCE_IN_AI_UX_2026-10-14.md, especially recommended workspace and smallest meaningful milestone; ../../LOOKUP_AND_AI_UX_ACCEPTANCE_2026-10-14.md. User's existing approvals override additional procedural approval loops.

## Global constraints

- Work only in the existing `codex/cardstack-integration` checkout. Preserve the five pre-existing dirty files.
- One renderer/controller/native writer; no object presets, new public write authority, new hosting, dependencies or credentials.
- Persistent org `cardstack-spike2`, API67. Deployment JWT remains ON; current integration runbook overrides stale toggle advice.
- Exact review, explicit confirmation, cancellation, stale-result guards, native permissions/validation, immutable receipt and recovery remain authoritative.
- No enabled REFERENCE field or fabricated lookup provider. Natural name resolution is a separate capability; known-ID Open is the current entry.
- Host outer scroll is host-owned; verify actual behavior separately. No parent DOM access or per-field chat messages.
- One consolidated source review and native regression checkpoint; focused checks during development. Preserve all evidence and failed artifacts.

## Review focus

- Same-phase rerender while an input has unsaved text and selection must preserve its node, draft, caret and clear intent.
- Delayed Review/Confirm must retain visible task context and disable duplicate dispatch without misleading cancellation during save.
- Context switch/disconnect must clear old presentation/authority and reject delayed results even when shell nodes persist.
- Narrow/small/absent host dimensions and safe-area updates must keep actions accessible without a resize feedback loop.
- Receipt/fresh-read failure and error-focus changes must preserve truthful completion and accessible deliberate focus.

### Task 1: Persistent shared workspace and focused verification

**Files:** Modify `salesforce-native/ui/opportunity-edit/{view.mjs,controller.mjs,layout.mjs,index.html,app.js,record-app.js,preview.html}` as needed. Create narrowly scoped workspace/style helpers if useful. Extend existing `tests/{opportunity-ui,record-ui,record-fields,opportunity-protocol}.test.cjs` only where new risk coverage is required. Existing build script produces reviewed staticresources/previews; root owns inventory updates.

**Interfaces:** Keep `renderScreen(root, model, callbacks) -> {readDraft}` and existing mount entry signatures. Preserve checked public contracts; presentation-only `busy`/phase context may be internal. `hostStyles(context)` may apply checked size/safe-area variables without becoming an authority signal.

- [x] Add failing focused checks: same Editing control identity/value/selection and clear state across rerender; busy Review/Confirm content remains while actions cannot dispatch; record-switch denial removes old context; completion refresh error retains receipt. Reuse existing cancellation/stale guards instead of duplicating them.
- [x] Run the focused files with existing `NODE_PATH`/UI dependencies; confirm new assertions fail for the intended missing behavior.
- [x] Implement stable record header with object/name, configured sections, one clear primary task action, compact review/receipt and a reachable action bar. Identity comes from checked current data; do not invent highlights or timestamps.
- [x] Reconcile Editing field nodes by current interaction/record/field identity; update permitted properties/errors without overwriting unsaved values. Clear/revoke on actual identity/authorization changes. Preserve focus/caret/inner scroll on same-phase updates; use deliberate error/phase focus with preventScroll and app-only invalid-field reveal.
- [x] Retain visible phase during Preparing/Saving/Pending/Refreshing, with status and disabled controls. No misleading Cancel during in-flight Confirm and no extra confirmation dispatch. Keep current generation/request guards.
- [x] Apply compact Salesforce-like hierarchy using host theme variables; consume checked dimensions/insets with bounded inner scrolling and tested fallback. Share styles across real entries and synthetic preview; no forced expansion/fullscreen or outer-chat manipulation.
- [x] Run focused regressions, build existing UI assets with installed dependencies, and write task report with exact commands, results, source changes and limitations. Commit only owned source/tests/assets.

### Task 2: Integrated checkpoint and actual-host acceptance (root owner)

**Files:** Existing `scripts/record-editor-checkpoint-inventory.json`, current integration runbook/evidence docs and this plan's private ledger. No unrelated configuration/auth changes.

**Interfaces:** Task1 preserves strict public contracts and the existing build. Existing preparation and native submit helpers produce immutable API67 artifact and expected test inventory.

- [x] Consolidate task/whole-milestone review of the exact diff; resolve material findings with scoped fix checks.
- [x] Verify normal/narrow real-browser preview geometry, keyboard/date/choice behavior, retained loading content, inner scroll/action placement and sizing. Synthetic preview is renderer proof only.
- [x] Prepare one reviewed artifact, run native regression/deploy atomically using current auth, then independently verify source/resource parity and unchanged JWT/connection settings. No fresh-install claim.
- [x] Actual Claude and ChatGPT separately: open current owned Lead, edit middle/bottom fields, induce validation, Review/Back, Confirm once, receipt and Refresh; independently verify exact values and one audit. Exercise cancellation with zero effects. Record actual app/outer viewport behavior; use existing disposable fixtures, preserve unrelated config.
- [x] Smoke shared Opportunity/Contact compatibility. Induce response-loss/delayed-switch faults only with supported safe tooling; label uninduced cases NOT_RUN rather than using synthetic proof.
- [x] Commit concise evidence/feedback/status, preserve private failures, and report deployed behavior with concrete limits.

## Parallel lookup qualification

Read-only native qualification can proceed alongside Task1. Acquire current supported source-field metadata using existing deployment access into private artifacts; identify a concrete supported scope/freshness transport without enabling fields, changing credentials or relying on absent metadata. Root integrates no positive lookup until its authority contract is proven. Its outcome must not delay the supported-field workspace.

## Milestone outcome — October 14

Application `5275b7e` is deployed in `cardstack-spike2`. Both actual hosts passed the ten-field configured Lead journey and independent Salesforce read-back. Full native baseline 808/808 at `3daad61`; isolated sizing delta qualified with 124/124 focused native tests and exact six-file resource retrieval. Renderer checks: 93 focused, earlier 442 complete native-local; five rebuilt assets identical. Opportunity/Contact compatibility was checked by relevant renderer/native regression; a new full live write journey on those fixtures was not repeated. Actual-host response-loss and delayed-switch fault induction remains NOT_RUN because supported browser tooling did not provide safe network-delay/fault controls. Explicit limitations remain in the milestone report; these were not substituted with mocked proof.
