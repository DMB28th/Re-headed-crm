# Salesforce-only MCP Apps delivery proof — October 8, 2026

**ChatGPT web demonstrated Salesforce-only in-chat synthetic delivery. Hold the
two-client migration and cutover.** ChatGPT web authenticated and discovered
the two isolated probe tools in Task 1. Claude web failed before Salesforce consent.
Task 2's synthetic source/API contract and scoped review are accepted. Fresh
ChatGPT in-chat HTML, app connection, exact echo and bounded reconnect are observed.
Actual-host rejection and ordinary/denied-user evidence are unavailable. Claude
authentication remains failed. Temporary settings were restored; isolated proof
artifacts are explicitly retained for reproducibility pending a follow-up decision.

## Client matrix

| Phase | ChatGPT web | Claude web | Evidence boundary |
| --- | --- | --- | --- |
| `oauth` | passed | failed | Task 1 connected-account UI versus repeated pre-consent nonexistent Salesforce page |
| `toolDiscovery` | passed | unavailable | Task 1 ChatGPT App details lists both synthetic tools; Claude has no authenticated route |
| `resourceLoad` | passed | unavailable | Fresh actual ChatGPT in-chat form; resource-ready screenshot |
| `initialize` | passed | unavailable | Validated host initial result and successful host-proxied calls establish bridge readiness; raw negotiated event/version unavailable |
| `exactEcho` | passed | unavailable | Seven receipt values independently compared after actual-host submit; second submit preserves empty text |
| `bridgeError` | unavailable | unavailable | Exposed controls did not safely produce host denial/rejection; temporary Always ask still allowed calls |
| `reconnect` | passed | unavailable | Page reload and explicit account reconnect each followed by successful new echo; raw reconnect OAuth events unavailable |

Here `unavailable` identifies missing evidence.
It never substitutes for a pass. The ChatGPT connection/tool screenshots are
historical Task 1 evidence, not a fresh Task 3 invocation result. No actual-client
HTTP status or negotiated capability is invented from UI state.

The fresh ChatGPT open request produced two duplicate rendered forms. The visible
seven-field app reported “Connected to host; synthetic probe ready.” The authored
status follows a validated host initial tool result; successful form submission
also requires the app connection promise to have resolved. This establishes
in-chat HTML and app bridge readiness even though the surrounding model prose
incorrectly denied rendering. It does not expose the negotiated initialize event
or protocol version. The controller submitted the required typed values in the
first form; the visible echoed JSON independently matched all seven keys/types and
values. The second submit preserved empty text. Tested values include amount zero,
both Boolean fields false, Unicode/quoted text and multiline notes. This is a
synthetic exchange, with no CRM save/read.

Reload reset both forms and cleared the prior receipt, then another exact exchange
succeeded. The isolated account's Reconnect → Continue flow showed a connected
toast, and another form echo succeeded afterward. These establish bounded recovery;
they do not prove refresh-grant internals, delayed-response ordering or teardown
callbacks in the actual host. Those race protections have controlled-browser
evidence only. Temporarily selecting Always ask did not produce a prompt/denial
for app-proxied calls, including after reload. Actual bridge-error handling remains
unavailable rather than passed. The original Allow low-risk tools setting was
restored and independently checked in the controller's saved screenshot.

## Accepted source/API evidence

The disposable API67 Apex/StaticResource probe runs directly in Salesforce;
local Node builds/tests the HTML only. The iframe calls synthetic tools through
the host and contains no credentials, external runtime imports or CRM authority.
The pinned ext-apps SDK remains 1.7.4. Task 2 established matching tool/resource
URI/MIME, app-only helper visibility, seven exact typed echo fields, truthful
errors and stale-response/teardown protection under controlled browser transport.

Final focused Apex verification: 25/25 tests pass, 94% probe coverage; controlled
browser verification: 12/12 pass; authenticated deployed API: seven checks pass.
Recommended PMD/ESLint/regex authored-source scan: zero critical/high, 61 moderate
and 27 low findings retained. The generated vendor SDK bundle was excluded.
API67 defaults to user mode; its fixed StaticResource query explicitly declares
`WITH USER_MODE`. Ordinary-user compatibility remains unproven. These tests do
not establish actual-host delivery or CRM persistence.

See [Task 1 ingress](SALESFORCE_MCP_INGRESS_2026-10-08.md) and
[Task 2 contract](MCP_APPS_PROBE_CONTRACT_2026-10-08.md) for accepted evidence and
the direct Salesforce connection recipe.

## Subjects, preservation and cleanup

Only the available administrator subject has been observed. Another permitted
user and a user denied probe access are unavailable; neither subject binding nor
normal-user permission behavior is established. Access is not broadened to fill
that evidence gap.

The controller owns live browser/auth/settings work and cleanup. JWT ON was
verified after the latest dispatcher deployment. The original Claude beta connector
still shows its `api.salesforce.com/platform/mcp/v1/custom/Cardstack` route and
17-tool inventory; the ChatGPT beta remains installed with a connected Primary
account. A fresh read-only Tooling metadata check confirms installed Cardstack
**0.1.0.8**. No product/HXL metadata was deployed or changed in this proof. HXL
binding metadata was not independently re-retrieved, and no beta CRM operation was
run to imply a fresh end-to-end regression pass.

The isolated Local ECA, API67 disposable probe, existing class-access grant and
both client entries remain intentionally installed. ChatGPT has one connected
probe account; Claude's probe entry is unconnected. Retention is for reproducibility
pending the next architecture/scope decision, not complete removal. ECA scope is
self-authorization with `api`/`refresh_token`, PKCE/refresh rotation/named-user JWT
ON and the existing 30-day refresh policy. No permission grant was expanded.
Probe class access remains the existing profile-owned grant; general-user access
is unproven. If discarded, remove only probe connections/grants and the isolated
ECA/probe using a reviewed rollback; preserve beta grants/bindings. The earlier
beta credential exposure remains a separate user-owned rotation decision.

## Decision boundary

The direct Salesforce route is viable for the tested ChatGPT web administrator's
synthetic form/echo and bounded recovery. That is a client-specific delivery proof,
not a two-client support or governed-save contract. Hold migration/cutover while
choosing one of these concrete next steps:

1. Research and trace a documented Salesforce-only Claude discovery/authorization
   route, preserving the current endpoint/auth constraints, then rerun Claude's
   complete live matrix and missing permission/error subjects. No architecture
   change is authorized by this report.
2. Explicitly choose a ChatGPT-only initial support boundary. A separately approved
   Account adapter spec/plan must then define exact multi-field submission,
   validation/review/confirmation/recovery and governed-save acceptance, while
   retaining the unavailable error/subject checks as gates before broader support.

No Account adapter was implemented. No external gateway or permanent HXL fallback
is proposed. Complete native regression, fresh installation and supported-client
QA remain mandatory for a later release. Task 3's independent review approved this
report with no critical or important findings. Bounded whole-branch final review
and scoped rereview of `ddc27d91563526e61e5e9cc2e628f1d6abb6ffc7` are approved: both
minor documentation findings were addressed, with no blocking findings or new
breakage. This accepts the bounded proof only; the client limits and migration/
cutover HOLD remain in force. The managed worktree and SDD workspace are retained
for audit while the separately owned Claude investigation continues.

**User decision, October 8:** Keep both clients and investigate a documented
Salesforce-only Claude route. The ChatGPT-only scope option was not selected.
This chooses the next investigation; it does not authorize a new architecture,
Account implementation or cutover. The two-client migration remains on hold.
