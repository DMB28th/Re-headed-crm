# Cardstack community beta 0.1.0.6

[Install the core beta](https://login.salesforce.com/packaging/installPackage.apexp?p0=04tg8000000QRZFAA4).

This unpromoted unlocked beta contains Apex tools, Studio, configuration/audit, private confirmations, and native edit interaction storage. It built with 83% Apex coverage. Version 0.1.0.6 installed successfully in a disposable Developer scratch org after a fresh 0.1.0.5 installation; all 157 installed-package tests passed. All 162 development-org Apex tests and 20 Studio model tests passed. Version 0.1.0.6 also installed successfully in cardstack-spike2. Keep this version beta; do not promote it.

## Companion setup

HXL widgets, Lightning types, and the Hosted MCP definition require a separate companion deployment. Package validation orgs did not provide HXL, and McpServerDefinition is not supported in unlocked packages. The subscriber org must have HXL and Hosted MCP enabled. The core link is not single-link onboarding.

Assign Cardstack Admin to administrators and Cardstack User to connected users, together with the required Salesforce CRM, Apex, and Hosted MCP access. Configure an External Client App and OAuth connector for the subscriber org. Deploy package/companion.xml from this source with API 67.0, then activate the Cardstack definition. Connect Claude to https://api.salesforce.com/platform/mcp/v1/custom/Cardstack. Refresh its tools list and start a fresh chat after tool schema changes: existing chats can retain old input declarations.

The community definition contains 17 tools. Create Record is excluded until it has governed preview/confirmation. No Delete Record tool exists. Do not distribute the development org's OAuth configuration or secrets. Private Confirmation and Interaction objects are server-owned; users must not receive direct CRUD access.

API 67 Metadata deployment in the development org requires temporarily disabling JWT access tokens, obtaining an opaque CLI login, deploying, and restoring JWT ON. Subscriber settings must use their own app.

## Native editor scope

The native HXL editor supports Account text/integer fields, one field per step, with at most 20 published editable fields. Description and Employees are the live-verified acceptance slice. Answers survive Back and Resume; invalid integers are rejected; Cancel saves nothing. Review binds the user, record state, policy, exact values, revision, and public review reference. Confirming an older review cannot approve a newer edit. Sessions expire after 15 minutes. Completed retries return the saved receipt.

Buttons prepare a chat message; users send it to continue, and host tool approvals may also appear. After a successful save, Get Record renders fresh Salesforce data. CRM access remains constrained by the connected user's sharing/FLS and user-mode operations. Integer display uses Salesforce field type rather than treating every Decimal as currency.

Published permissions.writeEnabled and explicit editable fields govern writes; read-only, required, and denied fields are enforced on the server. Drafts grant no live write permission. Preview Update uses trial DML with rollback to predict validation errors; automation can execute during that trial even though the CRM edit is not committed.

Picklists, dates, lookups, other record types, simultaneous forms, and Screen Flow interviews remain future work. Unsupported editable types are omitted from this editor. Current flow cards open Salesforce. Named list views use a labeled SOQL fallback, not arbitrary saved-view fidelity. ChatGPT parity for the new editor is unverified.

## Rebuilding

Run python3 scripts/build-package.py --core-only /absolute/path/to/new-stage. In that stage, create an unpromoted version with --installation-key-bypass --code-coverage --definition-file config/package-org.json --target-dev-hub cardstack-spike2 --api-version 67.0. Publish an install link only after package creation and installation verification succeed.

HXL packaging and subscriber MCP/OAuth automation remain distribution work before admin-first single-link onboarding can be claimed.
