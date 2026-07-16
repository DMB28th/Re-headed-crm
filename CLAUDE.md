# Cardstack — CLAUDE.md

Cardstack lets CRM admins design interactive "record cards" that render inside AI
chat apps (Claude, ChatGPT, Copilot) via the MCP Apps standard (SEP-1865). Reps ask
for records in chat and get live, editable cards; admins design and govern those
cards in a standalone web app (Studio). Full plan: **PLAN.md**. Design reference:
**/design** (open `design/Cardstack Designs.dc.html` in a browser; ids `1a`–`12b`
map to `design/README.md`).

## Current phase

**M4 — the home card — is complete.** `pnpm demo:m4` walks "open my CRM"
→ home-card widget (7a: list tiles with live counts, picked-up-recently,
follow-ups with overdue rows) → inline-confirmed task check-off via
`crm_complete_task` → audit log → updateModelContext → re-render drops the
completed task. Home config is the block-based `HomeCardConfig` (launcher
blocks only — dashboard blocks don't exist, per the anti-goals). Studio's
home-card builder (8a) at `/home-card` toggles/configures blocks with the
REAL HomeCard component previewing "as the rep"; publish bumps the revision
and logs the event. Layout rollback now has UI too (Versions dropdown in the
layout builder).

**M7 auth foundation (in progress):** Studio SSO (Google / HubSpot / Salesforce)
via better-auth + organizations (= accounts). `/login`, `/team` (My team:
workspaces, invites, logout, MCP token minting). MCP resolves
`Bearer cs_live_…` → tenantId + RunningUser for audit attribution. Demo mode
unchanged when `BETTER_AUTH_SECRET` is unset.

**M3 — Studio core — is complete.** `pnpm demo:m3` walks Golden Path 3
(publish → live layout change, rollback) at the store level, and the same flow
works through the real Studio UI: `pnpm --filter @cardstack/studio dev` (:3002)
→ builder (2a: palette / canvas with dnd / live REAL-widget preview) → publish
diff modal (2b) → the MCP server serves the new revision on its next render
via the shared file-backed config store (`data/cardstack-config.json`).
Also shipped: nav shell (12b), home (6b), permissions (2e, confirmation locked
ON), lists/exposures (5a), assignment teaching state, connections (2c, mock).
All golden paths M1/M2/M2.5/M3 pass.

**Still open from M3's design refs** (next session, before M4): assignment
matrix + View-as (2f–2i beyond the teaching state), onboarding auto-generation
(2c), rollback button in the UI (API + store support exist; home lists publish
history), actions editor (3a), related-list picker (3b), object picker (3c),
requirements pass-through (3d), audience picker (3e). Stale-card strip and
re-auth widget states also still open. PostgresConfigStore ships behind
DATABASE_URL (Railway two-service deploys); audit log + preferences are
still in-memory — move them to Postgres alongside multi-tenant auth (M7).

**Auth foundation (partial M7):** `@cardstack/auth` MCP tokens; Studio
better-auth SSO (Google/HubSpot/Salesforce) + organizations (= accounts);
`/login`, `/team`, logout; MCP `Bearer cs_live_…` → tenant + RunningUser.
CRM user variables: HubSpot/SF SSO → `user_crm_links` → stamped on MCP tokens
as `crmUserId`/`crmOwnerId`; `owner=me` and home-card scope use `$me`.
Per-rep CRM OAuth tokens scaffolded in `user_crm_tokens` (encryption + connect
UI next). Still open: MCP OAuth 2.1 registry metadata, CRM token encryption
(KMS), preferences → Postgres.

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
- `pnpm demo:m3` — Golden Path 3 demo (publish → live layout change → rollback)
- `pnpm demo:m4` — home card demo (lists/recents/follow-ups → confirmed task check-off)
- `pnpm --filter @cardstack/studio dev` — Studio on :3002 (shares data/cardstack-config.json with the server)
- `pnpm --filter @cardstack/mcp-server dev` — run the MCP server locally (streamable HTTP on :3001)
- MCP Inspector: `npx @modelcontextprotocol/inspector` → connect to `http://localhost:3001/mcp`

## Layout

- `apps/mcp-server` — MCP server, streamable HTTP, stateless JSON
- `apps/studio` — Next.js admin UI (builder imports the REAL widget for preview)
- `packages/core` — layout config zod schema, payload contract, payload assembly, shared types
- `packages/config-store` — draft/publish/rollback config storage (Postgres via DATABASE_URL, file-backed otherwise)
- `packages/crm-adapters` — `CrmAdapter` interface, `mock/` (M1), `hubspot/` (M1.5), `salesforce/` (M2)
- `packages/widgets` — widget source → Vite single-file HTML bundles
- `design/` — design canvas + README (source of truth for UI)
