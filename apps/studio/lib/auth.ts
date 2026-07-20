import { cookies, headers } from "next/headers";
import {
  DEFAULT_AUDIENCE,
  DEFAULT_USER_NAME,
  defaultUserContext,
  normalizeUserId,
  type UserContext,
} from "@cardstack/core";
import { DEMO_TENANT_ID } from "@cardstack/config-store";

const TENANT_HEADER = "x-cardstack-tenant-id";
const USER_ID_HEADER = "x-cardstack-user-id";
const USER_EMAIL_HEADER = "x-cardstack-user-email";
const USER_NAME_HEADER = "x-cardstack-user-name";
const AUDIENCE_HEADER = "x-cardstack-audience";

const TENANT_COOKIE = "cardstack_tenant_id";
const USER_ID_COOKIE = "cardstack_user_id";
const USER_EMAIL_COOKIE = "cardstack_user_email";
const USER_NAME_COOKIE = "cardstack_user_name";
const AUDIENCE_COOKIE = "cardstack_audience";

export async function getUserContext(): Promise<UserContext> {
  const [headerList, cookieJar] = await Promise.all([headers(), cookies()]);
  const cookieValue = (name: string) => cookieJar.get(name)?.value;
  return userContextFromLookups({
    header: (name) => headerList.get(name),
    cookie: cookieValue,
  });
}

export function getUserContextFromRequest(req: Request): UserContext {
  const parsedCookies = parseCookies(req.headers.get("cookie") ?? "");
  return userContextFromLookups({
    header: (name) => req.headers.get(name),
    cookie: (name) => parsedCookies.get(name),
  });
}

function userContextFromLookups(lookups: {
  header: (name: string) => string | null | undefined;
  cookie: (name: string) => string | null | undefined;
}): UserContext {
  const demo = defaultUserContext(env("CARDSTACK_TENANT_ID") ?? DEMO_TENANT_ID);
  const email =
    first(lookups.header(USER_EMAIL_HEADER), lookups.cookie(USER_EMAIL_COOKIE), env("CARDSTACK_USER_EMAIL")) ??
    undefined;
  const rawUserId =
    first(
      lookups.header(USER_ID_HEADER),
      lookups.cookie(USER_ID_COOKIE),
      email,
      env("CARDSTACK_USER_ID"),
      demo.userId,
    ) ?? demo.userId;
  const userId = normalizeUserId(rawUserId) || demo.userId;
  const name =
    first(
      lookups.header(USER_NAME_HEADER),
      lookups.cookie(USER_NAME_COOKIE),
      env("CARDSTACK_USER_NAME"),
      email,
      DEFAULT_USER_NAME,
    ) ?? DEFAULT_USER_NAME;
  return {
    tenantId:
      first(
        lookups.header(TENANT_HEADER),
        lookups.cookie(TENANT_COOKIE),
        env("CARDSTACK_TENANT_ID"),
        demo.tenantId,
      ) ?? demo.tenantId,
    userId,
    name,
    ...(email ? { email } : {}),
    audience:
      first(
        lookups.header(AUDIENCE_HEADER),
        lookups.cookie(AUDIENCE_COOKIE),
        env("CARDSTACK_AUDIENCE"),
        DEFAULT_AUDIENCE,
      ) ?? DEFAULT_AUDIENCE,
  };
}

function parseCookies(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (!name || rest.length === 0) continue;
    out.set(name, decode(rest.join("=")));
  }
  return out;
}

function first(...values: (string | null | undefined)[]): string | undefined {
  return values.find((value) => value !== null && value !== undefined && value.trim() !== "")?.trim();
}

function env(name: string): string | undefined {
  return process.env[name];
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
