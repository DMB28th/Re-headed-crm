import { NextResponse } from "next/server";
import type { MemberRole } from "@cardstack/auth";
import { HubSpotAdapter } from "@cardstack/crm-adapters";
import { getAdapter, getMcpTokenStore, getStore, requireTenantId } from "../../../../lib/backend";
import { getCrmLinkForTenant, setCrmOwnerId } from "../../../../lib/crm-link";
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
        crmUserId: t.crmUserId ?? null,
        crmOwnerId: t.crmOwnerId ?? null,
        crm: t.crm ?? null,
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
    const role: MemberRole = body.role === "member" || body.role === "owner" ? body.role : "admin";

    const connection = await (await getStore()).getConnection(TENANT_ID);
    let link = await getCrmLinkForTenant(session.user.id, TENANT_ID, connection.crm);

    // HubSpot: SSO gives user_id; owner filters need hubspot_owner_id.
    if (link?.crm === "hubspot" && !link.crmOwnerId && connection.credentials) {
      try {
        const adapter = await getAdapter(TENANT_ID);
        if (adapter instanceof HubSpotAdapter) {
          const ownerId = await adapter.resolveOwnerIdForUserId(link.crmUserId);
          if (ownerId) {
            await setCrmOwnerId(TENANT_ID, session.user.id, "hubspot", ownerId);
            link = { ...link, crmOwnerId: ownerId };
          }
        }
      } catch {
        // Owner resolution is best-effort — token still mints with crmUserId.
      }
    }

    const { record, rawToken } = await (
      await getMcpTokenStore()
    ).create({
      tenantId: TENANT_ID,
      userId: session.user.id,
      label,
      role,
      userEmail: session.user.email,
      userName: session.user.name || session.user.email,
      ...(link?.crmUserId ? { crmUserId: link.crmUserId } : {}),
      ...(link?.crmOwnerId ? { crmOwnerId: link.crmOwnerId } : {}),
      ...(link?.crm ? { crm: link.crm } : {}),
    });
    const { tokenHash: _hash, ...safe } = record;
    void _hash;
    return NextResponse.json({
      token: safe,
      rawToken,
      crmLinked: Boolean(link?.crmUserId),
    });
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
