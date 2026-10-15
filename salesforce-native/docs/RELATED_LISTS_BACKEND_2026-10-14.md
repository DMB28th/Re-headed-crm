# Related-list read boundary

The Salesforce-native read implementation is in `CardstackRelatedListPolicy`,
`CardstackRelatedListSelector`, `CardstackRelatedListService`, and
`CardstackRelatedListMcpAdapter`. It has no CRM write path. Existing record open and
editor authority independently decide whether a checked child can be opened/edited.

Canonical layout `relatedLists` overrides legacy `recordCard.relatedLists`, including
an explicit empty array. No active parent layout fails runtime closed. An active
layout without related lists produces an empty summary. Each list has a stable key,
native child relationship, ordered scalar column names, native sortable/filterable
sort field, lower-case asc/desc direction and page size 1–50 (default ten). Six lists
and eight columns bound each published layout. Candidate validation never publishes.

Parent, child and anchor queries use USER_MODE and sharing. A parent read precedes
policy/configuration and child reads. Native describe supplies child object, lookup
constraint, labels and readable name field; Case uses CaseNumber. Child field
projection, sort and name independently obey native FLS and its active published
field denylist. Identifier columns, traversals and encrypted values are rejected.
A child layout is optional for this explicit read projection. Native record currency
or UserInfo default currency supplies monetary cell context, with no hardcoded USD.

The position cursor includes a version, full parent18, list key, definition digest,
anchor18 and hash of the anchor sort value. It cannot grant reads or supply query
identifiers/typed seek values. The server rereads an anchor with the native parent
constraint and derives the typed seek value itself. Missing, reparented, inaccessible,
changed-sort or wrong-context anchors return PAGE_STALE. An Id sort uses its chosen
direction; other sorts use NULLS LAST with Id ASC ties. Unchanged data pages
predictably, without claiming a frozen snapshot of independently edited records.

App-only tools are:

- `cardstack_record_related_definitions`: `{parentId}`.
- `cardstack_record_related_page`: `{parentId,listKey,cursor?}`.
- `cardstack_record_related_open_child`: `{parentId,listKey,childId}`.

All schemas are closed. Definitions return `record-related-definitions/v1` with
checked parent identity and ordered `lists`. Pages return `record-related-page/v1`
with parent, list key, relationship, child object, label, definition fingerprint,
columns, rows and hasMore. The bounded columns contain fieldApi/label/dataType and
native numeric precision/scale where relevant. Each row contains recordId,
recordName and ordered cells with literal strings/null; monetary cells carry
currencyCode. Values longer than 4096 characters fail closed rather than truncating.

The adapter excludes cursor and internal policy/query identifiers from public
structuredContent. Every page includes private `_meta['cardstack/related']` context
with parentId, listKey and definitionFingerprint. nextCursor is present only for an
actual continuation. Checked-child navigation calls the existing native record
adapter; it creates no implicit edit permission and never bypasses confirmation.

The new `ui/opportunity-edit/related-contract.mjs` projects and bounds both public
DTO families and checks page/child request shapes. Local tests establish contract
and DOM-fixture behavior. Native compile, actual Apex execution, restricted-user
CRUD/FLS/share fixtures, real host QA and independent readback are distinct gates
owned by the integration coordinator. No local result establishes those gates.
