/**
 * HubSpot three-legged OAuth helpers (M7 per-rep credentials).
 * Studio uses these for "Connect HubSpot as me"; the MCP server refreshes
 * tokens before building a per-rep adapter.
 *
 * Auth URL: https://app.hubspot.com/oauth/authorize
 * Token URL: https://api.hubapi.com/oauth/v1/token
 */
export const HUBSPOT_OAUTH_SCOPES = [
  "oauth",
  "crm.objects.deals.read",
  "crm.objects.deals.write",
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
  "crm.objects.companies.read",
  "crm.objects.companies.write",
  "crm.objects.owners.read",
  "crm.lists.read",
  "crm.schemas.deals.read",
  "crm.schemas.contacts.read",
  "crm.schemas.companies.read",
] as const;

export interface HubSpotOAuthApp {
  clientId: string;
  clientSecret: string;
}

export interface HubSpotTokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO
  scopes?: string;
}

export interface HubSpotAccessTokenInfo {
  userId: string;
  email?: string;
  hubId?: string;
  scopes?: string[];
}

export function hubspotAuthorizeUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes?: readonly string[];
}): string {
  const scopes = (args.scopes ?? HUBSPOT_OAUTH_SCOPES).join(" ");
  const params = new URLSearchParams({
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    scope: scopes,
    state: args.state,
  });
  return `https://app.hubspot.com/oauth/authorize?${params.toString()}`;
}

export async function exchangeHubSpotCode(
  app: HubSpotOAuthApp,
  args: { code: string; redirectUri: string },
): Promise<HubSpotTokenSet> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: app.clientId,
    client_secret: app.clientSecret,
    redirect_uri: args.redirectUri,
    code: args.code,
  });
  const res = await fetch("https://api.hubapi.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot token exchange failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope?: string;
  };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
    ...(json.scope ? { scopes: json.scope } : {}),
  };
}

export async function refreshHubSpotAccessToken(
  app: HubSpotOAuthApp,
  refreshToken: string,
): Promise<HubSpotTokenSet> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: app.clientId,
    client_secret: app.clientSecret,
    refresh_token: refreshToken,
  });
  const res = await fetch("https://api.hubapi.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot token refresh failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
    ...(json.scope ? { scopes: json.scope } : {}),
  };
}

/** Identity on an access token — HubSpot user_id for $me linking. */
export async function fetchHubSpotAccessTokenInfo(
  accessToken: string,
): Promise<HubSpotAccessTokenInfo> {
  const res = await fetch(`https://api.hubapi.com/oauth/v1/access-tokens/${accessToken}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot access-token info failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as {
    user_id?: number | string;
    user?: string;
    hub_id?: number | string;
    scopes?: string[];
  };
  const userId = json.user_id != null ? String(json.user_id) : "";
  if (!userId) throw new Error("HubSpot access-token info missing user_id");
  return {
    userId,
    ...(json.user ? { email: json.user } : {}),
    ...(json.hub_id != null ? { hubId: String(json.hub_id) } : {}),
    ...(json.scopes ? { scopes: json.scopes } : {}),
  };
}
