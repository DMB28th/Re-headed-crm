# Salesforce Setup — Cardstack

How to connect a Salesforce org to Cardstack and let reps use live, permission-scoped
record cards inside their chat app. For deeper reference and troubleshooting, see
[salesforce-oauth-support.md](./salesforce-oauth-support.md).

## How it works (two OAuth lanes)

Cardstack uses the Salesforce **OAuth 2.0 web-server (authorization-code) flow** with two
separate authorizations:

- **Admin OAuth** — one authorization for the workspace. Used for setup only: reading object
  metadata, generating starter cards, and configuring layouts.
- **User OAuth** — each rep authorizes their own Salesforce account. All runtime reads, list
  views, and writes run **as that user**, so Salesforce FLS, sharing, and ownership apply
  automatically. This is the security story — Cardstack only ever narrows what the user can
  already see.

There is **one CRM per workspace**. Disconnect Salesforce (or a mock/HubSpot portal) before
switching.

## Sandbox vs production

Most of setup is identical — a sandbox is just a separate org. The deltas:

| | Sandbox | Production |
|---|---|---|
| **Login URL** (Studio's Salesforce card) | `https://test.salesforce.com`, or your sandbox My Domain `https://<domain>--<sbx>.sandbox.my.salesforce.com` | `https://login.salesforce.com`, or `https://<domain>.my.salesforce.com` |
| **Connected App** | Create/authorize it **in the sandbox org**; its Consumer Key/Secret differ from prod | The prod org's app + its own key/secret |
| **Callback URLs** | **Same** — they point at your Studio, not Salesforce | Same |
| **Instance returned** | `*.sandbox.my.salesforce.com` | `*.my.salesforce.com` |

All of these hosts pass Cardstack's login-URL allowlist (`test.salesforce.com`,
`login.salesforce.com`, or any `*.my.salesforce.com` — which covers sandbox My Domains).
Connections → Scope coverage shows a **Sandbox / PRODUCTION** badge so you can confirm which
org you're on. One CRM per workspace, so moving sandbox → production means disconnect, reconnect
with the production login URL + the prod org's app credentials, and re-authorize users (layouts
and lists are kept).

## Prerequisites

- A Salesforce org where you can create a **Connected App** or **External Client App**, and
  admin access to assign it to users.
- A deployed Cardstack **Studio** (`apps/studio`) and **MCP server** (`apps/mcp-server`), both
  reading the **same config store** (same `DATABASE_URL`, or the same `CARDSTACK_CONFIG_PATH`
  file volume for a single-box demo). Deploy both from the same revision.
- Currently supported Salesforce objects: **Opportunity, Contact, Account**.

## Step 1 — Create the Salesforce app

Create one Connected App (or External Client App) with these OAuth settings:

**Flow**
- Enable OAuth.
- Enable **Authorization Code and Credentials Flow** (the web-server flow).
- Do **not** enable **Client Credentials Flow** — Cardstack does not use a run-as integration
  user on the primary path.

**Scopes**
- Manage user data via APIs (`api`)
- Perform requests at any time (`refresh_token`, `offline_access`) — required, or no refresh
  token is issued.

**Callback URLs** (add both — admin and user lanes have separate callbacks):

```
https://<studio-origin>/api/connections/salesforce/oauth/callback
https://<studio-origin>/api/user-connections/salesforce/oauth/callback
```

Both callbacks are **Studio** routes — use your **Studio** origin, *not* the MCP server's. On
Railway that is the Studio service domain (e.g.
`https://cardstackstudio-production.up.railway.app`). The MCP server domain is only for the
chat-host connector (`/mcp`) and is never a callback. `<studio-origin>` must match
`CARDSTACK_STUDIO_URL` (see Step 2), since that is what builds the `redirect_uri`.

For local development:

```
http://localhost:3002/api/connections/salesforce/oauth/callback
http://localhost:3002/api/user-connections/salesforce/oauth/callback
```

**Security**
- **Require Secret for Web Server Flow** — can stay **on**. Cardstack is a confidential
  server-side client and sends the consumer secret at token exchange.
- **Require Proof Key for Code Exchange (PKCE)** — can stay **on**. Cardstack sends an S256
  `code_challenge` on the authorize request and the matching `code_verifier` at token exchange
  (confidential client + PKCE). No Salesforce Support case is needed to relax this.
- **Refresh Token Rotation** — optional; if on, validate a reconnect before locking controls.

**Permitted Users**
- Development: *All users may self-authorize* is easiest.
- Production: *Admin approved users are pre-authorized* is fine — just assign the app to the
  relevant profiles / permission sets.

## Step 2 — Configure Cardstack environment

Set these on **both** services (Studio and MCP), from the same revision:

```text
DATABASE_URL=<shared postgres url>          # or a shared CARDSTACK_CONFIG_PATH volume for demo
CARDSTACK_STUDIO_URL=https://<studio-origin>
CARDSTACK_ENCRYPTION_KEY=<32-byte key>      # openssl rand -base64 32 — SAME value on both services
MCP_SHARED_SECRET=<secret from the MCP host>
STUDIO_SHARED_SECRET=<secret for mutating Studio API calls>
CORS_ORIGINS=https://<allowed-chat-host-origin>
```

Notes:
- **`CARDSTACK_ENCRYPTION_KEY`** encrypts CRM tokens and the app secret at rest (AES-256-GCM).
  It must be **identical on both services** — a mismatch makes stored credentials unreadable.
  If unset, credentials are stored unencrypted (acceptable only for local/demo). Rotating the
  key makes already-stored credentials unreadable, so re-authorize after a rotation.
- In **production**, `MCP_SHARED_SECRET` and `STUDIO_SHARED_SECRET` are **required** — the MCP
  server refuses to serve `/mcp` and Studio refuses mutating API calls when they are unset
  (fail-closed). Locally they may be unset.
- `CARDSTACK_STUDIO_URL` is used to build the OAuth `redirect_uri` and the "connect your
  Salesforce" link the MCP server returns, so it must match the deployed Studio origin.

## Step 3 — Connect the admin

1. Open Studio → **Connections**.
2. In the Salesforce card, enter:
   - **Login URL** — `https://login.salesforce.com` (production), `https://test.salesforce.com`
     (sandbox), or your **My Domain** URL (`https://<domain>.my.salesforce.com`). Other hosts
     are rejected.
   - **Consumer Key** and **Consumer Secret** from the Salesforce app.
3. Click **Authorize admin** and complete the Salesforce login. Studio stores the admin OAuth
   credentials server-side (never returned to the browser or a widget).

## Step 4 — Build and publish cards

1. Generate starter cards for **Opportunity**, **Contact**, and/or **Account**.
2. Adjust fields/sections in the layout builder as needed.
3. **Publish** the layouts reps should see. (Nothing reaches reps until published.)

## Step 5 — Connect the rep (per user)

1. On the same Connections page, click **Connect my Salesforce user**.
2. Complete Salesforce OAuth as the product user.
3. Runtime cards, list views, and writes now use that user's own Salesforce authorization.

Until a rep connects, Cardstack's Salesforce tools return a "connect your Salesforce account"
message pointing at Studio → Connections — the admin authorization is **not** used as a runtime
fallback for a rep's records.

## Step 6 — Connect the MCP host

Point the chat host's MCP connector at:

```
https://<mcp-origin>/mcp
```

Pass `MCP_SHARED_SECRET` as `Authorization: Bearer <secret>` (or the `x-cardstack-key` header).

## Step 7 — Smoke test

1. In Studio, confirm the Salesforce admin card shows **connected**.
2. Publish an Opportunity card.
3. Authorize your own Salesforce user.
4. From the chat host, ask for a Salesforce record or list view.
5. Confirm the card says it is connected **as the user** (not an integration user), and that a
   write produces a confirmation diff before it commits.
6. As a different Cardstack user who has **not** authorized Salesforce, the same request should
   prompt that user to connect their account.

## Troubleshooting (quick)

- **`redirect_uri_mismatch`** — the callback URL in Salesforce must exactly match the Studio
  origin and path; add both the admin and user callbacks; localhost and the deployed origin are
  different URLs.
- **No refresh token returned** — add `refresh_token`/`offline_access`, then re-authorize.
- **PKCE / code-challenge error** — deploy the current (PKCE-enabled) build, then re-authorize;
  a pending authorization started before the deploy carries no verifier.
- **Login URL rejected** — it must be `login.salesforce.com`, `test.salesforce.com`, or your
  `*.my.salesforce.com` My Domain.
- **User authorized but MCP still asks them to connect** — confirm the MCP request carries a
  stable Cardstack user identity, both services share the same store, and `CARDSTACK_STUDIO_URL`
  is correct.
- **Rep sees fewer records than expected** — expected: runtime is scoped to that user's
  Salesforce sharing/FLS/ownership.

See [salesforce-oauth-support.md](./salesforce-oauth-support.md) for the full troubleshooting
matrix and deployment checklist.
