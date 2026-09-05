# Session 2 — Read path

**Goal:** Golden Path 1 on-platform — search → results table → record card —
through the real `McpEndpoint`, with the widgets rendering in Claude.

## Deliver

- **`McpEndpoint`** full dispatch (from the Session 0 skeleton): JSON-RPC
  envelope parsing, method routing, error shaping, 202 for notifications,
  405 for GET.
- **`McpforceTool` interface and `McpTools` registry.** One Apex class per
  tool, listed statically. `tools/list` emits each tool's input schema and
  the MCP Apps `_meta` from the Session 0 fixtures.
- **Read tools:** `crm_list_objects`, `crm_search` (SOSL), `crm_list_view`
  (ListView describe callout via Named Credential, then SOQL),
  `crm_get_record`, `crm_get_related`, `crm_lookup_search`,
  `crm_aggregate`. `crm_home` is Session 5.
- **`DescribeService`** wrapping `Schema.describeSObjects` into the
  `ObjectDescribe` shape the widgets expect (labels, types, picklist values,
  required, updateable, reference targets).
- **`PayloadAssembler`** — port of `packages/core/src/assemble.ts`
  (`buildResultsTablePayload`, `buildRecordCardPayload`, `genericLayoutConfig`
  for objects with no published layout, `provenanceFor`) and `filtering.ts`
  (`applyDenylist`, `filterRecord`, `filterPage`, `buildMeta`,
  `buildCapabilities`).
- **`ConfigReader`** — the read side of the store: published rows only,
  running in system mode so `MCPforce_User` needs no object permission on
  config (drafts remain structurally unreachable from chat).
- **`McpResources`** for all four widgets.
- **Contract test harness:** a script that calls each read tool against a
  scratch org, writes the JSON to `packages/core/src/__fixtures__/apex/`,
  and a vitest that validates those files with the zod schemas.

## Out of scope

Writes, flows, home card, Studio. The callout-to-self helper proven in
Session 0 (`OrgApi.cls`) is reused here for the list-view describe; do not
introduce a Named Credential for it.

## Read first

- `apps/mcp-server/src/server.ts` — each tool's current behaviour and result shape.
- `packages/core/src/assemble.ts`, `filtering.ts`, `payload.ts`, `capabilities.ts`.
- `packages/crm-adapters/src/salesforce/` — the SOQL/SOSL shapes and list-view handling being replaced by direct platform calls.
- `packages/widgets/src/record-card/mcp-app.tsx` and `results-table/mcp-app.tsx` — what the widgets read from `structuredContent`.

## Acceptance

- In Claude: "find accounts named Acme" → results table widget; click a row
  → record card widget with the published layout, denylisted fields absent.
- Contract tests pass on captured Apex payloads.
- Apex tests: denylisted field never appears in any payload even when the
  user has FLS on it; an object with no published layout gets the generic
  layout; a user lacking FLS on a field sees it omitted, not errored.
