# Field mapping guide — October 14, 2026

> **Current status — October 15:** Case editing, explicit record discovery, related-list navigation and controlled recovery/stale-result checks passed in both hosts; combined source is `a9a304e`. Flow OAuth and managed user/org verification succeeded; Studio acquisition/compilation is being tested. Lookup remains unsupported. See [overnight progress and current evidence](OVERNIGHT_PROGRESS_2026-10-15.md). Earlier inventory and test results below retain their dated scope.


This is a source-grounded map of the Salesforce-native presentation and edit contracts. It covers two different snapshots: the original primary checkout (`main` at `451ba21`) contained the earlier HXL package; the newer delivery worktree (`integration worktree`, abbreviated **W** below) contains the custom MCP Apps implementation. A source capability is not by itself a deployment or live-client QA claim. Use the deployment inventory alongside this guide to establish which revision is installed.

## The mapping is four separate contracts

1. **Native field identity:** Salesforce API names and Describe metadata determine the record fields, actual types, permissions, labels, lengths, precision and scale.
2. **Published configuration:** Studio JSON determines exposed fields, grouping, restrictive editing policy, and named action input mappings. Draft configuration grants no runtime access.
3. **Tool JSON:** Apex produces checked field descriptors and operation results. Input changes identify canonical field API names and explicit set/clear operations.
4. **Presentation:** HXL renderer JSON binds Apex outputs to widget attributes in the earlier package. The newer renderer builds HTML controls from checked descriptors. Neither HTML nor a JSON `type` supplied by an admin can authorize a field write.

## Current custom MCP Apps path

The newer implementation registers `cardstack_record_open`, `cardstack_record_edit_start`, `cardstack_record_edit_transition` and `cardstack_record_refresh`. The adapter derives object identity from the record ID; the caller cannot arbitrarily select an object. See the absolute source links below.

| Step | Native owner and exact contract |
| --- | --- |
| Resolve configuration | `layout:{ObjectApiName}:default`; `actions[].name` identifies the published action. `mappings[].fieldApi` chooses its ordered inputs. |
| Restrict capability | `CardstackRecordScreenCapability.validateShape` requires 1–20 distinct canonical fields, `type: "record-edit"`, and mappings with `source: "current"`; `sourceField` and `value` must be absent/null. Opportunity StageName uses a separate specialized action. |
| Enforce access | Object must be queryable/readable/updateable; field must be readable/updateable and exposed as editable under the published policy. Guest execution is rejected. |
| Read values | `describeFields` emits `fieldApi`, native `label`, `dataType`, `value` as string/null, `required`, `canClear`, `choices`, and relevant length/precision/scale/currencyCode. |
| Project grouping | Highlights become a section named Highlights. Config sections are filtered to this action's input fields. One column remains one; two and three become two in the editor. Unplaced inputs become Details. Repeated layout field references fail validation. |
| Deliver HTML | A digest-addressed URI under `ui://cardstack/record-edit-v1` resolves the fixed Salesforce Static Resource `CardstackRecordEditUi`. Record data arrives through tool results rather than being baked into static HTML. |
| Bind controls | `view.mjs` builds DOM nodes using `createElement` and `textContent`; controls carry `data-field="{fieldApi}"`. The registry selects control shape from native `dataType`. |
| Submit | Unchanged fields produce local `keep`, omitted from changes; edited fields produce `{fieldApi, operation:"set", value:"..."}`; clear produces `{fieldApi, operation:"clear"}` without value. |
| Review/save | `review` includes the interaction key, expected revision and changes. `confirm` carries the reviewed revision and review grant. Apex canonicalizes current native values, validates policy/freshness and owns writes. |

Sources: [adapter](../force-app/main/default/classes/CardstackRecordMcpAdapter.cls), [capability validation](../force-app/main/default/classes/CardstackRecordScreenCapability.cls), [descriptors](../force-app/main/default/classes/CardstackRecordScreenCapability.cls), [layout projection](../force-app/main/default/classes/CardstackRecordScreenCapability.cls), [resource loader](../force-app/main/default/classes/CardstackEditorUiResource.cls), [HTML binding](../ui/opportunity-edit/view.mjs), [submission](../ui/opportunity-edit/controller.mjs).

### Concrete Account example

Illustrative published configuration, using existing native fields:

```json
{
  "permissions": {"writeEnabled": true, "fieldDenylist": []},
  "highlights": [],
  "sections": [{
    "label": "Details", "columns": 2,
    "fields": [
      {"api": "Description", "editable": true, "required": false, "readOnly": false, "column": "left"},
      {"api": "NumberOfEmployees", "editable": true, "required": false, "readOnly": false, "column": "right"}
    ]
  }],
  "actions": [{
    "name": "edit_account_details", "label": "Edit account details",
    "type": "record-edit", "enabled": true,
    "mappings": [
      {"fieldApi": "Description", "source": "current"},
      {"fieldApi": "NumberOfEmployees", "source": "current"}
    ]
  }]
}
```

`Description` becomes a descriptor with `dataType: "TEXTAREA"`, then a `<textarea data-field="Description">`; `NumberOfEmployees` becomes `dataType: "INTEGER"`, then `<input type="text" inputmode="numeric" data-field="NumberOfEmployees">`. Integer editing deliberately preserves text until validation; it does not coerce values through JavaScript floating-point numbers.

A review change list can be:

```json
[
  {"fieldApi": "Description", "operation": "set", "value": "Exact submitted text"},
  {"fieldApi": "NumberOfEmployees", "operation": "set", "value": "0"}
]
```

Clearing Description is an explicit `clear` operation. Empty text and zero must not be inferred as missing. Native validation may reject an empty required value. The server diff is authoritative; local drafts are not confirmation authority. Public `structuredContent` carries the checked view; private interaction key and review grant are in `_meta["cardstack/recordEdit"]`. This separates protocol channels, not a blanket confidentiality guarantee about the host.

Sources: [field registry and numeric preservation](../ui/opportunity-edit/fields.mjs), [draft reader](../ui/opportunity-edit/view.mjs), [canonicalizer](../force-app/main/default/classes/CardstackRecordScreenCapability.cls), [metadata serialization](../force-app/main/default/classes/CardstackRecordMcpAdapter.cls).

### Supported custom record editor types

| Native type | HTML control | Boundary |
| --- | --- | --- |
| STRING | Text input | Native length and bounded transport |
| TEXTAREA | Textarea | Native length and bounded transport |
| EMAIL, PHONE, URL | Text input | Native codecs/validation; not separate HTML email/tel/url controls |
| BOOLEAN | Checkbox | `"true"`/`"false"`; not clearable |
| INTEGER | Text input with numeric inputMode | Exact signed integer bounds and native precision |
| DOUBLE, CURRENCY | Text input with decimal inputMode | Exact text grammar, precision/scale; currency context retained |
| DATE | Date input | Calendar date; year 0001–9999 |
| PICKLIST | Select | Native active offered choices; record-type context; dependent/controller picklists excluded |
| REFERENCE/lookup, MULTIPICKLIST, DATETIME, compound fields | No generic editor capability | Requires further implementation; a proposal or legacy control is not delivery |
| Calculated/autonumber | Excluded | Even if a display control exists |

The JS registry also contains DECIMAL, but this alone does not introduce a Salesforce native type beyond the Apex allowlist. Value transport is bounded at 4096 characters; displaying a Salesforce long text field does not establish arbitrary long text editing. Numeric metadata is bounded (precision up to 28); fields outside supported native metadata fail eligibility.

The native standard object catalog includes Account, Contact, Opportunity, Lead, Case, Campaign, Contract, Order, Product2, Quote, Task and Event. Eligible custom `__c` objects may qualify. Custom settings, Cardstack internal objects, other standard objects and objects without SystemModstamp are excluded. Per-object/field permissions still apply. This is a source eligibility catalog, not evidence that every listed object has passed live QA.

Sources: [native allowlists](../force-app/main/default/classes/CardstackRecordScreenCapability.cls), [exclusions](../force-app/main/default/classes/CardstackRecordScreenCapability.cls), [UI registry](../ui/opportunity-edit/fields.mjs).

## Earlier HXL route: what the JSON binds to

The primary checkout's `CardstackGetRecordAction` loads active layout JSON, resolves configured `api` (or legacy `name`) to real field names, queries under USER_MODE, then emits formatted `FieldRow {fieldApi,label,value}`. Configured blank/null display values are omitted. `highlights`, `sections` and legacy flat `fields` shapes are accepted. Highlight rendering caps at seven. The section response splits rows into full/left/center/right arrays.

`lightningTypes/cardstackGetRecordResultV3/renderer.json` binds `$attrs.outputValues.sections` to widget `sections`, and similarly binds fields, highlights, flags, record name, URL and actions. `uiWidgets/cardstackRecordV3/cardstackRecordV3.json` iterates `$attrs.sections` as `$section`; field rows bind `$left.label` and `$left.value` (and corresponding full/center/right rows) to `tile/text`. **This is HXL widget JSON, not an authored HTML file.** Salesforce's widget runtime renders the UI.

Sources: [record loading](https://github.com/DMB28th/Re-headed-crm/blob/451ba213a2b0f6dc3744a7a5b106f4cb6ef07fdc/salesforce-native/force-app/main/default/classes/CardstackGetRecordAction.cls#L177), [layout application](https://github.com/DMB28th/Re-headed-crm/blob/451ba213a2b0f6dc3744a7a5b106f4cb6ef07fdc/salesforce-native/force-app/main/default/classes/CardstackGetRecordAction.cls#L278), [blank omission](https://github.com/DMB28th/Re-headed-crm/blob/451ba213a2b0f6dc3744a7a5b106f4cb6ef07fdc/salesforce-native/force-app/main/default/classes/CardstackGetRecordAction.cls#L384), [renderer binding](https://github.com/DMB28th/Re-headed-crm/blob/451ba213a2b0f6dc3744a7a5b106f4cb6ef07fdc/salesforce-native/force-app/main/default/lightningTypes/cardstackGetRecordResultV3/renderer.json#L8), [widget iteration](https://github.com/DMB28th/Re-headed-crm/blob/451ba213a2b0f6dc3744a7a5b106f4cb6ef07fdc/salesforce-native/force-app/main/default/uiWidgets/cardstackRecordV3/cardstackRecordV3.json#L174).

Its guided editor is Account-only and STRING/TEXTAREA/INTEGER only, one field per step. `fieldValue` binds to `tile/textField.value`, whose content is relayed by `action/sendMessage` with `inputs: "auto"`; the exact answer goes into `CardstackRecordEditAction.answerValue`. Its action mappings support `current` (same target value), `field` (read another exposed field), `constant` (configured literal), and `answer` (blank initial answer). These are prefill rules, not arbitrary transformations. The newer generic custom record editor accepts only current mappings; do not assume all four source modes automatically migrate.

Sources: [guided mapping defaults](https://github.com/DMB28th/Re-headed-crm/blob/451ba213a2b0f6dc3744a7a5b106f4cb6ef07fdc/salesforce-native/force-app/main/default/classes/CardstackRecordEditService.cls#L25), [source validation](https://github.com/DMB28th/Re-headed-crm/blob/451ba213a2b0f6dc3744a7a5b106f4cb6ef07fdc/salesforce-native/force-app/main/default/classes/CardstackRecordActionService.cls#L15), [HXL text input](https://github.com/DMB28th/Re-headed-crm/blob/451ba213a2b0f6dc3744a7a5b106f4cb6ef07fdc/salesforce-native/force-app/main/default/uiWidgets/cardstackEditStep/cardstackEditStep.json#L43), [exact answer action](https://github.com/DMB28th/Re-headed-crm/blob/451ba213a2b0f6dc3744a7a5b106f4cb6ef07fdc/salesforce-native/force-app/main/default/classes/CardstackRecordEditAction.cls#L26).

Studio itself uses LWC HTML for admin controls. For example `cardstackLayoutField.html` binds `field.label`, `field.api`, required/readOnly flags and editable checkbox to the working model; `cardstackObjectConfig.buildLayoutJson` serializes that model into `highlights`, `sections`, `actions` and `permissions`. This admin HTML is separate from the chat presentation.

Sources: [Studio field HTML](https://github.com/DMB28th/Re-headed-crm/blob/451ba213a2b0f6dc3744a7a5b106f4cb6ef07fdc/salesforce-native/force-app/main/default/lwc/cardstackLayoutField/cardstackLayoutField.html#L1), [serialization](https://github.com/DMB28th/Re-headed-crm/blob/451ba213a2b0f6dc3744a7a5b106f4cb6ef07fdc/salesforce-native/force-app/main/default/lwc/cardstackObjectConfig/cardstackObjectConfig.js#L471).

## Record page versus Flow page

| Question | Record editing | Salesforce Flow launch card |
| --- | --- | --- |
| Identity being mapped | Native SObject field API name | Flow API name + record context |
| Published JSON | `layout:{Object}:default`, fields and named actions | `flows` array; selected API name/label and `launchMode:"salesforce"` |
| Input ownership | Cardstack descriptors/forms and Apex canonicalization | Salesforce Flow runtime owns its screens/variables |
| What chat sends | Checked record edits for server review and confirmation | Link `/lightning/flow/{FlowApiName}?flow__recordId={RecordId}` |
| Continue answers | Record changes drive governed interaction state | `answers[].fieldApiName` is echoed as `answers[].inputName`; `newValue` as `value`; these are notes, not submitted Flow inputs |
| Completion ownership | Cardstack service persists and returns receipt | User runs Flow in Salesforce; chat card does not execute or prove completion |

The misleading older class-level comments describing collected Flow inputs are superseded by current executable behavior and invocable descriptions. `FlowStart` sets status Ready to open, totalSteps null, and instructions that Salesforce owns screens and writes. `FlowContinue` verifies a bound launch session, rechecks activity and echoes notes, but does not invoke a Flow interview. The newer Studio wizard still builds Salesforce launch policy. A record-card Flow action opens that same Salesforce route; it is not an in-chat record-edit mapping.

Sources: [Flow start behavior](https://github.com/DMB28th/Re-headed-crm/blob/451ba213a2b0f6dc3744a7a5b106f4cb6ef07fdc/salesforce-native/force-app/main/default/classes/CardstackFlowStartAction.cls#L82), [launch URL](https://github.com/DMB28th/Re-headed-crm/blob/451ba213a2b0f6dc3744a7a5b106f4cb6ef07fdc/salesforce-native/force-app/main/default/classes/CardstackFlowStartAction.cls#L188), [notes only](https://github.com/DMB28th/Re-headed-crm/blob/451ba213a2b0f6dc3744a7a5b106f4cb6ef07fdc/salesforce-native/force-app/main/default/classes/CardstackFlowContinueAction.cls#L59), [newer wizard policy](../force-app/main/default/lwc/cardstackFlowWizard/cardstackFlowWizard.js).

Retired `packages/widgets/src/flow-run/screen-form.tsx` and the earlier Node Flow interpreter contain reusable renderer/interpreter concepts, not the current native Screen Flow engine. In-chat interpreted Flow mapping would require a declared supported metadata subset, variable-to-control contract, server-owned execution/state, strict visibility and hidden-value rules, typed canonicalization, fault/outcome handling and actual host QA. It cannot be enabled just by adding a field to Studio JSON.

## How to expand mapping

### Configuration-only expansion

For an already-supported native scalar field/object in the newer capability:

1. Confirm native eligibility and user CRUD/FLS; use exact canonical API names.
2. Add the field to the Studio layout and make its restrictive editable/required/readOnly settings explicit. Enable write policy and check the denylist.
3. Add the field to a named enabled record-edit action with `source:"current"`; stay within twenty inputs. Do not set a constant/sourceField on this path.
4. Stage the draft, review it and publish. Runtime resolves published configuration, not the draft. Changing policy fingerprints invalidates old edit/review context.
5. Open a fresh card, edit, review the server diff, confirm, independently read Salesforce and inspect audit evidence. Exercise clear/zero/required errors where applicable.

A display-only layout field can appear on the HXL record display without becoming an editable custom record input. Custom open/card fields are projected from the chosen supported action definition, not every exposed display field. Adding a Studio display label does not override the newer field descriptor's native Describe label.

### Code-required expansion

Adding lookups, dependent/multi-select picklists, datetime/compound types, non-current generic mappings, an excluded object or in-chat Flow execution changes the capability contract. Extend native eligibility/codecs/provider context and fingerprinting, published-action validation, public DTO/schema checks, HTML field registry and draft parser, server review/write/recovery behavior, then meaningful Apex/UI tests and live-client QA. A frontend-only control cannot complete this work. Lookup requires an authorized provider/query/selection contract and binding the selected ID to the exact target field; datetime requires explicit timezone semantics. Opportunity StageName remains specialized and cannot be broadened via generic mapping alone.

The current HTML source is `salesforce-native/ui/opportunity-edit/`; the generated deployable assets are Salesforce Static Resources. Change source and rebuild using the worktree's build script, then deploy through the established API 67/JWT restoration runbook. This guide authorizes no deployment.

## Built versus not built, from inspected source

**Implemented in newer source:** custom Salesforce Static Resource delivery, generic scalar descriptor-to-HTML renderer, current-only published actions, restrictive native eligibility, simultaneous draft changes, server review/confirmation/resume, special Opportunity route, native picklist provider and exact scalar codecs.

**Implemented earlier/native launch behavior:** HXL record grouping and formatted values, Account guided current/field/constant/answer prefill, Salesforce Flow launch cards and note echo.

**Not established by these sources:** generic lookup/multipicklist/datetime editing, full native Screen Flow rendering/execution inside chat, arbitrary expressions between fields and controls, every eligible object's live QA, deployment of every worktree change, or fresh-package install verification. Deployment inventory and dated QA evidence must qualify runtime claims.

## Latest ten-field Lead mapping and live evidence

The October 14 Studio/client receipt lists these exact ten mapped fields. A read-only `sf sobject describe --sobject Lead --target-org cardstack-spike2 --api-version 67.0 --json` performed for this documentation confirmed their native types; API `int` maps to Apex `INTEGER`. HTML controls below follow the inspected registry and DOM builder, rather than assuming HTML input types from Salesforce labels.

| Lead field API | Apex dataType | Actual editor HTML |
| --- | --- | --- |
| Company | STRING | `<input type="text" data-field="Company">` |
| Rating | PICKLIST | `<select data-field="Rating">` |
| LeadSource | PICKLIST | `<select data-field="LeadSource">` |
| Email | EMAIL | `<input type="text" data-field="Email">` |
| Website | URL | `<input type="text" data-field="Website">` |
| AnnualRevenue | CURRENCY | `<input type="text" inputmode="decimal" data-field="AnnualRevenue">` |
| NumberOfEmployees | INTEGER | `<input type="text" inputmode="numeric" data-field="NumberOfEmployees">` |
| Phone | PHONE | `<input type="text" data-field="Phone">` |
| Description | TEXTAREA | `<textarea data-field="Description">` |
| LastName | STRING | `<input type="text" data-field="LastName">` |

The earlier [Studio and live-client receipt](evidence/configurable-record-edit/studio-field-types-live-clients-2026-10-14.json) records actual draft/review/publish with configuration-only changes, the ten-field ChatGPT editor, and eight changed fields saved in each host with independent native readback and one audit increment per host. The later [persistent workspace deployment report](PERSISTENT_RECORD_WORKSPACE_2026-10-14.md) establishes the completed ten-field Lead journeys in both hosts on application `5275b7e`. Live record-type proof remains bounded to this org's Master context; lookup qualification, fresh installation of the latest editor and actual-host lost-response faults remain separate gaps.

### Representative checked record-card envelope

This abbreviated illustrative envelope follows the actual `cardResult` and `result` serialization. Values, record name and labels are examples; this is not a captured production response. It omits recordId entirely here to avoid presenting a fake ID as evidence; the actual contract requires a normalized eighteen-character recordId. Additional descriptor fields may be present/null according to native type.

```json
{
  "content": [{"type": "text", "text": "Current record card. Published edit actions can be started in the app."}],
  "structuredContent": {
    "contractVersion": "record-card/v1",
    "objectApiName": "Lead",
    "recordName": "Example Lead",
    "fields": [
      {"fieldApi": "Company", "label": "Company", "dataType": "STRING", "value": "Example company", "required": true, "canClear": false, "choices": [], "length": 255},
      {"fieldApi": "Description", "label": "Description", "dataType": "TEXTAREA", "value": "Example notes", "required": false, "canClear": true, "choices": [], "length": 32000}
    ],
    "actions": [{"name": "edit_lead_details", "label": "Update lead details", "type": "record-edit"}],
    "layout": {"version": 1, "sections": [{"id": "section-0", "label": "Identity", "columns": 2, "fields": ["Company", "Description"]}]}
  }
}
```

The layout lists field identities, not embedded values. `fields[]` is the value/type/constraint source; the view joins by `fieldApi`. `sections[].id` is a checked generated UI grouping ID. The source's `contractVersion:"record-card/v1"` is distinct from the interaction `record-edit/v3` process/capability version. A Card response has no confirmation grant; an editing/review response uses the separate public view/private metadata envelope. See [card/result serialization](../force-app/main/default/classes/CardstackRecordMcpAdapter.cls) and [layout projection](../force-app/main/default/classes/CardstackRecordScreenCapability.cls).

## A third meaning of “Flow page”: purpose-built Opportunity process

A screen-style workflow in chat can also mean the custom Opportunity editor. This is a purpose-built Apex process; it is not an execution of arbitrary Salesforce Screen Flow metadata.

| Mapping surface | What selects inputs | State/variables | UI/output |
| --- | --- | --- | --- |
| Generic custom record page | Published current-only action and native eligibility | Ordered field identities, exact FieldChange answers, current record/policy/capability fingerprint, revision and review state | Generic field descriptors and configured sections |
| Purpose-built Opportunity process | Exact fixed action mappings, in order: StageName, CloseDate, Amount | Native initial record and stage context, answers, action/policy/setup digests, actor/org/client, expiry, revision and reviewRevision | Stage select, date control, exact currency text; `opportunity-card/v1` and `opportunity-edit/v1` |
| Salesforce Flow launch page | Selected published Salesforce Flow API name | Bound launch session plus optional chat notes; actual Flow variables live in Salesforce | Salesforce link with recordId; native Flow runtime renders and writes |

For the specialized Opportunity process, `StageName` must use permitted native stage choices from the stage provider; `CloseDate` is a date; `Amount` is currency with native currency context. `CardstackOpportunityActionPolicy.validateShape` rejects any other field sequence, any non-current source, any sourceField/value, or a Flow API name. Thus expanding this page with a fourth field is code work even where the generic editor might support that field. Its stored `answers` are FieldChange entries, not arbitrary Flow variable names. `CardstackOpportunityEditService` owns the durable state machine and native write services; the host bridge transports operations rather than running a Salesforce Flow interview.

Sources: [fixed Opportunity mappings](../force-app/main/default/classes/CardstackOpportunityActionPolicy.cls), [specialized adapter fields](../force-app/main/default/classes/CardstackOpportunityMcpAdapter.cls), [initial process state](../force-app/main/default/classes/CardstackOpportunityEditService.cls), [stored answers](../force-app/main/default/classes/CardstackOpportunityEditTypes.cls).

Related documentation: [project index](PROJECT_DOCUMENTATION_2026-10-14.md), [architecture and deployment](ARCHITECTURE_AND_DEPLOYMENT_2026-10-14.md), [product PRD overview](PRODUCT_OVERVIEW_2026-10-14.md), [materials review](MATERIALS_REVIEW_2026-10-14.md).

## October 15 mapping and verification changes

Case now proves configuration-only reuse in both clients: `SuppliedEmail` → EMAIL/text input; `Subject` → STRING/text input; `Description` → TEXTAREA/textarea; `SuppliedPhone` → STRING/text input. Native type, not the phone-like field name, selects the codec. CaseNumber stays read-only identity and OwnerId stays a required native reference, not an editable mapping.

Configured related lists now return checked column descriptors and ordered row cells through `record-related-definitions/v1` and `record-related-page/v1`. Canonical `layout.relatedLists` overrides legacy nested configuration. Native relationship metadata determines child object/constraint; page cursors do not authorize reads or writes. Three-page Contact/Opportunity lists and child/parent navigation passed both hosts. The Opportunity child uses its existing Stage-aware route.

There is now a fourth process category beyond generic record editing, fixed Opportunity editing and Salesforce launch handoff: the deployed bounded native Flow interpreter foundation. It acquires exact-version metadata at admin time, checks compatibility and compiles an immutable plan for server-owned runtime state. Flow OAuth and managed identity verification have succeeded; Studio acquisition/compilation is under test. A launch-card note is still not an interpreted answer, and no full Flow engine or completed interpreted host journey is claimed.

Controlled lost-Confirm-reply recovery and delayed related-page rejection passed both hosts; neither expands field-write authority. See [current evidence and pending gates](OVERNIGHT_PROGRESS_2026-10-15.md) and its source contracts.
