import { NextResponse } from "next/server";
import { getStore, requireTenantId } from "../../../../lib/backend";
import { getCrmLinkForTenant, syncCrmLinksForUser } from "../../../../lib/crm-link";
import { isAuthEnabled, requireSession } from "../../../../lib/session";

export const dynamic = "force-dynamic";

/** CRM user-variable status for the signed-in member in this workspace. */
export async function GET() {
  if (!isAuthEnabled()) {
    return NextResponse.json({ authEnabled: false, link: null });
  }
  try {
    const session = await requireSession();
    const TENANT_ID = await requireTenantId();
    const connection = await (await getStore()).getConnection(TENANT_ID);
    await syncCrmLinksForUser(session.user.id, TENANT_ID, session.user.email);
    const link = await getCrmLinkForTenant(session.user.id, TENANT_ID, connection.crm);
    return NextResponse.json({
      authEnabled: true,
      workspaceCrm: connection.crm,
      link: link
        ? {
            crm: link.crm,
            crmUserId: link.crmUserId,
            crmOwnerId: link.crmOwnerId,
            crmEmail: link.crmEmail,
            source: link.source,
            matchesWorkspace: link.crm === connection.crm,
          }
        : null,
      hint: link
        ? link.crm === connection.crm
          ? "MCP tokens will carry this CRM identity — \"my deals\" filters as you."
          : `You signed in with ${link.crm}, but this workspace is connected to ${connection.crm}. Sign in with ${connection.crm} SSO to bind $me.`
        : "Sign in with HubSpot or Salesforce SSO (or link later) so \"my deals\" knows which CRM user you are.",
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

/** Force re-sync from better-auth account rows (after linking HubSpot/SF). */
export async function POST() {
  if (!isAuthEnabled()) {
    return NextResponse.json({ error: "Auth is not enabled." }, { status: 503 });
  }
  try {
    const session = await requireSession();
    const TENANT_ID = await requireTenantId();
    const links = await syncCrmLinksForUser(session.user.id, TENANT_ID, session.user.email);
    return NextResponse.json({ ok: true, count: links.length, links });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
