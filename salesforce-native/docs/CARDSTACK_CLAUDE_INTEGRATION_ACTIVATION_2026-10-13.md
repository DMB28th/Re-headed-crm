# Prepared Claude integration activation

Status: approved and applied October 13. Target: owned persistent `cardstack-spike2`,
API67. Actual Claude Opportunity and configurable Account screen acceptance passed.

Personal Chrome shows the existing **Cardstack Claude UI Delivery Probe** connection
expired. Its URL is the legacy `/cardstack-auth-site-probe/v1/ui-mcp` route. The current
governed engine uses `/cardstack/v1/claude/mcp`; reconnecting the old entry alone cannot
make that route compatible. Preserve the old entry and the working Cardstack
Salesforce/HXL and scratch QA connections.

The approved change applied is:

1. Activate existing Site **CardstackAuthDiscoveryProbe**, retaining its registered
   domain, `cardstackauthprobe` prefix and constant home page.
2. Enable only **CardstackMcpIngress** Apex access and **CardstackSiteAuthProbeHome**
   page access for **Cardstack Auth Discovery Probe Profile**. Current native object
   permission query found zero guest object grants. Add no guest CRM/private-object
   or renderer grants. The ingress permits public discovery/challenge and rejects
   guest tools/resources before native execution.
3. Enable the existing dedicated runtime app **Cardstack Claude UI Delivery Probe**.
   Set its named-user JWT issuance OFF for the previously proven Sites opaque-token
   route. Preserve its public client ID, exact Claude callback, API/refresh scopes,
   required PKCE and refresh rotation. This is separate from deployment SFAPP,
   which stays unchanged with JWT ON.
4. Enroll the existing Site and runtime app in native Claude setup using optimistic
   revision 0, existing callback evidence and enabled intent.
5. Add **Cardstack Integration Claude** in the user's personal Claude account at:
   `https://orgfarm-e768adf3fa-dev-ed.develop.my.salesforce-sites.com/cardstackauthprobe/services/apexrest/cardstack/v1/claude/mcp`.
   Authorize it with the existing dedicated runtime client and connected Salesforce
   actor. The expired legacy entry is retained; no working connection is recreated.

The private four-file companion artifact changes Site active, runtime JWT issuance and the
two guest class/page access flags. Its ZIP SHA256 is
`95bf4390777f76c78e2195dbf61806a5bbac8f9a7503436292e51626faeef62e`. The app-enable flag
was applied through native `ExtlClntAppConfigurablePolicies` metadata after the Tooling
API correctly rejected updating its read-only policy entity. The exact additional two-file
artifact changes only `isEnabled` from false to true; ZIP SHA256
`73c06432ed882d241b6c8adf354596bc4d8b5b4838413c85097c414fce261e8b`. Native Claude
enrollment is revision 1 and enabled. Both metadata deployments succeeded with default
rollback. Original native metadata and private setup receipts are preserved for
restoration.

Independent native readback verifies the active Site, runtime opaque issuance, retained
public client/callback/PKCE/rotation, enabled app/OAuth plugin and deployment SFAPP JWT
ON. Public discovery returns the exact current resource and issuer. Anonymous and
fabricated-bearer resource/tool requests each return 401. Native effective
executable-access readback also found exactly the ingress class and constant home page,
with no additional guest Apex/page grants. Guest object grants and additional permission
sets remain zero. Personal Claude consent completed with the existing actor; actual
Opportunity and configurable Account edit/review/Confirm/receipt/Refresh passed. Visible
decimal validation and cancellation passed; independent native values, one audit per save
and matching native actor were verified. A native test or old scratch-org screen does not
establish this environment's Claude behavior.

The user explicitly approved the prepared activation, including the public discovery
endpoint, dedicated runtime app, native enrollment and new personal Claude connection.
This does not authorize unrelated access changes. Working connections and the expired
legacy entry remain intact.

Salesforce documents app/plugin enablement through the configurable policies metadata
file: [Enable or Disable External Client App
Plugins](https://help.salesforce.com/s/articleView?id=sf.meta_enable_external_client_app_plugins.htm&language=en_US&type=5).