# Cardstack integration checkpoint

This chat (the root Cardstack integration chat) is the sole deployment owner.
The verified persistent environment is `cardstack-spike2`, API **67.0**. Temporary
clean-install orgs provide only specifically requested install evidence. This
runbook does not authorize creating an org/package or changing authentication,
Sites, callbacks, grants, default targets, fixture data, policy or org settings.
Reuse working CLI authentication. Present successful SOAP reads do not justify
historical JWT toggles. A process-only REST transport fallback is permitted only
after an actual default transport restriction; never change global auth for it.

## Prepare an exact offline artifact

Run from the integration checkout, using a new destination outside
`salesforce-native/`:

```sh
python3 salesforce-native/scripts/prepare-record-editor-checkpoint.py \
  /tmp/cardstack-integration-UNIQUE \
  --persistent-overlay spike2-retained-tests/v1
```

Omit `--persistent-overlay` for distributable core/clean-install source. Preparation
calls existing `build-package.py --core-only` and local `sf project convert source`
with API67. It performs no network, auth, target selection, org creation, native
test execution or deployment. No package/runtime dependencies are installed.

`scripts/record-editor-checkpoint-inventory.json` explicitly lists all reviewed
core files and ordinary Apex method identities. Update that inventory only after
reviewing source changes. New unlisted components/families, missing companions,
malformed XML, empty/duplicate/mismatched test inventories, symlinks and unsafe or
existing destinations fail closed. Source hashes are checked against staging and
again after conversion. Failed staging/conversion evidence is retained privately;
do not overwrite it or delete it to make the preparation appear successful.

A fresh private directory contains:

- `core-source/`: packageable native core, without the persistent-only overlay.
- `deploy-source/`: exact core plus explicitly selected compatibility tests.
- `mdapi/` and root `deploy.zip`: Metadata API files with `package.xml` at ZIP root,
  manifest API67, no `unpackaged/` wrapper and no destructive-change manifest.
- `inventory.json`: SHA256 of each source, overlay and converted file, combined
  ordinary test identities, excluded families, artifact SHA256 and native NOT_RUN.
- `SHA256SUMS`, `status.json`, and private stage/conversion logs. Summary stdout
  contains only counts, API version, artifact hash and native status.

Only applications, Apex, custom permissions, Flexipages, LWC, objects, the two
package permission sets, static resources and tabs enter the artifact. Sites,
OAuth/ECA/JWT/guest/profile/global settings and unrelated metadata are excluded.
HXL widgets and Lightning type bindings remain in authoritative source and the
installed environment. Their omission from this additive core artifact creates
no implicit deletion. Introduce and prove the replacement before the explicitly
reviewed binding cutover. Do not manufacture published configuration rows.

## Retained persistent-org tests

The persistent org also contains historical unpackaged `CardstackSiteAuthProbe`
and its 15-method suite plus the 25-method `CardstackMcpTransportProbeTest`. They
are outside distributable source. The original selected native Body is preserved
in the private audit capture and immutable `retained-originals/` copies, with an
independent native metadata archive owned by the root. The Site runtime is unchanged.

`integration/spike2/` contains only the two explicit API67 test overlays. Every
original ordinary method identity remains; TestSetup fixtures are not counted as
ordinary methods. Preparation includes component hashes and all **40** expected
identities only when the named overlay is explicitly selected. Unknown/non-test
classes, extra files or missing metadata pairs are rejected. Do not distribute
this overlay: its historical Site probe and synthetic resource dependencies are
installed persistent-org prerequisites and are not shipped in core source.

The five `namedUi*` Site delegation methods now send their original independent
tools/list, resources/read, exact typed echo, malformed JSON and notification
inputs and expect HTTP404 `unknown_probe_route` at the direct ingress. An isolated
native `Cardstack_User` fixture proves Use is present. Each asserts zero private,
CRM/resource queries, zero DML and zero callouts before denial. This reflects the
intentional exact-direct-route/non-Site/Use/enrollment boundary. It does not weaken
the guard or reactivate the Site. The other ten guest, identity, metadata and
protocol methods preserve their expectations. The two exact metadata resource
expectations use fingerprints of their original private URLs, preserving exact
identity without committing the actual org origin/prefix.

The retained 25-method suite uses isolated native Use and privately enrolled
`direct-org-api/v1` / `apex-probe/v1` setup before each synthetic call. Its public
client/callback literals are synthetic test values, not live enrollment inputs.
The existing test-only Manage seam is used solely for isolated setup; Use remains
an actual native custom permission. Catalog assertions find the retained aliases
by name/URI instead of assuming historical list indexes. Supported protocol
2025-06-18, exact seven typed values, empty text, invalid types/params/arguments,
1000-character bound, 16KiB byte bound, resource HTML/MIME and notifications keep
their positive/negative meaning. Expected reads distinguish private enrollment
(one query), product resource discovery (two additional resource queries) and the
retained resource read (one additional query) from zero CRM queries, zero DML and
zero callouts. All 40 retained methods passed the October 13 complete native
checkpoint. Their original private source and failed intermediate evidence remain
archived; this overlay is still excluded from distributable core source.

## Root execution sequence and acceptance

1. Prepare the exact artifact; review its source/overlay hashes and method
   inventory. Complete the focused local renderer/Studio/compiler/analyzer checks.
2. Run consolidated native API67 **RunAllTestsInOrg** against the exact
   artifact in `cardstack-spike2`. RunLocalTests skipped installed unlocked-package
   tests in this environment. Include the retained 40 identities and all core
   ordinary tests; inspect actual test names/counts, not just a summary count.
   Resolve native schema/FLS/compile and source regressions. Normally qualify with
   checkOnly and reuse the passing validation. Within explicit owned-development
   deployment approval, a scoped-reviewed correction may instead combine fresh
   qualification and actual deployment in one atomic RunAll job with default
   rollback on failure. Do not treat a pending job as deployed or passing.
3. Verify applicable Salesforce deployment coverage (at least 75% aggregate and
   every applicable trigger covered), as well as permission, replay, expiry,
   freshness, exact typed values, policy, source-version and denial behavior.
   Local VM tests/PMD parsing establish neither native compilation nor coverage.
4. Deploy the identical artifact within the existing approved persistent development
   scope. Reuse successful validation for quick deployment when supported; a combined
   atomic job must pass the same test-identity, coverage and error gates before
   acceptance. Ask only for a genuinely new action outside that scope. Root owns
   rollback/archive and all org operations. A changed source file requires fresh
   preparation and native qualification; never deploy a different rebuild.
5. Independently retrieve native source and resource Body, compare to the exact
   artifact, and perform native readback. Preserve raw hashes; distinguish native
   final-newline omission and XML defaults/order from executable differences.
   Preserve existing installed HXL binding availability until the reviewed replacement
   cutover.
6. Perform actual host acceptance on the user's **personal Chrome**. Verify the
   intended profile; never use Contextary/Optio and pause browser actions while
   the human uses that browser. Profile selection alone proves neither connector
   endpoint matching nor host acceptance. Match the existing endpoint privately,
   then refresh discovery/open the real iframe, exercise the host bridge and the
   governed Review/Confirm/save/refresh flow, independently read native values,
   and verify replay/audit behavior. Record Claude and ChatGPT evidence separately.

First three-field acceptance remains Opportunity Stage/CloseDate/Amount. Account
configuration reuse is Name/Description/NumberOfEmployees; use current canonical
native metadata/FLS for every actual fixture. Contact boolean examples and a
custom object in local tests are synthetic metadata fixtures, not assertions that
those fields exist or are accessible in the persistent org. Native Integer may
report precision0; the shared codec and public descriptor normalize this native
INTEGER case to int32 precision10 while retaining the original metadata fingerprint
and signed bounds. Never accept fractional values for native scale0 currency.

## Initial persistent checkpoint October 13

The combined source baseline is `codex/cardstack-integration`, application commit
`4e327f1`. The exact API67 artifact passed all 772 native methods, including every
765 inventoried Cardstack method, with 90.27% aggregate coverage and no component,
test or coverage errors. The same validated artifact deployed successfully to
`cardstack-spike2`; 323 expected metadata files were independently retrieved.
Apex/LWC source matches after the platform's final-newline omission, renderer
resources match exact bytes, permission sets match full semantics, and the remaining
nine XML differences are verified native defaults, false-property omissions and
an unchanged numbered tab icon. Deployment OAuth metadata is unchanged; JWT is ON.

The existing direct route is privately enrolled at revision1 using the enabled
Delivery Probe app's existing public client ID and both registered callbacks.
A native global callback field can contain newline-separated URLs; import those
as separate callback entries. Do not weaken the input control-character guard or
change the OAuth registry. Use existing CLI-managed requests for native HTTP;
do not assume an org display field is a usable Authorization token.

Account, Opportunity and Contact candidates were staged, reviewed with their exact
native digests, and published through Studio's controller. Actual deployed MCP HTTP
acceptance passed 65 checks: each object completed Open/Edit/Review/Confirm/receipt/
Refresh with independent native readback and exactly one save audit; validation and
cancellation before/after review had no CRM effects. Account exercised configuration
reuse and recovery through Resume after its Confirm response was left unconsumed
by the acceptance client. This proves backend recovery, not an induced network loss.

This initial checkpoint preceded actual personal-Chrome acceptance. The later
`b582651` application completed Studio draft/review/publication and Opportunity
and configured Account save journeys in Claude and ChatGPT against the same
persistent org. Its host evidence does not qualify subsequent expanded field types.
Existing working host entries remain intact. New field-type screen acceptance
requires the user's Mac to be manually unlocked; never bypass that boundary.
Lookup stays unsupported until its native provider is complete. A fresh package
install is NOT_RUN and requires its own specific release checkpoint.

See [the integration report](CARDSTACK_PERSISTENT_INTEGRATION_2026-10-13.md) for
the prior shared-editor host evidence. The new Studio/scenario and field-type
checkpoint has separate native, API and actual-host evidence; do not inherit host
acceptance from an earlier source version.


## Current Studio and field type checkpoint

Application `8f1b138` is deployed to `cardstack-spike2`. Artifact SHA256 is
`9b1d60ef15d710a5cfa4065e733521c6b4cfb9808aa25acd562cdf9534c4fc95`.
All 808 native methods passed, including every 801 inventoried method and the same
seven org extras; coverage is 90.38%, with no component/test/coverage errors.
Independent retrieval verified all 329 files and the renderer bytes.

One owned Lead demonstrated ten-field Open/Edit/Review/Confirm/receipt/Refresh,
five validation risks, cancellation and durable receipt replay through live MCP
HTTP with real native picklists. Configuration-only maintenance changed its
label/order/membership and reused the same engine without another deployment.
Native controller publication is separate from actual Studio clicks. Five original
configuration rows and five original draft rows remain unchanged.

Expanded type support must cross the adapter, service and renderer contracts.
Keep focused adapter regression and live API acceptance; a provider fixture alone
cannot qualify native behavior. Native AnnualRevenue has scale0 in this environment;
use each field's actual precision/scale rather than assume two currency decimals.

The new actual Studio/Claude/ChatGPT checks remain blocked by the locked Mac.
Use only personal Chrome after manual unlock, preserving working connections.
[The current milestone report](CARDSTACK_CONFIGURABLE_SCENARIOS_2026-10-13.md)
separates renderer, native regression, live API and actual-host proof.


## Actual client checkpoint October 14

Actual Studio, Claude and ChatGPT acceptance is now verified for the field-type
expansion using the user-authorized in-app browser while Chrome was in use. Each
host saved eight fields with one new audit and exact native readback; validation,
current picklists, commas, cancellation and receipt refresh were observed. Studio
published a configuration-only ten-field action and section-order change; ChatGPT
rendered it through the same editor with no deployment.

After changing an HTML content address, use the existing ChatGPT app's **Refresh
tools** control, then issue a fresh Open. This restored its loading failure without
recreating OAuth or changing permissions. Cached historical cards may not reload.
For a fresh Studio browser session, use existing approved sign-in. If using an
existing CLI-managed sign-in URL, prepare it immediately before navigating to the
verified same org, never display it, and remove the transient credential capture.
Keep deployment JWT ON. No toggle was needed for successful current sign-in.

See the [updated milestone report](CARDSTACK_CONFIGURABLE_SCENARIOS_2026-10-13.md)
for proof boundaries and remaining unsupported capabilities.

## Persistent workspace checkpoint October 14

Application `5275b7e` is deployed to the same persistent API67 org. Its three-resource
UI delta is qualified against the `3daad61` baseline: 808/808 native methods,
90.38% coverage and 329 independently reconciled readback files, including nine
explained platform-default XML differences. All 357 non-UI core files are byte
identical to that baseline. The UI delta passed 124/124 exact native
resource/adapter methods; all six retrieved resource/body metadata files match
exactly. Final shared renderer/contract checks passed 93 tests with SDK 1.7.4.
This preserves one coherent native qualification and separately tests the UI delta;
it does not imply another full 808-method run for unchanged backend code.

The shared workspace retains configured sections, editing controls/drafts, busy
content and reachable actions. A maximum host height caps a preferred 500px overall
envelope; it does not expand the app to a large reported ceiling. Measured chrome
that cannot fit uses a scrolling fallback. Fresh checked header identity is
separate from the immutable historical receipt. Outer chat scrolling remains
host-owned.

Actual ChatGPT completed the configured ten-field Lead journey: Employees `1.5`
produced a client error; Back retained the proposal; re-review and one Confirm
produced the receipt and exactly one new native save audit. Refresh showed the
fresh checked record name/current values. Native verification found zero added
audits and unchanged records for cancellation before and after Review.

Actual Claude also passed the complete ten-field journey in a fresh conversation
after refreshing the same existing tool discovery. Employees `1.5` was blocked;
Back retained the proposal; re-review, one Confirm, receipt and Refresh produced
the fresh name and all reviewed native values. Draft and Review cancellation each
preserved native values and LastModifiedDate, with zero audit delta anchored to
the preceding ChatGPT save. Total audit delta from the common baseline was two,
one per host. Both corrected 500px apps had visible action footers. Claude's
outer iframe before Review and after Refresh remained height 500/top 134/bottom 634
in a 720px viewport, with the enclosing ancestor scrollTop 186 unchanged.

The old Claude conversation's embed still failed after tool refresh; fresh
conversation success does not qualify historical-card recovery. No OAuth,
permission, connection or backend change was made for this recovery. REFERENCE
lookup and natural name resolution remain outside this delivered scope;
actual-host lost-response and delayed-switch fault rows remain NOT_RUN. See
[the workspace report](PERSISTENT_RECORD_WORKSPACE_2026-10-14.md) for boundaries;
root owns the final actual-host evidence and preservation receipts.
