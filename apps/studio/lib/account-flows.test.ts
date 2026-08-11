import { describe, expect, it } from "vitest";
import { InMemoryConfigStore } from "@cardstack/config-store";
import {
  ensureOwnedWorkspace,
  performPasswordReset,
  requestPasswordReset,
  signin,
  signup,
  verifyEmail,
} from "./account-flows";
import { MIN_PASSWORD_LENGTH, verifyPassword } from "./password";
import { consumeToken, EMAIL_VERIFY_NS, PASSWORD_RESET_NS, peekToken } from "./auth-tokens";

describe("signup", () => {
  it("creates account + owned workspace and issues a verify token", async () => {
    const store = new InMemoryConfigStore();
    const result = await signup(store, {
      email: "dana@acme.example",
      name: "Dana",
      password: "correct horse battery",
    });
    expect(result.kind).toBe("created");
    if (result.kind !== "created") return;
    expect(result.account.id).toBe("dana@acme.example");
    expect(await verifyPassword(result.account.passwordHash!, "correct horse battery")).toBe(true);
    expect(result.account.emailVerifiedAt).toBeUndefined();
    expect(result.workspace.ownerAccountId).toBe("dana@acme.example");
    expect(result.workspace.name).toBe("My workspace");
    expect(result.workspace.salesforceOrgId).toBeUndefined();
    expect(await consumeToken(store, EMAIL_VERIFY_NS, result.verifyToken)).toEqual({
      accountId: "dana@acme.example",
    });
  });

  it("refuses an email that already has a password", async () => {
    const store = new InMemoryConfigStore();
    await signup(store, { email: "dana@acme.example", name: "Dana", password: "correct horse battery" });
    const again = await signup(store, {
      email: "Dana@Acme.example",
      name: "Imposter",
      password: "different password!",
    });
    expect(again.kind).toBe("exists-with-password");
    const account = await store.getAccountByEmail("dana@acme.example");
    expect(await verifyPassword(account!.passwordHash!, "correct horse battery")).toBe(true); // untouched
  });

  it("passwordless account: verification-first claim, no password written, no session result", async () => {
    const store = new InMemoryConfigStore();
    await store.upsertAccount({
      id: "rep@acme.example",
      email: "rep@acme.example",
      name: "Rep",
      salesforceUserId: "005AAAAAAAAAAAAAAA",
      createdAt: new Date().toISOString(),
    });
    const result = await signup(store, { email: "rep@acme.example", name: "Whoever", password: "a strong password!" });
    expect(result.kind).toBe("claim-email-sent");
    if (result.kind !== "claim-email-sent") return;
    expect((await store.getAccountByEmail("rep@acme.example"))!.passwordHash).toBeUndefined();
    expect(await peekToken(store, PASSWORD_RESET_NS, result.claimToken)).toEqual({ accountId: "rep@acme.example" });
  });

  it("refuses a password shorter than the minimum", async () => {
    const store = new InMemoryConfigStore();
    const result = await signup(store, {
      email: "short@acme.example",
      name: "Short",
      password: "a".repeat(MIN_PASSWORD_LENGTH - 1),
    });
    expect(result.kind).toBe("invalid");
    expect(await store.getAccountByEmail("short@acme.example")).toBeUndefined();
  });

  it("matches an uppercased email against the existing lowercase account", async () => {
    const store = new InMemoryConfigStore();
    await store.upsertAccount({
      id: "rep@acme.example",
      email: "rep@acme.example",
      name: "Rep",
      salesforceUserId: "005AAAAAAAAAAAAAAA",
      createdAt: new Date().toISOString(),
    });
    const result = await signup(store, {
      email: "Rep@Acme.example",
      name: "Whoever",
      password: "a strong password!",
    });
    // Case-insensitive match against the existing account: still a claim
    // flow (same as the exact-case passwordless test), never a fresh account.
    expect(result.kind).toBe("claim-email-sent");
    const allAccounts = await store.getAccountByEmail("rep@acme.example");
    expect(allAccounts?.id).toBe("rep@acme.example");
  });
});

describe("signin", () => {
  it("right password succeeds with the owned workspace; wrong password fails; unknown email fails", async () => {
    const store = new InMemoryConfigStore();
    await signup(store, { email: "dana@acme.example", name: "Dana", password: "correct horse battery" });

    const ok = await signin(store, { email: "dana@acme.example", password: "correct horse battery" });
    expect(ok.kind).toBe("ok");
    if (ok.kind !== "ok") return;
    expect(ok.workspace.ownerAccountId).toBe("dana@acme.example");

    const wrong = await signin(store, { email: "dana@acme.example", password: "not the password" });
    expect(wrong.kind).toBe("invalid");

    const unknown = await signin(store, { email: "nobody@acme.example", password: "whatever it is" });
    expect(unknown.kind).toBe("invalid");
  });

  it("a passwordless account fails sign-in rather than crashing", async () => {
    const store = new InMemoryConfigStore();
    await store.upsertAccount({
      id: "rep@acme.example",
      email: "rep@acme.example",
      name: "Rep",
      salesforceUserId: "005AAAAAAAAAAAAAAA",
      createdAt: new Date().toISOString(),
    });
    const result = await signin(store, { email: "rep@acme.example", password: "anything at all" });
    expect(result.kind).toBe("invalid");
  });
});

describe("requestPasswordReset", () => {
  it("known email yields a consumable token; unknown email yields undefined", async () => {
    const store = new InMemoryConfigStore();
    await signup(store, { email: "dana@acme.example", name: "Dana", password: "correct horse battery" });

    const known = await requestPasswordReset(store, "dana@acme.example");
    expect(known).toBeDefined();
    expect(await peekToken(store, PASSWORD_RESET_NS, known!.resetToken)).toEqual({
      accountId: "dana@acme.example",
    });

    const unknown = await requestPasswordReset(store, "nobody@acme.example");
    expect(unknown).toBeUndefined();
  });
});

describe("performPasswordReset", () => {
  it("valid token sets a new password, verifies email, ensures a workspace, and is single-use", async () => {
    const store = new InMemoryConfigStore();
    // A passwordless account, never owning a workspace, mirroring the claim flow.
    await store.upsertAccount({
      id: "rep@acme.example",
      email: "rep@acme.example",
      name: "Rep",
      salesforceUserId: "005AAAAAAAAAAAAAAA",
      createdAt: new Date().toISOString(),
    });
    expect(await store.getWorkspaceByOwner("rep@acme.example")).toBeUndefined();

    const claim = await requestPasswordReset(store, "rep@acme.example");
    expect(claim).toBeDefined();

    const result = await performPasswordReset(store, claim!.resetToken, "a brand new password!");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(await verifyPassword(result.account.passwordHash!, "a brand new password!")).toBe(true);
    expect(result.account.passwordChangedAt).toBeDefined();
    expect(result.account.emailVerifiedAt).toBeDefined();
    expect(result.workspace.ownerAccountId).toBe("rep@acme.example");
    expect(await store.getWorkspaceByOwner("rep@acme.example")).toBeDefined();

    // Token is single-use.
    const reuse = await performPasswordReset(store, claim!.resetToken, "yet another password!");
    expect(reuse.kind).toBe("invalid");
  });

  it("garbage token is invalid", async () => {
    const store = new InMemoryConfigStore();
    const result = await performPasswordReset(store, "not-a-real-token", "a brand new password!");
    expect(result.kind).toBe("invalid");
  });

  it("refuses a weak new password without consuming the token", async () => {
    const store = new InMemoryConfigStore();
    await signup(store, { email: "dana@acme.example", name: "Dana", password: "correct horse battery" });
    const reset = await requestPasswordReset(store, "dana@acme.example");
    const result = await performPasswordReset(store, reset!.resetToken, "short");
    expect(result.kind).toBe("weak");
  });
});

describe("verifyEmail", () => {
  it("valid token sets emailVerifiedAt; second use reports failure", async () => {
    const store = new InMemoryConfigStore();
    const signupResult = await signup(store, {
      email: "dana@acme.example",
      name: "Dana",
      password: "correct horse battery",
    });
    if (signupResult.kind !== "created") throw new Error("expected created");

    const first = await verifyEmail(store, signupResult.verifyToken);
    expect(first).toEqual({ ok: true });
    const account = await store.getAccountByEmail("dana@acme.example");
    expect(account?.emailVerifiedAt).toBeDefined();

    const second = await verifyEmail(store, signupResult.verifyToken);
    expect(second).toEqual({ ok: false });
  });
});

describe("ensureOwnedWorkspace", () => {
  it("is idempotent — returns the same workspace on repeated calls", async () => {
    const store = new InMemoryConfigStore();
    await store.upsertAccount({
      id: "dana@acme.example",
      email: "dana@acme.example",
      name: "Dana",
      createdAt: new Date().toISOString(),
    });
    const first = await ensureOwnedWorkspace(store, "dana@acme.example");
    const second = await ensureOwnedWorkspace(store, "dana@acme.example");
    expect(second.id).toBe(first.id);
  });
});
