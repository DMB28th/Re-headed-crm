# Bounded native lookup qualification — October 14, 2026

Read-only acquisition in canonical `mcp-apps-delivery-proof/Re-headed-crm`, HEAD
`02ba34c`, against existing `cardstack-spike2`, API **67.0**. Root remains the sole
integration/deployment owner. **No enabled REFERENCE provider is qualified.**
This report adds concrete fresh platform observations to
[the authority contract](LOOKUP_NATIVE_CONTRACT_2026-10-14.md) and
[the integration handoff](LOOKUP_INTEGRATION_HANDOFF_2026-10-14.md).

## Observed acquisition and runtime facilities

Existing CLI authentication successfully executed API67 REST describe, Tooling
queries, UI API object-info and read-only lookup POST requests, plus SOAP Metadata
retrieval. No session/token was extracted or forwarded. CLI query/describe/retrieve
commands explicitly used `--target-org cardstack-spike2 --api-version 67.0`;
`sf api request rest` has no API-version flag, so its resource URLs explicitly
used `/services/data/v67.0/` and the fixed target alias. No global target changed.

| Exact acquisition | Observed API67 result | Qualification boundary |
| --- | --- | --- |
| Account REST describe / UI API object-info | ParentId is one-target Reference to Account, readable under this connected CLI actor, updateable and nullable; `filteredLookupInfo` is null. | Access/schema evidence under this actor, not effective-filter completeness or ordinary-user proof. |
| Fresh SOAP Metadata `CustomObject:Account` | Successful retrieval; exact ParentId XML is `type=Hierarchy`, with fullName and trackFeedHistory, and no emitted lookupFilter. | Demonstrates fresh hierarchy classification; XML omission does not establish unrestricted lookup eligibility. |
| Global describe plus custom-field inventory | Seven visible custom objects and 60 Tooling CustomField rows; accessible Account/Case/Contact/Lead/Opportunity custom fields contain no custom reference. | Bounded inventory, not an exhaustive claim across inaccessible entities. Goal/Metric describe returned NOT_FOUND. |
| `Cardstack_Config_Draft__c.Config__c` | Fresh describe, SOAP field XML and single-row Tooling Metadata agree: required ordinary Lookup to `Cardstack_Config__c`, deleteConstraint Restrict. Tooling Metadata explicitly includes `lookupFilter: null`. | Existing single-target custom lookup acquisition fixture, but private configuration infrastructure, not an approved CRM editor scenario. Null is stronger serialization evidence than omitted XML, still not a validated verified-none acquisition contract. |
| `Cardstack_Audit_Log__c.User__c` | Fresh SOAP XML: optional Lookup to User, deleteConstraint SetNull. | User-target semantics need separate treatment; do not substitute for the ordinary target fixture. |
| Tooling NamedCredential / ExternalCredential inventories | Both successful queries return zero rows. | No visible configured managed per-user callout route was found; not permission to create one. |
| UI API POST `lookups/Account/ParentId` | Successful source-scoped request returns one Account candidate whose exact full18 ID equals the source Account itself. | Native suggestions are reachable, but returned membership alone demonstrably does not qualify ParentId self/hierarchy semantics. |
| Same TypeAhead operation with a two-character name prefix | API67 accepted the request, contrary to the documented minimum-three constraint recorded in the earlier report. | One actual acceptance observation, not a supported general minimum-two contract or name-token semantic proof. |
| UI API POST `lookups/Cardstack_Config_Draft__c/Config__c` | Existing source record request succeeds, with zero candidates for the bounded synthetic prefix. | Endpoint/object-field availability only; no positive custom eligibility or negative membership result. |

The inventory does not reveal a suitable ordinary user-facing CRM custom lookup
fixture. The internal draft-to-config relationship can support acquisition research
without changing fields, records or policy, but exposing internal configurations
in the product would require a separate scope decision. No such exposure occurred.

## Exact successful read-only transport

For Account.ParentId the successful request was:

```text
POST /services/data/v67.0/ui-api/lookups/Account/ParentId
  ?targetApiName=Account&q=<private source-name prefix>&searchType=TypeAhead&pageSize=10
Content-Type: application/json
{
  "sourceRecord": {
    "apiName": "Account",
    "fields": {
      "Id": "<existing checksum18 source>",
      "Name": "<current readable name>",
      "ParentId": "<current readable parent or null>"
    }
  }
}
```

The query parameters belong in the URL, while the body contains sourceRecord.
The first attempted body with targetApiName returned JSON_PARSER_ERROR;
`searchTerm` in the URL was not recognized as the required search term and returned
ILLEGAL_QUERY_PARAMETER_VALUE. Replacing it with `q` succeeded. All attempts were
query operations and were retained, including failures. Private requests used
existing IDs and data; none are reproduced publicly.

Transport can be repeated without credentials in shell arguments:

```sh
sf api request rest '<private API67 lookup URL>' \
  --method POST --body @<private sourceRecord JSON> \
  --target-org cardstack-spike2
```

This is existing CLI-managed authenticated HTTP availability. It is not an
Apex-native facility, a production credential path, an actor-equivalence proof
between CLI and Cardstack ingress, or a promise of runtime callout eligibility.
The fresh request supplied observed Id/Name/ParentId, not a proven complete set
of every possible controlling source value. No filter or special-rule bypass
was inferred from successful response parsing.

## Freshness and remaining authority gap

The acquisition is current for this observation: SOAP retrieval succeeded, and
Tooling returned the exact custom-field Metadata with LastModifiedDate. Raw files
and response evidence are timestamped and hashed privately. Neither a retrieval
job timestamp, field LastModifiedDate, successful suggestion query, nor stable
snapshot hash guarantees current complete effective restrictions at a later
Review or locked Confirm. No native metadata change was introduced to prove
invalidation, and no known filtered/unfiltered fixture pair was available or
created to validate null/omission semantics.

For ParentId, a positive provider still needs independently justified hierarchy
eligibility (self, ancestry/cycles, depth and feature applicability), connected-user
source/target/dependency access, effective reviewed values and fresh validation.
The observed self candidate specifically prevents treating a fresh returned ID
as sufficient qualification for this adapter. For the ordinary custom candidate,
complete native-definition/special-rule acquisition and freshness remain unproved.
Neither bounded-page absence nor generic target Name search closes these gaps.
Native confirmed USER_MODE DML remains save authority, not a permitted read-only
qualification experiment; no trial DML or rollback was executed.

## Minimal proposed new access, not executed

A conditional next path is a Salesforce-managed **per-user** Named/External
Credential for supported same-org UI API HTTP, using an explicitly approved
OAuth client/principal arrangement. Both credential inventories are currently
empty, so this is genuinely new org/auth configuration and is outside this
investigation's authorization. Do not create it implicitly or reuse the deployment
SFAPP by changing JWT. Deployment JWT stayed untouched/ON.

Before enabling even one field, root would need approval for those exact
configuration components, permissions/principal access, scopes, same-org endpoint
and onboarding for the existing connected actor. Runtime must independently bind
the callout identity to the ingress user/org; reject missing or mismatched identity;
use per-user access, never a named principal; keep tokens managed by Salesforce;
never extract a session or forward an incoming credential. Browser inputs must
not choose endpoints, targets, filters or dependency fields. Deployment/core
packages must not silently ship live credential identities.

Root must then prove UI API restriction coverage on known required/optional
filters, reviewed controlling-value changes, positive exact-ID membership and
safe false-negative handling, and qualify a separate ParentId hierarchy adapter.
An API67 proof must establish callout ordering, durable owner-state locking and
freshness at Confirm without uncommitted-work or lock-release gaps. The current
suggestion response has no observed authoritative selected-ID endpoint. This
proposal changes neither the frozen search UX nor pre-Review eligibility contract;
any conservative suggestion-membership strategy must explicitly reconcile
matching semantics, pagination and hierarchy gaps before implementation.

A separate acquired-metadata evaluator path also remains conditional: approve a
complete admin acquisition/freshness contract with known filtered/unfiltered
fixtures and a strict ordinary-lookup subset, then prove current snapshots can be
validated at Review/Confirm. A one-time XML download or null property cannot be
promoted into that provider. Existing internal metadata offers a concrete future
acquisition fixture, not a completed validator.

## Evidence and executable handoff to root

Private evidence owner directory:
`.superpowers/sdd/2026-10-14-persistent-record-workspace/lookup-qualification/`.
It contains Account/custom-object describes, Tooling field/credential queries,
exact private request/response bodies, SOAP native-acquisition project and
49 successfully retrieved files, errors, and `evidence-manifest.json` with UTC
acquisition time and file SHA256 hashes. Raw files are mode600; directories
mode700. Keep them out of distribution, product resources, logs and public reports.

Root can inspect these exact sanitized anchors and then choose provider scope:

1. `account-describe.json`, `account-ui-info.json`, and retrieved
   `Account/fields/ParentId.field-meta.xml` establish schema/classification only.
2. `custom-config-metadata.json` and retrieved
   `Cardstack_Config_Draft__c/fields/Config__c.field-meta.xml` establish the existing
   ordinary-lookup acquisition fixture and explicit null serialization.
3. `account-lookup-response-v3.json` compared privately with `account-source.json`
   demonstrates the same full18 source/candidate identity; `account-lookup-min2.json`
   records accepted two-character TypeAhead behavior.
4. Credential inventories and `custom-lookup-response.json` establish the absent
   configured transport dependency and custom endpoint availability separately.
5. Preserve REFERENCE unsupported in the shared owner. Proceed with disabled
   picker integration if already authorized; resolve the exact new-access/design
   decision before any positive provider implementation or native enablement.

No browser, subagents, connection changes, field/record/settings creation, native
DML, anonymous Apex, test suite, deployment, production action or main ledger edit
was performed. The five pre-dirty files were not edited. Verification for this
document consists of successful API responses described above and a targeted
whitespace check; it does not claim provider, native regression or host acceptance.
