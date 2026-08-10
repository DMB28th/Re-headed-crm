# Cardstack authentication review — findings

Date: 2026-08-08
Status: findings only. No design, no fix. Part 2 (redesign) is deliberately not
in this document.
Reviewed at: `claude/actions-editor` @ `8ebfea1`

## Scope and method

Both sign-in lanes end to end, plus the shared identity core:

- Studio: `apps/studio/middleware.ts`, `lib/studio-session.ts`, `lib/auth.ts`,
  `lib/login-flow.ts`, `lib/oauth.ts`, `app/api/auth/salesforce/{start,callback}`,
  `app/api/session`, and the four CRM-connection OAuth routes.
- MCP: `apps/mcp-server/src/{oauth-provider,auth,auth-config,main}.ts`.
- Shared: `packages/config-store/src/{sign-in,identity}.ts`,
  `packages/crm-adapters/src/salesforce/salesforce-adapter.ts` (authorize URL).

Per hard rule 7, the OAuth behavior of the framework was read from the shipped
SDK (`@modelcontextprotocol/sdk@1.29.0`,
`dist/esm/server/auth/{router,handlers/{authorize,token,register},middleware/{clientAuth,bearerAuth}}.js`)
rather than assumed. Several things that look wrong in our provider are correct
because of what the SDK does; those are recorded under "Verified sound" so the
redesign does not churn them.

Baseline: the four constraint tests plus `oauth-provider.test.ts` pass on this
branch (15 tests) before any change.

---

## Note on the review's base branch

The task named `claude/build-session-chx72o` as the base. That branch does not
contain the code under review — no `sign-in.ts`, no `identity.ts`, no
`studio-session.ts`, no `docs/accounts-and-workspaces.md`, no
`tenant-isolation.test.ts`, no `docs/superpowers/`. It is merged into `main`
(PR #6, `efef35d`), and `main` does not contain them either.

The whole surface lives on `claude/actions-editor`, which is a strict descendant
of `build-session-chx72o` (30 commits ahead, 0 behind). This review is therefore
based on `claude/actions-editor`. If that is the wrong base, everything below
needs re-checking against the right one — say so before part 2.

---

# Part A — Exploitable today

## A1 — CRITICAL: any stranger can mint a bearer token for a rep, with one click

**Where**

- `apps/mcp-server/src/oauth-provider.ts:189-197` — dynamic client registration
  stores whatever the caller sends. `redirect_uris` is never validated, never
  allowlisted, never reviewed.
- `apps/mcp-server/src/oauth-provider.ts:201-250` — `authorize()` redirects
  **straight to Salesforce**. There is no consent interstitial, no "an app called
  X wants access to your CRM", no display of the redirect target.
- `apps/mcp-server/src/main.ts:148-155` — `mcpAuthRouter` mounts `/register`
  because our `clientsStore` implements `registerClient`
  (SDK `router.js:31`, `:77-81`).
- `packages/crm-adapters/src/salesforce/salesforce-adapter.ts:298-317` — the
  Salesforce authorize URL carries no `prompt` parameter.

**Exploit**

1. Attacker: `POST https://<mcp-origin>/register` with
   `{"client_name":"Cardstack","redirect_uris":["https://evil.example/cb"],"token_endpoint_auth_method":"none"}`.
   Returns a `csk_…` client id. (SDK rate limit is 20/hour/IP — ample.)
2. Attacker generates their own PKCE pair and sends a rep a link:
   `https://<mcp-origin>/authorize?client_id=csk_…&redirect_uri=https%3A%2F%2Fevil.example%2Fcb&response_type=code&code_challenge=<attacker>&code_challenge_method=S256`
   The link is on the genuine Cardstack origin — it survives inspection.
3. The rep clicks. Our `/authorize` bounces them to Salesforce. Because they have
   already approved the Cardstack connected app (they use Cardstack), Salesforce
   auto-approves and returns immediately. **If** Salesforce does prompt, the
   prompt names *Cardstack* — never the attacker's client — so the victim
   approves it. The prompt makes the attack more convincing, not less.
4. `completeSalesforceCallback` (`:258-331`) resolves the rep's identity, writes
   their per-user Salesforce connection, mints our authorization code, and
   redirects it to `https://evil.example/cb`.
5. The attacker exchanges the code at `/token` with the verifier they generated.
   PKCE verifies — the attacker is the client, so PKCE protects nothing here.
6. The attacker now holds a bearer token whose `StoredUser` is the victim's
   `{tenantId, userId, name, email}` (`:319-324`). Every `/mcp` call runs as the
   victim: `crm_search`, `crm_get_record`, `crm_update_record`, `crm_create_record`.

**Impact**

Full read/write on the victim's Salesforce records through Cardstack, using the
victim's own per-user Salesforce grant. The audit log records the writes as the
victim (`main.ts:210-215` derives the actor from the token). Hard rule 8 is not
violated — the attacker can mint a confirm token for their own diff, because
they *are* the authenticated actor as far as the server can tell. Confirmation
provenance is working exactly as designed; it just cannot help when the identity
underneath it is the wrong person.

Nothing about this requires stealing a credential, and nothing about it requires
the attacker to be in the org.

**Why PKCE and the SDK's redirect_uri check don't stop it:** the SDK validates
`redirect_uri` against the *client's own registered set* (`authorize.js:88-92`).
When the attacker registered the client, they registered the URI. Both controls
are working; neither is the control this needs.

---

## A2 — HIGH: a rep can become the workspace admin, and the real admin is then permanently locked out

**Where**

- `packages/config-store/src/sign-in.ts:95-110` — `ensureMembership` grants
  `admin` to whoever is first into a workspace, with no notion of which lane they
  arrived through.
- `apps/mcp-server/src/oauth-provider.ts:296` — the MCP lane calls `resolveSignIn`
  and discards the returned `role`. A rep signing in from a chat host will
  create the workspace if it does not exist.
- `apps/studio/app/api/auth/salesforce/callback/route.ts:73-78` — Studio refuses
  a session to anyone whose role is not `admin`.
- No promotion path exists. `setMembership` has exactly two call sites in the
  whole repo: `sign-in.ts:108` and `app/api/session/route.ts:62`. There is no
  invite, no role editor, no API, no script.

**Failure scenario**

A rep at Acme adds the Cardstack connector in claude.ai before anyone at Acme has
opened Studio. `resolveSignIn` creates workspace `sf_00d…` and makes that rep its
admin. The person who actually bought Cardstack then goes to Studio, signs in
with Salesforce, and gets:

> You joined Acme, but Studio is limited to workspace admins. Ask an admin to
> grant access.

There is no admin to ask, in the sense that the rep who holds the role has no
mechanism to grant it and does not know they hold it. The buyer cannot design a
card, cannot set field permissions, cannot connect the CRM. The workspace is
bricked, and the only recovery is the `STUDIO_SHARED_SECRET` access key — which
mints an admin session for `CARDSTACK_TENANT_ID`, a *different* workspace, so it
does not recover this one either.

The other half of the same defect: that rep, who has never been vetted for it,
can sign into Studio and change `permissions.writeEnabled`, the field denylist,
the action row, and the published layout for their entire org.

This is simultaneously a privilege escalation and a hard availability failure,
and it is reachable by normal use — no attacker required.

---

## A3 — HIGH: the shared access key is also the session signing key, and it can be guessed online without limit

**Where**

- `apps/studio/lib/studio-session.ts:47-51` — `sessionSigningSecret()` falls back
  to `STUDIO_SHARED_SECRET`.
- `apps/studio/app/api/session/route.ts:17,25` — the same `STUDIO_SHARED_SECRET`
  is the access key a human types into the login page.
- `apps/studio/middleware.ts:8` — `/api/session` is in `PUBLIC_PATHS`.
- `app/api/session/route.ts:62-81` — grants `role: "admin"` unconditionally, with
  no membership check and no expiry on the bridge itself.

**Three distinct problems, one root**

1. **A human-transcribed credential is being used as an HMAC key.** Anyone who
   was ever handed the access key — a contractor, a Slack scrollback, a support
   ticket, a screenshot — can forge a Studio session cookie for any session id.
   That alone only passes `middleware.ts`, which checks the HMAC and nothing
   else (`:31-35`); but see (2), which makes the forgery unnecessary anyway.
2. **`POST /api/session` is unauthenticated, public, and unthrottled.** There is
   no rate limit on it (Studio has none anywhere; the MCP server's limiter at
   `main.ts:180-195` is a different app). An attacker sends
   `POST /api/session {"secret":"…"}` in a loop against a human-chosen key, with
   no lockout, no delay, and no log line on failure. Success returns a cookie for
   a session recorded as `role: "admin"`.
3. **Rotating the access key silently invalidates every live Studio session,**
   because it is the signing key. The one operational response to a leaked key
   is also a full logout of every admin — which is exactly the pressure that
   causes teams not to rotate.

`docs/accounts-and-workspaces.md:80-83` presents the fallback as a
backwards-compatibility nicety. Its actual effect is that the weakest credential
in the system is load-bearing for the strongest one.

---

## A4 — HIGH: the rep lane never re-checks membership; there is no way to cut anyone off

**Where**

- `apps/mcp-server/src/oauth-provider.ts:74-92` — `StoredCode` and `StoredToken`
  freeze `{tenantId, userId, name, email}` at issuance.
- `:412-424` — `verifyAccessToken` returns that frozen snapshot. It never touches
  `getMembership`, `getAccount`, or `getWorkspace`.
- `apps/mcp-server/src/main.ts:210-215` — `/mcp` uses the snapshot directly.
- Contrast `apps/studio/lib/auth.ts:64-81`, which re-reads the membership on
  every request precisely so that removal is immediate.

**Failure scenario**

Deleting someone's membership row takes effect instantly in Studio and changes
nothing at all on `/mcp`. Their bearer token keeps resolving to the same tenant
and user id until it expires. Access tokens live 1h; refresh tokens live 30d
(`:54-55`), and the refresh grant is honored for that entire window.

There is also no revoke path that an admin could use even if they knew to.
`revokeToken` (`:426-435`) deletes only the exact token presented, and only when
the caller authenticates as the client that owns it — so it is a facility for
claude.ai, not for the workspace's admin. Nothing enumerates a user's tokens.
There is no Studio surface for it. The only lever a Cardstack admin has over a
departing rep is outside Cardstack: revoke the grant in Salesforce.

**Why this is worse than it sounds:** both documents assert the opposite.
`apps/studio/lib/studio-session.ts:16-17` says "signing out and role changes take
effect immediately rather than waiting for a cookie to expire", and
`docs/accounts-and-workspaces.md:63-66` repeats it. That is true of one lane and
false of the other, and the docs do not distinguish them. Anyone reasoning about
offboarding from the docs will get it wrong.

---

## A5 — HIGH (structural): role is checked once, at one door — everywhere else it is decorative

This is the item the task flagged. **The claim as stated is refuted; a weaker but
real version of it is confirmed.**

**Refuted:** it is not true that every member can reach Studio and edit layouts.
`apps/studio/app/api/auth/salesforce/callback/route.ts:73-78` refuses to mint a
session for a non-admin, and no cookie is set. `middleware.ts:31-41` then bounces
every route. A rep who auto-joined via the chat host cannot get into Studio
through the Salesforce lane.

**Confirmed:** that single line is the *entire* enforcement. Grepping `role`
across `apps/` and `packages/`:

- `callback/route.ts:74` — the check.
- `apps/studio/lib/auth.ts:80` — `resolveSessionId` returns `role`. **No caller
  reads it.** Not one route handler, page, layout, or store method.
- `app/api/session/route.ts:65,77` — hardcodes `"admin"`.
- Everything else is the type, the schema, the column, or an unrelated CRM field.

There is no `requireAdmin`. There is no authorization layer. The consequences
that follow from that today:

- **A demotion does not take effect for up to 14 days.** `resolveSessionId`
  faithfully re-reads the membership and returns the current role, and then the
  value is thrown away. Removing a membership *does* log the user out (`:79`
  returns null), but changing `admin` → `member` does nothing until the cookie
  expires. This directly contradicts the doc claims quoted in A4.
- **The migration bridge bypasses the check entirely** (A3), so there is already
  one live path to an admin session that never consults a membership.
- **The check is in a route handler, not a boundary.** The next route that mints
  a session — a magic link, an invite acceptance, a second IdP — has to remember
  to copy it. Nothing structural catches the omission.

Severity is High because the correct fix is not "add a line": it is deciding
where authorization lives, which is part 2's job.

---

## A6 — MEDIUM: open redirect on the Studio sign-in lane

**Where**

- `apps/studio/lib/login-flow.ts:19-22` — `safeNext` rejects a leading `//` but
  not a leading `/\`.
- `apps/studio/app/api/auth/salesforce/callback/route.ts:94` —
  `NextResponse.redirect(new URL(safeNext(pending.next), origin))`.

**Verified**

```
new URL("/\\evil.com", "https://studio.example.com")  →  https://evil.com/
new URL("/\\/evil.com", "https://studio.example.com") →  https://evil.com/
```

WHATWG URL parsing treats backslashes as forward slashes for special schemes, so
`/\evil.com` is a protocol-relative URL that `safeNext`'s `startsWith("//")`
check does not see. `safeNext` is applied at both `start/route.ts:56` and the
callback; both accept it.

**Exploit**

Send an admin `https://<studio>/api/auth/salesforce/start?next=/\evil.com`. They
complete a *genuine* Salesforce sign-in against the *genuine* Cardstack origin —
everything they can inspect is real — and land on `https://evil.com/`, which
renders "Your session expired, sign in again" and harvests Salesforce
credentials. The session cookie is not leaked cross-origin; the transferred trust
is the payload.

The comment at `login-flow.ts:14-18` states the exact reasoning that misses this:
it identifies `//` as the protocol-relative case and stops there.

---

## Part A summary

| | Issue | Severity |
|---|---|---|
| A1 | DCR + no consent screen → token minted for any rep, one click | Critical |
| A2 | Rep becomes workspace admin; real admin locked out, no recovery | High |
| A3 | Access key doubles as signing key; unthrottled online guessing | High |
| A4 | MCP tokens never re-check membership; no revocation path exists | High |
| A5 | Role checked at one door only; no authorization layer | High |
| A6 | Open redirect via `next=/\evil.com` | Medium |

---

# Part B — Hardening

Not exploitable end-to-end today, verified as such, but each one is either a
fail-open shape or a control resting on a single load-bearing assumption.

## B1 — `/mcp` falls open to env identity when a token lacks `extra.user`

`apps/mcp-server/src/main.ts:210-215`: `tokenUser` is
`req.auth?.extra?.user`; when that is undefined the expression falls through to
`userContextFromHeaders(...)`, which in production without
`CARDSTACK_ALLOW_HEADER_IDENTITY` returns
`{tenantId: CARDSTACK_TENANT_ID ?? DEMO_TENANT_ID}` and the default user
(`auth.ts:33,53`). So a token that verifies but carries no user resolves to *the
legacy tenant as an anonymous default user*, and serves records.

Not reachable from attacker input today — `mintTokens` always sets `user`. It
becomes reachable the moment `StoredToken`'s shape changes, or an older token
sits in KV across a deploy. The correct behavior on a token that verifies but
carries no identity is 401, never a default tenant.

## B2 — Studio's entire CSRF posture is one cookie attribute

`apps/studio/lib/studio-session.ts:120-128`: `httpOnly`, `sameSite: "lax"`,
`secure` only when `NODE_ENV === "production"`, `path: "/"`, no `__Host-` prefix.
No mutating route checks `Origin` or `Referer`, and there is no CSRF token —
verified across all 26 route handlers under `apps/studio/app/api`.

`SameSite=Lax` does block cookie attachment on cross-site POST in current
browsers, so this is defense-in-depth rather than a live hole. Two things make it
thinner than it looks:

- Lax still sends the cookie on top-level GET navigation, so any mutating GET is
  immediately CSRF-able. Two already exist —
  `app/api/connections/salesforce/oauth/callback/route.ts:22` and
  `app/api/user-connections/salesforce/oauth/callback/route.ts:22` — both of
  which write connection state. They are safe *only* because the `state` they
  match is minted and stored server-side (`:37-44` in each). That is correct
  today and is exactly the shape that becomes a hole if `state` ever moves
  client-side.
- Next's `req.json()` does not check `Content-Type`, so a cross-site
  `enctype="text/plain"` form can produce a body our routes will parse. Lax is
  the only reason that doesn't matter.

## B3 — `isPublic` matches a substring, so the auth boundary depends on the route table

`apps/studio/middleware.ts:16`:

```ts
PUBLIC_PATHS.has(path) || path.startsWith("/api/auth/") || path.includes("/oauth/callback")
```

`includes`, not `startsWith`. Any path containing `/oauth/callback` anywhere is
exempt from the edge gate. I checked every route under `apps/studio/app/api`:
all dynamic segments are single-segment (`[object]`, `[screen]`), so no current
route can be coerced into matching. Not exploitable — but the gate's correctness
is currently a property of the route table rather than of the gate, and the route
table changes every milestone.

The two routes it is actually there for do resolve identity themselves
(`getUserContextFromRequest` → throws `Not signed in.` in production), so they
fail closed. The exemption is about *middleware*, not about *auth*, which is
worth stating explicitly wherever it lands.

## B4 — Unauthenticated, unthrottled KV writes on the Studio authorize lane

`apps/studio/app/api/auth/salesforce/start/route.ts:52-58` writes a `kv_entries`
row on every GET. The route is public (`middleware.ts:16`) and Studio has no rate
limiter. A loop fills the table with 15-minute-TTL rows; on the Postgres store
these are real inserts against the same table sessions and OAuth state live in.

The MCP server's equivalent is rate-limited for free by the SDK
(`authorize.js:60-68`, 100/15min/IP). Studio's is not.

## B5 — Refresh tokens are never rotated

`apps/mcp-server/src/oauth-provider.ts:394-403`: when `existingRefresh` is
passed, `mintTokens` skips the `kvSet` entirely and returns the same refresh
token. Two consequences:

- **No rotation, so no reuse detection.** A stolen refresh token is usable for
  the remainder of its life, silently, alongside the legitimate one. There is no
  signal that would ever reveal the theft. (Salesforce's own app has exactly this
  property and we depend on it — see the hazard note below — but ours does not.)
- **The TTL is not extended on use**, because the `kvSet` is skipped. So the
  refresh token hard-expires 30 days after *first issuance*, and every rep
  re-runs the full OAuth dance every 30 days regardless of activity. That is a
  reasonable security default stated as an accident; it should be a decision.

`revokeToken` (`:426-435`) deletes only the token presented — revoking an access
token leaves the refresh token live and vice versa.

## B6 — Confidential DCR clients break silently at 30 days

The SDK sets `client_secret_expires_at` to issuance + 30 days
(`register.js:8,42-51`) and `authenticateClient` rejects an expired secret
(`clientAuth.js:29-31`). Our `registerClient` (`oauth-provider.ts:189-197`)
preserves it. A host that registers as a *confidential* client gets
`invalid_client: Client secret has expired` on day 31, with no re-registration
prompt from our side.

Latent: claude.ai registers as a public client
(`token_endpoint_auth_method: "none"`), so no secret is issued. It becomes live
the day a host registers confidentially. Client records are also stored with no
KV expiry (`:195` passes no `expiresAt`), so the registration table grows
without bound.

## B7 — Requested Salesforce scopes don't match the documented ones

`packages/crm-adapters/src/salesforce/salesforce-adapter.ts:308` requests
`scope=api refresh_token`. `docs/accounts-and-workspaces.md:104` says the login
app requests `api` and `refresh_token, offline_access`. Without `offline_access`,
refresh-token longevity rests entirely on the connected app's session policy.
Either the code or the doc is wrong; both are being relied on.

---

# Part C — Seamlessness failures

These are correctness failures in the product experience, not in the security
model. They belong in the findings because each one is a *consequence* of how the
two lanes are separated today.

## C1 — The re-auth widget state exists, and its button is a dead end

PLAN.md lists the re-auth widget state as still open. It is not open — it shipped
— but it does not work for the population that hits it.

- `packages/widgets/src/shared/components.tsx:187-205` — the `unauthorized` error
  card renders "{CRM} connection expired" with a **"Reconnect Salesforce"**
  button. The button calls `host.sendFollowup()` with the text *"My Salesforce
  connection expired — please ask the admin to reconnect Salesforce in Cardstack
  Studio."* It reconnects nothing. It types a message.
- `apps/mcp-server/src/main.ts:292-300` — the other path sets
  `connectUrl` to `${CARDSTACK_STUDIO_URL}/connections`.

Both are wrong for a rep whose **own** per-user Salesforce grant expired:

1. An admin **cannot** reconnect another user's per-user token. The admin
   connection and the per-user connection are different records
   (`setConnection` vs `setUserConnection`); reconnecting the admin's changes
   nothing for the rep.
2. `/connections` requires an admin Studio session. A rep who follows that link
   is redirected to `/login`, signs in with Salesforce, and is told *"Studio is
   limited to workspace admins."* (A2). Dead end, after four redirects.
3. The action that would actually fix it — remove and re-add the Cardstack
   connector in the chat host, re-running `/authorize` — is never mentioned
   anywhere in the product.

So the rep's card names the right problem and then sends them down two paths that
cannot solve it and one they are locked out of.

## C2 — Sandbox reps cannot sign in through chat at all

- Studio offers the choice: `app/api/auth/salesforce/start/route.ts:43-47` reads
  `?env=sandbox` and switches to `test.salesforce.com`.
- The MCP lane does not. `oauth-provider.ts:157-160` uses the process-wide
  `CARDSTACK_SF_LOGIN_URL` for every rep, and `/authorize` accepts no equivalent
  parameter — the SDK's `AuthorizationParams` has no passthrough, so there is
  nowhere to put one without extending the provider.

A rep whose org is a sandbox on a production-configured deployment gets bounced
to `login.salesforce.com`, authenticates as the wrong identity or fails outright,
and has no control that would fix it. There is no error message for this case —
it surfaces as a generic sign-in failure page (`main.ts:163-171`).

## C3 — Redirect count on a rep's first use

Counted from the code, first connection from claude.ai:
`/register` → `/authorize` → Salesforce authorize → (approval, first time only) →
`/oauth/salesforce/callback` → host redirect_uri → `/token`. That is four
redirects plus one approval screen, all of which the chat host drives — a rep
sees one Salesforce login and one approval. **This lane is fine.** Recording it
because part 2 should not "improve" it: the friction that matters for reps is
C1 and C2, not the initial handshake.

## C4 — An admin re-authenticates on a 14-day cliff, with no warning

`apps/studio/lib/studio-session.ts:24` — 14 days absolute, and because
`issuedAt` is inside the HMAC (`:64-75`) there is no sliding renewal. An admin
in Studio daily is logged out every 14 days mid-task, with no advance notice and
no refresh. There is no idle timeout, which is the axis that would actually
matter for a browser session left open on a laptop.

Both halves are defensible; neither is a decision anyone recorded.

---

# Part D — Verified sound

Recording these so part 2 does not spend effort re-deriving or accidentally
"fixing" them.

- **PKCE is genuinely enforced on the MCP lane.** `exchangeAuthorizationCode`
  (`oauth-provider.ts:346-364`) ignoring its `_codeVerifier` argument is
  *correct*: the SDK performs local PKCE validation via
  `challengeForAuthorizationCode` (`token.js:64-71`) unless
  `provider.skipLocalPkceValidation` is set, and ours does not set it. Our
  `challengeForAuthorizationCode` (`:333-344`) is client-bound.
- **PKCE on the Studio lane** stores the verifier server-side keyed by `state`
  (`start/route.ts:52-58`) and replays it at exchange — never in the URL.
- **OAuth `state` is single-use on both lanes**, deleted before any work:
  `callback/route.ts:57-58` and `oauth-provider.ts:260-262`.
- **Authorization codes are single-use, client-bound, and redirect_uri-matched**
  (`oauth-provider.ts:352-363`).
- **`redirect_uri` is validated against the client's registered set** by the SDK
  (`authorize.js:88-92`, exact match except RFC 8252 loopback ports).
- **No session fixation.** Both session-minting paths generate a fresh 24-byte
  random id (`studio-session.ts:85-89`) after authentication —
  `callback/route.ts:80` and `session/route.ts:69`. No pre-auth session exists to
  fixate.
- **Cookie HMAC comparison is constant-time** for equal-length inputs
  (`studio-session.ts:77-82`), and the cookie is `httpOnly`.
- **KV expiry is enforced lazily on read** in both backends
  (`postgres-store.ts:350-363`, `memory-store.ts:169-178`), so a TTL'd token or
  session really is dead, not merely marked.
- **Bearer expiry is checked** independently by the SDK
  (`bearerAuth.js:29-35`) as well as by KV TTL.
- **Signing fails closed.** `sessionSigningSecret` returns `undefined` rather
  than a constant when unset, and every caller refuses:
  `middleware.ts:23-29` (503 in production), `auth.ts:56-57`,
  `callback/route.ts:45-48`. The constraint holds. (A3 is about *which* secret
  it accepts, not about the fail-closed behavior.)
- **Hard rule 8 is intact.** `apps/mcp-server/src/confirm-token.ts` binds
  tenant, object, record, actor, and a hash of the exact patch, and never
  degrades to unsigned (`:27-32`, `:110-112`). Nothing in either auth lane lets a
  caller assert that a confirmation happened. A1 defeats it only by becoming the
  actor — the mechanism itself is not bypassed.
- **Cross-tenant isolation holds** at the store level:
  `tenant-isolation.test.ts`, `sign-in.test.ts`, `studio-session.test.ts`,
  `identity.test.ts`, `oauth-provider.test.ts` — 15 tests, all passing on this
  branch before any change.
- **Header identity is off in production** by default (`auth.ts:25-28`) and
  Studio's `devUserContext` cannot engage in a production build
  (`apps/studio/lib/auth.ts:48,92-95`). Both are real gates, not comments. Their
  *existence* is a separate question, deferred to part 2.

---

# Part E — Inventory of the six bypasses

Facts only. Keep / narrow / delete verdicts belong in part 2.

| Bypass | Where | Gate today | What depends on it |
|---|---|---|---|
| `devUserContext` | `apps/studio/lib/auth.ts:117-143`, reached from `:92-95` | `NODE_ENV !== "production"` | `pnpm dev`, `dev:sf`, all five demo scripts, `seed-from-salesforce.ts`. No browser login exists in any of them. |
| `CARDSTACK_ALLOW_HEADER_IDENTITY=1` | `apps/mcp-server/src/auth.ts:25-28` | env, production only | Nothing in-repo sets it. Documented at `docs/accounts-and-workspaces.md:87-88` as "don't — it is cross-tenant spoofing by design". |
| `STUDIO_SHARED_SECRET` as signing-key fallback | `apps/studio/lib/studio-session.ts:50` | none | The live deployment, if it has not set `CARDSTACK_SESSION_SECRET`. Removing it logs out every current session. **See A3.** |
| `POST /api/session` access-key bridge | `apps/studio/app/api/session/route.ts:15-89` | knowledge of `STUDIO_SHARED_SECRET` | The pre-accounts deployment's only login. Creates the legacy workspace + account + admin membership idempotently. **See A3.** |
| `CARDSTACK_TENANT_ID` | `mcp-server/auth.ts:33,53`; `main.ts:127,330`; `studio/lib/auth.ts:120,131`; `studio/lib/backend.ts:40`; `api/session/route.ts:30`; `seed-from-salesforce.ts:44` | none — plain env default | The legacy tenant's identity in five places. CLAUDE.md:47 claims it is "only a migration fallback, not a request default"; `mcp-server/auth.ts:53` and `studio/lib/auth.ts:131` use it as a request default. |
| MCP fallback to the legacy tenant's admin connected app | `apps/mcp-server/src/oauth-provider.ts:149-182`, wired at `main.ts:127` | `CARDSTACK_SF_CLIENT_ID/SECRET` unset **and** a `legacyTenantId` with a connected Salesforce OAuth connection | Existing chat-host connections on the live deployment while the Cardstack-owned app rolls out. Note `main.ts:127` defaults `legacyTenantId` to `DEMO_TENANT_ID` when the env var is unset, so the fallback is armed on *every* deployment, not only the legacy one. |

**Hazard, carried forward into part 2 unchanged:** the Cardstack-owned connected
app rotates refresh tokens with reuse detection. `CARDSTACK_DEV_SF_ORG`
(`packages/crm-adapters/src/salesforce/dev-adapter.ts`, honored at
`main.ts:303-309`) exists so a local run never reads, refreshes, or persists the
deployed connection's token, and `readSalesforceCliToken` output must never reach
a config store. B5 proposes nothing about Salesforce's refresh behavior — it
concerns *our own* opaque bearer tokens, which are independent of the Salesforce
grant. Any part-2 proposal that touches the Salesforce refresh path must state
explicitly how it avoids revoking the live grant family.

---

# Proposed severity ordering, for review

1. **A1** — unauthenticated stranger, one victim click, full CRM read/write as
   that victim. Nothing else on this list gets an attacker from zero to a valid
   identity.
2. **A2** — no attacker needed; it happens through normal use, it escalates a
   rep to org-wide admin, and it has no recovery path.
3. **A3** — one guessable secret away from admin, with no rate limit, and the
   remediation (rotate) is self-punishing.
4. **A4** — no offboarding story at all on the lane that has the most users, and
   the docs assert the opposite.
5. **A5** — the door is bolted but there is no lock on anything behind it. Low
   immediate exploitability, high blast radius on the next change.
6. **A6** — real, easy, but it is credential phishing rather than direct access.

Where I expect disagreement: **A5 could reasonably rank above A3 and A4** if the
plan is to give members a Studio surface at all — the moment "member" means
"read-only Studio" instead of "no Studio", the missing authorization layer stops
being latent and becomes the primary control. And **A4 could rank above A2** if
the live deployment already has departed users holding tokens, which I cannot
determine from the code.

Redirect me on the ordering before I design anything.
