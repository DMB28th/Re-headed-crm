# Guided installation and per-org MCP Apps authentication

Date: October 8, 2026
Status: Written design approved by the user on October 8, 2026.
Implementation plan awaiting separate review; no product implementation yet.
Parent: [migration design](2026-10-08-custom-mcp-apps-migration-design.md).
Evidence: [auth runbook](../../MCP_APPS_AUTH_RUNBOOK.md) and
[actual Claude UI proof](../../CLAUDE_MCP_APPS_UI_PROOF_2026-10-08.md).

## 1. Intent and decisions

A Salesforce admin installs Cardstack, completes guided setup in Studio, and
provides connection instructions to users of Claude or ChatGPT. Each user signs
in with their own Salesforce account and keeps that account's sharing/CRUD/FLS.
Successful setup is measurable and recoverable without repeating the auth
investigation. Runtime delivery, authorization and state remain in Salesforce.

User-approved choices: guided Studio setup; explicit manual Salesforce steps
where automation is unsupported; separate dedicated OAuth apps per client per
org; credentials stay with Salesforce/client; independent client verification;
resumable setup; clear recovery; connection readiness separate from CRM editing;
preserve working connections and beta through upgrades.

This spec covers install/auth and synthetic diagnostics. A separate governed
Account editing spec must deliver multi-field Description/Employees editing,
server before/after review, explicit confirmation, save once, independent
read-back and refreshed card. Auth completion alone does not authorize that
implementation or HXL retirement. Interpreter and complete presentation migration
remain separate scopes. No custom accounts, external gateway, Node runtime,
Railway, automated browser provisioning or app-directory publication.

## 2. Architecture and boundaries

Packaged source comprises the production Apex ingress/dispatcher, versioned
StaticResource renderer, private setup/check records, explicit admin/user
permissions and Studio setup UI. Disposable probe classes are reference fixtures,
not production classes to retain unchanged. Keep API67 and tested SDK1.7.4 until
an intentional upgrade is reviewed.

Per-org companion setup comprises a dedicated Salesforce Site/domain and guest
profile, two Local External Client Apps, callback registration, OAuth policies
and user assignments. First release uses Salesforce Setup for these mutations;
Studio guides and verifies without silently activating Sites, changing JWT,
creating credentials or granting permissions. Do not assume Local apps, domain
registration or Site activation arrive through the unlocked package. A fresh
install must verify which components package successfully; ship unsupported
components as documented admin steps, never undocumented platform operations.

A Site ingress handles public discovery and authentication challenge. Only after
Salesforce supplies a named actor may it call the private dispatcher and native
services. Named application requests require explicit Cardstack user permission;
admin setup requires explicit Cardstack admin permission, beyond class access.
The browser never obtains Salesforce credentials or execution authority.

Use two canonical versioned paths beneath the installed Site prefix:
`/services/apexrest/cardstack/v1/claude/mcp` and
`/services/apexrest/cardstack/v1/chatgpt/mcp`; each advertises its exact sibling
`metadata` URL. Site prefix is admin-selected and persisted. URLs are derived
from the current org's approved Site domain/prefix; issuer derives from the org's
Salesforce authorization server. Reject arbitrary external issuer/endpoint input.
Public descriptors derive only from supported org/Site context and the canonical
route; the guest path must not query private setup records. If that derivation
cannot be implemented through supported API67 context, resolve it in the platform
validation gate before production ingress implementation.

These paths distinguish setup and diagnostic records, not cryptographically
attested client identity. Do not infer OAuth client ID from the route or a header.

## 3. Guided setup experience

1. **Check installation.** Show package/transport/UI versions, admin access,
   domain readiness, and completed checks. Missing admin rights stop mutations.
2. **Prepare the Site.** Show required domain/Site/guest configuration and
   Salesforce Setup links. Only ingress class and required constant landing page
   are permitted guest grants. No guest object permissions, renderer class,
   private services or configuration reads. Do not display a dev-org endpoint.
3. **Configure Claude.** Create its dedicated Local ECA, save exact callback,
   public client ID and opaque-token configuration; show connection instructions.
4. **Configure ChatGPT.** Create its separate Local ECA. Copy the exact callback
   shown by the actual ChatGPT connection management page into Salesforce; never
   reuse the probe callback ID or assume a universal redirect. If connector
   creation is needed to obtain it, show Prepare app -> Create connection draft ->
   Register shown callback -> Complete OAuth. Do not claim circular setup is solved
   until this sequence is verified in a fresh client connection.
5. **Connect and verify.** Each client performs real Salesforce sign-in/consent
   and the synthetic diagnostic. Users can connect independently; an admin's
   successful connection does not establish every user's access.
6. **Ready for next gate.** Show per-client/per-user evidence, timestamp and
   configuration revision. Offer the later governed Account QA only when present.

Completed steps resume across Studio sessions. Instructions distinguish admin
configuration from each user's sign-in. Changing endpoints/callbacks/client IDs,
package/transport/UI contract or relevant permission policy invalidates affected
checks. Successful check history is retained as history, never shown as current
for a different configuration. Manual completion flags cannot become verified
connection status. Unknown/unreadable settings show Unknown, with exact guidance.

## 4. OAuth and authorization contract

Baseline for each dedicated runtime ECA: authorization-code public client,
api/refresh_token, required PKCE and refresh rotation, no secret required for
web-server/refresh flow, JWT issuance OFF for opaque tokens. Extra flows and broad
full/web scopes are not part of setup. Salesforce may include identity permission
in consent; show the actual consent instead of hiding it. Admin assignment and
app policy must explicitly control authorized users; no shared Salesforce account.

Claude callback currently proven: `https://claude.ai/api/mcp/auth_callback`.
Recheck client guidance when UI or callback behavior changes. Store only public
client IDs and exact registered callbacks. Client owns token exchange/refresh;
Salesforce owns issuance and enforcement. Cardstack does not store, decode,
forward, refresh or revoke OAuth tokens itself.

Unauthenticated requests get401 and exact Bearer metadata pointer. Public metadata
contains canonical resource/issuer and necessary scope information only. It never
returns tools, HTML, records, configuration or identity. Named requests without
Cardstack permission fail403 without retrying as guest or admin. Tool handlers
retain sharing and enforce CRUD/FLS plus published Cardstack policy. Invalid
requests fail deterministically; no anonymous resources/read or tool execution.

Separate apps isolate configuration and revocation administration. They do not
establish that a bearer issued for one app cannot reach the other's path. Likewise,
opaque named-user proof has not established MCP resource/audience binding. Before
production release, verify Salesforce's supported issuer/resource/token enforcement,
wrong-org rejection and any required application binding. Do not declare complete
MCP authorization conformance from tool success. If required binding cannot be
established through supported Salesforce mechanisms, stop at this security gate
and return an explicit design revision; never add token parsing or broaden access.

Card Stack SFAPP remains a separate deployment app. API67 SOAP deployment may
require its temporary JWT OFF/fresh opaque CLI token procedure; restore/save/verify
its JWT ON immediately in cleanup. Active runtime apps stay opaque. Restoring a
throwaway runtime app to JWT ON and disabling it was probe cleanup, not runtime
configuration. Studio must not change the deployment app.

## 5. Setup state and diagnostics

Use private server-owned setup records, excluded from public configuration/tools.
An org/client setup record contains client enum, public client ID, exact callbacks,
Site reference/prefix, issuer/resource URLs, enabled intent, configuration revision,
versions, step states and non-sensitive verification summaries. No secrets, tokens,
raw logs, CRM payloads or user-authored executable URLs. Setup is admin-only.

A diagnostic receipt contains org-local actor relationship, client route,
configuration revision, versions, timestamps, expected test-case names, stage
results, sanitized error code, and expiry. Users can read only their own receipt;
admins see the minimum summary needed for setup. Actor IDs remain private and
are not exposed in guest metadata, iframe HTML or downloadable support reports.
Limit retained diagnostic history to 30 days; expiring attempts are not credentials.

A named diagnostic open creates an actor-bound, revision-bound attempt expiring
in 10 minutes, with one unpredictable 256-bit challenge stored hashed. The renderer
uses an app-only echo helper to submit that challenge and seven synthetic values.
Reject wrong actor, expired challenge, altered revision, unknown/extra fields and
invalid types. Successful repeated requests return the existing diagnostic receipt.
Diagnostic persistence writes only private diagnostic state, never CRM records.
No token grants tool permissions or authorizes a CRM write.

Fixed typed fixture: Unicode/quoted text, number0, booleanfalse, choice beta,
rating hot, multiline notes and booleanfalse. Repeat with empty text and after
full chat reload using a fresh attempt. Server compares exact keys/types/values.
A successful tool request alone cannot mark HTML loading or actual host readiness.
Bridge stage acknowledgements are reported runtime evidence, not cryptographic
host attestation. Setup displays 'Diagnostic exchange passed' automatically and
'Client UI observed' only after an authorized operator observes the actual form
and receipt in that client; label the latter as operator observation. Release QA
must retain sanitized screenshots and independent server comparisons. Never let
an admin checkbox replace the automated stages or release evidence.

Each check is Pass, Fail, Unknown or Stale, with evidence source and timestamp.
Client summaries are Not configured, Needs verification, Diagnostic passed,
Client UI observed, Needs attention or Stale. Org readiness lists both separately;
there is no permanent green 'connected' assertion or background token monitor.
On-demand checks and failures update current status; lack of traffic is Unknown.
CRM editing readiness is a separate later evidence set.

## 6. Recovery, drift and revocation

| Symptom | Required behavior |
| --- | --- |
| redirect mismatch | Show exact registered/client-shown callbacks; correct only affected app, then fresh consent |
| guest401 after apparent consent | Check saved runtime opaque issuance and obtain fresh authorization; never add guest data access |
| named403 | Explain missing Cardstack/app/CRM permission as appropriate; no automatic broader grant |
| metadata/issuer mismatch | Block verification until canonical org configuration matches |
| token expired/revoked | Let client refresh through Salesforce; if it fails, request reconnect; bounded retry, no loop |
| tools work but UI fails | Report resource/bridge stage independently; preserve auth evidence |
| contract or setup changed | Mark affected receipts Stale; rerun diagnostics |
| save outcome unknown later | Resolve authoritative receipt before retry; never infer no write from transport failure |

Users disconnect in their client and revoke Salesforce authorization through
Salesforce's supported UI. Admins revoke affected authorization/app access through
Salesforce; verify existing-token and refresh-token behavior, not merely an app's
Disabled label. Disabling Claude must not silently reconfigure ChatGPT. Studio
provides guidance and records intent/observed outcome, never promises revocation
without a subsequent rejected request. No raw provider error strings in support
exports: export only stage/error code, versions, timestamps and safe status.

## 7. Verification ownership and automation

Studio automates internal permission/configuration checks only where supported
and accessible. It must distinguish unreadable metadata from misconfiguration.
First release does not depend on self-REST sessions, privileged end-user Tooling
API, undocumented Aura endpoints or cross-origin browser access to private APIs.
Public HTTP and authenticated protocol tests run in a developer/admin regression
runner using existing managed CLI authentication; no runtime external server.
Runner consumes credentials privately and emits sanitized receipts. Actual client
QA runs separately and cannot be replaced by protocol tests.

Before implementation commits to a metadata reader, a bounded platform validation
must identify exact supported API67 reads and needed admin permissions. If ECA or
Site settings cannot be read by the installed app, retain explicit guided manual
inspection with Unknown status plus independent end-to-end verification. This
fallback is the designed first-release behavior, not unimplemented automation.

Acceptance gates:

- Fresh package installation in a second suitable org with no inherited probe
  grants, credentials or configuration; guided setup produces org-local endpoints.
- Separate Claude/ChatGPT apps/callbacks; normal user login under admin-assigned
  access; missing Cardstack rights denied; ordinary users require no admin APIs.
- Anonymous/fabricated/expired/wrong-org bearer cannot read HTML or execute tools;
  authenticated users cannot read another user's setup/check state.
- Exact metadata/challenge, resource URI/MIME/hash, protocol responses, errors,
  notifications, size bounds and app-only visibility; no guest permission drift.
- Both real clients: consent, discovery, actual iframe, exact seven-value receipt,
  empty value and whole-chat reload; separately record automated versus observed.
- Salesforce token refresh across actual expiry; revocation then rejected request;
  reconnect then fresh named diagnostics; no unexplained token/actor fallback.
- Resume and configuration invalidation; a manual completion flag cannot manufacture
  verified status; support output contains no tokens/actor IDs/private payloads.
- One client's revocation/configuration change leaves the other configuration
  unchanged; test actual remaining connectivity rather than assuming isolation.
- Package upgrade preserves configuration and marks changed contracts Stale;
  no beta cutover, Salesforce settings mutation or lost drafts without explicit step.
- Complete native regression, relevant LWC checks, security analysis and fresh
  install validation before release; maintain credentials and temporary setup cleanup.

The Account review/confirm/save/read-back/refresh gate must pass in each client
before product migration support is claimed. This spec sets that dependency;
its detailed editing contracts belong in the next spec. HXL retirement requires
complete presentation/interpreter migration and its separate release gates.

## 8. Sources and proof limits

[Salesforce Create an External Client App](https://developer.salesforce.com/docs/platform/mobile-sdk/guide/eca-create.html)
(developer guide, fetched October 8): documents Local app creation, callback/scopes
and public-client secret settings. Its Mobile SDK JWT recommendation is not the
Site-specific tested recipe; do not import unrelated Mobile SDK scopes.

[OpenAI Authentication](https://developers.openai.com/plugins/build/auth)
(official developer guide, fetched October 8): predefined clients/PKCE and discovery;
copy exact callback from connection management, which may use a callback-specific
or stable URI. Public-client support does not prove this org's security binding.

[MCP Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
(protocol specification, fetched October 8):401 resource_metadata discovery and
canonical resource/issuer requirements. Named-user synthetic success is narrower
than full authorization conformance.

Local source: existing Studio checklist persists manual setup flags; current
permission sets are not a complete custom-transport permission model. The spec
replaces manual verification claims with evidence-based states without treating
existing admin/user assignment alone as proof of every tool class permission.

Known evidence: actual Claude synthetic Site route and earlier ChatGPT synthetic
Apex route passed. Multi-org same-route ChatGPT, refresh longevity, ordinary-user
permissions, revocation and production security binding remain mandatory acceptance
work, not achieved claims. No product implementation or org changes in this spec.
