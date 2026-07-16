import { NextResponse } from "next/server";
import { createUserCrmStore } from "@cardstack/auth";
import { isAuthEnabled } from "../../../../lib/auth";
import { requireSession, requireTenantId } from "../../../../lib/session";

export const dynamic = "force-dynamic";

/** Status of per-rep CRM OAuth for the signed-in member. */
export async function GET() {
  if (!isAuthEnabled()) {
    return NextResponse.json({ authEnabled: false });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ authEnabled: true, hubspot: null });
  }
  try {
    const session = await requireSession();
    const tenantId = await requireTenantId();
    const store = await createUserCrmStore(process.env.DATABASE_URL);
    const token = await store.getToken(tenantId, session.user.id, "hubspot");
    const link = await store.getLink(tenantId, session.user.id, "hubspot");
    return NextResponse.json({
      authEnabled: true,
      appConfigured: Boolean(process.env.HUBSPOT_CLIENT_ID && process.env.HUBSPOT_CLIENT_SECRET),
      hubspot: token
        ? {
            connected: true,
            portalId: token.portalId,
            expiresAt: token.expiresAt,
            scopes: token.scopes,
            crmUserId: link?.crmUserId ?? null,
            crmOwnerId: link?.crmOwnerId ?? null,
          }
        : { connected: false },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

export async function DELETE() {
  if (!isAuthEnabled() || !process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }
  try {
    const session = await requireSession();
    const tenantId = await requireTenantId();
    const store = await createUserCrmStore(process.env.DATABASE_URL);
    await store.deleteToken(tenantId, session.user.id, "hubspot");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
