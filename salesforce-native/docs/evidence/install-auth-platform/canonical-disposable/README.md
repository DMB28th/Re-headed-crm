# Canonical disposable fixture — offline proposal

This supplemental Stage A revision corrects only the rejected temporary permission
API name to `ApiEnabled`. Root reported the first single deployment as Failed
with `Unknown user permission: APIEnabled` and zero tests run, then independently
verified all four components absent, the full baseline preserved, Site inactive,
and deployment JWT ON. Root's API67 Profile metadata read independently confirmed
`ApiEnabled` enabled and `APIEnabled` absent. No worker read private evidence.
The old failed revision remains in Git and its private attempt records stay
immutable. `core.PRIVATE_DIR` now pins the exact sibling
`canonical-stage-a-revision2`; root alone creates it with mode 0700, copies reviewed
helpers and the actual immutable baseline/date proofs, and captures fresh preflight
before one exclusive new attempt. Review the changed artifact before root invokes
it. This is source recovery, not main-plan production Task3 or live proof.

Failed deployment ZIP SHA256: `a1ee4a3dbc2de6a8dddb2ec97ca697e9855738a56f8cb7c1fe882fca62e35ee3`.
Corrected deployment ZIP SHA256: `0254b198c7c303f699ff009ba8dea0d4e9dbca726cbfcae60f06e2b78a34baa2`. Cleanup remains
`b256372aa78693ab396854bc21f4146aa506b09959ec905bf6374d36c7da3329`.

This directory contains reviewed-preparation source for the remaining Task1
canonical synthetic routes and fresh ChatGPT sequence. It is outside `force-app`,
uses API67, and does not implement Task3/product ingress or persisted diagnostics.
No live mutation is authorized by these artifacts. Compilation, actual Apex test
execution, active-Site protocol delivery and the fresh client sequence are Unknown.

`classes/CardstackCanonicalProbe.cls` has only these exact external routes:

- `/services/apexrest/cardstack/v1/claude/mcp`
- `/services/apexrest/cardstack/v1/claude/metadata`
- `/services/apexrest/cardstack/v1/chatgpt/mcp`
- `/services/apexrest/cardstack/v1/chatgpt/metadata`

As documented by the repaired public-context fixture, internal `requestURI` may
include `/services/apexrest`, be resource-relative `/cardstack/v1/...`, or include
the current Site prefix before either representation. Whole-string matching
accepts only those four forms for exactly two clients/two leaves. Unknown/nested,
extra/trailing path, query strings/query params and encoded separators fail404.
Route404 takes precedence; a valid route without Site HTTPS context fails503.
There is no fallback domain or permanent hardcoded Site prefix. The public base
already includes its prefix. Metadata derives only supported Site base/prefix and
org-domain context; headers are ignored. A root Site with an empty prefix is
supported only when `getBaseRequestUrl` returns a nonempty HTTPS origin.

Metadata GET returns only resource, authorization_servers, scopes_supported and
bearer_methods_supported. It performs no queries. MCP requests require a named
Salesforce actor and fresh `Cardstack_Use_Connections` on every protected call,
before body parsing/resource lookup. Anonymous401 carries the exact sibling
pointer; named missingUse403; authenticated GET/DELETE405. The fixture never
accesses/decodes/forwards tokens, raw actor IDs, CRM/private setup records, callouts,
logs or durable state. No shared MCP session state exists. Invalid requests use
fixed sanitized errors. Valid notifications202 have no body; batch is rejected;
request limit is16384 bytes. June/November2025 protocols remain pinned.

The one interactive `open_cardstack_apex_probe` and one app-only
`echo_cardstack_values` reuse the proven self-contained SDK1.7.4 HTML bytes without
rebuilding or upgrading. URI `ui://cardstack/apex-transport-probe.html`, MIME
`text/html;profile=mcp-app`; resource metadata has empty network/resource/frame
CSP domains. The fixed resource query uses bound name, `WITH USER_MODE`, `LIMIT1`,
and explicit sanitized unavailable handling. `ui-provenance.json` freezes its
309866-byte SHA256. Reused renderer displays synthetic status, never claims
production challenge/attempt proof. Missing/altered resources stay failures.

The exact seven fields are text=`café ✓ "quoted"`, amount=number0,
accepted=booleanfalse, choice=`beta`, rating=`hot`, notes=`first\nsecond` with an
actual newline, enabled=booleanfalse. Echo requires all seven keys/types, rejects
extras/null/strings over1000, and preserves empty text. Future full-chat reload
repeats the same fixture with a fresh open. It is synthetic echo, no CRM execution.

## Offline commands

Run from the repository root:

```sh
node --test salesforce-native/docs/evidence/install-auth-platform/canonical-disposable/offline.test.cjs
node salesforce-native/docs/evidence/install-auth-platform/canonical-disposable/package.cjs
```

`contract.cjs` validates injected/archived HTTP observations against private
expected Site/issuer/hash and emits only allowlisted stage/status/evidence.
It does not execute Apex in JavaScript. `measure` requires a supplied request
function and has no default fetch, credentials, org CLI or lifecycle operations.
The offline receipt schema explicitly fixes `liveExecution:false`. `live-receipt.schema.json` prepares a separate allowlisted controller record with
per-stage timestamps, provider/fixture/operator/independent evidence source, fixed
error codes, exact bundle hashes and boolean comparisons. Its validator rejects
identities, URLs, freeform notes and payloads before serialization. Actual controller
receipts must separately record their live evidence/approval and operator-observed
iframe/bridge/consent/cleanup stages; an injected contract pass proves none of them.

`package.cjs` produces deterministic ZIP_STORED archives with fixed1980 timestamps,
Unix0644 files and a sorted exact component list. It verifies exact manifests,
all reviewed source hashes and the sorted Apex method inventory before writing
archives. Deploy contains only two classes, one resource and temporary set;
cleanup contains only an empty package plus destructive list for those same owned
components. No Site/Profile/ECA/foundation metadata is shipped. Extra filesystem
files are ignored by the strict archive allowlist; extra manifest members fail.
`sha256-inventory.json` freezes source/preparation hashes; `archives.json` freezes
both exact ZIP hashes/file lists. Rebuild produces identical ZIPs.

`--freeze` is an explicit offline maintainer operation after reviewable source
changes; it regenerates manifests/source inventory before rebuilding. It is never
an ownership or live baseline check. Any changed source/ZIP needs renewed review.

`CardstackCanonicalProbeTest` uses API67, Assert and explicit sharing. Tests isolate
route/context/permission/protocol/typed echo/body/error/UI behavior. Context/actor/
Use seams are private, TestVisible and consulted only during tests. They cannot
fake actual Salesforce authentication or permissions. The hash test reads the
actual deployed static resource. Bulk CRM record factory/test setup is N/A: no
CRM records. Live compilation/tests were deliberately not attempted under source/
offline authorization. Offline tests verify the contract checker and package
builder, including rejection of injected bad responses/drift and receipt redaction.

See `live-approval-scope.md` for exact proposed names, exposure, action-time
prerequisites, callback sequence block, JWT finally rule and owned-only cleanup.
Task2/foundation, existing apps and working clients must remain preserved. The
accepted org/API auth evidence is already passed; exact-app/path isolation is not
a new prerequisite. Exact RFC8707 mapping remains Unknown.
