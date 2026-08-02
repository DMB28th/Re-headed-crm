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
DATABASE_URL (Railway two-service deploys).

**Cardstack accounts and multi-workspace tenancy are in.** Sign-in is
Salesforce OAuth against a Cardstack-owned connected app
(`CARDSTACK_SF_CLIENT_ID/SECRET`); a workspace IS a Salesforce org, so the
first signer from an org creates it and becomes admin and later signers
auto-join as members. Studio identity is a session cookie backed by the
store's KV — the `x-cardstack-*` headers are no longer trusted, and
`CARDSTACK_TENANT_ID` is only a migration fallback, not a request default.
Full model, env vars, and migration notes: **docs/accounts-and-workspaces.md**.
Cross-tenant isolation is asserted in
`packages/config-store/src/tenant-isolation.test.ts` — keep it passing.

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
   locked ON; it is the product's spine, not a setting. This is enforced
   server-side, not by widget flow: `crm_preview_update` computes the diff and
   mints a signed token bound to it, and `crm_update_record` verifies that token
   before writing, so the audit log's "rep confirmed" is a finding the server
   checked rather than a claim the caller made. Never widen a write tool to
   accept confirmation as a boolean or a caller-supplied string.
   See **docs/confirmation-provenance.md**.

## Commands

- `pnpm build` — build all packages (turbo; widgets build first, server inlines them)
- `pnpm typecheck` / `pnpm test` / `pnpm lint`
- `pnpm demo:m1` — Golden Path 1 demo (search → results table → record card)
- `pnpm demo:m2` — Golden Path 2 demo (edit → confirm → receipt → audit)
- `pnpm demo:m2.5` — saved views demo (alias routing → picker → remembered choice)
- `pnpm demo:m3` — Golden Path 3 demo (publish → live layout change → rollback)
- `pnpm demo:m4` — home card demo (lists/recents/follow-ups → confirmed task check-off)
- `pnpm --filter @cardstack/studio dev` — Studio on :3002 (shares data/cardstack-config.json with the server)

### Local dev against a REAL Salesforce org

The stock seed is the HubSpot-shaped mock portal (`deals`/`dealname`) — fine for
tests and demos, but it describes nothing in a Salesforce org. To develop
against real data instead:

- `pnpm --filter @cardstack/studio seed:salesforce -- --org <alias>` — reads the
  org's actual objects, fields and list views and writes
  `data/cardstack-salesforce.json` (gitignored). Defaults to Account, Contact,
  Opportunity, Lead, Case, Task; `--objects A,B` to override.
- `pnpm --filter @cardstack/studio dev:sf` — Studio on that store, live against
  the org. `pnpm --filter @cardstack/mcp-server dev:sf` for the MCP server.
  Both default to the `screenflow-org` alias (`CARDSTACK_DEV_SF_ORG` overrides).

**Auth is the `sf` CLI's own, held in memory only.** `CARDSTACK_DEV_SF_ORG`
bypasses the stored connection entirely, so a local run never reads, refreshes,
or writes the connected app's refresh token — which matters because that app
rotates refresh tokens with reuse detection, and a local refresh would revoke
the deployed connection's whole grant family. Never persist a token from
`readSalesforceCliToken` into a config store. Plain `pnpm dev` (no `:sf`) is
untouched and still uses the mock portal.
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
