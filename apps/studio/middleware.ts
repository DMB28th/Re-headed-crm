import { NextResponse, type NextRequest } from "next/server";
import {
  readStudioSession,
  sessionSigningSecrets,
  STUDIO_SESSION_COOKIE,
} from "./lib/studio-session";
import { sameOriginRequest } from "./lib/request-guard";

const PUBLIC_PATHS = new Set([
  "/login",
  "/signup",
  "/forgot",
  "/reset",
  "/verify",
  "/link",
  "/api/session", // DELETE = sign-out; the POST bridge dies with the governance layer
  "/healthz",
]);

/**
 * CRM OAuth callbacks. These resolve identity themselves (and fail closed in
 * production when there is none) — the exemption is from the EDGE gate, not
 * from auth.
 *
 * Listed exactly rather than matched with `includes("/oauth/callback")`, which
 * exempted any path containing that substring anywhere. No route could be
 * coerced into matching today, but that was a property of the route table, not
 * of this gate, and the route table changes every milestone.
 */
const PUBLIC_CALLBACKS = new Set([
  "/api/connections/salesforce/oauth/callback",
  "/api/user-connections/salesforce/oauth/callback",
]);

/**
 * The sign-in lane itself must be reachable while signed OUT — gating it would
 * redirect /api/auth/salesforce/start to /login, whose only action is to call
 * that route again.
 */
const isPublic = (path: string): boolean =>
  PUBLIC_PATHS.has(path) || path.startsWith("/api/auth/") || PUBLIC_CALLBACKS.has(path);

export async function middleware(req: NextRequest) {
  const secrets = sessionSigningSecrets(process.env);
  const path = req.nextUrl.pathname;

  // Defense in depth behind SameSite=Lax, applied here so there is one place
  // to read rather than a check every route must remember. Runs BEFORE the
  // public-path exemption: /api/session is a login endpoint, and login CSRF is
  // the one thing a public mutating route is exposed to.
  if (!sameOriginRequest(req)) {
    return NextResponse.json({ error: "Cross-origin request refused." }, { status: 403 });
  }

  if (isPublic(path)) return NextResponse.next();

  if (secrets.length === 0) {
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return NextResponse.json(
      { error: "Studio is locked because its session signing secret is not configured." },
      { status: 503 },
    );
  }

  const sessionId = await readStudioSession(
    req.cookies.get(STUDIO_SESSION_COOKIE)?.value,
    secrets,
  );
  if (sessionId) return NextResponse.next();
  if (path.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const login = new URL("/login", req.url);
  login.searchParams.set("next", `${path}${req.nextUrl.search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
