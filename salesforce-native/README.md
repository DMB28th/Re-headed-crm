# Cardstack native Salesforce beta

`force-app/` is the authoritative deployable source. API version is **67.0**. Legacy Node/Railway applications are retired. The sibling `config/`, `audit/`, `admin-lwc/`, and `permissions/` exports are historical copies; their required metadata is consolidated in `force-app`. `compatibility/` contains retired types and spike widgets, excluded from current deployment.

Cardstack runs entirely in Salesforce: 16 community-beta Hosted MCP tools, HXL widgets, a Lightning Studio app, configuration drafts/publishing, and audit services. Execution uses the connected user, sharing, and user-mode queries. There is no delete-record tool.

## Beta limits

- Record cards use `cardstackRecordV2`, with Highlights Panel, named sections, full-width fields, and one/two/three-column section layouts. The Classic-style Studio editor has a searchable draggable field palette above the card canvas. Older flat configs remain supported. Each record-card tool call takes exactly one input; call separately for multiple cards.
- Named list views use a clearly labeled user-mode SOQL fallback. Arbitrary Salesforce saved-view filters, columns, and sorting are **not reproduced**. “My” filters never broaden to other owners when empty. Saved Cardstack filters remain supported.
- Hosted MCP fatally rejects `UserInfo.getSessionId()` in the named-view path. The beta removes self-REST access rather than relying on catches.
- The compatible list renderer uses `cardstackTableV2`, iterating returned `rows` and their `cells`. The list tool uses versioned Lightning types `cardstackListViewOutputValuesV2` and `cardstackListViewResultV3`; old immutable schemas referenced nonexistent Apex classes.
- The beta unlocked package contains Apex, Studio, and configuration/audit objects. HXL widgets, Lightning types, and the Hosted MCP definition require companion setup. Salesforce's package validation org rejected widgets as unavailable; McpServerDefinition is not supported in unlocked packages. This distribution gap is explicitly deferred for later investigation.
- OAuth External Client Apps are configured per org. Do not distribute this development org's OAuth configuration as subscriber setup. Assign Cardstack Admin to admins and Cardstack User to connected users; ensure connected users also have the required Apex tool access, CRM object/field permissions, and Hosted MCP access.

## Governed chat edits

Published `permissions.writeEnabled` must be true and each writable field must explicitly set `editable:true`. Read-only fields, the denylist, Salesforce access, and required values are enforced on the server. Old layouts default to disabled editing. Stage Draft never authorizes a live change.

Record updates and task completion require a fresh preview token bound to the connected user, exact values, published policy, and reviewed record state. Successful confirmations store a receipt and retries do not repeat the write. Tokens expire after 15 minutes; previews made before this upgrade must be recreated. The private Confirmation object is server-owned; do not grant users direct CRUD access.

The legacy create-record Apex action is retained for compatibility but is excluded from the community MCP definition until it supports governed preview/confirmation. Create records in Salesforce for this beta. There is no delete-record tool.

Chat edits currently collect answers through the conversation and render review/result cards. General editable HXL forms and Screen Flow interviews inside chat remain future milestones; launch cards clearly open Salesforce.

## Development deployment

Before every deployment session, turn OFF JWT-based access tokens on Card Stack SFAPP and obtain a fresh opaque CLI login. After deployment, restore JWT to **ON** for Claude. Never log credentials or session values.

```sh
sf org login web --alias cardstack-spike2
sf project deploy start --source-dir force-app --target-org cardstack-spike2 --api-version 67.0
sf apex run test --target-org cardstack-spike2 --test-level RunLocalTests --result-format json --wait 10 --api-version 67.0
```

See `package/UNLOCKED_PACKAGE.md` for the beta build and companion setup. Do not promote the beta.

## Flow launch cards (beta)

Studio Flows is a searchable launch-card list with a two-step editor: choose an active, launchable Salesforce flow, then name and review its card. Draft cards appear in the list and must be published before their names apply in chat. The native flow tools open Salesforce for execution; they do not execute interviews, collect or submit flow inputs, or cancel interviews already running in Salesforce. Legacy setup metadata is retained when editing cards. Custom Screens has been retired from Studio and new package source.

## Live edit acceptance still open

The native Claude catalogue refreshed successfully after server reactivation. The disposable Account lookup rendered, but Preview Update returned "No approval received" twice during browser QA. No confirmation token or live save receipt was obtained. This release therefore does not claim end-to-end Claude editing acceptance despite passing Apex tests. The original published Account layout was restored and the disposable Account was removed; both were independently queried. Resolve client approval delivery and repeat preview/confirm/read-back before presenting chat editing as verified.
