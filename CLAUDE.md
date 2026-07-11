# Cardstack — CLAUDE.md

Cardstack lets CRM admins design interactive "record cards" that render inside AI
chat apps (Claude, ChatGPT, Copilot) via the MCP Apps standard (SEP-1865). Reps ask
for records in chat and get live, editable cards; admins design and govern those
cards in a standalone web app (Studio). Full plan: **PLAN.md**. Design reference:
**/design** (open `design/Cardstack Designs.dc.html` in a browser; ids `1a`–`12b`
map to `design/README.md`).

## Current phase

**M2.5 — saved views — is complete.** `pnpm demo:m2.5` shows: exposed views +
"Ask Claude with" aliases baked into `crm_list_view`'s tool description for
model routing; unique asks resolve straight to view rows; ambiguous asks render
the picker (5b) and the pick is remembered per phrasing. M1 (`pnpm demo:m1`)
and M2 (`pnpm demo:m2`) golden paths also pass.

**Next: M3 — Studio** (connect/onboarding, layout builder with live REAL widget
preview, permissions, assignment, publish/rollback; design refs 2a–2i, 3a–3e,
6a, 6b, 12b). Studio theme = design tokens in design/README.md → Tailwind
config in apps/studio. Still open from M2's design refs: stale-card strip and
re-auth state (need host/staleness signals).

## Hard rules

1. **Layout config schema changes** require updating the zod schema in
   `packages/core` AND a migration note in the changed file's header comment.
2. **Denylist/allowlist enforcement is server-side only.** The widget only ever
   receives fields the config permits. Never trust the iframe.
3. **No secrets and no tenant data in widget bundles.** Everything reaches the
   widget via `structuredContent` at render time.
4. **Widgets never call our API directly** — all writes go widget → host → MCP
   tool call (auditable, user-confirmable).
5. **Adapters never import from `apps/*`.** Everything above the adapter is
   CRM-agnostic.
6. UI must match **/design**; deviations require a PR note. The /design README's
   ids (1a…12b) are the acceptance reference per the milestone map in PLAN.md —
   do not build design surfaces ahead of their milestone.
7. Before implementing anything against the MCP Apps spec, read the shipped
   `@modelcontextprotocol/ext-apps` SDK (types in node_modules) — do not trust
   training data or PLAN.md for exact `_meta` shapes.
8. Every write is preceded by a confirmation diff — "require confirmation" is
   locked ON; it is the product's spine, not a setting.

## Commands

- `pnpm build` — build all packages (turbo; widgets build first, server inlines them)
- `pnpm typecheck` / `pnpm test` / `pnpm lint`
- `pnpm demo:m1` — Golden Path 1 demo (search → results table → record card)
- `pnpm demo:m2` — Golden Path 2 demo (edit → confirm → receipt → audit)
- `pnpm demo:m2.5` — saved views demo (alias routing → picker → remembered choice)
- `pnpm --filter @cardstack/mcp-server dev` — run the MCP server locally (streamable HTTP on :3001)
- MCP Inspector: `npx @modelcontextprotocol/inspector` → connect to `http://localhost:3001/mcp`

## Layout

- `apps/mcp-server` — MCP server, streamable HTTP, stateless JSON
- `apps/studio` — Next.js admin UI (M3; not started)
- `packages/core` — layout config zod schema, payload contract, shared types
- `packages/crm-adapters` — `CrmAdapter` interface, `mock/` (M1), `hubspot/` (M1.5), `salesforce/` (M2)
- `packages/widgets` — widget source → Vite single-file HTML bundles
- `design/` — design canvas + README (source of truth for UI)
