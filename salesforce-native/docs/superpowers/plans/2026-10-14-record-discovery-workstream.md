# Record discovery workstream

User-authorized priority 1, delegated implementation, October 14, 2026. Uses the
existing approved Salesforce-only record workspace direction. This is a scoped
implementation ledger and integration contract, not a new release acceptance claim.

## Owned deliverable

New `CardstackRecordDiscovery` and `CardstackRecordDiscoveryMcpAdapter` classes,
their focused tests, and API67 metadata. Existing dispatcher and renderer belong
to the root integrator. No existing product file, permission set, configuration,
connection, authentication or org state was changed by this workstream.

`cardstack_record_search` accepts required `query` (1–160 characters), optional
canonical `objectApiName`, and optional integer `maxResults` (1–10, default 5).
The exact adapter integration is `tools()`, `handles(name)`, and
`call(client, name, args)`. It references the existing record workspace resource.

The public `record-discovery/v1` envelope contains status Matches/Empty/Rejected,
`hasMore`, `needsSelection`, `searchIndexMayLag`, `searchedObjects`,
`unavailableObjects`, and candidates. Each candidate has checksum18 `recordId`,
`objectApiName`, native `objectLabel`, native `recordName`, and at most two compact
configured readable context values (`fieldApi`, native `label`, string/null
`value`). Rejection includes a bounded `errorCode`, with empty candidates.

The integrator displays explicit choices and passes a selected ID to the existing
`cardstack_record_open`. No result authorizes Start, Review, Confirm, or a write.
Duplicate matches, overflow, and incomplete configured scope require selection.
Open independently rechecks current published configuration and native rights;
an active layout without an available edit action can therefore be found but
fail its separate Open check. That failure must remain recoverable.

## Native behavior and limits

One bounded USER_MODE configuration query reads active default layouts only.
Canonical native object eligibility, searchable names, sharing, CRUD/FLS, and the
published denylist narrow scope. Up to twelve objects participate; more requires
an explicit object filter. Identifiers are derived from native metadata, never
caller-provided query fragments. Context excludes IDs, relationships, long text,
unconfigured fields and denied fields.

Names use one USER_MODE SOSL in native name fields with a prefix-search suffix and
a bound literal name LIKE filter. User percent/underscore/backslash cannot broaden
that filter. Each object is bounded to limit+1 and the public candidate list to
limit; overflow is explicit. Search index lag and unsupported/unavailable object
scope are separate from a readable empty result. Native SOSL token/prefix semantics
are not an arbitrary substring guarantee. Exact platform15 IDs normalize to
checksum18; checksum18 is validated and a single USER_MODE Id query bypasses
index lag. Ordinary 15/18-character names without a native key prefix stay names.

## Verification ledger

Tests authored before service implementation: duplicate names, empty matches,
bounded 251-result fixture, native ID normalization, invalid checksum, noncanonical
and unpublished scope, published denylist, closed adapter arguments/types, and
read-only descriptor. Additional coverage includes cross-object duplicates,
zero-DML discovery, 15-character natural name, and conflicting exact-ID scope.
Native RED/compile/execution: NOT_RUN in the workstream; root owns coordinated
native deployment and focused test execution. No local fixture claims Apex behavior.

Scoped Recommended analyzer was executed using the existing ignored Studio Java
runtime; first missing-Java attempt was superseded. Final four-class scan:
141 findings, 118 Moderate and 23 Low, zero Critical/High; Security filter had zero
matches. Findings concern compact-style braces, test naming/helper assertions,
documentation and complexity. This is not a clean analyzer claim. `git diff --check` passed.

Root owns final source review, dispatcher/renderer integration, consolidated
native qualification, deploy, actual ChatGPT/Claude acceptance and commit.
