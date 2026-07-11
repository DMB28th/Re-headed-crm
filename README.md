# Cardstack

Configurable **MCP Apps** for Salesforce and HubSpot. CRM admins design
interactive "record cards" in a web Studio; reps ask for records in Claude /
ChatGPT / Copilot and get live, editable cards rendered inline via the MCP Apps
standard (SEP-1865).

- **PLAN.md** — full project plan, phases, golden paths, security rules
- **design/** — high-fidelity design reference (open `design/Cardstack Designs.dc.html` in a browser; ids `1a`–`12b` map to `design/README.md`)
- **CLAUDE.md** — working rules + current milestone

## Status: M3 (Studio core)

Record card + results table with the full write path, saved-view resolution,
and the Studio admin app — all against the mock adapter:

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
| `apps/mcp-server` | MCP server — streamable HTTP, stateless, per-request tenant→config→adapter resolution |
| `apps/studio` | Admin Studio (Next.js) — M3, not started |
| `packages/core` | Layout config schema (zod), payload contracts, server-side denylist filtering |
| `packages/crm-adapters` | `CrmAdapter` interface + `MockCrmAdapter` (fixtures); `hubspot/`, `salesforce/` next |
| `packages/widgets` | React widgets → Vite single-file HTML bundles served as `ui://` resources |

## Deploy

Both apps are plain Node containers — config via env vars, no platform APIs.

**Railway** (MCP server — the piece Claude.ai connects to):
1. New service from this repo · set **Dockerfile path** to `apps/mcp-server/Dockerfile`.
2. Attach a **volume at `/data`** (published layouts survive restarts; the store
   seeds the demo tenant on first boot).
3. Railway injects `PORT` automatically. Health check: `GET /healthz`.
4. Point Claude.ai (Settings → Connectors) at `https://<service>.up.railway.app/mcp`.

Studio on Railway needs the Postgres-backed config store (Railway volumes
attach to one service only, and Studio + server share the store) — until that
lands, run Studio locally against the same file, or use single-box
`docker compose up` where both containers share `./data`.

Env vars: `PORT` (injected), `CARDSTACK_CONFIG_PATH` (defaults to
`/data/cardstack-config.json` in containers).

## Architecture in one paragraph

The widget HTML is generic and shipped once. All customization lives in a
**layout config** (zod schema in `packages/core`) produced by Studio and
delivered to the widget via `structuredContent` at render time, merged with
live describe metadata from the CRM. Field denylists are enforced
**server-side only** — the widget never receives a field the config doesn't
allow. All writes flow widget → host → MCP tool call with a confirmation diff,
never widget → API directly.
