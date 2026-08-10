/**
 * Who administers a workspace.
 *
 * Exists because two different dead ends needed the same answer. A member who
 * lands on Studio is told to "ask an admin" — useless without a name. A rep
 * whose CRM connection expired is told the same thing. Both become a path the
 * moment the message says who, and the People page gives that person a button
 * that actually does something.
 */
import type { Account, AdminConfigStore } from "@cardstack/config-store";

export interface WorkspaceMember {
  account: Account;
  role: "admin" | "member";
  joinedAt: string;
}

/** Every member of a workspace, admins first, then by name. */
export async function workspaceMembers(
  store: Pick<AdminConfigStore, "listMembershipsForWorkspace" | "getAccount">,
  workspaceId: string,
): Promise<WorkspaceMember[]> {
  const memberships = await store.listMembershipsForWorkspace(workspaceId);
  const rows = await Promise.all(
    memberships.map(async (membership) => {
      const account = await store.getAccount(membership.accountId);
      return account ? { account, role: membership.role, joinedAt: membership.createdAt } : undefined;
    }),
  );
  return rows
    .filter((row): row is WorkspaceMember => !!row)
    .sort((a, b) =>
      a.role === b.role ? a.account.name.localeCompare(b.account.name) : a.role === "admin" ? -1 : 1,
    );
}

export async function workspaceAdmins(
  store: Pick<AdminConfigStore, "listMembershipsForWorkspace" | "getAccount">,
  workspaceId: string,
): Promise<Account[]> {
  return (await workspaceMembers(store, workspaceId))
    .filter((row) => row.role === "admin")
    .map((row) => row.account);
}

/**
 * Human list of admins for an error message, capped so a large workspace does
 * not produce a wall of names. Returns undefined when there are none, so
 * callers fall back to generic copy rather than printing "ask ".
 */
export function describeAdmins(admins: Account[], limit = 3): string | undefined {
  if (admins.length === 0) return undefined;
  const shown = admins.slice(0, limit).map((a) => (a.email ? `${a.name} (${a.email})` : a.name));
  const rest = admins.length - shown.length;
  const joined =
    shown.length === 1
      ? shown[0]
      : `${shown.slice(0, -1).join(", ")} or ${shown[shown.length - 1]}`;
  return rest > 0 ? `${joined}, or ${rest} other admin${rest === 1 ? "" : "s"}` : joined;
}
