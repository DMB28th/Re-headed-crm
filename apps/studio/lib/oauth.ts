import { randomBytes, createHash } from "node:crypto";

const base64url = (buf: Buffer): string => buf.toString("base64url");

/**
 * PKCE pair for the Salesforce authorization-code flow. The verifier is stored
 * server-side on the pending connection record (keyed by the OAuth `state`) and
 * replayed at token exchange; the challenge goes on the authorize URL.
 */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

/**
 * Canonical Studio origin for OAuth redirect_uri. Prefer the configured origin so
 * redirect_uri is deterministic and not influenced by a forwarded Host header;
 * fall back to the request origin for local dev where CARDSTACK_STUDIO_URL is unset.
 */
export function studioOrigin(reqUrl: string): string {
  const configured = process.env.CARDSTACK_STUDIO_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return new URL(reqUrl).origin;
}
