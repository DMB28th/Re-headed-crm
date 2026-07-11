"use client";
/**
 * Connections (design 2c): the mock portal, a REAL HubSpot portal (private-app
 * token), or a REAL Salesforce org (client-credentials Connected App).
 * Credentials are validated server-side before storing and never come back
 * out through the API. One CRM per workspace; disconnect first to switch.
 */
import { useEffect, useState } from "react";

interface RedactedConnection {
  tenantId: string;
  status: "connected" | "disconnected";
  crm: "hubspot" | "salesforce";
  label: string;
  changedAt: string;
  live: boolean;
}

interface ConnectionsData {
  connection: RedactedConnection;
  connectedUser: string | null;
}

export default function ConnectionsPage() {
  const [data, setData] = useState<ConnectionsData | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hsToken, setHsToken] = useState("");
  const [hsFormOpen, setHsFormOpen] = useState(false);
  const [sf, setSf] = useState({ instanceUrl: "", clientId: "", clientSecret: "" });

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/connections");
      setData((await res.json()) as ConnectionsData);
    })();
  }, []);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as ConnectionsData & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Something went wrong.");
        return;
      }
      setData(json);
      setConfirming(false);
      setHsFormOpen(false);
      setHsToken("");
      setSf({ instanceUrl: "", clientId: "", clientSecret: "" });
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <div className="text-[12.5px] text-ink-45">Loading…</div>;
  const { connection } = data;
  const connected = connection.status === "connected";
  const hubspotActive = connected && connection.crm === "hubspot";
  const salesforceActive = connected && connection.crm === "salesforce";

  const connectedCard = (title: string, portalChip: string) => (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="inline-block h-2 w-2 rounded-full bg-success-dot" />
          <span className="text-[13.5px] font-semibold">{title}</span>
          <span className="st-chip-mono bg-published text-published-ink">connected</span>
        </div>
        <span className="st-chip-mono bg-crmmeta text-crmmeta-ink">{portalChip}</span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px]">
        <dt className="text-ink-55">Connected as</dt>
        <dd>{data.connectedUser ?? "—"}</dd>
        <dt className="text-ink-55">Credentials</dt>
        <dd>{connection.live ? "stored server-side · never sent to widgets" : "none needed (sample data)"}</dd>
        <dt className="text-ink-55">Since</dt>
        <dd>{new Date(connection.changedAt).toLocaleString()}</dd>
      </dl>
      <div className="mt-4 flex items-center justify-end gap-2">
        {!confirming ? (
          <button type="button" className="st-btn" onClick={() => setConfirming(true)}>
            Disconnect…
          </button>
        ) : (
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
              onClick={() => post({ action: "disconnect" })}
            >
              {busy ? "Disconnecting…" : "Disconnect"}
            </button>
          </span>
        )}
      </div>
    </>
  );

  return (
    <div className="max-w-[620px]">
      <h1 className="text-[16px] font-semibold">Connections</h1>
      <p className="mt-1 text-[12.5px] text-ink-55">
        One CRM per workspace. Disconnecting keeps your layouts and lists — reps just lose
        chat access until you reconnect.
      </p>

      {error && (
        <div className="mt-4 rounded-[10px] border-l-[3px] border-drift-ink bg-drift px-4 py-2.5 text-[12.5px] text-drift-ink">
          {error}
        </div>
      )}

      {/* HubSpot */}
      <div className="st-card mt-5 p-4">
        {hubspotActive ? (
          connectedCard("HubSpot", connection.label)
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="inline-block h-2 w-2 rounded-full bg-line" />
                <span className="text-[13.5px] font-semibold">HubSpot</span>
                <span className="st-chip-mono bg-paper text-ink-45">disconnected</span>
              </div>
            </div>
            {salesforceActive ? (
              <p className="mt-3 text-[12px] text-ink-45">
                Salesforce is connected — one CRM per workspace. Disconnect it first to switch.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between rounded-[10px] border border-line-soft px-3 py-2.5">
                  <span className="text-[12.5px]">
                    <strong>Mock portal</strong>
                    <span className="ml-2 text-ink-55">sample data, writes simulated — great for trying Cardstack</span>
                  </span>
                  <button
                    type="button"
                    className="st-btn"
                    disabled={busy}
                    onClick={() => post({ action: "connect", kind: "mock" })}
                  >
                    Connect
                  </button>
                </div>
                <div className="rounded-[10px] border border-line-soft px-3 py-2.5">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between text-left text-[12.5px]"
                    onClick={() => setHsFormOpen((o) => !o)}
                  >
                    <span>
                      <strong>Real portal</strong>
                      <span className="ml-2 text-ink-55">private-app access token</span>
                    </span>
                    <span className="text-ink-45">{hsFormOpen ? "▴" : "▾"}</span>
                  </button>
                  {hsFormOpen && (
                    <div className="mt-3 space-y-2">
                      <p className="text-[11.5px] text-ink-55">
                        HubSpot → Settings → Integrations → Private Apps → create one with{" "}
                        <code className="st-chip-mono bg-paper">crm.objects.*.read/write</code> +{" "}
                        <code className="st-chip-mono bg-paper">crm.schemas.*.read</code> scopes,
                        then paste the token. It's validated before anything is stored.
                      </p>
                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                          className="st-input flex-1"
                          placeholder="pat-na1-…"
                          value={hsToken}
                          onChange={(e) => setHsToken(e.target.value)}
                        />
                        <button
                          type="button"
                          className="st-btn st-btn--primary"
                          disabled={busy || !hsToken.trim()}
                          onClick={() =>
                            post({
                              action: "connect",
                              kind: "hubspot",
                              credentials: { accessToken: hsToken },
                            })
                          }
                        >
                          {busy ? "Validating…" : "Connect"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Salesforce */}
      <div className="st-card mt-4 p-4">
        {salesforceActive ? (
          connectedCard("Salesforce", connection.label)
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="inline-block h-2 w-2 rounded-full bg-line" />
                <span className="text-[13.5px] font-semibold">Salesforce</span>
                <span className="st-chip-mono bg-paper text-ink-45">disconnected</span>
              </div>
            </div>
            {hubspotActive ? (
              <p className="mt-3 text-[12px] text-ink-45">
                {connection.label === "mock portal" ? "The mock portal" : "HubSpot"} is connected —
                one CRM per workspace. Disconnect it first to switch.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                <p className="text-[11.5px] text-ink-55">
                  Create a Connected App (or External Client App) with the <strong>Client
                  Credentials</strong> flow enabled and a run-as integration user. Every call runs
                  as that user, so Salesforce enforces field-level security and sharing on top of
                  Cardstack's config. Credentials are validated before anything is stored.
                </p>
                <input
                  className="st-input w-full"
                  placeholder="Instance URL — https://yourdomain.my.salesforce.com"
                  value={sf.instanceUrl}
                  onChange={(e) => setSf({ ...sf, instanceUrl: e.target.value })}
                />
                <div className="flex gap-2">
                  <input
                    className="st-input flex-1"
                    placeholder="Consumer key"
                    value={sf.clientId}
                    onChange={(e) => setSf({ ...sf, clientId: e.target.value })}
                  />
                  <input
                    type="password"
                    className="st-input flex-1"
                    placeholder="Consumer secret"
                    value={sf.clientSecret}
                    onChange={(e) => setSf({ ...sf, clientSecret: e.target.value })}
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="st-btn st-btn--primary"
                    disabled={busy || !sf.instanceUrl.trim() || !sf.clientId.trim() || !sf.clientSecret.trim()}
                    onClick={() =>
                      post({ action: "connect", kind: "salesforce", credentials: { ...sf } })
                    }
                  >
                    {busy ? "Validating…" : "Connect"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
