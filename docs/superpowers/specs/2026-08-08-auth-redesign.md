# Cardstack authentication redesign

Date: 2026-08-08
Status: design agreed in brainstorming; awaiting spec review
Findings: [2026-08-08-auth-review.md](./2026-08-08-auth-review.md)
Base: `claude/actions-editor` @ `8ebfea1`

## Problem

Cardstack has two populations who authenticate and one identity core they share.
The core is right; the lanes on top of it are not separated, and the roles it
stores are not enforced.

Part 1 found six exploitable issues, seven hardening items, and four seamlessness
failures. This document is the design that closes them. It does not restate the
findings — read them first; every fix below is labelled with the finding it
closes.

## Decisions taken

Four forks were decided by the product owner during brainstorming. They are
recorded here because the rest of the design follows from them, and because one
of them accepts a known risk.

| Fork | Decision |
|---|---|
| What `member` means in Studio | **No Studio at all.** Not read-only. |
| Rep signs in, org has no workspace | **Create it; they become admin.** Unchanged from today. |
| How a workspace gets a second admin | **An admin promotes from a people page.** |
| Consent on `/authorize` | **Unrecognized clients only.** Known chat hosts stay one-click. |

**Accepted risk, stated plainly.** Keeping first-signer-becomes-admin on the rep
lane means finding A2's escalation half survives by decision: a rep who is the
first person from their org to add the connector holds org-wide authority over
layouts, field denylists, `writeEnabled`, and the action row. The redesign does
not remove that. It does three things to make it survivable, all of which depend
on the people page existing:

1. The grant stops being silent (§3.4).
2. The lockout half is removed — the buyer is told *who* to ask, by name, and
   that person has a working promote button (§2.4, §3.4).
3. The grant becomes reversible — an admin can demote, and demotion now takes
   effect on the next request instead of in fourteen days (§2.2).

Without the people page this decision is not safe. It is a hard dependency, not
a nice-to-have, and it is why the people page is Task 4 rather than Task 12.

---

## 1. The principal model

**One account, a role per workspace — unchanged. Two genuinely distinct
credential types — mostly unchanged, made real.**

Keeping one account is not inertia. `resolveSignIn` converging both lanes on one
account id is what makes "a workspace IS a Salesforce org" work, and unique
`org_key` is load-bearing for the whole tenancy model (a stated constraint).
Forking into per-lane principals would mean two identities per human, two
membership tables, and a reconciliation problem at exactly the point the current
design has none.

What changes is that the two credentials stop behaving differently under
revocation:

| | Studio | MCP |
|---|---|---|
| Credential | signed session cookie → KV session record | opaque bearer → KV token record |
| Resolves to | account + workspace + role, **re-read per request** | account + workspace, **re-read per request** (new) |
| Grants the other lane | no | no |
| Who may hold one | admins only (new) | anyone with a membership |

**A rep never holds a Studio session.** Enforced at the choke point, not at the
door — see §2.2.

**An admin's Studio session grants no MCP access.** An admin who wants to use
cards in chat runs `/authorize` from their chat host like everyone else, and
gets a bearer token that knows nothing about their Studio session. This is
already true and is worth keeping true: the two credentials have different
lifetimes, different revocation stories, and different threat models, and a
bridge between them would be a bridge an attacker can walk in either direction.

---

## 2. Lane 1 — Studio (admins)

### 2.1 Sign-in

Unchanged in shape: `/login` → `/api/auth/salesforce/start` (PKCE + `state` in
KV) → Salesforce → callback → `resolveSignIn` → session. Three fixes.

**Open redirect (A6).** `safeNext` gets two changes, belt and braces:

```ts
// Reject anything whose second character can start an authority component.
// "//evil" and "/\evil" and "/\/evil" all resolve to a foreign origin, because
// WHATWG URL treats "\" as "/" for special schemes.
if (!candidate.startsWith("/") || /^[/\\]/.test(candidate.slice(1))) return "/";
```

and, at the two redirect sites, a post-resolution origin assertion: build the
`URL`, compare `.origin` against `studioOrigin(...)`, fall back to `/` on
mismatch. The regex is the fix; the assertion is what makes the next encoding
trick a non-event.

**Unthrottled access-key guessing (A3).** `POST /api/session` and
`GET /api/auth/salesforce/start` get a fixed-window limiter, keyed on IP, sharing
one small module with the MCP server's existing shape (`main.ts:180-195`) but
living in Studio. `/api/session` additionally logs every failure to the audit
log — a brute force against the access key should be visible, and today it
leaves no trace at all.

**Access key is no longer a signing key (A3).** `sessionSigningSecret` stops
falling back to `STUDIO_SHARED_SECRET`. See §5 for how the live deployment gets
from here to there without logging everyone out.

### 2.2 Authorization — one choke point, not a helper

Finding A5 is that the role check lives in a route handler and nothing behind it
enforces anything. The instinct is a `requireAdmin()` helper called from every
route. That is the wrong shape: it is 26 call sites, each of which is one
copy-paste from being missed, and it is exactly the failure mode the finding
describes.

Because members hold no Studio session at all, there is a single choke point that
already exists and is already on every path:

```ts
// apps/studio/lib/auth.ts — resolveSessionId
if (!account || !workspace || !membership) return null;
if (membership.role !== "admin") return null;   // <- the whole fix
return { account, workspace, role: membership.role };
```

Every page, every route handler, and every server component reaches identity
through `getStudioIdentity` → `resolveSessionId` or `getUserContext` →
`getStudioIdentity`. Middleware still gates on the HMAC for the cheap edge
rejection; this is the authoritative gate. Adding a route cannot bypass it,
because a route with no identity has no `tenantId` to query with.

Three consequences fall out for free:

- **Demotion takes effect on the next request**, because membership is already
  re-read there. The claim at `studio-session.ts:16-17` and
  `docs/accounts-and-workspaces.md:63-66` becomes true instead of aspirational.
- The door check at `callback/route.ts:73-78` stays, purely for the error
  message — it is the only place that can say something useful (§2.4).
- `POST /api/session` stops hardcoding `role: "admin"` and starts reading the
  membership it just wrote, so the bridge cannot mint an authority the store
  disagrees with.

**Why not read-only Studio.** It was offered and declined. Recording the reason:
read-only would make the missing authorization layer the primary control and
require a mutation audit of every route and page — a much larger change with a
much larger chance of a missed spot, in service of a surface no one has asked
for. If members ever need to see something, §3.4's self-serve page is the place
to put it.

### 2.3 Session lifetime (C4)

Add an idle timeout alongside the existing 14-day absolute cap. The absolute cap
stays where it is and stays non-sliding — `issuedAt` inside the HMAC is what
makes it impossible to extend a cookie indefinitely, and that property is worth
more than the convenience of never logging out.

Idle expiry rides the KV record, not the cookie: `StudioSessionRecord` gains
`lastSeenAt`, refreshed by `resolveSessionId` at most once every few minutes
(a write on every request would be a write on every request). A record older than
the idle window resolves to null. Both windows are constants in one place.

This is the shape that works with the existing KV: no new table, no new cookie
format, no re-signing.

### 2.4 The lockout message (A2, mitigation)

`callback/route.ts:73-78` currently ends a non-admin's journey with "Ask an
admin to grant access." With no promotion mechanism, that was a dead end. With
one, it can be a path — so it must name the destination:

> You've joined **Acme Corp**, but Studio is for workspace admins.
> Ask **Dana Whitfield** (dana@acme.example) to add you on the People page.

The admin list comes from `listMembershipsForWorkspace` + `getAccount`, which
already exist. This is the difference between the accepted risk in A2 being
survivable and not.

### 2.5 The people page (A2 dependency, self-signup §4.4)

A new admin-only Studio page listing every membership in the workspace, with
promote and demote. Constraints:

- **A workspace can never reach zero admins.** Demoting the last admin is
  refused server-side, not just hidden in the UI.
- **An admin cannot demote themselves if they are the last one** — same rule,
  stated separately because it is the one people hit.
- Every promotion and demotion writes an audit entry. Role changes are exactly
  the kind of thing that needs to be answerable six months later.
- No invites, no email, no new token type. Membership rows already exist for
  everyone who has ever signed in through either lane, which is precisely the
  population an admin needs to choose from.

---

## 3. Lane 2 — MCP (reps)

### 3.1 Consent for unrecognized clients (A1)

**Placement: after the Salesforce callback, before minting our authorization
code.** Not at `/authorize`. This is the load-bearing detail.

At `/authorize` we do not know who the user is, so an interstitial there can only
say "some client wants access" to an anonymous browser. After the Salesforce leg
we know exactly who signed in, which workspace they resolved to, and where the
code is about to be sent. The screen can therefore say the one thing that stops
A1:

> You're signing in as **Priya Raman** (priya@acme.example) — Acme Corp.
> **Notes Helper** is asking for access to your Salesforce records through
> Cardstack.
> Tokens will be sent to **https://evil.example/cb**.
> [ Allow ]   [ Cancel ]

An attacker cannot route around it: `completeSalesforceCallback` is the only path
to an authorization code, and the code is minted on the far side of the consent
POST.

**Recognizing a client.** A client is first-party when every one of its
registered `redirect_uris` has an origin in `CARDSTACK_TRUSTED_CLIENT_ORIGINS`
(comma-separated, e.g. `https://claude.ai,https://chatgpt.com`). Every URI, not
any — a client that registers one blessed URI and one attacker-controlled URI is
not first-party. Unset means "no client is first-party", so a deployment that
forgets to configure it fails toward the consent screen rather than away from it.

**Consent is per (account, client), remembered.** Stored in KV with the same TTL
as the refresh token, so a rep re-authorizing the same host does not see the
screen twice; a *new* client is a new decision every time.

**CSRF on the consent POST.** The rendered form carries a signed, single-use
continuation token bound to the pending record — the same `signState` primitive
already used for interview state. No cookie is involved, so there is nothing for
a cross-site POST to ride on.

**Cancel is a real outcome.** It deletes the pending record and redirects the
client with `error=access_denied`, per RFC 6749 §4.1.2.1.

### 3.2 Tokens resolve identity live (A4)

`StoredUser` stops being the identity and becomes a cache. The token record
carries `accountId` + `workspaceId`; `verifyAccessToken` resolves the membership
on every call and throws `InvalidTokenError` when it is gone:

```ts
const membership = await store.getMembership(stored.accountId, stored.workspaceId);
if (!membership) throw new InvalidTokenError("Your access to this workspace was removed.");
```

This is one KV/DB read per `/mcp` request, on a path that already does two
(`getConnection`, `getUserConnection`). Removing a membership now cuts MCP access
on the next tool call instead of up to 30 days later, and the docs' revocation
claim becomes true of both lanes.

Note what this deliberately does **not** do: it does not check `role`. Members
are the expected population on this lane. The gate is membership, not authority.

### 3.3 Refresh token rotation (B5)

`mintTokens` rotates: issue a new refresh token, delete the old one, in that
order. A presented-but-unknown refresh token whose value was recently rotated is
treated as reuse — revoke the whole family for that (account, client) pair and
force a fresh `/authorize`.

**This concerns our own opaque bearer tokens only.** It is not a change to
Salesforce refresh behavior, and it must not become one. Nothing in this design
alters when, how, or with which secret a Salesforce refresh token is exchanged;
the reuse-detection hazard on the Cardstack-owned connected app is untouched
because no code path in this design reads, refreshes, or persists a Salesforce
refresh token that did not already do so. `CARDSTACK_DEV_SF_ORG` keeps bypassing
the stored connection entirely, and `readSalesforceCliToken` output still never
reaches a config store.

The 30-day non-extension found in B5 becomes a stated decision rather than an
accident: rotation extends the window on use, with a 90-day absolute cap, so an
active rep re-authorizes quarterly and an inactive one falls off at 30 days.

### 3.4 Seamlessness

**The re-auth card (C1).** The `unauthorized` error payload gains a
`reauth: { kind: "user" | "admin", url?: string }` discriminator, set server-side
from the same branch that already knows which connection is missing
(`main.ts:260-301`). The widget renders the two cases differently:

- `kind: "user"` — the rep's own grant died. Copy names the actual fix:
  *"Reconnect Cardstack in your chat app's connector settings."* The button stops
  pretending to reconnect anything; it either deep-links to `/authorize` where
  the host supports it or sends a followup that says the right thing.
- `kind: "admin"` — the workspace's admin connection died. Copy names the admin
  (same lookup as §2.4) and the link goes to Studio, where that person can
  actually act.

Today's card sends a rep to a page they are locked out of, to ask a person who
cannot fix it. Both halves are wrong; both are fixed by knowing which case it is.

**The self-serve page (C1).** One authenticated Studio route that members *may*
reach — `/me/connection` — showing their own connection status and a button to
re-run their own user OAuth. It is the only exception to §2.2's "no Studio at
all", and it is scoped to the signed-in account's own connection record: no
layouts, no permissions, no other users. Implemented as an explicit allowlist in
`resolveSessionId`'s caller rather than a hole in `resolveSessionId` itself.

**Sandbox on the rep lane (C2).** `/authorize` accepts no custom parameters and
the SDK gives no passthrough, so the choice cannot live in the URL. It goes on
the consent-or-login interstitial instead: when the pending record has no login
host yet, the MCP server renders a two-button page — *Production* /
*Sandbox* — before bouncing to Salesforce. First-party clients skip consent but
still see this when `CARDSTACK_SF_LOGIN_URL` is unset, which is the only honest
default: guessing wrong strands the rep with no control.

**Naming the grant (A2 mitigation).** When `resolveSignIn` creates a workspace
and grants admin, the rep's chat host says so on their first card:
*"You're the first person from Acme Corp to use Cardstack, so you're its admin.
Open Studio to design cards or add other admins."* A grant of org-wide authority
should never be silent. An audit entry is written at the same time.

**First-use redirect count (C3).** Unchanged, deliberately. Four redirects plus
one Salesforce approval, all driven by the chat host, is already fine; the
consent screen adds one page for unrecognized clients only. The friction that
matters for reps is C1 and C2.

---

## 4. Self-signup

A form of it already exists: signing in *is* what creates the workspace. What is
missing is everything around the edges of that sentence.

### 4.1 A rep whose org has no workspace

Creates it, becomes admin — decided, unchanged, mitigated per §3.4 and §2.5.

### 4.2 Someone who cannot authorize a connected app

The common real-world blocker, and today it surfaces as a raw Salesforce error
string in a `<h3>` (`main.ts:163-171`) or a query param on `/login`.

Salesforce refuses with a recognizable error when the org requires admin approval
for connected apps (`OAUTH_APPROVAL_ERROR_GENERIC`, or a login-flow block). The
design catches those specific cases and replaces them with copy that tells the
person what to hand their Salesforce admin: the connected app's name, its
consumer key, and the one setting to change (*Manage → Permitted Users → All
users may self-authorize*, or pre-authorize a profile). Everything needed for
that message is already in `cardstackSalesforceLoginApp()`.

This is not a workaround — it is not our decision to make — but "here is exactly
what to ask for" is the difference between a stalled signup and a one-message
Slack to the SF admin.

### 4.3 Trials and unconnected workspaces

Already possible and already unhandled. A workspace exists the moment someone
signs in; the CRM connection is a separate record and starts absent. So an
"unconnected workspace" is a state the store can already be in, and today Studio
treats it as an error condition rather than the first screen of onboarding.

The design makes it a first-class state: a workspace with no connection shows the
connect flow as its home, and the MCP lane returns a typed, actionable error
rather than an adapter failure. No trial timer, no billing state, no new table —
"unconnected" is the trial.

### 4.4 A second admin

The people page, §2.5. No invites.

### 4.5 Org keys, sandboxes, and multiple instances

**Collisions are not the risk.** `workspaceIdForOrg` keys on the lowercased
15-char prefix of a Salesforce org id, which is globally unique; two orgs cannot
collide. The 15/18-char normalization is correct and stays.

**The real problem is that a sandbox is a different org id.** An admin who
configures cards against their sandbox and then signs in against production lands
in a brand-new, empty workspace with no explanation — it looks like data loss.
Likewise an enterprise with several production instances gets several unrelated
workspaces, which is arguably right but is never *said*.

Two changes, both small:

- **Detect and explain.** `PortalInfo.isSandbox` already exists. When a signer's
  new workspace is a sandbox whose production counterpart is unknown — or the
  reverse — the workspace header says which instance it is, and the empty state
  says "This is a different Salesforce org from *Acme Corp (sandbox)*. Cards do
  not carry across orgs."
- **Do not link them.** Copying config between sandbox and production is a
  sync feature with a conflict model, not a login feature. Out of scope, named
  here so nobody assumes the header implies it.

**What this design does not do:** it does not touch "a workspace IS a Salesforce
org". Every option that would help here — one workspace spanning sandbox and
production, or a workspace that outlives its org — breaks unique `org_key`, and
therefore breaks auto-join, `resolveSignIn`'s convergence, and the tenant key
every other table hangs off. That is a much bigger change than it looks, and
nothing found in part 1 requires it.

---

## 5. Migration path for the live deployment

The deployment has live users and live tokens. Nothing below locks anyone out
mid-migration; each step is independently deployable and reversible, and the
order matters.

**Step 1 — Set `CARDSTACK_SESSION_SECRET`, keep verifying with both.**
`sessionSigningSecret` becomes a *list*: sign with the first, verify against any.
`STUDIO_SHARED_SECRET` stays in the verify list only. Existing cookies keep
working; new cookies are signed with the real key. No one is logged out.

**Step 2 — Deploy the choke-point role check (§2.2) and the people page (§2.5)
together.** They must ship in one release. The check alone would lock out any
workspace whose admin row is wrong, with no way to fix it. Before enabling,
run a read-only report over `memberships` for workspaces with zero admins, and
seed one from the earliest membership.

**Step 3 — Deploy consent (§3.1) with `CARDSTACK_TRUSTED_CLIENT_ORIGINS` set to
the hosts already in use.** Existing bearer tokens are untouched — consent gates
`/authorize`, not `/mcp`. Reps already connected notice nothing.

**Step 4 — Deploy live membership resolution (§3.2) and rotation (§3.3).**
Rotation must tolerate the tokens issued before it: a refresh token with no
family record is rotated normally on first use rather than treated as reuse.
Getting this backwards would revoke every live rep on deploy day.

**Step 5 — Drop `STUDIO_SHARED_SECRET` from the verify list**, once the oldest
possible cookie signed with it has expired (14 days after step 1). This is the
step that closes A3, and it is the only one with a mandatory waiting period.

**Step 6 — Retire the bridges** (§6), once the legacy workspace has at least one
real Salesforce-signed admin. Verified by query, not by assumption.

**Rollback.** Steps 1, 3, 4, 5 are pure deploys. Step 2 is the only one with a
data component (the zero-admin backfill), and it is additive — rolling back the
code leaves the seeded memberships in place, which is harmless.

**The Salesforce refresh hazard is untouched by every step above.** No step
reads, refreshes, rotates, or persists a Salesforce refresh token. Step 4's
rotation is exclusively about Cardstack's own opaque bearer tokens. A local run
still uses `CARDSTACK_DEV_SF_ORG` and still never touches the deployed
connection's stored token.

---

## 6. Bypass verdicts

| Bypass | Verdict | What breaks | Mitigation |
|---|---|---|---|
| `devUserContext` (`studio/lib/auth.ts:117-143`) | **Narrow** | Deleting breaks `pnpm dev`, `dev:sf`, all five demo scripts, and `seed-from-salesforce.ts` — none have a browser login | Require an explicit `CARDSTACK_DEV_IDENTITY=1` **in addition to** `NODE_ENV !== "production"`, and stop reading headers and cookies. Env vars only, so no *request* can drive it even locally |
| `CARDSTACK_ALLOW_HEADER_IDENTITY=1` (`mcp-server/auth.ts:25-28`) | **Delete** | Nothing. No code sets it; the docs say never to | Delete the flag and the production branch it guards. Header identity survives only under the same `CARDSTACK_DEV_IDENTITY` gate |
| `STUDIO_SHARED_SECRET` as signing fallback (`studio-session.ts:50`) | **Delete** | Every live session, if deleted without the dual-verify window | §5 steps 1 and 5 |
| `POST /api/session` bridge | **Narrow, then delete** | The legacy deployment's only login, until a Salesforce admin exists there | Rate-limit it, audit-log every attempt, stop hardcoding `role: "admin"`, and refuse once the target workspace has a Salesforce-signed admin. Delete at §5 step 6 |
| `CARDSTACK_TENANT_ID` | **Narrow** | Nothing, for the two uses being removed | Remove it as a *request default* from `mcp-server/auth.ts:53` and `studio/lib/auth.ts:131` — CLAUDE.md:47 already says it is not one. Keep it as the legacy bridge's workspace id only |
| MCP legacy connected-app fallback (`oauth-provider.ts:149-182`) | **Narrow, then delete** | Existing chat-host connections, until `CARDSTACK_SF_CLIENT_ID` is deployed everywhere | `main.ts:127` currently defaults `legacyTenantId` to `DEMO_TENANT_ID`, arming the fallback on **every** deployment. Arm it only when `CARDSTACK_TENANT_ID` is explicitly set. Delete at §5 step 6 |

The pattern: nothing that exists for local development gets deleted, because the
credential-free dev loop and the five demo scripts are load-bearing for the
project's own velocity. Everything that exists for *production* convenience gets
deleted, on a schedule, with the thing that replaces it deployed first.

---

## 7. Deliberately not changing

Each of these was considered and rejected. Listed so the plan is not re-opened
mid-implementation.

**"A workspace IS a Salesforce org."** Load-bearing for tenancy; nothing in part 1
requires changing it; §4.5 explains why the sandbox problem does not either.

**One account per human, role per workspace.** §1. Splitting into per-lane
principals costs a reconciliation problem the current design does not have.

**No password flows.** PLAN.md non-goal, and nothing found needs an exception.
Every gap that looked like it might — the non-Salesforce-admin case (§4.2), the
second-admin case (§4.4), the trial case (§4.3) — is solved without one. There is
no argument to make here, so none is made.

**PKCE handling on both lanes.** Verified correct against the shipped SDK. In
particular `exchangeAuthorizationCode` ignoring its `_codeVerifier` argument is
correct and must not be "fixed".

**The two-layer session design** (edge HMAC + authoritative KV record). It is the
right shape; A5's fix strengthens the KV layer rather than replacing either.

**Absolute session expiry semantics.** `issuedAt` inside the HMAC, no sliding
renewal. §2.3 adds an idle timeout beside it rather than replacing it.

**Confirmation provenance** (`confirm-token.ts`). Untouched. Hard rule 8 holds
throughout: no change here lets confirmation become a caller-supplied claim, and
A1's fix removes the only way found to defeat it — becoming the wrong actor.

**Studio's CSRF posture beyond a defensive Origin check.** B2 is
defense-in-depth; `SameSite=Lax` genuinely blocks the attack today. An `Origin`
check on mutating routes is cheap and goes in; a token-based CSRF scheme is not
justified by anything found.

**The stateless `/mcp` request model.** §3.2 adds one store read per request to a
path that already does two. It does not add process state, and the server stays
stateless per PLAN.md.

**`CARDSTACK_DEV_SF_ORG` and the local-dev Salesforce path.** Untouched, on
purpose. It is the mechanism that keeps a local run from revoking the deployed
grant family, and every part of this design routes around it rather than through
it.

---

## 8. Risks accepted

1. **A rep can still hold org-wide admin (A2).** Decided. Mitigated by §2.4,
   §2.5, and §3.4; hard-dependent on the people page shipping in the same
   release as the choke-point check.
2. **Consent is skipped for first-party clients.** A compromise of a trusted
   host's registered redirect origin bypasses the A1 fix. Accepted: the
   alternative is a click on every rep's first connection, and a compromised
   claude.ai is a larger problem than this control.
3. **The people page has no invite.** Someone who has never signed in cannot be
   made an admin in advance. Accepted for v1 — they sign in once, are auto-joined
   as a member, and are promoted. One extra step, no new token type, no email
   delivery to secure.
4. **Idle timeout is approximate.** `lastSeenAt` is written at most once every
   few minutes, so the effective idle window is the configured one plus that
   granularity. Accepted; the alternative is a store write per request.
