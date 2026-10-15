# Salesforce-only custom MCP Apps: actual Claude UI proof

October 8, 2026, 20:33–20:38 UTC. User-approved disposable UI spike after opaque
OAuth comparison passed. No product package or HXL cutover.

Actual Claude Opus 5.5 connected through Salesforce Site discovery and new Local
ECA `Cardstack Claude UI Delivery Probe`, opaque issuance, required PKCE and public
client ID without secret. Claude discovered one interactive and one app-only tool.
`open_cardstack_apex_probe` rendered the unchanged Salesforce StaticResource HTML
inside Claude's nested MCP App iframe. Host bridge reported ready. No substitute
artifact or model-produced form.

[Actual proof chat](https://claude.ai/chat/84883358-2a9c-4ff7-9ce5-daf8342038a1).

The form called `echo_cardstack_values` through `app.callServerTool`. Returned
JSON matched all seven keys, values and types: text `café ✓ "quoted"` (string),
amount `0` (number), accepted `false` (boolean), choice `beta` (string), rating
`hot` (string), notes `first\nsecond` with an actual newline (string), enabled
`false` (boolean). A second submission preserved empty text and the other six
values. Full chat reload rebuilt the widget/bridge and another exact exchange
passed. Form state reset on reload; durable draft restoration remains unproved.
Chat composer briefly covered Submit; scrolling to latest exposed it.

Only disposable Site wrapper/test were deployed: API67/SOAP, rollbackOnError,
2 components, 40 focused tests passed, 0 failures, Site class 69/70 locations.
New `/ui-metadata` identifies `/ui-mcp`; guest denied before named delegation to
unchanged renderer. SDK1.7.4 and HTML unchanged, fixed StaticResource query uses
WITH USER_MODE. No CRM queries/writes, callouts or external runtime hosting.
Prepared PMD: 0 Critical, 0 High, 35 Moderate, 21 Low retained diagnostic/style/
assertion findings. Complete package/release suite was not run.

API gates passed exact metadata/challenge, missing/fabricated bearer resource
denial, connected-user identity, tool metadata, URI, MIME, deployed HTML hash and
typed echo. Bounded ERROR-only traces: 17 authenticated entries during Claude
consent/discovery/widget/echo, all named LogUserId values privately matched CLI
connected identity. No actor IDs, raw logs, credentials, codes or states emitted.

Cleanup verified: Card Stack SFAPP JWT ON immediately after deployment; new UI
ECA JWT ON then Disabled; Site Inactive; zero guest object rows, class grants and
page grants; owned trace flags/DebugLevel removed. Public `/ui-metadata` and
`/ui-mcp` both platform401 without custom pointer. Retained connector/chat is
historical proof, its OAuth app disabled. Beta and ChatGPT setup unchanged.

This passes actual Claude auth/discovery/resource/host-bridge feasibility alongside
earlier actual ChatGPT synthetic renderer proof. Next product gate: approved
package/install discovery and per-org OAuth design, then bounded review/confirm/
save/refresh flow in both clients. Preserve connected-user sharing/CRUD/FLS,
exact-value confirmation binding and Apex durable state. Refresh longevity,
ordinary-user permissions, multi-org install, confirmed CRM writes, fresh install
and production release remain unproved. Keep HXL beta until replacement passes.

Private evidence:
`/Users/danielben-atar/Documents/Codex/2026-10-05/codex-handoff-cardstack-native-salesforce-package/work/site-ui-delivery-probe/`.
Receipts: deploy-receipt.json, ui-api-receipt.json, claude-ui-receipt.json,
cleanup-actor-receipt.json. Screenshots: claude-ui-exact-values.png,
claude-ui-empty-value.png, claude-ui-reload-proof.png, deployment-jwt-restored.png,
ui-app-disabled-jwt-on.png, ui-site-inactive.png. Original wrapper remains in
sibling auth probe directory for rollback.
