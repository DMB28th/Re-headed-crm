# Self-serve Cardstack accounts

Date: 2026-08-10
Status: design agreed in brainstorming; awaiting spec review
Supersedes: the account model in [2026-08-08-auth-redesign.md](./2026-08-08-auth-redesign.md)
§7 ("a workspace IS a Salesforce org" — now changed) and PLAN.md's "no password
flows" non-goal (amended with a dated note as part of this work).

## Problem

Salesforce is currently Cardstack's identity provider: signing in with
Salesforce is what creates both your account and your workspace, and a
workspace IS a Salesforce org. That model failed in practice — production had
no Cardstack-owned connected app configured, so sign-in was structurally
impossible and the login page fell back to a shared access key while printing
env var names at the user.

The failure is structural, not operational: getting a Cardstack account should
never depend on a Salesforce connected app existing. Salesforce is the CRM a
workspace connects to, not the door to the product.

## Decisions taken

All decided by the product owner during brainstorming:

| Fork | Decision |
|---|---|
| Two accounts connect the same org | **Refused — an org is claimed exclusively by one account.** Keeps org→workspace routing unique so chat-hosted reps land on the owner's config. |
| "Sign in with Salesforce" on the login page | **Ships, sign-in only** (revised from "deferred" during spec review). Only signs into an account that already connected that Salesforce user and owns a workspace — never creates accounts, never auto-links by email. Rendered only when the Cardstack connected app is configured, so the dependency that failed in production can never block the email lane. See §3. |
| Email-lane credential | **Password + verification** (argon2id, verify-email link, reset flow, rate limiting). |
| Build approach | **Hand-rolled on the existing session machinery.** The shipped HMAC-cookie + KV-record session design, expiry semantics, and choke point survive byte-for-byte; sign-up/sign-in are new ways to *mint* a session, not a new session model. |
| Login page direction | **Split brand panel** (accepted via mockup: accent-colored brand half, form on white). |

**The hard condition, stated as an invariant:** no account can reach another
account's data, through either lane. See §7.

## 1. The identity model

### Account — the root identity

Created by email signup, not by Salesforce sign-in.

- `id` — unchanged derivation: `normalizeUserId(email)` frozen at creation.
  This already keys `user_connections` and audit rows, which is what makes the
  production migration a find, not a rewrite.
- `email` — required, unique case-insensitively. New lookup:
  `getAccountByEmail`.
- `passwordHash` — argon2id (`@node-rs/argon2`). Absent on rep runtime
  identities (see below).
- `emailVerifiedAt`, `passwordChangedAt` — see §3.
- `salesforceUserId` — stays, becomes optional. Set when this account connects
  an org (recording *which* Salesforce user did the connecting). Feeds the
  "Sign in with Salesforce" button and lets the owner's own chat-host sign-in converge
  on their real account instead of forking a second one.

### Workspace — decoupled from the org

- Created automatically at signup, one per account: `id` = `ws_<random>`,
  new unique `ownerAccountId`.
- `org_key` becomes **nullable**. A workspace starts unconnected; connecting a
  Salesforce org IS the claim — setting `org_key`, where the existing unique
  constraint enforces "one org, one owner." A second account connecting the
  same org hits the conflict and is refused with a clear message; its
  connection is discarded.
- `getWorkspaceByOrgId` keeps working unchanged — it is what routes chat-hosted
  reps by their Salesforce-verified org id.
- `tenantId` stays the same opaque key on every config table. Old ids
  (`t_demo`, any `sf_*`) remain valid forever; new workspaces get `ws_*` ids.
  The id scheme is cosmetic — nothing parses tenant ids.

### Membership — demoted to the chat-lane access list

A rep signing in from a chat host still gets an account row (no password — a
runtime identity for their CRM connection and audit attribution) and a
membership in the claimed workspace. `verifyAccessToken`'s live membership
re-read — and per-rep revocation — survive untouched. What membership no longer
does is grant Studio access: the Studio choke point stops reading `role` and
checks `workspace.ownerAccountId === account.id`. The `role` field becomes
vestigial (`member` is always written; `admin` is never read).

### Deleted

The People page, promote/demote and `membership-change.ts`, the zero-admin
invariant and its backfill script, first-signer-becomes-admin, the "ask the
admin by name" lockout messaging, `/me/connection` and `getSelfServiceIdentity`
(a rep can never hold a Studio session of any kind; their re-auth path is the
chat host's reconnect, which the re-auth card already deep-links), and — after
migration — the access-key bridge. The Studio Salesforce login routes
(`/api/auth/salesforce/*`) are NOT deleted: they are repurposed for the scoped
"Sign in with Salesforce" button (§3). Audit attribution is unchanged: every actor still has an
account id.

## 2. What explicitly survives from the shipped auth redesign

The 2026-08-08 redesign landed on `main` (PR #12) and is deployed. This design
reuses most of it:

**Survives verbatim:** the session machinery (HMAC cookie `<id>.<issuedAt>.<hmac>`,
KV record, 14-day absolute / 3-day idle, `lastSeenAt` throttling, edge-HMAC +
authoritative-KV two-layer split) and its tests; the choke-point pattern (one
gate in `resolveStudioSession`, no `requireAdmin()` helpers); the open-redirect
fix in `safeNext`; the rate-limiter module; the entire MCP OAuth provider —
`/authorize`, consent placed after the Salesforce leg, trusted client origins,
PKCE, opaque bearers with refresh rotation and reuse detection, live membership
resolution; the re-auth card's `user`/`admin` discriminator; identity-URL
parsing and its tests; unconnected-workspace-as-first-class-state; sandbox
detection; audit logging of auth events; confirmation provenance (hard rule 8 —
zero interaction with this design, no write path or signer changes).

**Dies:** everything in §1 "Deleted." The org-as-workspace governance layer was
the part built for a multi-admin org model this design removes.

**Changes in exactly one place on the MCP lane:** `resolveSignIn`'s
find-or-*create* becomes find-or-*refuse*. A rep whose org has no claim gets a
typed page — "No Cardstack workspace is connected to this Salesforce org yet;
sign up at Studio or ask whoever runs Cardstack for your org" — instead of
silently becoming the admin of an empty workspace. The hit case (an org whose
owner set Cardstack up) is byte-for-byte today's flow: Salesforce OAuth →
identity URL → org id → `getWorkspaceByOrgId` → published config, with the
rep's own user connection doing all data access, so records, list views, and
writes still run as the actual Salesforce user under their sharing rules and
FLS.

## 3. The email lane

### Signup — `POST /api/auth/signup`

Email + name + password (minimum 10 characters, no composition rules, per
NIST). Creates the account and its workspace, mints a session immediately —
same cookie format, KV record shape, and expiry windows as today — and lands in
Studio with a "verify your email" banner until `emailVerifiedAt` is set. No
verification wall before first use: the thing worth protecting (going live to
reps) is already gated behind connecting an org, which requires a real
Salesforce OAuth.

**Duplicate emails — two cases, one rule each:**

- Email matches an account **with a password**: plain "an account with this
  email already exists — sign in instead." That enumeration trade-off is
  accepted deliberately for a B2B tool rather than contorting signup into fake
  success.
- Email matches a **passwordless** account (a rep runtime identity, or the
  legacy bridged account): signup must NOT mint a session or set a password
  directly — that would let anyone claim a rep's account id and inherit their
  `user_connections`. Instead the flow goes verification-first: send the
  verify link, and clicking it lets the owner of that inbox set a password on
  the **existing** account. This is safe because the account's email came from
  Salesforce's verified identity — proving control of the inbox proves it is
  the same person — and it preserves their account id, connections, and audit
  history. Completing the claim also creates the account's owned workspace if
  it doesn't have one (rep identities never did).

### Verification

A 32-byte one-time token, stored **hashed** (SHA-256) in the store's KV with a
24-hour TTL, emailed as a link to `/verify?token=…`. Clicking sets
`emailVerifiedAt`. A reset-link click also implies verification — it proves the
same thing.

### Sign-in — `POST /api/auth/signin`

Lookup by email; argon2 verify — against a dummy hash when the account doesn't
exist, so timing doesn't leak existence; one generic failure message. Success
mints a fresh session (new session id every time — no fixation).

### Sign in with Salesforce — scoped, sign-in only

Rendered on `/login` only, below the email form, and only when the Cardstack
connected app is configured (`cardstackSalesforceLoginApp()`), with the
existing production/sandbox host choice. The email lane never depends on it.

Flow: the existing `/api/auth/salesforce/start` (PKCE + `state` in KV, rate
limiter kept) → Salesforce OAuth → callback verifies the identity URL, then
resolves `getAccountBySalesforceUserId(sfUserId)`:

- **No account has that Salesforce user recorded** → refuse: "No Cardstack
  account has connected this Salesforce user. Sign up with email, then
  connect your org." Never creates an account.
- **Account found but owns no workspace** (a rep runtime identity) → refuse:
  "Studio is for workspace owners — use Cardstack from your chat app." The
  choke point would refuse the session anyway; refusing at the callback is
  what makes the message useful.
- **Account found and owns a workspace** → mint a standard session. Same
  cookie, same windows.

A Salesforce email matching an account's address is never sufficient — the
match is on the recorded Salesforce user id alone, so there is no auto-link
path.

### Password reset

`POST /api/auth/forgot` always answers "if that email has an account, we sent a
link" (enumeration resistance is free here, so it's kept). Token: KV, hashed,
30-minute TTL, single-use, bound to the account id. Setting a new password
stamps `passwordChangedAt`, and `resolveStudioSession` gains one check: a
session record created before `passwordChangedAt` resolves to null. That
invalidates every other session on reset without enumerating KV.

### Rate limiting

The existing fixed-window limiter guards `signup`, `signin`, and `forgot`,
keyed per-IP, plus a per-email failure counter in KV for sign-in. Failures
write audit entries, as the access-key path does today.

### Email delivery

Resend, called via its plain HTTPS API — no SDK dependency. `RESEND_API_KEY` +
`CARDSTACK_EMAIL_FROM`; when unset (local dev), the mail module prints the link
to stdout, preserving the credential-free dev loop. Deliverability is only in
the path of verification/reset mail, never sign-in itself.

## 4. Connecting an org

Lives at `/connections`, the centerpiece of an unconnected workspace's home.
Two ways in, both already implemented in the runtime: **"Connect Salesforce"**
via the Cardstack-owned connected app when the deployment has one, and **"use
your own connected app"** (the existing BYO form) which works even when it
doesn't — connecting, like signup, never hard-depends on the Cardstack app.
Production vs. sandbox is the login-host choice on this step.

**The claim happens at the OAuth callback:** verified identity URL → org id →
set `org_key` on the owner's workspace. On conflict, the connection is
discarded and the user is told the org is already connected to another
Cardstack account. Success records the connecting Salesforce user id on the
owner's account, names the workspace after the org, and tags sandboxes
(`isSandbox`).

**Disconnect** releases the claim (`org_key` → null) and deletes the admin
connection but keeps rep memberships and user connections, so reconnecting the
same org restores service without re-onboarding reps. Switching orgs is
disconnect-then-connect behind a confirmation, since published config was built
against the old org's schema.

## 5. The auth surfaces (invented — /design has no sign-in mockup)

Per CLAUDE.md hard rule 6, the PR must note that this surface has no /design
reference; it is invented in the Studio token language (paper / surface / ink /
accent), direction accepted via mockup during brainstorming.

All five screens share one shell — the **split brand panel**: accent-colored
left half with the Cardstack mark, the one-liner ("Record cards your reps use
right inside chat"), and a stacked-cards motif; the form on the right on white.
Server components, forms POSTing to route handlers, errors rendered on first
paint via query params — the current login page's pattern.

- `/login` — email, password, "Forgot password?", "Create an account" link;
  "Sign in with Salesforce" below the form when the Cardstack app is
  configured (sign-in only — `/signup` has no Salesforce button)
- `/signup` — name, email, password
- `/forgot` — email → neutral "check your inbox" state
- `/reset` — new password, from the emailed token
- `/verify` — landing for the verification link: success, or expired-with-resend

Hygiene rules: the page **never prints env var names** — a misconfigured
deployment says "Sign-in is unavailable on this deployment" and the specifics
go to server logs; the access-key form is gone entirely.

## 6. Migration

Small because production is small: exactly one workspace (`t_demo`).

1. **Schema, additive.** Accounts gain `email` (unique), `passwordHash`,
   `emailVerifiedAt`, `passwordChangedAt`; workspaces gain unique
   `ownerAccountId`; `org_key` becomes nullable. File store and Postgres store
   change together via the shared types.
2. **Deploy** new auth routes alongside the old login (old lanes still work).
3. **Sign up normally in production** with the operator's email. If that email
   matches the legacy bridged account, this takes §3's verification-first path
   and sets a password on the **existing** account — keeping the account id
   that already keys `user_connections` and audit rows. Then run a one-time
   `attach-workspace --workspace t_demo --account <email>` script: sets that
   account as `t_demo`'s owner and copies the org claim from the stored admin
   connection's verified org id. Idempotent, report-first like the old
   backfill.
4. **Swap the login page and delete the access-key bridge** (`POST
   /api/session`'s bridging path). The Studio Salesforce login routes stay,
   repurposed for the scoped sign-in button (§3).
5. **Existing clocks unchanged:** `STUDIO_SHARED_SECRET` stays in the cookie
   verify-list until ~2026-08-24 (14 days after `CARDSTACK_SESSION_SECRET`
   went live). The MCP legacy connected-app fallback keeps its posture (armed
   by `CARDSTACK_TENANT_ID`; retired once the Cardstack app is configured).

New env: `RESEND_API_KEY`, `CARDSTACK_EMAIL_FROM`. Rollback: schema is
additive; the page swap is a deploy; the attach script writes two fields and is
reversible by hand.

**Docs amendments in the same PR:** rewrite `accounts-and-workspaces.md`
around this model; amend PLAN.md's "no password flows" non-goal with a dated
supersession pointing here; add an addendum to the 2026-08-08 auth-redesign
spec's §7 noting "a workspace IS a Salesforce org" is superseded by this spec;
update CLAUDE.md's accounts paragraph and remove the `getSelfServiceIdentity`
grep instruction.

## 7. Isolation invariants (the hard condition)

**No account can reach another account's data.** Two doors, both closed:

- **Studio:** a session resolves to a `tenantId` exclusively through
  `workspace.ownerAccountId === account.id`. No route accepts a tenant id from
  the request; there is nothing to substitute.
- **MCP:** a rep's token is bound to the workspace their Salesforce-verified
  org id resolved to at authorization; membership is re-read on every call.
  The org id comes from Salesforce's identity URL, never from the caller.

**Re-claim is safe by construction:** config, connections, and audit are keyed
by workspace id, never by org id. If account A disconnects org O and account B
later claims O, B claims it into B's own empty workspace; A's layouts, audit
history, and stored connections stay under A's workspace id, unreachable by B.
Reps arriving after the re-claim land in B's workspace and re-authorize fresh.
Nothing migrates across a claim change, ever.

Token hygiene: verify/reset tokens are single-use, hashed at rest, TTL'd, and
bound to one account id; sessions are minted server-side with a fresh id at
every signup/sign-in.

## 8. Testing

- **New unit tests:** password hashing/verify (incl. dummy-hash timing path),
  the three token flows (single-use, TTL, hashed at rest, account binding),
  rate limiting, choke-point ownership check, `passwordChangedAt` session
  invalidation, and the passwordless-claim rule (signup with a rep's email
  must not mint a session or set a password without the verify step).
- **Salesforce sign-in (scoped):** unknown Salesforce user refused with no
  account created; rep runtime identity (no owned workspace) refused; owner
  signs in; an email-address match without the recorded Salesforce user id is
  never linked.
- **Reshaped:** `sign-in.test.ts` — find-or-refuse, reps always `member`,
  owner chat-lane convergence via recorded Salesforce user id.
  `auth.test.ts` — ownership gate replaces the role gate.
  `tenant-isolation.test.ts` — **must keep passing**, reshaped as two accounts
  claiming two orgs; gains the claim-conflict race (unique constraint decides,
  loser gets the typed refusal) and the re-claim scenario (§7).
- **Deleted:** `membership-change.test.ts` with its module.
- **Untouched:** golden-path demos (`CARDSTACK_DEV_IDENTITY` lane preserved),
  confirmation-provenance tests (hard rule 8 has no interaction with this
  design).

## 9. Deliberately not doing

- **Salesforce signup** — the button signs in; it never creates accounts.
- **Invites / multi-user workspaces / roles** — removed, not rebuilt. When
  collaboration returns it will be invite-shaped, not org-auto-join-shaped.
- **Auto-linking accounts by email** — never. The Salesforce button only
  signs into an account that explicitly connected that Salesforce user.
- **Org transfer between accounts** — disconnect-then-claim is the mechanism;
  no ownership-transfer feature.
- **Sandbox↔production config sync** — unchanged non-feature from the previous
  design.
- **Session model changes** — the shipped cookie/KV design is kept exactly.
