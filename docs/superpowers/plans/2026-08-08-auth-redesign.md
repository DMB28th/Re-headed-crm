# Authentication Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate Cardstack's two authentication lanes properly — admins in Studio, reps through a chat host — close the six exploitable findings from the review, and give self-signup the edges it is missing, without locking out a single live user or token mid-migration.

**Architecture:** Authorization moves to one choke point per lane instead of one route handler. Studio: `resolveSessionId` refuses to resolve a non-admin session, so every page and route is gated by construction and demotion takes effect on the next request. MCP: `verifyAccessToken` resolves the membership live instead of trusting a snapshot frozen at issuance, so removal takes effect on the next tool call. The two credentials stay distinct — a Studio session grants no MCP access and vice versa — over one shared account and one `resolveSignIn`. A consent interstitial is added on the far side of the Salesforce callback, where the signer is known, which is what closes the one-click token-theft hole.

**Tech Stack:** TypeScript, zod 3, vitest 3, Next.js (App Router) for Studio, Express + `@modelcontextprotocol/sdk@1.29.0` for the MCP server, React 18 for widgets, pnpm + turbo workspaces.

**Spec:** `docs/superpowers/specs/2026-08-08-auth-redesign.md`
**Findings:** `docs/superpowers/specs/2026-08-08-auth-review.md`

## Global Constraints

- **Hard rule 2:** enforcement is server-side only. Nothing in this plan moves a check into the widget.
- **Hard rule 8:** every write is preceded by a confirmation diff, server-enforced via signed token or signed interview state. **No task here touches `confirm-token.ts`'s semantics.** Any change that would let confirmation become a caller-supplied claim is out of bounds; if a task appears to require one, stop and escalate.
- **Signing must fail closed.** `sessionSigningSecret` becomes a *list* in Task 2. An empty list must still mean "refuse", never "fall back to a constant". The existing fail-closed behavior at `middleware.ts:23-29`, `auth.ts:56-57`, and `callback/route.ts:45-48` must survive every task.
- **Sessions ride the existing TTL'd `kv_entries` KV.** No new session table. Task 4's `lastSeenAt` and Task 9's token-family records are KV values, not columns.
- **"A workspace IS a Salesforce org" is untouched.** Unique `org_key` is load-bearing. No task changes `workspaceIdForOrg` or the uniqueness of `salesforceOrgId`.
- **These tests must keep passing at every commit:** `packages/config-store/src/tenant-isolation.test.ts`, `packages/config-store/src/sign-in.test.ts`, `apps/studio/lib/studio-session.test.ts`, `packages/crm-adapters/src/salesforce/identity.test.ts`, `apps/mcp-server/src/oauth-provider.test.ts`.
- **The Salesforce refresh hazard.** The Cardstack-owned connected app rotates refresh tokens with reuse detection. Task 9 rotates **Cardstack's own opaque bearer tokens only** and must not touch `exchangeSalesforceAuthorizationCode`, `SalesforceAdapter`'s refresh path, or any `onCredentialsRefreshed` callback. `readSalesforceCliToken` output must never reach a config store, and `CARDSTACK_DEV_SF_ORG` keeps bypassing the stored connection.
- **Tasks 4 and 5 ship in one release.** The choke-point check without the people page can lock a workspace out with no recovery. Do not merge them separately.
- **Do not deploy.** Deployment is out of scope and needs explicit confirmation.
- Run `pnpm typecheck` before every commit; it catches cross-package breakage turbo surfaces late.
- Microcopy: sentence case, verb-first buttons, errors say what happened **and** what to do.

---

## File Structure

**Create:**
- `apps/studio/lib/rate-limit.ts` — fixed-window IP limiter for Studio's public auth routes, plus its tests.
- `apps/studio/lib/admins.ts` — "who administers this workspace" lookup, shared by the lockout message and the re-auth card.
- `apps/studio/app/people/page.tsx` — the members list.
- `apps/studio/app/api/people/route.ts` — list memberships.
- `apps/studio/app/api/people/[accountId]/role/route.ts` — promote/demote, with the last-admin guard.
- `apps/studio/app/me/connection/page.tsx` — the one page a member may reach.
- `apps/studio/scripts/backfill-workspace-admins.ts` — pre-deploy report + seed for zero-admin workspaces.
- `apps/mcp-server/src/consent.ts` — trusted-client matching, consent record storage, and the interstitial's HTML, plus its tests.
- `apps/mcp-server/src/token-family.ts` — refresh-token rotation and reuse detection, plus its tests.

**Modify:**
- `apps/studio/lib/login-flow.ts` — `safeNext`.
- `apps/studio/lib/studio-session.ts` — signing secret list, `lastSeenAt`, idle window.
- `apps/studio/lib/auth.ts` — the choke point; `devUserContext` narrowing.
- `apps/studio/middleware.ts` — `isPublic` exact match; the `/me/connection` allowance.
- `apps/studio/app/api/auth/salesforce/{start,callback}/route.ts` — origin assertion, rate limit, lockout copy.
- `apps/studio/app/api/session/route.ts` — rate limit, audit, real role, retirement guard.
- `apps/mcp-server/src/oauth-provider.ts` — consent, live identity resolution, rotation, legacy-fallback narrowing.
- `apps/mcp-server/src/main.ts` — consent routes, fail-closed token identity, `legacyTenantId` arming, re-auth discriminator.
- `apps/mcp-server/src/auth.ts` — delete `CARDSTACK_ALLOW_HEADER_IDENTITY`; gate on `CARDSTACK_DEV_IDENTITY`.
- `apps/mcp-server/src/server.ts` — `reauth` on `ErrorPayload`.
- `packages/core` — the `reauth` discriminator on `ErrorPayload`.
- `packages/widgets/src/shared/components.tsx` — the two re-auth cases.
- `docs/accounts-and-workspaces.md`, `CLAUDE.md` — corrected claims.

---

## Task 1: Close the open redirect (A6)

**Files:**
- Modify: `apps/studio/lib/login-flow.ts:19-22`
- Modify: `apps/studio/app/api/auth/salesforce/callback/route.ts:94`
- Test: `apps/studio/lib/login-flow.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: a `safeNext` that rejects every authority-introducing prefix.

- [ ] **Step 1: Write the failing tests**

Create `apps/studio/lib/login-flow.test.ts`. These must fail before the fix:

```ts
import { describe, expect, it } from "vitest";
import { safeNext } from "./login-flow";

describe("safeNext", () => {
  it.each(["//evil.com", "/\\evil.com", "/\\/evil.com"])(
    "refuses %s, which resolves to a foreign origin",
    (candidate) => {
      expect(safeNext(candidate)).toBe("/");
    },
  );

  it("keeps ordinary in-app paths", () => {
    expect(safeNext("/objects/deals?tab=fields")).toBe("/objects/deals?tab=fields");
  });
});
```

Add a resolution test that asserts the property rather than the syntax — this is the one that catches the *next* encoding trick:

```ts
it("never resolves to another origin", () => {
  for (const c of ["//e.com", "/\\e.com", "/\\/e.com", "/%09/e.com", "/..//e.com"]) {
    expect(new URL(safeNext(c), "https://studio.test").origin).toBe("https://studio.test");
  }
});
```

- [ ] **Step 2: Fix `safeNext`**

Two changes. First, strip the C0 control characters and DEL, because browsers drop tab, CR and LF while parsing a URL — so a candidate containing them can pass the checks below and still become a protocol-relative URL by the time the browser resolves it. Second, reject a candidate whose *second* character can begin an authority component, which is the `/\` case the current code misses.

```ts
const ignorable = (ch: string): boolean => {
  const code = ch.charCodeAt(0);
  return code <= 0x1f || code === 0x7f;
};

export function safeNext(candidate: string | null | undefined): string {
  if (!candidate) return "/";
  const cleaned = [...candidate].filter((ch) => !ignorable(ch)).join("");
  if (!cleaned.startsWith("/") || /^[/\\]/.test(cleaned.slice(1))) return "/";
  return cleaned;
}
```

Update the header comment: it currently explains the `//` case only, which is exactly the reasoning that missed `/\`.

- [ ] **Step 3: Assert the origin at the redirect site**

In `callback/route.ts:94`, resolve and verify before redirecting:

```ts
const target = new URL(safeNext(pending.next), origin);
const response = NextResponse.redirect(target.origin === origin ? target : new URL("/", origin));
```

The regex is the fix; this assertion is what makes the next encoding trick a non-event.

- [ ] **Step 4: Verify**

`pnpm --filter @cardstack/studio test` and `pnpm typecheck`. `studio-session.test.ts` must still pass.

---

## Task 2: Signing secret becomes a verify-list (A3, migration step 1)

**Files:**
- Modify: `apps/studio/lib/studio-session.ts:41-51`, `:104-118`
- Modify: `apps/studio/middleware.ts:19-34`, `apps/studio/lib/auth.ts:56-57`, `app/api/auth/salesforce/callback/route.ts:45-48`, `app/api/session/route.ts:16,92`
- Test: `apps/studio/lib/studio-session.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `sessionSigningSecrets(env): string[]` (sign with `[0]`, verify against all) replacing `sessionSigningSecret`. `readStudioSession` accepts `string | string[]`.

- [ ] **Step 1: Write the failing tests**

Append to `studio-session.test.ts`:

```ts
it("verifies a cookie signed with a retired secret", async () => {
  const cookie = await createStudioSession("sid", "old-secret");
  expect(await readStudioSession(cookie, ["new-secret", "old-secret"])).toBe("sid");
});

it("signs with the FIRST secret only", async () => {
  const cookie = await createStudioSession("sid", "new-secret");
  expect(await readStudioSession(cookie, ["old-secret"])).toBeUndefined();
});

it("fails closed on an empty list", async () => {
  const cookie = await createStudioSession("sid", "s");
  expect(await readStudioSession(cookie, [])).toBeUndefined();
});
```

Add, as `it.todo` for now and enabled in Task 11 step 6:

```ts
it.todo("does not accept STUDIO_SHARED_SECRET as a signing secret");
```

Do **not** remove the fallback in this task. Spec section 5 step 1 requires both to be accepted for a 14-day window.

- [ ] **Step 2: Implement**

```ts
export function sessionSigningSecrets(env = process.env): string[] {
  return [env.CARDSTACK_SESSION_SECRET?.trim(), env.STUDIO_SHARED_SECRET?.trim()]
    .filter((s): s is string => !!s);
}
```

`readStudioSession` verifies against each in turn, still constant-time per comparison, still checking the `issuedAt` bounds first so an expired cookie short-circuits before any HMAC work.

- [ ] **Step 3: Update all five call sites** to use the list and to keep failing closed when it is empty. `middleware.ts` must still return 503 in production and pass through in dev.

- [ ] **Step 4: Verify** — `pnpm --filter @cardstack/studio test`, `pnpm typecheck`.

---

## Task 3: Rate limits, audit, and an Origin check on Studio (A3, B2, B3, B4)

**Files:**
- Create: `apps/studio/lib/rate-limit.ts`, `apps/studio/lib/rate-limit.test.ts`
- Modify: `apps/studio/app/api/session/route.ts:15-27`, `app/api/auth/salesforce/start/route.ts:24-58`
- Modify: `apps/studio/middleware.ts:16`

**Interfaces:**
- Consumes: the audit log used by Studio's audit page.
- Produces: `rateLimited(key, opts): boolean`, `sameOriginRequest(req): boolean`.

- [ ] **Step 1: Write the failing tests** — the limiter opens a fresh window after expiry, counts per key, and does not leak across keys; `sameOriginRequest` accepts a missing `Origin` (same-origin navigation and some clients omit it) and rejects a foreign one.

- [ ] **Step 2: Implement the limiter** — fixed window, in-memory, opportunistic prune, mirroring `apps/mcp-server/src/main.ts:180-195`. Studio may run multiple instances, so this is per-instance and therefore a speed bump, not a wall. That is the honest scope: it converts unlimited online guessing into rate-limited online guessing. State it in the module header rather than overselling it.

- [ ] **Step 3: Apply to `POST /api/session`** — limit by IP, and **write an audit entry on every failed attempt** including the source IP. A brute force against the access key currently leaves no trace whatsoever; that matters more than the limit itself.

- [ ] **Step 4: Apply to `GET /api/auth/salesforce/start`** — closes B4's unauthenticated KV-write amplification.

- [ ] **Step 5: Add the `Origin` check to mutating routes** — defense in depth behind `SameSite=Lax`. Reject POST/PUT/DELETE whose `Origin` is present and is not the Studio origin.

- [ ] **Step 6: Fix `isPublic` (B3)** — `path.includes("/oauth/callback")` becomes an exact match against the four known callback paths. Not exploitable today, but the gate's correctness should not be a property of the route table.

- [ ] **Step 7: Verify** — `pnpm --filter @cardstack/studio test`, `pnpm typecheck`.

---

## Task 4: The Studio choke point and idle expiry (A5, C4)

> **Ships with Task 5.** Do not merge alone.

**Files:**
- Modify: `apps/studio/lib/auth.ts:64-81`
- Modify: `apps/studio/lib/studio-session.ts:24,32-38`
- Modify: `apps/studio/app/api/session/route.ts:62-81`
- Test: `apps/studio/lib/auth.test.ts` (create)

**Interfaces:**
- Consumes: `getMembership` (already read at `:74`).
- Produces: `resolveSessionId` returning `null` for a non-admin or idle session. `StudioSessionRecord` gains `lastSeenAt: string`.

- [ ] **Step 1: Write the failing tests**

Create `apps/studio/lib/auth.test.ts` against an in-memory store:

```ts
it("refuses to resolve a session whose membership is now member", async () => {
  await store.setMembership({ accountId: "a1", workspaceId: "w1", role: "member", createdAt: NOW });
  expect(await resolveSessionId("sid")).toBeNull();
});

it("refuses a session whose membership was removed", async () => { /* existing behavior, pinned */ });

it("resolves an admin session", async () => { /* ... */ });

it("refuses a session idle past the window", async () => {
  await store.kvSet(STUDIO_SESSION_NS, "sid", { ...record, lastSeenAt: longAgo }, farFuture);
  expect(await resolveSessionId("sid")).toBeNull();
});

it("refreshes lastSeenAt at most once per throttle interval", async () => {
  // two rapid calls produce one write
});
```

- [ ] **Step 2: Add the role gate** — the single line from spec section 2.2, immediately after the existing `if (!account || !workspace || !membership) return null;`. This is the whole of A5's fix. Resist adding a per-route `requireAdmin` helper alongside it: 26 call sites is the failure mode the finding describes, and the choke point makes them unnecessary.

- [ ] **Step 3: Add idle expiry** — `IDLE_TIMEOUT_SECONDS` and `LAST_SEEN_THROTTLE_SECONDS` beside `SESSION_MAX_AGE_SECONDS`. `resolveSessionId` reads `lastSeenAt`, refuses when stale, and otherwise writes it back only when older than the throttle. Keep the KV `expiresAt` pinned to the absolute cap so the record still hard-expires at 14 days.

- [ ] **Step 4: Make `/api/session` read the role it wrote** — replace both hardcoded `role: "admin"` literals (`:65`, `:77`) with the membership the bridge just upserted. The bridge still *grants* admin; it stops *asserting* it independently of the store.

- [ ] **Step 5: Correct the two false claims** — `studio-session.ts:16-17` and `docs/accounts-and-workspaces.md:63-66` say role changes take effect immediately. After this task that is true for Studio and, after Task 8, true for MCP. Say which lane and why.

- [ ] **Step 6: Verify** — the full Studio suite plus `pnpm typecheck`.

---

## Task 5: The people page (A2 mitigation, spec section 2.5)

> **Ships with Task 4.** This page is the *only* recovery path from a
> mis-administered workspace, which is why it is not deferred.

**Files:**
- Create: `apps/studio/app/api/people/route.ts`, `apps/studio/app/api/people/[accountId]/role/route.ts`, `apps/studio/app/people/page.tsx`, `apps/studio/lib/admins.ts`
- Create: `apps/studio/scripts/backfill-workspace-admins.ts`
- Modify: the nav shell (12b) to add the People entry
- Test: `apps/studio/app/api/people/[accountId]/role/route.test.ts`

**Interfaces:**
- Consumes: `listMembershipsForWorkspace`, `getAccount`, `setMembership`, the audit log.
- Produces: `workspaceAdmins(store, workspaceId): Promise<Account[]>` from `lib/admins.ts`, used here and by Tasks 6 and 10.

- [ ] **Step 1: Write the failing tests** — the last-admin guard is the whole security surface of this task:

```ts
it("refuses to demote the only admin", async () => {
  const res = await POST(req({ role: "member" }), { params: { accountId: "a1" } });
  expect(res.status).toBe(409);
  expect(await store.getMembership("a1", "w1")).toMatchObject({ role: "admin" });
});

it("refuses to demote yourself when you are the only admin", async () => { /* same, self-targeted */ });
it("allows demoting an admin when another remains", async () => { /* ... */ });
it("refuses to act on an account outside this workspace", async () => { /* cross-tenant guard */ });
it("writes an audit entry for every role change", async () => { /* ... */ });
```

- [ ] **Step 2: Implement the role route** — read the current membership set, apply the guard **server-side** before writing, write the audit entry, return the updated list. The guard is a store read-then-check inside the handler, not a UI affordance. Scope every lookup to the session's workspace so this route cannot reach another tenant's memberships.

- [ ] **Step 3: Implement the list route and page** — name, email, role, joined date. Promote and demote controls; the demote control on the last admin is disabled *and* the server refuses it.

- [ ] **Step 4: Write the backfill script** — a read-only report of workspaces with zero admins, plus an opt-in `--apply` that promotes the earliest membership in each. This is the pre-deploy gate for spec section 5 step 2. Report-only must be the default.

- [ ] **Step 5: Verify** — Studio suite, `pnpm typecheck`, `pnpm lint`.

---

## Task 6: Name the admin in the lockout message (A2, spec section 2.4)

**Files:**
- Modify: `apps/studio/app/api/auth/salesforce/callback/route.ts:73-78`
- Modify: `apps/studio/app/login/page.tsx` to render the structured error

**Interfaces:**
- Consumes: `workspaceAdmins` (Task 5).
- Produces: nothing new.

- [ ] **Step 1: Write the failing test** — a non-admin sign-in returns copy containing an admin's name and email, and does **not** set a session cookie.

- [ ] **Step 2: Implement** — look up the admins and build the message from spec section 2.4. Cap at three names plus "and N others" so a large workspace does not produce a wall of text. If the lookup fails, degrade to today's generic copy rather than failing the sign-in.

- [ ] **Step 3: Verify** — Studio suite, `pnpm typecheck`.

---

## Task 7: Consent for unrecognized clients, and the sandbox picker (A1, C2)

**Files:**
- Create: `apps/mcp-server/src/consent.ts`, `apps/mcp-server/src/consent.test.ts`
- Modify: `apps/mcp-server/src/oauth-provider.ts:201-250`, `:258-331`
- Modify: `apps/mcp-server/src/main.ts:156-172`

**Interfaces:**
- Consumes: `PendingAuth`, the store's KV, and `signState`/`verifyState` from `confirm-token.ts` **as a signing primitive only** — no confirmation semantics are involved and hard rule 8 is not in play.
- Produces: `isFirstPartyClient(client, env)`, `consentKey(accountId, clientId)`, `renderConsent(...)`, `renderLoginHostPicker(...)`.

- [ ] **Step 1: Write the failing tests**

```ts
describe("isFirstPartyClient", () => {
  it("requires EVERY registered redirect_uri to be trusted", () => {
    expect(isFirstPartyClient(
      { redirect_uris: ["https://claude.ai/cb", "https://evil.example/cb"] },
      { CARDSTACK_TRUSTED_CLIENT_ORIGINS: "https://claude.ai" },
    )).toBe(false);
  });

  it("is false when no origins are configured", () => {
    expect(isFirstPartyClient({ redirect_uris: ["https://claude.ai/cb"] }, {})).toBe(false);
  });

  it("matches on origin, not on prefix", () => {
    expect(isFirstPartyClient(
      { redirect_uris: ["https://claude.ai.evil.example/cb"] },
      { CARDSTACK_TRUSTED_CLIENT_ORIGINS: "https://claude.ai" },
    )).toBe(false);
  });
});
```

And the provider-level tests that pin A1 shut:

```ts
it("does not mint an authorization code for an unknown client until consent is posted", async () => {
  const { redirect } = await provider.completeSalesforceCallback(state, "sf-code");
  expect(redirect).toContain("/oauth/consent");
  expect(redirect).not.toContain("code=");
});

it("mints the code after a valid consent post", async () => { /* ... */ });
it("rejects a consent post with a tampered continuation token", async () => { /* ... */ });
it("skips consent for a first-party client", async () => { /* ... */ });
it("escapes client_name in the rendered interstitial", async () => { /* attacker-controlled */ });
```

- [ ] **Step 2: Split `completeSalesforceCallback`** into the half that resolves identity and persists the per-user connection, and the half that mints the code. The identity half runs before consent (the screen needs the signer's name); the minting half runs only after.

Store the resolved-but-unconsented state in KV under a fresh key with a short TTL, and hand the browser a signed continuation token bound to that key. **Deleting the pending record before doing any work is what makes the flow single-use** — preserve that ordering through the split.

- [ ] **Step 3: Render the interstitial** — plain HTML from the MCP server, no framework. Content per spec section 3.1: signer name and email, workspace name, client name, and **the redirect origin the token will be sent to** on its own line. Escape everything: `client_name` is attacker-controlled and goes into HTML.

- [ ] **Step 4: Handle the consent POST** — verify the continuation token, mint the code, redirect to the client. Record consent under `(accountId, clientId)` with the refresh TTL so repeat authorizations skip the screen. Cancel deletes the record and redirects with `error=access_denied` per RFC 6749 section 4.1.2.1.

- [ ] **Step 5: Add the sandbox picker (C2)** — when `CARDSTACK_SF_LOGIN_URL` is unset, `authorize()` renders a two-button Production/Sandbox page and stores the choice on `PendingAuth.sfLoginUrl` before bouncing. When it is set, behavior is unchanged. This runs *before* the Salesforce leg, unlike consent.

- [ ] **Step 6: Verify** — `pnpm --filter @cardstack/mcp-server test`, `pnpm typecheck`. The existing four `oauth-provider.test.ts` tests must still pass; update them for the split only where their assertions genuinely changed.

---

## Task 8: MCP tokens resolve identity live, and fail closed (A4, B1)

**Files:**
- Modify: `apps/mcp-server/src/oauth-provider.ts:74-92`, `:314-331`, `:380-424`
- Modify: `apps/mcp-server/src/main.ts:208-215`
- Test: `apps/mcp-server/src/oauth-provider.test.ts`

**Interfaces:**
- Consumes: `getMembership`.
- Produces: `StoredToken` carrying `accountId` + `workspaceId`; `verifyAccessToken` throwing `InvalidTokenError` when the membership is gone.

- [ ] **Step 1: Write the failing tests**

```ts
it("rejects a token whose membership was removed", async () => {
  const { access_token } = await mintFor("a1", "w1");
  await removeMembership("a1", "w1");
  await expect(provider.verifyAccessToken(access_token)).rejects.toThrow(InvalidTokenError);
});

it("rejects a refresh grant whose membership was removed", async () => { /* ... */ });
it("reflects a display-name change without re-authorization", async () => { /* identity read, not frozen */ });
```

Plus the B1 fail-closed test at `main.ts`'s surface: a verified token carrying no user must produce 401, **not** the legacy tenant.

- [ ] **Step 2: Change the stored shape** — keep `user` as a display cache; add `accountId`/`workspaceId` as the authoritative pair.

  **Migration decision, required before merging.** Tokens minted before this change carry no `accountId`. Two options: (a) treat them as unverifiable and 401, costing every live rep one re-authorization on deploy day; or (b) derive the pair from the cached `user` on first read and rewrite the record, costing nothing. **(b) is preferred** — `user.tenantId` and `user.userId` are exactly that pair, and they were written by `resolveSignIn`. Implement (b) with a test pinning it. Fall back to (a) only if the derivation turns out ambiguous, and escalate before choosing it.

- [ ] **Step 3: Resolve live in `verifyAccessToken`** — one `getMembership` on a path that already does two store reads. Do the same in `exchangeRefreshToken` so a removed user cannot refresh their way back in.

- [ ] **Step 4: Fail closed in `main.ts`** — when `oauthProvider` is set, a request whose `req.auth.extra.user` is absent returns 401 and must never fall through to `userContextFromHeaders`. That fall-through is the B1 finding.

- [ ] **Step 5: Verify** — MCP suite, `pnpm typecheck`, and `pnpm demo:m1 && pnpm demo:m2` (the demos run without OAuth mode and must be unaffected).

---

## Task 9: Refresh-token rotation with reuse detection (B5)

**Files:**
- Create: `apps/mcp-server/src/token-family.ts`, `apps/mcp-server/src/token-family.test.ts`
- Modify: `apps/mcp-server/src/oauth-provider.ts:366-410`, `:426-435`

**Interfaces:**
- Consumes: the store's KV.
- Produces: `rotate(...)`, `detectReuse(...)`, `revokeFamily(accountId, clientId)`.

> **Scope guard.** This task concerns Cardstack's own opaque bearer tokens. It must not modify `exchangeSalesforceAuthorizationCode`, `SalesforceAdapter`'s refresh path, `onCredentialsRefreshed`, or `getFreshCredentials`. The Salesforce grant family is out of scope: that connected app rotates with reuse detection, and a careless change there revokes the live deployment's entire grant family.

- [ ] **Step 1: Write the failing tests**

```ts
it("issues a NEW refresh token on every refresh", async () => { /* ... */ });
it("invalidates the old refresh token after rotation", async () => { /* ... */ });
it("revokes the whole family when a rotated token is presented again", async () => { /* ... */ });
it("rotates a pre-rotation token normally on first use", async () => {
  // Migration safety: tokens issued before this task have no family record.
  // Treating them as reuse would revoke every live rep on deploy day.
});
it("stops extending past the absolute cap", async () => { /* 90d from family creation */ });
```

Write that fourth test first. It is the one protecting the live deployment.

- [ ] **Step 2: Implement rotation** — new refresh token, delete old, in that order. Extend the TTL on use, up to a 90-day absolute cap measured from family creation. This turns B5's accidental 30-day non-extension into a stated policy: an active rep re-authorizes quarterly, an inactive one falls off at 30 days.

- [ ] **Step 3: Implement reuse detection** — a presented refresh token that is unknown *but* matches a recently-rotated value revokes every access and refresh token in the family and forces a fresh `/authorize`.

- [ ] **Step 4: Widen `revokeToken`** — revoking either token kills the family, not just the value presented.

- [ ] **Step 5: Verify** — MCP suite, `pnpm typecheck`.

---

## Task 10: The re-auth card tells the truth (C1)

**Files:**
- Modify: `packages/core` — `ErrorPayload` gains `reauth?: { kind: "user" | "admin"; url?: string; adminName?: string }`
- Modify: `apps/mcp-server/src/main.ts:260-301`, `apps/mcp-server/src/server.ts:340-372`
- Modify: `packages/widgets/src/shared/components.tsx:187-205`
- Create: `apps/studio/app/me/connection/page.tsx`; modify `apps/studio/middleware.ts` and the page's identity call
- Test: the widget suite if one exists by then; otherwise `packages/core` covers the payload shape and the MCP suite covers the branch

**Interfaces:**
- Consumes: `workspaceAdmins` (Task 5).
- Produces: the `reauth` discriminator.

- [ ] **Step 1: Write the failing tests** — a missing *user* connection produces `reauth.kind === "user"`; a broken *admin* connection produces `reauth.kind === "admin"` with the admin's name. Assert the `user` case's copy does **not** point at `/connections`, which is the dead end C1 describes.

- [ ] **Step 2: Set the discriminator server-side** — `main.ts:260-301` already branches on exactly this distinction; carry it into `runtimeAuth` and through `asToolError`.

- [ ] **Step 3: Render the two cases** — per spec section 3.4. The `user` case's button stops claiming to reconnect and says what actually works. The `admin` case names the person who can act.

- [ ] **Step 4: Add `/me/connection`** — the single member-reachable Studio page. Implement the exception as an explicit allowance at the page's own identity call, **not** as a hole in `resolveSessionId` — the choke point stays absolute. The page reads and writes only the signed-in account's own `UserConnectionState`.

- [ ] **Step 5: Verify** — `pnpm test`, `pnpm typecheck`, `pnpm --filter @cardstack/widgets test` (which also runs the CSS-coverage check).

---

## Task 11: Retire and narrow the bypasses (spec section 6)

**Files:**
- Modify: `apps/mcp-server/src/auth.ts:25-28,30-59`
- Modify: `apps/studio/lib/auth.ts:48,117-143`
- Modify: `apps/mcp-server/src/main.ts:118-129`
- Modify: `apps/studio/lib/studio-session.ts`, `app/api/session/route.ts`

**Interfaces:** none new.

- [ ] **Step 1: Delete `CARDSTACK_ALLOW_HEADER_IDENTITY`** — the flag and the production branch it guards. Nothing in the repo sets it and the docs already say never to. Header identity survives only under the new dev gate.

- [ ] **Step 2: Gate both dev fallbacks on `CARDSTACK_DEV_IDENTITY=1`** in addition to `NODE_ENV !== "production"`, and **stop reading headers and cookies** in `devUserContext` — env vars only, so no *request* can drive identity even locally. Update `pnpm dev`, `dev:sf`, the five demo scripts, and `seed-from-salesforce.ts` to set it.

- [ ] **Step 3: Remove `CARDSTACK_TENANT_ID` as a request default** at `mcp-server/auth.ts:53` and `studio/lib/auth.ts:131`. Keep it as the legacy bridge's workspace id. CLAUDE.md:47 already claims it is not a request default; make that true.

- [ ] **Step 4: Arm the MCP legacy connected-app fallback only when `CARDSTACK_TENANT_ID` is explicitly set** — `main.ts:127` currently defaults it to `DEMO_TENANT_ID`, arming the fallback on every deployment including ones that never had a legacy tenant.

- [ ] **Step 5: Guard `POST /api/session`** — refuse once the target workspace has a Salesforce-signed admin (an account whose `salesforceUserId` is not a `legacy-user-` synthetic). This makes the bridge self-retiring rather than a permanent second door.

- [ ] **Step 6: Drop the `STUDIO_SHARED_SECRET` signing fallback** — this is spec section 5 step 5 and **must not be merged until 14 days after Task 2 is deployed**. Enable the `it.todo` from Task 2. Flag this step for explicit human confirmation that the window has elapsed: it is the one step in the plan that can log people out.

- [ ] **Step 7: Verify** — full suite, `pnpm typecheck`, and all five demos.

---

## Task 12: Onboarding edges (spec sections 4.2, 4.3, 4.5)

**Files:**
- Modify: `apps/mcp-server/src/main.ts:163-172`, `apps/studio/app/login/page.tsx`
- Modify: Studio's home and empty states for an unconnected workspace
- Modify: the workspace header to surface `PortalInfo.isSandbox`

**Interfaces:** none new.

- [ ] **Step 1: Recognize the "cannot authorize a connected app" error** — match Salesforce's specific refusals and replace them with copy naming the connected app, its consumer key, and the setting to change (Manage, then Permitted Users, then "All users may self-authorize" — or pre-authorize a profile). Everything needed is in `cardstackSalesforceLoginApp()`. Unrecognized errors keep today's passthrough.

- [ ] **Step 2: Make "unconnected workspace" a first-class state** — Studio's home shows the connect flow instead of an error; the MCP lane returns a typed actionable error. No trial timer, no billing state, no new table: "unconnected" is the trial.

- [ ] **Step 3: Explain the sandbox/production split** — the workspace header says which instance it is; the empty state says cards do not carry across orgs. Do **not** build config sync; it is a conflict-model feature, not a login feature, and it is explicitly out of scope in spec section 4.5.

- [ ] **Step 4: Verify** — Studio suite, `pnpm typecheck`, `pnpm lint`.

---

## Task 13: Correct the documentation

**Files:** `docs/accounts-and-workspaces.md`, `CLAUDE.md`

- [ ] **Step 1: Fix the revocation claim** — `:63-66` asserts immediate effect without qualification; that was true of neither role changes nor the MCP lane. State what is true after Tasks 4 and 8, per lane.

- [ ] **Step 2: Fix the scope mismatch (B7)** — `:104` documents `offline_access`; `salesforce-adapter.ts:308` requests `api refresh_token`. Decide which is correct and make the other match. If `offline_access` is genuinely wanted, that is a connected-app change and a separate decision — record it rather than silently adding a scope.

- [ ] **Step 3: Document the new environment variables** — `CARDSTACK_TRUSTED_CLIENT_ORIGINS`, `CARDSTACK_DEV_IDENTITY`, the idle window, the refresh cap.

- [ ] **Step 4: Document the two lanes' authorization model** — the choke point per lane, why members hold no Studio session, and the one page that is an exception.

- [ ] **Step 5: Update CLAUDE.md's current-phase paragraph** to describe the shipped state.

---

## Task 14: Full verification

- [ ] **Step 1: Run everything**

```bash
pnpm test && pnpm typecheck && pnpm lint && pnpm build
```

- [ ] **Step 2: Run every golden path**

```bash
pnpm demo:m1 && pnpm demo:m2 && pnpm demo:m2.5 && pnpm demo:m3 && pnpm demo:m4
```

All five must pass. Task 11 changed how the demos obtain identity, so a failure here is most likely a missing `CARDSTACK_DEV_IDENTITY=1`.

- [ ] **Step 3: Confirm the five constraint suites**

```bash
pnpm vitest run \
  packages/config-store/src/tenant-isolation.test.ts \
  packages/config-store/src/sign-in.test.ts \
  apps/studio/lib/studio-session.test.ts \
  packages/crm-adapters/src/salesforce/identity.test.ts \
  apps/mcp-server/src/oauth-provider.test.ts
```

CLAUDE.md calls out `tenant-isolation.test.ts` by name.

- [ ] **Step 4: Re-walk the six findings** — for each of A1 through A6, name the test that fails if the fix is reverted. A finding with no such test is not closed, and reporting it closed anyway is the failure mode this step exists to prevent.

- [ ] **Step 5: Do not deploy** — out of scope, needs explicit confirmation. Spec section 5 has a mandatory 14-day window between Task 2 and Task 11 step 6, and a mandatory backfill before Tasks 4 and 5. Deploying out of order locks people out.

- [ ] **Step 6: Write the PR note** — cover: the accepted A2 risk and why the people page is its mitigation (spec section 8.1); the Task 8 migration choice and whether any rep needs to re-authorize; the deliberate non-changes in spec section 7; and that no change touches Salesforce refresh behavior or `confirm-token.ts`.
