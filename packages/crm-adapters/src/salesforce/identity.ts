/**
 * Salesforce-as-identity-provider: who signed in, and which app we sign them in
 * with. Shared by Studio's browser login and the MCP server's OAuth callback so
 * both lanes derive the same org id, user id, and account key.
 *
 * The Cardstack-owned connected app (CARDSTACK_SF_CLIENT_ID/SECRET) exists to
 * break a chicken-and-egg: signing in with Salesforce is what CREATES the
 * workspace, so there is no workspace-scoped client id to authorize against
 * yet. A workspace can still bring its own connected app for runtime data
 * access — that is a separate, later choice — but the login lane is always the
 * Cardstack app.
 */
import { CrmAuthError } from "../adapter.js";

type FetchLike = typeof fetch;

/** The two ids Salesforce puts in the identity URL. */
export interface SalesforceIdentityUrlParts {
  /** 18-char org id. */
  orgId: string;
  /** 18-char user id. */
  userId: string;
}

/**
 * Identity URLs look like
 * `https://login.salesforce.com/id/00D5g000004abcdEAA/0055g00000AbCdEAAV`
 * — org id then user id. Returns undefined for anything that isn't that shape,
 * so callers fail closed rather than inventing a workspace from a garbage id.
 */
export function parseSalesforceIdentityUrl(
  identityUrl?: string,
): SalesforceIdentityUrlParts | undefined {
  if (!identityUrl) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(identityUrl);
  } catch {
    return undefined;
  }
  const segments = parsed.pathname.split("/").filter(Boolean);
  const userId = segments.at(-1);
  const orgId = segments.at(-2);
  if (!orgId || !userId) return undefined;
  // Salesforce ids are 15 or 18 alphanumeric chars; orgs always start with 00D.
  if (!/^[a-zA-Z0-9]{15,18}$/.test(orgId) || !/^[a-zA-Z0-9]{15,18}$/.test(userId)) return undefined;
  if (!orgId.startsWith("00D")) return undefined;
  return { orgId, userId };
}

/** Credentials for the Cardstack-owned connected app used by the login lane. */
export interface SalesforceLoginApp {
  clientId: string;
  clientSecret: string;
}

/**
 * The Cardstack-owned connected app, or undefined when unconfigured — callers
 * must surface a setup message rather than falling back to a workspace's own
 * app (at login time we don't yet know which workspace that would be).
 */
export function cardstackSalesforceLoginApp(
  env: Record<string, string | undefined> = process.env,
): SalesforceLoginApp | undefined {
  const clientId = env.CARDSTACK_SF_CLIENT_ID?.trim();
  const clientSecret = env.CARDSTACK_SF_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return undefined;
  return { clientId, clientSecret };
}

/**
 * Resolve the client secret for credentials minted by the Cardstack-owned
 * connected app (`clientApp: "cardstack"`). Such credentials are persisted
 * WITHOUT a secret — the env-configured app supplies it at use time, so
 * rotating CARDSTACK_SF_CLIENT_SECRET heals every one-click workspace at once.
 * A stored secret always wins (BYO connections pass through untouched). Throws
 * rather than proceeding secretless when a cardstack-app credential set has no
 * matching env app.
 */
export function hydrateSalesforceClientSecret<
  T extends { clientId?: string; clientSecret?: string; clientApp?: string },
>(
  credentials: T,
  loginApp: SalesforceLoginApp | undefined = cardstackSalesforceLoginApp(),
): T {
  if (credentials.clientSecret) return credentials;
  if (credentials.clientApp !== "cardstack") return credentials;
  if (!loginApp || loginApp.clientId !== credentials.clientId) {
    throw new CrmAuthError(
      "Salesforce",
      "This workspace connected through Cardstack's Salesforce app, but this deployment's app is missing or changed. Reconnect Salesforce from Studio.",
    );
  }
  return { ...credentials, clientSecret: loginApp.clientSecret };
}

/** Never persist the Cardstack app's env secret into a store row. */
export function stripCardstackClientSecret<
  T extends { clientSecret?: string; clientApp?: string },
>(credentials: T): T {
  if (credentials.clientApp !== "cardstack") return credentials;
  const { clientSecret: _omit, ...rest } = credentials;
  return rest as T;
}

/** Everything a completed sign-in knows about the signer and their org. */
export interface SalesforceSignerIdentity {
  orgId: string;
  salesforceUserId: string;
  name: string;
  email?: string;
  username?: string;
  orgName?: string;
}

/**
 * Resolve the signer from a freshly-exchanged token. The ids come from the
 * identity URL (authoritative, no API call); the display fields come from one
 * SOQL round trip that the `api` scope already permits.
 *
 * The org name is best-effort: a user without read access to Organization
 * still gets a working workspace, just a default name an admin can change.
 */
export async function fetchSalesforceSignerIdentity(
  credentials: { instanceUrl?: string; accessToken?: string; identityUrl?: string },
  fetchImpl: FetchLike = fetch,
): Promise<SalesforceSignerIdentity> {
  const parts = parseSalesforceIdentityUrl(credentials.identityUrl);
  if (!parts) {
    throw new Error(
      "Salesforce did not return a usable identity URL, so we cannot tell which org you signed in to.",
    );
  }
  const { instanceUrl, accessToken } = credentials;
  if (!instanceUrl || !accessToken) {
    throw new Error("Salesforce sign-in did not return an instance URL and access token.");
  }

  const query = async (soql: string): Promise<Record<string, unknown> | undefined> => {
    const res = await fetchImpl(
      `${instanceUrl}/services/data/v61.0/query?q=${encodeURIComponent(soql)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
    const data = (await res.json().catch(() => ({}))) as { records?: Record<string, unknown>[] };
    return data.records?.[0];
  };

  // Ids are already validated as alphanumeric by parseSalesforceIdentityUrl, so
  // they cannot break out of the quoted SOQL literal.
  const [user, org] = await Promise.all([
    query(`SELECT Name, Email, Username FROM User WHERE Id = '${parts.userId}'`).catch(
      () => undefined,
    ),
    query("SELECT Name FROM Organization LIMIT 1").catch(() => undefined),
  ]);

  return {
    orgId: parts.orgId,
    salesforceUserId: parts.userId,
    name: (user?.Name as string) ?? "Salesforce user",
    ...(user?.Email ? { email: user.Email as string } : {}),
    ...(user?.Username ? { username: user.Username as string } : {}),
    ...(org?.Name ? { orgName: org.Name as string } : {}),
  };
}
