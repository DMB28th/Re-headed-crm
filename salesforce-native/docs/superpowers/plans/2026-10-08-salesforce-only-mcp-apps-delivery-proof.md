# Salesforce-only MCP Apps delivery proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user already selected this execution method.

**Goal:** Establish whether actual Claude and ChatGPT clients can authenticate per user, discover a Salesforce-hosted custom MCP endpoint, load its HTML resource, initialize the app bridge, and exchange exact synthetic values.

**Architecture:** Reuse the installed, disposable Apex REST/StaticResource probe as evidence infrastructure, correcting only defects needed to test the supported Salesforce-only route. Salesforce must authenticate the connected user; the iframe calls tools through the host and contains no credentials. This proof gates the separate multi-field Account edit implementation plan.

**Tech Stack:** Salesforce API 67.0, Apex REST, StaticResource HTML, the existing ext-apps browser bridge, Salesforce OAuth, actual Claude and ChatGPT clients.

**Spec:** `salesforce-native/docs/superpowers/specs/2026-10-08-custom-mcp-apps-migration-design.md` (approved October 8, 2026).

## Global Constraints

- Runtime hosting stays in Salesforce. No external gateway, Node/Railway runtime, custom accounts, or Postgres.
- Working org: `cardstack-spike2`; API version: **67.0**.
- Preserve the deployed HXL beta and its active connector/bindings throughout this proof.
- Before SOAP Metadata deployment: disable JWT on Card Stack SFAPP, obtain a fresh opaque-token CLI login, deploy, then restore JWT in a finally/cleanup step. JWT must end **ON**; verify it.
- Never print tokens, credentials, session IDs, private interaction keys, or confirmation tokens.
- No guest CRM access; no CRM queries, mutations, or private interaction objects in this synthetic probe.
- No delete-record capability or undocumented Aura/Screen Flow runtime endpoints.
- `salesforce-native/force-app/` remains authoritative for retained product source. Disposable probe edits stay in the existing private probe project and are explicitly labeled throwaway.
- Local Node may build browser assets, but does not host the runtime.
- Every advertised client's live evidence is separate. An authenticated CLI request, text response, or browser handoff is not a live in-chat pass.

## Review Focus

- A client follows a login redirect but never authenticates the MCP resource: record the exact failing phase and sanitized HTTP evidence (Task 1/3).
- Client login succeeds for one user while another user's permissions fail: demonstrate subject binding and normal permission denial without broadening access (Task 3).
- A resource retrieves correctly but the iframe never initializes: distinguish resource delivery from bridge success (Task 2/3).
- A late echo response overwrites newer submitted values or survives teardown: preserve request identity and suppress stale completions (Task 2).
- A reconnect repeats UI initialization or drops the synthetic result: report recovery explicitly and never infer a CRM-save capability (Task 3).

## Scope and dependencies

This is only the first delivery checkpoint of the approved migration. It does not implement Account edits, an interview engine, Studio changes, HXL retirement, or a release. Tasks 1 → 2 → 3 are sequential. Do not dispatch independent implementers into shared probe files. Each task receives a clean brief with the approved spec, constraints, exact owned paths, prior task receipt, and required tests; maintain a task ledger and complete spec and code reviews before proceeding.

Private base directory below:
`/Users/danielben-atar/Documents/Codex/2026-10-05/codex-handoff-cardstack-native-salesforce-package/work/`

Existing probe project: `<private-base>/apex-mcp-probe/`.
User-facing outputs: `/Users/danielben-atar/Documents/Codex/2026-10-05/codex-handoff-cardstack-native-salesforce-package/outputs/`.

### Task 1: Establish a supported actual-client authentication route

**Files:**
- Read: `salesforce-native/docs/MCP_APPS_RESEARCH_2026-10-08.md` and the existing `outputs/Salesforce-hosted-custom-UI-probe.md`.
- Read: `<private-base>/apex-mcp-probe/force-app/main/default/classes/CardstackMcpTransportProbe.cls`.
- Create: `salesforce-native/docs/SALESFORCE_MCP_INGRESS_2026-10-08.md`.
- Create: `<private-base>/mcp-delivery-proof/ingress-receipt.json` and `task-ledger.md`.

**Interfaces:**
- Consumes: existing authenticated Apex REST mapping `/services/apexrest/cardstack-mcp-probe/`; current org and client configuration inspected without credential output.
- Produces: a documented Salesforce-only connection recipe and sanitized receipt `{client, phase, status, httpStatus, evidencePath}`. Status is `passed`, `failed`, or `unavailable`; never substitute unavailable evidence for a pass.

- [ ] Read `platform-docs-get` and relevant OpenAI documentation guidance before retrieving current official Salesforce and client OAuth/discovery requirements. Use primary sources; distinguish supported configuration from assumptions. Do not repeat the renderer/interpreter audit.
- [ ] Inventory the currently installed probe, existing OAuth settings, permissions, and available live client sessions. Inspect token material only through tools that keep it private. Save the original configuration privately for exact restoration.
- [ ] Record the client's documented endpoint/discovery requirements and Salesforce's supported means of satisfying them. Test the existing route first. OIDC metadata alone is not MCP protected-resource discovery proof.
- [ ] Attempt actual-client registration/login against the existing Salesforce-only route, separately in Claude and ChatGPT. Capture sanitized failure phase, status, public challenge/metadata, and callback behavior. Use the computer-use tool to own the QA; a user-only login challenge is an explicit dependency if encountered.
- [ ] If a documented configuration change can satisfy the route, specify its exact metadata/settings and rollback in the ingress report before applying it. Use additive, isolated setup; preserve existing beta connection behavior. Any public discovery handler serves public metadata only, never CRM access or a token proxy. Unreviewed auth/hosting changes require a concrete decision, not speculative implementation.
- [ ] If no supported route is demonstrated, stop dependent tasks and deliver an evidence-backed architecture decision: failing boundary, attempted supported routes, required platform capability, concrete options and their tradeoffs. Do not introduce an external gateway. A one-client success is recorded as partial evidence; the other client's failure remains explicit.
- [ ] Review the report for factual support and credential leakage. Commit only the sanitized repository report; keep private receipts/configuration out of Git.

**Acceptance:** At least one supported actual-client authenticated route is established before Task 2; both clients remain separate required proof targets in Task 3. If neither can connect, the deliverable is the concrete blocker decision and this plan stops.

### Task 2: Make the isolated probe establish the app contract

**Files:**
- Modify only as needed: `<private-base>/apex-mcp-probe/force-app/main/default/classes/CardstackMcpTransportProbe.cls` and `CardstackMcpTransportProbeTest.cls` (API 67 metadata siblings).
- Modify only as needed: `<private-base>/apex-mcp-probe/build-ui.mjs` and `force-app/main/default/staticresources/CardstackMcpTransportProbeUi.resource` (metadata sibling).
- Create: `<private-base>/mcp-delivery-proof/probe-ui.test.ts`, `probe-contract-receipt.json`, and a focused test runner using available bundled tooling.

**Interfaces:**
- Consumes: Task 1's demonstrated connection recipe and installed `open_cardstack_apex_probe` / `echo_cardstack_values` tools.
- Produces: `resources/read` for `ui://cardstack/apex-transport-probe.html`, returning matching URI and `text/html;profile=mcp-app`; `echo_cardstack_values` returns the exact accepted synthetic argument map in `structuredContent` plus meaningful text `content`.
- Tool keys/types remain `text:string`, `amount:number`, `accepted:boolean`, `choice:string`, `rating:string`, `notes:string`, `enabled:boolean`; unknown keys and wrong types fail. No CRM authority is added.

- [ ] Read Apex authoring/test and MCP Apps skills before probe edits. Consult the already audited pinned SDK source; do not upgrade SDK dependencies simply to run this proof.
- [ ] Add focused failing Apex tests for missing tool/resource linkage, incorrect MIME/URI, unknown resource, malformed params, wrong argument types, oversized request/strings, and notifications without a JSON-RPC result. Assert no business DML or callouts in every echo test. Existing behavior that passes needs no artificial failing test.
- [ ] Run `sf apex run test --class-names CardstackMcpTransportProbeTest --target-org cardstack-spike2 --api-version 67.0 --result-format json --wait 10` after deploying the test changes under the JWT procedure. Inspect the receipt; distinguish a compile/deploy failure from the intended behavioral failure.
- [ ] Implement only the tested protocol corrections. Require `_meta.ui.resourceUri` on the open tool and app visibility on the echo helper; retain meaningful text fallback. Do not present a probe dispatcher as a production endpoint.
- [ ] Add browser tests asserting handlers are registered before connect; exact zero/false/Unicode/quotes/newline values survive submission; unknown payload shapes produce an error; a delayed prior echo cannot overwrite a newer request; teardown invalidates pending updates; bridge rejection is shown as a failed synthetic exchange.
- [ ] Run the focused browser runner and confirm the new tests fail for the intended defects before correcting the probe UI. Implement request sequence correlation, validated synthetic payload handling, and truthful visible status. The iframe uses host-proxied calls only; bundles contain no Salesforce tokens, record data, remote runtime imports, or external API requests.
- [ ] Rebuild self-contained HTML with the existing `build-ui.mjs`. Run the focused browser suite again; expected result is all assertions passing. Inspect the bundle for external runtime dependencies and private material without printing matched secrets.
- [ ] Deploy only isolated probe metadata, rerun focused Apex tests, and run relevant Salesforce Code Analyzer checks under its skill. Restore JWT and verify it is ON even when tests/deployment fail. Review spec compliance and code quality before live testing.

**Acceptance:** Source/API evidence establishes a minimal synthetic MCP App contract with honest UI errors and no CRM capability. Actual-client rendering remains Task 3's gate.

### Task 3: Own live-client QA and publish the delivery decision

**Files:**
- Create: `<private-base>/mcp-delivery-proof/claude-receipt.json`, `chatgpt-receipt.json`, and private screenshots where permitted.
- Create: `salesforce-native/docs/MCP_APPS_DELIVERY_PROOF_2026-10-08.md`.
- Create: `outputs/Salesforce-only-MCP-Apps-delivery-proof.md` (full output path defined above).
- Update: Task 1 ingress report with observed results and `task-ledger.md`.

**Interfaces:**
- Consumes: Task 1 connection recipe and Task 2 tested resource/tools.
- Produces: per-client matrix for `oauth`, `toolDiscovery`, `resourceLoad`, `initialize`, `exactEcho`, `bridgeError`, `reconnect`; each is `passed`, `failed`, or `unavailable`, linked to sanitized evidence. Final disposition is proceed with a client-specific support boundary or stop for an architecture decision.

- [ ] In a fresh Claude chat, authenticate as a permitted Salesforce user, invoke the open tool, verify in-chat HTML rather than text/handoff, verify initialization, and submit `amount=0`, both Boolean fields `false`, Unicode/quoted text, multiline notes, and empty text. Independently compare synthetic tool response values with inputs; do not claim persistence.
- [ ] Repeat every step in a fresh ChatGPT chat. Capture actual negotiated capability/bridge behavior where observable. Avoid claiming a protocol event was observed solely because the UI appeared.
- [ ] Exercise rejection/error and reconnect in each client; verify old pending results do not overwrite the current view and repeat exchange remains synthetic. Test another permitted user and a user without probe access if available; otherwise mark subject/permission evidence unavailable and state its consequence explicitly.
- [ ] Confirm the existing beta connector and HXL configuration remain intact. Restore temporary settings, remove temporary client connections and fixtures when no longer needed, and verify final JWT ON. Preserve installed reproducibility artifacts only when their permission/configuration exposure is recorded.
- [ ] Use verification-before-completion and a final independent review. Record test counts and dates from actual receipts. No release/installability claim follows: complete Apex-suite and fresh-package-install gates remain mandatory for the later release.
- [ ] Publish the sanitized matrix, supported route, failing boundaries, and cleanup results. Commit only repository documentation. If delivery is viable, prepare a separate multi-field Account adapter spec/plan grounded in the proven route; require exact submission/review/recovery contracts and all Account acceptance gates from the approved migration spec. If blocked, present concrete architecture options and wait for the user's decision.

**Acceptance:** Every claim has the correct source/API/live-client evidence label. Both client results are explicit, the beta remains usable, JWT ends ON, and no Salesforce-only custom-UI save or installability is claimed from this synthetic checkpoint.

## Plan self-review

The plan covers the migration's first authentication/resource/handshake checkpoint only. Multi-field Account editing, interpreter acquisition/execution, action mapping, remaining surfaces, HXL cutover, full release QA and clean installation intentionally belong to subsequent reviewed plans. All three tasks have concrete artifacts, interfaces and checkable results; protocol implementation is contingent on evidence of a supported ingress. No runtime endpoint or auth mechanism is invented to paper over the unresolved platform boundary.
