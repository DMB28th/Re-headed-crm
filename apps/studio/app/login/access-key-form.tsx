"use client";

/**
 * The pre-accounts access key, kept as a fallback. POSTing it to /api/session
 * bridges it to a real account + workspace so the rest of Studio only ever
 * deals with sessions.
 *
 * Collapsed behind a toggle when Salesforce sign-in is available, so the shared
 * key reads as the exception it now is rather than the main way in.
 */
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function AccessKeyForm({ next, collapsed }: { next: string; collapsed: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(!collapsed);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Sign-in failed.");
        return;
      }
      router.replace(next);
      router.refresh();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 block w-full border-t border-line pt-4 text-center text-[13px] text-ink-55 hover:text-ink-70"
      >
        Use a workspace access key
      </button>
    );
  }

  return (
    <form className={collapsed ? "mt-6 border-t border-line pt-5" : "mt-5"} onSubmit={submit}>
      <label className="text-[13px] font-medium" htmlFor="access-key">
        Access key
      </label>
      <input
        id="access-key"
        autoFocus
        type="password"
        autoComplete="current-password"
        className="st-input mt-2 w-full !px-3 !py-2.5 text-[14px]"
        value={secret}
        onChange={(event) => setSecret(event.target.value)}
      />
      {error && (
        <div role="alert" className="mt-3 rounded-[9px] bg-drift px-3 py-2 text-[13px] text-drift-ink">
          {error}
        </div>
      )}
      <button
        type="submit"
        className="st-btn st-btn--primary mt-4 w-full !py-2.5 text-[14px]"
        disabled={busy || !secret}
      >
        {busy ? "Signing in…" : "Open Studio"}
      </button>
    </form>
  );
}
