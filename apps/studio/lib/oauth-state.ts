import { createHmac, timingSafeEqual } from "node:crypto";

export function studioBaseUrl(): string {
  return process.env.BETTER_AUTH_URL ?? process.env.STUDIO_URL ?? "http://localhost:3002";
}

export function hubspotOauthRedirectUri(): string {
  return `${studioBaseUrl().replace(/\/$/, "")}/api/team/crm-oauth/hubspot/callback`;
}

export type OauthStatePayload = {
  userId: string;
  tenantId: string;
  /** Workspace HubSpot portal (hub id) — callback must match. */
  expectedPortalId: string;
  exp: number;
};

export function signOauthState(payload: string): string {
  const secret = process.env.BETTER_AUTH_SECRET ?? "dev";
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyOauthState(state: string): OauthStatePayload | null {
  const i = state.lastIndexOf(".");
  if (i < 0) return null;
  const payload = state.slice(0, i);
  const sig = state.slice(i + 1);
  const secret = process.env.BETTER_AUTH_SECRET ?? "dev";
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OauthStatePayload;
    if (Date.now() > data.exp) return null;
    if (!data.userId || !data.tenantId || !data.expectedPortalId) return null;
    return data;
  } catch {
    return null;
  }
}
