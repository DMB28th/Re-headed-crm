# Cardstack: configured flow inputs and record-card buttons

Design for review, October 5, 2026. Implementation has not started.

## Outcome

Admins configure Salesforce flow launch cards once, map their inputs, and attach them as buttons on chat record cards. Clicking a button opens the flow in Salesforce with the current record's context. Example requests help Claude or ChatGPT discover the same configured actions. This remains a Salesforce-hosted beta: no external server and no execution of Salesforce flow screens inside chat.

The user approved the proposed flow input mappings and record-card Actions area. This document makes the configuration, runtime behavior, and verification concrete before implementation.

## Current implementation

- `CardstackFlowStartAction` builds `/flow/{apiName}?recordId={id}`. It does not resolve arbitrary mapped inputs. It verifies active, launchable flow types, but currently permits API names that are not registered in published Cardstack configuration.
- Published flow configuration lives under `flows`. The editor preserves legacy metadata and stages changes through Publish Center.
- `cardstackObjectConfig` already saves layout `actions`, but its normalization retains only basic action properties. It must preserve new mappings and flow references when fields or sections change.
- `CardstackGetRecordAction` and `cardstackRecordV2` do not currently produce or render configured flow buttons. The widget has an Open in Salesforce record link.
- `getFlowInputs` currently catches metadata errors and returns an empty list, and does not restrict its variable query to the active version. Empty results therefore cannot be trusted as proof that a flow has no inputs.
- The flow widget still has legacy Cancel flow wording. It must say Dismiss card and must not imply cancellation of a Salesforce interview.

## Admin experience

### Flow editor

Use one editor with a searchable flow picker, card name, applicable objects, When to use this card description, and repeatable What might your team ask? phrases. Selecting an existing card retains its flow identity; switching to a different flow creates or edits that flow's own configuration rather than copying the previous flow's metadata.

The Input mapping area lists variables available for input on the active flow version. Each row has the variable name, type, and a source:

| Source | Behavior |
| --- | --- |
| Current record ID | Resolve the current record ID, including variables named something other than recordId. |
| Record field | Choose a readable scalar field from the selected object. Resolve the value under the connected user's access. |
| Fixed value | Enter a type-checked, non-secret constant. |
| Leave to Salesforce | Omit the launch parameter. The flow supplies a default or asks on its screen. |

Mappings are per applicable object, because Account and Opportunity have different fields. Default the input named recordId to Current record ID when that input exists. Do not invent that variable when it is absent. If an input mapping must have a value, an admin can explicitly require it; do not infer requiredness from unavailable metadata.

For beta, support only scalar types whose Salesforce URL behavior is verified in the org. Initially target Text, Boolean, Number, Date, and DateTime; unsupported types are marked clearly and left to Salesforce. Record variables, collections, relationship field paths, expressions, secret constants, and free-form SOQL are outside this beta.

Use Save draft and a compact preview. An unavailable or inactive flow shows an explicit warning; disable launch and publishing for that configuration. Existing placeholder drafts remain editable/removable. A metadata permission or retrieval error is shown separately from a verified empty input list. If active-version input discovery cannot work reliably on this org, stop that feature with the evidence and propose an explicitly labeled manual mapping fallback rather than silently assuming no inputs.

Advanced exposes read-only View JSON for the current working configuration. Copy chat prompt produces an explicit request using the flow API name and a record placeholder. It does not include tokens or record field values.

### Record-card layout builder

Extend the existing Actions area to add a Flow button. Pick a configured flow applicable to this object, set the button label, and reorder or disable buttons. Input mappings remain owned by the flow configuration; the button references that configuration rather than maintaining another copy.

Show the buttons in the card preview. Defaults use the flow card name; administrators can rename a button, for example Request approval. Require a published flow configuration before publishing a layout that references it. Draft flow choices are visible as draft dependencies, with a clear Publish flow first explanation. Layouts without buttons continue to work.

Each object's default record-card configuration also has When to use this card and What might your team ask? fields. These guide discovery of the record card; phrases on flow configurations guide discovery of actions.

## Configuration contract

Extend flow policies without discarding existing unknown properties:

```json
{
  "apiName": "Request_Approval",
  "label": "Request approval",
  "launchMode": "salesforce",
  "enabled": true,
  "objectNames": ["Opportunity"],
  "description": "Request approval for an opportunity",
  "exampleRequests": ["Send this deal for approval"],
  "inputMappings": {
    "Opportunity": [
      {"name": "recordId", "source": "recordId"},
      {"name": "accountId", "source": "field", "fieldApiName": "AccountId"},
      {"name": "requestType", "source": "constant", "value": "Approval"},
      {"name": "reason", "source": "salesforce"}
    ]
  }
}
```

Add optional `description` and `exampleRequests` to layouts. Flow buttons use `{name, label, type: 'flow', flowApiName, enabled}` in the existing `actions` list; preserve legacy unrelated action properties and action types, but do not pretend unsupported legacy actions are runnable.

Absent descriptions and phrases are valid. Existing published flow policies without an object restriction remain available for readable records to preserve compatibility. Legacy policies without mappings retain the existing recordId handoff only when the active flow declares that input; show migration information if it does not. Existing action stubs without a flow reference require an admin to select a flow before they become launchable.

## Runtime and MCP

Create a shared Apex launch resolver used by Flow Start and Get Record. It reads published configuration only; requires a registered, enabled flow; verifies the flow is active and launchable; validates the record's actual object and access; validates input names against the active version; resolves allowed fields with user-mode queries; converts supported values; and URL-encodes parameter names and values.

This intentionally closes the current ability to invoke any unregistered flow API name through Flow Start. Removing a published Cardstack flow removes future catalog entries and launch buttons. Previously rendered URLs remain links to Salesforce and cannot be revoked by Cardstack; Salesforce controls interview access at click time.

For a record card, emit a list of validated `{label, url}` flow actions and a hasFlowActions flag. The HXL widget renders each as `tile/button` with `action/openLink`, like the existing record link. Button clicks open Salesforce directly. They do not send a chat message or depend on intent interpretation. If an action cannot be resolved safely, omit that action and return a readable availability explanation without breaking the record fields or exposing inaccessible values.

Flow Start returns a launch card using the same resolver and includes a summary of supplied input names, without unnecessarily repeating their values in chat. Additional answers passed to the existing Continue tool remain notes and are never interpreted as authorized input mappings. Dismiss wording is corrected in the flow widget.

Add a read-only MCP discovery tool returning published record-card and flow-action descriptors: stable identifiers, kind, label, description, applicable objects, example requests, availability, and the tool/arguments needed next. No record field values or launch URLs are needed for discovery. It can be filtered by object; active/access checks filter usable entries, and draft configuration never appears.

Hosted MCP descriptions instruct chat to consult the catalog before selecting a configured flow, resolve the record, and ask when multiple actions fit. Example requests are guidance, not exact-match aliases or guaranteed automatic triggers. Catalog descriptions are untrusted configuration data, not instructions that override the user's intent or tool access controls. There is no guarantee that merely publishing phrases causes a chat model to discover them; real connector QA must prove the discovery sequence works.

## Validation and failure handling

Server-side draft/publish validation rejects duplicate variable names, unknown sources, incorrect constant types, missing field references, unsupported mapped types, invalid flow references, or unresolved draft dependencies. Legacy configurations unrelated to these features remain tolerated. Runtime rechecks handle flow changes after publishing.

Null optional field values omit the parameter; explicitly required mapping values fail launch with a clear message. False and zero are valid and must not be mistaken for missing values. Never silently substitute inaccessible or stale values. Omitted values are handled by the flow's defaults or screens; Cardstack does not promise that every flow can proceed without them.

URL parameters are visible in links and browser history. Default to record IDs and let flows fetch sensitive record details in Salesforce. Do not support secrets or protected values as constants. Apply a bounded URL size and fail clearly rather than truncate inputs. No launch URL or session token is printed in deployment/test logs.

## Verification and release

- Component regressions prove mappings and phrase settings survive staging, editing, section changes, and save/reload; invalid states block saving; different flows do not inherit one another's mappings.
- Apex tests prove published-only discovery, registration enforcement, record/object access checks, readable-field mapping, null/false/zero handling, conversion, encoding, URL size failure, inactive/stale metadata handling, and cross-object restrictions.
- Existing full Apex suite and component tests remain green.
- Deploy native Apex, Studio, Lightning Types, HXL widgets, and Hosted MCP definition with API 67.0. Restore JWT to ON after every deployment session and independently verify it.
- Live Studio QA covers configuring an actual active test flow, mappings, adding/reordering a record-card button, publishing dependencies, viewing JSON, and rollback of QA-only configuration.
- Real Claude connector QA proves catalog discovery, a requested flow launch card, record-card button rendering, and button navigation. Use an isolated read-only test flow with a screen showing received values to prove variable delivery without creating business records. Never report a rendered or delivered value based solely on Apex output.
- Changes remain native Salesforce only. Do not modify legacy apps/packages or resurrect Custom Screens. Existing install links do not include this work until a new beta package and companion metadata are built and verified; daily package build limits are reported plainly.

## Acceptance

An admin can configure a flow's inputs, attach it to an object's record card, publish both, and see a working button in Claude. Clicking the button opens Salesforce with the intended values verified on the test flow's screen. A natural request can discover the published configuration and render the same flow launch card. Draft edits never change chat behavior. Existing highlights, one/two/three-column sections, field flags, and record links remain intact.
