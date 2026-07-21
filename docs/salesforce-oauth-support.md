# Salesforce OAuth Support Playbook

## Current Deployment Status

This repo has been updated to use two Salesforce OAuth lanes:

- Admin OAuth: workspace-level authorization for Studio setup, metadata reads, starter-card generation, and layout configuration.
- User OAuth: per-product-user authorization for runtime records, list views, and writes from MCP.

These changes are local until the branch is committed, pushed, and both Cardstack services are deployed. Deploy both `apps/studio` and `apps/mcp-server` together because MCP relies on the new per-user connection store APIs.

## What Changed

Cardstack no longer requires Salesforce Client Credentials Flow or a Run As integration user for the main Salesforce path. Salesforce access now follows the OAuth web-server authorization-code flow:

- The admin authorizes Salesforce once in Studio.
- Each user authorizes their own Salesforce account before using Salesforce-backed cards.
- MCP refuses Salesforce runtime tools until the current user has authorized Salesforce.
- Reads, list views, sharing, FLS, and writes happen as the actual Salesforce user.

Legacy client-credentials configs still load for compatibility, but support should guide new setups to OAuth.

## Salesforce App Requirements

Create one Salesforce Connected App or External Client App.

Required OAuth settings:

- Enable OAuth.
- Enable the web-server / authorization-code flow.
- Do not enable Client Credentials Flow for the primary Cardstack setup.
- OAuth scopes:
  - `Manage user data via APIs (api)`
  - `Perform requests at any time (refresh_token, offline_access)`
- Callback URLs:
  - `https://<studio-origin>/api/connections/salesforce/oauth/callback`
  - `https://<studio-origin>/api/user-connections/salesforce/oauth/callback`

For local development:

```text
http://localhost:3002/api/connections/salesforce/oauth/callback
http://localhost:3002/api/user-connections/salesforce/oauth/callback
```

Security settings:

- Require Secret for Web Server Flow can stay enabled. Cardstack is a server-side confidential client and sends the consumer secret during token exchange.
- Require Proof Key for Code Exchange (PKCE) can stay enabled. Cardstack now sends an S256 `code_challenge` on the authorize request and the matching `code_verifier` at token exchange, alongside the client secret (confidential client + PKCE). No Salesforce Support case is needed to relax this setting.
- Refresh token rotation is optional, but if enabled, validate reconnect behavior before locking Salesforce security controls.
- Do not lock security controls until a full admin auth and user auth test succeeds.

Permitted Users:

- Development: `All users can self-authorize` is easiest.
- Production: `Admin approved users are pre-authorized` is fine, but users/profiles/permission sets must be assigned to the app.

## Cardstack Setup

Run both apps locally:

```bash
pnpm --filter @cardstack/studio dev
pnpm --filter @cardstack/mcp-server dev
```

Open Studio:

```text
http://localhost:3002/connections
```

In the Salesforce card, enter:

- Login URL:
  - Production org: `https://login.salesforce.com`
  - Sandbox: `https://test.salesforce.com`
  - My Domain login URL is also acceptable.
- Consumer Key
- Consumer Secret

Click `Authorize admin`. Salesforce redirects back to the admin callback and Studio stores the admin OAuth credentials server-side.

After admin authorization:

1. Generate starter cards for `Opportunity`, `Contact`, and/or `Account`.
2. Publish the layouts users should see.
3. In the same Connections page, click `Connect my Salesforce user`.
4. Complete Salesforce OAuth as the product user.
5. Test MCP against `http://localhost:3001/mcp`.

## MCP Runtime Behavior

For Salesforce OAuth workspaces, MCP chooses auth in this order:

1. Resolve the Cardstack user from `x-cardstack-user-id`, `x-cardstack-user-email`, cookies, or env defaults.
2. Look up that user's Salesforce OAuth credentials for the tenant.
3. Use the user's Salesforce token for CRM calls.
4. If no user token exists, return a connect-your-Salesforce-account error.

This means admin OAuth is not used as a runtime fallback for user records.

## Deployment Checklist

Deploy both services from the same source revision:

- `apps/studio`
- `apps/mcp-server`

Both services must share the same config store:

- Preferred production: same `DATABASE_URL`.
- Single-box local/demo: same `CARDSTACK_CONFIG_PATH` volume.

Recommended production environment variables:

```text
DATABASE_URL=<shared postgres url>
CARDSTACK_STUDIO_URL=https://<studio-origin>
MCP_SHARED_SECRET=<secret passed by MCP host>
STUDIO_SHARED_SECRET=<secret for mutating Studio API calls>
CORS_ORIGINS=https://<allowed-chat-host-origin>
CARDSTACK_ENCRYPTION_KEY=<32-byte key, base64 or hex — openssl rand -base64 32>
```

`CARDSTACK_STUDIO_URL` matters because MCP includes the Salesforce user-connect URL in missing-auth errors.

`CARDSTACK_ENCRYPTION_KEY` encrypts CRM tokens/secrets at rest (AES-256-GCM). Set the SAME key on both `apps/studio` and `apps/mcp-server` — they share the store, so a mismatch makes stored credentials unreadable. If unset, credentials are stored unencrypted (acceptable only for local/demo). Existing plaintext rows keep working and are re-encrypted on their next write; rotating the key makes already-stored credentials unreadable, so re-authorize after a rotation.

After deploy, update the Salesforce app callback URLs from localhost to the deployed Studio origin.

## Smoke Test

1. Open deployed Studio `/connections`.
2. Authorize Salesforce admin OAuth.
3. Generate and publish an `Opportunity` card.
4. Authorize your own Salesforce user.
5. Connect MCP host to deployed `/mcp`.
6. Ask for a Salesforce record or list view.
7. Confirm the card says it is connected as the user, not an integration user.
8. Try the same MCP call as a different Cardstack user without OAuth; it should ask that user to connect Salesforce.

## Troubleshooting

`redirect_uri_mismatch`

- The callback URL in Salesforce must exactly match the Studio origin and path.
- Add both admin and user callback URLs.
- Local `http://localhost:3002` and production `https://...` are different URLs.

No refresh token returned

- Add `Perform requests at any time (refresh_token, offline_access)`.
- Re-authorize admin or user after changing scopes.

PKCE or code challenge error

- Cardstack sends PKCE (S256) on both OAuth lanes, so "Require PKCE" can stay enabled — no Support case needed.
- If you still see a code-challenge error, re-authorize after deploying the PKCE-enabled build; a stale pending authorization started before the deploy will not carry a verifier.
- The login URL must be a Salesforce domain (login.salesforce.com, test.salesforce.com, or your *.my.salesforce.com My Domain). Other hosts are rejected before the request leaves Cardstack.

User can authorize but MCP still asks them to connect

- Confirm the MCP request includes a stable Cardstack user identity header or cookie.
- Check `x-cardstack-user-id` / `x-cardstack-user-email`.
- Confirm Studio and MCP share the same `DATABASE_URL` or config file.
- Confirm `CARDSTACK_STUDIO_URL` points at the deployed Studio origin.

Admin connected, but objects fail to describe

- The admin Salesforce user needs object and field access for the setup objects.
- Start with `Opportunity`, `Contact`, and `Account`, which are the currently supported Salesforce objects.

User sees fewer records than expected

- That is expected if Salesforce sharing, role hierarchy, ownership, or FLS limits the user.
- Runtime is intentionally scoped to the user's Salesforce permissions.

Writes fail with Salesforce validation errors

- Cardstack surfaces Salesforce validation messages per field.
- Fix the record data or Salesforce validation rule requirement, then retry.

## References

- Salesforce describes the web-server flow as an authorization-code flow for external web apps integrating with Salesforce APIs: https://help.salesforce.com/s/articleView?id=xcloud.remoteaccess_oauth_web_server_flow.htm&type=5
- Salesforce Trailhead shows that callback URL and redirect URI must match, and that the authorization code is exchanged for an access token at the token endpoint: https://trailhead.salesforce.com/content/learn/projects/build-integrations-with-external-client-apps/implement-the-oauth-20-web-server-flow
