import { describe, expect, it } from "vitest";
import { describeSalesforceAuthError } from "./auth-errors.js";

const APP = { name: "Cardstack", clientId: "3MVG9abc" };

describe("describeSalesforceAuthError", () => {
  it("recognizes the admin-approval wall and says exactly what to ask for", () => {
    const guidance = describeSalesforceAuthError("OAUTH_APPROVAL_ERROR_GENERIC", APP);
    expect(guidance.needsSalesforceAdmin).toBe(true);
    expect(guidance.message).toContain("All users may self-authorize");
    expect(guidance.message).toContain("3MVG9abc");
  });

  it("recognizes the prose form Salesforce sometimes returns instead", () => {
    expect(
      describeSalesforceAuthError("user is not admin approved to access this app", APP)
        .needsSalesforceAdmin,
    ).toBe(true);
  });

  it("treats a blocked app as a policy problem, not a Cardstack one", () => {
    expect(
      describeSalesforceAuthError("OAUTH_ACCESS_DENIED", APP).needsSalesforceAdmin,
    ).toBe(true);
  });

  it("does not blame an admin when the person simply cancelled", () => {
    const guidance = describeSalesforceAuthError("end-user denied authorization", APP);
    expect(guidance.needsSalesforceAdmin).toBe(false);
    expect(guidance.message).toContain("cancelled");
  });

  it("passes an unrecognized error through rather than inventing a diagnosis", () => {
    expect(describeSalesforceAuthError("something new and strange", APP)).toEqual({
      needsSalesforceAdmin: false,
      message: "something new and strange",
    });
  });

  it("still names the app when no consumer key is available", () => {
    const guidance = describeSalesforceAuthError("OAUTH_APPROVAL_ERROR_GENERIC", {});
    expect(guidance.message).toContain("Cardstack");
    expect(guidance.message).not.toContain("consumer key");
  });
});
