"use client";

import { useState } from "react";

/**
 * A rep's own CRM authorization, and nothing else. Deliberately says what only
 * THEY can do — the failure this replaces sent them to ask someone who could
 * not help.
 */
export function MyConnection({
  workspaceName,
  crmLabel,
  workspaceConnected,
  isSalesforce,
  connectedUser,
}: {
  workspaceName: string;
  crmLabel: string;
  workspaceConnected: boolean;
  isSalesforce: boolean;
  connectedUser: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/user-connections/salesforce/oauth/start", { method: "POST" });
      const body = (await res.json()) as { authorizationUrl?: string; error?: string };
      if (body.authorizationUrl) window.location.href = body.authorizationUrl;
      else setError(body.error ?? "That didn't work. Try again in a moment.");
    } catch {
      setError("That didn't work. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-[520px] px-5 py-14">
      <h1 className="text-[22px] font-semibold tracking-[-0.025em]">Your {crmLabel} connection</h1>
      <p className="mt-1 text-[14px] text-ink-55">
        Cardstack reads and edits {workspaceName}&rsquo;s records as you, using your own {crmLabel}{" "}
        access — never a shared login.
      </p>

      <div className="st-card mt-6 p-5">
        {connectedUser ? (
          <>
            <div className="text-[13px] font-medium">Connected as {connectedUser}</div>
            <p className="mt-1 text-[13px] text-ink-55">
              Nothing to do. If cards stop loading in chat, reconnect below.
            </p>
          </>
        ) : (
          <>
            <div className="text-[13px] font-medium">Not connected</div>
            <p className="mt-1 text-[13px] text-ink-55">
              Authorize {crmLabel} to use Cardstack cards in chat.
            </p>
          </>
        )}

        {error && <div className="mt-3 text-[13px] text-drift-ink">{error}</div>}

        {isSalesforce && workspaceConnected ? (
          <button
            type="button"
            className="st-btn st-btn--primary mt-4"
            disabled={busy}
            onClick={connect}
          >
            {connectedUser ? `Reconnect ${crmLabel}` : `Connect ${crmLabel}`}
          </button>
        ) : (
          <p className="mt-4 text-[13px] text-ink-55">
            {workspaceConnected
              ? `${crmLabel} doesn't use per-user authorization, so there's nothing to connect here.`
              : `${workspaceName} hasn't connected a CRM yet. An admin does that first.`}
          </p>
        )}
      </div>

      <p className="mt-4 text-[12px] text-ink-55">
        If you reached this from a chat app and it still fails afterwards, remove and re-add the
        Cardstack connector there — that re-runs the sign-in this page cannot.
      </p>
    </main>
  );
}
