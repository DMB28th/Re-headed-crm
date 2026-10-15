# Disposable MCP Apps probe contract — October 8, 2026

**The synthetic source/API contract passed. Static analysis now has zero critical
or high findings after an explicit query access-mode declaration.** This is
Task 2 of the approved Salesforce-only delivery proof. Actual ChatGPT/Claude
in-chat HTML rendering, bridge behavior and reconnect remain Task 3 gates. This
probe does not establish a production transport, CRM save, or release readiness.

Only the existing private disposable Apex REST probe, its test, browser build
script and StaticResource were changed. Native package and retired Node product
sources, beta runtime bindings, OAuth scopes and permission grants were unchanged.
Runtime delivery remains Salesforce-only, through the connected user's Salesforce
API access. Local Node builds/tests assets; it does not host the app runtime.

## Tested contract

The open tool links `ui://cardstack/apex-transport-probe.html` through
`_meta.ui.resourceUri`. Resource listing/read use that exact URI and
`text/html;profile=mcp-app`; the deployed resource matches the locally tested,
self-contained HTML. The echo helper advertises app-only visibility and preserves
meaningful text fallback.

The exact seven synthetic inputs are `text:string`, `amount:number`,
`accepted:boolean`, `choice:string`, `rating:string`, `notes:string`, and
`enabled:boolean`. Unknown keys, wrong/null types and oversized strings are
rejected. The request limit remains 16 KiB and string limit 1,000 characters.
Malformed JSON, invalid protocol requests and malformed parameters have distinct
JSON-RPC errors. Numeric/object initialization `protocolVersion` is rejected as
invalid parameters before any String cast. Notifications do not receive a
JSON-RPC result/error.

Every Apex transport test measures zero DML statements and zero callouts. The
only query retrieves the fixed StaticResource; the probe reads no CRM records and
adds no CRM authority. It uses existing Salesforce authentication/class access;
no guest route or credential proxy was introduced.

The browser validates all seven exact echoed values, including zero, false,
Unicode, quotes, multiline notes and blank text. Unknown/missing/changed results
and tool/bridge errors are visible failures. Request sequence checks suppress old
responses; teardown invalidates pending updates. Handlers are registered before
connection, and tool calls are proxied through the host.

## Verification and limits

| Evidence | Result | Boundary |
| --- | --- | --- |
| Corrected Apex red run | 23 tests: 16 pass, 7 intended failures | Failing behaviors observed before dispatcher corrections |
| Apex green run after scoped review corrections | 25/25 pass; probe coverage 94% (64/68 lines) | Reconfirmed after explicit user-mode declaration; focused disposable probe suite, not complete native release regression |
| Scoped review red run | Numeric/object `protocolVersion`: 2/2 fail with the intended String-cast TypeException | Observed before adding only the initialization type guard |
| Browser red run | 12 tests: 3 pass, 9 intended failures | Existing bundle executed with real pinned SDK and controlled host transport |
| Browser green run | 12/12 pass | Installed Chrome/Playwright iframe; not an actual advertised chat client |
| Deployed authenticated API | Seven tool/resource/exact-echo checks pass | Reconfirmed after explicit user-mode declaration; deployed HTML hash equals local bundle; API evidence only |
| Bundle inspection | One inline script; no external assets/runtime imports, Salesforce origins, credential-like literals or authored direct network calls | Structural/pattern checks and authored source review; not a completed analyzer scan |
| Salesforce Code Analyzer | 88 findings: 0 critical, 0 high, 61 moderate, 27 low | PMD/ESLint/regex Recommended completed on four authored targets; explicit access-mode finding resolved |
| Deployment cleanup | JWT ON restored and verified by controller | Controller-owned browser setting changes and managed CLI refresh |

The first Apex red run had a test-side second `Test.startTest()` invocation.
That assertion was split before the corrected red run above. A subsequent review
identified the initialization cast defect; two new focused tests reproduced it,
and the single type guard passed the full 25-test suite. No compile/test
harness failure was counted as an intended protocol failure. Existing passing
behavior was retained without artificial failures.

The ext-apps SDK remains pinned at **1.7.4**; no SDK upgrade was made. Browser tests
execute the real bundle and SDK, replacing only the external host JSON-RPC
transport with a controlled parent iframe. The test runner uses bundled Node and
Playwright with installed Chrome. It neither simulates CRM persistence nor proves
actual-host capability negotiation.

Test-only red deployments and the three-component green deployment used
`cardstack-spike2`, API **67.0**, and the required JWT OFF/managed fresh opaque
OAuth refresh/SOAP deploy/JWT ON procedure. A successful refresh callback and
independent encrypted-auth persistence check established opaque-session readiness;
the token need not change when Salesforce returns the same opaque value. No token,
secret or private auth file was printed. JWT restoration was verified after red,
green, initialization review-fix and explicit user-mode sessions. The latter
deployed only the dispatcher; other sessions deployed only the dispatcher, test
and StaticResource.

Full probe source diff against the pre-task private snapshot, tests/runners,
red/green receipts, bundle hash and authenticated API receipt remain in the private
handoff work directory, outside Git. Retain the isolated probe for Task 3. Its
original source snapshot permits rollback using the same deployment/JWT procedure;
no beta package rollback is involved.

Task 2 was accepted after scoped independent spec/code review: 25/25 focused Apex
tests with 94% coverage, 12/12 controlled-browser tests and 7/7 authenticated API
checks. The authored-source scan reported zero critical/high findings and 88
residual moderate/low findings (61 moderate, 27 low), retained without suppression.
This acceptance does not establish actual-host or ordinary-user compatibility. A
later release still requires complete native regression, actual supported-client
QA and fresh-package-install verification.


## Static-analysis follow-up

With explicit user approval, the official Salesforce analyzer plugin **5.14.0**
was activated and a temporary official Temurin JDK **21.0.12.1+1** for macOS
aarch64 was downloaded into the private QA folder. Its SHA-256 matched official
Adoptium release metadata. Java was not installed system-wide, and application
SDK/product dependencies were not upgraded. These prerequisites follow the
[Salesforce CLI analyzer setup guide](https://developer.salesforce.com/docs/platform/salesforce-code-analyzer/guide/analyze.html)
and [Adoptium API download/checksum guide](https://github.com/adoptium/api.adoptium.net/blob/main/docs/cookbook.adoc).

The scan executed PMD, ESLint and regex Recommended rules on the dispatcher, its
test, the build script and the exact extracted authored browser module. The
generated StaticResource SDK bundle was excluded explicitly. This is an authored
source scan, not third-party dependency analysis or a complete release scan.
Bundled analyzer scripts parsed and queried the results. No engine autofixes were
available or applied.

The initial scan reported `ApexCRUDViolation` on the fixed StaticResource Body
query because it lacked an explicit access-mode declaration. This API **67.0**
class already uses user mode by default, according to the version-specific
[Secure Apex Classes guide](https://developer.salesforce.com/docs/platform/lwc/guide/apex-security).
The finding did not establish a CRUD bypass. The sole correction explicitly adds
`WITH USER_MODE`, following the guide's maintainability recommendation. The same
scan then removed that finding; existing behavior requires no artificial failing
test. A read-only metadata check confirmed resource access for the current admin
actor, which does not establish ordinary-user compatibility. There is no
system-mode fallback or new query-failure handling.

Six moderate ESLint findings apply LWC-only rules to standalone HTML DOM
queries and local Node imports. Other moderate/low PMD findings include test
helper assertion detection, runAs, braces, complexity and documentation. Raw
findings are retained without suppression; this report does not claim zero issues.
