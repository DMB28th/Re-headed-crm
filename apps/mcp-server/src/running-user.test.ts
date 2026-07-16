import { describe, expect, it } from "vitest";
import { demoRunningUser } from "@cardstack/auth";
import { auditUserLabel } from "./server.js";

describe("auditUserLabel", () => {
  it("uses CRM user in demo mode", () => {
    expect(auditUserLabel(demoRunningUser("demo"), "Demo rep")).toBe("Demo rep");
  });

  it("prefixes Cardstack identity for MCP tokens", () => {
    const user = {
      userId: "u1",
      displayName: "Ada Admin",
      email: "ada@acme.test",
      role: "admin" as const,
      authMethod: "mcp_token" as const,
    };
    expect(auditUserLabel(user, "HubSpot private app")).toBe(
      "Ada Admin (CRM: HubSpot private app)",
    );
  });
});
