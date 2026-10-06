# Cardstack native Salesforce beta

`force-app/` is the authoritative deployable source. API version is **67.0**. Legacy Node/Railway applications are retired. The sibling `config/`, `audit/`, `admin-lwc/`, and `permissions/` exports are historical copies; their required metadata is consolidated in `force-app`. `compatibility/` contains retired types and spike widgets, excluded from current deployment.

Cardstack runs entirely in Salesforce: 17 community-beta Hosted MCP tools, HXL widgets, a Lightning Studio app, configuration drafts/publishing, and audit services. Execution uses the connected user, sharing, and user-mode queries. There is no delete-record tool.

## Beta limits

- Record cards use `cardstackRecordV3`, with Highlights Panel, named sections, full-width fields, and one/two/three-column section layouts. The Classic-style Studio editor has a searchable draggable field palette above the card canvas. Older flat configs remain supported. Each record-card tool call takes exactly one input; call separately for multiple cards.
- Named list views use a clearly labeled user-mode SOQL fallback. Arbitrary Salesforce saved-view filters, columns, and sorting are **not reproduced**. “My” filters never broaden to other owners when empty. Saved Cardstack filters remain supported.
- Hosted MCP fatally rejects `UserInfo.getSessionId()` in the named-view path. The beta removes self-REST access rather than relying on catches.
- The compatible list renderer uses `cardstackTableV2`, iterating returned `rows` and their `cells`. The list tool uses versioned Lightning types `cardstackListViewOutputValuesV2` and `cardstackListViewResultV3`; old immutable schemas referenced nonexistent Apex classes.
- The beta unlocked package contains Apex, Studio, and configuration/audit objects. HXL widgets, Lightning types, and the Hosted MCP definition require companion setup. Salesforce's package validation org rejected widgets as unavailable; McpServerDefinition is not supported in unlocked packages. This distribution gap is explicitly deferred for later investigation.
- OAuth External Client Apps are configured per org. Do not distribute this development org's OAuth configuration as subscriber setup. Assign Cardstack Admin to admins and Cardstack User to connected users; ensure connected users also have the required Apex tool access, CRM object/field permissions, and Hosted MCP access.

## Governed chat edits

Published `permissions.writeEnabled` must be true and each writable field must explicitly set `editable:true`. Read-only fields, the denylist, Salesforce access, and required values are enforced on the server. Old layouts default to disabled editing. Stage Draft never authorizes a live change.

Record updates and task completion require a fresh preview token bound to the connected user, exact values, published policy, and reviewed record state. Successful confirmations store a receipt and retries do not repeat the write. Tokens expire after 15 minutes; previews made before this upgrade must be recreated. The private Confirmation object is server-owned; do not grant users direct CRUD access.

The legacy create-record Apex action is retained for compatibility but is excluded from the community MCP definition until it supports governed preview/confirmation. Create records in Salesforce for this beta. There is no delete-record tool.

Native HXL editing now presents one Account text/integer field per step, retaining exact answers on the server through Back, Review, Cancel, and Resume. Description and Employees passed live Claude widget-input, validation, stale-review rejection, save, independent read-back, and refreshed-card QA. Buttons prepare a message in Claude's composer; send that message to continue. Review and its exact confirmation precede every save. The private Interaction object is server-owned; do not grant direct CRUD access.

The initial adapter supports up to 20 published editable Account text/integer fields. Picklists, dates, lookups, simultaneous multi-field forms, other record types, and Screen Flow interviews are not implemented in this adapter. Other editable field types are omitted. ChatGPT parity for the new editor is unverified. Existing Salesforce flow launch cards remain available.

## Published record actions

Objects → Actions now lets admins choose an in-chat Account edit process or a published Salesforce flow launch card. Guided inputs map starting values from current values, exposed record fields, constants, or user answers. The card binds the record ID; defaults become writes only after submitted answers, review, and exact confirmation. Disabled or invalid actions are omitted. Keep current after Back removes the prior answer. See [Record actions](docs/RECORD_ACTIONS.md).

## Development deployment

Before every deployment session, turn OFF JWT-based access tokens on Card Stack SFAPP and obtain a fresh opaque CLI login. After deployment, restore JWT to **ON** for Claude. Never log credentials or session values.

```sh
sf org login web --alias cardstack-spike2
sf project deploy start --source-dir force-app --target-org cardstack-spike2 --api-version 67.0
sf apex run test --target-org cardstack-spike2 --test-level RunLocalTests --result-format json --wait 10 --api-version 67.0
```

See `package/UNLOCKED_PACKAGE.md` for the beta build and companion setup. Do not promote the beta.

## Flow launch cards (beta)

Studio Flows is a searchable launch-card list with a two-step editor: choose an active, launchable Salesforce flow, then name and review its card. Draft cards appear in the list and must be published before their names apply in chat. The native flow tools open Salesforce using its Lightning flow URL and pass the current recordId. They do not interpret flow screens, submit user-entered answers to a running interview, or cancel interviews already running in Salesforce. Legacy setup metadata is retained when editing cards. Custom Screens has been retired from Studio and new package source.

## Live Claude edit acceptance — follow-up passed

A fresh Claude chat successfully ran Preview Update, rendered the two-field before/after HXL card, asked for confirmation, then ran Update Record after explicit confirmation and one-time tool approval. Independent Salesforce SOQL confirmed Description = Community beta confirmed edit and NumberOfEmployees = 0 on the disposable Account. The earlier No approval received failures did not reproduce; interrupted-chat state or approval timing remains the likely cause, not a proven Salesforce defect. No application code change was needed. This proves conversational preview/confirm/save for this two-field case, not direct editable form submission or Screen Flow interviews. Cleanup restored the original published Account policy and removed the disposable Account, with independent verification.

## Native editor release

Core beta 0.1.0.8: 84% package coverage; 167 installed-package tests and 172 development-org tests passed, with 26 Studio model tests. Published mapped record actions passed the complete Claude input/review/confirmation/save/refreshed-card path. Salesforce flow handoffs use the Lightning runtime with verified record context. The core installs separately from the HXL/MCP companion. See the package guide and verification report.
