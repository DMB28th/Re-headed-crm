# Proven Salesforce-only MCP Apps authentication recipe

Verified October 8, 2026. Read this before reopening Claude OAuth debugging.

## Known working route

1. Salesforce Site exposes a small public protected-resource metadata endpoint.
   Its `resource` must exactly match the MCP URL; its authorization server is
   the Salesforce org issuer. Unauthenticated MCP requests return401 with
   `WWW-Authenticate: Bearer resource_metadata="<exact metadata URL>"`.
2. Salesforce handles OAuth and bearer authentication. Named requests delegate
   to the renderer as the connected Salesforce user. Do not parse/forward tokens
   in custom code or add an external auth gateway.
3. Use a dedicated runtime External Client App, exact Claude callback
   `https://claude.ai/api/mcp/auth_callback`, api/refresh_token scopes, required
   PKCE and refresh rotation, public client ID with blank secret. For the proven
   Site route, this runtime app must issue **opaque tokens (JWT issuance OFF)**.
   This is a route-specific observed requirement, not a universal Salesforce rule.
4. In Claude choose Sign in now / Use your own OAuth client. Complete actual
   Salesforce consent. If changing issuance, disconnect/reconnect and consent
   afresh: a saved setting does not replace previously issued tokens.
5. Only public discovery/challenge is guest-accessible. Deny guest resource reads
   and tool execution before renderer delegation. No guest CRM object permission,
   renderer grant or unrelated Cardstack Apex grant. Named data access must retain
   sharing, CRUD/FLS and user-mode queries.
6. Serve a self-contained HTML resource with `text/html;profile=mcp-app`, tool
   `_meta.ui.resourceUri`, and the host bridge. Keep tested SDK1.7.4 until an
   intentional reviewed upgrade. UI calls server tools through `app.callServerTool`.

## The failure we diagnosed

Same dedicated client, callback, scopes, PKCE and Site handler: JWT ON entered
as guest/401 in real Claude; opaque issuance OFF entered as named user/200.
Real consent, discovery, synthetic tool execution, actual HTML iframe, bridge
readiness, exact typed echo, empty string and reload/echo subsequently passed.
Do not restart broad OAuth-provider speculation without evidence of a new failure.
Never use the old disabled probe apps as production configuration.

## Runtime OAuth versus deployment OAuth

These are separate apps and purposes. The dedicated Site runtime app needs opaque
issuance for this proven route. Card Stack SFAPP is the deployment CLI app:
temporarily JWT OFF plus a fresh managed opaque token for API67 SOAP Metadata;
always restore and verify Card Stack SFAPP JWT ON immediately after deployment,
including failures. Probe cleanup restored its runtime app JWT ON only because
that app was then disabled and its Site closed. That cleanup is not the active
runtime recipe. Do not turn JWT OFF on unrelated beta/ChatGPT apps.

## Regression gate before calling a new setup working

- Exact metadata resource/issuer and matching401 challenge.
- Missing and fabricated bearer cannot fetch HTML or execute tools.
- Named actor privately matches the connected Salesforce user.
- Actual client consent and correct interactive/app-only tool discovery.
- Actual iframe with host readiness; model prose/API success alone is insufficient.
- Exact seven keys/types/values: zero, false, Unicode/quotes, multiline and empty
  text; full chat reload followed by another successful host-mediated echo.
- Verify temporary cleanup: inactive Site, zero guest object/class/page grants,
  disabled disposable app, deployment JWT ON and owned debug traces removed.

Never print consumer secrets, bearer tokens, auth codes/state, raw private logs
or identity IDs. Consumer Key/Secret UI rows can include both credentials: capture
only the public client ID privately; do not dump or screenshot that page.

## Saved evidence and remaining product work

[Actual Claude proof](CLAUDE_MCP_APPS_UI_PROOF_2026-10-08.md).
Sanitized deployment/API/client/cleanup receipts are in
`evidence/claude-ui-2026-10-08/`; the exact tested wrapper/test source is archived
there outside deployable force-app. Screenshots preserve the actual exchange.
The existing ChatGPT synthetic renderer proof also passed. Beta HXL stays in place
until the governed replacement passes review/confirm/save/refresh in both clients.

This recipe is verified in one development org. Multi-org installation, ordinary-
user permissions, token refresh longevity, host-denial handling, confirmed CRM
writes and fresh package installation remain product gates. Implement an approved
install design and regression automation before treating this as production-ready.
