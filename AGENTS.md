# AGENTS.md

Product overview and rules live in `CLAUDE.md`, `README.md`, and `PLAN.md`. Commands
are documented in `README.md` and the root `package.json` scripts. Read those first.

## Cursor Cloud specific instructions

The dev environment is fully self-contained — **no external services are required**.
By default everything runs against the in-repo mock CRM adapter with a file-backed
config store (`data/cardstack-config.json`) and an in-memory/file audit log. Postgres
is optional and only used when `DATABASE_URL` is set (the config-store tests exercise
that path in-memory via `pglite`, so no live Postgres is needed for `pnpm test`).

Non-obvious gotchas:

- **Run `pnpm build` once before `pnpm demo:*` or the dev servers.** Workspace
  packages resolve to their build outputs (`packages/*/dist`, `packages/widgets/node`
  + `packages/widgets/dist/*.html`), and the MCP server serves the record-card /
  results-table / home-card widgets from `packages/widgets/dist/*.html`. Without a
  build, package imports and widget rendering fail. `pnpm build` is not in the startup
  update script (kept to `pnpm install`), so do it yourself before running anything.
- **`pnpm lint` is a no-op** — no package defines a `lint` task; typecheck + tests +
  build are the real checks (mirrors `.github/workflows/ci.yml`).
- The two apps are coupled only through the shared config store file. Start the MCP
  server (`pnpm --filter @cardstack/mcp-server dev`, :3001, `/mcp` + `/healthz`) and
  Studio (`pnpm --filter @cardstack/studio dev`, :3002); publishing a layout in Studio
  shows up in the MCP server's very next render (no restart) because both read/write
  `data/cardstack-config.json`.
- The MCP endpoint is streamable HTTP. To drive it by hand, `POST /mcp` with
  `Accept: application/json, text/event-stream`; responses come back as SSE `data:`
  lines. `crm_search`'s `query` is a literal text match over the mock fixtures, not a
  filter DSL (e.g. `"Meridian"` matches; `"open deals over 50k"` matches nothing).
- On boot the MCP server logs warnings that `/mcp` is unauthenticated and CORS is
  wildcard — expected in dev (set `MCP_SHARED_SECRET` / `CORS_ORIGINS` only for
  deployment).
