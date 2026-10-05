# What to carry from retired Cardstack into native Salesforce

Source comparison, October 5, 2026. This is an audit and prioritization, not an implementation or runtime verification report. Retired apps/packages were inspected read-only; no legacy services were started and no legacy tests were rerun.

## Main finding

The native package has much of the Apex tool surface and a more recent Studio layout builder, but it does not yet reproduce the old interactive chat runtime. Matching tool names and green Apex tests do not prove feature parity. Several native tools currently return descriptions or links rather than an editable, executable interaction.

The earlier on-platform plan already identified the interpreter and quick-action forms as a later port milestone. Some older overview documentation says native rendering does not exist, while the current TypeScript code contains that interpreter and its React form. Source and tests are the evidence of implementation; old written claims of live verification are historical, not fresh verification in the current org.

## Recommended order

| Priority | Capability | Old source evidence | Native gap and value |
| --- | --- | --- | --- |
| 1 | Published runtime policies and sound confirmation binding | `packages/core/src/filtering.ts`, `assemble.ts`; `apps/mcp-server/src/confirm-token.ts` | Native Studio stores writeEnabled/denylist/editable settings, but native write tools do not read them. Native confirmation binds field names rather than exact values and actor, and its signing material is predictably derived from the org ID. Close these gaps before expanding AI UI writes. |
| 2 | In-chat editable controls and submit/refresh loop | `packages/widgets/src/record-card/editors.tsx`, `card.tsx`, `edit-machine.ts`, `write-states.tsx` | Native record HXL displays fields and a record link. Port typed inputs, required/read-only behavior, lookup/picklist selection, confirmation diff, write receipt, and a refreshed card. Salesforce CRUD/FLS remains the upper bound. |
| 3 | Screen Flow interpreter and compatibility analysis | `packages/core/src/flow-capabilities.ts`, `flow-analysis.ts`, `flow-interview.ts`, `flow-expressions.ts` | Native Flow Start/Continue are launch cards/notes. Port a deliberately supported subset with truthful availability, branches, defaults, visibility, validation, state, and confirmation-gated writes. HXL controls and active metadata access must be proved first. |
| 4 | Record-card action buttons with input mapping | `packages/core/src/card-actions.ts`, `action-inputs.ts`; `apps/studio/components/action-inputs-editor.tsx` | Native action configuration is only basic metadata and is not rendered by the record widget. Connect enabled actions to real tools and resolve context, field, constant, and user-entered inputs once. |
| 5 | Salesforce quick-action forms and execution | `packages/core/src/quick-action.ts`; native branch in `apps/mcp-server/src/server.ts` | Native QuickActionStart describes available action names and tells users to reply with values; it does not return the action's mini-layout or execute the quick action. New Task / Log a Call / other supported actions should have actual fields, defaults, requiredness, confirmation, and result handling. |
| 6 | Related lists and drill-through navigation | `packages/widgets/src/record-card/card.tsx`; `packages/core/src/assemble.ts` | Old cards load related rows and navigate to related record cards. Native GetRelated exists, but GetRecord and its HXL do not compose these into the record card. Bring related records and reference links into chat before adding new standalone pages. |
| 7 | Configurable home launcher | `packages/core/src/home-card.ts`; `apps/studio/components/home-card-builder.tsx`; `packages/widgets/src/home-card/card.tsx` | Old block config controls curated list tiles, recent records, and follow-ups. Native Home Card editor saves a config that HomeAction does not consume; its task/recent/pipeline response is hardcoded. Connect the editor to live output and replace normal JSON editing with blocks. |
| 8 | Saved-view aliases and exposure governance | `packages/core/src/view-exposures.ts`; `apps/mcp-server/src/views.ts` | Audit and restore end-to-end consumption of published exposed/default views and aliases. Do not equate an ad-hoc filtered query with Salesforce list-view membership; org/session limits must be visible. |
| 9 | Card freshness, recoverable failures, and host feedback | `packages/widgets/src/shared/components.tsx`, `shared/format.ts`; widget `mcp-app.tsx` bridges | Old runtime includes fetched-time/layout provenance, typed retry/reconnect errors, preserved local edits, and updates to model context after writes. Native widgets need corresponding usable states through supported HXL/host capabilities. |
| 10 | Restore published revisions and detect stale drafts | `packages/config-store/src/memory-store.ts`; native `CardstackConfigService.cls` | Old history supports restoring a previous published configuration as a new revision. Native rollback only discards an open draft. Add explicit published-version restore and prevent older drafts silently replacing more recent live state. |

## Important qualifications

- The old confirmation code also supports model-driven writes without a token, recorded as model writes. Mandatory confirmation for interactive submissions is a product requirement to enforce, not a claim that every old write was token-gated.
- Legacy confirmation tokens are intentionally replayable for identical patches. Do not import that behavior into non-idempotent flow/quick-action creation: use guarded server-owned sessions or deduplication where repeat submission would repeat a business action.
- The old interpreter is not Salesforce's actual Screen Flow interview runtime. Its supported subset has different constraints, and compatibility analysis must identify unsupported parts. A port needs tests for semantic fidelity, including failures and transaction boundaries.
- React MCP Apps can call tools and hold local input state directly. That code cannot simply be copied into HXL JSON. Editable inputs, submit binding, navigation, and refresh need a verified HXL equivalent on the actual Claude/ChatGPT clients.
- Managed flow metadata and connected-user self-REST access remain known feasibility issues. A historical Named Credential proposal is not proof those issues are resolved for the native package.
- Existing native highlights, named sections, one/two/three columns, required/read-only flags, user-mode queries, and staging/publishing should be extended, not replaced with the old builder.
- Native audit filters, expandable before/after, CSV export, and Publish Center visual diffs already exist. Improve configuration provenance, flag/column diffs, and flow outcome coverage rather than rebuilding those surfaces. Detailed evidence is in `legacy-governance-gap-research.md`.

## Do not carry over

- Railway/Node servers, Next.js hosting, Postgres config storage, workspace accounts, custom login/OAuth proxies, multi-tenant infrastructure, and HubSpot abstractions. Salesforce orgs, users, permission sets, and Hosted MCP replace that deployment architecture.
- A standalone Custom Screens tab or feature. Any in-chat screen definition belongs to its configured flow.
- Record deletion. The native package intentionally has no delete-record tool; the legacy registry's recordDeletes entry does not change that decision.
- UI-only capabilities described in old plans but not implemented, such as claiming a complete audience/view-as preview or universal embedded Screen Flow runtime.

## Additional features discussed now

Per-card example phrases, When to use this card descriptions, and a published MCP discovery catalog are new additions under discussion. They should be implemented alongside action discovery, but this inspection has not established that the old product already supplied that exact feature.

## Primary source links

- [Runtime policy/filtering](https://github.com/DMB28th/Re-headed-crm/blob/main/packages/core/src/filtering.ts)
- [Old confirmation binding](https://github.com/DMB28th/Re-headed-crm/blob/main/apps/mcp-server/src/confirm-token.ts)
- [Native confirmation code](https://github.com/DMB28th/Re-headed-crm/blob/main/salesforce-native/force-app/main/default/classes/CardstackConfirmToken.cls)
- [Native update action](https://github.com/DMB28th/Re-headed-crm/blob/main/salesforce-native/force-app/main/default/classes/CardstackUpdateRecordAction.cls)
- [Screen/component registry](https://github.com/DMB28th/Re-headed-crm/blob/main/packages/core/src/flow-capabilities.ts)
- [Interpreter](https://github.com/DMB28th/Re-headed-crm/blob/main/packages/core/src/flow-interview.ts)
- [Interactive record card](https://github.com/DMB28th/Re-headed-crm/blob/main/packages/widgets/src/record-card/card.tsx)
- [Flow screen form](https://github.com/DMB28th/Re-headed-crm/blob/main/packages/widgets/src/flow-run/screen-form.tsx)
- [Quick-action form model](https://github.com/DMB28th/Re-headed-crm/blob/main/packages/core/src/quick-action.ts)
- [Earlier native interpreter port milestone](https://github.com/DMB28th/Re-headed-crm/blob/main/docs/superpowers/specs/force-com/07-flow-interpreter.md)
