# Claude Salesforce-only authentication investigation

Date: October 8, 2026. Public-documentation research with controller-reported live
browser evidence; this research agent made no org, connector, credential,
deployment, or browser changes. The user selected keeping both clients.
The approved migration design and delivery-proof plan remain authoritative.

## Finding and next step

**Claude's actual authorization request used the wrong Salesforce path:
`/authorize`, which returned HTTP404, rather than `/services/oauth2/authorize`.**
The known protected-resource discovery gap fits Claude's documented fallback,
but its backend discovery request sequence was not captured. The smallest next
step is a sanitized support reproduction about that fallback, or an authoritative
documented discovery/routing capability, before any configuration change. Neither
a Salesforce-wide incompatibility nor a working Salesforce-only repair is proved.
An isolated manual correction of the browser authorization path subsequently
reached Claude's callback with a code, then Claude reported token-exchange failure.
These are two distinct observed boundaries; the token endpoint it actually used
is unknown.

Existing evidence: [ingress](SALESFORCE_MCP_INGRESS_2026-10-08.md) records the
authenticated API67 Apex endpoint, unauthenticated 401 with `WWW-Authenticate:
Token`, missing protected-resource metadata, missing RFC8414 metadata, and public
org OIDC metadata with the real `/services/oauth2/authorize` endpoint. Claude
reached a nonexistent Lightning Welcome page before consent; the intermediate
authorize URL was not captured. The isolated public ECA ID and blank secret did
not fix that attempt. [Delivery proof](MCP_APPS_DELIVERY_PROOF_2026-10-08.md)
separately establishes ChatGPT synthetic UI/echo and bounded recovery, not Claude
authentication or governed CRM writes. This investigation does not repeat those
tests or the renderer audit.

Controller follow-up during this investigation: the retained isolated Claude
entry reported an unfinished connection and displayed the endpoint without a
trailing slash. Its More options menu offered Remove; no Edit or issuer-URL
control was observed. One further Connect retry with the same configuration again
reached the nonexistent Salesforce Welcome page before consent. Chrome DevTools
Network had Keep log enabled before the attempt; after resolving the native
window/profile interruption, the controller inspected the preserved network
entry. It shows a document GET on the org My Domain `/authorize` with HTTP404.
Parameter names were `response_type`, `client_id`, `redirect_uri`,
`code_challenge`, `code_challenge_method`, and `state`. Safe checks confirm
`response_type=code`, `code_challenge_method=S256`, the configured isolated
client ID, and the exact Claude callback. `scope` and `resource` parameters were
absent; absence is not a mismatched value. The sanitized private receipt is
`mcp-delivery-proof/claude-authorization-hop.json`; no HAR, code, token, cookie,
raw client ID, state, or challenge value was saved in this note.
Earlier focused six-hour history queries for exact
`/authorize` and `/services/oauth2/authorize` paths returned no results; this is
inconclusive and are superseded by the network observation. These are
controller-reported findings; the research agent did not inspect the browser or
private receipt. No configuration change was made for this retry. Anthropic's
backend metadata-fetch requests are outside this browser trace and remain unknown.

The controller then performed a bounded diagnostic using the same pending OAuth
parameters privately, changing only the browser request pathname to the official
`/services/oauth2/authorize`. Network evidence shows HTTP302, followed by internal
`/setup/secur/RemoteAccessAuthorizationPage.apexp` HTTP200, then an actual request
to `https://claude.ai/api/mcp/auth_callback` returning HTTP307. Safe receipt checks
confirm code presence, matching pending state, exact callback, and no callback
error parameter. Claude then transiently reported
`error_code=mcp_token_exchange_failed`. No consent interaction was observed; do
not infer an Allow click or an existing grant. Claude's server-side token URL,
request and HTTP status were not captured. `/token` fallback is only a hypothesis.
The private sanitized receipt is
`mcp-delivery-proof/claude-corrected-authorize-diagnostic.json`. No private pending
parameters or returned code were printed or saved in the research artifact.
The isolated entry now shows Connection issue and a reconnect prompt; no
functioning authenticated MCP route was demonstrated. This diagnostic does not repair normal
onboarding, discovery, or token exchange. The controller is clearing the DevTools
trace and restoring Keep log OFF after recording safe evidence; cleanup was then
verified: the network log was empty, Keep log was OFF, and DevTools was closed.
The private screenshot `claude-diagnostic-unconnected.png` records the Connection
issue state. No additional retry or org setting change is proposed.

## Official requirements and the apparent fallback discrepancy

Claude requires a 401 discovery handshake. A metadata pointer can identify any
HTTPS JSON location; without one it probes path-specific then root protected-
resource well-known URLs. The document identifies the exact MCP resource and
primary issuer; supplying an OAuth client ID supplies identity, not issuer
location. Blank optional secrets are explicitly supported for public clients.
Its callback is `https://claude.ai/api/mcp/auth_callback`; S256 is required.
Leaving an optional client ID blank instead selects Anthropic-held credentials,
then CIMD, then DCR. That order selects client identity; it does not document an
issuer override. The reviewed custom-connector instructions name server URL,
client ID and optional secret, with no manual issuer/auth/token URL control.
[Authentication for connectors — Claude developer documentation](https://claude.com/docs/connectors/building/authentication).

Claude's troubleshooting describes missing resource metadata causing fallback to
the MCP origin and a nonexistent `/authorize` page. The same page says issuer
discovery tries RFC8414 then OIDC, with one 200 sufficient. These describe different
stages: selecting an issuer and discovering its endpoints. The present 401 and
resource-metadata 404s fit the first failure; org OIDC200 would support the second
once selected. The observed `/authorize`404 now confirms the wrong-path symptom;
the missing-metadata-to-fallback causal sequence remains an inference. Public docs
do not explain whether Claude attempted or rejected org OIDC in this connection.
The page documents canonicalizing OAuth `resource` without a trailing slash;
the observed request omitted that parameter, so no resource mismatch is established.
[Troubleshoot your connector — Claude developer documentation](https://claude.com/docs/connectors/building/troubleshooting).

MCP 2025-11-25 requires protected-resource metadata; authorization-server OIDC
metadata is a separate document. Clients must use a supplied challenge pointer
or try the specified resource well-known locations. Preregistered clients are a
supported registration mechanism, so missing DCR alone is not a blocker when the
static ECA ID is used. Publishing metadata does not establish token audience
binding or client interoperability.
[Authorization — MCP specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).

## Concrete Salesforce-supported pieces and remaining gaps

| Candidate | Supported piece | Missing evidence / consequence |
| --- | --- | --- |
| Existing direct Apex route plus static ECA | Salesforce ECA can omit the web-server secret and require PKCE; exact callback matching is documented | Already attempted. No official Claude manual issuer/auth/token override was found in the reviewed connector docs. Changing secret, scopes, or callbacks cannot be claimed to repair issuer discovery. |
| Public metadata only on Salesforce Sites | Salesforce documents public Apex REST under a Site URL, with enabled class access and configurable response body | A separate metadata URL cannot be discovered by the unchanged direct endpoint without a challenge pointer or same-origin well-known routing. No supported setting to alter this platform-generated unauthenticated challenge was found. |
| Salesforce Site URL rewrite | Salesforce's first-party article documents mapping Site URLs to Visualforce pages | Evidence is old and page-oriented. It does not prove reserved `/.well-known/*` handling, arbitrary REST rewriting, or rewriting on the org `my.salesforce.com` origin. A Site-origin MCP route would additionally need proof of connected-user token execution; no guest CRM handler or token proxy is approved. |
| Salesforce Hosted MCP | Official Claude recipe uses `api.salesforce.com/platform/mcp/v1/...` | It applies to Hosted MCP, not this Apex route. It supplies no evidence of arbitrary custom HTML/resource delivery, so it is not a demonstrated replacement. |

Sources: [Configure ECA OAuth settings — Salesforce Help](https://help.salesforce.com/s/articleView?id=xcloud.configure_external_client_app_oauth_settings.htm&language=en_US&type=5),
[Public REST services on Salesforce Sites — first-party developer article](https://developer.salesforce.com/blogs/2012/02/quick-tip-public-restful-web-services-on-force-com-sites),
[URL rewriting with Sites — first-party developer article](https://developer.salesforce.com/blogs/2010/05/url-rewriting-for-your-customizing-your-site-urls),
[Configure Claude — Hosted MCP developer guide](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/claude.html).
The two Sites articles are capability leads, not current API67 compatibility proof.
Targeted atlas reference fetches failed; they were not treated as evidence.

Salesforce documents public My Domain OIDC and distinct Experience Cloud URL
formats. Its DCR guide requires an initial access token, so the observed
`registration_endpoint` does not prove unattended Claude DCR. Do not advertise
CIMD or add `none` to invented issuer metadata to imply Salesforce implements it.
[Query for OIDC configuration — Salesforce Help](https://help.salesforce.com/s/articleView?id=xcloud.remoteaccess_using_openid_discovery_endpoint.htm&language=en_US&type=5),
[OIDC dynamic client registration — Salesforce Help](https://help.salesforce.com/s/articleView?id=xcloud.remoteaccess_oidc_dynamic_client_reg_flow_ca.htm&language=en_US&type=5).
These Help pages' actual article bodies were retrieved despite shell text above
them; the article sections, not navigation/loading text, support these claims.

## Next evidence and platform boundary

The failing normal authorization path and a subsequent diagnostic token-exchange
failure are established. Another blind credential retry does not resolve either.
Retain the public ECA configuration and ask for a documented Claude issuer
override or clarification of the backend discovery and token endpoint selection.
No supported override was found in the reviewed docs or retained-entry UI. No
supported setting to customize the direct platform 401 challenge, or to publish
custom root well-known documents on the org origin, was established. This is the
current route's unresolved platform boundary, not a claim these capabilities are
globally impossible.

Any later Sites probe must publish constant public metadata only, have no
CRM/private-object access, and first establish how the authenticated MCP URL
discovers it. A disconnected metadata page is not a repair. Salesforce-native
routing and connected-user execution must be demonstrated before changing the
MCP origin; no Site-origin CRM ingress is proposed as already supported.

## Sanitized Anthropic support reproduction draft — not sent

We are testing a custom Claude web connector with a Salesforce-hosted Apex REST
MCP endpoint under `/services/apexrest/cardstack-mcp-probe` and a preregistered
public Salesforce ECA client ID, with blank secret. The ECA callback matches
`https://claude.ai/api/mcp/auth_callback` and PKCE is enabled. An unchanged Connect
retry generated a document GET to the org My Domain `/authorize` returning 404,
before consent. The ID/callback match the configuration, `response_type` is code,
and PKCE method is S256. Scope/resource parameters were absent.

The unauthenticated MCP endpoint returns 401 with `WWW-Authenticate: Token`.
Tested protected-resource and RFC8414 well-known URLs return 404; org
`/.well-known/openid-configuration` returns 200 and publishes the correct
`/services/oauth2/authorize` URL. We have not observed Claude's backend discovery
requests. Your troubleshooting describes this wrong-path fallback, but also OIDC
fallback at the issuer. Does this custom-connector flow require protected-resource
metadata before trying origin OIDC, and is there a supported issuer/discovery URL
override for a preregistered client when the platform challenge cannot be
customized through documented settings? Please identify the failed discovery
stage using the connection timestamp/reference ID if available.

For a bounded diagnostic we changed only the browser authorization pathname to
the published `/services/oauth2/authorize`, retaining pending values privately.
It returned 302, an internal Salesforce authorization page returned 200, and the
actual Claude callback returned 307. Safe checks confirmed code presence,
matching pending state, exact callback, and no callback error parameter. No
consent interaction was observed. Claude then reported
`mcp_token_exchange_failed`; we have no observation of the server-side token URL
or HTTP status. Can you identify its token endpoint selection and failure stage?
The connector shows Connection issue; no functioning authenticated MCP route was
demonstrated. This manual diagnostic is not an onboarding repair.

The controller should add the observed attempt timestamp and any available
Claude reference ID privately before sending. No message was sent; sending
requires explicit user authorization. Do not attach a raw URL, HAR, credentials,
state, challenge, codes, tokens, or cookies.

No implementation option in this note is approved or verified. Preserve both
client targets, existing ChatGPT proof, deployed HXL beta, API67 and JWT ON. Claude
must subsequently pass its complete live matrix; connection alone is insufficient.
