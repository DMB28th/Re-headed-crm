"use client";
/**
 * BYO connected-app setup (spec 2026-08-11 §2): the guided path for
 * deployments without the Cardstack app and orgs that block third-party apps.
 * The one-click path lives on /connections; this page ends in the same
 * "Authorize admin" POST, so the shared callback (and its org claim) is
 * identical for both. Success and errors land back on /connections.
 *
 * /design has no mockup for this page — invented in the Studio token language
 * (PR must note this per hard rule 6).
 */
import Link from "next/link";
import { useEffect, useState } from "react";

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="block flex-1 break-all rounded-[6px] bg-white px-2 py-1 text-[11px]">
        {value}
      </code>
      <button
        type="button"
        className="st-btn"
        onClick={() => {
          void navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export default function SalesforceSetupPage() {
  const [origin, setOrigin] = useState("");
  const [sf, setSf] = useState({
    loginUrl: "https://login.salesforce.com",
    clientId: "",
    clientSecret: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const startSalesforceAdminOAuth = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/connections/salesforce/oauth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sf),
      });
      const json = (await res.json()) as { authorizationUrl?: string; error?: string };
      if (!res.ok || !json.authorizationUrl) {
        setError(json.error ?? "Could not start Salesforce authorization.");
        return;
      }
      window.location.href = json.authorizationUrl;
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-[620px]">
      <Link href="/connections" className="text-[12px] text-ink-45 hover:text-ink">
        ← Back to Connections
      </Link>
      <h1 className="mt-2 text-[16px] font-semibold">
        Set up your own Salesforce connected app
      </h1>
      <p className="mt-1 text-[12.5px] text-ink-55">
        Four steps in Salesforce Setup, then authorize below. The admin authorizes once for
        setup and metadata; each product user authorizes separately for their own records,
        list views, and writes.
      </p>

      <div className="st-card mt-5 p-4">
        <div className="text-[13.5px] font-semibold">1 · Create the app</div>
        <p className="mt-2 text-[12px] text-ink-55">
          In Salesforce Setup, search <strong>App Manager</strong> → New Connected App (or New
          External Client App). Create it <strong>in the org you&apos;re connecting</strong> —
          a sandbox app&apos;s Consumer Key/Secret differ from production&apos;s.
        </p>
      </div>

      <div className="st-card mt-4 p-4">
        <div className="text-[13.5px] font-semibold">2 · OAuth settings</div>
        <p className="mt-2 text-[12px] text-ink-55">
          Enable OAuth. Enable the web-server (Authorization Code) flow. Leave &quot;Require
          Proof Key for Code Exchange (PKCE)&quot; on.
        </p>
        <div className="mt-2 flex items-center gap-2 text-[12px] text-ink-55">
          Scopes:
          <code className="st-chip-mono">api</code>
          <code className="st-chip-mono">refresh_token/offline_access</code>
        </div>
        <div className="mt-3 rounded-[8px] border border-line-soft bg-paper p-2.5 text-[11px] text-ink-55">
          <div className="font-medium text-ink">Callback URLs</div>
          <div className="mt-1.5 space-y-1.5">
            <CopyField
              value={`${origin || "http://localhost:3002"}/api/connections/salesforce/oauth/callback`}
            />
            <CopyField
              value={`${origin || "http://localhost:3002"}/api/user-connections/salesforce/oauth/callback`}
            />
          </div>
        </div>
      </div>

      <div className="st-card mt-4 p-4">
        <div className="text-[13.5px] font-semibold">3 · Collect credentials</div>
        <p className="mt-2 text-[12px] text-ink-55">
          Consumer Key and Consumer Secret live under the app&apos;s &quot;Manage Consumer
          Details&quot;. Salesforce takes ~2–10 minutes to propagate a new app — an immediate
          authorize can fail once; wait and retry.
        </p>
      </div>

      <div className="st-card mt-4 p-4">
        <div className="text-[13.5px] font-semibold">4 · Authorize</div>
        <div className="mt-3 space-y-2">
          {error && (
            <div className="rounded-[10px] border-l-[3px] border-drift-ink bg-drift px-4 py-2.5 text-[12.5px] text-drift-ink">
              {error}
            </div>
          )}
          <input
            className="st-input w-full"
            placeholder="https://login.salesforce.com — or https://test.salesforce.com for a sandbox"
            value={sf.loginUrl}
            onChange={(e) => setSf({ ...sf, loginUrl: e.target.value })}
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
              disabled={busy || !sf.loginUrl.trim() || !sf.clientId.trim() || !sf.clientSecret.trim()}
              onClick={startSalesforceAdminOAuth}
            >
              {busy ? "Starting…" : "Authorize admin"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
