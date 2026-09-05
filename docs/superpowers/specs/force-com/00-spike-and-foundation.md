# Session 0 — Spike and foundation

**Goal:** prove the two things the whole rebuild rests on, and leave behind
the skeleton every later session builds in. Ends with a written go/no-go.

## Must prove

1. **A chat host connects with a manually entered client id.** Add the
   scratch org's MCP endpoint as a custom connector in claude.ai (and Claude
   Desktop), enter the packaged connected app's consumer key and secret,
   and complete Salesforce login. Record exactly which discovery documents
   the host fetched (check the org's login history and, if possible, the
   host's network log): does it find Salesforce's authorization and token
   endpoints via `https://<my-domain>/.well-known/openid-configuration`? Does
   it send RFC 8707 `resource` to the authorize endpoint and does Salesforce
   tolerate it? Repeat for ChatGPT and Copilot if accounts exist; record each
   host as works / fails / untested.
2. **Apex REST can serve MCP Apps.** A hello-world `McpEndpoint` answering
   `initialize`, `tools/list` (one tool, `crm_ping`), `tools/call`,
   `resources/list`, `resources/read` returning the real `record-card.html`
   static resource with the right `_meta`. The host must render the widget.

## Also deliver

- **Dev Hub and namespace.** No Dev Hub is configured today (`sf org list`
  shows only `screenflow-org`). Enable Dev Hub on a Developer Edition org,
  register the namespace (a separate Developer Edition org owns it), link it.
  Pick the namespace with the admin; it is permanent.
- **SFDX project at `force-app/`** with root `sfdx-project.json`
  (`namespace` set, `sourceApiVersion` current), `config/project-scratch-def.json`,
  `.forceignore`, and a `scripts/` folder with `org:create`, `deploy`,
  `test` wrappers. Move `salesforce-metadata/` flows into an unpackaged
  `force-app/test/` directory and delete `salesforce-metadata/`.
- **Widget copy step.** A pnpm script that builds `packages/widgets` and
  copies each `dist/*.html` into
  `force-app/main/default/staticresources/mcpforce_<name>.resource` with
  its `.resource-meta.xml` (`contentType text/html`, `cacheControl Private`).
- **Packaged connected app** metadata (`ConnectedApp`), PKCE required,
  refresh-token flow, scopes `api refresh_token openid`, callback URLs for
  every host that passed. Document the callback URIs in the brief's output.
- **Fixtures.** Read `node_modules/@modelcontextprotocol/ext-apps` types and
  capture the exact `_meta` shapes for tool results and `ui://` resources into
  `force-app/test/fixtures/mcp-apps-meta.json`; the Apex code uses these, not
  training data (hard rule 7).
- **Optional trick to test:** whether a Salesforce Site can serve
  `/.well-known/oauth-protected-resource` via `Site.UrlRewriter`, and whether
  the `/services/oauth2/register` DCR endpoint is usable. If either works it
  narrows the gap to one-click; record the result either way.

## Out of scope

Any real tool, any config object, any Studio UI.

## Read first

- `apps/mcp-server/src/server.ts` — how resources and `_meta` are registered today.
- `apps/mcp-server/src/main.ts` — the stateless streamable-HTTP setup being replaced.
- `docs/superpowers/specs/2026-08-11-one-click-salesforce-connection-design.md` — the existing Cardstack-owned connected app and its callback URLs.
- Memory note `salesforce-local-dev` — `sf` CLI gotchas (`SF_TEMP_SHOW_SECRETS`, redaction).

## Acceptance

- Claude renders the record-card widget from `crm_ping` inside a chat against
  a scratch org, with login done through the packaged connected app.
- `docs/superpowers/specs/force-com/00-result.md` exists with: per-host
  result table, discovery documents observed, callback URIs, namespace,
  Dev Hub username, and a one-line go/no-go.
- If no-go: the result doc states which host failed and how, and recommends
  the stateless front door from the overview's rejected alternatives.
