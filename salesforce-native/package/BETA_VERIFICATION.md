# Cardstack beta verification — October 5, 2026

Core beta: **0.1.0.4**, unpromoted. [Install](https://login.salesforce.com/packaging/installPackage.apexp?p0=04tg8000000QJyHAAW).

| Check | Result |
| --- | --- |
| Development org Apex | 144 passed, zero failures/skips |
| Installed core package Apex in fresh Developer scratch org | 139 passed, zero failures/skips |
| Studio model tests | 20 passed |
| Package create and install | Success; 82% coverage |
| Structured record HXL in Claude | Passed: highlights, three-column section, one-column description |
| Account lookup/search HXL | Passed: real oil Accounts and disposable QA Account |
| Named my opportunities | Rendered empty list; ownership independently verified empty; saved-view semantics are a labeled fallback |
| Live Claude update | Unverified: Preview Update returned No approval received twice; no save attempted |
| ChatGPT update parity | Unverified |
| Cleanup | Original Account layout restored; disposable Account removed; both queried |
| Final deployment state | JWT restored ON; native MCP access active and Claude catalogue refreshed |

The private confirmation store binds actor, expiry, exact changes, policy, and reviewed record state. Tests cover missing confirmations, tampering, stale records/policy, successful replay receipts, blank/zero/null handling, and published field policy. CRM reads/writes retain connected-user access. Preview Update retains trial DML with rollback; do not interpret its preview as no execution of automation.

The community definition contains 16 tools. Unconfirmed Create Record is excluded; Delete Record does not exist. Get Record accepts exactly one input per call because multi-record output failed rich rendering in Claude.

The install link is for the core package. HXL widgets, Lightning types, and Hosted MCP require the companion deployment plus subscriber-org HXL/MCP/OAuth configuration. The fresh-org installation proves the core; it does not prove companion availability in arbitrary subscriber orgs.

This milestone builds the governed write foundation. Multi-field editable forms, typed answer state, Back/Cancel/Resume, mapped autolaunched flows, record action buttons and phrase guidance are the next build slices. Screen Flow interviews are not implemented in this beta; current launch cards open Salesforce.

Evidence: Cardstack-structured-record-proof.png, Cardstack-Claude-approval-blocker.png. Private CLI test/build/install receipts are retained in the task workspace without credential output.
