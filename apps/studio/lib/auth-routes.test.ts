import { describe, expect, it } from "vitest";
import { buildAuthLinks, claimEmail, resetEmail, verificationEmail } from "./auth-links";

describe("buildAuthLinks", () => {
  it("embeds the token URL-encoded (claimUrl is the same page as resetUrl)", () => {
    const links = buildAuthLinks("https://studio.example.com");
    expect(links.verifyUrl("a b+c")).toBe("https://studio.example.com/verify?token=a%20b%2Bc");
    expect(links.resetUrl("a b+c")).toBe("https://studio.example.com/reset?token=a%20b%2Bc");
    expect(links.claimUrl("a b+c")).toBe(links.resetUrl("a b+c"));
  });
});

describe("email copy", () => {
  it("verificationEmail and claimEmail mention the 24 hour expiry", () => {
    expect(verificationEmail("Dana", "https://studio.example.com/verify?token=tok").text).toContain("24 hours");
    expect(claimEmail("Dana", "https://studio.example.com/reset?token=tok").text).toContain("24 hours");
  });

  it("resetEmail mentions the 30 minute expiry", () => {
    expect(resetEmail("Dana", "https://studio.example.com/reset?token=tok").text).toContain("30 minutes");
  });
});
