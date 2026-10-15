# Encoded-route investigation — October 10, 2026

Source-only investigation of the two original Stage A failures. No Salesforce
requests, deployments, settings, access grants or Site activation were performed.
The original 75 Pass / 2 Fail / 7 Unknown receipt, fixture source and ZIPs remain
unchanged. Production Task 3 is not dispatched.

## Retained evidence

Root inspected the immutable private per-batch and original aggregate records.
Both `claude.negative-encoded` and `chatgpt.negative-encoded` are
`Fail / CONTRACT_MISMATCH`, each with one HTTP attempt. The fixed case was an
authenticated GET of `/services/apexrest/cardstack/v1/{client}/%6dcp`, requiring
404 and exactly `unknown_probe_route`. Canonical named GET and nested-route
controls passed their separate contracts. The sanitized receipt schema retained
classification/times/attempt counts, but no actual response status or body. A
later diagnostic capture stopped in `current-guard` before another HTTP observation.
Therefore the original response cannot be reconstructed as 405 or any other status.

## Source boundary

- `canonical-disposable/controller/protocol.cjs` defines the encoded case with
  `%6dcp`; `contract.cjs` requires exact 404/unknown_probe_route.
- `controller/protocol-transport.cjs` concatenates the fixed path onto the pinned
  Site URL, disables retry/refresh/redirect follow and feeds the installed SDK.
- `classes/CardstackCanonicalProbe.cls` compares whole literal internal URI forms.
  It performs no URL decoding. A literal `%6dcp` in that supplied URI fails the
  match; a canonical `mcp` reaches the named-actor/current-Use checks before the
  authenticated GET method denial. This is source reasoning, not ingress proof.
- `CardstackCanonicalProbeTest.cls:92` tests `chatgpt%2fmcp` using a manually
  assigned `RestRequest.requestURI`. That is an encoded separator, whereas `%6d`
  is an encoded unreserved letter. It neither tests the live case nor exercises
  Salesforce's external request processing.
- The fixture README promises rejection of encoded **separators**. The measured
  case is an encoded **letter**. These categories must not be conflated.
- The original classifier can emit CONTRACT_MISMATCH for many recognizable JSON
  responses, including method_not_allowed. It cannot prove which response occurred.

## Offline reproduction

The new [offline tests](offline.test.cjs) use the installed HttpApi/request/
StreamPromise and network-disabled undici MockAgent with synthetic domains and
identity pins. Both clients' encoded paths and canonical controls reach the mock
unchanged. This confirms preservation through the local dispatch boundary, not
remote wire bytes or Salesforce processing.

The original classifier produces identical retained Fail receipts for synthetic
405/method_not_allowed, 403/cardstack_use_required and 404/unknown_probe_route with
an extra field. Exact 404 passes; nonfixture provider JSON remains Unknown. These
observations prove receipt information loss without inventing the live response.
No JavaScript copy of an Apex matcher is presented as Apex execution.

Root ran the new four tests together with the existing 19 protocol tests:

```text
node --test salesforce-native/docs/evidence/install-auth-platform/encoded-route-investigation/offline.test.cjs salesforce-native/docs/evidence/install-auth-platform/canonical-disposable/controller/protocol.test.cjs
23 tests; 23 pass; 0 fail; exit 0
```

Independent task review passed spec compliance and quality with no findings.
Only the added test and investigation documents changed. Apex authoring, analyzer,
org tests and deployment are N/A: no Apex changes; cleaned fixture remains absent.
The deploy ZIP, cleanup ZIP and HTML hashes matched their frozen values, and all
five pre-existing dirty documents matched their preserved byte hashes.

## Official references

[RFC 3986, section 2.3](https://www.rfc-editor.org/rfc/rfc3986.html#section-2.3)
and [section 6.2.2.2](https://www.rfc-editor.org/rfc/rfc3986.html#section-6.2.2.2)
(URI standard, read October 10) distinguish unreserved letters from reserved
separators and describe equivalence and normalization of encoded unreserved octets.
Thus `%6dcp` can normalize to `mcp`; acceptance of that equivalent spelling alone
is not evidence of authorization bypass. The standard does not prove how this
Salesforce ingress handled the original request or override the original test.

[RestRequest Class, API67](https://developer.salesforce.com/docs/atlas.en-us.262.0.apexref.meta/apexref/apex_methods_system_restrequest.htm#apex_System_RestRequest_requestUri)
(atlas reference, browser-rendered extraction with Summer '26/API67 selector)
defines requestURI and gives a resource-relative example. The inspected body
contains no guarantee that percent-encoded path bytes survive ingress unchanged.
Initial web extraction failed; the actual reference body was read in a temporary
in-app browser tab, which was closed. This is a documentation limit, not proof
that Salesforce decodes `%6d`.

## Working hypothesis and missing observation

The negative-case expectation may be treating an equivalent unreserved spelling
as an invalid route. Normalization before the literal Apex matcher could produce
canonical GET behavior and therefore fail the 404 assertion. This is a hypothesis;
the original status/body and processing layer remain Unknown. No route matcher,
contract expectation or historical result is changed based on it.

The smallest useful future live measurement is four bounded authenticated GETs:
canonical `mcp` and encoded `%6dcp` for each client, with actual status, JSON content
category and fixed known error category retained. Use the unchanged owned synthetic
fixture, no CRM/OAuth app/plugin work, fresh full ownership/baseline/access guards,
bounded temporary Site exposure and complete owned cleanup/JWT restoration.
A new disposable execution journal and a separately reviewed observation wrapper
are required; original receipts and completed journals must not be overwritten.

If encoded and canonical GETs both return the exact method_not_allowed response,
that establishes equivalent route behavior; it does not independently locate the
normalization layer. If they differ, the captured status/category determines the
next hypothesis. Any later encoded-separator measurement needs its own explicit
fixed allowlist and contract; it cannot silently replace the original two cases.
No live replay is authorized by this document or was performed in this task.
