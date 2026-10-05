# Cardstack: completing processes inside AI UI

October 5, 2026. Corrected intent and feasibility findings; no implementation claim.

## User's corrected requirement

Users must complete flows in the AI UI: enter values, choose actions, move through necessary steps, submit, and see a real result without opening Salesforce. Record-card action buttons should initiate this in-chat experience. Example phrases should expose the same configured actions to chat discovery. The previous launch-link design is superseded.

Native Salesforce hosting, Salesforce Hosted MCP, HXL widgets, connected-user access, and API 67.0 remain constraints. Custom Screens must not reappear as an independent Studio feature; any Cardstack UI definitions belong to a configured flow.

## Verified platform facts

Salesforce's Hosted MCP documentation states that flow-backed tools support autolaunched flows, excluding Screen Flows and scheduled flows. The tool receives defined inputs, executes the flow server-side, and returns output variables. It has no streaming progress interface.

Source: [Hosted MCP Flows](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/flows.html).

Salesforce documents invoking autolaunched flows from Apex using `Flow.Interview.createInterview` or `Invocable.Action`. Screen Flows use UI embedding mechanisms such as Visualforce and Lightning components instead. This does not establish a headless screen interview navigation interface for HXL.

Source: [Start a Flow from Apex](https://help.salesforce.com/s/articleView?id=platform.flow_distribute_system_apex_invoke_a_flow_from_apex.htm&language=en_US&type=5).

HXL documents buttons with openLink and sendMessage actions. sendMessage sends a payload to the host agent, which processes it and may request confirmation. It is not documented here as a deterministic direct tool-call bridge.

Source: [HXL interaction types](https://developer.salesforce.com/docs/platform/hxl/references/hxl-reference-about/hxl-lightning-types.html).

Lightning input-type documentation lists supported Salesforce surfaces for editors. These lists do not prove that those editors render as editable HXL controls inside Claude or ChatGPT. A Trailhead overview describes form widgets, but that general description is not sufficient evidence of input binding and submission on this particular connector.

Sources: [Lightning Types reference](https://developer.salesforce.com/docs/platform/lightning-types/references/lightning-types/lightning-types-reference.html), [HXL Playground overview](https://trailhead.salesforce.com/de/content/learn/modules/headless-experience-layer-basics/create-widgets-hxl-playground).

## Current Cardstack does not execute flows in chat

Flow Start builds a Salesforce URL. Flow Continue echoes notes and builds another URL. It never invokes a Salesforce flow. Session tokens bind those calls to a flow and record, but are not persisted Salesforce flow interviews. Existing green tests prove launch-card behavior, not in-chat completion.

## Candidate architecture and its limits

The supported backend route is an admin-configured chat interaction paired with an autolaunched Salesforce flow. Record context, readable field values, constants, and user-entered answers become validated flow input variables. A confirmed submit executes the registered flow and returns a result card. Server-owned state and replay protection must prevent repeated submits from executing twice. Multi-step interactions need an explicit state contract; chat must not invent Salesforce flow execution state.

This would reuse Salesforce automation but would not automatically mirror an arbitrary existing Screen Flow. Existing screen-driven processes would need either a supported native headless screen-runtime integration proved separately, a deliberately bounded Cardstack interpreter, or an admin adaptation that separates UI collection from autolaunched logic. A Cardstack interpreter must specify and test its differences from Salesforce execution, particularly branching, transaction boundaries, validation, and custom component behavior.

Flow actions remain owned by Flows, with a flow-bound form/step configuration if required. Removing a standalone Custom Screens feature does not remove the need to define the in-chat user interaction.

## Feasibility milestone before implementation design

1. Prove an editable control inside a real Claude HXL widget, including its supported value binding and submit payload. A text prompt in chat is not equivalent to an editable card field.
2. Prove button submission reaches the expected Hosted MCP tool with those exact values, and inspect whether updates rerender the same card or produce the next card.
3. Execute an isolated read-only autolaunched test flow with Text, Boolean, and Number inputs and return matching outputs. No business records or outbound messages are required for this probe.
4. Verify repeat submission does not create duplicate execution and that the action uses the connected user with the expected Salesforce access.
5. Check the target ChatGPT connector separately before claiming cross-client support.

If editable HXL controls cannot be proved, state that limitation. Do not relabel a Salesforce link, choice-only button sequence, or chat-text collection as the requested full form experience. Changing the HXL/native-hosting constraint would require a separate architectural decision.

## Unresolved requirement

Must existing Salesforce Screen Flows run unchanged, including their screens, branching, and components, or may admins configure an in-chat UI paired with autolaunched Salesforce logic? That choice determines whether the supported backend route meets the requirement. No new implementation plan should be finalized until this is resolved and the input/submit capability is proved.

## Existing interpreter discovered after initial research

Read-only inspection of the retired Node implementation found `packages/core/src/flow-capabilities.ts`, `flow-interview.ts`, `flow-analysis.ts`, and `flow-expressions.ts`. This is Cardstack's own interpreter, not a Salesforce-provided HXL Screen Flow runtime. Those legacy files remain untouched; they are reference material for an explicitly scoped native port.

The component registry declares support for common scalar inputs, text areas, radio/dropdown choices, multiselects, grouped fields, and selected standard flowruntime extensions. The traversal registry declares screens, decisions, assignments, lookups, bounded loops, limited subflows, and confirmation-gated writes. It marks custom LWCs, file upload, lookup/dependent picklist components, waits, action calls, and other elements as unsupported or degraded. These are source-code declarations, not verification that the native package or Claude HXL implements them.

There are associated legacy fixture tests, but they were not rerun during this inspection. The native Apex tools currently remain launch-only. Native hosting excludes simply importing the TypeScript runtime. The next design must assess reusing the registry, fixture contracts, and algorithms in a bounded Apex interpreter, with actual HXL input rendering and safe state persistence proved first. Do not import legacy delete execution into the native package, which intentionally has no delete-record tool.

This discovery corrects the initial recommendation to avoid an interpreter categorically. The distinction is between an existing Cardstack interpreter that can inform a port and a Salesforce runtime that executes arbitrary Screen Flows unchanged; the latter has not been established.
