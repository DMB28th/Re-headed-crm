# Cardstack Accounts & Workspaces

How someone signs up for Cardstack, gets a workspace, and connects their own
Salesforce org. This is Cardstack's OWN identity — distinct from the CRM
credentials a workspace holds, which are covered in
[salesforce-oauth-support.md](./salesforce-oauth-support.md).

Full design and rationale for the model below:
[2026-08-10-self-serve-accounts-design.md](./superpowers/specs/2026-08-10-self-serve-accounts-design.md).
It supersedes the "Salesforce is the identity provider" model this file used
to describe — that model failed in production because sign-in was
structurally dependent on a Cardstack-owned Salesforce connected app existing,
and none did.

## The model

**Cardstack owns its own accounts.** Signing up is email + name + password —
no Salesforce round trip required. `POST /api/auth/signup` creates the
account AND its one owned workspace in the same step, mints a session, and
lands in Studio with a "verify your email" banner. There is no verification
wall before first use: the thing worth protecting (going live to reps) is
already gated behind connecting a real Salesforce org.

**A workspace is owned by one account, not by an org.** `workspaces.org_key`
is nullable now: a fresh workspace starts unconnected, and connecting a
Salesforce org at `/connections` IS the claim — it sets `org_key`, and the
existing unique constraint enforces "one org, one owner." A second account
that connects an already-claimed org gets refused with a clear message; its
connection is discarded, not queued or merged.

**Membership is the chat-lane access list, nothing more.** A rep signing in
from a chat host still gets an account row (no password — a runtime identity
for their CRM connection and audit attribution) and a `Membership` in the
workspace their Salesforce-verified org id resolves to. That membership grants
chat access. It grants nothing in Studio: Studio authority is
`workspace.ownerAccountId === account.id`, checked once, at the choke point
below. `role` on `Membership` is vestigial — `resolveSignIn` always writes
`"member"`; `admin` only still appears on rows written before this model and
is never read for authority.

**There is no invite system and no People page.** Collaboration was org-wide
promote/demote before; it is gone, not rebuilt read-only. When multi-user
workspaces return they will be invite-shaped, not auto-join-shaped. See
"What changed" below for the full deleted list.

**Ids.** Salesforce returns 15- or 18-character ids for the same entity
depending on the API, so org and user ids are still keyed on the lowercased
15-char prefix (`salesforceIdKey`). New workspace ids are `ws_<random>`
(`newWorkspaceId`); the legacy `sf_<15-char org id>` and `t_demo` ids remain
valid forever — nothing parses a tenant id, so a database that has never seen
a claim behaves exactly as before.

## What changed

| Layer | Before (Salesforce-as-IdP) | Now (self-serve accounts) |
|---|---|---|
| What creates an account | Signing in with Salesforce | Email signup, Salesforce signup, or a rep's first chat-host connection |
| What creates a workspace | The first Salesforce signer from an org | The owning account, at signup — before any CRM is connected |
| `workspaces.org_key` | `NOT NULL` — a workspace WAS an org | Nullable — connecting an org is a separate, later, exclusive claim |
| Studio authority | `Membership.role === "admin"` | `Workspace.ownerAccountId === Account.id` |
| Second admin | Promote from the People page | No second admin, no People page — ownership is singular |
| Rep sign-in with no workspace for their org | Created one; the rep became its admin | Refused with a typed error — see "Flows" below |

Before self-serve accounts, identity was self-asserted (`x-cardstack-user-id`
/ `x-cardstack-tenant-id` headers, unverified) — that failure mode was already
closed by the 2026-08-08 auth redesign and nothing here reopens it. Studio
identity is still a session cookie resolved server-side; headers are still
ignored.

**Deleted:** the People page, promote/demote and `membership-change.ts`, the
zero-admin invariant and its backfill script
(`backfill-workspace-admins.ts`/`backfill:admins`), first-signer-becomes-admin,
the "ask the admin by name" lockout messaging, `/me/connection` and
`getSelfServiceIdentity` (a rep can never hold a Studio session of any kind —
their re-auth path is the chat host's reconnect, which the re-auth card
deep-links), and the access-key bridge (`POST /api/session`; only `DELETE`,
sign-out, remains). The Studio Salesforce login routes
(`/api/auth/salesforce/start`, `/api/auth/salesforce/callback`) were NOT
deleted — they're repurposed for "Continue with Salesforce" (see "Flows").

## Tables

Still the same three additive tables; everything else stays keyed by the same
opaque `tenant_id`.

- `workspaces` — `id` (= tenantId), **nullable** `org_key` (unique when set —
  the exclusive-claim enforcement), config jsonb. The owning account id
  (`ownerAccountId`) lives in that jsonb, with a partial unique index
  (`workspaces_owner_uq`, `WHERE ownerAccountId IS NOT NULL`) so Postgres — not
  just application code — is what decides a concurrent double-submit.
- `accounts` — `id` (= the normalized user id that already keys
  `user_connections`), **nullable** `sf_user_key` (unique when set — email-only
  accounts have none), config jsonb. `email`, `passwordHash`
  (argon2id, `@node-rs/argon2`), `emailVerifiedAt`, `passwordChangedAt` all
  live in that jsonb; email lookup (`getAccountByEmail`) is a case-insensitive
  scan (`lower(config->>'email') = lower($1)`), not a database constraint.
- `memberships` — `(account_id, workspace_id)`, `role` kept for legacy rows
  but no longer load-bearing.

Sessions still have **no table**: they ride the existing `kv_entries` KV,
TTL'd, sealed at rest, shared across instances — same as verify/reset/pending-
link tokens (see "Flows").

## Authorization

**Studio authority is workspace ownership, not a role.** The choke point is
still one place, `resolveStudioSession` in `apps/studio/lib/auth.ts`, and every
page and route still reaches identity through it — but the check it runs
changed:

```ts
if (workspace.ownerAccountId) {
  if (workspace.ownerAccountId !== account.id) return null;
} else {
  // Legacy workspace the attach-workspace script hasn't stamped yet.
  const membership = await store.getMembership(record.accountId, record.workspaceId);
  if (membership?.role !== "admin") return null;
}
```

A member (a rep with no password, or anyone who is simply not the owner) has
no `tenantId` to query with — there is no read-only Studio and no exception
route. `/me/connection` and `getSelfServiceIdentity` are gone; there is
nothing left to grep for. A password reset invalidates every session minted
before it (see "Sessions"), checked at the same choke point.

**The MCP lane still gates on membership, not ownership.** Reps are the
expected population there; the question is whether you still belong to the
workspace, not whether you own it. `verifyAccessToken` re-reads the membership
on every call, unchanged from the 2026-08-08 redesign.

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
| Password reset (`passwordChangedAt`) | every prior session dies on next request | n/a — MCP tokens don't check this |

Sessions expire two ways: **14 days absolute** (non-sliding — `issuedAt` is
inside the HMAC, so a cookie can never be extended) and **3 days idle**, tracked
by `lastSeenAt` on the KV record and refreshed at most once every 5 minutes.

**A reset invalidates every other session without enumerating the KV.**
Setting a new password stamps `Account.passwordChangedAt`; `resolveStudioSession`
compares that timestamp to the session record's `createdAt` and refuses (and
deletes) any record minted before it. This rides the same read the ownership
check already does — no extra store round trip.

## Environment

```text
CARDSTACK_SF_CLIENT_ID=<Cardstack-owned connected app consumer key>
CARDSTACK_SF_CLIENT_SECRET=<its consumer secret>
CARDSTACK_SESSION_SECRET=<random 32+ bytes — openssl rand -base64 32>
CARDSTACK_TRUSTED_CLIENT_ORIGINS=https://claude.ai,https://chatgpt.com
RESEND_API_KEY=<Resend API key — optional>
CARDSTACK_EMAIL_FROM=<verified sender address — optional>
```

`RESEND_API_KEY` and `CARDSTACK_EMAIL_FROM` are **optional**: `sendMail`
(`apps/studio/lib/mail.ts`) calls Resend's plain HTTPS API when both are set,
and otherwise prints the verify/reset/claim link to stdout — the
credential-free dev loop keeps working, and a deployment can run without them
(operators read links from server logs).

**`STUDIO_SHARED_SECRET`** is not in the block above because it is temporary
and on a schedule, not a steady-state variable. It is still *accepted for
verification* so cookies signed before `CARDSTACK_SESSION_SECRET` was set keep
working, but every new cookie is signed with the real key once one exists.
It also used to be the human-typed access key, but that door
(`POST /api/session`) is gone — `STUDIO_SHARED_SECRET`'s only remaining job is
the verify-list entry. Per the 2026-08-08 migration's step 5, drop it from the
environment entirely once the oldest cookie signed with it has expired
(~2026-08-24, 14 days after `CARDSTACK_SESSION_SECRET` went live). Until then
it is dead weight, not a live door: nothing mints a new cookie with it and
nothing reachable still asks a human to type it.

**The login page never prints an env var name.** A misconfigured deployment
(no signing secret, no Cardstack connected app) says "Sign-in is unavailable
on this deployment" (every auth route returns this same generic 503/redirect)
or "Studio is locked because its session signing secret is not configured."
(`middleware.ts`), and logs specifics server-side only — this replaced the old
fallback of surfacing raw env var names on the page.

**`CARDSTACK_TRUSTED_CLIENT_ORIGINS`** is unchanged from the 2026-08-08
redesign: the comma-separated list of chat-host origins that may complete
`/authorize` without a consent screen. *Every* registered `redirect_uri` of a
client must be in it, matched on origin, never prefix. Unset means nothing is
first party.

Optional, unchanged from before:

- `CARDSTACK_SF_LOGIN_URL` — pin the Salesforce login host for the MCP lane
  (Production or Sandbox). Unset means the rep is asked.
- `CARDSTACK_DEV_IDENTITY=1` — local development only, and only in a
  non-production build (`NODE_ENV !== "production"` AND this flag). Lets env
  vars name the caller so `pnpm dev` and the demo scripts work without a
  browser login.
- `CARDSTACK_TENANT_ID` — names the legacy single-tenant workspace for
  `attach-workspace` and the MCP legacy connected-app fallback. **Not a
  request default.**

`CARDSTACK_ALLOW_HEADER_IDENTITY` remains gone (deleted in the 2026-08-08
redesign); this design does not reopen it.

### The Cardstack-owned connected app

Unchanged from the 2026-08-08 redesign. One connected app, owned by us, used
for the **login lane only** — `cardstackSalesforceLoginApp()`
(`CARDSTACK_SF_CLIENT_ID`/`CARDSTACK_SF_CLIENT_SECRET`). Both `/login` and
`/signup` render "Continue with Salesforce" only when it is configured
(`Boolean(cardstackSalesforceLoginApp())`), so the email lane never depends on
it — the button can only ever add a door, not block one.

Callback URLs to allowlist on it:

```text
https://<studio-origin>/api/auth/salesforce/callback
https://<mcp-origin>/oauth/salesforce/callback
```

Scopes, PKCE posture, and the BYO-connected-app escape hatch for runtime data
access are unchanged from the prior model — see the 2026-08-08 redesign spec
for that detail; nothing here touches it.

## Flows

**Email signup/sign-in.** `/signup` → `POST /api/auth/signup`
(`apps/studio/app/api/auth/signup/route.ts`) → `signup()`
(`apps/studio/lib/account-flows.ts`) creates the account + its owned workspace
in one step, mints a session via `mintStudioSession`
(`apps/studio/lib/session-mint.ts` — the ONE place a session record is
written), and issues a 24-hour verify token. A duplicate email with a password
is refused ("sign in instead"); a duplicate email with NO password (a rep
runtime identity, or a not-yet-claimed legacy account) does not mint a session
or set a password directly — it sends a claim email and the flow finishes at
`/reset`, which is verification-first proof of inbox ownership.
`/login` → `POST /api/auth/signin` does an argon2 verify against a dummy hash
when the account doesn't exist (`burnTimingForMissingAccount`), so timing
never leaks existence.

**Continue with Salesforce — a peer lane, not the chat-lane resolver.**
Rendered on `/login` and `/signup` below the email form, only when the
Cardstack connected app is configured. Flow: `/api/auth/salesforce/start`
(PKCE + `state` in KV, rate limiter kept) → Salesforce → `callback/route.ts`
→ `resolveSalesforceStudioLogin` (`apps/studio/lib/login-flow.ts`) resolves in
order:

1. **Salesforce user id matches an account** → `ensureOwnedWorkspace` (creates
   one if this is a rep's first Studio visit) → session minted. One click on
   every later Salesforce sign-in.
2. **No id match, email matches an existing account** → redirect to `/link`
   with a single-use, hashed, 10-minute continuation token
   (`PENDING_LINK_NS`). `POST /api/auth/link` verifies the account's
   **password**, then records the Salesforce user id and mints a session.
   Silent auto-link is refused by design — a Salesforce-asserted email is
   never proof of inbox ownership, because a Salesforce org admin can set it
   without the new inbox confirming anything. The POST is rate-limited like
   sign-in (it's a password check); a wrong guess still burns the token, so a
   stolen link is not an offline oracle.
3. **No match at all** → create the account from the Salesforce identity
   (email marked verified — it came from a real Salesforce login — no
   password, `salesforceUserId` recorded), owned workspace created, session
   minted. Signup here never claims an org; connecting one stays the separate
   step below.

This resolver is Studio-only and does not call `resolveSignIn` — that
function is the MCP lane's alone now (next paragraph).

**Connecting (claiming) an org.** `/connections` →
`/api/connections/salesforce/oauth/start` → Salesforce → `.../oauth/callback`
→ `store.claimOrg(tenantId, orgId)` sets `org_key` on the signed-in owner's
workspace; a conflict (another workspace already holds that org) is refused,
the connection discarded, and the user told which org and that it is already
connected elsewhere. Disconnecting (`DELETE /api/connections`) calls
`releaseOrg`, clearing `org_key` but leaving rep memberships and per-user
connections intact, so reconnecting the same org restores service without
re-onboarding reps.

**Chat host (MCP) — find-or-refuse.** claude.ai registers dynamically →
`/authorize` → Salesforce → `/oauth/salesforce/callback` →
`resolveSignIn` (`packages/config-store/src/sign-in.ts`) calls
`getWorkspaceByOrgId`; no match throws `UnclaimedOrgError`
("No Cardstack workspace is connected to this Salesforce org yet.", plus the
org's display name when one is known), instead of creating one.
`renderSignInFailure` (`apps/mcp-server/src/main.ts`) catches it and renders a
typed page instead of a raw error: "This Salesforce org isn't connected to
Cardstack yet" as the heading, that same error message, then "Ask whoever
administers Cardstack for your team to connect the org in Studio — or create
your own Cardstack account and connect it yourself." A match resolves the account (keeping the
original id across profile changes) and writes a `Membership` with
`role: "member"` — always, even for the workspace's owner, whose Studio
authority comes from `ownerAccountId`, not this row. Everything after that —
consent for unrecognized clients, opaque bearer tokens with refresh rotation
and reuse detection, live membership re-resolution on every call — is
unchanged from the 2026-08-08 redesign.

## Migration for the existing deployment

Small, because production is small: exactly one legacy workspace (`t_demo`).

1. **Deploy** the new auth routes and the ownership choke point. The old
   login lanes are gone in this same deploy (the access-key `POST` bridge no
   longer exists to keep alongside anything) — `resolveStudioSession` falls
   back to admin-membership only for a workspace with no `ownerAccountId` yet,
   so `t_demo`'s existing session (if any) survives the deploy.
2. **Sign up normally in production Studio**, by email, using the operator's
   own address. If that email matches the legacy bridged account, signup
   takes the passwordless-claim path (§3 above) and sets a password on the
   **existing** account — preserving the account id that already keys
   `user_connections` and audit rows.
3. **Run `attach-workspace`** (`apps/studio/scripts/attach-workspace.ts`,
   `pnpm --filter @cardstack/studio attach:workspace`) to stamp that account as
   `t_demo`'s owner and copy the org claim from the tenant's stored admin
   connection, so future Salesforce signers from that org land in `t_demo`
   instead of forking a new workspace:

   ```bash
   pnpm --filter @cardstack/studio attach:workspace -- --workspace t_demo --account <email>
   pnpm --filter @cardstack/studio attach:workspace -- --workspace t_demo --account <email> --apply
   ```

   Report-first: without `--apply` nothing is written. `--apply` performs the
   writes (`setWorkspaceOwner`, then `claimOrg` if the stored connection
   implies an org) and re-reads the final row. **Idempotent** —
   `setWorkspaceOwner` overwrites with the same value and `claimOrg` is a
   no-op for the current holder, so re-running after a successful `--apply` is
   a safe no-op. **On an org-claim conflict** (another workspace already holds
   that org — `claim.ok === false`), the script has already written the owner
   stamp by the time it reports the conflict and exits non-zero: the write is
   partial, not rolled back. That is still safe to leave as-is or to re-run
   after resolving the conflict elsewhere — `setWorkspaceOwner` is idempotent
   on its own, and a second `--apply` retries only the claim.
4. **~2026-08-24** (the existing clock from the 2026-08-08 redesign, unchanged
   by this design): drop `STUDIO_SHARED_SECRET` from the environment
   entirely, once the oldest cookie signed with it has expired.

New env: `RESEND_API_KEY`, `CARDSTACK_EMAIL_FROM` (both optional — see
"Environment"). Rollback: the schema changes are additive (nullable columns,
one partial unique index); the route swap is a deploy; `attach-workspace`
writes two fields and is reversible by hand
(`setWorkspaceOwner`/`releaseOrg`).

## Tests

- `packages/config-store/src/sign-in.test.ts` — `resolveSignIn` find-or-refuse
  (`UnclaimedOrgError` on no claim), account id stability across profile
  changes, the owner's chat-lane sign-in converging on their real account via
  the recorded Salesforce user id, and that a signer into an empty claimed
  workspace is never promoted — always `member`.
- `packages/config-store/src/tenant-isolation.test.ts` — **the security one**:
  two accounts claiming two orgs get two workspaces with no layout,
  connection, or user token crossing between them; the 15/18-char org-id
  equivalence; a claim race decided by the unique constraint (loser gets the
  typed refusal, writes nothing); re-claim after release moves the ROUTE, not
  the DATA (spec §7).
- `packages/config-store/src/identity-model.test.ts` — the store-level
  identity primitives (`newWorkspaceId`, email lookup case-insensitivity,
  `getWorkspaceByOwner`, `claimOrg`'s exclusivity and 15/18-char equivalence)
  against the in-memory store.
- `apps/studio/lib/account-flows.test.ts` — signup, signin, password reset,
  email verification, and the passwordless-claim rule: signup with a rep's
  email must not mint a session or write a password without the verify step.
- `apps/studio/lib/login-flow.test.ts` — the three-case
  `resolveSalesforceStudioLogin` resolution, and `safeNext`'s open-redirect
  rejections.
- `apps/studio/lib/password.test.ts` — argon2 round-trip, malformed-hash
  handling, and the dummy-hash timing burn for a missing account.
- `apps/studio/lib/auth-tokens.test.ts` — single-use, hashed-at-rest, TTL'd
  tokens (verify/reset/pending-link all share this primitive).
- `apps/studio/lib/auth.test.ts` — the choke point: ownership replaces the
  role gate, the legacy-workspace admin-membership fallback, idle/absolute
  expiry, and `passwordChangedAt` session invalidation.
- `apps/studio/lib/studio-session.test.ts` — cookie tampering, wrong secret,
  expiry, and the signing-key verify-list (`CARDSTACK_SESSION_SECRET` first,
  `STUDIO_SHARED_SECRET` verify-only).
- `apps/studio/lib/request-guard.test.ts` — the rate limiter and the
  same-origin check.
- `packages/crm-adapters/src/salesforce/identity.test.ts` — identity-URL
  parsing rejects malformed and non-org ids.
- `apps/mcp-server/src/oauth-provider.test.ts` — consent for unrecognized
  clients, live membership resolution, refresh rotation and reuse detection —
  unchanged from the 2026-08-08 redesign.

**Deleted:** `membership-change.test.ts` with the module it tested.
**Untouched:** golden-path demos (`CARDSTACK_DEV_IDENTITY` lane preserved),
confirmation-provenance tests (hard rule 8 has no interaction with this
design).
