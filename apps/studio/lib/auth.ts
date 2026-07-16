/**
 * Studio auth (M7) — better-auth with organizations (= accounts) and SSO.
 *
 * PLAN.md non-goal: no password flows; OAuth-only via a library.
 * Providers (enabled when env credentials are present):
 *   - Google (social)
 *   - HubSpot (genericOAuth helper)
 *   - Salesforce (genericOAuth custom endpoints)
 *
 * When BETTER_AUTH_SECRET + DATABASE_URL are unset, Studio stays in open
 * demo mode (TENANT_ID = t_demo) so local demos keep working.
 */
import { betterAuth } from "better-auth";
import { genericOAuth, hubspot, organization } from "better-auth/plugins";
import { Pool } from "pg";
import { ensureAuthSchema } from "./auth-schema";

export function isAuthEnabled(): boolean {
  return Boolean(process.env.BETTER_AUTH_SECRET && process.env.DATABASE_URL);
}

function oauthProviders(): Parameters<typeof genericOAuth>[0]["config"] {
  const configs: Parameters<typeof genericOAuth>[0]["config"] = [];

  if (process.env.HUBSPOT_CLIENT_ID && process.env.HUBSPOT_CLIENT_SECRET) {
    configs.push(
      hubspot({
        clientId: process.env.HUBSPOT_CLIENT_ID,
        clientSecret: process.env.HUBSPOT_CLIENT_SECRET,
        scopes: ["oauth"],
      }),
    );
  }

  if (process.env.SALESFORCE_CLIENT_ID && process.env.SALESFORCE_CLIENT_SECRET) {
    const loginHost =
      process.env.SALESFORCE_LOGIN_HOST ?? "https://login.salesforce.com";
    configs.push({
      providerId: "salesforce",
      clientId: process.env.SALESFORCE_CLIENT_ID,
      clientSecret: process.env.SALESFORCE_CLIENT_SECRET,
      authorizationUrl: `${loginHost}/services/oauth2/authorize`,
      tokenUrl: `${loginHost}/services/oauth2/token`,
      scopes: ["openid", "profile", "email", "api"],
      pkce: true,
      getUserInfo: async (tokens) => {
        const res = await fetch(`${loginHost}/services/oauth2/userinfo`, {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        if (!res.ok) return null;
        const profile = (await res.json()) as {
          user_id?: string;
          sub?: string;
          name?: string;
          email?: string;
          picture?: string;
        };
        const id = profile.user_id ?? profile.sub;
        if (!id) return null;
        return {
          id,
          name: profile.name ?? profile.email ?? id,
          email: profile.email,
          image: profile.picture,
          emailVerified: true,
        };
      },
    });
  }

  return configs;
}

function socialProviders() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return {};
  }
  return {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
  };
}

let _auth: any = null;
let _pool: Pool | null = null;
let _schemaReady: Promise<void> | null = null;

/** better-auth instance — only constructed when auth is enabled. */
export function getAuth(): any {
  if (!isAuthEnabled()) {
    throw new Error("Auth is not enabled — set BETTER_AUTH_SECRET and DATABASE_URL.");
  }
  if (_auth) return _auth;

  const baseURL = process.env.BETTER_AUTH_URL ?? process.env.STUDIO_URL ?? "http://localhost:3002";
  _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  _schemaReady = ensureAuthSchema(_pool);

  const genericConfigs = oauthProviders();
  const plugins = [
    organization({
      allowUserToCreateOrganization: true,
      organizationLimit: 20,
      membershipLimit: 100,
    }),
    ...(genericConfigs.length > 0 ? [genericOAuth({ config: genericConfigs })] : []),
  ];

  _auth = betterAuth({
    database: _pool,
    secret: process.env.BETTER_AUTH_SECRET!,
    baseURL,
    socialProviders: socialProviders(),
    plugins,
    session: {
      expiresIn: 60 * 60 * 24 * 14, // 14 days
      updateAge: 60 * 60 * 24,
    },
    trustedOrigins: (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? baseURL)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  });

  return _auth;
}

/** Await schema bootstrap before handling the first auth request. */
export async function ensureAuthReady(): Promise<void> {
  getAuth();
  await _schemaReady;
}

export type AuthSession = {
  user: { id: string; name: string; email: string; image?: string | null };
  session: {
    id: string;
    userId: string;
    activeOrganizationId?: string | null;
  };
};

/** Which SSO buttons the login page should render. */
export function enabledProviders(): ("google" | "hubspot" | "salesforce")[] {
  const out: ("google" | "hubspot" | "salesforce")[] = [];
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) out.push("google");
  if (process.env.HUBSPOT_CLIENT_ID && process.env.HUBSPOT_CLIENT_SECRET) out.push("hubspot");
  if (process.env.SALESFORCE_CLIENT_ID && process.env.SALESFORCE_CLIENT_SECRET) {
    out.push("salesforce");
  }
  return out;
}
