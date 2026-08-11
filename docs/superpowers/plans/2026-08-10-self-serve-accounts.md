# Self-Serve Cardstack Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email-first Cardstack accounts (signup / sign-in / verify / reset), workspaces decoupled from Salesforce orgs with exclusive org claiming, "Continue with Salesforce" as a full peer lane with password-once linking, and removal of the org-as-workspace governance layer.

**Architecture:** The shipped session machinery (HMAC cookie + KV record, `resolveStudioSession` choke point) is kept byte-for-byte; signup/sign-in become new ways to *mint* a session. `Workspace.org_key` becomes nullable — setting it IS the exclusive org claim, enforced by the existing unique constraint. The MCP lane changes in exactly one place: `resolveSignIn` find-or-create becomes find-or-refuse.

**Tech Stack:** Next.js App Router (Studio), Express (MCP server), pnpm + turbo monorepo, vitest, Postgres via `DATABASE_URL` (file-backed store otherwise), `@node-rs/argon2` for password hashing, Resend HTTPS API for mail.

**Spec:** `docs/superpowers/specs/2026-08-10-self-serve-accounts-design.md` — read it before starting. Its §7 isolation invariants are hard requirements.

## Global Constraints

- `packages/config-store/src/tenant-isolation.test.ts` must pass at **every** commit (spec §8).
- Confirmation provenance (CLAUDE.md hard rule 8) is untouched — no task may modify `confirm-token.ts` or any write-tool gating.
- Auth pages never print env var names (spec §5); misconfiguration says "Sign-in is unavailable on this deployment" and details go to server logs.
- `@node-rs/argon2` is a native module: it may be imported from route handlers and `lib/` modules only — never from `apps/studio/middleware.ts` (edge runtime).
- Adapters never import from `apps/*` (CLAUDE.md hard rule 5); all identity logic lives in `packages/config-store` or `apps/studio/lib`.
- The Salesforce refresh-token hazard is untouched: no task reads, refreshes, or persists a Salesforce refresh token in any new way. `CARDSTACK_DEV_SF_ORG` and `readSalesforceCliToken` behavior are out of scope.
- New env vars: `RESEND_API_KEY`, `CARDSTACK_EMAIL_FROM` (both optional — absent means mail prints to stdout).
- Run all tests from the repo root with `pnpm test`, or per package with `pnpm --filter <name> test -- <file>`. Studio tests: `pnpm --filter @cardstack/studio test`. Config-store tests: `pnpm --filter @cardstack/config-store test`.
- Commit after every task (steps say when). Do not push.

---

### Task 1: Identity model — types and store methods (memory/file store)

**Files:**
- Modify: `packages/config-store/src/identity.ts`
- Modify: `packages/config-store/src/memory-store.ts` (identity section, ~lines 300–375)
- Test: `packages/config-store/src/identity-model.test.ts` (create)

**Interfaces:**
- Consumes: existing `Workspace`, `Account`, `Membership`, `IdentityStore` in `identity.ts`; `BaseConfigStore` state shape in `memory-store.ts` (`state.workspaces` / `state.accounts` / `state.memberships` records).
- Produces (later tasks rely on these exact names):
  - `Workspace` gains `ownerAccountId?: string`; `salesforceOrgId` becomes optional.
  - `Account` gains `email?: string` (unchanged), `passwordHash?: string`, `emailVerifiedAt?: string`, `passwordChangedAt?: string`; `salesforceUserId` becomes optional.
  - `salesforceIdKey(id: string): string` — 15-char lowercased prefix.
  - `newWorkspaceId(): string` — `ws_<16 base64url chars>`.
  - `type OrgClaimResult = { ok: true; workspace: Workspace } | { ok: false; reason: "org-already-claimed" }`
  - `IdentityStore` gains:
    - `getAccountByEmail(email: string): Promise<Account | undefined>` (case-insensitive)
    - `getWorkspaceByOwner(ownerAccountId: string): Promise<Workspace | undefined>`
    - `claimOrg(workspaceId: string, salesforceOrgId: string, orgName?: string): Promise<OrgClaimResult>`
    - `releaseOrg(workspaceId: string): Promise<void>`
    - `setWorkspaceOwner(workspaceId: string, ownerAccountId: string): Promise<void>` (operational — the attach script; never request-scoped)

- [ ] **Step 1: Write the failing test**

Create `packages/config-store/src/identity-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InMemoryConfigStore } from "./memory-store.js";
import { newWorkspaceId, salesforceIdKey, type Account, type Workspace } from "./identity.js";

const account = (id: string, email: string): Account => ({
  id,
  email,
  name: id,
  createdAt: new Date().toISOString(),
});

const ownedWorkspace = (id: string, ownerAccountId: string): Workspace => ({
  id,
  ownerAccountId,
  name: "My workspace",
  createdAt: new Date().toISOString(),
});

describe("identity model", () => {
  it("generates ws_-prefixed workspace ids and 15-char org keys", () => {
    expect(newWorkspaceId()).toMatch(/^ws_[A-Za-z0-9_-]{16}$/);
    expect(newWorkspaceId()).not.toEqual(newWorkspaceId());
    expect(salesforceIdKey("00D8Z000001aBcDEFG")).toBe("00d8z000001abcd");
  });

  it("finds accounts by email, case-insensitively", async () => {
    const store = new InMemoryConfigStore();
    await store.upsertAccount(account("dana@acme.example", "Dana@Acme.example"));
    expect((await store.getAccountByEmail("dana@acme.EXAMPLE"))?.id).toBe("dana@acme.example");
    expect(await store.getAccountByEmail("nobody@acme.example")).toBeUndefined();
  });

  it("creates a workspace without an org and finds it by owner", async () => {
    const store = new InMemoryConfigStore();
    const ws = ownedWorkspace(newWorkspaceId(), "dana@acme.example");
    await store.createWorkspace(ws);
    expect((await store.getWorkspaceByOwner("dana@acme.example"))?.id).toBe(ws.id);
    expect(await store.getWorkspaceByOwner("other@acme.example")).toBeUndefined();
  });

  it("claims an org exclusively: second workspace gets a conflict", async () => {
    const store = new InMemoryConfigStore();
    const a = ownedWorkspace("ws_a", "a@x.example");
    const b = ownedWorkspace("ws_b", "b@y.example");
    await store.createWorkspace(a);
    await store.createWorkspace(b);

    const first = await store.claimOrg("ws_a", "00D8Z000001aBcDEFG", "Acme Corp");
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.workspace.salesforceOrgId).toBe("00D8Z000001aBcDEFG");
      expect(first.workspace.name).toBe("Acme Corp");
    }
    // 15-char form of the same org must also conflict.
    const second = await store.claimOrg("ws_b", "00D8Z000001aBcD");
    expect(second).toEqual({ ok: false, reason: "org-already-claimed" });
    // Routing by org id resolves to the claiming workspace.
    expect((await store.getWorkspaceByOrgId("00D8Z000001aBcD"))?.id).toBe("ws_a");
    // Re-claiming your own org is idempotent, not a conflict.
    expect((await store.claimOrg("ws_a", "00D8Z000001aBcDEFG")).ok).toBe(true);
  });

  it("releases a claim so the org routes nowhere, then another workspace can claim it", async () => {
    const store = new InMemoryConfigStore();
    await store.createWorkspace(ownedWorkspace("ws_a", "a@x.example"));
    await store.createWorkspace(ownedWorkspace("ws_b", "b@y.example"));
    await store.claimOrg("ws_a", "00D8Z000001aBcDEFG");
    await store.releaseOrg("ws_a");
    expect(await store.getWorkspaceByOrgId("00D8Z000001aBcDEFG")).toBeUndefined();
    expect((await store.claimOrg("ws_b", "00D8Z000001aBcDEFG")).ok).toBe(true);
  });

  it("sets a workspace owner (attach script path)", async () => {
    const store = new InMemoryConfigStore();
    await store.createWorkspace({ id: "t_demo", name: "Legacy", createdAt: new Date().toISOString() });
    await store.setWorkspaceOwner("t_demo", "dana@acme.example");
    expect((await store.getWorkspaceByOwner("dana@acme.example"))?.id).toBe("t_demo");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @cardstack/config-store test -- identity-model`
Expected: FAIL — `newWorkspaceId` not exported; `getAccountByEmail` / `claimOrg` / `releaseOrg` / `setWorkspaceOwner` / `getWorkspaceByOwner` do not exist; `Account`/`Workspace` literals missing required `salesforceOrgId`/`salesforceUserId` fields (type errors count as failures here).

- [ ] **Step 3: Update `identity.ts`**

In `packages/config-store/src/identity.ts`:

1. Add at the top: `import { randomBytes } from "node:crypto";`
2. Replace the `Workspace` interface body:

```ts
/** A Cardstack workspace. `id` is the `tenantId` every other table is keyed by. */
export interface Workspace {
  /** The `tenantId` used across layouts, connections, audit. New ids are
   *  `ws_<random>`; legacy `sf_<orgid>` and `t_demo` ids remain valid forever —
   *  nothing parses a tenant id. */
  id: string;
  /** The claimed Salesforce org. ABSENT until the owner connects one; the
   *  claim is exclusive (spec §1) — uniqueness on the 15-char key is what
   *  enforces one-org-one-owner. */
  salesforceOrgId?: string;
  /** The account that owns this workspace. Absent only on legacy rows the
   *  attach-workspace script has not stamped yet. */
  ownerAccountId?: string;
  /** Display name: "My workspace" until an org claim renames it. */
  name: string;
  createdAt: string;
}
```

3. Replace the `Account` interface body:

```ts
/** A person. Root identity — created by email signup, by Salesforce signup,
 *  or as a rep runtime identity on the MCP lane. */
export interface Account {
  /** `normalizeUserId(email ?? username ?? sfUserId)` — matches `user_connections.user_id`. */
  id: string;
  /** Recorded when this account connects an org or signs in with Salesforce.
   *  Absent on email-only accounts. Unique when present. */
  salesforceUserId?: string;
  name: string;
  email?: string;
  /** argon2id hash. Absent on rep runtime identities and Salesforce-created
   *  accounts that never set one. NEVER serialized to clients. */
  passwordHash?: string;
  emailVerifiedAt?: string;
  /** Sessions created before this instant are dead (reset invalidation). */
  passwordChangedAt?: string;
  createdAt: string;
}
```

4. Add helpers (replace `workspaceIdForOrg`'s body to reuse the new key fn — keep `workspaceIdForOrg` exported; the MCP legacy bridge still uses it):

```ts
/** Salesforce returns 15- or 18-char ids for one entity; key on the lowercased 15. */
export const salesforceIdKey = (salesforceId: string): string =>
  salesforceId.slice(0, 15).toLowerCase();

export const workspaceIdForOrg = (salesforceOrgId: string): string =>
  `sf_${salesforceIdKey(salesforceOrgId)}`;

/** Id for a signup-created workspace. Opaque; the prefix is cosmetic. */
export const newWorkspaceId = (): string => `ws_${randomBytes(12).toString("base64url")}`;

export type OrgClaimResult =
  | { ok: true; workspace: Workspace }
  | { ok: false; reason: "org-already-claimed" };
```

5. Extend `IdentityStore` with the five new methods (exact signatures from the Interfaces block above), each with a one-line doc comment; mark `setWorkspaceOwner` "operational — never call from a request path" like `listWorkspaces`.
6. Update the module header comment: the model paragraphs describing "Salesforce is the identity provider" / "a workspace IS a Salesforce org" now describe the OLD model — replace with two sentences pointing at `docs/superpowers/specs/2026-08-10-self-serve-accounts-design.md` and stating: accounts are email-first, a workspace is owned by one account, and an org claim is exclusive.

- [ ] **Step 4: Implement in `memory-store.ts`**

In the identity section of `packages/config-store/src/memory-store.ts` (after `setMembership`), add — matching the store's existing load/save pattern (look at `createWorkspace` there for the exact `this.load()` / state-write idiom and copy it):

```ts
async getAccountByEmail(email: string): Promise<Account | undefined> {
  const state = await this.load();
  const needle = email.trim().toLowerCase();
  return Object.values(state.accounts ?? {}).find(
    (a) => a.email?.trim().toLowerCase() === needle,
  );
}

async getWorkspaceByOwner(ownerAccountId: string): Promise<Workspace | undefined> {
  const state = await this.load();
  return Object.values(state.workspaces ?? {}).find((w) => w.ownerAccountId === ownerAccountId);
}

async claimOrg(
  workspaceId: string,
  salesforceOrgId: string,
  orgName?: string,
): Promise<OrgClaimResult> {
  const state = await this.load();
  const key = salesforceIdKey(salesforceOrgId);
  const holder = Object.values(state.workspaces ?? {}).find(
    (w) => w.salesforceOrgId && salesforceIdKey(w.salesforceOrgId) === key,
  );
  if (holder && holder.id !== workspaceId) return { ok: false, reason: "org-already-claimed" };
  const workspace = state.workspaces?.[workspaceId];
  if (!workspace) throw new Error(`Unknown workspace: ${workspaceId}`);
  const updated: Workspace = {
    ...workspace,
    salesforceOrgId,
    ...(orgName?.trim() ? { name: orgName.trim() } : {}),
  };
  state.workspaces = { ...(state.workspaces ?? {}), [workspaceId]: updated };
  await this.save(state);
  return { ok: true, workspace: updated };
}

async releaseOrg(workspaceId: string): Promise<void> {
  const state = await this.load();
  const workspace = state.workspaces?.[workspaceId];
  if (!workspace) return;
  const { salesforceOrgId: _released, ...rest } = workspace;
  state.workspaces = { ...(state.workspaces ?? {}), [workspaceId]: rest as Workspace };
  await this.save(state);
}

async setWorkspaceOwner(workspaceId: string, ownerAccountId: string): Promise<void> {
  const state = await this.load();
  const workspace = state.workspaces?.[workspaceId];
  if (!workspace) throw new Error(`Unknown workspace: ${workspaceId}`);
  state.workspaces = {
    ...(state.workspaces ?? {}),
    [workspaceId]: { ...workspace, ownerAccountId },
  };
  await this.save(state);
}
```

Adjust the module's imports (`salesforceIdKey`, `OrgClaimResult`). If the store's write idiom differs from `this.save(state)` (check `createWorkspace` in the same file), match the file's idiom exactly. Also update the existing `getWorkspaceByOrgId` and `createWorkspace` in this file to guard `w.salesforceOrgId` being optional (`w.salesforceOrgId && salesforceIdKey(...)`).

- [ ] **Step 5: Fix type fallout across the monorepo**

Run: `pnpm typecheck`
Expected failures to fix mechanically (do not change behavior):
- Any construction of `Workspace` with `salesforceOrgId` still typechecks (now optional) — but code that READS `workspace.salesforceOrgId` without a guard may error under `exactOptionalPropertyTypes`; add guards.
- `apps/mcp-server/src/oauth-provider.ts:419-424` constructs a legacy workspace — still valid.
- `apps/studio/lib/admins.ts` and others reading `Account.salesforceUserId` — guard as optional. (These modules are deleted in Task 12; minimal guards now keep the build green.)

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter @cardstack/config-store test -- identity-model` then `pnpm --filter @cardstack/config-store test`
Expected: identity-model PASSES; the full config-store suite PASSES (tenant-isolation included — nothing behavioral changed yet).

- [ ] **Step 7: Commit**

```bash
git add packages/config-store/src apps
git commit -m "feat(config-store): email-first identity model with exclusive org claiming"
```

---

### Task 2: Postgres store parity

**Files:**
- Modify: `packages/config-store/src/postgres-store.ts` (DDL block ~lines 184–243; identity methods ~lines 735–835)

**Interfaces:**
- Consumes: Task 1's `salesforceIdKey`, `OrgClaimResult`, widened `Workspace`/`Account`.
- Produces: `PostgresConfigStore` implements the five new `IdentityStore` methods with the same semantics as the memory store; org-claim uniqueness enforced by the DB constraint (error code `23505` → conflict result).

- [ ] **Step 1: Add the idempotent DDL migration**

Append to the DDL string in `postgres-store.ts` (after the 2026-08-10 staging block, with a dated comment):

```sql
-- Self-serve accounts migration (2026-08-10, spec: docs/superpowers/specs/
-- 2026-08-10-self-serve-accounts-design.md). Additive + idempotent:
-- * org_key becomes NULLABLE: a workspace now starts unconnected, and setting
--   org_key IS the exclusive claim (the existing UNIQUE enforces it; Postgres
--   allows many NULLs under a unique constraint).
-- * sf_user_key becomes NULLABLE: email-created accounts have no SF user yet.
ALTER TABLE workspaces ALTER COLUMN org_key DROP NOT NULL;
ALTER TABLE accounts ALTER COLUMN sf_user_key DROP NOT NULL;
```

(Everything else — `ownerAccountId`, `passwordHash`, `emailVerifiedAt`, `passwordChangedAt` — rides the existing `config` jsonb column; no DDL.)

- [ ] **Step 2: Implement the methods**

In the identity section of `PostgresConfigStore` (replace the private `idKey` helper's uses with the imported `salesforceIdKey` and delete `idKey`):

```ts
async getAccountByEmail(email: string): Promise<Account | undefined> {
  await this.ready;
  const { rows } = await this.sql.query(
    "SELECT config FROM accounts WHERE lower(config->>'email') = lower($1) LIMIT 1",
    [email.trim()],
  );
  return rows[0] ? this.parse<Account>(rows[0].config) : undefined;
}

async getWorkspaceByOwner(ownerAccountId: string): Promise<Workspace | undefined> {
  await this.ready;
  const { rows } = await this.sql.query(
    "SELECT config FROM workspaces WHERE config->>'ownerAccountId' = $1 LIMIT 1",
    [ownerAccountId],
  );
  return rows[0] ? this.parse<Workspace>(rows[0].config) : undefined;
}

/**
 * The unique constraint on org_key IS the claim's enforcement: the race
 * between two owners claiming one org is decided by the database, and the
 * loser gets a typed conflict, never a partial write (spec §7).
 */
async claimOrg(
  workspaceId: string,
  salesforceOrgId: string,
  orgName?: string,
): Promise<OrgClaimResult> {
  await this.ready;
  const workspace = await this.getWorkspace(workspaceId);
  if (!workspace) throw new Error(`Unknown workspace: ${workspaceId}`);
  const updated: Workspace = {
    ...workspace,
    salesforceOrgId,
    ...(orgName?.trim() ? { name: orgName.trim() } : {}),
  };
  try {
    await this.sql.query("UPDATE workspaces SET org_key=$2, config=$3 WHERE id=$1", [
      workspaceId,
      salesforceIdKey(salesforceOrgId),
      JSON.stringify(updated),
    ]);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, reason: "org-already-claimed" };
    }
    throw error;
  }
  return { ok: true, workspace: updated };
}

async releaseOrg(workspaceId: string): Promise<void> {
  await this.ready;
  const workspace = await this.getWorkspace(workspaceId);
  if (!workspace) return;
  const { salesforceOrgId: _released, ...rest } = workspace;
  await this.sql.query("UPDATE workspaces SET org_key=NULL, config=$2 WHERE id=$1", [
    workspaceId,
    JSON.stringify(rest),
  ]);
}

async setWorkspaceOwner(workspaceId: string, ownerAccountId: string): Promise<void> {
  await this.ready;
  const workspace = await this.getWorkspace(workspaceId);
  if (!workspace) throw new Error(`Unknown workspace: ${workspaceId}`);
  await this.sql.query("UPDATE workspaces SET config=$2 WHERE id=$1", [
    workspaceId,
    JSON.stringify({ ...workspace, ownerAccountId }),
  ]);
}
```

Also update the two existing writers for optional fields:

```ts
// createWorkspace: org_key may now be NULL
[workspace.id, workspace.salesforceOrgId ? salesforceIdKey(workspace.salesforceOrgId) : null, JSON.stringify(workspace)]

// upsertAccount: sf_user_key may now be NULL
[account.id, account.salesforceUserId ? salesforceIdKey(account.salesforceUserId) : null, JSON.stringify(account)]
```

And update the DDL comment above `workspaces` (lines ~184–189): it asserts "A workspace IS a Salesforce org" — rewrite to describe the claim model with a pointer to the spec.

- [ ] **Step 3: Typecheck and run the suite**

Run: `pnpm --filter @cardstack/config-store typecheck 2>/dev/null || pnpm typecheck` then `pnpm --filter @cardstack/config-store test`
Expected: PASS. (`postgres-store.test.ts` exercises Postgres only when its harness's database is available; the memory-store tests from Task 1 are the identity-semantics reference. The DDL is idempotent — `DROP NOT NULL` re-runs safely.)

- [ ] **Step 4: Commit**

```bash
git add packages/config-store/src/postgres-store.ts
git commit -m "feat(config-store): postgres parity for ownership + exclusive org claims"
```

---

### Task 3: `resolveSignIn` — find-or-refuse, reps always members

**Files:**
- Modify: `packages/config-store/src/sign-in.ts`
- Modify: `packages/config-store/src/sign-in.test.ts`
- Modify: `packages/config-store/src/index.ts` (export `UnclaimedOrgError`)

**Interfaces:**
- Consumes: Task 1 types; existing `SalesforceIdentity`, `SignInStore`.
- Produces:
  - `class UnclaimedOrgError extends Error { readonly orgId: string }` — thrown when no workspace has claimed the signer's org. Task 13 catches it in the MCP server.
  - `resolveSignIn(store, identity, now?)` — same signature; never creates a workspace; membership role for NEW memberships is always `"member"`.

- [ ] **Step 1: Reshape the tests**

Rewrite `packages/config-store/src/sign-in.test.ts`. Keep the existing test-fixture idioms in the file (its `identity(...)` helper and store construction — read it first); the new cases:

```ts
// 1. "refuses a signer whose org no workspace has claimed" —
//    resolveSignIn(store, identity) rejects with UnclaimedOrgError carrying orgId.
// 2. "routes a signer to the workspace that claimed their org" —
//    create ws via createWorkspace + claimOrg (Task 1 API), then resolveSignIn
//    → returned workspace.id is the claiming workspace; membership role "member".
// 3. "keeps account id stable across profile changes" — KEEP the existing case
//    (unchanged behavior: id derived once, then found by salesforceUserId).
// 4. "converges the owner's chat sign-in onto their real account" —
//    upsertAccount({ id: "owner@acme.example", email, salesforceUserId: "005..." })
//    then resolveSignIn with a SalesforceIdentity carrying that salesforceUserId
//    but a DIFFERENT email → returned account.id is "owner@acme.example".
// 5. "never promotes: a signer into an empty claimed workspace is a member" —
//    claimed workspace with zero memberships; resolveSignIn → role "member".
```

Write all five as real vitest cases using the Task 1 store API (`createWorkspace` + `claimOrg` to set up a claimed org). Delete the old "first signer is admin" and "same-org auto-join creates the workspace" expectations.

- [ ] **Step 2: Run to verify the new cases fail**

Run: `pnpm --filter @cardstack/config-store test -- sign-in`
Expected: FAIL — `UnclaimedOrgError` not exported; resolveSignIn still creates workspaces and grants admin.

- [ ] **Step 3: Implement**

In `sign-in.ts`:

```ts
export class UnclaimedOrgError extends Error {
  readonly orgId: string;
  constructor(orgId: string, orgName?: string) {
    super(
      `No Cardstack workspace is connected to this Salesforce org${
        orgName ? ` (${orgName})` : ""
      } yet.`,
    );
    this.name = "UnclaimedOrgError";
    this.orgId = orgId;
  }
}
```

Replace `findOrCreateWorkspace` with:

```ts
/**
 * Find-or-REFUSE (spec §2). A workspace exists only because an account owner
 * claimed this org in Studio; a rep whose org is unclaimed gets a typed error
 * their chat host can render with guidance, never a silent empty workspace
 * they would be admin of.
 */
async function findClaimedWorkspace(
  store: SignInStore,
  identity: SalesforceIdentity,
): Promise<Workspace> {
  const existing = await store.getWorkspaceByOrgId(identity.orgId);
  if (!existing) throw new UnclaimedOrgError(identity.orgId, identity.orgName);
  return existing;
}
```

In `ensureMembership`, replace the first-signer-admin logic:

```ts
// Chat-lane population: always a member. Studio authority is ownership,
// checked at the Studio choke point — membership grants chat access only.
const role: Membership["role"] = "member";
await store.setMembership({ accountId, workspaceId, role, createdAt: now() });
return role;
```

(Keep returning `existing.role` for pre-existing memberships — legacy admin rows are harmless; nothing reads role for authority after Task 6.) Delete the now-unused `listMembershipsForWorkspace` call and, in `upsertAccount`, keep the existing id-stability logic unchanged. Update the module header: both lanes called this to find-or-create; now Studio's Salesforce lane resolves accounts itself (Task 9) and this is the MCP lane's resolver. Export `UnclaimedOrgError` from `index.ts` alongside the existing sign-in exports.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @cardstack/config-store test -- sign-in` then `pnpm --filter @cardstack/config-store test`
Expected: sign-in PASSES. **tenant-isolation and store tests may now FAIL if they relied on resolveSignIn creating workspaces — do not fix them here if the failure is the reshape Task 4 performs; if `tenant-isolation.test.ts` fails, proceed immediately to Task 4 in the same sitting and commit both together** (the global constraint is per-commit, not per-task-file).

- [ ] **Step 5: Commit (only if the full config-store suite is green; otherwise commit at the end of Task 4)**

```bash
git add packages/config-store/src
git commit -m "feat(config-store): resolveSignIn refuses unclaimed orgs; reps always members"
```

---

### Task 4: Tenant isolation reshaped — two accounts, two claims, one race

**Files:**
- Modify: `packages/config-store/src/tenant-isolation.test.ts`

**Interfaces:**
- Consumes: Task 1 store API, Task 3 `resolveSignIn` semantics.
- Produces: the security suite later tasks must keep green.

- [ ] **Step 1: Reshape the setup**

Read the existing file first (it has three tests, lines 40–120): it currently creates two workspaces by calling `resolveSignIn` for signers from two orgs. Reshape the setup to the new world while KEEPING every existing leak assertion:

```ts
// New setup helper at the top of the file:
async function claimedWorkspace(
  store: InMemoryConfigStore,
  ownerEmail: string,
  orgId: string,
  orgName: string,
): Promise<{ ownerId: string; workspaceId: string }> {
  const ownerId = ownerEmail; // normalizeUserId(email) is identity for plain emails
  await store.upsertAccount({ id: ownerId, email: ownerEmail, name: orgName, createdAt: new Date().toISOString() });
  const wsId = newWorkspaceId();
  await store.createWorkspace({ id: wsId, ownerAccountId: ownerId, name: "My workspace", createdAt: new Date().toISOString() });
  const claim = await store.claimOrg(wsId, orgId, orgName);
  if (!claim.ok) throw new Error("setup claim failed");
  return { ownerId, workspaceId: wsId };
}
```

- Test "gives two Salesforce orgs separate workspaces" → becomes "two accounts claiming two orgs get two workspaces": build both via `claimedWorkspace`, then `resolveSignIn` a rep from each org and assert each lands in the right workspace.
- Test "never leaks layouts, connections, or user tokens across workspaces" → setup changes to `claimedWorkspace`; every existing assertion body stays.
- Test "treats the 15- and 18-char forms of one org id as the same workspace" → claim with the 18-char id, `resolveSignIn` a rep presenting the 15-char form, assert same workspace.

- [ ] **Step 2: Add the two new isolation cases (spec §7/§8)**

```ts
it("decides a claim race by uniqueness: the loser gets a typed refusal and no data", async () => {
  const store = new InMemoryConfigStore();
  const a = await claimedWorkspace(store, "a@one.example", "00D111111111111AAA", "One");
  // Second owner, same org:
  await store.upsertAccount({ id: "b@two.example", email: "b@two.example", name: "B", createdAt: new Date().toISOString() });
  const wsB = newWorkspaceId();
  await store.createWorkspace({ id: wsB, ownerAccountId: "b@two.example", name: "My workspace", createdAt: new Date().toISOString() });
  expect(await store.claimOrg(wsB, "00D111111111111AAA")).toEqual({ ok: false, reason: "org-already-claimed" });
  // The loser's workspace holds nothing of the winner's:
  expect((await store.getWorkspaceByOrgId("00D111111111111AAA"))?.id).toBe(a.workspaceId);
  expect((await store.getWorkspace(wsB))?.salesforceOrgId).toBeUndefined();
});

it("re-claim after release moves the ROUTE, never the DATA (spec §7)", async () => {
  const store = new InMemoryConfigStore();
  const a = await claimedWorkspace(store, "a@one.example", "00D111111111111AAA", "One");
  // A's config exists under A's workspace id (reuse the file's existing layout-seeding idiom):
  // ...seed one layout for a.workspaceId exactly as the leak test does...
  await store.releaseOrg(a.workspaceId);
  const b = await claimedWorkspace(store, "b@two.example", "00D111111111111AAA", "One again");
  // Routing now reaches B's workspace:
  expect((await store.getWorkspaceByOrgId("00D111111111111AAA"))?.id).toBe(b.workspaceId);
  // ...assert B's workspace has NO layouts and A's workspace still has its layout,
  //    using the same read calls the existing leak test uses...
});
```

Fill the two `...` seams with the file's own existing seeding/reading idioms (it already seeds layouts and reads them per-tenant in the leak test — copy those exact calls).

- [ ] **Step 3: Run the security suite, then everything**

Run: `pnpm --filter @cardstack/config-store test -- tenant-isolation` then `pnpm --filter @cardstack/config-store test` then `pnpm typecheck`
Expected: ALL PASS. Fix any straggler in `store.test.ts` / `seed.ts` that assumed `salesforceOrgId` required (mechanical guards only).

- [ ] **Step 4: Commit**

```bash
git add packages/config-store/src
git commit -m "test(config-store): tenant isolation reshaped for account-owned workspaces + claim races"
```

---

### Task 5: Studio auth primitives — password, one-time tokens, mail

**Files:**
- Modify: `apps/studio/package.json` (add dependency `"@node-rs/argon2": "^2"`)
- Create: `apps/studio/lib/password.ts`
- Create: `apps/studio/lib/auth-tokens.ts`
- Create: `apps/studio/lib/mail.ts`
- Test: `apps/studio/lib/password.test.ts`, `apps/studio/lib/auth-tokens.test.ts`

**Interfaces:**
- Produces (used by Tasks 7–9):
  - `hashPassword(password: string): Promise<string>`
  - `verifyPassword(hash: string, password: string): Promise<boolean>` (false on malformed hash, never throws)
  - `burnTimingForMissingAccount(password: string): Promise<void>` (argon2 against a fixed dummy hash)
  - `MIN_PASSWORD_LENGTH = 10`, `MAX_PASSWORD_LENGTH = 256`
  - `EMAIL_VERIFY_NS = "studio-email-verify"`, `PASSWORD_RESET_NS = "studio-password-reset"`, `PENDING_LINK_NS = "studio-pending-link"`
  - `VERIFY_TTL_MS = 24h`, `RESET_TTL_MS = 30min`, `CLAIM_TTL_MS = 24h`, `LINK_TTL_MS = 10min`
  - `issueToken(store: KvStore, ns: string, payload: Record<string, unknown>, ttlMs: number): Promise<string>` (returns the RAW token; stores sha256(raw))
  - `consumeToken(store: KvStore, ns: string, raw: string): Promise<Record<string, unknown> | undefined>` (single-use: deletes on read)
  - `peekToken(store: KvStore, ns: string, raw: string): Promise<Record<string, unknown> | undefined>` (read WITHOUT consuming — the reset form's GET)
  - `type KvStore = Pick<AdminConfigStore, "kvGet" | "kvSet" | "kvDelete">`
  - `sendMail(input: { to: string; subject: string; text: string; html?: string }): Promise<void>`

- [ ] **Step 1: Add the dependency**

Run: `pnpm --filter @cardstack/studio add @node-rs/argon2`
Expected: lockfile updated, native binary fetched.

- [ ] **Step 2: Write the failing tests**

`apps/studio/lib/password.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, burnTimingForMissingAccount, MIN_PASSWORD_LENGTH } from "./password";

describe("password hashing", () => {
  it("round-trips and rejects wrong passwords", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "correct horse battery")).toBe(true);
    expect(await verifyPassword(hash, "wrong")).toBe(false);
  });
  it("returns false on malformed hashes instead of throwing", async () => {
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
  });
  it("burns comparable time for missing accounts", async () => {
    await expect(burnTimingForMissingAccount("anything")).resolves.toBeUndefined();
  });
  it("exports the NIST minimum", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(10);
  });
});
```

`apps/studio/lib/auth-tokens.test.ts` (use `InMemoryConfigStore` from `@cardstack/config-store` as the KvStore):

```ts
import { describe, expect, it } from "vitest";
import { InMemoryConfigStore } from "@cardstack/config-store";
import { consumeToken, issueToken, peekToken, PASSWORD_RESET_NS } from "./auth-tokens";

describe("one-time tokens", () => {
  it("issues an unguessable raw token and stores only its hash", async () => {
    const store = new InMemoryConfigStore();
    const raw = await issueToken(store, PASSWORD_RESET_NS, { accountId: "a@x.example" }, 60_000);
    expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes base64url
    expect(await store.kvGet(PASSWORD_RESET_NS, raw)).toBeUndefined(); // raw is NOT the key
  });
  it("peek does not consume; consume is single-use", async () => {
    const store = new InMemoryConfigStore();
    const raw = await issueToken(store, PASSWORD_RESET_NS, { accountId: "a@x.example" }, 60_000);
    expect(await peekToken(store, PASSWORD_RESET_NS, raw)).toEqual({ accountId: "a@x.example" });
    expect(await consumeToken(store, PASSWORD_RESET_NS, raw)).toEqual({ accountId: "a@x.example" });
    expect(await consumeToken(store, PASSWORD_RESET_NS, raw)).toBeUndefined();
  });
  it("expired tokens are dead", async () => {
    const store = new InMemoryConfigStore();
    const raw = await issueToken(store, PASSWORD_RESET_NS, { accountId: "a@x.example" }, -1);
    expect(await consumeToken(store, PASSWORD_RESET_NS, raw)).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @cardstack/studio test -- password auth-tokens`
Expected: FAIL — modules don't exist.

- [ ] **Step 4: Implement the three modules**

`apps/studio/lib/password.ts`:

```ts
/**
 * argon2id via @node-rs/argon2 (native — Node runtime only, NEVER import from
 * middleware.ts). Parameters are the OWASP argon2id baseline: m=19 MiB, t=2,
 * p=1. verifyPassword never throws: a malformed stored hash is "wrong
 * password", not a 500 a caller can distinguish.
 */
import { hash, verify } from "@node-rs/argon2";

const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 256;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

/**
 * Sign-in with an unknown email must cost the same as a wrong password —
 * otherwise response time answers "does this account exist" (spec §3).
 */
let dummyHash: Promise<string> | undefined;
export async function burnTimingForMissingAccount(password: string): Promise<void> {
  dummyHash ??= hash("cardstack-timing-dummy", OPTIONS);
  await verifyPassword(await dummyHash, password);
}
```

`apps/studio/lib/auth-tokens.ts`:

```ts
/**
 * One-time tokens for verify / reset / pending-link, riding the store's KV.
 * The RAW token goes in the email/URL; the KV key is sha256(raw), so a store
 * dump alone cannot mint a usable link (spec §3, §7). Single-use is
 * delete-on-consume; TTL is the KV's own expiry.
 */
import { createHash, randomBytes } from "node:crypto";
import type { AdminConfigStore } from "@cardstack/config-store";

export type KvStore = Pick<AdminConfigStore, "kvGet" | "kvSet" | "kvDelete">;

export const EMAIL_VERIFY_NS = "studio-email-verify";
export const PASSWORD_RESET_NS = "studio-password-reset";
export const PENDING_LINK_NS = "studio-pending-link";

export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 30 * 60 * 1000;
/** Passwordless-claim links travel by email like verification; same window. */
export const CLAIM_TTL_MS = 24 * 60 * 60 * 1000;
export const LINK_TTL_MS = 10 * 60 * 1000;

const digest = (raw: string): string => createHash("sha256").update(raw).digest("hex");

export async function issueToken(
  store: KvStore,
  ns: string,
  payload: Record<string, unknown>,
  ttlMs: number,
): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await store.kvSet(ns, digest(raw), payload, new Date(Date.now() + ttlMs).toISOString());
  return raw;
}

export async function peekToken(
  store: KvStore,
  ns: string,
  raw: string,
): Promise<Record<string, unknown> | undefined> {
  return store.kvGet(ns, digest(raw));
}

export async function consumeToken(
  store: KvStore,
  ns: string,
  raw: string,
): Promise<Record<string, unknown> | undefined> {
  const key = digest(raw);
  const value = await store.kvGet(ns, key);
  if (value) await store.kvDelete(ns, key);
  return value;
}
```

`apps/studio/lib/mail.ts`:

```ts
/**
 * Outbound mail: Resend's plain HTTPS API — deliberately no SDK. When
 * RESEND_API_KEY / CARDSTACK_EMAIL_FROM are unset (local dev), the message
 * prints to stdout so the credential-free dev loop keeps working and the
 * verify/reset links are copy-pasteable from the terminal (spec §3).
 */
export interface MailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendMail({ to, subject, text, html }: MailInput): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.CARDSTACK_EMAIL_FROM?.trim();
  if (!key || !from) {
    console.info(`[mail:dev] to=${to} subject=${JSON.stringify(subject)}\n${text}`);
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text, ...(html ? { html } : {}) }),
  });
  if (!response.ok) {
    throw new Error(`Mail send failed: ${response.status} ${await response.text().catch(() => "")}`);
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @cardstack/studio test -- password auth-tokens`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/package.json pnpm-lock.yaml apps/studio/lib
git commit -m "feat(studio): password hashing, one-time KV tokens, and mail primitives"
```

---

### Task 6: Choke point — ownership replaces role; reset kills sessions

**Files:**
- Modify: `apps/studio/lib/auth.ts`
- Create: `apps/studio/lib/session-mint.ts`
- Modify: `apps/studio/lib/auth.test.ts`

**Interfaces:**
- Consumes: Task 1 `Workspace.ownerAccountId`, `Account.passwordChangedAt`.
- Produces:
  - `resolveStudioSession(store, sessionId, now?)` — the `options`/`allowMembers` parameter is REMOVED. Rules: (a) idle check unchanged; (b) account+workspace must exist; (c) when `workspace.ownerAccountId` is set, it must equal `account.id`; when unset (legacy row pre-attach), fall back to `membership?.role === "admin"`; (d) a record whose `createdAt` predates `account.passwordChangedAt` resolves to null and is deleted.
  - `getSelfServiceIdentity` DELETED (its one caller dies in Task 12 — do it in that task's commit if typecheck forces ordering; see Step 4).
  - `mintStudioSession(store: Pick<AdminConfigStore,"kvSet">, accountId: string, workspaceId: string): Promise<string | undefined>` — writes the KV record and returns the signed cookie VALUE (undefined when no signing secret). Used by Tasks 8 and 9.

- [ ] **Step 1: Extend the choke-point tests**

`apps/studio/lib/auth.test.ts` — read the file first and reuse its store/session fixtures. Replace demotion-flavored cases; the target list:

```ts
// KEEP: idle expiry; tampered/expired cookie handling (those live in studio-session.test.ts — leave alone).
// REPLACE "demotion takes effect next request" WITH:
// 1. "a non-owner with a live session resolves to null" — workspace.ownerAccountId = "owner@x",
//    session record for account "other@x" (with a membership row, role "admin" even) → null.
//    (Membership grants chat, never Studio — spec §1.)
// 2. "the owner resolves" — ownerAccountId matches → identity returned.
// 3. "legacy workspace with no owner falls back to admin membership" —
//    workspace WITHOUT ownerAccountId + membership role "admin" → resolves;
//    role "member" → null. (Keeps the deployed t_demo session alive until
//    attach-workspace stamps an owner — spec §6 step 5 note.)
// 4. "password reset kills older sessions" — account.passwordChangedAt newer than
//    record.createdAt → null AND the KV record is deleted; a session minted
//    after the change resolves.
// 5. DELETE the /me/connection allowMembers case entirely.
```

- [ ] **Step 2: Run to verify failures**

Run: `pnpm --filter @cardstack/studio test -- lib/auth`
Expected: FAIL on the new cases.

- [ ] **Step 3: Implement in `auth.ts`**

In `resolveStudioSession`, replace the membership/role block (current steps 2–3, lines ~135–148):

```ts
const [account, workspace] = await Promise.all([
  store.getAccount(record.accountId),
  store.getWorkspace(record.workspaceId),
]);
if (!account || !workspace) return null;

// 2. Password reset invalidates every session minted before it, without
//    enumerating the KV: the record's createdAt is compared to the account's
//    passwordChangedAt stamp (spec §3).
const passwordChangedAt = account.passwordChangedAt ? Date.parse(account.passwordChangedAt) : NaN;
if (Number.isFinite(passwordChangedAt) && Date.parse(record.createdAt) < passwordChangedAt) {
  await store.kvDelete(STUDIO_SESSION_NS, sessionId);
  return null;
}

// 3. Studio is for the workspace's OWNER — ownership is structural, not a
//    role (spec §1). Legacy workspaces predate ownership: until
//    attach-workspace stamps ownerAccountId, an admin membership stands in,
//    so the deployed workspace's live session survives the deploy (spec §6).
if (workspace.ownerAccountId) {
  if (workspace.ownerAccountId !== account.id) return null;
} else {
  const membership = await store.getMembership(record.accountId, record.workspaceId);
  if (membership?.role !== "admin") return null;
}
```

Then:
- Remove the `options: { allowMembers?: boolean }` parameter and `getSelfServiceIdentity` (see Step 4 for ordering).
- The returned `StudioIdentity.role`: keep the field, return `"admin"` literally (vestigial; `userContextFor` doesn't read it — check and leave `userContextFor` unchanged). Adjust the `Pick<AdminConfigStore, ...>` store type on `resolveStudioSession` to keep `getMembership` (legacy fallback) — signature: `Pick<AdminConfigStore, "kvGet" | "kvSet" | "kvDelete" | "getAccount" | "getWorkspace" | "getMembership">` (unchanged).
- Update the module header comment: the choke point refuses non-owners; the `/me/connection` exception paragraph is deleted.

Create `apps/studio/lib/session-mint.ts`:

```ts
/**
 * The ONE place a Studio session record is written. Every lane that
 * authenticates an account — email sign-in, signup, reset, Salesforce — mints
 * through here, so the record shape and expiry can never drift between lanes.
 */
import type { AdminConfigStore } from "@cardstack/config-store";
import {
  createStudioSession,
  newSessionId,
  SESSION_TTL_SECONDS,
  sessionSigningSecrets,
  STUDIO_SESSION_NS,
  type StudioSessionRecord,
} from "./studio-session";

export async function mintStudioSession(
  store: Pick<AdminConfigStore, "kvSet">,
  accountId: string,
  workspaceId: string,
): Promise<string | undefined> {
  const secret = sessionSigningSecrets()[0];
  if (!secret) return undefined;
  const sessionId = newSessionId();
  const now = new Date().toISOString();
  const record: StudioSessionRecord = {
    accountId,
    workspaceId,
    role: "admin", // vestigial snapshot; authority is ownership at the choke point
    createdAt: now,
    lastSeenAt: now,
  };
  await store.kvSet(
    STUDIO_SESSION_NS,
    sessionId,
    record as unknown as Record<string, unknown>,
    new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(),
  );
  return createStudioSession(sessionId, secret);
}
```

- [ ] **Step 4: Handle the `getSelfServiceIdentity` caller**

`apps/studio/app/me/connection/page.tsx` imports it. To keep this commit green without pulling Task 12 forward, replace that page's body with a redirect stub (Task 12 deletes the file):

```tsx
import { redirect } from "next/navigation";
/** Self-service member access is gone: reps re-auth from their chat host
 *  (spec §1 "Deleted"). Deleted outright in the governance-removal task. */
export default function MeConnectionPage(): never {
  redirect("/");
}
```

Also remove `MEMBER_PATHS` usage NOW if `middleware.ts` references it for routing decisions (it declares the set but check for uses; if it's only exported, leave until Task 12).

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @cardstack/studio test` and `pnpm typecheck`
Expected: PASS (login-flow tests, studio-session tests untouched; membership-change tests still pass — module untouched until Task 12).

- [ ] **Step 6: Commit**

```bash
git add apps/studio
git commit -m "feat(studio): choke point gates on workspace ownership; reset invalidates sessions"
```

---

### Task 7: Account flows — signup / sign-in / forgot / reset (pure logic)

**Files:**
- Create: `apps/studio/lib/account-flows.ts`
- Test: `apps/studio/lib/account-flows.test.ts`

**Interfaces:**
- Consumes: Task 1 store methods, Task 5 primitives, `normalizeUserId` from `@cardstack/core`, `newWorkspaceId` from `@cardstack/config-store`.
- Produces (Task 8's routes are thin wrappers over these):

```ts
export type AccountFlowStore = Pick<
  AdminConfigStore,
  | "getAccount" | "getAccountByEmail" | "upsertAccount"
  | "createWorkspace" | "getWorkspaceByOwner"
  | "kvGet" | "kvSet" | "kvDelete"
>;
export type SignupResult =
  | { kind: "created"; account: Account; workspace: Workspace; verifyToken: string }
  | { kind: "exists-with-password" }
  | { kind: "claim-email-sent"; claimToken: string; accountId: string };
export function signup(store: AccountFlowStore, input: { email: string; name: string; password: string }): Promise<SignupResult | { kind: "invalid"; message: string }>;
export type SigninResult = { kind: "ok"; account: Account; workspace: Workspace } | { kind: "invalid" };
export function signin(store: AccountFlowStore, input: { email: string; password: string }): Promise<SigninResult>;
export function requestPasswordReset(store: AccountFlowStore, email: string): Promise<{ resetToken: string; accountId: string } | undefined>;
export type ResetResult = { kind: "ok"; account: Account; workspace: Workspace } | { kind: "invalid" };
export function performPasswordReset(store: AccountFlowStore, rawToken: string, newPassword: string): Promise<ResetResult | { kind: "weak"; message: string }>;
export function verifyEmail(store: AccountFlowStore, rawToken: string): Promise<{ ok: boolean }>;
export function ensureOwnedWorkspace(store: AccountFlowStore, accountId: string): Promise<Workspace>;
```

- [ ] **Step 1: Write the failing tests**

`apps/studio/lib/account-flows.test.ts` — use `InMemoryConfigStore`. The three signup cases are the isolation-critical core; write them exactly:

```ts
import { describe, expect, it } from "vitest";
import { InMemoryConfigStore } from "@cardstack/config-store";
import { signup, signin, performPasswordReset } from "./account-flows";
import { verifyPassword } from "./password";
import { consumeToken, peekToken, EMAIL_VERIFY_NS, PASSWORD_RESET_NS } from "./auth-tokens";

describe("signup", () => {
  it("creates account + owned workspace and issues a verify token", async () => {
    const store = new InMemoryConfigStore();
    const result = await signup(store, { email: "dana@acme.example", name: "Dana", password: "correct horse battery" });
    expect(result.kind).toBe("created");
    if (result.kind !== "created") return;
    expect(result.account.id).toBe("dana@acme.example");
    expect(await verifyPassword(result.account.passwordHash!, "correct horse battery")).toBe(true);
    expect(result.account.emailVerifiedAt).toBeUndefined();
    expect(result.workspace.ownerAccountId).toBe("dana@acme.example");
    expect(result.workspace.name).toBe("My workspace");
    expect(result.workspace.salesforceOrgId).toBeUndefined();
    expect(await consumeToken(store, EMAIL_VERIFY_NS, result.verifyToken)).toEqual({ accountId: "dana@acme.example" });
  });

  it("refuses an email that already has a password", async () => {
    const store = new InMemoryConfigStore();
    await signup(store, { email: "dana@acme.example", name: "Dana", password: "correct horse battery" });
    const again = await signup(store, { email: "Dana@Acme.example", name: "Imposter", password: "different password!" });
    expect(again.kind).toBe("exists-with-password");
    const account = await store.getAccountByEmail("dana@acme.example");
    expect(await verifyPassword(account!.passwordHash!, "correct horse battery")).toBe(true); // untouched
  });

  it("passwordless account: verification-first claim, no password written, no session result", async () => {
    const store = new InMemoryConfigStore();
    await store.upsertAccount({
      id: "rep@acme.example", email: "rep@acme.example", name: "Rep",
      salesforceUserId: "005AAAAAAAAAAAAAAA", createdAt: new Date().toISOString(),
    });
    const result = await signup(store, { email: "rep@acme.example", name: "Whoever", password: "a strong password!" });
    expect(result.kind).toBe("claim-email-sent");
    if (result.kind !== "claim-email-sent") return;
    expect((await store.getAccountByEmail("rep@acme.example"))!.passwordHash).toBeUndefined();
    expect(await peekToken(store, PASSWORD_RESET_NS, result.claimToken)).toEqual({ accountId: "rep@acme.example" });
  });
});
```

Remaining cases as real `it`s too (argon2 makes these slower — that's fine):

```ts
// 4. password shorter than MIN_PASSWORD_LENGTH → kind "invalid".
// 5. email uppercased ("Dana@Acme.example") matches the existing lowercase account (case 2/3, not a new account).
// signin:
// 6. right password → "ok" with the owned workspace; wrong password → "invalid";
//    unknown email → "invalid" (and completes — timing burn is fire-and-verify).
// 7. passwordless account → "invalid" (no hash to verify is a failed sign-in, not a crash).
// requestPasswordReset:
// 8. known email → token consumable to { accountId }; unknown email → undefined (caller answers identically either way).
// performPasswordReset:
// 9. valid token → "ok"; passwordHash replaced; passwordChangedAt set; emailVerifiedAt set;
//    a workspace EXISTS after reset even when the account never had one (the
//    passwordless-claim completion creates it — spec §3); token consumed (second use → "invalid").
// 10. garbage token → "invalid".
// verifyEmail:
// 11. valid token sets emailVerifiedAt; second use → { ok: false }.
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @cardstack/studio test -- account-flows`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `account-flows.ts`**

```ts
/**
 * Pure account flows: every rule from spec §3 lives here, testable without
 * HTTP. Routes (Task 8) only parse, rate-limit, call one function, and mint
 * the session via session-mint.ts.
 */
import { normalizeUserId } from "@cardstack/core";
import { newWorkspaceId, type Account, type AdminConfigStore, type Workspace } from "@cardstack/config-store";
import {
  burnTimingForMissingAccount,
  hashPassword,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  verifyPassword,
} from "./password";
import {
  CLAIM_TTL_MS,
  consumeToken,
  EMAIL_VERIFY_NS,
  issueToken,
  PASSWORD_RESET_NS,
  RESET_TTL_MS,
  VERIFY_TTL_MS,
} from "./auth-tokens";

/* ...types from the Interfaces block, verbatim... */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function badPassword(password: string): string | undefined {
  if (password.length < MIN_PASSWORD_LENGTH)
    return `Passwords are at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > MAX_PASSWORD_LENGTH) return "That password is too long.";
  return undefined;
}

export async function ensureOwnedWorkspace(
  store: AccountFlowStore,
  accountId: string,
): Promise<Workspace> {
  const existing = await store.getWorkspaceByOwner(accountId);
  if (existing) return existing;
  const workspace: Workspace = {
    id: newWorkspaceId(),
    ownerAccountId: accountId,
    name: "My workspace",
    createdAt: new Date().toISOString(),
  };
  await store.createWorkspace(workspace);
  return (await store.getWorkspaceByOwner(accountId)) ?? workspace;
}

export async function signup(store: AccountFlowStore, input: { email: string; name: string; password: string }) {
  const email = input.email.trim();
  const name = input.name.trim();
  if (!EMAIL_RE.test(email)) return { kind: "invalid" as const, message: "Enter a valid email address." };
  if (!name) return { kind: "invalid" as const, message: "Enter your name." };
  const weak = badPassword(input.password);
  if (weak) return { kind: "invalid" as const, message: weak };

  const existing = await store.getAccountByEmail(email);
  if (existing?.passwordHash) return { kind: "exists-with-password" as const };
  if (existing) {
    // Passwordless account (rep runtime identity, legacy bridge, or a
    // Salesforce-created account). Setting a password directly would hand this
    // account — and its user_connections — to whoever typed the email, so the
    // flow goes verification-first: prove the inbox, then set the password via
    // the reset lane (spec §3). performPasswordReset finishes the claim.
    const claimToken = await issueToken(store, PASSWORD_RESET_NS, { accountId: existing.id }, CLAIM_TTL_MS);
    return { kind: "claim-email-sent" as const, claimToken, accountId: existing.id };
  }

  const account: Account = {
    id: normalizeUserId(email),
    email,
    name,
    passwordHash: await hashPassword(input.password),
    createdAt: new Date().toISOString(),
  };
  await store.upsertAccount(account);
  const workspace = await ensureOwnedWorkspace(store, account.id);
  const verifyToken = await issueToken(store, EMAIL_VERIFY_NS, { accountId: account.id }, VERIFY_TTL_MS);
  return { kind: "created" as const, account, workspace, verifyToken };
}

export async function signin(store: AccountFlowStore, input: { email: string; password: string }) {
  const account = await store.getAccountByEmail(input.email.trim());
  if (!account?.passwordHash) {
    await burnTimingForMissingAccount(input.password);
    return { kind: "invalid" as const };
  }
  if (!(await verifyPassword(account.passwordHash, input.password))) return { kind: "invalid" as const };
  const workspace = await ensureOwnedWorkspace(store, account.id);
  return { kind: "ok" as const, account, workspace };
}

export async function requestPasswordReset(store: AccountFlowStore, email: string) {
  const account = await store.getAccountByEmail(email.trim());
  if (!account) return undefined;
  const resetToken = await issueToken(store, PASSWORD_RESET_NS, { accountId: account.id }, RESET_TTL_MS);
  return { resetToken, accountId: account.id };
}

export async function performPasswordReset(store: AccountFlowStore, rawToken: string, newPassword: string) {
  const weak = badPassword(newPassword);
  if (weak) return { kind: "weak" as const, message: weak };
  const payload = await consumeToken(store, PASSWORD_RESET_NS, rawToken);
  const accountId = typeof payload?.accountId === "string" ? payload.accountId : undefined;
  const account = accountId ? await store.getAccount(accountId) : undefined;
  if (!account) return { kind: "invalid" as const };
  const now = new Date().toISOString();
  const updated: Account = {
    ...account,
    passwordHash: await hashPassword(newPassword),
    passwordChangedAt: now,
    // Clicking a link mailed to this address proves the inbox (spec §3).
    emailVerifiedAt: account.emailVerifiedAt ?? now,
  };
  await store.upsertAccount(updated);
  // Completes the passwordless claim too: a rep identity never had a
  // workspace of its own (spec §3).
  const workspace = await ensureOwnedWorkspace(store, updated.id);
  return { kind: "ok" as const, account: updated, workspace };
}

export async function verifyEmail(store: AccountFlowStore, rawToken: string) {
  const payload = await consumeToken(store, EMAIL_VERIFY_NS, rawToken);
  const accountId = typeof payload?.accountId === "string" ? payload.accountId : undefined;
  const account = accountId ? await store.getAccount(accountId) : undefined;
  if (!account) return { ok: false };
  await store.upsertAccount({ ...account, emailVerifiedAt: account.emailVerifiedAt ?? new Date().toISOString() });
  return { ok: true };
}
```

(Write the exported types exactly as in the Interfaces block; `AccountFlowStore` there is the source of truth.)

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @cardstack/studio test -- account-flows`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/lib
git commit -m "feat(studio): account flows — signup, sign-in, reset, verify, passwordless claim"
```

---

### Task 8: The auth API routes + middleware

**Files:**
- Create: `apps/studio/app/api/auth/signup/route.ts`
- Create: `apps/studio/app/api/auth/signin/route.ts`
- Create: `apps/studio/app/api/auth/forgot/route.ts`
- Create: `apps/studio/app/api/auth/reset/route.ts`
- Create: `apps/studio/app/api/auth/resend-verification/route.ts`
- Modify: `apps/studio/middleware.ts` (PUBLIC_PATHS)
- Test: `apps/studio/lib/auth-routes.test.ts` (create — tests the shared helper)
- Create: `apps/studio/lib/auth-links.ts` (email bodies + link building)

**Interfaces:**
- Consumes: Task 5–7 modules, `mintStudioSession` (Task 6), `studioOrigin` from `lib/oauth`, `clientKey`/`rateLimited` from `lib/request-guard`, `sendMail`.
- Produces:
  - `POST /api/auth/signup` body `{ email, name, password }` → 200 `{ ok: true }` (session cookie set) | 200 `{ ok: true, check: "email" }` (claim case — same body shape as created? NO: see below) | 409 `{ error }` | 400 `{ error }` | 429.
    - Exact contract: created → `{ status: "signed-in" }` + cookie; claim-email-sent → `{ status: "check-email" }`; exists-with-password → 409 `{ error: "An account with this email already exists — sign in instead." }`.
  - `POST /api/auth/signin` `{ email, password }` → `{ status: "signed-in" }` + cookie | 401 `{ error: "Wrong email or password." }` | 429.
  - `POST /api/auth/forgot` `{ email }` → always `{ status: "check-email" }` | 429.
  - `POST /api/auth/reset` `{ token, password }` → `{ status: "signed-in" }` + cookie | 400 `{ error }`.
  - `POST /api/auth/resend-verification` (session required) → `{ status: "check-email" }`.
  - `buildAuthLinks(origin: string)` in `auth-links.ts` → `{ verifyUrl(token), resetUrl(token), claimUrl(token) }` (claimUrl === resetUrl; separate name for email copy) plus `verificationEmail(name, url)`, `resetEmail(name, url)`, `claimEmail(name, url)` returning `{ subject, text }`.

- [ ] **Step 1: Write `auth-links.ts` and its test**

```ts
// apps/studio/lib/auth-links.ts
/** Email copy + links in one place so tests can pin them and routes can't drift. */
export const buildAuthLinks = (origin: string) => ({
  verifyUrl: (token: string) => `${origin}/verify?token=${encodeURIComponent(token)}`,
  resetUrl: (token: string) => `${origin}/reset?token=${encodeURIComponent(token)}`,
});

export const verificationEmail = (name: string, url: string) => ({
  subject: "Verify your Cardstack email",
  text: `Hi ${name},\n\nConfirm this address for your Cardstack account:\n\n${url}\n\nThe link works once and expires in 24 hours. If you didn't sign up, ignore this.`,
});

export const resetEmail = (name: string, url: string) => ({
  subject: "Reset your Cardstack password",
  text: `Hi ${name},\n\nReset your Cardstack password here:\n\n${url}\n\nThe link works once and expires in 30 minutes. If you didn't ask for this, ignore it — your password is unchanged.`,
});

export const claimEmail = (name: string, url: string) => ({
  subject: "Finish setting up your Cardstack account",
  text: `Hi ${name},\n\nAn account for this email already exists from your Salesforce or chat sign-in. Set its password here to use it in Studio:\n\n${url}\n\nThe link works once and expires in 24 hours. If you didn't try to sign up, ignore this.`,
});
```

Test in `apps/studio/lib/auth-routes.test.ts`: links embed the token URL-encoded, and each email mentions its expiry window ("24 hours" / "30 minutes"). Three small `it`s.

- [ ] **Step 2: Run (fail), implement, run (pass)**

Run: `pnpm --filter @cardstack/studio test -- auth-routes` → FAIL → create the module → PASS.

- [ ] **Step 3: Write the five routes**

Pattern for all: Node runtime (default), parse body defensively, rate-limit, call the flow, set the cookie via `NextResponse` when signed in. `apps/studio/app/api/auth/signup/route.ts` in full — the others follow the same skeleton:

```ts
import { NextResponse } from "next/server";
import { getStore } from "../../../../lib/backend";
import { signup } from "../../../../lib/account-flows";
import { mintStudioSession } from "../../../../lib/session-mint";
import { clientKey, rateLimited } from "../../../../lib/request-guard";
import { sendMail } from "../../../../lib/mail";
import { buildAuthLinks, claimEmail, verificationEmail } from "../../../../lib/auth-links";
import { studioOrigin } from "../../../../lib/oauth";
import { STUDIO_SESSION_COOKIE, studioSessionCookieOptions } from "../../../../lib/studio-session";

const MAX_SIGNUPS_PER_MINUTE = 10;

export async function POST(req: Request) {
  if (rateLimited(`auth-signup:${clientKey(req)}`, { max: MAX_SIGNUPS_PER_MINUTE })) {
    return NextResponse.json({ error: "Too many attempts. Wait a minute and try again." }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as { email?: string; name?: string; password?: string };
  if (!body.email || !body.name || !body.password) {
    return NextResponse.json({ error: "Email, name, and password are required." }, { status: 400 });
  }
  const store = await getStore();
  const links = buildAuthLinks(studioOrigin(req.url));
  const result = await signup(store, { email: body.email, name: body.name, password: body.password });

  if (result.kind === "invalid") return NextResponse.json({ error: result.message }, { status: 400 });
  if (result.kind === "exists-with-password") {
    return NextResponse.json(
      { error: "An account with this email already exists — sign in instead." },
      { status: 409 },
    );
  }
  if (result.kind === "claim-email-sent") {
    const account = await store.getAccount(result.accountId);
    await sendMail({ to: body.email.trim(), ...claimEmail(account?.name ?? "there", links.resetUrl(result.claimToken)) });
    return NextResponse.json({ status: "check-email" });
  }

  await sendMail({ to: result.account.email!, ...verificationEmail(result.account.name, links.verifyUrl(result.verifyToken)) });
  const cookie = await mintStudioSession(store, result.account.id, result.workspace.id);
  if (!cookie) {
    console.error("[auth] signup succeeded but no session signing secret is configured");
    return NextResponse.json({ error: "Sign-in is unavailable on this deployment." }, { status: 503 });
  }
  const response = NextResponse.json({ status: "signed-in" });
  response.cookies.set(STUDIO_SESSION_COOKIE, cookie, studioSessionCookieOptions());
  return response;
}
```

The other four, same skeleton with these deltas:
- **signin**: limit `auth-signin:` max 10 — call `rateLimited` ONLY on failure (mirror `/api/session`'s failure-only pattern, including a pre-check read is not needed; on failure: `rateLimited(...)` → 429 if true else 401 with `Wrong email or password.` and a `console.warn("[security] failed studio sign-in for <clientKey>")`). Success: mint + cookie + `{ status: "signed-in" }`.
- **forgot**: limit `auth-forgot:` max 5 per IP; call `requestPasswordReset`; when it returns a token, look up the account and `sendMail(resetEmail(...))`; ALWAYS return `{ status: "check-email" }` (spec §3 enumeration resistance).
- **reset**: no limiter (token-gated); `performPasswordReset`; `weak`→400 with message; `invalid`→400 `"That link expired or was already used. Request a new one."`; ok → mint + cookie + `{ status: "signed-in" }`.
- **resend-verification**: `const identity = await getStudioIdentity()` (import from `lib/auth`); 401 if null; if `identity.account.emailVerifiedAt` already set → `{ status: "verified" }`; else issue a fresh EMAIL_VERIFY token (`issueToken` + `VERIFY_TTL_MS`), send `verificationEmail`, return `{ status: "check-email" }`.

- [ ] **Step 4: Middleware public paths**

In `apps/studio/middleware.ts` replace the PUBLIC_PATHS line:

```ts
const PUBLIC_PATHS = new Set([
  "/login",
  "/signup",
  "/forgot",
  "/reset",
  "/verify",
  "/link",
  "/api/session", // DELETE = sign-out; the POST bridge dies with the governance layer
  "/healthz",
]);
```

(`/api/auth/*` is already public via the existing `startsWith("/api/auth/")`.)

- [ ] **Step 5: Verify**

Run: `pnpm --filter @cardstack/studio test && pnpm typecheck && pnpm --filter @cardstack/studio build`
Expected: PASS + clean build (route files compile under App Router).

- [ ] **Step 6: Commit**

```bash
git add apps/studio
git commit -m "feat(studio): auth API routes — signup, signin, forgot, reset, resend"
```

---

### Task 9: "Continue with Salesforce" — the peer lane

**Files:**
- Modify: `apps/studio/lib/login-flow.ts` (add resolution logic)
- Modify: `apps/studio/lib/login-flow.test.ts`
- Modify: `apps/studio/app/api/auth/salesforce/callback/route.ts`
- Create: `apps/studio/app/api/auth/link/route.ts`

**Interfaces:**
- Consumes: `SalesforceIdentity` (defined in `packages/config-store/src/sign-in.ts` — add it to `index.ts`'s exports if it isn't already re-exported), Task 5–7 primitives, `mintStudioSession`, `ensureOwnedWorkspace`.
- Produces:

```ts
export type SalesforceLoginResolution =
  | { kind: "signed-in"; account: Account; workspace: Workspace }
  | { kind: "link-required"; linkToken: string; email: string }
  | { kind: "created"; account: Account; workspace: Workspace };
export function resolveSalesforceStudioLogin(
  store: AccountFlowStore & Pick<AdminConfigStore, "getAccountBySalesforceUserId">,
  identity: SalesforceIdentity,
): Promise<SalesforceLoginResolution>;
```

  - Pending-link KV payload (`PENDING_LINK_NS`): `{ accountId: string; salesforceUserId: string; name: string }`.
  - `POST /api/auth/link` body `{ token, password }` → `{ status: "signed-in" }` + cookie | 401 | 400 | 429.

- [ ] **Step 1: Write the failing resolution tests**

Append to `apps/studio/lib/login-flow.test.ts` (keep the existing `safeNext` cases):

```ts
// resolveSalesforceStudioLogin, with InMemoryConfigStore:
// 1. "id match signs in" — account with salesforceUserId "005AAA..." exists →
//    kind "signed-in", same account id, and an owned workspace EXISTS afterwards
//    (a rep identity entering Studio gets its own empty workspace — spec §3).
// 2. "email match without id demands the password" — account with email
//    dana@acme.example + passwordHash, identity has different/absent sf-id match
//    but same email → kind "link-required"; the linkToken's PENDING_LINK_NS
//    payload is { accountId, salesforceUserId, name }; the account's
//    salesforceUserId is NOT yet written (silent link is the attack — spec §3).
// 3. "no match creates a verified passwordless account" — kind "created";
//    account.emailVerifiedAt set; account.salesforceUserId recorded;
//    account.passwordHash undefined; workspace.ownerAccountId === account.id;
//    NO org claim (workspace.salesforceOrgId undefined — signup never claims).
// 4. "identity without email and without match creates from username fallback" —
//    identity { email: undefined, username: "dana@acme.example.dev" } → created,
//    id = normalizeUserId(username).
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @cardstack/studio test -- login-flow`
Expected: new cases FAIL.

- [ ] **Step 3: Implement the resolution in `login-flow.ts`**

```ts
import { normalizeUserId } from "@cardstack/core";
import type { Account, AdminConfigStore, SalesforceIdentity, Workspace } from "@cardstack/config-store";
import { issueToken, LINK_TTL_MS, PENDING_LINK_NS } from "./auth-tokens";
import { ensureOwnedWorkspace, type AccountFlowStore } from "./account-flows";

/* ...SalesforceLoginResolution type from the Interfaces block... */

/**
 * The three-way resolution of spec §3 "Continue with Salesforce". Order
 * matters: the Salesforce user id is proof (Salesforce authenticated it);
 * a matching email alone is NOT — org admins can set a user's email without
 * the inbox confirming, so that case exits to the password-once link step.
 */
export async function resolveSalesforceStudioLogin(
  store: AccountFlowStore & Pick<AdminConfigStore, "getAccountBySalesforceUserId">,
  identity: SalesforceIdentity,
): Promise<SalesforceLoginResolution> {
  const byId = await store.getAccountBySalesforceUserId(identity.salesforceUserId);
  if (byId) {
    const workspace = await ensureOwnedWorkspace(store, byId.id);
    return { kind: "signed-in", account: byId, workspace };
  }

  const byEmail = identity.email ? await store.getAccountByEmail(identity.email) : undefined;
  if (byEmail) {
    const linkToken = await issueToken(
      store,
      PENDING_LINK_NS,
      { accountId: byEmail.id, salesforceUserId: identity.salesforceUserId, name: identity.name },
      LINK_TTL_MS,
    );
    return { kind: "link-required", linkToken, email: byEmail.email ?? identity.email! };
  }

  const now = new Date().toISOString();
  const account: Account = {
    id: normalizeUserId(identity.email ?? identity.username ?? identity.salesforceUserId),
    salesforceUserId: identity.salesforceUserId,
    name: identity.name,
    ...(identity.email ? { email: identity.email, emailVerifiedAt: now } : {}),
    createdAt: now,
  };
  await store.upsertAccount(account);
  const workspace = await ensureOwnedWorkspace(store, account.id);
  return { kind: "created", account, workspace };
}
```

- [ ] **Step 4: Rework the callback route**

In `apps/studio/app/api/auth/salesforce/callback/route.ts`, replace everything from `const { account, workspace, role } = await resolveSignIn(store, identity);` through the session-record write (lines ~85–115) with:

```ts
const resolution = await resolveSalesforceStudioLogin(store, identity);
if (resolution.kind === "link-required") {
  const link = new URL("/link", origin);
  link.searchParams.set("token", resolution.linkToken);
  link.searchParams.set("email", resolution.email);
  return NextResponse.redirect(link);
}
const cookie = await mintStudioSession(store, resolution.account.id, resolution.workspace.id);
if (!cookie) return fail("Sign-in is unavailable on this deployment.");
```

…then keep the existing `safeNext` redirect block, replacing its manual cookie construction with `response.cookies.set(STUDIO_SESSION_COOKIE, cookie, studioSessionCookieOptions());`. Delete the now-unused imports (`resolveSignIn`, `describeAdmins`, `workspaceAdmins`, `newSessionId`, `SESSION_TTL_SECONDS`, `STUDIO_SESSION_NS`, `StudioSessionRecord`) and the role-refusal block (the "Ask Dana" messaging died with roles). Update the file header: this is now the "Continue with Salesforce" peer lane (sign-in AND signup, password-once linking; spec §3). Note the CLAUDE.md-required migration comment convention: add a line `// Migration note (2026-08-10): resolveSignIn no longer creates workspaces; this lane resolves accounts itself.`

- [ ] **Step 5: The link route**

`apps/studio/app/api/auth/link/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getStore } from "../../../../lib/backend";
import { consumeToken, PENDING_LINK_NS } from "../../../../lib/auth-tokens";
import { verifyPassword } from "../../../../lib/password";
import { mintStudioSession } from "../../../../lib/session-mint";
import { ensureOwnedWorkspace } from "../../../../lib/account-flows";
import { clientKey, rateLimited } from "../../../../lib/request-guard";
import { STUDIO_SESSION_COOKIE, studioSessionCookieOptions } from "../../../../lib/studio-session";

/** Password-once-to-link (spec §3): a correct password records the Salesforce
 *  user id on the account; only then does the Salesforce button become one
 *  click. This is a password check, so it is rate-limited like sign-in. */
const MAX_FAILURES_PER_MINUTE = 10;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { token?: string; password?: string };
  if (!body.token || !body.password) {
    return NextResponse.json({ error: "Token and password are required." }, { status: 400 });
  }
  const store = await getStore();
  const pending = await consumeToken(store, PENDING_LINK_NS, body.token);
  const accountId = typeof pending?.accountId === "string" ? pending.accountId : undefined;
  const salesforceUserId =
    typeof pending?.salesforceUserId === "string" ? pending.salesforceUserId : undefined;
  const account = accountId ? await store.getAccount(accountId) : undefined;
  if (!account?.passwordHash || !salesforceUserId) {
    return NextResponse.json(
      { error: "That link expired. Start again with Continue with Salesforce." },
      { status: 400 },
    );
  }
  if (!(await verifyPassword(account.passwordHash, body.password))) {
    // Token was consumed — a wrong guess costs a fresh Salesforce round-trip.
    // That is deliberate: this endpoint must not become an offline oracle
    // against a stolen link.
    if (rateLimited(`auth-link:${clientKey(req)}`, { max: MAX_FAILURES_PER_MINUTE })) {
      return NextResponse.json({ error: "Too many attempts. Wait a minute." }, { status: 429 });
    }
    return NextResponse.json(
      { error: "Wrong password. Start again with Continue with Salesforce." },
      { status: 401 },
    );
  }
  await store.upsertAccount({ ...account, salesforceUserId });
  const workspace = await ensureOwnedWorkspace(store, account.id);
  const cookie = await mintStudioSession(store, account.id, workspace.id);
  if (!cookie) return NextResponse.json({ error: "Sign-in is unavailable on this deployment." }, { status: 503 });
  const response = NextResponse.json({ status: "signed-in" });
  response.cookies.set(STUDIO_SESSION_COOKIE, cookie, studioSessionCookieOptions());
  return response;
}
```

- [ ] **Step 6: Verify**

Run: `pnpm --filter @cardstack/studio test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/studio
git commit -m "feat(studio): Continue with Salesforce peer lane with password-once linking"
```

---

### Task 10: Org claiming at the connect callback; disconnect releases

**Files:**
- Modify: `apps/studio/app/api/connections/salesforce/oauth/callback/route.ts`
- Modify: `apps/studio/app/api/connections/route.ts` (disconnect branch, ~line 102)

**Interfaces:**
- Consumes: `claimOrg` / `releaseOrg` (Task 1–2), `fetchSalesforceSignerIdentity` from `@cardstack/crm-adapters` (already imported by the auth callback — same call shape), `getUserContextFromRequest`.
- Produces: connecting Salesforce claims the org for the session's workspace or refuses; disconnect releases the claim; the connecting account's `salesforceUserId` is recorded (feeds the Salesforce button).

- [ ] **Step 1: Claim in the OAuth callback**

In `apps/studio/app/api/connections/salesforce/oauth/callback/route.ts`, after `const connectedUser = await probe.validateConnection();` and before the `clearTenantConfig` block, insert:

```ts
// The claim IS the connection (spec §4): the org this token belongs to gets
// bound to this workspace, exclusively — the unique org_key decides races.
// On conflict nothing is stored: this workspace keeps no credentials for an
// org it does not hold.
const signer = await fetchSalesforceSignerIdentity(credentials);
// Sandbox tag (spec §4): the login host is the honest signal — pendingAuth
// staged it at OAuth start. No schema change; the tag rides the name.
const sandbox = pendingAuth.loginUrl?.includes("test.salesforce.com");
const orgLabel = signer.orgName ? (sandbox ? `${signer.orgName} (sandbox)` : signer.orgName) : undefined;
const claim = await store.claimOrg(tenantId, signer.orgId, orgLabel);
if (!claim.ok) {
  return done(req, {
    error:
      "That Salesforce org is already connected to another Cardstack account. Each org can be connected to exactly one account.",
  });
}
// Record WHICH Salesforce user connected — this is what makes Continue with
// Salesforce a one-click sign-in for the owner later (spec §1, §3).
const { userId } = await getUserContextFromRequest(req);
const owner = await store.getAccount(userId);
if (owner) await store.upsertAccount({ ...owner, salesforceUserId: signer.salesforceUserId });
```

Add `fetchSalesforceSignerIdentity` to the `@cardstack/crm-adapters` import. Note `getUserContextFromRequest` is already imported at the top of this file.

- [ ] **Step 2: Release on disconnect**

In `apps/studio/app/api/connections/route.ts`, inside the `body.action === "disconnect"` branch, after `await store.setConnection(state);` add:

```ts
// Releasing the claim frees the org for another account. Rep memberships and
// user connections under THIS workspace id stay: reconnecting the same org
// restores service without re-onboarding, and nothing here is reachable by a
// future claimant, whose claim lands in their own workspace (spec §4, §7).
if (current.crm === "salesforce") await store.releaseOrg(tenantId);
```

(`tenantId` is already in scope from the route's `getUserContextFromRequest`.)

- [ ] **Step 3: Verify + spot-check the flow**

Run: `pnpm --filter @cardstack/studio test && pnpm typecheck && pnpm --filter @cardstack/studio build`
Expected: PASS. The `/connections` page already renders `?error=` from `done()` — the conflict message surfaces with no page change.

- [ ] **Step 4: Commit**

```bash
git add apps/studio
git commit -m "feat(studio): connecting Salesforce claims the org exclusively; disconnect releases it"
```

---

### Task 11: The auth screens — split brand panel

**Files:**
- Create: `apps/studio/components/auth-shell.tsx`
- Create: `apps/studio/components/auth-forms.tsx` (client component: all five forms)
- Modify: `apps/studio/app/login/page.tsx` (rewrite)
- Delete: `apps/studio/app/login/access-key-form.tsx`
- Create: `apps/studio/app/signup/page.tsx`, `apps/studio/app/forgot/page.tsx`, `apps/studio/app/reset/page.tsx`, `apps/studio/app/verify/page.tsx`, `apps/studio/app/link/page.tsx`
- Modify: `apps/studio/components/studio-shell.tsx` + `apps/studio/app/layout.tsx` (verify banner)

**Interfaces:**
- Consumes: Task 8/9 routes, `verifyEmail` + `peekToken` (Tasks 5/7), `cardstackSalesforceLoginApp` from `@cardstack/crm-adapters`, `safeNext`, `getStudioIdentity`.
- Produces: `/login`, `/signup`, `/forgot`, `/reset`, `/verify`, `/link` pages on one shell; unverified-email banner in Studio.

**Design constraints (spec §5 + PR-note rule):** /design has no sign-in mockup — this surface is invented in the Studio token vocabulary (`bg-paper`, `bg-surface`, `border-line`, `text-ink-*`, `bg-accent`, `st-btn st-btn--primary`, `st-input` — see `app/globals.css` and the old login page for exact class usage). Direction: **split brand panel** — left half `bg-accent` with the two-square Cardstack mark (copy the JSX mark from the current `login/page.tsx` lines 37–40, borders `border-white`), headline "Record cards your reps use right inside chat.", subline "Design once in Studio. Live in Claude, ChatGPT, and Copilot.", and three offset outlined card rectangles; right half `bg-surface` with the form. On viewports `< md` the brand panel collapses to a slim header row. **Never render env var names.**

- [ ] **Step 1: Build `auth-shell.tsx`**

Server component: `AuthShell({ title, subtitle, error, children })` renders the split layout (`flex min-h-screen`; left `hidden md:flex md:w-[44%] bg-accent text-white flex-col justify-between p-10`; right `flex flex-1 items-center justify-center bg-surface px-5`; right column content max-width 360px, `h1` 19px semibold tracking tight, subtitle `text-ink-55`, error block copied from the current login page's `role="alert"` markup). Children = the form.

- [ ] **Step 2: Build `auth-forms.tsx`**

One `"use client"` module exporting five small form components, each following the exact fetch-then-`router.replace` pattern of the deleted `access-key-form.tsx` (read it before deleting — same busy/error state shape, `st-input`/`st-btn` classes):

- `SigninForm({ next })` → POST `/api/auth/signin`; on 200 `router.replace(next)`; links: `/forgot` ("Forgot password?"), `/signup` ("Create an account").
- `SignupForm({ next })` → POST `/api/auth/signup`; on `{ status: "check-email" }` render the inline notice "Check your email to finish setting up your account." instead of navigating; on 409 show the error with a "Sign in instead" link.
- `ForgotForm()` → POST `/api/auth/forgot`; always flips to "If that email has an account, we sent a link."
- `ResetForm({ token })` → POST `/api/auth/reset` `{ token, password }`; on 200 `router.replace("/")`.
- `LinkForm({ token, email })` → POST `/api/auth/link`; on 200 `router.replace("/")`; explains: "**{email}** already has a Cardstack account. Enter its password once to link your Salesforce sign-in."

- [ ] **Step 3: The six pages**

Each page is a server component on `AuthShell`. `login/page.tsx` (rewrite, keeping `safeNext` + error param handling from the current file):

```tsx
import { cardstackSalesforceLoginApp } from "@cardstack/crm-adapters";
import { AuthShell } from "../../components/auth-shell";
import { SigninForm } from "../../components/auth-forms";
import { safeNext } from "../../lib/login-flow";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const next = safeNext(single(params.next));
  const salesforce = Boolean(cardstackSalesforceLoginApp());
  return (
    <AuthShell title="Sign in" subtitle="Welcome back." error={single(params.error)}>
      <SigninForm next={next} />
      {salesforce && (
        <>
          <div className="mt-5 flex items-center gap-3 text-[12px] text-ink-45">
            <span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" />
          </div>
          <a href={`/api/auth/salesforce/start?next=${encodeURIComponent(next)}`} className="st-btn mt-4 flex w-full items-center justify-center !py-2.5 text-[14px]">
            Continue with Salesforce
          </a>
          <a href={`/api/auth/salesforce/start?env=sandbox&next=${encodeURIComponent(next)}`} className="mt-2 block text-center text-[13px] text-ink-55 underline-offset-2 hover:underline">
            Use a sandbox org instead
          </a>
        </>
      )}
    </AuthShell>
  );
}
```

- `signup/page.tsx`: same shape, `SignupForm`, same conditional Salesforce block ("Continue with Salesforce").
- `forgot/page.tsx`, `link/page.tsx`: thin wrappers (link reads `token` + `email` params; missing token → error state pointing to `/login`).
- `reset/page.tsx`: server component reads `token` param and calls `peekToken(store, PASSWORD_RESET_NS, token)` — peek, NOT consume (email scanners prefetch GETs; the token burns only on POST). Unknown/expired → error state with a "Request a new link" → `/forgot`.
- `verify/page.tsx`: server component calls `verifyEmail(store, token)` directly (GET-consume is deliberate: a prefetch that verifies an email proves delivery to that inbox — harmless; spec discussion). Renders "Email verified." with an "Open Studio →" link, or "That link expired." with a resend hint pointing at the banner.

Delete `apps/studio/app/login/access-key-form.tsx`.

- [ ] **Step 4: The verify banner**

In `apps/studio/app/layout.tsx`, resolve `const identity = await getStudioIdentity().catch(() => null);` and pass `emailUnverified={Boolean(identity && identity.account.email && !identity.account.emailVerifiedAt)}` into `StudioShell`. In `studio-shell.tsx`, when the prop is true render a slim banner above the content: "Verify your email — we sent a link to your inbox." with a "Resend" button POSTing to `/api/auth/resend-verification` (inline client subcomponent, flips to "Sent."). Match the draft-chip palette (`bg-draft text-draft-ink`).

- [ ] **Step 5: Verify in the browser**

Run: `pnpm --filter @cardstack/studio test && pnpm typecheck && pnpm --filter @cardstack/studio build`, then start the dev server and check `/login`, `/signup`, `/forgot` render the split shell, the Salesforce block hides when `CARDSTACK_SF_CLIENT_ID` is unset, no env var name appears anywhere, and signup → banner appears with the verify link printed to the dev-server stdout (mail dev transport).
Expected: all green; screenshot-level check only.

- [ ] **Step 6: Commit**

```bash
git add apps/studio
git commit -m "feat(studio): split-brand-panel auth screens; access-key form removed"
```

---

### Task 12: Delete the governance layer

**Files:**
- Delete: `apps/studio/app/people/page.tsx`, `apps/studio/components/people-table.tsx`, `apps/studio/lib/admins.ts`, `apps/studio/lib/admins.test.ts`, `apps/studio/lib/membership-change.ts`, `apps/studio/lib/membership-change.test.ts`, `apps/studio/app/me/connection/page.tsx` (the Task 6 stub), `apps/studio/scripts/backfill-workspace-admins.ts`
- Delete: any `/api/people` route directory if `grep -r "membership-change" apps/studio/app/api` finds one (check `apps/studio/app/api` listing — there is a `people` entry)
- Modify: `apps/studio/components/nav-rail.tsx` (remove the `/people` RailLink, ~line 346)
- Modify: `apps/studio/middleware.ts` (delete `MEMBER_PATHS`)
- Modify: `apps/studio/app/api/session/route.ts` (delete the POST bridge; KEEP `DELETE` sign-out)
- Modify: `apps/studio/package.json` (remove the `backfill:admins` script)

**Interfaces:**
- Consumes: nothing new. Produces: absence — later greps for `getSelfServiceIdentity`, `membership-change`, `workspaceAdmins`, `describeAdmins`, `backfill-workspace-admins` must return nothing under `apps/`.

- [ ] **Step 1: Delete and unwire**

Do the deletions above. In `api/session/route.ts`: delete `POST` and its helpers (`hasSalesforceAdmin`, the legacy-account minting) and the now-unused imports; the file keeps only `DELETE` (sign-out). In `middleware.ts`: delete the `MEMBER_PATHS` export and its comment. In `nav-rail.tsx`: remove the People link. Then run the absence greps:

```bash
grep -rn "getSelfServiceIdentity\|membership-change\|workspaceAdmins\|describeAdmins\|backfill-workspace-admins\|MEMBER_PATHS\|access-key-form" apps/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v .next
```

Expected: no hits. Fix any straggler by deleting the dead reference.

- [ ] **Step 2: Verify**

Run: `pnpm --filter @cardstack/studio test && pnpm typecheck && pnpm --filter @cardstack/studio build && pnpm --filter @cardstack/config-store test`
Expected: PASS everywhere (membership-change tests are gone with their module; tenant isolation untouched and green).

- [ ] **Step 3: Commit**

```bash
git add -A apps/studio
git commit -m "feat(studio)!: remove the org-governance layer — People page, roles, me/connection, access-key bridge"
```

---

### Task 13: MCP lane — the unclaimed-org page

**Files:**
- Modify: `apps/mcp-server/src/main.ts` (`renderSignInFailure`, ~line 53)
- Modify: `apps/mcp-server/src/oauth-provider.test.ts`

**Interfaces:**
- Consumes: `UnclaimedOrgError` (Task 3) exported from `@cardstack/config-store`.
- Produces: a rep whose org has no claim sees guidance, not a stack trace; everything else on this lane is untouched.

- [ ] **Step 1: Write the failing test**

In `oauth-provider.test.ts`, find the existing Salesforce-callback test fixture (it drives `completeSalesforceCallback` with a stubbed identity). Add:

```ts
// "refuses a signer whose org no workspace claimed": run the callback fixture
// WITHOUT creating/claiming any workspace and with no legacyTenantId configured.
// Expect completeSalesforceCallback to reject, and the rejection to be an
// UnclaimedOrgError (import it from @cardstack/config-store) whose message
// names the org. (Before Task 3 this silently created a workspace.)
```

Also update any existing oauth-provider tests that relied on implicit workspace creation: give their fixtures a claimed workspace via `createWorkspace` + `claimOrg` in setup (same helper shape as Task 4's `claimedWorkspace`).

- [ ] **Step 2: Run to see what actually fails**

Run: `pnpm --filter @cardstack/mcp-server test -- oauth-provider`
Expected: the new case may already pass (Task 3 made resolveSignIn throw); fixture-reliant cases fail until their setup claims an org. Fix setups; keep every behavioral assertion.

- [ ] **Step 3: Render the guidance**

In `main.ts`'s `renderSignInFailure` add, before the generic path:

```ts
if (error instanceof UnclaimedOrgError) {
  return (
    `<h3>This Salesforce org isn't connected to Cardstack yet</h3>` +
    `<p>${escapeHtml(error.message)}</p>` +
    `<p>Ask whoever administers Cardstack for your team to connect the org in Studio — ` +
    `or create your own Cardstack account and connect it yourself.</p>`
  );
}
```

Import `UnclaimedOrgError` from `@cardstack/config-store`.

- [ ] **Step 4: Verify the whole server suite**

Run: `pnpm --filter @cardstack/mcp-server test && pnpm typecheck`
Expected: PASS — including the existing consent, rotation, and reuse-detection tests (untouched).

- [ ] **Step 5: Commit**

```bash
git add apps/mcp-server
git commit -m "feat(mcp): unclaimed orgs get guidance instead of a silent empty workspace"
```

---

### Task 14: The attach-workspace migration script

**Files:**
- Create: `apps/studio/scripts/attach-workspace.ts`
- Modify: `apps/studio/package.json` (add script `"attach:workspace": "tsx scripts/attach-workspace.ts"`)

**Interfaces:**
- Consumes: `setWorkspaceOwner`, `claimOrg`, `getAccountByEmail`, `getWorkspace` (Tasks 1–2); `getStore` idiom from `scripts/seed-from-salesforce.ts` (read it for how scripts construct the store from env).
- Produces: `pnpm --filter @cardstack/studio attach:workspace -- --workspace t_demo --account daniel@example.com [--apply]` — report-first, idempotent.

- [ ] **Step 1: Write the script**

Follow the arg-parsing and store-construction idiom of `scripts/backfill-workspace-admins.ts` — it was deleted in Task 12, so read it from history: `git show $(git log --diff-filter=D --format=%H -1 -- apps/studio/scripts/backfill-workspace-admins.ts)~1:apps/studio/scripts/backfill-workspace-admins.ts` — or copy the store-construction shape from `seed-from-salesforce.ts`. Behavior:

```ts
// 1. Parse --workspace <id>, --account <email>, --apply (default: report only).
// 2. Load store; const ws = await store.getWorkspace(workspaceId) — exit 1 with
//    a message if missing. const account = await store.getAccountByEmail(email)
//    — exit 1 "sign up in Studio first, then re-run" if missing.
// 3. Report current state: ws.ownerAccountId, ws.salesforceOrgId, and the org id
//    the stored admin connection implies (parseSalesforceIdentityUrl from
//    @cardstack/crm-adapters over (await store.getConnection(workspaceId))
//    .credentials?.identityUrl — "none" when absent).
// 4. Without --apply: print what WOULD happen and exit 0.
// 5. With --apply:
//    a. await store.setWorkspaceOwner(workspaceId, account.id)
//    b. const orgId = ws.salesforceOrgId ?? <parsed from connection identityUrl>;
//       if orgId: const claim = await store.claimOrg(workspaceId, orgId);
//       report claim.ok or the conflict (a conflict here means some OTHER
//       workspace claimed this org — print both ids and exit 1).
//    c. Re-read and print the final workspace row. Idempotent: re-running with
//       the same args is a no-op.
```

Write it in full (~80 lines), with every console line prefixed `[attach-workspace]`.

- [ ] **Step 2: Test against the file store**

Run (from repo root, using a scratch config path):

```bash
CARDSTACK_CONFIG_PATH=/tmp/attach-test.json pnpm --filter @cardstack/studio attach:workspace -- --workspace t_demo --account nobody@example.com
```

Expected: clean "workspace not found / account not found" reporting, exit 1, no crash. (Full end-to-end is the production runbook in Task 15's doc changes.)

- [ ] **Step 3: Commit**

```bash
git add apps/studio/scripts apps/studio/package.json
git commit -m "feat(studio): attach-workspace migration script (owner + org claim for legacy tenants)"
```

---

### Task 15: Docs, PLAN.md amendment, and final verification

**Files:**
- Modify: `docs/accounts-and-workspaces.md` (rewrite)
- Modify: `PLAN.md` (non-goals section, line ~516)
- Modify: `docs/superpowers/specs/2026-08-08-auth-redesign.md` (§7 addendum)
- Modify: `CLAUDE.md` (accounts paragraph + choke-point paragraph)

- [ ] **Step 1: Rewrite `docs/accounts-and-workspaces.md`**

Full rewrite around the new model, keeping the doc's voice and structure: The model (email-first accounts; workspace owned by one account; org claim exclusive; membership = chat access list); Tables (same three tables — what changed: nullable `org_key`, nullable `sf_user_key`, `ownerAccountId` in workspace config); Authorization (choke point = ownership; MCP = membership; the `getSelfServiceIdentity` paragraph deleted); Sessions (unchanged — keep that section verbatim, add the `passwordChangedAt` invalidation rule); Environment (add `RESEND_API_KEY`, `CARDSTACK_EMAIL_FROM`; note the login page no longer surfaces any env name; `STUDIO_SHARED_SECRET` is verify-only until ~2026-08-24 then removed); Flows (email lane, Continue-with-Salesforce three-case resolution, MCP find-or-refuse); Migration (deploy → sign up → `attach:workspace` runbook with the exact command); Tests (name the reshaped files). Point at the spec for rationale.

- [ ] **Step 2: Amend `PLAN.md`**

Replace the first non-goal bullet (line ~516) with:

```markdown
- ~~No custom auth/user management in Studio beyond OAuth-based login (use a library;
  no password flows).~~ **Superseded 2026-08-10:** Cardstack now owns self-serve
  email+password accounts — the Salesforce-as-IdP model made sign-in structurally
  dependent on a connected app existing, which failed in production. See
  docs/superpowers/specs/2026-08-10-self-serve-accounts-design.md.
```

- [ ] **Step 3: Addendum in the 2026-08-08 auth-redesign spec**

At the end of its §7 ("Deliberately not changing"), add:

```markdown
> **Addendum (2026-08-10):** Two §7 entries are superseded by
> [2026-08-10-self-serve-accounts-design.md](./2026-08-10-self-serve-accounts-design.md):
> "a workspace IS a Salesforce org" (now: a workspace is owned by an account and
> *claims* an org exclusively) and "no password flows" (now: email+password is
> the primary lane). The session design, choke-point shape, and the whole MCP
> OAuth surface carried forward unchanged.
```

- [ ] **Step 4: Update `CLAUDE.md`**

In the "Cardstack accounts and multi-workspace tenancy" paragraph: rewrite to the new model (email-first signup; one Salesforce org per account, claimed exclusively at `/connections`; reps route by org id and are refused when unclaimed; sessions unchanged). In "The two lanes are separated" paragraph: replace the `getSelfServiceIdentity` sentence — the exception is gone; Studio admits owners only. Keep the `/authorize` consent paragraph untouched.

- [ ] **Step 5: Full verification sweep**

```bash
pnpm typecheck && pnpm test && pnpm build
pnpm demo:m1 && pnpm demo:m2 && pnpm demo:m3 && pnpm demo:m4
```

Expected: everything green (demos run on `CARDSTACK_DEV_IDENTITY` — untouched). Then grep the tree for stale references:

```bash
grep -rn "first person from your org\|becomes its admin\|auto-join\|People page" apps/ packages/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v .next | grep -v test
```

Review each hit: chat-lane auto-join *as member* language may stay; workspace-creation/admin-grant language must not.

- [ ] **Step 6: Commit**

```bash
git add docs PLAN.md CLAUDE.md
git commit -m "docs: rewrite accounts model for self-serve accounts; amend PLAN.md non-goal"
```

**PR note (required by CLAUDE.md hard rule 6):** when this branch becomes a PR, the description must state: */design has no sign-in mockup; the auth screens are an invented surface built in the Studio token vocabulary (split brand panel direction, accepted via mockup during brainstorming — see the spec).* 

---

### Task 16: One-click Salesforce connect — server lane

Spec: `docs/superpowers/specs/2026-08-11-one-click-salesforce-connection-design.md`
(§1, §3). Execute after Task 10 (shares the claim-bearing callback); independent
of Tasks 11–15.

Admin data connections can now be made through the Cardstack-owned connected app
(`CARDSTACK_SF_CLIENT_ID/SECRET` — the sign-in lane's app) with zero pasted
credentials. Such connections are persisted **without** a client secret, marked
`clientApp: "cardstack"`; the env-configured app supplies the secret at use
time, so rotating it heals every one-click workspace at once. BYO connections
(stored secret) are untouched everywhere.

**Refresh-token hazard note (global constraint):** this task changes how the
*client secret* is sourced and persisted, never the refresh token. Rotated
`refreshToken` values must keep persisting exactly as today — only the secret is
stripped from store rows.

**Files:**
- Modify: `packages/crm-adapters/src/salesforce/identity.ts`
- Modify: `packages/crm-adapters/src/salesforce/identity.test.ts`
- Modify: `packages/crm-adapters/src/salesforce/salesforce-adapter.ts` (one field on `SalesforceCredentials`)
- Modify: `packages/crm-adapters/src/index.ts` (exports)
- Create: `apps/studio/lib/salesforce-connect.ts`
- Create: `apps/studio/lib/salesforce-connect.test.ts`
- Modify: `apps/studio/app/api/connections/salesforce/oauth/start/route.ts`
- Modify: `apps/studio/app/api/connections/salesforce/oauth/callback/route.ts`
- Modify: `apps/studio/app/api/user-connections/salesforce/oauth/callback/route.ts:48-58`
- Modify: `apps/studio/app/api/connections/route.ts` (GET responses)
- Modify: `apps/studio/lib/backend.ts:75-102` (`getAdapter`)
- Modify: `apps/mcp-server/src/main.ts:289-306` (admin adapter settings)

**Interfaces:**
- Consumes: `cardstackSalesforceLoginApp()`, `buildSalesforceAuthorizationUrl`, `createPkcePair`/`studioOrigin` (`apps/studio/lib/oauth.ts`), `CrmAuthError` (`packages/crm-adapters/src/adapter.ts`).
- Produces: `hydrateSalesforceClientSecret(credentials, loginApp?)` and `stripCardstackClientSecret(credentials)` exported from `@cardstack/crm-adapters`; `buildCardstackConnectStart(args)` in `apps/studio/lib/salesforce-connect.ts`; `POST /api/connections/salesforce/oauth/start` accepting `{ app: "cardstack", host: "production" | "sandbox" }`; `GET /api/connections` gaining `cardstackAppAvailable: boolean` (Task 17's UI reads all of these).

- [ ] **Step 1: Write the failing helper tests**

Append to `packages/crm-adapters/src/salesforce/identity.test.ts` (match the file's existing vitest import idiom):

```ts
describe("hydrateSalesforceClientSecret", () => {
  const app = { clientId: "cardstack-app", clientSecret: "env-secret" };

  it("returns BYO credentials unchanged — a stored secret always wins", () => {
    const creds = { clientId: "byo", clientSecret: "stored" };
    expect(hydrateSalesforceClientSecret(creds, app)).toBe(creds);
  });

  it("merges the env secret into cardstack-app credentials", () => {
    const creds = { clientId: "cardstack-app", clientApp: "cardstack" };
    expect(hydrateSalesforceClientSecret(creds, app)).toEqual({
      ...creds,
      clientSecret: "env-secret",
    });
  });

  it("leaves secretless non-cardstack credentials alone", () => {
    const creds = { clientId: "legacy" };
    expect(hydrateSalesforceClientSecret(creds, app)).toBe(creds);
  });

  it("throws when the deployment has no app", () => {
    expect(() =>
      hydrateSalesforceClientSecret({ clientId: "cardstack-app", clientApp: "cardstack" }, undefined),
    ).toThrow(/reconnect/i);
  });

  it("throws when the deployment app id no longer matches", () => {
    expect(() =>
      hydrateSalesforceClientSecret({ clientId: "old-app", clientApp: "cardstack" }, app),
    ).toThrow(/reconnect/i);
  });
});

describe("stripCardstackClientSecret", () => {
  it("drops the secret from cardstack-app credentials, keeping everything else", () => {
    expect(
      stripCardstackClientSecret({
        clientApp: "cardstack",
        clientId: "cardstack-app",
        clientSecret: "env-secret",
        refreshToken: "r",
      }),
    ).toEqual({ clientApp: "cardstack", clientId: "cardstack-app", refreshToken: "r" });
  });

  it("returns BYO credentials unchanged", () => {
    const byo = { clientId: "byo", clientSecret: "stored" };
    expect(stripCardstackClientSecret(byo)).toBe(byo);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @cardstack/crm-adapters test -- identity`
Expected: FAIL — `hydrateSalesforceClientSecret` / `stripCardstackClientSecret` are not exported.

- [ ] **Step 3: Implement the helpers**

In `packages/crm-adapters/src/salesforce/identity.ts`, add
`import { CrmAuthError } from "../adapter.js";` at the top (identity.ts has no
imports from salesforce-adapter.ts, so no cycle), then below
`cardstackSalesforceLoginApp`:

```ts
/**
 * Resolve the client secret for credentials minted by the Cardstack-owned
 * connected app (`clientApp: "cardstack"`). Such credentials are persisted
 * WITHOUT a secret — the env-configured app supplies it at use time, so
 * rotating CARDSTACK_SF_CLIENT_SECRET heals every one-click workspace at once.
 * A stored secret always wins (BYO connections pass through untouched). Throws
 * rather than proceeding secretless when a cardstack-app credential set has no
 * matching env app.
 */
export function hydrateSalesforceClientSecret<
  T extends { clientId?: string; clientSecret?: string; clientApp?: string },
>(
  credentials: T,
  loginApp: SalesforceLoginApp | undefined = cardstackSalesforceLoginApp(),
): T {
  if (credentials.clientSecret) return credentials;
  if (credentials.clientApp !== "cardstack") return credentials;
  if (!loginApp || loginApp.clientId !== credentials.clientId) {
    throw new CrmAuthError(
      "Salesforce",
      "This workspace connected through Cardstack's Salesforce app, but this deployment's app is missing or changed. Reconnect Salesforce from Studio.",
    );
  }
  return { ...credentials, clientSecret: loginApp.clientSecret };
}

/** Never persist the Cardstack app's env secret into a store row. */
export function stripCardstackClientSecret<
  T extends { clientSecret?: string; clientApp?: string },
>(credentials: T): T {
  if (credentials.clientApp !== "cardstack") return credentials;
  const { clientSecret: _omit, ...rest } = credentials;
  return rest as T;
}
```

In `packages/crm-adapters/src/salesforce/salesforce-adapter.ts`, add one field to
`SalesforceCredentials` (after `clientSecret`):

```ts
  /** "cardstack" = minted by the Cardstack-owned app; the secret is NOT stored
   *  — hydrateSalesforceClientSecret sources it from env at use time. */
  clientApp?: string;
```

In `packages/crm-adapters/src/index.ts`, add `hydrateSalesforceClientSecret` and
`stripCardstackClientSecret` to the existing `./salesforce/identity.js` export
block.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @cardstack/crm-adapters test -- identity`
Expected: PASS (all new tests, nothing else broken).

- [ ] **Step 5: Commit**

```bash
git add packages/crm-adapters/src
git commit -m "feat(crm-adapters): client-secret hydration for Cardstack-app Salesforce credentials"
```

- [ ] **Step 6: Write the failing start-builder test**

Create `apps/studio/lib/salesforce-connect.test.ts` (match sibling tests'
vitest import idiom, e.g. `login-flow.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { buildCardstackConnectStart } from "./salesforce-connect";

const args = {
  app: { clientId: "cardstack-app", clientSecret: "env-secret" },
  redirectUri: "https://studio.example/api/connections/salesforce/oauth/callback",
  state: "state-1",
  codeVerifier: "verifier-1",
  codeChallenge: "challenge-1",
} as const;

describe("buildCardstackConnectStart", () => {
  it("stages pendingAuth with the cardstack marker and NO client secret", () => {
    const { pendingAuth } = buildCardstackConnectStart({ ...args, host: "production" });
    expect(pendingAuth).toMatchObject({
      authType: "oauth_pending",
      clientId: "cardstack-app",
      clientApp: "cardstack",
      loginUrl: "https://login.salesforce.com",
      state: "state-1",
      codeVerifier: "verifier-1",
    });
    expect("clientSecret" in pendingAuth).toBe(false);
  });

  it("maps the sandbox host", () => {
    const { pendingAuth, authorizationUrl } = buildCardstackConnectStart({
      ...args,
      host: "sandbox",
    });
    expect(pendingAuth.loginUrl).toBe("https://test.salesforce.com");
    expect(authorizationUrl).toContain("https://test.salesforce.com");
    expect(authorizationUrl).toContain("client_id=cardstack-app");
  });

  it("refuses when the deployment has no Cardstack app — without printing env names", () => {
    expect(() => buildCardstackConnectStart({ ...args, app: undefined, host: "production" })).toThrow(
      /use your own connected app/i,
    );
    try {
      buildCardstackConnectStart({ ...args, app: undefined, host: "production" });
    } catch (err) {
      expect(String(err)).not.toMatch(/CARDSTACK_SF/);
    }
  });
});
```

- [ ] **Step 7: Run to verify failure**

Run: `pnpm --filter @cardstack/studio test -- salesforce-connect`
Expected: FAIL — module `./salesforce-connect` does not exist.

- [ ] **Step 8: Implement the start builder**

Create `apps/studio/lib/salesforce-connect.ts`:

```ts
/**
 * One-click (Cardstack-app) admin OAuth start — the pure half of
 * /api/connections/salesforce/oauth/start's cardstack mode. The staged
 * pendingAuth carries `clientApp: "cardstack"` and NO client secret: the
 * callback and every later refresh source the secret from the env-configured
 * app via hydrateSalesforceClientSecret, so it is never persisted per-tenant
 * (spec 2026-08-11 §1).
 */
import {
  buildSalesforceAuthorizationUrl,
  type SalesforceLoginApp,
} from "@cardstack/crm-adapters";

export const SALESFORCE_HOSTS = {
  production: "https://login.salesforce.com",
  sandbox: "https://test.salesforce.com",
} as const;
export type SalesforceHost = keyof typeof SALESFORCE_HOSTS;

export function buildCardstackConnectStart(args: {
  app: SalesforceLoginApp | undefined;
  host: SalesforceHost;
  redirectUri: string;
  state: string;
  codeVerifier: string;
  codeChallenge: string;
}): { pendingAuth: Record<string, string>; authorizationUrl: string } {
  if (!args.app) {
    throw new Error(
      "This deployment has no Cardstack Salesforce app configured — use your own connected app instead.",
    );
  }
  const loginUrl = SALESFORCE_HOSTS[args.host];
  return {
    pendingAuth: {
      authType: "oauth_pending",
      loginUrl,
      clientId: args.app.clientId,
      clientApp: "cardstack",
      redirectUri: args.redirectUri,
      state: args.state,
      codeVerifier: args.codeVerifier,
    },
    authorizationUrl: buildSalesforceAuthorizationUrl({
      loginUrl,
      clientId: args.app.clientId,
      redirectUri: args.redirectUri,
      state: args.state,
      codeChallenge: args.codeChallenge,
    }),
  };
}
```

- [ ] **Step 9: Run to verify pass**

Run: `pnpm --filter @cardstack/studio test -- salesforce-connect`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/studio/lib/salesforce-connect.ts apps/studio/lib/salesforce-connect.test.ts
git commit -m "feat(studio): pure builder for one-click Salesforce connect start"
```

- [ ] **Step 11: Wire the start route's cardstack mode**

In `apps/studio/app/api/connections/salesforce/oauth/start/route.ts`:

Extend the body type and add imports (`cardstackSalesforceLoginApp` from
`@cardstack/crm-adapters`, `buildCardstackConnectStart` from
`../../../../../../lib/salesforce-connect`):

```ts
interface StartBody {
  app?: "cardstack";
  host?: "production" | "sandbox";
  loginUrl?: string;
  clientId?: string;
  clientSecret?: string;
}
```

Replace the section from the `const loginUrl = ...` line through the
`pendingAuth` literal with a branch (the BYO half is today's code, moved):

```ts
    const redirectUri = `${studioOrigin(req.url)}/api/connections/salesforce/oauth/callback`;
    const state = randomUUID();
    const { verifier, challenge } = createPkcePair();
    let pendingAuth: Record<string, string>;
    let authorizationUrl: string;
    if (body.app === "cardstack") {
      const start = buildCardstackConnectStart({
        app: cardstackSalesforceLoginApp(),
        host: body.host === "sandbox" ? "sandbox" : "production",
        redirectUri,
        state,
        codeVerifier: verifier,
        codeChallenge: challenge,
      });
      pendingAuth = start.pendingAuth;
      authorizationUrl = start.authorizationUrl;
    } else {
      const loginUrl = normalizeSalesforceLoginUrl(body.loginUrl);
      const clientId = body.clientId?.trim();
      const clientSecret = body.clientSecret?.trim();
      if (!clientId || !clientSecret) {
        return NextResponse.json(
          { error: "Consumer key and consumer secret are required." },
          { status: 400 },
        );
      }
      // Pending OAuth state (incl. PKCE verifier + the newly entered secret) is
      // staged under `pendingAuth`, checked on callback. Client secret enters the
      // system here and becomes the single canonical copy on the admin connection.
      pendingAuth = {
        authType: "oauth_pending",
        loginUrl,
        clientId,
        clientSecret,
        redirectUri,
        state,
        codeVerifier: verifier,
      };
      authorizationUrl = buildSalesforceAuthorizationUrl({
        loginUrl,
        clientId,
        redirectUri,
        state,
        codeChallenge: challenge,
      });
    }
```

The rest of the route (the non-downgrading persist of `pendingAuth`, the JSON
response) stays; the response now returns the branch's `authorizationUrl`.

- [ ] **Step 12: Callback — source the secret, persist without it, hint on lockout**

In `apps/studio/app/api/connections/salesforce/oauth/callback/route.ts`, add
`cardstackSalesforceLoginApp` and `stripCardstackClientSecret` to the
`@cardstack/crm-adapters` import. Three changes:

(a) The early `if (error)` return gains the one-click lockout hint (spec §3 —
only when the failed attempt was the one-click path):

```ts
  if (error) {
    let hint = "";
    try {
      const { tenantId } = await getUserContextFromRequest(req);
      const store = await getStore();
      const pendingAuth = (await store.getConnection(tenantId)).pendingAuth as
        | Record<string, string>
        | undefined;
      if (pendingAuth?.clientApp === "cardstack") {
        hint = " If your org blocks third-party apps, set up your own connected app instead.";
      }
    } catch {
      // No session/store — surface the raw Salesforce error alone.
    }
    return done(req, { error: error + hint });
  }
```

(b) The `pendingAuth` cast becomes `Partial<SalesforceCredentials> & { state?:
string; codeVerifier?: string }` and the guard adds `!pendingAuth.clientId`.
Before the exchange call, resolve the secret:

```ts
    const clientSecret =
      pendingAuth.clientSecret ??
      (pendingAuth.clientApp === "cardstack"
        ? cardstackSalesforceLoginApp()?.clientSecret
        : undefined);
    if (!clientSecret) {
      return done(req, {
        error: "The deployment's Salesforce app changed mid-authorization — start again.",
      });
    }
```

and pass `clientId: pendingAuth.clientId, clientSecret` into
`exchangeSalesforceAuthorizationCode`.

(c) Persist without the secret. The probe/validation still runs on the FULL
`credentials` (secret included — refresh during validation must work); only the
stored row is stripped:

```ts
    const persisted =
      pendingAuth.clientApp === "cardstack"
        ? stripCardstackClientSecret({ ...credentials, clientApp: "cardstack" })
        : credentials;
```

and the `ConnectionState` literal uses
`credentials: persisted as unknown as Record<string, string>`.

- [ ] **Step 13: User-connection callback — hydrate the admin secret**

In `apps/studio/app/api/user-connections/salesforce/oauth/callback/route.ts`
(~line 48), replace the direct read:

```ts
    const clientSecret = (workspace.credentials as SalesforceCredentials | undefined)?.clientSecret;
```

with:

```ts
    const adminCredentials = workspace.credentials as SalesforceCredentials | undefined;
    // One-click admin connections store no secret — hydrate from the env app
    // (throws a typed CrmAuthError when the deployment app is gone).
    const clientSecret = adminCredentials
      ? hydrateSalesforceClientSecret(adminCredentials).clientSecret
      : undefined;
```

(import `hydrateSalesforceClientSecret` from `@cardstack/crm-adapters`; the
existing `if (!clientSecret)` 400 stays as the fallback).

- [ ] **Step 14: Hydrate at both admin-adapter construction sites; strip on persist**

`apps/studio/lib/backend.ts` `getAdapter`: add `hydrateSalesforceClientSecret`
and `stripCardstackClientSecret` to the `@cardstack/crm-adapters` import, then:

```ts
  const store = await getStore();
  const connection = await store.getConnection(tenantId);
  // One-click (Cardstack-app) Salesforce connections are stored WITHOUT a
  // client secret; the env app supplies it at use time. BYO credentials pass
  // through untouched (stored secret wins).
  const hydrate = (credentials: Record<string, string> | undefined) =>
    connection.crm === "salesforce" && credentials
      ? (hydrateSalesforceClientSecret(credentials) as Record<string, string>)
      : credentials;
  return createAdapterForConnection({
    crm: connection.crm,
    ...(connection.credentials ? { credentials: hydrate(connection.credentials) } : {}),
    cacheNonce: connection.changedAt,
    onCredentialsRefreshed: async (credentials) => {
      await store.setConnection({
        ...connection,
        // Rotated refreshToken persists exactly as before — only the env
        // secret is stripped from the stored row.
        credentials: stripCardstackClientSecret(credentials),
        changedAt: new Date().toISOString(),
      });
    },
    getFreshCredentials: async () =>
      hydrate((await store.getConnection(tenantId)).credentials ?? undefined) ?? null,
  });
```

`apps/mcp-server/src/main.ts` (~line 289): apply the same three-part change to
the admin `adapterSettings` — a local `hydrateAdmin` helper identical to
`hydrate` above (guarding `connection.crm === "salesforce"`), used for
`credentials` and `getFreshCredentials`, and `stripCardstackClientSecret(credentials)`
in `onCredentialsRefreshed`. The per-user secret-matching block below it
(~line 321) is **unchanged**: a one-click admin connection's `clientId` IS the
Cardstack app's, so `userClientId === loginApp?.clientId` already matches first.

- [ ] **Step 15: `cardstackAppAvailable` on GET /api/connections**

In `apps/studio/app/api/connections/route.ts`, import
`cardstackSalesforceLoginApp` and add
`cardstackAppAvailable: Boolean(cardstackSalesforceLoginApp())` to **both** GET
JSON responses (the early not-connected return and the connected one). POST
responses are unchanged — the page reads the flag on load.

- [ ] **Step 16: Verify the whole lane**

```bash
pnpm typecheck
pnpm test
```

Expected: green. Pay attention to `packages/config-store/src/tenant-isolation.test.ts`
(global constraint) and the existing salesforce-adapter refresh tests.

- [ ] **Step 17: Commit**

```bash
git add apps/studio packages/crm-adapters apps/mcp-server
git commit -m "feat: one-click Salesforce connect lane via the Cardstack-owned app"
```

---

### Task 17: One-click UI — reshaped Salesforce card + the BYO setup page

Spec: `docs/superpowers/specs/2026-08-11-one-click-salesforce-connection-design.md`
(§2). Depends on Task 16.

No component-test harness exists for Studio pages (same as Task 11's screens) —
verification is typecheck + lint + a scripted dev-server walkthrough.

**Files:**
- Modify: `apps/studio/app/connections/page.tsx`
- Create: `apps/studio/app/connections/salesforce/setup/page.tsx`
- Modify: `docs/salesforce-setup.md` (lead with the one-click path)

**Interfaces:**
- Consumes: `POST /api/connections/salesforce/oauth/start` with `{ app: "cardstack", host }` and with the BYO shape; `cardstackAppAvailable: boolean` on `GET /api/connections` (both Task 16).
- Produces: the route `/connections/salesforce/setup` (linked from the card; nothing else consumes it).

- [ ] **Step 1: Reshape the Salesforce card**

In `apps/studio/app/connections/page.tsx`:

- `ConnectionsData` gains `cardstackAppAvailable?: boolean`.
- Replace the `sf` state with `const [host, setHost] = useState<"production" | "sandbox">("production");` (the BYO fields move to the setup page).
- `startSalesforceAdminOAuth` now takes no fields: it POSTs `JSON.stringify({ app: "cardstack", host })` to the same start route (error/navigate handling unchanged).
- Replace the disconnected-Salesforce branch (the `<div className="mt-3 space-y-2">` block holding the intro text, callback-URL box, and the three inputs) with:

```tsx
              <div className="mt-3 space-y-3">
                {data.cardstackAppAvailable ? (
                  <>
                    <p className="text-[11.5px] text-ink-55">
                      Connect your Salesforce org. You&apos;ll approve Cardstack&apos;s
                      access on Salesforce — nothing to install or configure.
                    </p>
                    <div className="flex items-center justify-between gap-3">
                      <div
                        className="flex rounded-[8px] border border-line-soft p-0.5"
                        role="radiogroup"
                        aria-label="Salesforce environment"
                      >
                        {(["production", "sandbox"] as const).map((h) => (
                          <button
                            key={h}
                            type="button"
                            role="radio"
                            aria-checked={host === h}
                            className={`rounded-[6px] px-2.5 py-1 text-[12px] capitalize ${
                              host === h ? "bg-paper font-semibold" : "text-ink-55"
                            }`}
                            onClick={() => setHost(h)}
                          >
                            {h}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="st-btn st-btn--primary"
                        disabled={busy}
                        onClick={startSalesforceAdminOAuth}
                      >
                        {busy ? "Starting…" : "Connect Salesforce"}
                      </button>
                    </div>
                    <p className="text-[11.5px] text-ink-45">
                      Can&apos;t use the Cardstack app?{" "}
                      <Link href="/connections/salesforce/setup" className="underline">
                        Set up your own connected app →
                      </Link>
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[11.5px] text-ink-55">
                      This deployment connects with your own Salesforce Connected App.
                    </p>
                    <div className="flex justify-end">
                      <Link href="/connections/salesforce/setup" className="st-btn st-btn--primary">
                        Set up a connected app →
                      </Link>
                    </div>
                  </>
                )}
              </div>
```

- [ ] **Step 2: Build the setup page**

Create `apps/studio/app/connections/salesforce/setup/page.tsx` — a client
component, single scrolling page of numbered steps ending in the BYO authorize
form (spec §2: not a multi-screen wizard; nothing to persist between steps).
Content adapted from `docs/salesforce-setup.md` steps 1–2; self-sufficient, no
links into the git repo. Structure:

```tsx
"use client";
/**
 * BYO connected-app setup (spec 2026-08-11 §2): the guided path for
 * deployments without the Cardstack app and orgs that block third-party apps.
 * The one-click path lives on /connections; this page ends in the same
 * "Authorize admin" POST, so the shared callback (and its org claim) is
 * identical for both. Success and errors land back on /connections.
 *
 * /design has no mockup for this page — invented in the Studio token language
 * (PR must note this per hard rule 6).
 */
import Link from "next/link";
import { useEffect, useState } from "react";

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="block flex-1 break-all rounded-[6px] bg-white px-2 py-1 text-[11px]">
        {value}
      </code>
      <button
        type="button"
        className="st-btn"
        onClick={() => {
          void navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
```

then the default export with `origin` state (from `window.location.origin`, the
`/connections` page's pattern), `sf` state (`loginUrl` defaulting to
`https://login.salesforce.com`, `clientId`, `clientSecret`), `busy`/`error`
state, and the `startSalesforceAdminOAuth` POST carried over verbatim from the
old card (BYO body shape). Page body — a `max-w-[620px]` column titled "Set up
your own Salesforce connected app" with a back link to `/connections`, and four
`st-card` sections:

1. **"1 · Create the app"** — copy: in Salesforce Setup, search "App Manager"
   → New Connected App (or New External Client App). Create it **in the org
   you're connecting** — a sandbox app's Consumer Key/Secret differ from
   production's.
2. **"2 · OAuth settings"** — enable OAuth; enable the web-server
   (Authorization Code) flow; leave "Require PKCE" on; scopes as two
   `st-chip-mono` chips: `api` and `refresh_token/offline_access`; both
   callback URLs as `CopyField`s:
   `` `${origin}/api/connections/salesforce/oauth/callback` `` and
   `` `${origin}/api/user-connections/salesforce/oauth/callback` ``.
3. **"3 · Collect credentials"** — Consumer Key and Consumer Secret live under
   the app's "Manage Consumer Details"; Salesforce takes ~2–10 minutes to
   propagate a new app — an immediate authorize can fail once, wait and retry.
4. **"4 · Authorize"** — the login URL input (placeholder
   `https://login.salesforce.com — or https://test.salesforce.com for a sandbox`),
   the Consumer key / Consumer secret inputs, the error banner, and the
   **Authorize admin** primary button — all carried over from the old card
   unchanged, including the disabled condition.

- [ ] **Step 3: Typecheck, lint, build**

```bash
pnpm typecheck && pnpm lint && pnpm --filter @cardstack/studio build
```

Expected: green.

- [ ] **Step 4: Dev-server walkthrough**

Run `pnpm --filter @cardstack/studio dev` and verify against a signed-in
session on a workspace with no CRM connected:

- With `CARDSTACK_SF_CLIENT_ID/SECRET` set: the Salesforce card shows the
  Production/Sandbox choice + **Connect Salesforce**; clicking it navigates to
  a `login.salesforce.com/services/oauth2/authorize` URL whose `client_id` is
  the Cardstack app's (stop there — do not complete OAuth against a real org).
- With them unset: the card shows only the "Set up a connected app →" primary
  link; POSTing `{ "app": "cardstack" }` to the start route by hand returns the
  typed no-app error, which names no env vars.
- `/connections/salesforce/setup` renders all four steps; both copy buttons
  put the full callback URL on the clipboard; the authorize form's button is
  disabled until all three fields are filled.
- HubSpot card, mock connect, connected-state rendering: unchanged.

- [ ] **Step 5: Lead `docs/salesforce-setup.md` with the one-click path**

Under the doc's title, before "How it works", insert:

```markdown
> **Most workspaces don't need this document.** On deployments with the
> Cardstack connected app configured, Connections → **Connect Salesforce** is
> one click — you approve Cardstack's access on Salesforce and you're done; no
> app to create, nothing to paste. The steps below are for the
> bring-your-own-app path: self-hosted deployments without a Cardstack app, or
> orgs whose policies block third-party connected apps. In Studio, the same
> steps are guided at Connections → "Set up your own connected app".
```

- [ ] **Step 6: Commit**

```bash
git add apps/studio/app/connections docs/salesforce-setup.md
git commit -m "feat(studio): one-click Salesforce card + guided BYO setup page"
```

**PR note (required by CLAUDE.md hard rule 6):** the PR description must also
state: */design has no mockup for the reshaped Salesforce connection card or
the /connections/salesforce/setup page; both are invented in the Studio token
vocabulary (spec 2026-08-11 §2).*

---

## Deploy runbook (after merge — operator steps, not tasks)

1. Deploy both services. Set `RESEND_API_KEY` + `CARDSTACK_EMAIL_FROM` on `@cardstack/studio` (optional — without them, verification/reset links appear in server logs only).
2. Sign up in production Studio with the operator email.
3. `pnpm --filter @cardstack/studio attach:workspace -- --workspace t_demo --account <that email>` (report), then `--apply`.
4. Confirm `/login` shows the new page, the old access key is refused (POST bridge is gone), and chat-host connections still resolve `t_demo` by its claimed org.
5. ~2026-08-24 (existing clock): drop `STUDIO_SHARED_SECRET` from the env entirely (verify-list step 5 of the 2026-08-08 migration).
6. **One-click connect prerequisite (Tasks 16–17, spec 2026-08-11 §1):** in the
   Cardstack-owned connected app's Salesforce config, add both connections
   callbacks to the callback URL allowlist, alongside the existing auth/MCP
   ones:
   `https://<studio-origin>/api/connections/salesforce/oauth/callback` and
   `https://<studio-origin>/api/user-connections/salesforce/oauth/callback`.
   Connected-app edits take ~2–10 minutes to propagate. Then verify one-click
   connect end-to-end on a test org; until this step is done, the one-click
   button fails at Salesforce with a redirect_uri mismatch while the BYO setup
   page keeps working.
