/**
 * The confirm token is what turns "every write is confirmed" from a claim the
 * widget makes into something the server checks, so the interesting cases are
 * all the ways a caller might try to get `via: "widget"` without a rep having
 * confirmed that exact diff.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  ConfirmTokenError,
  mintConfirmToken,
  resetConfirmTokenSecret,
  signState,
  verifyConfirmToken,
  verifyState,
} from "./confirm-token.js";

const subject = {
  tenantId: "t1",
  object: "Account",
  recordId: "001abc",
  patch: { Industry: "Technology", AnnualRevenue: 5000 },
  actorUserId: "user-1",
};

beforeEach(() => {
  delete process.env.CARDSTACK_ENCRYPTION_KEY;
  resetConfirmTokenSecret();
});

describe("confirm tokens", () => {
  it("verifies a token against the write it was minted for", () => {
    const minted = mintConfirmToken(subject);
    const verified = verifyConfirmToken(minted.token, subject);
    expect(verified.confirmationId).toBe(minted.confirmationId);
    expect(verified.previewedAt).toBe(minted.previewedAt);
  });

  it("ignores patch key order — the widget may echo the patch back reordered", () => {
    const minted = mintConfirmToken(subject);
    expect(() =>
      verifyConfirmToken(minted.token, {
        ...subject,
        patch: { AnnualRevenue: 5000, Industry: "Technology" },
      }),
    ).not.toThrow();
  });

  it("rejects a changed VALUE — the whole point is binding to the confirmed diff", () => {
    const minted = mintConfirmToken(subject);
    expect(() =>
      verifyConfirmToken(minted.token, {
        ...subject,
        patch: { Industry: "Technology", AnnualRevenue: 50_000_000 },
      }),
    ).toThrow(ConfirmTokenError);
  });

  it("rejects an ADDED field that the rep never saw in the diff", () => {
    const minted = mintConfirmToken(subject);
    expect(() =>
      verifyConfirmToken(minted.token, {
        ...subject,
        patch: { ...subject.patch, OwnerId: "005xyz" },
      }),
    ).toThrow(ConfirmTokenError);
  });

  it("rejects reuse against a different record", () => {
    const minted = mintConfirmToken(subject);
    expect(() => verifyConfirmToken(minted.token, { ...subject, recordId: "001other" })).toThrow(
      ConfirmTokenError,
    );
  });

  it("rejects reuse across tenants", () => {
    const minted = mintConfirmToken(subject);
    expect(() => verifyConfirmToken(minted.token, { ...subject, tenantId: "t2" })).toThrow(
      ConfirmTokenError,
    );
  });

  it("rejects reuse by a different user", () => {
    const minted = mintConfirmToken(subject);
    expect(() => verifyConfirmToken(minted.token, { ...subject, actorUserId: "user-2" })).toThrow(
      ConfirmTokenError,
    );
  });

  it("rejects a tampered signature", () => {
    const minted = mintConfirmToken(subject);
    const [body] = minted.token.split(".");
    expect(() => verifyConfirmToken(`${body}.forged`, subject)).toThrow(ConfirmTokenError);
  });

  it("rejects a re-encoded body — the payload is signed, not merely encoded", () => {
    const minted = mintConfirmToken(subject);
    const [body, signature] = minted.token.split(".");
    const decoded = JSON.parse(Buffer.from(body!, "base64url").toString("utf8"));
    const swapped = Buffer.from(JSON.stringify({ ...decoded, r: "001other" }), "utf8").toString(
      "base64url",
    );
    expect(() => verifyConfirmToken(`${swapped}.${signature}`, subject)).toThrow(ConfirmTokenError);
  });

  it("rejects a malformed token", () => {
    expect(() => verifyConfirmToken("not-a-token", subject)).toThrow(ConfirmTokenError);
  });

  it("expires", () => {
    const minted = mintConfirmToken(subject, 1_000_000);
    expect(() => verifyConfirmToken(minted.token, subject, 1_000_000 + 4 * 60_000)).not.toThrow();
    expect(() => verifyConfirmToken(minted.token, subject, 1_000_000 + 6 * 60_000)).toThrow(
      ConfirmTokenError,
    );
  });

  it("is unforgeable even with no CARDSTACK_ENCRYPTION_KEY configured", () => {
    // Signing must never degrade to a pass-through the way interview state
    // does: an unsigned confirm token would let anything claim rep provenance
    // and make the audit log lie.
    const minted = mintConfirmToken(subject);
    const [body] = minted.token.split(".");
    expect(minted.token).toContain(".");
    expect(() => verifyConfirmToken(`${body}.`, subject)).toThrow(ConfirmTokenError);
    expect(() => verifyConfirmToken(body!, subject)).toThrow(ConfirmTokenError);
  });

  it("state tokens round-trip and reject tampering", () => {
    const body = Buffer.from(JSON.stringify({ pendingWrite: "Create_Order" })).toString("base64url");
    const signed = signState(body);
    expect(verifyState(signed, "nope")).toBe(body);
    expect(() => verifyState(body, "nope")).toThrow(ConfirmTokenError); // unsigned
    expect(() => verifyState(`${body}.forged`, "nope")).toThrow(ConfirmTokenError);
  });

  it("state tokens stay signed with no encryption key — no unsigned passthrough", () => {
    // signInterviewState used to return the body untouched when no key was set,
    // which made a flow's pendingWrite state a forgeable write authorization.
    delete process.env.CARDSTACK_ENCRYPTION_KEY;
    resetConfirmTokenSecret();
    const signed = signState("body");
    expect(signed).not.toBe("body");
    expect(() => verifyState("body", "nope")).toThrow(ConfirmTokenError);
  });

  it("state tokens tolerate a body containing dots", () => {
    const body = "a.b.c";
    expect(verifyState(signState(body), "nope")).toBe(body);
  });

  it("does not verify tokens minted under a different secret", () => {
    const minted = mintConfirmToken(subject);
    process.env.CARDSTACK_ENCRYPTION_KEY = "a".repeat(64);
    resetConfirmTokenSecret();
    expect(() => verifyConfirmToken(minted.token, subject)).toThrow(ConfirmTokenError);
  });
});
