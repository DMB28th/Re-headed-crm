# Cardstack community beta 0.1.0.4

[Install the core beta](https://login.salesforce.com/packaging/installPackage.apexp?p0=04tg8000000QJyHAAW).

This unpromoted unlocked beta contains Apex tools, Studio, configuration, audit, and private confirmation storage. It built successfully with 82% Apex coverage and installed successfully in a fresh Developer scratch org. All 139 packaged Apex tests passed there; all 144 Apex tests passed in the development org, including five org-only probe tests. Studio model tests passed 20/20.

Keep this version beta. Do not promote it. Dev Hub: cardstack-spike2. Package: 0Hog80000004dFhCAI. Source of truth: salesforce-native/force-app/.

## Native companion setup

HXL widgets, Lightning types, and the Hosted MCP definition remain a separate companion deployment. Package validation orgs did not provide HXL, and McpServerDefinition is not supported in unlocked packages. The current setup requires Salesforce CLI and an org with HXL and Hosted MCP enabled; it is not yet one-link onboarding.

After core installation, assign Cardstack Admin to administrators and Cardstack User plus required CRM/Apex/MCP access to connected users. Configure a subscriber-org External Client App and OAuth connector. Deploy companion metadata from this project using package/companion.xml and API 67.0, then activate the Cardstack Hosted MCP definition. Connect Claude to https://api.salesforce.com/platform/mcp/v1/custom/Cardstack and refresh the connector tools list after definition changes. The community definition exposes 16 tools; create-record is excluded until it has preview-and-confirm support. There is no delete-record tool.

API 67 Metadata deployment in the development org requires disabling JWT access tokens temporarily, obtaining a fresh opaque CLI login, deploying, and restoring JWT ON. Subscriber settings must be handled for their own app. Never distribute OAuth secrets or development-org app metadata.

## What this beta delivers

Studio configures highlights, sections with one/two/three columns, field flags, flow launch cards, drafts, and publication. Claude rendered a real structured record card and account results. Record retrieval takes exactly one input per call; call separately for multiple records.

Record edits and task completion require published object write permission and explicit editable fields, connected-user access, a preview, and its exact confirmation. Confirmations expire, bind the actor, policy, changes, and record snapshot, and retain receipts for successful retries. Required, read-only, and denied fields are enforced server-side. Preview Update retains its existing trial DML with rollback to predict validation errors; it does not commit the CRM edit.

The beta uses conversational editing with preview/result cards. Multi-field editable chat forms and a Screen Flow interpreter are future milestones. Flow launch cards currently open Salesforce. Named-view fallback does not promise arbitrary saved-view filters, sort order, or columns. ChatGPT parity is not verified for this release.

## Rebuilding

Run python3 scripts/build-package.py --core-only /absolute/path/to/new-stage. From that stage, create an unpromoted package version with --installation-key-bypass --code-coverage --definition-file config/package-org.json --target-dev-hub cardstack-spike2 --api-version 67.0. Only publish an install URL after the request succeeds.

Track supported HXL packaging and automate subscriber MCP/OAuth setup before claiming a complete admin-first single-link install.

## Live Claude edit acceptance — follow-up passed

A fresh Claude chat successfully ran Preview Update, rendered the two-field before/after HXL card, asked for confirmation, then ran Update Record after explicit confirmation and one-time tool approval. Independent Salesforce SOQL confirmed Description = Community beta confirmed edit and NumberOfEmployees = 0 on the disposable Account. The earlier No approval received failures did not reproduce; interrupted-chat state or approval timing remains the likely cause, not a proven Salesforce defect. No application code change was needed. This proves conversational preview/confirm/save for this two-field case, not direct editable form submission or Screen Flow interviews. Cleanup restored the original published Account policy and removed the disposable Account, with independent verification.
