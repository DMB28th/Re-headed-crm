# One-click Salesforce connection

Date: 2026-08-11
Status: design agreed in brainstorming; awaiting spec review
Extends: [2026-08-10-self-serve-accounts-design.md](./2026-08-10-self-serve-accounts-design.md)
§4 ("Connecting an org"), which named this direction but whose implementation
plan does not build it. Implemented as Tasks 16–17 appended to
[the self-serve accounts plan](../plans/2026-08-10-self-serve-accounts.md).

## Problem

Connecting a Salesforce org today requires the admin to create a Connected App
in their own org — copy two callback URLs, pick OAuth settings, wait for
propagation, paste Consumer Key/Secret back into Studio. That is the single
highest-friction step in onboarding, and it is unnecessary for most customers:
Cardstack already owns a connected app (`CARDSTACK_SF_CLIENT_ID/SECRET`, used
by the sign-in lane), and the runtime already knows how to refresh tokens
minted by it (client-id matching, per docs/accounts-and-workspaces.md).

The product owner's requirement: **one click preferred**; a proper how-to page
for whoever still needs the manual path.

## Decision

**One-click connect via the Cardstack-owned connected app becomes the primary
path.** The bring-your-own connected app form survives as the escape hatch —
self-hosted deployments and orgs that block third-party apps — and moves to a
dedicated guided setup page.

Approaches rejected during brainstorming:

- **Reusing the "Continue with Salesforce" sign-in grant** as the admin data
  connection (zero clicks). Conflates identity with data authorization,
  email-lane signups never hold such a grant, and the deliberate "connect"
  click is the org-claim moment in the accounts design — it must stay explicit.
- **Creating a connected app inside the customer org** via the Metadata API.
  Chicken-and-egg (needs a token before the app exists), fragile, and
  pointless once the shared app works.

## 1. Server side: the one-click lane

### Start

`POST /api/connections/salesforce/oauth/start` accepts a second body shape:

```jsonc
{ "app": "cardstack", "host": "production" | "sandbox" }
```

The existing `{ loginUrl, clientId, clientSecret }` shape stays for BYO.

In Cardstack mode the route resolves `cardstackSalesforceLoginApp()`; if the
deployment has none it returns a typed error — "This deployment has no
Cardstack Salesforce app configured — use your own connected app instead."
`host` maps to `login.salesforce.com` / `test.salesforce.com`; there is no
free-text login URL on this path (My-Domain URLs are a BYO-page concern; both
standard hosts redirect to the org's My Domain during login).

`pendingAuth` is staged exactly as today except it carries **no
`clientSecret`** — instead a marker `clientApp: "cardstack"`.

### Callback

One change: when `pendingAuth` carries `clientApp: "cardstack"` (no stored
secret), the exchange sources the secret from `cardstackSalesforceLoginApp()`
at call time, and refuses loudly if the env vars vanished mid-flow. The
persisted connection credentials keep the client id and the `clientApp`
marker but **never** the secret. Everything downstream — `validateConnection`,
`clearTenantConfig` on CRM switch, org-claiming (accounts plan Task 10) — is
untouched and shared with BYO.

### Secret sourcing, stated once

> Anywhere a Salesforce client secret is needed and the stored credentials
> don't carry one, match the stored `clientId` against
> `cardstackSalesforceLoginApp()` and use its secret. Prefer a stored secret
> when present. If neither exists, throw — never proceed secretless.

The runtime refresh path already does this matching for the login lane; this
design extends the same helper to the admin-connection exchange and the
per-user exchange/refresh. Rotating the Cardstack app's secret in env then
heals every one-click workspace at once — nothing per-tenant to migrate.

### Per-user lane

No shape changes. It already copies `clientId` from the admin connection and
sources the secret at exchange/refresh; with the rule above it works unchanged
when the admin connected via the Cardstack app. "Connect my Salesforce user"
was already one click.

### Ops prerequisite (one-time, Salesforce side)

Add both connections callbacks to the Cardstack connected app's allowlist,
alongside the existing auth/MCP ones:

```text
https://<studio-origin>/api/connections/salesforce/oauth/callback
https://<studio-origin>/api/user-connections/salesforce/oauth/callback
```

Connected-app edits take ~2–10 minutes to propagate on Salesforce's side.

## 2. UI: the Connections card and the setup page

### The Salesforce card (disconnected state)

- Title row as today ("Salesforce · disconnected").
- One line of copy: "Connect your Salesforce org. You'll approve Cardstack's
  access on Salesforce — nothing to install or configure."
- A **Production / Sandbox** segmented choice (default Production) — the only
  input.
- Primary button **Connect Salesforce** → posts `{ app: "cardstack", host }` →
  navigates to the returned authorize URL.
- Quiet text link below: "Can't use the Cardstack app? **Set up your own
  connected app →**" pointing at the setup page.

The pasted-credentials form, callback-URL block, and scopes block leave this
card entirely — they live on the setup page.

When the deployment has no Cardstack app, the card hides the button and
host choice and promotes the setup-page link to the primary action, with copy
saying this deployment uses a bring-your-own app. The page learns which case
it's in from a new `cardstackAppAvailable: boolean` on the existing
`GET /api/connections` response — the client never reads env vars (the login
page's conditional-render pattern).

### The setup page — `/connections/salesforce/setup`

A single scrolling page of numbered steps (not a multi-screen wizard — nothing
to persist between steps), in the Studio token language:

1. **Create the app** — where to click in Salesforce Setup (Connected App or
   External Client App), with the sandbox-vs-production note up front: create
   it *in the org you're connecting*.
2. **OAuth settings** — enable the web-server flow, the two scopes as
   copyable chips (`api`, `refresh_token/offline_access`), "Require PKCE" fine
   to leave on, both callback URLs computed from the real Studio origin with
   copy buttons.
3. **Collect credentials** — where Consumer Key/Secret live in the Salesforce
   UI, plus the "wait a few minutes after saving" warning.
4. **Authorize** — the existing login URL + key/secret form, ending in the
   same **Authorize admin** button. Success bounces through the shared
   callback and lands back on `/connections` connected.

Content is adapted from `docs/salesforce-setup.md` steps 1–2; the page is
self-sufficient (no links into the git repo). The doc stays canonical for deep
troubleshooting.

Connected state, disconnect, refresh, scope coverage, and starter-card
onboarding are unchanged.

**Design reference note (hard rule 6):** `/design` has no mockup for the setup
page or the reshaped Salesforce card. Both are invented in the Studio token
language (paper / surface / ink / accent) — the same caveat the auth screens
carry in the self-serve accounts spec §5. The PR must note this.

## 3. Errors, edge cases, migration

All failures land as the existing `?error=` banner on `/connections`:

- **Cardstack app unconfigured** but the button posted anyway → the typed
  message from §1, naming the setup page.
- **Env removed between start and callback** → "the deployment's Salesforce
  app changed mid-authorization — start again."
- **Org locked down** (admin-approved-users-only, or the admin denies):
  Salesforce's `error_description` passes through as today; the banner appends
  one hint — "If your org blocks third-party apps, set up your own connected
  app instead" — only when the failed attempt was the one-click path (the
  staged `clientApp` marker says which).
- **Org already claimed** by another account → Task 10's conflict message,
  unchanged; the claim lives in the shared callback so it applies identically
  to both paths.
- **Re-authorizing a live connection** across paths (BYO → one-click or the
  reverse) follows the existing non-downgrading rule: `pendingAuth` staged,
  live credentials kept until the new exchange succeeds. Whichever app minted
  the final token is the one recorded.

**Migration: none.** Existing BYO connections keep their stored secrets and
refresh exactly as today. The secret-matching rule only activates when stored
credentials lack a secret, which only one-click connections do.

## 4. Testing

- Start route: cardstack mode stages `pendingAuth` with the marker and no
  secret; refuses when the app is unconfigured; the BYO shape is unaffected.
- The secret-sourcing helper: matches on the Cardstack client id; prefers a
  stored secret when present; throws when neither exists (never silently
  secretless — the spirit of hard rule 8's "never degrade to unsigned").
- Callback: exchange succeeds from marker-only `pendingAuth`; persisted
  credentials contain no secret; the refresh path resolves the env secret.
- Per-user exchange and refresh under a Cardstack-app admin connection.
- `GET /api/connections` reports `cardstackAppAvailable` from env, not from
  stored state.

## 5. Plan integration

Appended to `docs/superpowers/plans/2026-08-10-self-serve-accounts.md`:

- **Task 16** — server lane: start-route cardstack mode, the secret-sourcing
  helper, callback + per-user exchange changes, `cardstackAppAvailable`.
- **Task 17** — UI: the reshaped Salesforce card and the
  `/connections/salesforce/setup` page.

Both ordered after Task 10, which they share the claim-bearing callback with.
Task 15's docs step gains a line: update `salesforce-setup.md` to lead with
the one-click path.
