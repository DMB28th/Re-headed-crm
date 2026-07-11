# Cardstack

Configurable **MCP Apps** for Salesforce and HubSpot. CRM admins design
interactive "record cards" in a web Studio; reps ask for records in Claude /
ChatGPT / Copilot and get live, editable cards rendered inline via the MCP Apps
standard (SEP-1865).

- **PLAN.md** — full project plan, phases, golden paths, security rules
- **design/** — high-fidelity design reference (open `design/Cardstack Designs.dc.html` in a browser; ids `1a`–`12b` map to `design/README.md`)
- **CLAUDE.md** — working rules + current milestone

## Status: M2.5

Record card + results table with the full write path and saved-view resolution,
all against the mock adapter:

```bash
pnpm install
pnpm build
pnpm demo:m1    # search → results table → record card
pnpm demo:m2    # edit → confirmation diff → receipt → audit log → model context
pnpm demo:m2.5  # "my deals" → saved view · ambiguous ask → picker → remembered
```

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

## Architecture in one paragraph

The widget HTML is generic and shipped once. All customization lives in a
**layout config** (zod schema in `packages/core`) produced by Studio and
delivered to the widget via `structuredContent` at render time, merged with
live describe metadata from the CRM. Field denylists are enforced
**server-side only** — the widget never receives a field the config doesn't
allow. All writes flow widget → host → MCP tool call with a confirmation diff,
never widget → API directly.
