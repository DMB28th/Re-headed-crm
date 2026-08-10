/** GET /api/people — everyone in the signed-in admin's workspace. */
import { NextResponse } from "next/server";
import { getStudioIdentity } from "../../../lib/auth";
import { getStore } from "../../../lib/backend";
import { workspaceMembers } from "../../../lib/admins";

export const dynamic = "force-dynamic";

export async function GET() {
  const identity = await getStudioIdentity();
  if (!identity) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const members = await workspaceMembers(await getStore(), identity.workspace.id);
  return NextResponse.json({
    members: members.map((m) => ({
      accountId: m.account.id,
      name: m.account.name,
      email: m.account.email ?? null,
      role: m.role,
      joinedAt: m.joinedAt,
      isSelf: m.account.id === identity.account.id,
    })),
  });
}
