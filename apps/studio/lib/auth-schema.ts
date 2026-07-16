/**
 * Ensure better-auth + organization tables exist.
 * better-auth's CLI migrate is the upstream path; we run equivalent DDL on
 * Studio boot so Railway deploys don't need a separate migrate step.
 *
 * Migration notes:
 * - 2026-07-16: initial auth schema (user/session/account/verification +
 *   organization/member/invitation). Additive CREATE IF NOT EXISTS.
 */
import type { Pool } from "pg";

const AUTH_SCHEMA = `
CREATE TABLE IF NOT EXISTS "user" (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  image text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS session (
  id text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "activeOrganizationId" text
);

CREATE TABLE IF NOT EXISTS account (
  id text PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  metadata text
);

CREATE TABLE IF NOT EXISTS member (
  id text PRIMARY KEY,
  "organizationId" text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invitation (
  id text PRIMARY KEY,
  "organizationId" text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text,
  status text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "inviterId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS session_userId_idx ON session ("userId");
CREATE INDEX IF NOT EXISTS account_userId_idx ON account ("userId");
CREATE INDEX IF NOT EXISTS member_organizationId_idx ON member ("organizationId");
CREATE INDEX IF NOT EXISTS member_userId_idx ON member ("userId");
CREATE INDEX IF NOT EXISTS invitation_organizationId_idx ON invitation ("organizationId");
`;

export async function ensureAuthSchema(pool: Pool): Promise<void> {
  for (const statement of AUTH_SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
    await pool.query(statement);
  }
}
