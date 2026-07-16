import { NextResponse } from "next/server";
import type { MemberRole } from "@cardstack/auth";
import { getMcpTokenStore, requireTenantId } from "../../../../lib/backend";
import { isAuthEnabled, requireSession } from "../../../../lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isAuthEnabled()) {
    return NextResponse.json({ tokens: [], authEnabled: false });
  }
  try {
    const TENANT_ID = await requireTenantId();
    const tokens = await (await getMcpTokenStore()).list(TENANT_ID);
    return NextResponse.json({
      tokens: tokens.map((t) => ({
        id: t.id,
        tenantId: t.tenantId,
        userId: t.userId,
        label: t.label,
        tokenPrefix: t.tokenPrefix,
        role: t.role,
        createdAt: t.createdAt,
        lastUsedAt: t.lastUsedAt,
        revokedAt: t.revokedAt,
      })),
      authEnabled: true,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

export async function POST(req: Request) {
  if (!isAuthEnabled()) {
    return NextResponse.json({ error: "Auth is not enabled." }, { status: 503 });
  }
  try {
    const session = await requireSession();
    const TENANT_ID = await requireTenantId();
    const body = (await req.json()) as { label?: string; role?: MemberRole };
    const label = body.label?.trim() || "MCP connector";
    // Tokens are minted by a signed-in member; default role admin so chat
    // hosts can exercise write tools. Tighten with org RBAC later if needed.
    const role: MemberRole = body.role === "member" || body.role === "owner" ? body.role : "admin";
    const { record, rawToken } = await (
      await getMcpTokenStore()
    ).create({
      tenantId: TENANT_ID,
      userId: session.user.id,
      label,
      role,
      userEmail: session.user.email,
      userName: session.user.name || session.user.email,
    });
    const { tokenHash: _hash, ...safe } = record;
    void _hash;
    return NextResponse.json({ token: safe, rawToken });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  if (!isAuthEnabled()) {
    return NextResponse.json({ error: "Auth is not enabled." }, { status: 503 });
  }
  try {
    await requireSession();
    const TENANT_ID = await requireTenantId();
    const body = (await req.json()) as { id?: string };
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const ok = await (await getMcpTokenStore()).revoke(TENANT_ID, body.id);
    return NextResponse.json({ ok });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
