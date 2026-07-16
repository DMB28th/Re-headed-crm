# Cardstack

Configurable **MCP Apps** for Salesforce and HubSpot. CRM admins design
interactive "record cards" in a web Studio; reps ask for records in Claude /
ChatGPT / Copilot and get live, editable cards rendered inline via the MCP Apps
standard (SEP-1865).

- **PLAN.md** — full project plan, phases, golden paths, security rules
- **design/** — high-fidelity design reference (open `design/Cardstack Designs.dc.html` in a browser; ids `1a`–`12b` map to `design/README.md`)
- **CLAUDE.md** — working rules + current milestone

## Status: M4 complete · M7 auth foundation

Record card, results table, and home card with the full write path, saved-view
resolution, and the Studio admin app — running against the **mock adapter for
demos and live HubSpot / Salesforce** in production.

**Multi-account auth (M7 foundation):** Studio can require SSO login (Google,
HubSpot, and/or Salesforce) with organization = workspace/account. My team
covers invite, workspace switch, logout, and MCP token minting. Chat hosts
authenticate with `Authorization: Bearer cs_live_…`; the MCP server resolves
tenant + running user per request. When `BETTER_AUTH_SECRET` is unset, Studio
stays in open demo mode (`t_demo`) so local golden paths keep working.

```bash
pnpm install
pnpm build
pnpm demo:m1    # search → results table → record card
pnpm demo:m2    # edit → confirmation diff → receipt → audit log → model context
pnpm demo:m2.5  # "my deals" → saved view · ambiguous ask → picker → remembered
pnpm demo:m3    # Studio publish → live layout change (no deploy) → rollback
pnpm demo:m4    # "open my CRM" → home card → confirmed task check-off

pnpm --filter @cardstack/studio dev        # Studio on :3002
pnpm --filter @cardstack/mcp-server dev    # MCP server on :3001 — same config file
```

Studio's layout builder renders the **real widget component** in its preview
rail (one render codepath — the plan's most important Studio decision), and
publishing writes to the shared config store the MCP server reads at render
time: change a layout, publish, and the next card in chat is the new version.

Writes follow the design's spine: every write shows a FIELD/BEFORE/AFTER
confirmation diff, collapses to a receipt on success, salvages partial failures
per field with the CRM's verbatim validation message, lands in the audit log,
and mirrors itself to the model via `updateModelContext`.

## Try it in an MCP host

```bash
pnpm --filter @cardstack/mcp-server dev   # streamable HTTP on http://localhost:3001/mcp
npx @modelcontextprotocol/inspector       # or connect Claude.ai via a tunnel
```

Ask: *"pull up our open deals over $50k"* → results table widget → click a row
→ record card widget.

## Layout

| Path | What |
|---|---|
| `apps/mcp-server` | MCP server — streamable HTTP, stateless, per-request tenant→config→adapter resolution; optional shared-secret + rate limit |
| `apps/studio` | Admin Studio (Next.js) — SSO login, My team, layout builder, home-card builder, lists, connections, publish/rollback, audit log |
| `packages/auth` | MCP token store + RunningUser types (shared by Studio + MCP server) |
| `packages/core` | Layout config schema (zod), payload contracts, server-side denylist filtering |
| `packages/config-store` | draft/publish/rollback config + durable audit log (Postgres via `DATABASE_URL`, file-backed otherwise) |
| `packages/crm-adapters` | `CrmAdapter` interface + `MockCrmAdapter`, `hubspot/` (private-app token), `salesforce/` (client-credentials) |
| `packages/widgets` | React widgets → Vite single-file HTML bundles served as `ui://` resources |

## Deploy

Both apps are plain Node containers — config via env vars, no platform APIs.

**Railway** (two services + Postgres):
1. Add a **Postgres** database to the project; Railway exposes `DATABASE_URL`.
2. **mcp-server** service from this repo · Dockerfile path
   `apps/mcp-server/Dockerfile` · reference `DATABASE_URL` from the database.
   Health check `GET /healthz`. This is the URL Claude.ai connects to:
   `https://<service>.up.railway.app/mcp` (Settings → Connectors).
3. **studio** service · Dockerfile path `apps/studio/Dockerfile` · same
   `DATABASE_URL`. For multi-account auth also set `BETTER_AUTH_SECRET`,
   `BETTER_AUTH_URL` (public Studio URL), and at least one of
   `GOOGLE_CLIENT_*` / `HUBSPOT_CLIENT_*` / `SALESFORCE_CLIENT_*`.
   Publish a layout in Studio → the server's next render
   serves it (both read/write the same `layout_configs` tables).

See `.env.example` for the full variable list.

The store picks its backend from the environment: `DATABASE_URL` → Postgres
(schema auto-created, demo tenant seeded on first boot); otherwise the
file-backed store at `CARDSTACK_CONFIG_PATH` (defaults to
`/data/cardstack-config.json` in containers — attach a volume if you deploy
without Postgres; single-box `docker compose up` shares `./data`).
`PORT` is injected by Railway.

## Architecture in one paragraph

The widget HTML is generic and shipped once. All customization lives in a
**layout config** (zod schema in `packages/core`) produced by Studio and
delivered to the widget via `structuredContent` at render time, merged with
live describe metadata from the CRM. Field denylists are enforced
**server-side only** — the widget never receives a field the config doesn't
allow. All writes flow widget → host → MCP tool call with a confirmation diff,
never widget → API directly.
