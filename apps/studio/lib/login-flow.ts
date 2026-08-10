/** Shared bits of the Salesforce sign-in lane (start ↔ callback). */

/** KV namespace for pending sign-ins, keyed by the OAuth `state`. */
export const LOGIN_PENDING_NS = "studio-login-pending";
export const LOGIN_PENDING_TTL_MS = 15 * 60 * 1000;

export interface PendingLogin {
  codeVerifier: string;
  redirectUri: string;
  loginUrl: string;
  next: string;
}

/**
 * Only same-site paths survive as post-login redirects. `//evil.com` is a
 * protocol-relative URL that browsers treat as absolute, so rejecting a leading
 * `//` is what stops this being an open redirect.
 */
export function safeNext(candidate: string | null | undefined): string {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) return "/";
  return candidate;
}
