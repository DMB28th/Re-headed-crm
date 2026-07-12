"use client";
/**
 * Connections (design 2c): the mock portal, a REAL HubSpot portal (private-app
 * token), or a REAL Salesforce org (client-credentials Connected App).
 * Credentials are validated server-side before storing and never come back
 * out through the API. One CRM per workspace; disconnect first to switch.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePortalInfo } from "../../components/use-portal-info";

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

interface OnboardingState {
  objects: { api: string; labelPlural: string }[];
  done: string[];
  generating: string | null;
  failed: Record<string, string>;
  started: boolean;
}

export default function ConnectionsPage() {
  const [data, setData] = useState<ConnectionsData | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hsToken, setHsToken] = useState("");
  const [hsFormOpen, setHsFormOpen] = useState(false);
  const [sf, setSf] = useState({ instanceUrl: "", clientId: "", clientSecret: "" });
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);

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
      // Successful LIVE connect (2c): offer starter-card generation for the
      // portal's unconfigured objects instead of dead-ending here.
      if (body.action === "connect" && body.kind !== "mock") {
        try {
          const objRes = await fetch("/api/objects");
          const objData = (await objRes.json()) as {
            available?: { api: string; labelPlural: string }[];
          };
          if (objRes.ok && (objData.available?.length ?? 0) > 0) {
            setOnboarding({
              objects: objData.available!,
              done: [],
              generating: null,
              failed: {},
              started: false,
            });
          }
        } catch {
          // No panel — the nav's "+ Add object" still works.
        }
      } else if (body.action === "disconnect") {
        setOnboarding(null);
      }
    } finally {
      setBusy(false);
    }
  };

  // Sequential on purpose: each POST /api/objects runs a full describe against
  // the live portal — parallel calls trip rate limits.
  const generateStarters = async () => {
    if (!onboarding) return;
    setOnboarding((o) => (o ? { ...o, started: true } : o));
    for (const object of onboarding.objects) {
      setOnboarding((o) => (o ? { ...o, generating: object.api } : o));
      try {
        const res = await fetch("/api/objects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ object: object.api }),
        });
        if (res.ok) {
          setOnboarding((o) =>
            o ? { ...o, generating: null, done: [...o.done, object.api] } : o,
          );
        } else {
          const json = (await res.json()) as { error?: string };
          setOnboarding((o) =>
            o
              ? {
                  ...o,
                  generating: null,
                  failed: { ...o.failed, [object.api]: json.error ?? `Failed (${res.status})` },
                }
              : o,
          );
        }
      } catch (err) {
        setOnboarding((o) =>
          o
            ? { ...o, generating: null, failed: { ...o.failed, [object.api]: String(err) } }
            : o,
        );
      }
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
                        HubSpot → Settings → Integrations → Private Apps → create one, then paste the
                        token. It's validated before anything is stored.
                      </p>
                      <div className="rounded-[8px] border border-line-soft bg-paper p-2.5 text-[11px] text-ink-55">
                        <div className="font-medium text-ink">Least-privilege scopes</div>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4">
                          <li>
                            <code className="st-chip-mono">crm.objects.&#123;deals,contacts,companies&#125;.read</code>{" "}
                            +{" "}
                            <code className="st-chip-mono">crm.schemas.&#123;deals,contacts,companies&#125;.read</code>{" "}
                            — the minimum to read cards
                          </li>
                          <li>
                            add the <code className="st-chip-mono">.write</code> variants only for
                            objects reps will edit from chat
                          </li>
                          <li>
                            optional: <code className="st-chip-mono">crm.objects.owners.read</code>{" "}
                            (owner names), <code className="st-chip-mono">crm.lists.read</code>{" "}
                            (import your HubSpot Lists), <code className="st-chip-mono">crm.schemas.custom.read</code>{" "}
                            (custom objects), tickets / e-commerce for those objects
                          </li>
                        </ul>
                        <div className="mt-1.5 text-ink-45">
                          The token is stored server-side and never reaches the chat client or widget.
                        </div>
                      </div>
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

      {onboarding && connected && (
        <div className="st-card mt-4 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[13.5px] font-semibold">Generate starter cards</span>
            <button
              type="button"
              className="text-[12px] text-ink-45 hover:text-ink"
              aria-label="Dismiss starter-card generation"
              onClick={() => setOnboarding(null)}
            >
              ×
            </button>
          </div>
          <p className="mt-1 text-[11.5px] text-ink-55">
            Each object gets a draft layout built from its highest-signal fields — nothing
            reaches reps until you publish.
          </p>
          <div className="mt-3 space-y-1">
            {onboarding.objects.map((object) => {
              const status = onboarding.done.includes(object.api)
                ? "done"
                : onboarding.generating === object.api
                  ? "generating"
                  : onboarding.failed[object.api]
                    ? "failed"
                    : "pending";
              return (
                <div
                  key={object.api}
                  className="flex items-center justify-between rounded-[8px] border border-line-soft px-2.5 py-1.5 text-[12.5px]"
                >
                  <span className="capitalize">{object.labelPlural}</span>
                  {status === "done" && (
                    <span className="text-[11.5px] text-published-ink">✓ draft ready</span>
                  )}
                  {status === "generating" && (
                    <span className="text-[11.5px] text-ink-45">Reading fields…</span>
                  )}
                  {status === "failed" && (
                    <span
                      className="max-w-[280px] truncate text-[11.5px] text-drift-ink"
                      title={onboarding.failed[object.api]}
                    >
                      ✕ {onboarding.failed[object.api]}
                    </span>
                  )}
                  {status === "pending" && <span className="text-[11.5px] text-ink-45">○</span>}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            {onboarding.done.length > 0 && onboarding.generating === null && (
              <Link href={`/objects/${onboarding.done[0]}/layouts`} className="st-btn">
                Open the builder →
              </Link>
            )}
            {!onboarding.started && (
              <button type="button" className="st-btn st-btn--primary" onClick={generateStarters}>
                Generate {onboarding.objects.length} starter card
                {onboarding.objects.length === 1 ? "" : "s"}
              </button>
            )}
          </div>
        </div>
      )}

      {connected && <ScopeCoverage />}
    </div>
  );
}

/**
 * Scope coverage (2c connection health): what the stored token can and can't
 * see, from the adapter's own gap report — never guessed client-side.
 */
function ScopeCoverage() {
  const { info, loaded } = usePortalInfo();
  if (!loaded) return null;
  return (
    <div className="mt-6">
      <div className="flex items-center gap-2">
        <h2 className="st-section-label">Scope coverage</h2>
        {info.isSandbox === true && (
          <span className="st-chip-mono bg-published text-published-ink">Sandbox</span>
        )}
        {info.isSandbox === false && (
          <span className="st-chip-mono bg-drift text-drift-ink">PRODUCTION</span>
        )}
      </div>
      <div className="st-card mt-2 p-4">
        {info.scopeGaps.length === 0 ? (
          <div className="flex items-center gap-2 text-[12.5px]">
            <span className="inline-block h-2 w-2 rounded-full bg-success-dot" />
            Full coverage — the token can see everything Cardstack uses.
          </div>
        ) : (
          <div className="space-y-2">
            {info.scopeGaps.map((gap) => (
              <div
                key={gap}
                className="rounded-[8px] bg-draft px-2.5 py-1.5 text-[12px] text-draft-ink"
              >
                {gap}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
