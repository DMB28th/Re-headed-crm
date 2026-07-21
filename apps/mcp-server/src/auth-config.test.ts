import { describe, expect, it } from "vitest";
import { resolveMcpAuth } from "./auth-config.js";

describe("resolveMcpAuth (/mcp gate)", () => {
  it("boots but flags warnOpen in production when the secret is unset", () => {
    // Must NOT throw — crashing at boot would fail the deploy.
    expect(resolveMcpAuth({ NODE_ENV: "production" })).toEqual({ warnOpen: true });
    expect(resolveMcpAuth({ NODE_ENV: "production", MCP_SHARED_SECRET: "   " })).toEqual({
      warnOpen: true,
    });
  });

  it("returns the secret and does not warn when set", () => {
    expect(resolveMcpAuth({ NODE_ENV: "production", MCP_SHARED_SECRET: "s3cret" })).toEqual({
      secret: "s3cret",
      warnOpen: false,
    });
  });

  it("does not warn for an unset secret outside production (demo/local)", () => {
    expect(resolveMcpAuth({ NODE_ENV: "development" })).toEqual({ warnOpen: false });
    expect(resolveMcpAuth({})).toEqual({ warnOpen: false });
  });
});
