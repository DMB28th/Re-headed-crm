/**
 * API guard. When STUDIO_SHARED_SECRET is set, mutating /api requests must carry
 * the secret (x-cardstack-key header or cardstack_key cookie), gating
 * programmatic callers. When the var is UNSET the middleware is a no-op.
 *
 * NOTE: this must NOT fail-closed on an unset secret. Studio is a browser app
 * with no login flow, so the human admin has no way to present the secret — a
 * fail-closed gate would 503 every connect/publish and lock the admin out.
 * Genuinely securing Studio needs the per-user session/OAuth work (M7); until
 * then the secret only gates non-browser callers that CAN send the header.
 */
import { NextResponse, type NextRequest } from "next/server";

const SECRET = process.env.STUDIO_SHARED_SECRET;
// Read-only GETs stay open (they only return page data); mutations are gated.
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function middleware(req: NextRequest) {
  if (!SECRET) return NextResponse.next();
  if (!MUTATING.has(req.method)) return NextResponse.next();
  const header = req.headers.get("x-cardstack-key");
  const cookie = req.cookies.get("cardstack_key")?.value;
  if (header === SECRET || cookie === SECRET) return NextResponse.next();
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export const config = {
  matcher: ["/api/:path*"],
};
