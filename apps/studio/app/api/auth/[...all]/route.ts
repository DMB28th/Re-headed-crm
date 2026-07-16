import { getAuth, ensureAuthReady, isAuthEnabled } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

async function handler(request: Request) {
  if (!isAuthEnabled()) {
    return new Response(JSON.stringify({ error: "Auth is not configured on this deploy." }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
  await ensureAuthReady();
  return getAuth().handler(request);
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
