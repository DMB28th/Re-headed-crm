# Configurable governed record editing

October 12, 2026. The user approved the strategic sequence and instructed execution. Source implementation continues under the existing autonomous approval and selected subagent workflow. New external fixtures, publication, deployment or access remain separately bounded actions. This spec makes the approved first sub-project concrete; creation, related-record selection and multi-step processes are later sub-projects.

## Outcome

An admin configures a published record-edit action with one to twenty supported current-value inputs and sections. The custom app opens the authorized record, initializes all inputs, validates corrections, requests a Salesforce-owned diff, confirms once, shows an immutable receipt and refreshes the record. The next scenario is Contact LastName, Description and HasOptedOutOfEmail. Contact Name is display-only; LastName is the writable required input. Native eligibility is checked, never presumed from a mock fixture.

Opportunity remains the first capability, including its exact native Stage provider and existing public v1 contracts. The generic route is additive until actual compatibility acceptance supports cutover. The legacy Account sequential/HXL route is preserved; it is not the basis of a second custom-app engine.

## Shared boundaries

Presentation uses the existing plain-DOM field registry, layout resolver, validation, exact numeric strings and native dates. One controller implements the lifecycle; a trusted build-time adapter supplies tool names, public contract projection and private metadata key. Tool targets and capability selection never come from model text or arbitrary view properties. The existing Opportunity adapter becomes a compatibility entry point over this controller.

Salesforce owns a bounded capability registry, published action resolution, native field eligibility, typed values, freshness and execution. The lifecycle/repository/writer/audit have one implementation shared by supported capabilities. Extract the newer Opportunity machinery instead of copying it for Contact. Compatibility facades may retain existing names/signatures and translate DTOs; they must not contain a second state machine or writer. Extraction can preserve internal legacy names during migration where that avoids weakening tested persistence contracts, but all new routes must invoke the same implementation.

Server capability operations are resolveDefinition, readContext, canonicalize, describeFields and validateCapabilityContext. Definition contains canonical object API, published action identity/digest, ordered inputs, required-readable projection and capability version. RecordContext contains an authorized typed record, exact freshness and a capability fingerprint; Stage/currency context is required only where the capability requires it. Incoming field changes retain {fieldApi,operation:set|clear,value:string}; omission means unchanged. Confirm accepts only the existing private handle, revisions and grant, never a record, object or new patch.

The initial registry supports Opportunity and Contact. Opportunity retains the existing exact three-field/current-value policy. Contact supports configurable STRING, TEXTAREA and BOOLEAN fields, subject to native Describe and published policy. Unsupported types fail closed with a useful authoring explanation. Extending a server capability to another type is an explicit supported capability change; the renderer's larger registry does not authorize it. No arbitrary object/field patch endpoint, flow interpreter, lookup editor or dependent-picklist fallback is added.

## Persistence and execution

Preserve setup → interaction → confirmation → record lock order, actor/org/client ownership, checksum18 comparisons, expiry, review invalidation, immutable identity, replay of completion and atomic CRM/audit/receipt rollback. Pin object API, capability version, ordered inputs and capability fingerprint in addition to the existing review bindings. Restore typed record snapshots through the registered canonical object type; never trust JSON SObject attributes or stored typedValues as write authority. Existing Opportunity private state and completed grants must retain their exact legacy interpretation and subject digest. Version new state explicitly.

Each transition reloads published policy and rights. Confirm locks/re-reads and re-canonicalizes stored answers before USER_MODE DML. The audit is mandatory and shares the transaction. Native Boolean literals are exactly true or false; do not reuse Boolean.valueOf on unchecked strings. Required fields and optional clearing use native constraints plus published restrictions. Description values longer than4096 are explicitly unavailable for editing in this milestone; reject the scenario before granting a review rather than truncating or silently patching a shortened value. Published fields must use canonical schema names; dynamic queries bind values and derive identifiers only from verified schema.

## Public and host contracts

Add record-card/v1 and record-edit/v1 with canonical objectApiName and bounded field descriptors. Editing and Review/Completed views include checked descriptors sufficient to verify diff field membership and format exact values; terminal denials may omit identity. Public views contain no private keys or grants. Generic tools are cardstack_record_open, cardstack_record_edit_start, cardstack_record_edit_transition and cardstack_record_refresh. Only Open is model-visible; Start/Transition/Refresh remain app-only. Their resource is ui://cardstack/record-edit-v1.html, served by StaticResource CardstackRecordEditUi, a self-contained Salesforce resource built with existing SDK1.7.4. Old Opportunity tool names/URI/metadata remain compatible. The generic private metadata envelope is cardstack/recordEdit, distinct from cardstack/opportunityEdit; controllers reject cross-family results. Generic objectApiName is exactly Contact in this milestone; Opportunity remains on its compatible route. Registered objects can be added later through explicit capability support.

Every async result is bound to record/interview/request generation. Switching records or disconnecting drops authority. Back/Cancel require a fresh review. Known receipts survive failed refresh; explicit access denial removes unauthorized content. Restored old snapshots are labeled honestly. This milestone does not claim full-chat reload recovery, loss recovery or delayed-switch acceptance from local tests; the existing observed gaps remain an acceptance checklist.

## Studio

Reuse cardstackObjectConfig action authoring, configuration staging and publication. Expose a Contact record-edit preset with the three representative fields; permit one-to-twenty supported current-value mappings and checked sections. Validate candidate policy at staging/publication and published policy at runtime. Drafts grant no execution rights. Preview shares the renderer, stays synthetic, sandbox allow-scripts only and Save disabled. Do not change published layouts or generate permissions through authoring code.

## Evidence and delivery

Use three consolidated checkpoints: source/renderer, native execution/package compatibility, actual-host journeys. Add tests for cross-capability confusion, malformed Boolean, long current text, field/order/policy drift, generic record freshness, rights revocation, strict ingress, immutable receipts and replay. Retain Opportunity and legacy Account regressions. Local bridge tests remain renderer evidence. Apex methods are unverified until executed; analyzer Java unavailability is not a clean scan. Bring exact metadata compatibility/checkOnly preparation forward; do not create another package or org without a concrete scope. A future live Contact acceptance needs exact disposable fixtures/rights/publication and deployment approval, prepared after source review.

## Decisions

Contact is selected over Account as the second scenario because its standard fields exercise Boolean without feature-dependent custom fields. Current-only mappings keep this extraction focused; legacy Account constant/field/answer mappings retain their existing route. External QA setup is excluded from source approval. The five pre-dirty files, all prior artifacts/failures, frozen installed QA sources and existing environments are preserved.
