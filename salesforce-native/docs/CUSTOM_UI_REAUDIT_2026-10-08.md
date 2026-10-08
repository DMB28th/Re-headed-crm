# Custom renderer and interpreter re-audit — October 8, 2026

## Decision and audit scope

The user selected HXL retirement, the custom MCP Apps renderer, the earlier bounded
interpreter, and retention of native Apex governance and Studio. Runtime hosting
remains in Salesforce. This audit changes no deployed runtime.

Reviewed the legacy React renderer, host bridge, record editor, Flow forms, Home
write controls, pagination, interpreter analysis/expressions/state/effects, and
current native contracts. Source review and isolated local probes are evidence of
source behavior, not proof of a production exploit or live-client compatibility.

## What carries over

| Reuse | Rebuild | Exclude |
| --- | --- | --- |
| Record sections, controls, diff/receipt presentation; table/home/flow composition | Versioned native UI DTOs, literal typed submissions, async identity/revision guards, uncertain-outcome recovery | Legacy unconfirmed writes, Node runtime, custom tenancy/accounts/Postgres |
| MCP Apps resource and host-bridge pattern | Salesforce-only OAuth/discovery and production resource/tool dispatch | Assumption that Hosted MCP can execute arbitrary React resources |
| Interpreter graph, expression and component concepts; fixtures | Apex-owned pinned definitions/interviews, allowlisted inputs, immutable record context, exact effects/confirmation/replay protections | Delete, arbitrary Flow parity, undocumented runtime APIs |
| Native Studio and policy/confirmation/audit services | Custom runtime preview parity and process compatibility reporting | HXL as a permanent parallel renderer |

## Blocking findings before executable reuse

1. A record-card draft/review can remain mounted after the payload changes to a
   different record. Bind state and late responses to the exact interaction.
2. A lost write response is labeled nothing written. Recover authoritative receipts
   before retrying or making a definitive outcome claim.
3. Home confirmation can become clickable before preview finishes, with old grant
   state retained. Separate preparation/review/execution states and correlate them.
4. Legacy record/preview/receipt/Flow payloads are incompatible with native Apex
   responses. Checked adapters are required; tool renaming and casts are insufficient.
5. Legacy interpreter answers can replace record context, additional write predicates
   can be ignored, and replaying a pending write can execute it twice in local mocks.
6. Changing the definition between preview and confirm changes executed values in a
   local probe. Pin the definition and exact effect plan in private server state.
7. Unsupported validation/condition semantics can fail open; hidden required inputs,
   descending loops, date validation, and arithmetic have specific source defects.
   Narrow the supported subset and fail compatibility before launch.
8. Display HTML sanitization lacks a robust allowlist. Start with escaped plain text
   or a verified sanitizer; the chat sandbox is not content validation.
9. Pagination drops query identity, and conversational action dispatch drops the
   published action identifier. Preserve these in the new native contract.

Detailed source evidence is in [renderer findings](CUSTOM_UI_RENDERER_FINDINGS_2026-10-08.md)
and [interpreter findings](CUSTOM_UI_INTERPRETER_FINDINGS_2026-10-08.md).

## Fresh verification

An isolated source copy ran 42 existing tests: 34 interpreter/expression/input-mapping
tests and 8 record-card tests, all passed across six files. @cardstack/core resolved
to source, not stale build output. Existing passing tests do not cover the gaps above.
The interpreter reviewer independently ran all 74 core tests successfully and 11
targeted in-memory source probes; their synthetic
receipts establish the context/filter/replay/definition and expression issues listed
above without invoking Salesforce or writing CRM records.

No new dependencies were installed, no retired product source was changed, and no
Salesforce deployment or fresh client test was performed. Previous external-host
read-only Flow tests and Salesforce authenticated API transport tests remain dated
evidence; Salesforce-only actual client authentication and custom-UI saves remain
unproven. See [MCP Apps research](MCP_APPS_RESEARCH_2026-10-08.md).

## Delivery sequence

1. Prove Salesforce-only client authentication and resources, then one custom
   multi-field Account edit using existing Apex governance with exact confirmation,
   independent save/read-back, cancellation, and repeat-safe recovery.
2. Carry the earlier interpreter into a bounded Apex engine: two screens and one
   confirmed update to the current record, with a compatibility report and rejected
   unsupported constructs. This is interpretation, not Salesforce's native engine.
3. Migrate all published card surfaces and remove HXL runtime bindings at cutover.
   Release and package checks must demonstrate no HXL dependency in the new path.

See the [proposed migration spec](superpowers/specs/2026-10-08-custom-mcp-apps-migration-design.md).
