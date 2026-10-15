# Opportunity package/fresh-install gate — concrete proposal

Prepared October 11, 2026. **Not executed; package creation and scratch-org
creation/installation require separate approval under the approved plan.**
The backend/MCP source passed272/272 scoped native tests, with both independent
reviews approved. The custom Opportunity UI remains unbuilt.

## Frozen source

Source `0f1662f545a5d99b2fbffe32ffe4ccd609657de2`, API67.0. The existing reviewed
`build-package.py --core-only` staged283 files,93 Apex classes (46 annotated
test classes including factories), native Studio, private objects, two Cardstack
permission sets and the existing diagnostic resource. No new permission or
metadata definition was authored for this proposal.

Source-tree SHA-256: `3b500fc1316ed3e8f402dbfd0ce05c1f4327aaeb6cb8ae959f24e03b31a6bf7b`.
Private controller snapshot: `.superpowers/sdd/2026-10-11-opportunity-custom-mcp-apps/stage-provider-package-candidate-0f1662f/`.
File inventory: `stage-provider-validation/package-source-inventory-0f1662f.json`.
Earlier failed22f3 snapshot remains preserved.

The source staging excludes per-org external OAuth apps/settings, hosted MCP
definitions, HXL uiWidgets and companion Lightning types. It leaves the existing
deployed0.1.0.8 beta and actual client connections intact. Existing SDK1.7.4
diagnostic content is retained; no Opportunity HTML placeholder is added.

## Exact proposed persistent scope

1. Create **one unreleased beta package version** from this frozen snapshot using
   the existing locally configured Dev Hub, API67, the existing Cardstack package
   alias and `--code-coverage`. Run actual package validation; no skip-validation.
   The version number is assigned by Salesforce; no number is assumed.
2. Create **one new one-day Developer scratch org**, alias
   `cardstack-stage-package-qa-0f1662f` after verifying that alias is unused.
3. Install only the returned package into that fresh org, then execute the full
   installed local Apex suite with coverage at API67. Capture package/source
   identity and completed results separately.
4. Delete only the newly created scratch org after evidence capture. Preserve the
   unreleased beta and private failed/successful evidence for reproducibility.

This scope creates no business CRM fixtures or new OAuth/Site/client connections.
It does not install into `cardstack-spike2`, upgrade beta, promote/release, retire
HXL, push or merge. Existing deployment JWT remains ON; this scope does not
change that setting. If unexpected auth/settings are needed, prepare the exact
correction before changing anything. Timeout means report the existing job;
never resubmit the create/install/test request.

The reviewed controller command arrays, private-output rules and cleanup are in
`stage-provider-validation/proposed-package-install-scope.json`. Returned job/org/
package identities are captured privately and normalized/validated to checksum18.
All outputs stay private until a safe result is produced. Package creation may
update only the staged project alias file; original source aliases stay untouched.

## Acceptance and remaining work

This gate requires successful package creation with coverage and successful fresh
installation/full installed Apex suite. A failure remains a failure at that exact
boundary; unit mocks are not live provider proof. The existing analyzer cannot
run without Java (zero files scanned); no toolchain installation is proposed.

After the package gate, prepare the separate, concrete real Stage-provider QA:
ordinary connected-user execution, two actual sales-process/record-type contexts,
currency/drift/access checks and the provider under the confirmed-save lock
sequence. Those CRM/connection fixtures are **not authorized by this package-only
proposal**. Task5 UI and Task6 Studio preview follow the approved provider gate;
Task7 verifies actual Claude/ChatGPT saves, automation, concurrency and readback.

The approved implementation plan states: “Plan approval permits source
implementation under this workflow. It does not approve live setup, package
builds, deployment or business-record writes.” The user’s continued approval
covered nonpersistent unit validation; this package/fresh-install scope is the
next persistent authorization boundary.

## Current readiness supersedes the staging timestamp

The immutable file inventory was captured before the last native rerun; its
`nativeUnitAcceptance: Pending final fixture rerun` records that earlier staging
state. It is superseded by the completed272/272 Succeeded result in
[the native unit receipt](evidence/opportunity-edit-2026-10-11/task-4-native-unit-green.json)
and [current package readiness](evidence/opportunity-edit-2026-10-11/package-gate-readiness.json).
The source bytes/tree hash have not changed. Independent package-scope reviews
verify source identity and proposal readiness; they do not authorize execution
or establish package coverage, fresh install or live Stage/provider acceptance.

Separate package-scope spec and quality reviews both **Approved** the frozen
source/proposal with no blockers. Package-stage checks passed2/2. These are
readiness results; package creation/installation/full-suite results remain NotRun.

## October 12 screen-first revision

The user's revised milestone supersedes the earlier Task5 source-development
gate. Reusable renderer implementation proceeds alongside package and provider
work. Actual native Stage choices and installed compatibility still gate live
acceptance. Earlier failure and pending statuses above describe their dated
snapshots; they are not rewritten as success. See
[revised milestone](superpowers/specs/2026-10-12-reusable-screen-milestone.md) and
[acceptance evidence checklist](OPPORTUNITY_CUSTOM_UI_QA.md).
