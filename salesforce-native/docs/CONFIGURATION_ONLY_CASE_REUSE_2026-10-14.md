# Configuration-only Case reuse acceptance

October 14, 2026. Prepared against the persistent API67 workspace. This is a new
acceptance candidate, not another Lead milestone or a new object-specific flow.
No runtime renderer, controller, provider or writer changes are required by this
candidate. No configuration or record has been published or mutated in the live
org by this preparation.

## Distinct reusable boundary

The generic engine already derives the canonical object from native record identity,
resolves `isNameField()` metadata for the header, intersects published policy with
native CRUD/FLS, projects section membership, and uses the shared confirmation and
writer. Contact schema2 and fixed Opportunity schema1 are compatibility paths;
their object constants are not evidence of current generic object routing.

Case qualifies a different record shape: actual read-only metadata from the existing
QA org confirms `CaseNumber` is its name field, an immutable auto-number. Editable
Subject is not its identity. `OwnerId` is native required REFERENCE and therefore
belongs in the readable freshness projection, while remaining unavailable as an
editable action mapping. This separates required-record validation from lookup
support and tests persisted restoration of readonly identity and native references.

| Configured input | Actual native type | Native length | Role |
| --- | --- | --- | --- |
| SuppliedEmail | EMAIL | 80 | Existing bounded Email codec |
| Subject | STRING | 255 | Published required restriction over a native nullable field |
| Description | TEXTAREA | 32000 | Existing codec; shared 4096-value bound still applies |
| SuppliedPhone | STRING | 40 | Exact native type; field name does not select PHONE codec |

The [configuration candidate](evidence/configurable-record-edit/case-configuration-candidate-2026-10-14.json)
is intended for `layout:Case:default`. Action identity is `case_details`, label
`Update case details`, and mapping order is Email, Subject, Description, Phone.
Request groups Subject/Description; Reply details groups Phone/Email. This deliberately
separates action/review order from published section placement. It is not an installer
or permission grant. Existing unrelated Case configuration must be preserved and
restored by the integration owner if a temporary acceptance publication is needed.

## Prepared native tests

`CardstackConfiguredCaseTestData` owns rollback-only native test fixtures, grants,
draft publication and deterministic readback. `CardstackConfiguredCaseEditTest`
adds six methods through the existing generic capability/adapter:

1. Open/Resume/Review/Confirm/consumed Confirm replay/Refresh retains auto-number
   identity, saves four exact configured changes and appends one CRM save audit.
2. Native descriptors and configured sections survive projection and persisted
   restoration, including required unmapped OwnerId.
3. Published required Subject rejects explicit Clear before any write.
4. An unpublished candidate cannot alter the existing task; publication invalidates
   the previously reviewed context before Confirm.
5. Auto-number CaseNumber rejects editable authoring.
6. Providerless OwnerId rejects editable authoring.

All four class/body metadata files are new and use API67. Tests use existing package
permission helpers and rollback-only native Case grants. No live security grants,
provider call mocks, new object renderer or save engine were introduced.

## Qualification and integration gate

Read-only actual Case metadata: PASS. Existing local shared field contract suite:
11/11 PASS. Native compilation and these six native methods: NOT_RUN, owned by the
root integration deployment. Actual Studio and actual ChatGPT/Claude Case journeys:
NOT_RUN. The local checks do not establish Salesforce execution or host delivery.
Local PMD was attempted; no Java runtime was available through the default local
lookup, so its engine could not initialize. This is an analyzer environment
limitation, not a clean scan. Use the existing qualified Java/analyzer environment
for the consolidated source check.

Before claiming reuse, include the new classes in the immutable deployment inventory,
run the six expected native methods alongside affected shared adapter/capability
tests, and reconcile deployed source. Then publish the preserved Case candidate
through Studio draft review and confirmation, create an owned disposable fixture
through the coordinated native acceptance setup, and complete each host's actual
journey. Corroborate exact values, unchanged CaseNumber/OwnerId and exactly one save
audit per host independently in Salesforce. Keep cancellation, validation, receipt
replay and historical/fresh record separation visible in that acceptance.

REFERENCE editing, dependent/multiselect picklists, Percent, DateTime, Time, compound
and rich-text editing remain unsupported. This candidate does not widen the native
object allowlist or infer support from Describe alone. Actual non-Master picklist
context and record-type-dependent selection remain separate provider proof; this
scalar Case action intentionally requires no new selectable provider.
