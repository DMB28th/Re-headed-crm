"use client";

import { useState } from "react";

export interface PersonRow {
  accountId: string;
  name: string;
  email: string | null;
  role: "admin" | "member";
  joinedAt: string;
  isSelf: boolean;
}

export function PeopleTable({ initialMembers }: { initialMembers: PersonRow[] }) {
  const [members, setMembers] = useState(initialMembers);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const adminCount = members.filter((m) => m.role === "admin").length;

  const setRole = async (accountId: string, role: "admin" | "member") => {
    setBusy(accountId);
    setError(null);
    try {
      const res = await fetch(`/api/people/${encodeURIComponent(accountId)}/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const body = (await res.json()) as { members?: PersonRow[]; error?: string };
      // The server refuses the last-admin demotion whether or not the button
      // was disabled; surface its reason rather than a generic failure.
      if (!res.ok) setError(body.error ?? "That change could not be saved.");
      else if (body.members) setMembers(body.members);
    } catch {
      setError("That change could not be saved. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {error && (
        <div className="mt-4 rounded-[13px] border border-line bg-paper px-4 py-3 text-[13px]">
          {error}
        </div>
      )}
      <div className="st-card mt-5 overflow-hidden">
        <div className="hidden grid-cols-[1.6fr_0.7fr_0.9fr_auto] gap-3 border-b border-line-soft px-4 py-2 md:grid">
          {["Person", "Role", "Joined", ""].map((h, i) => (
            <span key={i} className="st-section-label">
              {h}
            </span>
          ))}
        </div>
        {members.map((m) => {
          const lastAdmin = m.role === "admin" && adminCount <= 1;
          return (
            <div
              key={m.accountId}
              className="grid gap-2 border-b border-line-soft px-4 py-3 text-[13px] last:border-b-0 md:grid-cols-[1.6fr_0.7fr_0.9fr_auto] md:items-center md:gap-3"
            >
              <span className="flex flex-col">
                <span className="font-medium">
                  {m.name}
                  {m.isSelf && <span className="ml-2 text-ink-45">you</span>}
                </span>
                {m.email && <span className="text-[12px] text-ink-55">{m.email}</span>}
              </span>
              <span className="text-ink-55">{m.role === "admin" ? "Admin" : "Member"}</span>
              <span className="text-ink-55">{new Date(m.joinedAt).toLocaleDateString()}</span>
              <span className="flex justify-start md:justify-end">
                {m.role === "member" ? (
                  <button
                    type="button"
                    className="st-btn"
                    disabled={busy === m.accountId}
                    onClick={() => setRole(m.accountId, "admin")}
                  >
                    Make admin
                  </button>
                ) : (
                  <button
                    type="button"
                    className="st-btn"
                    disabled={busy === m.accountId || lastAdmin}
                    title={
                      lastAdmin
                        ? "A workspace needs at least one admin. Make someone else an admin first."
                        : undefined
                    }
                    onClick={() => setRole(m.accountId, "member")}
                  >
                    Remove admin
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[12px] text-ink-55">
        Anyone from your Salesforce org joins automatically the first time they sign in — there is
        no invite to send. A workspace always keeps at least one admin.
      </p>
    </>
  );
}
