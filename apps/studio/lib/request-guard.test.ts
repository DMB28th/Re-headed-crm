import { beforeEach, describe, expect, it } from "vitest";
import { clientKey, rateLimited, resetRateLimits, sameOriginRequest } from "./request-guard";

const headers = (values: Record<string, string>) => ({
  get: (name: string) => values[name.toLowerCase()] ?? null,
});

describe("rateLimited", () => {
  beforeEach(resetRateLimits);

  it("allows up to the limit and refuses past it", () => {
    const now = 1_000;
    for (let i = 0; i < 3; i += 1) {
      expect(rateLimited("ip", { max: 3, now })).toBe(false);
    }
    expect(rateLimited("ip", { max: 3, now })).toBe(true);
  });

  it("opens a fresh window once the old one expires", () => {
    expect(rateLimited("ip", { max: 1, now: 0 })).toBe(false);
    expect(rateLimited("ip", { max: 1, now: 0 })).toBe(true);
    expect(rateLimited("ip", { max: 1, now: 60_001 })).toBe(false);
  });

  it("counts each key separately", () => {
    expect(rateLimited("a", { max: 1, now: 0 })).toBe(false);
    expect(rateLimited("b", { max: 1, now: 0 })).toBe(false);
  });
});

describe("clientKey", () => {
  it("takes the first hop of x-forwarded-for", () => {
    expect(clientKey({ headers: headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }) })).toBe("1.2.3.4");
  });

  it("falls back to a constant rather than throwing", () => {
    expect(clientKey({ headers: headers({}) })).toBe("unknown");
  });
});

describe("sameOriginRequest", () => {
  const post = (origin?: string) => ({
    method: "POST",
    url: "https://studio.test/api/layout/deals/publish",
    headers: headers(origin ? { origin } : {}),
  });

  it("allows a same-origin POST", () => {
    expect(sameOriginRequest(post("https://studio.test"), "https://studio.test")).toBe(true);
  });

  it("refuses a cross-origin POST", () => {
    expect(sameOriginRequest(post("https://evil.example"), "https://studio.test")).toBe(false);
  });

  it("allows a POST with no Origin header at all", () => {
    expect(sameOriginRequest(post(), "https://studio.test")).toBe(true);
  });

  it("ignores reads entirely", () => {
    expect(
      sameOriginRequest(
        { method: "GET", url: "https://studio.test/", headers: headers({ origin: "https://evil.example" }) },
        "https://studio.test",
      ),
    ).toBe(true);
  });

  it("does not match on prefix", () => {
    expect(sameOriginRequest(post("https://studio.test.evil.example"), "https://studio.test")).toBe(false);
  });

  it("falls back to the request origin when none is configured", () => {
    expect(sameOriginRequest(post("https://studio.test"), undefined)).toBe(true);
    expect(sameOriginRequest(post("https://evil.example"), undefined)).toBe(false);
  });
});
