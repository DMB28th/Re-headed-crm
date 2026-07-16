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
    const me = link?.crmOwnerId ?? link?.crmUserId ?? null;
    const user = link?.crmUserId ?? null;
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
      /** Resolved CRM user variables stamped onto new MCP tokens. */
      variables: {
        $me: me,
        $user: user,
        ownerId: link?.crmOwnerId ?? null,
        userId: link?.crmUserId ?? null,
        email: link?.crmEmail ?? null,
        crm: link?.crm ?? null,
      },
      hint: link
        ? link.crm === connection.crm
          ? me
            ? `$me → ${me}. Mint (or remint) an MCP token so chat hosts use it.`
            : "CRM link exists but $me is empty — reconnect HubSpot as me."
          : `You signed in with ${link.crm}, but this workspace is connected to ${connection.crm}. Sign in with ${connection.crm} SSO to bind $me.`
        : "Connect HubSpot as me (or sign in with HubSpot/Salesforce SSO) so $me / $user resolve.",
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
