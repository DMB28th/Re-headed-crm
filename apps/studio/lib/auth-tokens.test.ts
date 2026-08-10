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
