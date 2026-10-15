# Route contract version 2 — prospective local criterion

The approved criterion separates percent-encoded unreserved letters from
percent-encoded reserved separators. This small checker evaluates injected
responses for fixed cases. It changes no Apex route, historical checker,
measurement API, archive, receipt or runtime configuration. A local `Pass` is
an injected-data contract result; it is not a new live observation.

## Rationale and evidence boundary

[RFC 3986 section 2.3](https://www.rfc-editor.org/rfc/rfc3986.html#section-2.3)
defines unreserved characters, including letters. Under
[section 6.2.2.2](https://www.rfc-editor.org/rfc/rfc3986.html#section-6.2.2.2),
percent-encoded unreserved octets may normalize to their literal characters.
Thus `%6dcp` and `%6Dcp` are equivalent unreserved-letter spellings of `mcp`.
[Section 2.2](https://www.rfc-editor.org/rfc/rfc3986.html#section-2.2) distinguishes
reserved characters such as `/`: decoding an encoded reserved separator can
change semantics. Requiring rejection of `%2f` and `%2F` here is our route
criterion, not a general RFC guarantee about ingress behavior. No generic
normalizer or URL/percent parser is needed by this checker.

The [sanitized Stage C report](stage-c-live-replay-2026-10-10.md) and
[four actual observations](stage-c-route-observations-2026-10-10.json) support
only plain `mcp` and lowercase encoded-letter `%6dcp` for Claude and ChatGPT:
all four returned actual HTTP 405 with exact `method_not_allowed` JSON.
They establish equivalent behavior at that measured boundary without identifying
the normalization layer. Uppercase `%6Dcp` has not been live-measured.
Neither lowercase nor uppercase encoded separator has a live observation.

The original Stage A **75 Pass / 2 Fail / 7 Unknown** result remains immutable.
Its missing response status/body cannot be reconstructed from the later
**Stage C four actual 405 observations**. The original version 1
`negative-encoded` cases still require 404/`unknown_probe_route`; an injected
405/`method_not_allowed` still fails them. Version 2 does not relabel those
historical failures as passes. The existing Apex test with a manually assigned
encoded-separator URI does not establish live ingress rejection. Future live
separator coverage remains open and requires separately authorized measurement.

## Fixed matrix

All paths begin with `/services/apexrest/cardstack/v1/`. Every case is method
`GET`, auth `named`. The body criterion is an exact single-key parsed JSON
object, written below as `{ "error": "value" }`.

| Case ID | Exact suffix | Category | HTTP status | JSON error |
| --- | --- | --- | --- | --- |
| `claude.plain` | `claude/mcp` | `canonical` | 405 | `method_not_allowed` |
| `claude.encoded-letter` | `claude/%6dcp` | `unreserved-letter` | 405 | `method_not_allowed` |
| `claude.encoded-letter-upper` | `claude/%6Dcp` | `unreserved-letter` | 405 | `method_not_allowed` |
| `claude.encoded-separator` | `claude%2fmcp` | `reserved-separator` | 404 | `unknown_probe_route` |
| `claude.encoded-separator-upper` | `claude%2Fmcp` | `reserved-separator` | 404 | `unknown_probe_route` |
| `chatgpt.plain` | `chatgpt/mcp` | `canonical` | 405 | `method_not_allowed` |
| `chatgpt.encoded-letter` | `chatgpt/%6dcp` | `unreserved-letter` | 405 | `method_not_allowed` |
| `chatgpt.encoded-letter-upper` | `chatgpt/%6Dcp` | `unreserved-letter` | 405 | `method_not_allowed` |
| `chatgpt.encoded-separator` | `chatgpt%2fmcp` | `reserved-separator` | 404 | `unknown_probe_route` |
| `chatgpt.encoded-separator-upper` | `chatgpt%2Fmcp` | `reserved-separator` | 404 | `unknown_probe_route` |

## Pure API and classification

[route-contract-v2.cjs](route-contract-v2.cjs) exports only:

- `CASES`: a frozen array of frozen entries containing `id`, `client`, `category`,
  `path`, `method`, `auth`, `expectedStatus`, and `expectedError`.
- `evaluateCase(id, response)`: selects one fixed ID and consumes injected
  `{status, headers, body}` data. `body` must be raw JSON text; content type is
  read from lowercase `headers['content-type']`. It does no transport, HTTP,
  SDK, auth or evidence IO and executes no entry point on import.

An unsupported ID throws `Error('UNSUPPORTED_ROUTE_CASE')`, without echoing it.
Only a primitive integer HTTP status in 100–599 can establish a contract result.
`application/json` is matched case-insensitively with optional parameters.
Pass requires the exact status, JSON media type and exact single-key fixture error.

| Result status | Fixed reason code | Criterion |
| --- | --- | --- |
| `Pass` | `CONTRACT_MATCH` | Exact selected criterion matches |
| `Fail` | `CONTRACT_MISMATCH` | Recognizable fixture error with wrong status, error, extra keys or JSON media type |
| `Unknown` | `INVALID_RESPONSE_STATUS` | Missing, noninteger, coerced or invalid HTTP status |
| `Unknown` | `RESPONSE_UNCLASSIFIED` | Provider HTML/nonfixture JSON, malformed/nontext JSON body or injected accessor failure |

The recognizable fixture strings are `method_not_allowed`, `unknown_probe_route`,
`authentication_required`, `cardstack_use_required`, and
`public_context_unavailable`. Invalid status takes precedence over body matching.
A separator receiving exact 405/`method_not_allowed` is visibly **Fail**.

Each frozen result contains only `contractVersion: 2`, fixed case `id`, `client`,
`category`, result `status` and fixed `code`. No response/header/body fields,
provider strings, identifiers, URLs, exception text or live-evidence claims are
returned. Transport/network execution and future live observation provenance
remain outside this evaluator.

## Local verification

The [focused tests](route-contract-v2.test.cjs) use independent literal case and
response expectations. They cover both clients, all spellings, separator failure,
fixture mismatches, status/media-type validation, provider/malformed data,
unsupported IDs, caller mutations, safe output and unchanged v1 classification.

```sh
node --test salesforce-native/docs/evidence/install-auth-platform/encoded-route-investigation/route-contract-v2.test.cjs
node --test salesforce-native/docs/evidence/install-auth-platform/canonical-disposable/offline.test.cjs
node --test salesforce-native/docs/evidence/install-auth-platform/encoded-route-investigation/offline.test.cjs salesforce-native/docs/evidence/install-auth-platform/canonical-disposable/controller/*.test.cjs
```

Run these sequentially: the fixture offline tests invoke the deterministic
archive builder. Do not run another archive builder concurrently. All evidence
from these commands is local/offline; no Salesforce CLI invocation or live
Salesforce, browser, org, auth, dependency installation or private-artifact read
is needed. Implementation and RED/GREEN output are recorded in the Task 13 report;
independent task review is controlled separately by root.
