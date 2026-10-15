# Salesforce-only MCP ingress — October 8, 2026

**Task 1 authentication acceptance passed in ChatGPT web. Claude web remains a
failed target.** ChatGPT shows the isolated probe account under Connected accounts,
marked Primary. Its App details lists the two synthetic probe tools. This permits
Task 2 after task review; both clients remain separate Task 3 targets. It does not
prove tool invocation, HTML resource retrieval, iframe/bridge behavior, confirmed
CRM writes, reconnect/refresh, ordinary-user access, or production release readiness.

The user requested web clients. The controller owned all browser interactions;
the Task 1 agent independently inspected the saved connected-account/tool-list
screenshots and performed read-only API/documentation work. No external gateway,
public guest CRM API, Node runtime hosting, or token proxy was introduced.

## Actual-client outcome

| Client | Observed result | Proof boundary |
| --- | --- | --- |
| ChatGPT web | Isolated probe connected account shown as Primary; App details “Read 2” lists `echo_cardstack_values` and `open_cardstack_apex_probe` | Authentication/connection UI and tool listing passed; no tool invocation/resource/bridge claim. HTTP status not captured in browser. |
| Claude web | Two beta-ECA attempts and one recreated isolated-ECA attempt reached Salesforce Lightning Welcome: “Page doesn’t exist” / “Enter a valid URL and try again” before consent | Failed current attempts; HTTP status and intermediate authorization path unknown. No authenticated route demonstrated. |

The successful ChatGPT attempt used **Cardstack MCP Delivery Probe**, a new Local
Salesforce ECA. The controller observed Continue followed by the connected-account
screen; it did not observe a consent page or click Allow in that successful sequence.
Do not infer the intervening consent interaction or who performed it. Earlier
ChatGPT testing with the beta ECA reached real Salesforce consent but was denied
because allowing a sixth approval warned it would revoke the oldest grant.

Private primary screenshots are `chatgpt-isolated-connected.png` and
`chatgpt-isolated-tools.png` in the handoff work directory's `mcp-delivery-proof/`.
The JSON receipt records actual-client HTTP statuses as null where not captured,
and keeps authentication separate from tools, resources, and bridge proof.

## Salesforce-only connection recipe

Org: `cardstack-spike2`; existing endpoint:

`https://orgfarm-e768adf3fa-dev-ed.develop.my.salesforce.com/services/apexrest/cardstack-mcp-probe/`

The new ECA's verified setup is:

| Setting | Verified value |
| --- | --- |
| ECA | `Cardstack_MCP_Delivery_Probe`, label Cardstack MCP Delivery Probe; Local |
| Callbacks | `https://claude.ai/api/mcp/auth_callback` and `https://chatgpt.com/connector/oauth/f-6aGQTT6Zet` |
| OAuth scopes | `api`, `refresh_token` only; no `full`, `web`, `openid`, `mcp_api` |
| Secret requirements | Web-server OFF; refresh OFF |
| PKCE / refresh rotation / named-user JWT access tokens | ON / ON / ON |
| Unused flows / introspect all tokens | OFF |
| User-access policy | Enabled self-authorization (`AllSelfAuthorized`) |
| IP policy / refresh-token policy | Enforce / SpecificInactivity |

In ChatGPT web Add custom MCP server, use the existing Apex endpoint and OAuth with
a user-defined client. Supply the **isolated ECA's public consumer ID privately**,
no secret, token authentication `none`, only `api refresh_token`, and OIDC off.
The form discovered Salesforce's auth/token endpoints through public OIDC:

- Authorization: `https://orgfarm-e768adf3fa-dev-ed.develop.my.salesforce.com/services/oauth2/authorize`
- Token: `https://orgfarm-e768adf3fa-dev-ed.develop.my.salesforce.com/services/oauth2/token`
- Authorization server base and Resource: both displayed the exact Apex endpoint above,
  unchanged from discovery; explicit auth/token URLs remained on the org origin.

The recreated descriptor's displayed callback remained exactly the ECA callback
above; no isolated-ECA callback edit was needed. Re-read the callback for a new
connection rather than assuming reuse. No stored credential appears in this report
or the HTML resource. The client connects directly to Salesforce; the ECA does not
expand the connected user's record/class permissions.

Claude was configured with the same endpoint, Streamable HTTP, own OAuth client ID
and no secret; it did not connect. Changing to the isolated ECA did not resolve its
pre-consent page error. Native Claude used a different account and was excluded.

## Fresh API inventory and public discovery

All API-versioned inventory requests used 67.0. The installed Apex probe and test
class are active at API67. Its live source equals the private original apart from
a trailing newline. Installed Cardstack beta remains `0.1.0.8`. Initial inventory
found no Sites and one beta ECA; post-create inventory independently confirms the
new Local probe ECA and its API/refresh-only scopes and unused-flow policies.

| Fresh check | Result |
| --- | --- |
| Authenticated CLI POST initialize | HTTP200; protocol `2025-11-25` |
| Unauthenticated GET/POST initialize | HTTP401; `WWW-Authenticate: Token`; `INVALID_SESSION_ID` |
| Path-specific protected-resource metadata | HTTP404 at `/.well-known/oauth-protected-resource/services/apexrest/cardstack-mcp-probe/` |
| Root protected-resource metadata | HTTP404 at `/.well-known/oauth-protected-resource` |
| Authorization-server metadata | HTTP404 at `/.well-known/oauth-authorization-server` |
| Org OIDC discovery | HTTP200 at `/.well-known/openid-configuration` |
| Alternate OIDC path | HTTP404 at `/services/oauth2/.well-known/openid-configuration` |

Live OIDC identifies the org origin as issuer, publishes auth/token/register
endpoints, and advertises S256 and token methods `client_secret_post`,
`client_secret_basic`, `private_key_jwt`, `tls_client_auth`. CIMD and
response-issuer support flags were absent. OIDC is **not** protected-resource
metadata. ChatGPT's observed discovery/manual settings succeeded despite that
missing document; no general cross-client compatibility is implied.

The probe class has one profile-owned class-access grant; ordinary Cardstack-user
probe access is unproved. The echo handler performs no CRM record queries/writes
or callouts; its fixed StaticResource query only retrieves synthetic UI. Renderer
and interpreter audits were not repeated.

An initial manual SOAP/direct HTTP attempt used `sf org display`'s **redacted
placeholder**, including its verbose output. Those failures are invalid credential
probes, not Salesforce API/JWT-limit evidence. They are labeled invalid privately.
No real CLI token was extracted or printed; CLI-managed HTTP200 is the valid API
proof. Complete global metadata was not retrieved through SOAP.

## Supported requirements versus observed compatibility

OpenAI documents protected-resource and authorization discovery, S256, resource
binding, and predefined clients/DCR/CIMD. Its custom-server guide permits supplied
static credentials. The current web UI additionally offered manual endpoints and
successfully discovered org OIDC. That observed client-specific path is the proof
here; it does not establish fully compliant public discovery or production OAuth
behavior. [Authentication](https://developers.openai.com/plugins/build/auth),
[Add custom MCP server](https://developers.openai.com/api/docs/guides/custom-mcp-server).

Claude documents 401-triggered sign-in, exact-resource metadata and origin/path
fallback, OIDC or RFC8414 issuer discovery, S256, predefined client identity and its
hosted callback. Its troubleshooting page describes discovery failure falling
back to `/authorize` on the MCP origin and a nonexistent sign-in page. That fits
this failure, but the actual redirect path was not captured; it remains a
hypothesis. Do not prescribe auth/hosting changes before tracing the boundary.
[Claude authentication](https://claude.com/docs/connectors/building/authentication),
[Claude troubleshooting](https://claude.com/docs/connectors/building/troubleshooting).

Salesforce documents public OIDC discovery, exact callback matching, multiple
newline-separated callbacks, PKCE, optional web-server/refresh secrets, refresh
rotation, and JWT access tokens. DCR requires an initial access token; a published
registration URL alone does not prove automatic registration support. These
support the ECA components used here; current setup and actual-client results are
separate evidence. [OIDC](https://help.salesforce.com/s/articleView?id=xcloud.remoteaccess_using_openid_discovery_endpoint.htm&language=en_US&type=5),
[ECA OAuth settings](https://help.salesforce.com/s/articleView?id=xcloud.configure_external_client_app_oauth_settings.htm&language=en_US&type=5),
[DCR](https://help.salesforce.com/s/articleView?id=xcloud.remoteaccess_oidc_dynamic_client_reg_flow_ca.htm&language=en_US&type=5),
[ECA creation](https://help.salesforce.com/s/articleView?id=sf.create_a_local_external_client_app.htm&language=en_US&type=5),
[ECA JWT](https://help.salesforce.com/s/articleView?id=sf.jwt_eca_configuration.htm&language=en_US&type=5).

Salesforce's client recipes cover Hosted MCP at `api.salesforce.com`, not arbitrary
Apex ingress. Their suggested ChatGPT secret is reconciled here with the more
specific optional-secret ECA documentation and verified org policy. OpenAI
documents server metadata Refresh but no saved predefined client-ID edit path was
established; the observed Manage UI only edited names/descriptions. The user
approved recreating two unconnected probe descriptors through the documented
creation flow. [Salesforce Claude](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/claude.html),
[Salesforce ChatGPT](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/chatgpt.html),
[OpenAI connect/test](https://developers.openai.com/plugins/deploy/connect-chatgpt).

Primary article bodies were fetched and checked; initial Salesforce Help shell
responses were rejected until targeted retrieval exposed the actual articles.

## Preservation, rollback, and remaining work

The user approved a temporary exact ChatGPT callback append to the beta ECA.
After the existing-grant warning, the controller denied consent and restored the
original Salesforce-success and Claude callbacks. Save success and JWT/PKCE/
rotation ON were verified. Original callback values and safe settings/screenshots
are private. No beta connector, package, JWT toggle, or CRM record was removed.

The user approved creating the isolated ECA; its created settings were verified
in Setup and independently through API67. Keep that app/connection for dependent
proof. If later discarded, revoke only its probe grants, remove probe connectors,
then delete the isolated ECA; verify beta callbacks/security state afterward.
Do not revoke existing beta grants or introduce a guest/token-proxy fallback.

Task 1 was accepted: ChatGPT authentication/tool discovery passed; Claude
authentication explicitly failed. Task 2 was subsequently accepted after scoped
independent review. Task 3 was accepted within its limited delivery-proof scope:
ChatGPT live HTML/bridge readiness, exact typed echo including empty text, reload
and account reconnect passed. Claude downstream phases, live bridge-error handling
and ordinary/denied-user compatibility remain unavailable. Keep both clients and
investigate a documented Salesforce-only Claude route; HOLD migration/cutover.
Governed Account preview/confirmation/save/read-back belongs to a later, separately
approved Account spec and plan, not Task 3. Connection and tool listing alone do
not establish live delivery or governed-write proof.

## Credential exposure incident

After Salesforce user MFA while viewing the **beta ECA**, CUA's automatic initial
snapshot unexpectedly displayed its consumer key and secret in tool output. The
controller acknowledged this immediately and closed the page. No values were
copied into reports, private evidence records, or Git; no secret was used for
these clients. The isolated public ID was later loaded privately and its credential
tab closed. Rotation/revocation of beta credentials needs a deliberate user-owned
decision because the beta shares that ECA. Report sanitation does not erase the
prior tool-output exposure.

Private receipts/configuration remain outside Git. Only this sanitized document
is committed; product source, package/runtime bindings and the installed beta
were not changed by the Task 1 agent.

## Subsequent delivery proof

Task 2's disposable source/API contract was independently accepted. Fresh Task 3
ChatGPT web evidence now shows actual in-chat HTML, bridge readiness, exact typed
synthetic echo including empty text, and bounded reload/account-reconnect recovery.
Raw initialize/version/refresh events are unavailable. Actual-host bridge rejection
was not safely demonstrated. Claude remains failed at the observed Task 1
authentication boundary; its downstream phases are unavailable. Ordinary/denied
subjects remain unavailable. See the separate
[delivery matrix](MCP_APPS_DELIVERY_PROOF_2026-10-08.md) for phase evidence and final
preservation/cleanup status. No governed CRM preview/confirm/save/read-back was
attempted or established by this synthetic checkpoint.
