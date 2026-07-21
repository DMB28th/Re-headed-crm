import { describe, expect, it } from "vitest";
import { resolveMcpAuth } from "./auth-config.js";

describe("resolveMcpAuth (fail-closed /mcp gate)", () => {
  it("refuses to serve in production when MCP_SHARED_SECRET is unset", () => {
    expect(() => resolveMcpAuth({ NODE_ENV: "production" })).toThrow(/required when NODE_ENV=production/);
    expect(() => resolveMcpAuth({ NODE_ENV: "production", MCP_SHARED_SECRET: "   " })).toThrow(
      /required when NODE_ENV=production/,
    );
  });

  it("returns the secret in production when set", () => {
    expect(resolveMcpAuth({ NODE_ENV: "production", MCP_SHARED_SECRET: "s3cret" })).toEqual({
      secret: "s3cret",
    });
  });

  it("allows an unset secret outside production (demo/local)", () => {
    expect(resolveMcpAuth({ NODE_ENV: "development" })).toEqual({});
    expect(resolveMcpAuth({})).toEqual({});
  });
});
