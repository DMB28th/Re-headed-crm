# Bounded live route comparison — prepared scope

Status: human-approved Stage C execution and owned cleanup complete. All four actual GETs returned HTTP 405 / `method_not_allowed`; see [the live report](stage-c-live-replay-2026-10-10.md), [observations](stage-c-route-observations-2026-10-10.json) and [cleanup receipt](stage-c-cleanup-2026-10-10.json). Preparation was independently reviewed (Task 12, fix re-review SpecPass / QualityApproved); its separate private journal verified actual completed Stage B cleanup through a thirteen-file seal. Nine reviewed root source modules were installed byte-for-byte. The Stage A 75 Pass / 2 Fail / 7 Unknown result and Stage B host proof remain unchanged. The scope below is retained as the executed plan; it does not authorize another replay.

## Question and four requests

Does the named operator receive different status/error responses for a literal route and its encoded unreserved-letter spelling?

| Order | Method/authentication | Client-relative route |
| --- | --- | --- |
| 1 | GET / existing named operator | `claude/mcp` |
| 2 | GET / existing named operator | `claude/%6dcp` |
| 3 | GET / existing named operator | `chatgpt/mcp` |
| 4 | GET / existing named operator | `chatgpt/%6dcp` |

All four use the existing Site prefix and `/services/apexrest/cardstack/v1/` root. No query or body. Capture only the fixed case name, actual integer HTTP status when returned, normalized content category and exact allowlisted fixture error. Missing or provider-suppressed status stays Unknown; retain no provider body, raw header, full URL, token or private identifier in the public receipt.

## Temporary access and lifecycle

Use a new exclusive `canonical-stage-c` private journal after verifying completed Stage B cleanup against sealed evidence. Take a fresh full baseline and preflight before any live mutation. Deploy the unchanged four-definition disposable fixture: two probe classes, Private UI static resource and minimal ingress permission set. Require the same exact 60 Apex tests. Give only the existing operator the owned permission-set assignment; add only ingress-class and constant-page guest grants; activate the existing probe Site for the four requests. No new OAuth app, plugin, client connection or consent.

Deploy archive SHA-256: `0254b198c7c303f699ff009ba8dea0d4e9dbca726cbfcae60f06e2b78a34baa2`.
Cleanup archive SHA-256: `b256372aa78693ab396854bc21f4146aa506b09959ec905bf6374d36c7da3329`.
UI resource SHA-256: `2ca5d8564f646d661763dfc924d49133ad66e43d195f990a690d47eb73ea758f` (309,866 bytes).

Each metadata session follows actual saved JWT OFF, a fresh opaque managed login, one enqueue, and immediate actual saved/readback JWT ON before polling. The observation transport keeps API 67, 15-second timeout, 64-KiB body cap, no automatic refresh, retries or redirects. Persist each attempt before sending; an unknown submitted outcome cannot be replayed.

After observations or any failure, deactivate the Site first with actual saved UI and server readback. Remove the two owned guest grants and owned operator assignment. If activation adds the same five standard error-page grants previously observed, remove only those individually owned, independently verified additions through the existing reviewed collateral controller. Delete only the four owned definitions with the unchanged cleanup archive. Verify owned definitions and global references absent, complete original baseline/access preserved, Site inactive, deployment JWT ON and metadata queue clear. Preserve all original apps, connections, foundation, constant page, Site and original guest access.

## Interpretation

Report the four actual observations separately from the original contract result. Matching plain/encoded 405 responses would establish equivalent behavior at the measured request boundary; they would not identify which upstream layer normalized the URI. A literal encoded-route 404 would support the fixture's unknown-route behavior at that boundary. A 403, provider response, guard failure or unknown transport outcome must retain its own category and limit the conclusion. Do not change the original expected 404 or convert prior Fail receipts into Pass. This scope does not measure encoded separators or supply raw Apex handler-URI evidence.
