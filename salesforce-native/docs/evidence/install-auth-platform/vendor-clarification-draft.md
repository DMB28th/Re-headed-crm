# Salesforce platform clarification text

Status: approved by the user and sent to Salesforce Help's Agentforce support assistant on October 8, 2026. Human review was requested after its generated response contradicted official documentation. Creating a human support case requires Salesforce Support / Trailblazer sign-in; no case reference has been received. See [submission receipt](vendor-support-submission-receipt.json). The technical question below is preserved as sent.

We are evaluating a Salesforce-only MCP server implemented in Apex REST API67, exposed through Salesforce Sites, accepting Salesforce opaque OAuth bearer tokens for ordinary named users.

What documented Salesforce-native mechanism allows Apex ingress to validate that the current opaque token was issued for this MCP protected resource as its intended recipient, without parsing or forwarding the bearer, storing an additional secret, or querying privileged session/audit data?

Does Salesforce honor RFC8707 resource indicators in both authorization-code requests with PKCE and token exchange requests, and preserve/enforce the intended resource during refresh? Please identify exact supported endpoints, policy fields, Apex methods and API67 behavior, including unsupported-resource and missing/wrong-resource rejection semantics.

Can ordinary users invoke the mechanism in Salesforce Sites context under least-privilege permissions? Please specify necessary permissions and behavior for already-active/reused tokens and missing attributes.

Please distinguish resource/audience enforcement from OAuth application identity. If current issuing-app identity is separately available, what trusted accessor and semantics establish it for each existing opaque token? Administrative app separation or login-history labels alone would not establish token audience.

The submitted question includes no tenant/app identifiers, deployment URLs, tokens or logs.
