/**
 * Server-side session + tenant resolution for Studio.
 *
 * Auth off → DEMO_TENANT_ID (today's single-app behavior).
 * Auth on  → active organization id is the config-store tenantId.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_TENANT_ID } from "@cardstack/config-store";
import { getAuth, isAuthEnabled, type AuthSession } from "./auth";

export { isAuthEnabled };

export async function getSession(): Promise<AuthSession | null> {
  if (!isAuthEnabled()) return null;
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return session as unknown as AuthSession;
}

/**
 * Resolve the workspace (tenant) for this request.
 * When auth is enabled the user must have an active organization — otherwise
 * we send them to /team to create or pick one.
 */
export async function requireTenantId(): Promise<string> {
  if (!isAuthEnabled()) return DEMO_TENANT_ID;

  const session = await getSession();
  if (!session) redirect("/login");

  const orgId = session.session.activeOrganizationId;
  if (!orgId) redirect("/team?setup=1");
  return orgId;
}

export async function requireSession(): Promise<AuthSession> {
  if (!isAuthEnabled()) {
    return {
      user: { id: "demo", name: "Demo admin", email: "demo@localhost" },
      session: { id: "demo", userId: "demo", activeOrganizationId: DEMO_TENANT_ID },
    };
  }
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
