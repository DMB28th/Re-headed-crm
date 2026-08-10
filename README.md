# Cardstack

Configurable **MCP Apps** for Salesforce and HubSpot. CRM admins design
interactive "record cards" in a web Studio; reps ask for records in Claude /
ChatGPT / Copilot and get live, editable cards rendered inline via the MCP Apps
standard (SEP-1865).

- **PLAN.md** — full project plan, phases, golden paths, security rules
- **design/** — high-fidelity design reference (open `design/Cardstack Designs.dc.html` in a browser; ids `1a`–`12b` map to `design/README.md`)
- **CLAUDE.md** — working rules + current milestone

## Status: M4 complete · M5 (flows) partially shipped

Record card, results table, and home card with the full write path, saved-view
resolution, and the Studio admin app — running against the **mock adapter for
demos and live HubSpot / Salesforce** in production. HubSpot connects with a
private-app token, Salesforce with two OAuth lanes: admin OAuth for setup and
per-user OAuth for runtime records/list views/writes. The Studio Connections
page validates tokens, reports scope gaps, and generates a starter layout.
Every confirmed chat write lands in a durable, queryable audit log
(Postgres/file).

Also shipped since M4:

- **Cardstack accounts and multi-workspace tenancy.** Sign-in is Salesforce
  OAuth; a workspace *is* a Salesforce org, so the first signer from an org
  creates it and later signers auto-join. See
  `docs/accounts-and-workspaces.md`.
- **Per-user OAuth 2.1 on `/mcp`.** `MCP_SHARED_SECRET` remains an opt-in
  second gate, not a boot requirement.
- **One staging model.** Layouts, permissions, view exposures, flow render
  modes, the home card and custom screens all stage as a draft and go live from
  `/publish` (Review & publish), with rollback per surface. The `ConfigStore`
  read side returns published config only, so a draft is structurally unable to
  reach chat. See `docs/studio-staging-model.md`.
- **The actions editor** at `/objects/[object]/actions`, with screen-flow input
  mapping.
- **Flows (M5), partially.** The handoff rung works end to end; native and
  embedded rendering do not exist yet. Flows are opt-in — `crm_flow_start`
  refuses a flow an admin hasn't switched on.

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

## Salesforce OAuth

Create a Salesforce Connected App / External Client App with the web-server
OAuth flow enabled. Add both callback URLs for the Studio origin you run:

```text
http://localhost:3002/api/connections/salesforce/oauth/callback
http://localhost:3002/api/user-connections/salesforce/oauth/callback
```

Use your deployed Studio origin instead of `localhost` in production. Required
OAuth scopes are `api` and `refresh_token/offline_access`. In Studio, the admin
authorizes first under Connections; then each product user authorizes their own
Salesforce user from the same page. MCP runtime refuses Salesforce reads/writes
until that user auth exists, so "my opportunities" and saved views are scoped by
Salesforce itself.

## Layout

| Path | What |
|---|---|
| `apps/mcp-server` | MCP server — streamable HTTP, stateless, per-request tenant→config→adapter resolution; optional shared-secret + rate limit |
| `apps/studio` | Admin Studio (Next.js) — layout builder, home-card builder, lists, actions, flows + custom screens, connections, Review & publish (`/publish`) with per-surface rollback, queryable audit log |
| `packages/core` | Layout config schema (zod), payload contracts, server-side denylist filtering |
| `packages/config-store` | draft/publish/rollback config, workspace connections, per-user CRM auth + durable audit log (Postgres via `DATABASE_URL`, file-backed otherwise) |
| `packages/crm-adapters` | `CrmAdapter` interface + `MockCrmAdapter`, `hubspot/` (private-app token), `salesforce/` (OAuth with legacy client-credentials compatibility) |
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
   `DATABASE_URL`. Publish a layout in Studio → the server's next render
   serves it (both read/write the same `layout_configs` tables).

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
