/**
 * API guard. When STUDIO_SHARED_SECRET is set, mutating /api requests must carry
 * the secret (x-cardstack-key header or cardstack_key cookie) — this closes the
 * open connect/disconnect/publish/rollback routes a security review flagged.
 * When the var is UNSET the middleware is a no-op, so the live demo keeps
 * working until the secret is configured. Full per-user session auth is M7.
 */
import { NextResponse, type NextRequest } from "next/server";

const SECRET = process.env.STUDIO_SHARED_SECRET;
const IS_PROD = process.env.NODE_ENV === "production";
// Read-only GETs stay open (they only return page data); mutations are gated.
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function middleware(req: NextRequest) {
  if (!SECRET) {
    // Fail closed in production: an unset secret must not silently leave the
    // mutating routes open. Locally/demo (unset) stays a no-op.
    if (IS_PROD && MUTATING.has(req.method)) {
      return NextResponse.json(
        { error: "Server misconfigured: STUDIO_SHARED_SECRET is required in production." },
        { status: 503 },
      );
    }
    return NextResponse.next();
  }
  if (!MUTATING.has(req.method)) return NextResponse.next();
  const header = req.headers.get("x-cardstack-key");
  const cookie = req.cookies.get("cardstack_key")?.value;
  if (header === SECRET || cookie === SECRET) return NextResponse.next();
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export const config = {
  matcher: ["/api/:path*"],
};
