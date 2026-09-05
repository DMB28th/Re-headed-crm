# Session 5 — Home card

**Goal:** M4 on-platform — "open my CRM" → home-card widget with list tiles,
recents, follow-ups → confirmed task check-off → re-render drops the task.

## Deliver

- **`crm_home`** tool: assembles `HomeCardConfig` blocks into the home-card
  payload — list tiles with live counts (one aggregate SOQL per tile, tiles
  capped to stay inside limits), picked-up-recently from `RecentlyViewed`,
  follow-ups from open Tasks with overdue flagging. Launcher blocks only; no
  dashboard blocks (anti-goal).
- **Home card builder tab** (LWC `homeCardBuilder`): block list with add /
  remove / reorder, per-block settings (list tile: object + list view;
  follow-ups: days ahead, limit). Autosaves a Draft on `Home_Card__c`;
  publishes through the same Pending changes tab.
- **Task check-off** end to end using Session 3's
  `crm_preview_complete_task` / `crm_complete_task` and a re-render that
  omits the completed task (`updateModelContext` shape unchanged).

## Out of scope

Anything beyond launcher blocks; audience-specific home cards (keep
"default").

## Read first

- `packages/core/src/home-card.ts` — block schema and assembly.
- `apps/mcp-server/src/server.ts` — `crm_home` body and the list-count strategy.
- `apps/studio/app/home-card/page.tsx` — the 8a builder behaviour.
- `packages/widgets/src/home-card/mcp-app.tsx` — what the widget reads.
- `design/README.md` ids 7a, 8a.

## Acceptance

- `pnpm demo:m4`'s narrative reproduced in Claude against a scratch org.
- Apex tests: tile counts respect the rep's sharing; a tile whose list view
  the rep cannot see is omitted, not errored; the tool stays under 30 SOQL
  with the maximum tile count.
