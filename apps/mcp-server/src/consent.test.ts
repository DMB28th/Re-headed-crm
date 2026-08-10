import { describe, expect, it } from "vitest";
import { escapeHtml, isFirstPartyClient, renderConsent } from "./consent.js";

const client = (...redirect_uris: string[]) => ({ redirect_uris });

describe("isFirstPartyClient", () => {
  const env = { CARDSTACK_TRUSTED_CLIENT_ORIGINS: "https://claude.ai, https://chatgpt.com" };

  it("trusts a client whose only redirect_uri is a configured origin", () => {
    expect(isFirstPartyClient(client("https://claude.ai/api/mcp/auth_callback"), env)).toBe(true);
  });

  // The A1 shape: one blessed URI is not a licence for the other one.
  it("requires EVERY registered redirect_uri to be trusted", () => {
    expect(
      isFirstPartyClient(client("https://claude.ai/cb", "https://evil.example/cb"), env),
    ).toBe(false);
  });

  it("matches on origin, not on prefix", () => {
    expect(isFirstPartyClient(client("https://claude.ai.evil.example/cb"), env)).toBe(false);
  });

  it("is false when no origins are configured, so a forgotten env var shows the screen", () => {
    expect(isFirstPartyClient(client("https://claude.ai/cb"), {})).toBe(false);
  });

  it("is false for a client that registered no redirect_uri at all", () => {
    expect(isFirstPartyClient(client(), env)).toBe(false);
  });

  it("ignores unparseable entries rather than trusting them", () => {
    expect(isFirstPartyClient(client("not-a-url"), env)).toBe(false);
    expect(isFirstPartyClient(client("https://claude.ai/cb"), { CARDSTACK_TRUSTED_CLIENT_ORIGINS: "nonsense" })).toBe(false);
  });
});

describe("escapeHtml", () => {
  it("neutralizes a script tag", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });
});

describe("renderConsent", () => {
  const details = {
    token: "tok",
    signerName: "Dana K.",
    signerEmail: "dana@example.com",
    workspaceName: "Acme Corp",
    clientName: '<img src=x onerror="alert(1)">',
    redirectOrigin: "https://evil.example",
  };

  it("escapes the attacker-controlled client name", () => {
    const html = renderConsent(details, "/oauth/consent");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });

  it("states the redirect origin, which is the fact an attacker cannot disguise", () => {
    expect(renderConsent(details, "/oauth/consent")).toContain("https://evil.example");
  });

  it("names the signer so the decision is made by someone who knows who they are", () => {
    expect(renderConsent(details, "/oauth/consent")).toContain("dana@example.com");
  });

  it("offers a real cancel, not just an allow", () => {
    expect(renderConsent(details, "/oauth/consent")).toContain('value="deny"');
  });
});
