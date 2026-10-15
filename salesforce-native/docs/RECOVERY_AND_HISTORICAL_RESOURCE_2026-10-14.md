# Recovery and exact historical resource continuity

October 14, 2026. Canonical integration checkout. This scoped change preserves
four exact Salesforce-hosted UI bodies from qualified application releases
`3daad61` and `5275b7e`. Root owns integration, native tests, deployment and actual
Claude/ChatGPT acceptance. No connection, credentials, permissions, grants, org,
public endpoint or hosting change is required.

## Existing recovery authority

The shared `ui/opportunity-edit/controller.mjs` already removes the local review
grant before dispatching Confirm, Back or Cancel. An interrupted response produces
Unknown while retaining the private interaction reference; Check save status uses
`resume`, without another Confirm or submitted patch. Native resume reads the
owned interaction and returns the authoritative receipt/current state. Native
repeat Confirm returns the original receipt and does not repeat a completed write.

Complete host record input, including input for the same record, retires the old
handle, revokes authority and increments both generation counters. Awaited results
must match generation, request generation, record and interview. A bound interview
rejects unsolicited success notifications; authoritative denial remains effective.
The native backend still checks actor/client/setup, policy, exact review revision,
freshness, cancellation and sharing/CRUD/FLS. Historical UI never bypasses those
checks or creates permission to write.

## Historical load diagnosis and bounded fix

Before this change `CardstackEditorUiResource.accepts` recognized a well-formed
old family digest, but `CardstackRecordMcpAdapter.readResource` and the Opportunity
adapter served only the current installed digest. A recognized historical digest
therefore deterministically returned null and dispatcher `resources/read` returned
`-32602`, `Unknown resource`. The actual Claude observation—an existing chat failed
to load while a fresh chat worked after the same discovery refresh—is consistent
with that path. It does not establish which URI the host requested or identify its
cache tier; those were not observed.

The new `CardstackEditorUiArchive` maps four exact full URIs to four fixed native
StaticResource names. It calls the existing named-user permission gate before
queries and reads with USER_MODE. After reading, it independently hashes the actual
Body and rejects a mismatch, missing, empty or unreadable asset. A caller cannot
supply a resource name. Families cannot read one another's assets. Test body
substitution is ignored outside Apex tests; the production registry is fixed.

| Release | Family | SHA256 |
| --- | --- | --- |
| `3daad61` | Record | `a2a99a80ee382b9922804f720e2e7c9dd1c18cdba95988c4eea2a430e4f4d075` |
| `3daad61` | Opportunity | `c24749508bbe8ff9163e328b84916bfaed2e1fb9e36b2315f1fda86e64e8455f` |
| `5275b7e` | Record | `5552323110417f4e8d870affa2030ce04a4b7c82e805abcca82cfdcdd28c3b56` |
| `5275b7e` | Opportunity | `e2b9d0699964d727fd6c0b113cce7f61c03062dd7ac19d96bc7eef1f175767eb` |

All four archives have Private caching and text/html metadata, totaling 1,388,808
bytes. They preserve the original embedded CSP and exact HTML bytes. Adapter
integration retains the existing empty external-domain resource CSP envelope.
Current tools/list and resources/list advertise only the current build. Legacy
mutable aliases continue to resolve current bytes. Unknown historical digests
remain unavailable; they never become aliases for current HTML. Archive retention
is bounded to these releases, not a promise to retain every released renderer.

Serving historical HTML proves load compatibility only. Older renderers may reject
new native DTOs/configuration; the native protocol and current policy remain the
authority. Do not weaken fresh native checks to make old controls save. A resource
withdrawn for security or incompatibility must be removed from the fixed allowlist
and its old hash must fail closed. Supporting another release requires reviewing
its bytes/CSP, adding an exact fixed mapping and integrity/native tests.

## Integration and qualification

1. Root updates each adapter readResource: load current asset first; preserve
   current/legacy behavior. For a nonlegacy requested URI differing from current,
   call `CardstackEditorUiArchive.load` for that trusted family. Return null if no
   exact archive exists. Build the same CSP/mime envelope using its checked bytes.
2. Root includes the new class/test and four archive resources in the checkpoint
   inventory. Keep archive assets out of the UI builder's generated-current output.
   Consolidate current resource/dispatcher and archive native checks in one run.
3. Independently retrieve the deployed four archive bodies and verify all four full
   digests plus their Private metadata. Confirm current discovery still advertises
   current hashes, unsupported versions fail, and permission denial queries nothing.
4. In each actual host, reopen/reload a conversation that genuinely retained one of
   these resource versions through supported host controls. Record actual loading,
   displayed identity and safe native status recovery. A protocol resources/read
   call is native/transport evidence, never actual-host loading acceptance.
5. If historical loading still fails, refresh existing tool discovery and use a
   fresh conversation with a known-ID Open through the unchanged connection.
   Do not describe that as restoration of the old screen or retained draft. Without
   host-provided private recovery state, explain that a prior save may have completed;
   obtain native readback before any new proposed edit.

## Distinct actual-host fault verification

Lost Confirm response and delayed stale-record switch remain NOT_RUN in both
hosts until a supported, authorized response-control path is available. Do not
intercept tokens, change auth, manipulate hidden host state or treat CSS loading,
fixture mocks, or an unconsumed API response as an actual host fault.

For interrupted Confirm, retain a private baseline and invoke Confirm once. The
fault must withhold the returning response after the real native call may commit.
Capture Unknown and the disabled/revoked Confirm state; select Check save status,
not Confirm. Corroborate the resulting original receipt and exact reviewed values
with independent native readback: at most one write, one audit and one durable
completion. Query/resume cannot resave. If no commit occurred, record the actual
pending/denied outcome instead of manufacturing a saved result.

For stale switching, retain an old Review/read result using a supported response
control, switch through a genuine host context change, then release old success
and old rejection independently. Verify the new full18 record/object, interview,
draft, focus and authority persist. Repeat for a fresh same-record interview.
Record observed tool/action counts and no write/audit on either record. A result
that was never delayed and released cannot qualify this row.

Record source/resource version, host and chat, evidence tier (native, fixture,
synthetic browser, actual host), fault stimulus and PASS/FAIL/BLOCKED/NOT_RUN.
Keep interaction handles, review grants, raw native state and credentials private.
Actual-host acceptance cannot be inherited across a changed current HTML hash.

## Worker verification boundary

The new offline archive integrity suite was written first and failed all four
cases because archive assets were absent; after adding the assets it passed 4/4.
It checks each full qualified SHA256 and Private/text-html metadata. A separate
local provenance comparison matched every byte to its exact qualified Git source;
the committed suite requires no historical Git objects, so shallow checkouts work. This is source artifact integrity, not Apex
execution, deployed-byte retrieval or actual-host proof.

`CardstackEditorUiArchiveTest` covers real retained bodies, unknown digest,
cross-family input, mutable aliases, corrupt/missing/empty bytes and named-user
denial before any query. Native execution/deployment and actual-host archive reload
remain root-owned and unexecuted by this worker. Existing interrupted-save and
stale-controller fixtures remain useful regression evidence, with their original
evidence tier. The exact Claude cache/request cause remains unproved.
