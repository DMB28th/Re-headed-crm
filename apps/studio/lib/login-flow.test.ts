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
