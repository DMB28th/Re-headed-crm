/**
 * Turns a CRM/API failure into something an admin can act on.
 *
 * Studio used to render `String(error)` verbatim in a dozen places, so an
 * admin whose HubSpot token was missing a scope got a stack trace with a
 * hand-written "if this mentions 403/scopes…" hint appended to it. The kind is
 * computed once, server-side where possible, and travels to the client.
 */
export type CrmErrorKind =
  | "scope"
  | "auth-expired"
  | "rate-limit"
  | "timeout"
  | "network"
  | "not-found"
  | "unknown";

export interface ClassifiedError {
  kind: CrmErrorKind;
  title: string;
  /** The next thing to do. Never a guess dressed as a diagnosis. */
  action: string;
  /** The original message, kept for the Details disclosure. */
  raw: string;
}

const RULES: { kind: CrmErrorKind; match: RegExp; title: string; action: string }[] = [
  {
    kind: "scope",
    match: /\b403\b|missing scope|insufficient scope|MISSING_SCOPES|forbidden/i,
    title: "The CRM app is missing a permission",
    action:
      "Add the missing scope to the connected app in your CRM, then reconnect it under Connections — a refresh alone won't pick up new scopes.",
  },
  {
    kind: "auth-expired",
    match: /\b401\b|unauthorized|invalid[_ ]grant|token (has )?expired|INVALID_SESSION_ID/i,
    title: "The connection is no longer authorized",
    action: "Reconnect the CRM under Connections to issue fresh credentials.",
  },
  {
    kind: "rate-limit",
    match: /\b429\b|rate limit|too many requests/i,
    title: "The CRM is rate-limiting us",
    action: "Wait a moment and retry. Nothing was changed.",
  },
  {
    kind: "timeout",
    match: /timeout|timed out|ETIMEDOUT|ESOCKETTIMEDOUT/i,
    title: "The CRM took too long to respond",
    action: "Retry. If it keeps happening, check your CRM's status page.",
  },
  {
    kind: "network",
    match: /ENOTFOUND|ECONNREFUSED|ECONNRESET|fetch failed|network/i,
    title: "Couldn't reach the CRM",
    action: "Check the connection's instance URL and that the CRM is reachable, then retry.",
  },
  {
    kind: "not-found",
    match: /\b404\b|not found|does not exist/i,
    title: "The CRM doesn't have that any more",
    action:
      "The object, view or field may have been deleted or renamed in the CRM. Regenerate the draft to pick up the current fields.",
  },
];

export function classifyCrmError(error: unknown): ClassifiedError {
  const raw =
    error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
  const rule = RULES.find((candidate) => candidate.match.test(raw));
  if (rule) return { kind: rule.kind, title: rule.title, action: rule.action, raw };
  return {
    kind: "unknown",
    title: "Something went wrong talking to the CRM",
    action: "Retry. If it persists, the details below are what to report.",
    raw,
  };
}
