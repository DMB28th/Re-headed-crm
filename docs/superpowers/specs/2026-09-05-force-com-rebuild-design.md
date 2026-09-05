# MCPforce — rebuilding Cardstack on Force.com

Date: 2026-09-05
Status: design agreed in brainstorming; awaiting spec review
Supersedes, once shipped: the Node/Next.js architecture in PLAN.md,
`docs/accounts-and-workspaces.md`, `docs/salesforce-oauth-support.md`, and the
Railway deployment.

## Name

**MCPforce** is a working name, expected to change. It is the Lightning app
label and the prefix on permission sets, custom settings and static
resources; all of those are renameable in an unlocked package. "Cardstack"
remains the name of the Node codebase being retired, and of nothing else.
The `ui://mcpforce/*` resource URIs are new; the widget bundles never read
their own URI, so they are unaffected.

**The namespace is the one permanent choice, so it must not carry the
name.** Session 0 registers a short, neutral namespace (for example `rcrd`
or `cstk`, whatever is free) rather than `mcpforce`. Known constraint on the
eventual name: Salesforce's partner trademark guidelines do not permit
partner product names containing "force", which matters at the AppExchange
step, not before.

## Why

Cardstack today runs as a hosted Node MCP server plus a Next.js Studio, with
its own accounts, workspaces, encrypted CRM tokens, and a Postgres config
store. Most of that machinery exists to answer one question — "which
Salesforce org, as which user, with what metadata access?" — that Salesforce
already answers for anything running inside the org. Rebuilding on-platform
removes the metadata OAuth leg, token storage and rotation, tenancy, and the
self-serve account system, and puts Studio where the admin already works.

## Decisions (do not relitigate without new evidence)

1. **Everything runs in the org.** MCP server is Apex REST; Studio is a
   Lightning app; config and audit are custom objects; widgets are static
   resources. There is no off-platform runtime component. The alternative — a
   stateless off-platform "front door" owning discovery and OAuth — was
   considered and rejected in favour of zero infra.
2. **Connector setup is guided manual, not one-click.** An org domain cannot
   serve MCP discovery documents or anonymous dynamic client registration, so
   a rep adds a custom connector by pasting the endpoint URL and the packaged
   connected app's consumer key and secret, then logs into Salesforce.
   MCPforce's Connect page shows those values. Session 0 proves this works on
   Claude before any tool is written; if a host cannot complete the flow with
   a manual client id, that host is out until it can.
3. **Unlocked package first, managed 2GP later — with the namespace
   registered on day one.** The unlocked package carries the namespace so
   the later managed package reuses every API name unchanged.
4. **Studio is native Lightning.** SLDS and base components throughout,
   including the layout builder. Hard rule 6 ("UI must match /design") is
   retired for the on-platform build; the /design canvas remains the
   reference for *what* each surface does, not how it looks.
5. **v1 scope is core + home card, flows as handoff only.** The native
   screen-flow interpreter and quick actions are a later session. Custom
   screens are dropped (config with no runtime).
6. **Salesforce only.** HubSpot and the mock adapter are retired. The
   `CrmAdapter` abstraction disappears; Apex talks to the platform directly.

## Architecture

Four parts, all inside one package installed per org. The org is the tenant,
the rep's Salesforce user is the identity, and sharing plus field-level
security do the access work the adapter and config store used to do.

1. **MCP runtime (Apex).** One `@RestResource` class at
   `/services/apexrest/<ns>/mcp` speaks stateless JSON-RPC over POST:
   `initialize`, `notifications/initialized` (202), `tools/list`,
   `tools/call`, `resources/list`, `resources/read`, `ping`. GET returns 405
   (no SSE). It runs as the calling rep, so every SOQL and DML is already
   scoped; the platform validates the bearer token before Apex runs, so the
   runtime contains no auth code.
2. **Widgets (static resources).** The four existing bundles
   (`record-card`, `results-table`, `home-card`, `flow-run`) built exactly
   as today by `packages/widgets` and copied into the package as static
   resources. `resources/read` queries `StaticResource.Body` and returns the
   HTML with the same `_meta` as today. The widget ↔ host contract does not
   change.
3. **Config (custom objects).** One object per governed surface, all sharing
   the draft / published / history shape so the staging engine is written
   once. Custom objects, not custom metadata, because drafts need ordinary
   DML from Studio and custom metadata can only be written by an async
   deploy.
4. **Studio (Lightning app).** SLDS app with tabs: Home, Pending changes,
   Objects (single tab, left list — tabs cannot be dynamic), Home card,
   Flows, Audit log, Connect. Visible only to `MCPforce_Admin`.

Off-platform at runtime: nothing. Build tooling only: `sf` CLI for deploys
and packaging, pnpm for the widget bundles.

### Repo strategy

Same repo. A new SFDX project at `force-app/` (root `sfdx-project.json`,
namespace set). `packages/widgets` stays as the widget build; its `dist/`
output is copied into `force-app/main/default/staticresources/`.
`packages/core` stays as the JSON contract's source of truth: its zod schemas
and fixtures become contract tests asserting the Apex runtime's output matches
the shapes the widgets expect. `apps/mcp-server`, `apps/studio`,
`packages/config-store`, and `packages/crm-adapters` are retired in Session 7,
not before. `salesforce-metadata/` (test flows for the interpreter spike)
folds into `force-app/` as unpackaged test metadata.

### What is knowingly lost

One-click connector setup, multi-CRM, self-serve accounts and workspaces,
the Node deployment on Railway, custom screens.

## Data model and security

### Config objects

| Object | Key fields | Payload |
|---|---|---|
| `Card_Layout__c` | `Object_Api__c`, `Audience__c` | layout JSON (`LayoutConfig`) |
| `View_Exposure__c` | `Object_Api__c` | exposures JSON (`ViewExposuresConfig`) |
| `Flow_Render_Mode__c` | `Flow_Api_Name__c` | `Mode__c` (auto / native / embedded), `Active__c` |
| `Home_Card__c` | `Audience__c` | blocks JSON (`HomeCardConfig`) |

Every row carries `Status__c` (Draft / Published / History), `Revision__c`
(number), `Config__c` (long text area, 131 072 chars — the JSON), and
`Revision_Name__c` (optional label). Uniqueness: at most one Draft and one
Published per key, enforced by a `Unique_Key__c` external-id text field
computed in a before-insert/update trigger as `<key>|<status>` for Draft and
Published rows (History rows get `<key>|history|<revision>`). The JSON stays
JSON rather than being normalised into fields because the widgets consume it
whole and the zod schemas in `packages/core` remain the contract. Apex
validates shape on save with a hand-written validator mirroring the schema;
the contract tests catch drift between the two.

`Audience__c` keeps the "default" placeholder the current schema carries
(role-based layouts are still future work).

### Publish and audit objects

- `Publish_Event__c`: `Surface__c` (layout / exposures / flows / homecard),
  `Key__c`, `Audience__c`, `Revision__c`, `Kind__c` (publish / rollback),
  `Batch_Id__c`, `Actor__c` (lookup User). Publishing a batch is sequential
  per surface, never atomic; partial failure is reported row by row exactly
  as `docs/studio-staging-model.md` describes.
- `Audit_Entry__c`: `Actor__c`, `Object_Api__c`, `Record_Id__c`,
  `Field_Api__c`, `Before__c`, `After__c`, `Tool__c`, `Confirmed__c`
  (checkbox — "rep confirmed" as verified by the server),
  `Confirmation_Token_Hash__c`, `Occurred_At__c`. Written by a
  `without sharing` Apex class, so reps need no DML permission on it and
  cannot fabricate rows through the API. Admins get read-only.

### Permission sets

- `MCPforce_Admin`: the MCPforce app and all tabs, CRUD on the four config
  objects and `Publish_Event__c`, read on `Audit_Entry__c`, access to the
  Apex classes behind `@AuraEnabled` methods.
- `MCPforce_User`: connected-app access and access to `McpEndpoint`. No
  object permission on config, audit or publish objects: the runtime's
  `ConfigReader` reads Published rows in system mode, so a rep can reach
  config only through the tools, never through the API.

Neither grants anything on CRM objects; the rep's existing profile does.

### Connected app

Packaged. OAuth with PKCE, scopes `api refresh_token openid`, refresh-token
flow enabled, callback list covering known hosts' redirect URIs (Claude web,
Claude Desktop, ChatGPT, Copilot — captured in Session 0). Consumer key is
readable at runtime from `ConnectedApplication`; the consumer secret is not,
so the Connect page reads it from a protected custom setting
(`MCPforce_Settings__c.Consumer_Secret__c`) filled by the admin once from
Setup → Manage Connected Apps, with the page linking straight there.
Session 0 confirms whether a post-install script can fill it instead.

### Confirmation provenance (hard rule 8, preserved)

`crm_preview_update` computes the diff and returns an HMAC-SHA256 token
bound to `(object, recordId, sorted field diff, actor, expiry)` using
`Crypto.generateMac` with a per-org key stored in
`MCPforce_Settings__c.Signing_Key__c` (protected custom setting, generated
at install by the post-install script, never displayed). `crm_update_record`
verifies the token, re-reads the record, and refuses if the diff no longer
matches. Handoff flow state is signed with the same key. Never widen a write
tool to accept a boolean or caller-supplied confirmation; never let the
signer run unsigned when the key is missing — refuse the write instead.

### What is gone

Tenants, workspaces, accounts, memberships, sessions, connection tokens, the
KV. No row anywhere holds a credential.

## The MCP runtime in Apex

- **`McpEndpoint`** (`@RestResource(urlMapping='/mcp')`) parses the JSON-RPC
  envelope, routes by method, and shapes errors (`-32601` unknown method,
  `-32602` bad params, `-32603` internal with the Apex exception message).
- **`McpTools`** holds a static registry of classes implementing
  `McpforceTool { String name(); Map<String,Object> inputSchema();
  Map<String,Object> call(Map<String,Object> args); }`. One class per tool.
- **`McpResources`** maps `ui://mcpforce/record-card`, `results-table`,
  `home-card`, `flow-run` to static resources.
- **`PayloadAssembler`** is the Apex port of `packages/core/src/assemble.ts`
  plus `filtering.ts`: published config + describe + record data →
  `structuredContent`. The `_meta` shapes for MCP Apps are lifted from
  `@modelcontextprotocol/ext-apps` types into fixtures during Session 0.
- **Where the adapter went:** `describeObject` → `Schema.describeSObjects`
  (already FLS-aware); `search` → SOSL; `listView` → the ListView describe
  REST endpoint (a callout to self via a Named Credential, the one place the
  runtime calls the API) then SOQL; `getRecord` / `getRelated` → SOQL from
  the config's field set; `aggregate` → SOQL aggregate. The denylist is
  applied in Apex before assembly, so hard rule 2 is enforced twice: FLS and
  config.

Tools carried to v1, names unchanged:

| Group | Tools |
|---|---|
| Read | `crm_list_objects`, `crm_search`, `crm_list_view`, `crm_get_record`, `crm_get_related`, `crm_lookup_search`, `crm_aggregate`, `crm_home` |
| Write (confirmed) | `crm_preview_update` → `crm_update_record`, `crm_preview_complete_task` → `crm_complete_task`, `crm_create_record` |
| Flows, handoff only | `crm_flow_start`, `crm_flow_continue`, `crm_flow_cancel` |
| Deferred | `crm_quick_action_start`, native branch of `crm_flow_*` |

Limits to design around: one tool call is one transaction — 100 SOQL, 100
callouts, 10 s CPU, 6 MB heap, 12 MB response. `crm_home` is the only
fan-out tool and batches its queries with capped tile counts.

## Studio as a Lightning app

- **Object pages:** Layout / Exposures / Actions sub-tabs. The layout builder
  is card-shaped (header, sections in a 1/2/3-column grid, related lists,
  actions) with HTML5 drag events and keyboard reorder; each field has one
  settings popover (Access, Input control). The palette comes from
  `Schema.describe` via `@AuraEnabled`, reflecting the admin's FLS.
- **Live preview:** collapsed panel; when opened, Apex assembles a real
  payload for a sample record and the LWC posts it into an iframe loading
  the record-card static resource. The preview is the real widget.
- **Drafts and publishing:** autosave to the Draft row; Pending changes lists
  every surface whose Draft differs from Published with a per-surface diff
  from Apex and a count badge; publish sequential per surface with row-level
  failure reporting; rollback republishes a History revision. One engine:
  `StagingService`.
- **Flows page:** lists org-authored screen flows from `FlowDefinitionView`
  (a regular sObject — do not query it via Tooling), toggles `Active__c`,
  picks render mode, and states plainly that native rendering is not built.
- **Connect page:** endpoint URL, consumer key, consumer secret, copy
  buttons, per-host walkthrough. Content comes from Session 0.
- **Audit log:** list over `Audit_Entry__c` with object / actor / record or
  field / date filters; CSV export via a Visualforce page.

## Testing strategy

- Apex tests per tool and per service class; one end-to-end test posting a
  JSON-RPC sequence through `McpEndpoint`.
- Jest for LWC with mocked Apex.
- Contract tests: `packages/core` zod schemas validate captured Apex payloads
  (fixtures refreshed by a script that runs the tools against a scratch org).
- Per-session acceptance is a golden path running in a scratch org, mirrored
  from the current `pnpm demo:m*` scripts.

## Sessions

| # | Session | Delivers | Needs |
|---|---|---|---|
| 0 | Spike and foundation | Dev Hub, namespace, SFDX project, scratch-org def, packaged connected app, hello-world `McpEndpoint` serving one widget, Claude connects with manual client id, `_meta` fixtures, go/no-go | — |
| 1 | Config objects and staging | Four config objects, publish event, audit entry, both permission sets, `StagingService` | 0 |
| 2 | Read path | JSON-RPC dispatch, tool registry, read tools, `PayloadAssembler`, denylist, resources. Golden Path 1 | 1 |
| 3 | Write path | HMAC confirmation provenance, preview/update, create, task check-off, system-mode audit. Golden Path 2 | 2 |
| 4 | Studio core | App shell, object pages, layout builder, live preview, pending changes, publish, rollback. Golden Path 3 | 1, 2 |
| 5 | Home card | `Home_Card__c` builder tab, `crm_home`. M4 on-platform | 3, 4 |
| 6 | Governance surfaces | Exposures, actions editor, flows (handoff), Connect page, audit log tab | 3, 4 |
| 7 | Package and cutover | Unlocked package, install script, CI, retire Node apps, rewrite CLAUDE.md, decommission Railway | 5, 6 |

Later, not v1: native screen-flow interpreter and quick actions in Apex.

Sessions 2 and 4 can run in parallel after 1; 5 and 6 after 3 and 4.
Each session has a brief in `docs/superpowers/specs/force-com/` that a fresh
coding session opens with before running the planning skill.
