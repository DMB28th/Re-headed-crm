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

**A second admin comes from the People page**, not an invite: any admin can
promote a member who has already signed in. A workspace can never reach zero
admins — the demotion is refused server-side, because Studio is the only place
admin can be granted and a headless workspace could never be configured again.

**Known consequence, accepted:** the first signer may be a rep who added the
connector before anyone opened Studio, and they then hold admin over layouts and
write permissions. The lockout half is fixed — Studio names the admins so the
buyer knows who to ask, and that person has a working promote button — but the
escalation half is a deliberate product decision, not an oversight.

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

## Authorization

**Studio is for admins. A member holds no Studio session at all** — not a
read-only one. That is enforced at one place, `resolveStudioSession` in
`apps/studio/lib/auth.ts`, which refuses to resolve a non-admin session. Every
page and route reaches identity through it, so a session that fails there has no
`tenantId` to query with and a new route cannot forget to ask. There is
deliberately no `requireAdmin()` helper: that would be one call site per route to
remember, which is the failure mode this design avoids.

The one exception is `/me/connection`, where a rep manages their **own** CRM
authorization. It calls `getSelfServiceIdentity`, a separate entry point that
passes an explicit `allowMembers` option. Members are never admitted by default,
and every exception is findable by grepping that one name.

**The MCP lane gates on membership, not role.** Members are the expected
population there; the question is whether you still belong to the workspace, not
what authority you hold in it.

## Sessions

The cookie is `<sessionId>.<issuedAt>.<hmac>`. Two layers on purpose:

- `middleware.ts` runs on the **edge** runtime and gates every route on the HMAC
  alone — no database round trip on static assets.
- The authoritative identity (account, workspace, role) lives in the KV, keyed by
  that session id, and is re-read on every server request.

**The HMAC alone is not proof of a live session** — it proves the id wasn't
forged. Anything acting on a user's behalf must resolve the KV record.

### What revocation actually does, per lane

This used to be stated once, for both lanes, and was true of neither:

| Change | Studio | MCP |
|---|---|---|
| Membership removed | next request | next tool call |
| Admin → member | next request | no effect (members use this lane) |
| Signed out | next request | n/a (no session) |
| Token revoked | n/a | the whole grant dies, not just that token |

Sessions expire two ways: **14 days absolute** (non-sliding — `issuedAt` is
inside the HMAC, so a cookie can never be extended) and **3 days idle**, tracked
by `lastSeenAt` on the KV record and refreshed at most once every 5 minutes.

## Environment

```text
CARDSTACK_SF_CLIENT_ID=<Cardstack-owned connected app consumer key>
CARDSTACK_SF_CLIENT_SECRET=<its consumer secret>
CARDSTACK_SESSION_SECRET=<random 32+ bytes — openssl rand -base64 32>
CARDSTACK_TRUSTED_CLIENT_ORIGINS=https://claude.ai,https://chatgpt.com
STUDIO_SHARED_SECRET=<temporary human access key for the migration fallback>
```

**`CARDSTACK_SESSION_SECRET` is the signing key.** `STUDIO_SHARED_SECRET` is
still *accepted for verification* so cookies signed before the real key was set
keep working, but once the real key exists every new cookie is bound to it. That
distinction matters: `STUDIO_SHARED_SECRET` is also the human-typed access key,
so anyone who ever saw it could otherwise forge a session cookie for any session
id. Drop it from the list once the migration window has passed. If neither is
set, sign-in fails closed and says so — it never falls back to a constant.

**`CARDSTACK_TRUSTED_CLIENT_ORIGINS`** is the comma-separated list of chat-host
origins that may complete `/authorize` without a consent screen. *Every*
registered `redirect_uri` of a client must be in it, matched on origin, never
prefix. Unset means nothing is first party — a deployment that forgets this
variable shows the consent screen rather than skipping it.

Optional:

- `CARDSTACK_SF_LOGIN_URL` — pin the Salesforce login host. **When unset, the
  MCP lane asks the rep** (Production or Sandbox) before bouncing them, because
  a sandbox user sent to `login.salesforce.com` is stranded on Salesforce's own
  page and never comes back. Set it to skip that question.
- `CARDSTACK_DEV_IDENTITY=1` — local development only, and only in a
  non-production build. Lets env vars name the caller so `pnpm dev` and the demo
  scripts work without a browser login. Never set it on a deployment.
- `CARDSTACK_TENANT_ID` — names the legacy single-tenant workspace for the
  access-key bridge and the legacy connected-app fallback. **Not a request
  default.**

`CARDSTACK_ALLOW_HEADER_IDENTITY` is **gone**. It re-enabled unverified header
identity in production, which is cross-tenant spoofing by design.

### The Cardstack-owned connected app

One connected app, owned by us, used for the **login lane only**. It exists to
break a chicken-and-egg: signing in is what creates the workspace, so there is
no workspace-scoped client id to authorize against yet.

Callback URLs to allowlist on it:

```text
https://<studio-origin>/api/auth/salesforce/callback
https://<mcp-origin>/oauth/salesforce/callback
```

Scopes are the same as the existing lanes. The authorize URL requests exactly
`api refresh_token` (`salesforce-adapter.ts`); Salesforce documents
`offline_access` as a synonym of `refresh_token`, so requesting both would be
redundant rather than broader. This file previously listed both, which read as a
requirement the code did not meet — the code is correct. PKCE (S256) is sent, so
"Require PKCE" can stay enabled.

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

**The bridge is self-retiring.** Once any admin of that workspace has a real
Salesforce identity, it returns 410 and says to sign in with Salesforce instead.
The migration it exists for is over at that point, and leaving it open would keep
a shared secret as a permanent second door.

The MCP sign-in lane also temporarily falls back to that legacy tenant's
encrypted admin connected app when the Cardstack-owned app variables are not
set. This keeps existing chat-host connections working while the shared app and
its callback URLs are rolled out; new workspaces still require the Cardstack app.
It is armed only when `CARDSTACK_TENANT_ID` explicitly names a legacy tenant.

**Before deploying the admin-only Studio gate**, run the zero-admin report:

```bash
pnpm --filter @cardstack/studio backfill:admins          # report only
pnpm --filter @cardstack/studio backfill:admins -- --apply
```

A workspace with no admin cannot be configured by anyone once the gate is live,
because Studio is the only place admin can be granted and Studio needs an admin
to let you in.

## Flows

**Studio.** `/login` → `/api/auth/salesforce/start` (PKCE + `state` staged in KV)
→ Salesforce → `/api/auth/salesforce/callback` → token exchange → identity →
`resolveSignIn` → session record + cookie → back to `next`.

**Chat host (MCP).** claude.ai registers dynamically → `/authorize` (asking
Production or Sandbox first, unless `CARDSTACK_SF_LOGIN_URL` is pinned) bounces
the rep through the *Cardstack* app → `/oauth/salesforce/callback` resolves their
org to a workspace and persists their per-user CRM connection → **an
unrecognized client stops here for consent** → our authorization code is minted
→ the token endpoint issues opaque bearer tokens (rotated on every refresh, with
reuse detection) → `requireBearerAuth` on `/mcp`, which re-reads the membership.

Consent runs *after* the Salesforce leg on purpose. Before it we do not know
whose browser this is, so the screen could only warn an anonymous visitor; after
it we can name the signer, their workspace, and the exact origin the token will
be sent to.

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
- `apps/studio/lib/studio-session.test.ts` — tampering, wrong secret, expiry,
  and the signing-key verify-list
- `apps/studio/lib/auth.test.ts` — the choke point: demotion, removal, idle
  expiry, and the `/me/connection` allowance
- `apps/studio/lib/membership-change.test.ts` — a workspace can never reach
  zero admins
- `apps/mcp-server/src/oauth-provider.test.ts` — consent for unrecognized
  clients, live membership resolution, refresh rotation and reuse detection
