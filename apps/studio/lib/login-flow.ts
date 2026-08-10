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
 * Only same-site paths survive as post-login redirects.
 *
 * Two separate tricks turn a "path" into a foreign origin, and rejecting a
 * leading `//` only stops the first:
 *
 * - `//evil.com` is protocol-relative, and browsers treat it as absolute.
 * - `/\evil.com` is too. WHATWG URL parsing treats `\` as `/` for special
 *   schemes, so `new URL("/\evil.com", origin)` resolves to `https://evil.com/`.
 *   This is what makes the check below look at the SECOND character rather than
 *   at the literal string `//`.
 *
 * Browsers also strip tab, CR and LF while parsing a URL, so those are removed
 * first — otherwise `/<TAB>/evil.com` passes both checks here and still becomes
 * `//evil.com` by the time the browser resolves it.
 *
 * Callers must ALSO assert the resolved origin (see the sign-in callback): this
 * function is the fix, that assertion is what makes the next encoding trick a
 * non-event.
 */
const ignorable = (ch: string): boolean => {
  const code = ch.charCodeAt(0);
  return code <= 0x1f || code === 0x7f;
};

export function safeNext(candidate: string | null | undefined): string {
  if (!candidate) return "/";
  const cleaned = [...candidate].filter((ch) => !ignorable(ch)).join("");
  if (!cleaned.startsWith("/") || /^[/\\]/.test(cleaned.slice(1))) return "/";
  return cleaned;
}
