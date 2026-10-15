# Related lists in the existing Salesforce record workspace

Status: proposed scoped design for review. User approved the related-list workstream
and delegation; implementation of these interfaces awaits the consolidated design
review. This document grants no deployment, runtime, browser or permission changes.

## Product outcome

An admin chooses native child relationships, column order, list order, default sort
and page size in Studio, previews the configuration, and publishes through the
existing native draft/review/publish boundary. A rep uses Details and Related in the
existing compact persistent record workspace. Related lists load only when opened.
A child row opens the existing governed record editor in that same workspace, with
a checked parent breadcrumb. Account Contacts and Opportunities are the first reuse
fixture; this is not a new object-specific card or writer.

## Approach and alternatives

Use a focused native policy, selector and read-only related-list service with narrow
hooks into the existing Studio, MCP adapter, controller and renderer. Adapting the
old invocable directly would retain its fixed columns and legacy response shape;
introducing a separate browser/runtime would duplicate the proven workspace and its
authority. Neither is selected. The old CardstackGetRelatedAction is not a runtime
dependency of this feature and remains unchanged unless separately coordinated.

## Published definition

Canonical configuration is the ordered `relatedLists` array on the existing
`layout:<ParentObject>:default` document. Existing layouts without this property
have no enabled related lists. A legacy `recordCard.relatedLists` shape may be read
only when the canonical property is absent; Studio writes the canonical shape.

```json
{
  "relatedLists": [
    {
      "key": "contacts",
      "relationship": "Contacts",
      "columns": ["Name", "Email", "Phone"],
      "sort": { "field": "Name", "direction": "asc" },
      "pageSize": 10
    },
    {
      "key": "opportunities",
      "relationship": "Opportunities",
      "columns": ["Name", "StageName", "Amount", "CloseDate"],
      "sort": { "field": "CloseDate", "direction": "asc" },
      "pageSize": 10
    }
  ]
}
```

Proposed bounds: six lists, eight columns per list, page size 1–50 (default ten).
Keys are unique stable identifiers with `[A-Za-z0-9_-]{1,80}` syntax. Native describe
resolves relationship name to child object and lookup field. Browser-provided child
object, foreign key, SOQL, endpoint and sort values never select runtime authority.
Columns are direct scalar field API names; relationship traversals and identifier
columns are excluded. Sort fields must be native readable, filterable and sortable
scalar fields; unsupported types fail authoring validation. Runtime reloads native
metadata and published policy each request. Labels come from native describe.

The explicit related-list projection authorizes read columns; a child layout is not
required merely to read them. The child's published field denylist still restricts
that projection. A child layout and executable action are independently required by
the existing editor when the rep opens a row. No implicit edit grant is created.
The name field is discovered with `isNameField()`, including CaseNumber. It must be
readable and not denied, even when it is not a configured table column. A denied or
unreadable selected column or sort field fails the list closed; it is never silently
queried. CurrencyIsoCode is checked and projected when needed in multicurrency orgs;
otherwise use the existing native default-currency convention. No hardcoded USD.

## Service boundary and owned files

New related-specific files are owned by the related-list agent:

- `CardstackRelatedListPolicy.cls`: pure candidate validation/catalog and fresh
  published definition resolution; includes canonical metadata fingerprint.
- `CardstackRelatedListSelector.cls`: all user-mode parent, anchor and child queries.
- `CardstackRelatedListService.cls`: orchestration, bounded paging and public DTOs.
- Corresponding API67 metadata and focused Apex tests; new related contract module
  and contract tests only after the parent agrees to the wire interface.

Root owns all existing integration files: ConfigService, StudioController, Studio
components, RecordMcpAdapter, dispatcher, shared contract/controller/renderer and
resource build. No two agents edit the same file without explicit handoff.

Proposed Apex entry points:

```text
CardstackRelatedListPolicy.validateLayout(configKey, rawCandidate)
CardstackRelatedListPolicy.catalog(parentObjectApi)
CardstackRelatedListService.listDefinitions(parentId)
CardstackRelatedListService.readPage(parentId, listKey, cursorOrNull)
CardstackRelatedListService.checkChild(parentId, listKey, childId)
```

`validateLayout` is candidate-only and called at both existing draft-save and exact
reviewed publication validation hooks. It does not expose child records. `catalog`
returns only native supported relationships and eligible metadata for Studio.
Runtime methods accept no candidate JSON. `listDefinitions` performs an authorized
parent read before exposing enabled list summaries, and queries no child rows or
counts. `checkChild` rechecks current parent, policy and exact child membership before
root routes the checked child ID through existing card open/editor policy.

## Paging and checked wire shape

App-only page request: `{parentId, listKey, cursor?}`. Strict closed schema; all IDs
normalize to checksum18 at ingestion. Read the parent `Id` and native name field in
USER_MODE before any child/anchor query. Relationship metadata supplies the child
lookup constraint; every child query executes in USER_MODE with sharing.

Use a keyset cursor containing version, parent18, listKey, definition fingerprint
and anchor child18. It carries no review grant, credential or interaction key and
is position only, never authorization. On continuation, re-read that anchor using
the native parent lookup constraint and USER_MODE, and derive its typed sort value
from Salesforce. Reject cross-parent/list/policy mismatches, malformed cursor,
unreadable, deleted or reparented anchors as `PAGE_STALE`. Cursor payloads cannot
select arbitrary query identifiers or inject sort values.

Query `ORDER BY <native sort field> ASC|DESC NULLS LAST, Id ASC`, except an explicit
Id sort uses Id alone. For a non-null anchor, seek greater/lesser sort values, equal
sort with greater Id, or null sort values. For a null anchor, seek null sort values
and greater Id. Query pageSize+1, return at most pageSize, and derive `hasMore` from
the extra row. No total count query. Deterministic paging covers unchanged data;
external edits/inserts are not a frozen snapshot. Refresh restarts paging.

Page DTO contract version `record-related-page/v1`:

```text
parent: {recordId, objectApiName, recordName}
listKey, relationship, childObjectApiName, label
definitionFingerprint
columns: [{fieldApi, label, dataType, precision?, scale?}]
rows: [{recordId, recordName, cells:[{fieldApi, value, currencyCode?}]}]
hasMore, nextCursor?   // Cursor copied only into private MCP metadata by root.
```

Values use native literal strings/null, with bounded scalar descriptors and currency
codes compatible with the existing formatter. Decimal values retain precision;
renderers format, not infer currency. Root's public serializer excludes cursor from
model-visible structuredContent and validates metadata separately. Failures use
bounded public codes (`RELATED_UNAVAILABLE`, `PAGE_STALE`, `INVALID_REQUEST`) without
raw SOQL, inaccessible values or private IDs in errors.

## Existing workspace integration

Opening Related preserves identity chrome and reachable actions. Each list has
independent loading, empty, error and continuation state. Request identity binds
record18, listKey, current definition fingerprint and controller generation. A
delayed result from a former record/list is ignored. A successful empty response
shows an empty list; a failed response clears stale rows for that list and offers
retry. Parent access loss invalidates all related content and breadcrumbs.

Row open is an app-only checked parent/list/child request. The server revalidates
membership and then uses the existing editor path; changing editor fields does not
bypass review/confirm. Parent breadcrumb returns through fresh authorized Open.
Editing/Review must follow the existing cancellation/leave boundary before switching
record, with no implicit Confirm. Historical completion receipts retain their
checked historical values; fresh related reads never rewrite a receipt.

## Implementation sequence after review

1. Policy tests establish absent-config behavior, strict candidate shape, native
   Contacts/Opportunities relationships, column order, CaseNumber, denylist and
   unsupported relationship/field/sort rejection; then implement policy/catalog.
2. Selector/service tests establish parent-before-child reads, exact membership,
   deterministic ties/nulls, bounded keyset pages, cursor context changes, deleted
   anchors, empty lists and native currency; then implement read-only service.
3. Root integrates candidate validation and Studio catalog/controls preserving all
   existing layout data and exact draft-review publication binding.
4. Root integrates checked summaries, page/open-child app-only tool routing and
   private cursor metadata; closed schemas reject unknown keys and caller authority.
5. Root integrates related contract and lazy list UI into the shared workspace;
   focused fixtures prove delayed responses, permissions/error clearing, same
   editor navigation, parent return and compact geometry.
6. Root consolidates one quality gate, scoped analyzer/test results, then native
   actual-client acceptance and independent CRM readback if authorized.

## Verification and preservation

Focused local contract/renderer fixtures establish presentation only. Focused Apex
tests establish native backend behavior only when actually run in the existing org;
they do not establish live host proof. Distinct-risk checks include parent access
loss despite readable children, child FLS denial, deleted/reparented anchor, native
Case naming, currency code, tie/null continuation and stale record-switch response.
Restricted-user test fixtures must work with existing permissions; this task adds
no grants and makes no auth/security changes. Do not rerun 808 methods after every
small edit. Root owns release qualification and honest proof boundaries.

Preserve all five pre-existing dirty files and every other agent's files. No new
org, authentication, runtime hosting, object-specific writer, delete tool, inline
child writes or implicit child creation. No live-client/deployment success claim
until actual evidence exists.
