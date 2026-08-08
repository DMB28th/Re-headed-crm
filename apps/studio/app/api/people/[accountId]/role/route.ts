/**
 * POST /api/people/:accountId/role — promote or demote someone.
 *
 * The only way to create a second admin. Before this existed, the first person
 * from an org to sign in — through Studio OR through a chat host — held admin
 * permanently, and everyone else was told to "ask an admin" with no mechanism
 * behind the sentence.
 *
 * Two guards, both server-side:
 *
 * - the workspace comes from the session, never from the request, so this route
 *   cannot reach another tenant's memberships;
 * - a workspace can never reach zero admins (see `planRoleChange`).
 */
import { NextResponse } from "next/server";
import type { MembershipRole } from "@cardstack/config-store";
import { getStudioIdentity } from "../../../../../lib/auth";
import { getStore } from "../../../../../lib/backend";
import { planRoleChange } from "../../../../../lib/membership-change";
import { workspaceMembers } from "../../../../../lib/admins";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  const identity = await getStudioIdentity();
  if (!identity) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { accountId: raw } = await params;
  const accountId = decodeURIComponent(raw);
  const body = (await req.json().catch(() => ({}))) as { role?: string };
  if (body.role !== "admin" && body.role !== "member") {
    return NextResponse.json({ error: "role must be admin or member." }, { status: 400 });
  }
  const role: MembershipRole = body.role;

  const store = await getStore();
  const workspaceId = identity.workspace.id;
  const memberships = await store.listMembershipsForWorkspace(workspaceId);
  const plan = planRoleChange(memberships, accountId, role);
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status });

  if (plan.changed) {
    const existing = memberships.find((m) => m.accountId === accountId)!;
    await store.setMembership({ ...existing, role: plan.role });
    // Role changes are exactly the kind of thing that needs to be answerable
    // six months later, and there is no security-event store yet.
    console.info(
      `[security] ${identity.account.id} set ${accountId} to ${plan.role} in workspace ${workspaceId}`,
    );
  }

  const members = await workspaceMembers(store, workspaceId);
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
