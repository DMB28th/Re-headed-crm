"use client";

/**
 * My team — account hierarchy: create/switch workspaces, invite members,
 * mint MCP tokens for chat hosts (running-user identity).
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { authClient } from "../lib/auth-client";

type Org = { id: string; name: string; slug: string };
type Member = {
  id: string;
  role: string;
  user: { id: string; name: string; email: string };
};
type Invitation = { id: string; email: string; role: string; status: string };
type McpToken = {
  id: string;
  label: string;
  tokenPrefix: string;
  role: string;
  createdAt: string;
  lastUsedAt: string | null;
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function TeamInner({ authEnabled }: { authEnabled: boolean }) {
  const router = useRouter();
  const search = useSearchParams();
  const setup = search.get("setup") === "1";

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [newOrgName, setNewOrgName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [tokenLabel, setTokenLabel] = useState("Claude.ai connector");
  const [mintedRaw, setMintedRaw] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");

  const load = useCallback(async () => {
    if (!authEnabled) return;
    const session = await authClient.getSession();
    setUserEmail(session.data?.user?.email ?? "");
    setActiveOrgId(session.data?.session?.activeOrganizationId ?? null);

    const list = await authClient.organization.list();
    setOrgs((list.data as Org[] | null) ?? []);

    if (session.data?.session?.activeOrganizationId) {
      const full = await authClient.organization.getFullOrganization();
      const data = full.data as
        | { members?: Member[]; invitations?: Invitation[] }
        | null;
      setMembers(data?.members ?? []);
      setInvitations((data?.invitations ?? []).filter((i) => i.status === "pending"));

      const tokRes = await fetch("/api/team/mcp-tokens");
      if (tokRes.ok) {
        const body = (await tokRes.json()) as { tokens: McpToken[] };
        setTokens(body.tokens);
      }
    } else {
      setMembers([]);
      setInvitations([]);
      setTokens([]);
    }
  }, [authEnabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const createOrg = async () => {
    if (!newOrgName.trim()) return;
    setBusy("create");
    setError(null);
    try {
      const slug = slugify(newOrgName);
      const created = await authClient.organization.create({
        name: newOrgName.trim(),
        slug: slug || `workspace-${Date.now()}`,
      });
      if (created.error) throw new Error(created.error.message);
      const id = (created.data as Org).id;
      await authClient.organization.setActive({ organizationId: id });
      setNewOrgName("");
      await load();
      router.replace("/team");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const switchOrg = async (organizationId: string) => {
    setBusy(`switch-${organizationId}`);
    setError(null);
    try {
      await authClient.organization.setActive({ organizationId });
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const invite = async () => {
    if (!inviteEmail.trim()) return;
    setBusy("invite");
    setError(null);
    try {
      const result = await authClient.organization.inviteMember({
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      if (result.error) throw new Error(result.error.message);
      setInviteEmail("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const mintToken = async () => {
    setBusy("mint");
    setError(null);
    setMintedRaw(null);
    try {
      const res = await fetch("/api/team/mcp-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: tokenLabel }),
      });
      const body = (await res.json()) as { rawToken?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to mint token");
      setMintedRaw(body.rawToken ?? null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const revokeToken = async (id: string) => {
    setBusy(`revoke-${id}`);
    try {
      await fetch("/api/team/mcp-tokens", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const signOut = async () => {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  };

  if (!authEnabled) {
    return (
      <div className="max-w-xl">
        <h1 className="text-[20px] font-semibold tracking-tight">My team</h1>
        <p className="mt-2 text-[13px] text-ink-55">
          Multi-account auth is off on this deploy (demo mode uses a single shared workspace).
          Set <code className="font-mono text-[12px]">BETTER_AUTH_SECRET</code> and{" "}
          <code className="font-mono text-[12px]">DATABASE_URL</code> plus at least one SSO
          provider to enable sign-up, login, and team management.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">My team</h1>
          <p className="mt-1 text-[13px] text-ink-55">
            {setup
              ? "Create your first workspace to start designing cards."
              : "Accounts, members, and MCP credentials for chat hosts."}
          </p>
          {userEmail && (
            <p className="mt-1 text-[12px] text-ink-45">Signed in as {userEmail}</p>
          )}
        </div>
        <button type="button" className="st-btn" onClick={() => void signOut()}>
          Log out
        </button>
      </div>

      {error && (
        <div className="rounded-[10px] border border-line bg-drift px-3 py-2 text-[12.5px] text-drift-ink">
          {error}
        </div>
      )}

      <section className="st-card p-4 flex flex-col gap-3">
        <div className="st-section-label">Workspaces</div>
        {orgs.length === 0 && (
          <p className="text-[13px] text-ink-55">No workspaces yet — create one below.</p>
        )}
        <ul className="flex flex-col gap-1.5">
          {orgs.map((org) => (
            <li
              key={org.id}
              className={`flex items-center justify-between rounded-[10px] px-3 py-2 ${
                org.id === activeOrgId ? "bg-[rgba(47,53,80,0.08)]" : "hover:bg-paper"
              }`}
            >
              <div>
                <div className="text-[13px] font-medium">{org.name}</div>
                <div className="font-mono text-[11px] text-ink-45">{org.slug}</div>
              </div>
              {org.id === activeOrgId ? (
                <span className="st-chip-mono bg-published text-published-ink">active</span>
              ) : (
                <button
                  type="button"
                  className="st-btn text-[12px]"
                  disabled={busy !== null}
                  onClick={() => void switchOrg(org.id)}
                >
                  Switch
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <input
            className="st-input flex-1"
            placeholder="New workspace name"
            value={newOrgName}
            onChange={(e) => setNewOrgName(e.target.value)}
          />
          <button
            type="button"
            className="st-btn st-btn--primary"
            disabled={busy !== null || !newOrgName.trim()}
            onClick={() => void createOrg()}
          >
            {busy === "create" ? "Creating…" : "Create"}
          </button>
        </div>
      </section>

      {activeOrgId && (
        <>
          <section className="st-card p-4 flex flex-col gap-3">
            <div className="st-section-label">Members</div>
            <ul className="flex flex-col gap-1">
              {members.map((m) => (
                <li key={m.id} className="flex items-center justify-between px-1 py-1.5">
                  <div>
                    <div className="text-[13px]">{m.user.name || m.user.email}</div>
                    <div className="text-[11.5px] text-ink-45">{m.user.email}</div>
                  </div>
                  <span className="st-chip-mono bg-paper text-ink-55">{m.role}</span>
                </li>
              ))}
            </ul>
            {invitations.length > 0 && (
              <div className="mt-2">
                <div className="text-[12px] text-ink-55 mb-1">Pending invitations</div>
                {invitations.map((inv) => (
                  <div key={inv.id} className="flex justify-between py-1 text-[12.5px]">
                    <span>{inv.email}</span>
                    <span className="text-ink-45">{inv.role}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                className="st-input flex-1 min-w-[180px]"
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <select
                className="st-input"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "admin" | "member")}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <button
                type="button"
                className="st-btn st-btn--primary"
                disabled={busy !== null || !inviteEmail.trim()}
                onClick={() => void invite()}
              >
                {busy === "invite" ? "Inviting…" : "Invite"}
              </button>
            </div>
            <p className="text-[11.5px] text-ink-45">
              Invited users sign in with the same SSO providers, then join this workspace.
            </p>
          </section>

          <section className="st-card p-4 flex flex-col gap-3">
            <div className="st-section-label">MCP tokens</div>
            <p className="text-[12.5px] text-ink-55">
              Chat hosts authenticate with a bearer token. Each token carries your user identity
              into the MCP server (audit + &quot;Written as&quot; provenance).
            </p>
            <ul className="flex flex-col gap-1.5">
              {tokens.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between rounded-[10px] bg-paper px-3 py-2"
                >
                  <div>
                    <div className="text-[13px] font-medium">{t.label}</div>
                    <div className="font-mono text-[11px] text-ink-45">{t.tokenPrefix}</div>
                  </div>
                  <button
                    type="button"
                    className="st-btn text-[12px]"
                    disabled={busy !== null}
                    onClick={() => void revokeToken(t.id)}
                  >
                    Revoke
                  </button>
                </li>
              ))}
              {tokens.length === 0 && (
                <p className="text-[12.5px] text-ink-45">No tokens yet.</p>
              )}
            </ul>
            {mintedRaw && (
              <div className="rounded-[10px] border border-line bg-draft px-3 py-2 text-[12px]">
                <div className="font-medium text-draft-ink mb-1">Copy this token now — it won&apos;t be shown again.</div>
                <code className="break-all font-mono text-[11.5px]">{mintedRaw}</code>
              </div>
            )}
            <div className="flex gap-2">
              <input
                className="st-input flex-1"
                value={tokenLabel}
                onChange={(e) => setTokenLabel(e.target.value)}
                placeholder="Token label"
              />
              <button
                type="button"
                className="st-btn st-btn--primary"
                disabled={busy !== null || !tokenLabel.trim()}
                onClick={() => void mintToken()}
              >
                {busy === "mint" ? "Minting…" : "Mint token"}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export function TeamPageClient({ authEnabled }: { authEnabled: boolean }) {
  return (
    <Suspense fallback={<div className="text-ink-55">Loading…</div>}>
      <TeamInner authEnabled={authEnabled} />
    </Suspense>
  );
}
