# Studio scenarios and native field types

The user selected priorities1 and2 and explicitly delegated authority to scope and
build while away. This extends the verified persistent editor; it does not start a
new application. This chat retains integration, deployment and host QA ownership.

## Outcome

An admin configures and maintains a named editing action in Studio: choose an
eligible object, arrange editable fields in sections, define ordered action inputs,
save a draft, review and publish. The resulting experience works in actual Claude
and ChatGPT through the existing renderer, controller and Salesforce save lifecycle.
Use Lead as an additional acceptance fixture, subject to current native eligibility.

Existing visual authoring, native staging and exact reviewed publication already
exist. Extend these with an Edit action path rather than adding a scenario object,
another configuration store, another publication engine or another save service.
A scenario is a named action in the object's default published layout.

## Supported types and native authority

Add Email, Phone and URL as native bounded exact-string fields. Preserve exact
values and whitespace, use native length, existing requiredness and explicit clear.
Salesforce DML remains authoritative for platform/business validation. URL values
render as text; do not turn data into executable links or HTML.

Add independent single-select Picklist using API67
ConnectApi.RecordUi.getPicklistValuesByRecordType. Reuse the established Stage
provider pattern, but preserve its existing specialized behavior and identities.
One native response supplies all mapped picklists for a record type. Do not fall
back to unrestricted Describe choices. Derive the actual type from an authorized
source record, check full checksum18 and membership in its native object metadata;
use native Master only when the existing record has no actual type. Never choose
the actor's default record type for an existing record.

Provider choices are bounded to500 per field, unique exact API values with bounded
literal labels. Missing requested fields, malformed responses, dependencies,
controller mappings or provider failure fail closed. Multi-select, dependent
picklists, Reference, Percent, DateTime, Time, compound and rich-text inputs remain
explicitly unsupported in this milestone.

Load the record's existing value. Null remains null: opening/recovery never applies
a default to an existing record. Preserve retired current values as unchanged only;
they cannot become newly selectable values. Validation rerenders keep the current
value visibly selected when the operation is unchanged; explicit clear remains clear.
Optional clearing uses the existing clear operation. Every new set value must exactly match a native API value.
Labels, translation and case folding never select write values.

Bind provider version, object, field, actual record-type context and allowed API
values into current capability/freshness. Native label/order changes may invalidate
pending review because current public descriptors already participate in the
capability fingerprint. Re-fetch options for current state/review reconstruction
and after the record lock at Confirm. Changed metadata, record type, native rights
or published policy must reject stale authority before USER_MODE DML.

## Compatibility and shared contracts

Use one shared engine and one current-only action contract. Add an isolated native
picklist provider and types only where they separate a real metadata responsibility.
Keep caller-selected object/type/filter identifiers out of private tool authority.
Do not add transport, authentication, grants, object-specific controllers or saves.

Version expanded generic persisted state explicitly as schema4, process
record-edit/v3 and capability record-current/v3. Retain the schema3 scalar
record-current/v2 interpretation, schema2 Contact interpretation and schema1
Opportunity specialization. Old pending state cannot gain newly supported types;
old completed receipts/replay must remain interpretable. Restoration, capability,
writer and audit must agree on the same version/type and native record identity.

Pin static native metadata separately from dynamic picklist choices in new schema4.
Completed receipt recovery rechecks current native access, policy, metadata and
receipt/grant integrity without requiring live selectable choices. Its terminal
capability cannot canonicalize changes or acquire a write lock. Historical receipt
literals are read-only; pending editing/review/confirmation still require fresh
native choices. This correction preserves recovery during provider outages.

Studio keeps its eligibility contract independent of per-record options. Authoring
shows which types are supported; actual runtime permissions and choices are freshly
resolved. Picklist preview uses clearly synthetic choices and disabled Save through
the same renderer; it does not claim record-specific native choice availability.
Expand strict public/preview decoders alongside native types, preserving malformed
payload rejection, private authority and late-response guards.

## Maintain a configured action

Add Edit to existing supported current-value actions. Hydrate the existing authoring
form with label, description, enabled state and ordered mappings. Preserve its
name/launch identity and retained unknown properties. Reuse Add's current native
eligibility/layout/denylist checks for Update and Save; opening Edit permits repair
of an action whose fields have since become ineligible. Update only the selected working action and save
through existing staging. Cancel leaves the working configuration unchanged.
Protect legacy Account mappings and the fixed Opportunity Stage preset from being
silently converted by this generic editor. Object switches invalidate edit context.

## Acceptance and limits

Configure Lead wholly in actual Studio using Identity, Business and Contact
sections. Candidate fields are Company, LastName, Description, Rating or LeadSource,
Email, Phone and Website, plus existing numeric/date fields where current rights
permit. No rights or schema changes merely to make fixtures work. Publish one
reviewed owned action, then exercise edits, review, Confirm, receipt and Refresh in
both hosts with independent values/audits. Edit that action's membership/order and
label through Studio and verify the published result without source/deployment changes.
Keep existing Opportunity/Account journeys working.

The org currently has Master record types only. Actual Master proof and typed native
test fixtures for distinct record types are different evidence; do not claim actual
non-Master behavior. Lookup investigation established no supported in-process API67
source-field restriction evaluator. Its picker remains outside the enabled engine;
ordinary SOSL, missing filter metadata, suggestions or successful DML cannot stand
in for preselection eligibility. No unsupported provider is enabled to meet scope.

Use focused distinct-risk checks during implementation, then one reviewed integrated
local/native checkpoint in existing cardstack-spike2. Prepare an exact immutable
artifact using the current runbook, preserve rollback and independently retrieve it.
Reuse working managed auth; deployment SFAPP JWT stays ON. No new org, OAuth app,
connection recreation, production change or broad permission grant. Keep clean-install
testing separate. Actual recovery/stale-response gaps remain honest unless exercised.
