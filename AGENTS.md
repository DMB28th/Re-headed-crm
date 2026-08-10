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
- On boot the MCP server prints how `/mcp` is gated. In dev with nothing
  configured it warns that `/mcp` is open and that CORS is wildcard — expected
  locally. In production it refuses to start unless there is EITHER per-user
  OAuth (`CARDSTACK_USER_AUTH=oauth`) OR `MCP_SHARED_SECRET`; it also refuses
  without `CARDSTACK_ENCRYPTION_KEY`. Deployed today it logs
  `MCP auth: per-user OAuth`.
- **Demos need an identity.** The `demo:*` scripts set `CARDSTACK_DEV_IDENTITY=1`
  for you, because Studio and MCP auth now fail closed without one. If you write
  a new script that talks to the store, it needs the same.
- **Turbo caches per working tree.** After pulling, run `pnpm build` before
  trusting a test run: a stale `packages/*/dist` produces failures that look like
  real regressions but are just an out-of-date build (this cost real time on
  2026-08-10 — 8 phantom failures from a week-old `dist`).
