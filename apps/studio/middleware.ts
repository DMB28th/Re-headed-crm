/**
 * Studio middleware (M7):
 * 1. When BETTER_AUTH_SECRET is set — protect app pages (redirect to /login)
 *    and keep mutating /api gated to signed-in sessions (auth routes exempt).
 * 2. Legacy STUDIO_SHARED_SECRET still works as a machine-to-machine gate when
 *    auth is OFF (demo / CI).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const AUTH_ENABLED = Boolean(process.env.BETTER_AUTH_SECRET && process.env.DATABASE_URL);
const SHARED_SECRET = process.env.STUDIO_SHARED_SECRET;
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const PUBLIC_PATHS = ["/login", "/api/auth"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);

  if (AUTH_ENABLED) {
    if (isPublic(pathname)) {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    // better-auth cookie presence check (optimistic — full session verified in RSC/API).
    const sessionCookie = getSessionCookie(req);
    if (!sessionCookie && !pathname.startsWith("/api/auth")) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const login = new URL("/login", req.url);
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Legacy shared-secret gate (auth off).
  if (!SHARED_SECRET) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }
  if (!MUTATING.has(req.method)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }
  const header = req.headers.get("x-cardstack-key");
  const cookie = req.cookies.get("cardstack_key")?.value;
  if (header === SHARED_SECRET || cookie === SHARED_SECRET) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
