# Supported UI options for Cardstack

Research date: October 5, 2026. Scope: official Salesforce documentation; no org changes or runtime proof. Latest documentation does not establish availability in Cardstack's API 67 org.

## Strongest findings

**HXL is currently documented as an output renderer, not a general form editor.** Salesforce distinguishes LWC custom Lightning type UI overrides (input `editor.json` and output `renderer.json`, Salesforce applications only) from HXL widgets (output `renderer.json` only, external MCP clients supported). We should not assume that adding a custom Lightning type editor creates editable controls in Claude or ChatGPT. [Lightning Type UI Configuration](https://developer.salesforce.com/docs/platform/lightning-types/guide/lightning-types-ui-config.html)

HXL's beta component reference lists cards' building blocks, tables, and buttons, but no general text-input, select, or form component. It explicitly distinguishes additional developer-preview components in the Playground and recommends sandbox use because APIs can change. This is an evidence boundary, not proof that no preview capability exists. [HXL component reference](https://developer.salesforce.com/docs/platform/hxl/references/hxl-reference-about)

**Buttons can guide a conversational workflow.** Documented actions are `action/openLink` and `action/sendMessage`. The latter sends a message to the agent, which processes it and may ask for confirmation. This is not a documented direct tool invocation with deterministic input submission. [HXL interaction types](https://developer.salesforce.com/docs/platform/hxl/references/hxl-reference-about/hxl-lightning-types.html)

## Alternative: preserve Salesforce's native screen runtime

Salesforce's architecture guide describes embedding custom LWCs into an external website using Lightning Out 2.0 and launching flows through `lightning-flow`. That is a supported architectural direction for an app whose host page we control. [Building Forms](https://architect.salesforce.com/docs/architect/decision-guides/guide/build-forms.html)

The `lightning-flow` reference documents active Screen Flow interviews, initial input variables, native navigation controls, and status events; it lists Lightning Out **Beta** among its targets. The reference itself does not explicitly list Lightning Out 2.0. [Flow component](https://developer.salesforce.com/docs/component-library/bundle/lightning-flow)

For 2.0, Salesforce documents a host-page script and custom web components containing Salesforce-context iframes. Authentication uses a dynamically generated frontdoor URL from a UI Bridge exchange with a valid access token or session. [Lightning Out 2.0 architecture](https://developer.salesforce.com/docs/platform/lwc/guide/lightning-out-architecture.html)

Limitations include cross-origin cookies, authenticated users, unsupported navigation, and standard components needing custom-LWC wrappers with possible styling/behavior differences. The currently retrieved limitations page says Aura is unsupported; if later release notes grant gated Aura support, that does not establish eligibility for this org or all new customers. [Lightning Out 2.0 limitations](https://developer.salesforce.com/docs/platform/lwc/guide/lightning-out-limitations.html)

**Important distinction:** supported embedding in an external website does not establish supported embedding inside a Salesforce HXL widget in Claude/ChatGPT. These sources do not document loading arbitrary Lightning Out scripts, nested Salesforce iframes, or obtaining the UI Bridge authentication context through Hosted MCP widgets. A Screen Flow wrapper working in a website would not prove chat support.

## Decision table

| Approach | Documented foundation | What remains unproved | Hosting impact |
|---|---|---|---|
| HXL cards plus conversational inputs | Output rendering and agent-directed buttons | Particular client button behavior; reliable multi-step state and writes | Fits existing Salesforce-native architecture |
| Editable HXL forms | Developer-preview components may exist; not in published beta component list | Actual controls, state binding, value submission, client and API 67 availability | Potentially fits; cannot commit before proof |
| Native Screen Flow via Lightning Out 2.0 | Salesforce-hosted custom LWC embedding and flow-component architecture | Specific wrapper/component compatibility, authentication, cookies, and AI sandbox embedding | Salesforce hosts components; a host page is still needed. External server requirements depend on host/auth design |
| Custom HTML MCP app UI | HXL documentation says MCP Apps compatibility, not arbitrary custom UI hosting | Whether Salesforce Hosted MCP supports serving our custom HTML resources and direct tool events | May require an external MCP/resource host; would change standing scope |

HXL is documented as compatible with MCP Apps clients, but this does not imply that every MCP Apps feature is configurable through the Salesforce HXL metadata pipeline. [HXL with MCP agents](https://developer.salesforce.com/docs/platform/hxl/guide/hxl-mcp-channels.html)

## Recommendation and support questions

Do not begin with a full Screen Flow interpreter port. Prove a single task using cards, conversational inputs, a governed Salesforce action, and a completion receipt first. In parallel, ask Salesforce support for the exact supported editable-input path for HXL in external clients, and whether a native Screen Flow runtime can be embedded in a Hosted MCP-served resource.

Request specific answers for the actual API 67 org and release: component names and preview eligibility; binding and submission actions; whether button events can call a tool directly; support for `lightning-flow` inside a Lightning Out 2.0 wrapper; HXL resource/script/iframe constraints; UI Bridge authentication from a Hosted MCP widget without exposing credentials; and package support. Keep preview experiments separate from beta promises.

## Supported execution path: task actions instead of screen interpretation

Hosted MCP explicitly supports autolaunched flows with defined input/output variables. The tool schema comes from those variables; Salesforce executes the automation and returns its outputs. Screen and scheduled flows are excluded from this documented path. Availability still needs verification in the API 67 org. [Hosted MCP Flow tools](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/flows.html)

Salesforce's architecture guidance recommends separating business logic from screen presentation into an autolaunched flow, or exposing narrowly scoped invocable Apex. This provides a cleaner first architecture for Cardstack than reimplementing the Salesforce interview engine. [Agent-ready automation](https://www.salesforce.com/blog/agent-ready-automation/)

Proposed interaction: record card → configured task → collect missing values inside chat → preview the exact operation → explicit confirmation → governed Salesforce execution → result receipt and refreshed card. Example: “Qualify this lead” collects qualification answers, confirms the target and proposed change, then calls an approved autolaunched flow. Record context supplies the ID; typed answers supply other inputs. Cardstack must validate exposure, inputs, user permissions, confirmation, and duplicate submission independently of model intent.

This achieves in-chat process completion using conversational input, but does not promise form fields embedded in the card. If editable controls are mandatory, the UI transport remains a release-blocking feasibility question. A Screen Flow interpreter would not resolve that transport question by itself.

The earlier interpreter-first roadmap is under architecture review. Retain the useful policy, action discovery, record editing, navigation, home configuration, versioning, audit, and recovery requirements; reconsider the flow runtime implementation after supported UI proof. No product or org changes were made by this research.
