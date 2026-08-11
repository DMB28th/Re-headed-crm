import { describe, expect, it } from "vitest";
import { InMemoryConfigStore } from "@cardstack/config-store";
import { resolveSalesforceStudioLogin, safeNext } from "./login-flow";
import { consumeToken, issueToken, LINK_TTL_MS, PENDING_LINK_NS, peekToken } from "./auth-tokens";
import { hashPassword, verifyPassword } from "./password";

describe("safeNext", () => {
  it("keeps same-site destinations", () => {
    expect(safeNext("/objects/Opportunity/layouts?tab=fields")).toBe(
      "/objects/Opportunity/layouts?tab=fields",
    );
  });

  it("rejects absolute, protocol-relative, and empty redirects", () => {
    expect(safeNext("https://example.com")).toBe("/");
    expect(safeNext("//example.com")).toBe("/");
    expect(safeNext(undefined)).toBe("/");
  });

  // A6. WHATWG URL treats "\\" as "/" for special schemes, so these are
  // protocol-relative too — the leading-"//" check alone never saw them.
  it.each(["/\\evil.com", "/\\/evil.com", "/\\\\evil.com"])(
    "refuses %s, which resolves to a foreign origin",
    (candidate) => {
      expect(safeNext(candidate)).toBe("/");
    },
  );

  it("strips the control characters browsers ignore while parsing a URL", () => {
    expect(safeNext("/\t/evil.com")).toBe("/");
    expect(safeNext("/\r\n/evil.com")).toBe("/");
  });

  // The property, not the syntax: this is the test that catches the NEXT trick.
  it("never resolves to another origin", () => {
    const payloads = [
      "//e.com",
      "/\\e.com",
      "/\\/e.com",
      "/\t/e.com",
      "/%09/e.com",
      "/..//e.com",
      "/\u0000//e.com",
    ];
    for (const candidate of payloads) {
      expect(new URL(safeNext(candidate), "https://studio.test").origin).toBe("https://studio.test");
    }
  });
});

describe("resolveSalesforceStudioLogin", () => {
  it("id match signs in", async () => {
    const store = new InMemoryConfigStore();
    await store.upsertAccount({
      id: "dana@acme.example",
      email: "dana@acme.example",
      name: "Dana",
      salesforceUserId: "005AAAAAAAAAAAAAAA",
      createdAt: new Date().toISOString(),
    });

    const resolution = await resolveSalesforceStudioLogin(store, {
      orgId: "00DAAAAAAAAAAAAAAA",
      salesforceUserId: "005AAAAAAAAAAAAAAA",
      name: "Dana",
      email: "dana@acme.example",
    });

    expect(resolution.kind).toBe("signed-in");
    if (resolution.kind !== "signed-in") return;
    expect(resolution.account.id).toBe("dana@acme.example");
    // A rep identity entering Studio gets its own empty workspace (spec §3).
    expect(await store.getWorkspaceByOwner("dana@acme.example")).toBeDefined();
  });

  it("email match without id demands the password", async () => {
    const store = new InMemoryConfigStore();
    await store.upsertAccount({
      id: "dana@acme.example",
      email: "dana@acme.example",
      name: "Dana",
      passwordHash: await hashPassword("correct horse battery"),
      createdAt: new Date().toISOString(),
    });

    const resolution = await resolveSalesforceStudioLogin(store, {
      orgId: "00DAAAAAAAAAAAAAAA",
      salesforceUserId: "005BBBBBBBBBBBBBBB",
      name: "Dana",
      email: "dana@acme.example",
    });

    expect(resolution.kind).toBe("link-required");
    if (resolution.kind !== "link-required") return;
    expect(resolution.email).toBe("dana@acme.example");
    expect(await peekToken(store, PENDING_LINK_NS, resolution.linkToken)).toEqual({
      accountId: "dana@acme.example",
      salesforceUserId: "005BBBBBBBBBBBBBBB",
      name: "Dana",
    });
    // Silent link is the attack (spec §3): the id must not be written yet.
    const account = await store.getAccount("dana@acme.example");
    expect(account?.salesforceUserId).toBeUndefined();
  });

  it("email match on a passwordless account is unlinkable, not link-required", async () => {
    const store = new InMemoryConfigStore();
    // Passwordless account already tied to a DIFFERENT Salesforce user — e.g.
    // it was created by a prior "Continue with Salesforce" signup. It has no
    // passwordHash, so /api/auth/link has nothing to verify a password
    // against; routing this to link-required would only fail later with a
    // misleading "link expired".
    await store.upsertAccount({
      id: "dana@acme.example",
      email: "dana@acme.example",
      name: "Dana",
      salesforceUserId: "005AAAAAAAAAAAAAAA",
      createdAt: new Date().toISOString(),
    });

    const resolution = await resolveSalesforceStudioLogin(store, {
      orgId: "00DAAAAAAAAAAAAAAA",
      salesforceUserId: "005BBBBBBBBBBBBBBB",
      name: "Dana",
      email: "dana@acme.example",
    });

    expect(resolution.kind).toBe("unlinkable");
    if (resolution.kind !== "unlinkable") return;
    expect(resolution.email).toBe("dana@acme.example");
    expect(resolution.message).toMatch(/sign up with this email/i);
    // No link token minted, and no id silently overwritten.
    const account = await store.getAccount("dana@acme.example");
    expect(account?.salesforceUserId).toBe("005AAAAAAAAAAAAAAA");
  });

  it("no match creates a verified passwordless account", async () => {
    const store = new InMemoryConfigStore();

    const resolution = await resolveSalesforceStudioLogin(store, {
      orgId: "00DAAAAAAAAAAAAAAA",
      salesforceUserId: "005CCCCCCCCCCCCCCC",
      name: "New Rep",
      email: "newrep@acme.example",
    });

    expect(resolution.kind).toBe("created");
    if (resolution.kind !== "created") return;
    expect(resolution.account.emailVerifiedAt).toBeDefined();
    expect(resolution.account.salesforceUserId).toBe("005CCCCCCCCCCCCCCC");
    expect(resolution.account.passwordHash).toBeUndefined();
    expect(resolution.workspace.ownerAccountId).toBe(resolution.account.id);
    // Signup never claims an org (spec §3).
    expect(resolution.workspace.salesforceOrgId).toBeUndefined();
  });

  it("identity without email and without match creates from username fallback", async () => {
    const store = new InMemoryConfigStore();

    const resolution = await resolveSalesforceStudioLogin(store, {
      orgId: "00DAAAAAAAAAAAAAAA",
      salesforceUserId: "005DDDDDDDDDDDDDDD",
      name: "Dana Dev",
      username: "dana@acme.example.dev",
    });

    expect(resolution.kind).toBe("created");
    if (resolution.kind !== "created") return;
    expect(resolution.account.id).toBe("dana@acme.example.dev");
  });
});

// POST /api/auth/link is not HTTP-tested in this repo (no route-level test
// harness), so this exercises its exact sequence — consume, verify, upsert —
// against the store directly: create a passworded account, mint a pending-link
// token the way resolveSalesforceStudioLogin's link-required case does, then
// walk through what the route itself does with it.
describe("POST /api/auth/link semantics (store-level)", () => {
  it("a correct password records the salesforceUserId and the token is single-use", async () => {
    const store = new InMemoryConfigStore();
    await store.upsertAccount({
      id: "dana@acme.example",
      email: "dana@acme.example",
      name: "Dana",
      passwordHash: await hashPassword("correct horse battery"),
      createdAt: new Date().toISOString(),
    });

    const linkToken = await issueToken(
      store,
      PENDING_LINK_NS,
      { accountId: "dana@acme.example", salesforceUserId: "005BBBBBBBBBBBBBBB", name: "Dana" },
      LINK_TTL_MS,
    );

    // consumeToken deletes on read — the route's "consume, then verify" step.
    const pending = await consumeToken(store, PENDING_LINK_NS, linkToken);
    expect(pending).toEqual({
      accountId: "dana@acme.example",
      salesforceUserId: "005BBBBBBBBBBBBBBB",
      name: "Dana",
    });

    const account = await store.getAccount("dana@acme.example");
    expect(account?.passwordHash).toBeDefined();
    expect(await verifyPassword(account!.passwordHash!, "correct horse battery")).toBe(true);

    await store.upsertAccount({ ...account!, salesforceUserId: "005BBBBBBBBBBBBBBB" });
    const linked = await store.getAccount("dana@acme.example");
    expect(linked?.salesforceUserId).toBe("005BBBBBBBBBBBBBBB");

    // Single-use: the token cannot be replayed for a second link attempt.
    expect(await peekToken(store, PENDING_LINK_NS, linkToken)).toBeUndefined();
    expect(await consumeToken(store, PENDING_LINK_NS, linkToken)).toBeUndefined();
  });
});
