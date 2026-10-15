# Persistent integration deployment preparation

Cardstack integration uses owned `cardstack-spike2` at API **67.0** and the combined `codex/cardstack-integration` checkout. One integration owner submits the reconciled source. Feature workers prepare source and focused evidence; they do not independently deploy.

## Prepare one exact artifact

Use `scripts/prepare-record-editor-checkpoint.py` with an explicit source/test inventory and the verified `spike2-retained-tests/v1` overlay. Build current MCP App resources with the pinned SDK before freezing. Record each source SHA, the ZIP SHA, advertised resource URIs and native test identities in the inventory. Include existing org-retained native tests when qualifying the persistent environment; do not confuse package-only counts with actual org counts.

Exclude authentication metadata: External Client Apps, providers, Named/External Credentials, profiles, settings and Sites. Include no destructive manifest. Preserve unrelated and previously uncommitted work. Use existing managed CLI authentication; deployment SFAPP JWT stays **ON**. Earlier instructions to disable JWT and recreate login do not apply to the now-working managed session.

## Qualify and deploy

A check-only `NoTestRun` is compilation evidence only. At a coherent backend milestone, submit the frozen ZIP once with `RunAllTestsInOrg`. Save the complete private result and a sanitized receipt; inspect both native component errors and native test failures. Address actual root failures before preparing a new immutable candidate. Do not claim cascading compile failures are independent defects or zero-run tests are passing.

After successful validation, quick-deploy the **same validated job**. Do not rebuild or substitute source between validation and deployment. Report deployment completion, independently retrieve relevant artifacts and compare their hashes. Record any Salesforce-added defaults separately. Actual Claude/ChatGPT acceptance must use the resulting deployed resource, not a local fixture or previous conversation artifact.

## Bounded developer QA correction

When the consolidated native run has already qualified execution behavior and the remaining change only fixes catalog descriptors or presentation, record the exact source lineage and the remaining failed assertions. Review that authorization, CRM execution and save methods are unchanged. Qualify the complete final artifact for native compilation, deploy that exact artifact to the owned DeveloperEdition integration org with `NoTestRun`, and run the relevant native regression classes against the deployed version before advertising the milestone. Stop on any new failure. This avoids repeating the whole unchanged backend suite for a presentation correction; it does not turn a failed validation into a successful quick-deploy job or qualify a production/package release.

A developer-only delivery test drawer must be an explicit build option, default off. Holding or discarding a real SDK response tests renderer delivery recovery against actual native execution. Report that controlled fault separately from natural network loss and full-page reload persistence. No fabricated responses or automatic confirmation may be introduced.

## Native platform lessons

At API 67, `FOR UPDATE` queries cannot also specify `ORDER BY`; native locked rows have implicit Id order. Do not use Apex reserved words for local identifiers or DTO names. A native compilation check catches platform constraints that local JavaScript and static analysis do not.

The runtime request is the governor-budget boundary. Flow integration must avoid repeated metadata/policy acquisition inside one operation while preserving checks at every new request. A fixture that crosses several requests in one test transaction needs explicit budget evidence; passing browser fixtures cannot establish native governor behavior.

## Proof and environment boundaries

Keep backend tests, renderer tests, Studio observations and actual-host journeys separate. Presentation-only changes need focused renderer/host checks; rerun broader native regression only for changed backend, failures or unresolved risk. An install qualification uses a separate temporary org only for a specific package-install claim. It does not replace the persistent integration org.

New security-sensitive connections are separate reviewed changes and retain their exact approvals. Secrets remain in Salesforce. A prepared form, mock provider response or CLI metadata retrieval does not prove the Studio managed connection works.
