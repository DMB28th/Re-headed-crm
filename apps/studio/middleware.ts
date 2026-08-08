import { NextResponse, type NextRequest } from "next/server";
import {
  readStudioSession,
  sessionSigningSecrets,
  STUDIO_SESSION_COOKIE,
} from "./lib/studio-session";

const PUBLIC_PATHS = new Set(["/login", "/api/session", "/healthz"]);

/**
 * The sign-in lane itself must be reachable while signed OUT — gating it would
 * redirect /api/auth/salesforce/start to /login, whose only action is to call
 * that route again.
 */
const isPublic = (path: string): boolean =>
  PUBLIC_PATHS.has(path) || path.startsWith("/api/auth/") || path.includes("/oauth/callback");

export async function middleware(req: NextRequest) {
  const secrets = sessionSigningSecrets(process.env);
  const path = req.nextUrl.pathname;
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
