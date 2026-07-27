import { describe, expect, it } from "vitest";
import { safeNext } from "./login-flow";

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
});
