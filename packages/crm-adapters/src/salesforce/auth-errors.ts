/**
 * Turn Salesforce's OAuth refusals into something the person reading them can
 * act on.
 *
 * Self-signup's most common real-world blocker is not technical: the signer is
 * not a Salesforce admin, and their org requires admin approval before a
 * connected app may be used. Salesforce says so in its own vocabulary
 * ("OAUTH_APPROVAL_ERROR_GENERIC", "not admin approved"), and both lanes
 * rendered that string raw — in a query param on Studio's login page, or in an
 * unstyled <h3> from the MCP server. A person who has hit a policy wall was
 * being handed an error code and left to guess.
 *
 * We cannot approve the app for them; that is genuinely their admin's call.
 * What we can do is hand them the exact request to make, which is the
 * difference between a stalled signup and one Slack message.
 */

export interface SalesforceAuthGuidance {
  /** Replaces the raw error entirely. */
  message: string;
  /** True when the cause is org policy rather than anything Cardstack did. */
  needsSalesforceAdmin: boolean;
}

const APPROVAL_MARKERS = [
  "oauth_approval_error",
  "not admin approved",
  "admin approved users are pre-authorized",
  "this app is blocked",
  "app is not approved",
];

const BLOCKED_MARKERS = ["oauth_access_denied", "access to this app is restricted"];

/**
 * @param raw   whatever Salesforce returned (error, error_description, or both)
 * @param app   the connected app the signer was sent to, so the message can
 *              name what their admin has to find
 */
export function describeSalesforceAuthError(
  raw: string,
  app?: { name?: string; clientId?: string },
): SalesforceAuthGuidance {
  const haystack = raw.toLowerCase();
  const appName = app?.name?.trim() || "Cardstack";
  const consumerKey = app?.clientId?.trim();
  const identify = consumerKey
    ? `${appName} (consumer key ${consumerKey})`
    : appName;

  if (APPROVAL_MARKERS.some((marker) => haystack.includes(marker))) {
    return {
      needsSalesforceAdmin: true,
      message:
        `Your Salesforce org requires an admin to approve connected apps before anyone can use them, ` +
        `so Cardstack was refused. Ask a Salesforce admin to open Setup → App Manager → ${identify} → ` +
        `Manage → Edit Policies, and set "Permitted Users" to "All users may self-authorize" — or to ` +
        `pre-authorize your profile. Nothing needs to change in Cardstack; try signing in again once they have.`,
    };
  }

  if (BLOCKED_MARKERS.some((marker) => haystack.includes(marker))) {
    return {
      needsSalesforceAdmin: true,
      message:
        `Salesforce blocked this sign-in. That is usually an org policy — an IP range, a login-hours ` +
        `restriction, or a blocked connected app. Ask a Salesforce admin to check whether ${identify} ` +
        `is permitted for your user, then try again.`,
    };
  }

  if (haystack.includes("end-user denied authorization") || haystack.includes("user denied")) {
    return {
      needsSalesforceAdmin: false,
      message: "You cancelled the Salesforce sign-in. Nothing was connected — try again when you're ready.",
    };
  }

  // Unrecognized: pass it through rather than inventing a diagnosis. A wrong
  // explanation costs more than an opaque one.
  return { needsSalesforceAdmin: false, message: raw };
}
