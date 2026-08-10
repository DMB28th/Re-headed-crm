/**
 * People (spec section 2.5) — the only way a workspace gets a second admin.
 *
 * Studio is admin-only, and admin is granted exactly once: to the first person
 * from a Salesforce org to sign in, through Studio OR through a chat host.
 * Without this page a workspace whose first signer was a rep is administered by
 * that rep permanently, and the person who actually bought Cardstack is told to
 * "ask an admin" with nothing behind the sentence.
 */
import { getStore } from "../../lib/backend";
import { getStudioIdentity } from "../../lib/auth";
import { workspaceMembers } from "../../lib/admins";
import { PeopleTable } from "../../components/people-table";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const identity = await getStudioIdentity();
  if (!identity) return null; // Middleware and the choke point already handled this.

  const members = await workspaceMembers(await getStore(), identity.workspace.id);

  return (
    <div className="max-w-[820px]">
      <h1 className="text-[22px] font-semibold tracking-[-0.025em]">People</h1>
      <p className="mt-1 max-w-[680px] text-[14px] text-ink-55">
        Everyone from {identity.workspace.name} who has signed in to Cardstack, through Studio or
        through a chat app. <strong>Admins</strong> design cards and govern write access;{" "}
        <strong>members</strong> use those cards in chat and never see Studio.
      </p>

      <PeopleTable
        initialMembers={members.map((m) => ({
          accountId: m.account.id,
          name: m.account.name,
          email: m.account.email ?? null,
          role: m.role,
          joinedAt: m.joinedAt,
          isSelf: m.account.id === identity.account.id,
        }))}
      />
    </div>
  );
}
