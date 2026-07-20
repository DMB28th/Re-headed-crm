/**
 * Authenticated app identity shared by Studio and the MCP server.
 *
 * This is intentionally provider-neutral: real OAuth/JWT/session providers can
 * populate it from trusted headers or cookies, while local dev falls back to
 * the demo workspace and demo rep.
 */
export interface UserContext {
  tenantId: string;
  userId: string;
  name: string;
  email?: string;
  audience: string;
}

export const DEFAULT_USER_ID = "demo-rep";
export const DEFAULT_USER_NAME = "Demo rep";
export const DEFAULT_AUDIENCE = "default";

export function normalizeUserId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:@-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function userDisplayName(user: Pick<UserContext, "name" | "email" | "userId">): string {
  return user.name || user.email || user.userId;
}

export function defaultUserContext(tenantId: string): UserContext {
  return {
    tenantId,
    userId: DEFAULT_USER_ID,
    name: DEFAULT_USER_NAME,
    audience: DEFAULT_AUDIENCE,
  };
}

export function canSeeUserScopedResource(
  resource: { visibility?: "workspace" | "private" | undefined; createdByUserId?: string | undefined },
  user: Pick<UserContext, "userId">,
): boolean {
  if ((resource.visibility ?? "workspace") === "workspace") return true;
  return resource.createdByUserId === user.userId;
}
