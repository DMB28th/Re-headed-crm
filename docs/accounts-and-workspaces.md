# Cardstack Accounts & Workspaces

How someone signs up for Cardstack, gets a workspace, and connects their own
Salesforce org. This is Cardstack's OWN identity — distinct from the CRM
credentials a workspace holds, which are covered in
[salesforce-oauth-support.md](./salesforce-oauth-support.md).

## The model

**Salesforce is the identity provider.** There are no Cardstack passwords to
store, leak, or reset (PLAN.md non-goal: "no password flows"). Signing in *is*
what creates your workspace the first time.

**A workspace IS a Salesforce org.** `workspaces.org_key` is unique, so:

- the first person from an org creates the workspace and becomes its **admin**;
- everyone else from that org **auto-joins** it as a **member**.

That falls out of the design's "one CRM per workspace" rule and means there is
no invite system to build or secure for v1. It also means two people from the
same org converge on one workspace whether they arrive through Studio or
through a chat host.

**Ids.** Salesforce returns 15- or 18-character ids for the same entity
depending on the API, so org and user ids are keyed on the lowercased 15-char
prefix. The workspace id (the `tenantId` every other table is keyed by) is
`sf_<15-char org id>`.

## What changed

Before this, identity was **self-asserted**: `x-cardstack-user-id` and
`x-cardstack-tenant-id` request headers were read straight into a user context
with no verification, and the workspace was a process-wide
`CARDSTACK_TENANT_ID` env var. One deployment served exactly one customer, and
anyone who could reach the app could act as any user in any workspace.

| Layer | Before | Now |
|---|---|---|
| Studio identity | unverified headers / one shared access key | session cookie → session record → account + workspace |
| Studio workspace | `CARDSTACK_TENANT_ID` env var | resolved per request from the session |
| MCP identity | OAuth token, but pinned to one tenant | OAuth token; workspace resolved from the signer's Salesforce org |
| MCP fallback headers | trusted everywhere | ignored in production unless `CARDSTACK_ALLOW_HEADER_IDENTITY=1` |

## Tables

Three additive tables. Everything else stays keyed by the same opaque
`tenant_id`, so existing rows are untouched.

- `workspaces` — `id` (= tenantId), unique `org_key`, config jsonb
- `accounts` — `id` (= the normalized user id that already keys
  `user_connections`), unique `sf_user_key`, config jsonb
- `memberships` — `(account_id, workspace_id)`, `role` in `admin | member`

Sessions deliberately have **no table**: they ride the existing `kv_entries` KV,
which is already TTL'd, sealed at rest, and shared across instances.

## Sessions

The cookie is `<sessionId>.<issuedAt>.<hmac>`. Two layers on purpose:

- `middleware.ts` runs on the **edge** runtime and gates every route on the HMAC
  alone — no database round trip on static assets.
- The authoritative identity (account, workspace, role) lives in the KV, keyed by
  that session id, and is re-read on every server request. Signing out and
  membership changes therefore take effect immediately rather than when a cookie
  happens to expire.

**The HMAC alone is not proof of a live session** — it proves the id wasn't
forged. Anything acting on a user's behalf must resolve the KV record.

## Environment

```text
CARDSTACK_SF_CLIENT_ID=<Cardstack-owned connected app consumer key>
CARDSTACK_SF_CLIENT_SECRET=<its consumer secret>
CARDSTACK_SESSION_SECRET=<random 32+ bytes — openssl rand -base64 32>
STUDIO_SHARED_SECRET=<temporary human access key for the migration fallback>
```

`CARDSTACK_SESSION_SECRET` falls back to `STUDIO_SHARED_SECRET` so existing
deployments keep working. If neither is set, sign-in fails closed and says so —
it never falls back to a constant, because a predictable signing key would let
anyone mint a session for any account.

Optional: `CARDSTACK_SF_LOGIN_URL` (defaults to `https://login.salesforce.com`;
the login page also offers a sandbox link), and
`CARDSTACK_ALLOW_HEADER_IDENTITY=1` to re-enable header identity in production
(don't — it is cross-tenant spoofing by design).

### The Cardstack-owned connected app

One connected app, owned by us, used for the **login lane only**. It exists to
break a chicken-and-egg: signing in is what creates the workspace, so there is
no workspace-scoped client id to authorize against yet.

Callback URLs to allowlist on it:

```text
https://<studio-origin>/api/auth/salesforce/callback
https://<mcp-origin>/oauth/salesforce/callback
```

Scopes are the same as the existing lanes: `api` and
`refresh_token, offline_access`. PKCE (S256) is sent, so "Require PKCE" can stay
enabled.

A workspace can still bring its own connected app for runtime data access (the
BYO escape hatch). Because a per-user token can only be refreshed with the
secret of the app that *minted* it, the runtime matches a stored `clientId`
against both the Cardstack login app and the workspace's admin connection and
carries whichever secret matches.

## Migration for the existing deployment

The access key still works: `POST /api/session` bridges it to a real account +
workspace, creating the identity rows once (idempotently) for the workspace at
`CARDSTACK_TENANT_ID`. When the stored admin connection is Salesforce, its
verified org id is reused so the legacy tenant does not fork into an empty
`sf_*` workspace later. It is collapsed behind "Use a workspace access key" on
the login page. Nothing is locked out mid-migration.

The MCP sign-in lane also temporarily falls back to that legacy tenant's
encrypted admin connected app when the Cardstack-owned app variables are not
set. This keeps existing chat-host connections working while the shared app and
its callback URLs are rolled out; new workspaces still require the Cardstack app.

## Flows

**Studio.** `/login` → `/api/auth/salesforce/start` (PKCE + `state` staged in KV)
→ Salesforce → `/api/auth/salesforce/callback` → token exchange → identity →
`resolveSignIn` → session record + cookie → back to `next`.

**Chat host (MCP).** claude.ai registers dynamically → `/authorize` bounces the
rep through the *Cardstack* app → `/oauth/salesforce/callback` resolves their org
to a workspace, persists their per-user CRM connection, and mints our
authorization code → the token endpoint issues opaque bearer tokens →
`requireBearerAuth` on `/mcp`.

Both lanes call the **same** `resolveSignIn`, so they converge on one workspace
and one account id regardless of which the person hits first.

## Tests

- `packages/config-store/src/sign-in.test.ts` — first signer is admin, same-org
  auto-join, account id stability across profile changes
- `packages/config-store/src/tenant-isolation.test.ts` — **the security one**:
  two orgs get separate workspaces and no layout, connection, or user token
  crosses between them (PLAN.md §Security)
- `packages/crm-adapters/src/salesforce/identity.test.ts` — identity-URL parsing
  rejects malformed and non-org ids
- `apps/studio/lib/studio-session.test.ts` — tampering, wrong secret, expiry
