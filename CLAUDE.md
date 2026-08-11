# Cardstack — CLAUDE.md

Cardstack lets CRM admins design interactive "record cards" that render inside AI
chat apps (Claude, ChatGPT, Copilot) via the MCP Apps standard (SEP-1865). Reps ask
for records in chat and get live, editable cards; admins design and govern those
cards in a standalone web app (Studio). Full plan: **PLAN.md**. Design reference:
**/design** (open `design/Cardstack Designs.dc.html` in a browser; ids `1a`–`12b`
map to `design/README.md`).

## Current phase

**Studio governance pass — complete.** Every config surface now stages before
it goes live, and Studio says what's true about what it can't do yet. Full
record with rationale: **docs/studio-staging-model.md** (read its four addenda
before changing any of this).

- **One staging model.** `StagedRecord<T>` (draft / published / history) covers
  layouts, permissions, view exposures, flow render modes, the home card and
  custom screens. The `ConfigStore` READ side returns published only, so drafts
  are structurally unable to reach chat; drafts live on `AdminConfigStore`.
  A shared engine in `packages/config-store/src/staging.ts` implements
  "what's staged", "publish these" and "roll this back" once, so the file and
  Postgres stores can't drift.
- **Review & publish** at `/publish`: a pending-changes tray with a per-surface
  diff, a live count in the nav rail, and rollback for every surface. Publishing
  a batch is SEQUENTIAL, not atomic — each surface gets its own `PublishEvent`
  under a shared `batchId`, and partial failure is reported, not smoothed over.
- **Flows are opt-in.** `FlowRenderModeConfig.active` defaults to false and
  `crm_flow_start` refuses a flow that isn't switched on. Render mode is a pick
  list of IN-CHAT rungs only (auto / native / embedded); `handoff` stays in the
  zod enum for storage tolerance but is no longer selectable. Deploying this
  into an org that already has flows on cards needs
  `pnpm --filter @cardstack/mcp-server migrate:flows-active` or they go dark —
  see the deploy runbook in docs/studio-staging-model.md.
- **Custom screens belong to a flow.** No rail entry: they're built from a flow
  on `/flows` (design 10c's "Build screen" fork), and a screen can't be created
  or published without one. `/custom-screens/[id]` is just where the code pane
  lives.
- **The layout builder edits a card.** The canvas is card-shaped — header,
  sections in their real 1/2/3-column grid, related lists, actions — with drag
  and keyboard reorder across the grid. Each field has ONE settings menu
  (Access, Input control). The live preview still renders the REAL widget from
  a server-assembled payload and is one click away, collapsed by default.
- **Shared UI primitives** in `apps/studio/components/ui/`: `ConfirmPopover` /
  `Dialog` / `Popover` (anchored, Escape + outside-click + focus return),
  `ErrorNotice` + `lib/crm-error.ts` (typed CRM failures, raw text behind
  Details), `StatusChip` + `useSaveStatus` (one save/publish vocabulary).
- **Audit log is queryable**: `AuditLog.query()` filters by object, actor,
  record-or-field and date range, with paging and a pre-paging total; Postgres
  pushes it down to SQL. CSV export applies the same filters.

**M4 — the home card — is complete.** `pnpm demo:m4` walks "open my CRM"
→ home-card widget (7a: list tiles with live counts, picked-up-recently,
follow-ups with overdue rows) → inline-confirmed task check-off via
`crm_complete_task` → audit log → updateModelContext → re-render drops the
completed task. Home config is the block-based `HomeCardConfig` (launcher
blocks only — dashboard blocks don't exist, per the anti-goals). The 8a builder
at `/home-card` autosaves a durable draft and publishes separately.

**M3 — Studio core — is complete.** `pnpm demo:m3` walks Golden Path 3
(publish → live layout change, rollback) at the store level, and the same flow
works through the real Studio UI. Also shipped: nav shell (12b), home (6b),
permissions (2e, confirmation locked ON), lists/exposures (5a), assignment
teaching state, connections (2c). All golden paths M1/M2/M2.5/M3 pass.

**M5 — flows — partially shipped.** The HANDOFF rung works end to end
(`crm_flow_start` / `_continue` / `_cancel`, inputs collected in chat, launch
URL). **Native and embedded rendering do not exist** — no widget reads
`renderMode`, so an active flow still finishes in a CRM browser tab. Studio
says so on the Flows page rather than implying otherwise;
`MODES[].delivered` in `flows-editor.tsx` is the flag to flip when a widget
actually branches on it.

**The actions editor (3a) is in** — per-object at
`/objects/[object]/actions`, with screen-flow input mapping. Card actions are
config, enforced server-side.

**Still open.** View-as / audience preview (2f–2i beyond the teaching state) is
the biggest remaining trust gap — `scopeViewExposuresForUser` exists
server-side but nothing surfaces it. Custom screens are M6 config with no M6
runtime (guardrail execution, live preview); the editor carries a
`RuntimePendingBanner` saying so. Also open: onboarding auto-generation (2c),
related-list picker (3b), object picker (3c), requirements pass-through (3d),
audience picker (3e), stale-card strip and re-auth widget states. Audit log +
preferences move to Postgres alongside multi-tenant auth (M7).
PostgresConfigStore ships behind DATABASE_URL (Railway two-service deploys).

**Cardstack accounts and multi-workspace tenancy are in — self-serve, not
Salesforce-gated.** Sign-up is email + password (`POST /api/auth/signup`),
creating the account and its one owned workspace in the same step; "Continue
with Salesforce" (`CARDSTACK_SF_CLIENT_ID/SECRET`) is a peer sign-in/signup
lane, not a requirement. A workspace starts unconnected — connecting a
Salesforce org at `/connections` is a later, exclusive claim
(`workspace.org_key`, unique when set), and reps arriving from a chat host are
routed by that claimed org id and refused with a typed error when nobody has
claimed it yet (`resolveSignIn`'s find-or-refuse). Studio identity is a
session cookie backed by the store's KV — the `x-cardstack-*` headers are
still not trusted, and `CARDSTACK_TENANT_ID` is still only a migration
fallback, not a request default. Full model, env vars, and migration notes:
**docs/accounts-and-workspaces.md**. Cross-tenant isolation is asserted in
`packages/config-store/src/tenant-isolation.test.ts` — keep it passing.

**The two lanes are separated, and each has ONE authorization choke point.**
Studio: `resolveStudioSession` (`apps/studio/lib/auth.ts`) admits only the
workspace's OWNER (`workspace.ownerAccountId === account.id`) — not a role,
and not any membership — so a rep or any non-owning account holds no Studio
session at all. There is no exception route anymore: `/me/connection` and
`getSelfServiceIdentity` are gone: a rep's re-auth path is their chat host's
own reconnect flow, which the re-auth card deep-links, never a Studio URL.
MCP: `verifyAccessToken` re-reads the membership on every call, so removal
takes effect on the next tool call rather than in 30 days. Do not add a
`requireAdmin()` helper alongside these; per-route checks are the failure mode
the choke points exist to prevent.

An `/authorize` from a client outside `CARDSTACK_TRUSTED_CLIENT_ORIGINS` stops
for consent AFTER the Salesforce leg, where the signer and the redirect target
are both known. Never move that earlier, and never mint an authorization code
before it. Findings and design:
**docs/superpowers/specs/2026-08-08-auth-review.md** and
**docs/superpowers/specs/2026-08-08-auth-redesign.md**.

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
   checked rather than a claim the caller made. Flow and quick-action writes are
   gated the same way by their SIGNED interview state (which carries
   `pendingWrite`), not by a token — same floor, same signer. Never widen a write
   tool to accept confirmation as a boolean or a caller-supplied string, and
   never let a signer degrade to unsigned when no key is configured.
   See **docs/confirmation-provenance.md**.

## Commands

- `pnpm build` — build all packages (turbo; widgets build first, server inlines them)
- `pnpm typecheck` / `pnpm test` / `pnpm lint`
- `pnpm demo:m1` — Golden Path 1 demo (search → results table → record card)
- `pnpm demo:m2` — Golden Path 2 demo (edit → confirm → receipt → audit)
- `pnpm demo:m2.5` — saved views demo (alias routing → picker → remembered choice)
- `pnpm demo:m3` — Golden Path 3 demo (publish → live layout change → rollback)
- `pnpm demo:m4` — home card demo (lists/recents/follow-ups → confirmed task check-off)
- `pnpm --filter @cardstack/studio dev` — Studio on :3002 (shares data/cardstack-config.json with the server); `/publish` is Review & publish + rollback

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
- `apps/studio` — Next.js admin UI (builder imports the REAL widget for preview);
  nav rail is Home · Pending changes · objects · Home card / Flows / Audit log
- `packages/core` — layout config zod schema, payload contract, payload assembly, shared types
- `packages/config-store` — draft/publish/rollback for every governed surface
  (`staging.ts` is the shared engine; Postgres via DATABASE_URL, file-backed otherwise)
- `packages/crm-adapters` — `CrmAdapter` interface, `mock/` (M1), `hubspot/` (M1.5), `salesforce/` (M2)
- `packages/widgets` — widget source → Vite single-file HTML bundles
- `design/` — design canvas + README (source of truth for UI)
