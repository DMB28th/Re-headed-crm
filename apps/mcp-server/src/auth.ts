import {
  DEFAULT_AUDIENCE,
  DEFAULT_USER_NAME,
  defaultUserContext,
  normalizeUserId,
  type UserContext,
} from "@cardstack/core";
import { DEMO_TENANT_ID } from "./config/store.js";

const TENANT_HEADER = "x-cardstack-tenant-id";
const USER_ID_HEADER = "x-cardstack-user-id";
const USER_EMAIL_HEADER = "x-cardstack-user-email";
const USER_NAME_HEADER = "x-cardstack-user-name";
const AUDIENCE_HEADER = "x-cardstack-audience";

export function userContextFromHeaders(headers: {
  get(name: string): string | string[] | undefined;
}): UserContext {
  const demo = defaultUserContext(process.env.CARDSTACK_TENANT_ID ?? DEMO_TENANT_ID);
  const header = (name: string): string | undefined => {
    const value = headers.get(name);
    return Array.isArray(value) ? value[0] : value;
  };
  const email = first(header(USER_EMAIL_HEADER), process.env.CARDSTACK_USER_EMAIL);
  const rawUserId =
    first(
      header(USER_ID_HEADER),
      email,
      process.env.CARDSTACK_USER_ID,
      demo.userId,
    ) ?? demo.userId;
  const userId = normalizeUserId(rawUserId) || demo.userId;
  const name =
    first(header(USER_NAME_HEADER), process.env.CARDSTACK_USER_NAME, email, DEFAULT_USER_NAME) ??
    DEFAULT_USER_NAME;
  return {
    tenantId: first(header(TENANT_HEADER), process.env.CARDSTACK_TENANT_ID, demo.tenantId) ?? demo.tenantId,
    userId,
    name,
    ...(email ? { email } : {}),
    audience: first(header(AUDIENCE_HEADER), process.env.CARDSTACK_AUDIENCE, DEFAULT_AUDIENCE) ?? DEFAULT_AUDIENCE,
  };
}

function first(...values: (string | null | undefined)[]): string | undefined {
  return values.find((value) => value !== null && value !== undefined && value.trim() !== "")?.trim();
}
