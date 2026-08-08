/**
 * Changing someone's role in a workspace.
 *
 * Pure, and separate from the route, because the interesting part is a rule
 * rather than a request: **a workspace can never reach zero admins.** Nothing
 * in the product can create an admin except being the first person from an org
 * to sign in, so a workspace that loses its last admin cannot be configured
 * again by anyone, ever. Demoting yourself is the obvious way to do that by
 * accident, which is why it is refused rather than hidden.
 */
import type { Membership, MembershipRole } from "@cardstack/config-store";

export type RoleChange =
  | { ok: true; role: MembershipRole; changed: boolean }
  | { ok: false; status: 404 | 409; error: string };

export function planRoleChange(
  memberships: Membership[],
  accountId: string,
  role: MembershipRole,
): RoleChange {
  const target = memberships.find((m) => m.accountId === accountId);
  // 404, not 403: an account outside this workspace must not be distinguishable
  // from one that does not exist, or this route enumerates other tenants.
  if (!target) return { ok: false, status: 404, error: "That person is not in this workspace." };
  if (target.role === role) return { ok: true, role, changed: false };

  if (role === "member") {
    const admins = memberships.filter((m) => m.role === "admin");
    if (admins.length <= 1) {
      return {
        ok: false,
        status: 409,
        error:
          "That is the workspace's only admin. Make someone else an admin first — a workspace with no admins cannot be configured by anyone.",
      };
    }
  }
  return { ok: true, role, changed: true };
}
