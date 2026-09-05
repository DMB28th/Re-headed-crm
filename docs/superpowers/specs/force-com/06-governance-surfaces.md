# Session 6 — Governance surfaces

**Goal:** the remaining admin surfaces: saved views and exposures, the
actions editor, the Flows page with handoff-only flow tools, the Connect
page, and the audit log tab.

## Deliver

- **Exposures sub-tab** (LWC `viewExposuresEditor`): which list views of an
  object are exposed in chat, aliases, default view; Draft on
  `View_Exposure__c`. `crm_list_view` honours published exposures and the
  alias routing (`apps/mcp-server/src/views.ts` today).
- **Actions sub-tab** (LWC `cardActionsEditor`): per-object card actions
  (update, create related, screen flow with input mapping), enable / reorder
  / remove; stored inside the layout JSON as today. Enforced server-side by
  `PayloadAssembler.selectRenderableActions`.
- **Flows tab** (LWC `flowsEditor`): org-authored screen flows from
  `FlowDefinitionView` (regular sObject; do not use Tooling API for the
  list), `Active__c` toggle, render-mode pick list (auto / native /
  embedded), and a plain statement that native rendering is not built.
  `delivered` flags live in a static map in the LWC.
- **Flow tools, handoff only:** `crm_flow_start` refuses inactive flows,
  collects declared inputs in chat with signed interview state
  (`ConfirmationSigner`), `crm_flow_continue` advances input collection,
  `crm_flow_cancel`, and the final step returns the CRM launch URL for the
  flow with inputs. The `flow-run` widget renders the input screens as
  today.
- **Connect tab** (LWC `connectPage`): endpoint URL (built from
  `URL.getOrgDomainUrl()`), consumer key from `ConnectedApplication`,
  consumer secret from `Cardstack_Settings__c` with a "set it" link to
  Setup, copy buttons, and per-host walkthroughs written from Session 0's
  result doc.
- **Audit log tab** (LWC `auditLog`): filters for object, actor, record or
  field, date range; paging; CSV export through a Visualforce page that
  applies the same filters.

## Out of scope

Native flow rendering, quick actions, custom screens, audience picker,
view-as preview.

## Read first

- `packages/core/src/view-exposures.ts`, `card-actions.ts`, `action-inputs.ts`.
- `apps/studio/components/flows-editor.tsx` — `MODES[].delivered` and the honesty copy.
- `apps/mcp-server/src/server.ts` — the handoff branch of the flow tools; ignore the native branch.
- `docs/superpowers/specs/2026-08-07-actions-editor-design.md`.
- `packages/config-store/src/audit-log.ts` — `AuditQuery` filters.
- `design/README.md` ids 3a, 5a, 10a, 10c, 11c/11d (the rendering ladder; only the HANDOFF rung ships here).

## Acceptance

- `pnpm demo:m2.5`'s narrative (alias → picker → remembered choice) in Claude.
- Starting an inactive flow is refused; an active flow collects inputs and
  ends with a launch URL that opens the flow with those inputs.
- A rep following the Connect page from a clean Claude account reaches a
  working connector without help.
- Audit CSV matches the filtered list row for row.
