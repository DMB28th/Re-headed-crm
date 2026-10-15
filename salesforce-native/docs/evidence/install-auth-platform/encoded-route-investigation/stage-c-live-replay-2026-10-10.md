# Stage C bounded route observations — October 10, 2026

The approved four-GET replay completed against the unchanged disposable fixture.
Both client paths returned HTTP 405 and the exact fixture JSON error
`method_not_allowed` for plain `mcp` and encoded unreserved-letter `%6dcp`.
The [sanitized receipt](stage-c-route-observations-2026-10-10.json) records all four
actual results and exactly one attempt per case.

| Client | Plain `mcp` | Encoded `%6dcp` |
| --- | --- | --- |
| Claude | 405 / `method_not_allowed` | 405 / `method_not_allowed` |
| ChatGPT | 405 / `method_not_allowed` | 405 / `method_not_allowed` |

These observations establish equivalent behavior at the measured request boundary.
They do not identify the normalization layer or expose the raw Apex handler URI.
Encoded separators were not measured. The original Stage A result remains
75 Pass / 2 Fail / 7 Unknown; its missing status/body cannot be reconstructed from
this later replay. Its expected encoded-route 404 was not changed.

## Execution and preservation

The separate exclusive Stage C journal verified the thirteen-file completed Stage B
closure seal. Fresh full baseline and preflight passed. Deployment of the unchanged
four definitions succeeded with all exact 60 Apex tests and zero component/test
errors. Root installed one owned operator permission-set assignment and two guest
grants for ingress and the constant page. Actual Site activation and complete
independent current-state verification passed. No five-page collateral additions
were observed in this cycle. No OAuth app, plugin, connection or consent was added.

An initial entry-point configuration contained an unsupported setup-only key and
was rejected before any attempt marker or HTTP request. Root supplied the already
specified strict three-key observation configuration; no HTTP request was retried.

Site deactivation was saved and independently verified first. Both guest grants
and the operator assignment were then removed with complete independent readbacks.
Cleanup preflight verified the exact unchanged four-definition destructive archive.
The single cleanup submission succeeded with zero component/test errors. Fresh
cleanup finalization passed complete original baseline equality and independent
global absence checks for all four owned IDs and references. Site inactive,
temporary access absent, actual saved JWT ON and metadata queue clear were verified.
The [sanitized cleanup receipt](stage-c-cleanup-2026-10-10.json) records the closure.

Both metadata sessions used actual saved JWT OFF, fresh opaque managed login, one
enqueue, and immediate actual saved/readback JWT ON before status polling. Actual
full app metadata and screenshot-backed OFF/ON date transitions were bound in the
private journal. No credential, private identifier, full endpoint URL or raw provider
response is included in this report.

Original Stage A/B receipt bytes, frozen archives and the five pre-existing edited
documents remain unchanged. Main Task 1 remains incomplete; installation portability,
resource mapping and lifecycle/release gates remain open. Task 3 was not dispatched;
no production cutover, push, merge or release occurred.

## Next decision

Review the encoded-unreserved-letter criterion separately from encoded separators.
The present 404 expectation does not match this measured 405 behavior. Any change to
that criterion needs a reviewed contract decision and meaningful tests; this replay
does not silently relax it or convert the original failures into passes. Exact
resource mapping, portability and lifecycle acceptance remain separate open gates.
