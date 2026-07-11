"use client";
/**
 * Connections (design 2c): connect/disconnect the mock portal for real —
 * disconnected = empty canvas everywhere, reps get "no CRM connected" in chat.
 * Salesforce stays a teaching card until the live adapters (OAuth) land.
 */
import { useEffect, useState } from "react";
import type { ConnectionState } from "@cardstack/config-store";

interface ConnectionsData {
  connection: ConnectionState;
  connectedUser: string | null;
}

export default function ConnectionsPage() {
  const [data, setData] = useState<ConnectionsData | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/connections");
      setData((await res.json()) as ConnectionsData);
    })();
  }, []);

  const act = async (action: "connect" | "disconnect") => {
    setBusy(true);
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) setData((await res.json()) as ConnectionsData);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <div className="text-[12.5px] text-ink-45">Loading…</div>;
  const connected = data.connection.status === "connected";

  return (
    <div className="max-w-[620px]">
      <h1 className="text-[16px] font-semibold">Connections</h1>
      <p className="mt-1 text-[12.5px] text-ink-55">
        One CRM per workspace. Disconnecting keeps your layouts and lists — reps just lose
        chat access until you reconnect.
      </p>

      <div className="st-card mt-5 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span
              className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-success-dot" : "bg-line"}`}
            />
            <span className="text-[13.5px] font-semibold">HubSpot</span>
            {connected ? (
              <span className="st-chip-mono bg-published text-published-ink">connected</span>
            ) : (
              <span className="st-chip-mono bg-paper text-ink-45">disconnected</span>
            )}
          </div>
          <span className="st-chip-mono bg-crmmeta text-crmmeta-ink">mock portal</span>
        </div>

        {connected && (
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px]">
            <dt className="text-ink-55">Connected as</dt>
            <dd>{data.connectedUser ?? "—"}</dd>
            <dt className="text-ink-55">Token</dt>
            <dd>healthy · auto-refresh on</dd>
            <dt className="text-ink-55">Metadata sync</dt>
            <dd>60 fields · 4 saved views · just now</dd>
          </dl>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          {connected && !confirming && (
            <button type="button" className="st-btn" onClick={() => setConfirming(true)}>
              Disconnect…
            </button>
          )}
          {connected && confirming && (
            <span className="flex items-center gap-2 text-[12px]">
              <span className="text-ink-55">
                Reps immediately lose chat access. Layouts and lists are kept.
              </span>
              <button type="button" className="st-btn" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="st-btn st-btn--primary"
                disabled={busy}
                onClick={() => act("disconnect")}
              >
                {busy ? "Disconnecting…" : "Disconnect"}
              </button>
            </span>
          )}
          {!connected && (
            <button
              type="button"
              className="st-btn st-btn--primary"
              disabled={busy}
              onClick={() => act("connect")}
            >
              {busy ? "Connecting…" : "Connect mock portal"}
            </button>
          )}
        </div>
      </div>

      <div className="st-card mt-4 p-4 opacity-60">
        <div className="flex items-center justify-between">
          <span className="text-[13.5px] font-semibold">Salesforce</span>
          <span className="text-[11.5px] text-ink-45">
            Production / Sandbox · OAuth lands with the live adapters
          </span>
        </div>
      </div>
    </div>
  );
}
