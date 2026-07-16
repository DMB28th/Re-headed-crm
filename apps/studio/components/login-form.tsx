"use client";

/**
 * Studio login — OAuth-only (PLAN.md non-goal: no password flows).
 * Providers appear only when their client credentials are configured.
 */
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { authClient } from "../lib/auth-client";

type Provider = "google" | "hubspot" | "salesforce";

const LABELS: Record<Provider, string> = {
  google: "Continue with Google",
  hubspot: "Continue with HubSpot",
  salesforce: "Continue with Salesforce",
};

function LoginInner({ providers }: { providers: Provider[] }) {
  const search = useSearchParams();
  const next = search.get("next") ?? "/";
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signIn = async (provider: Provider) => {
    setBusy(provider);
    setError(null);
    try {
      if (provider === "google") {
        await authClient.signIn.social({ provider: "google", callbackURL: next });
      } else {
        await authClient.signIn.oauth2({
          providerId: provider,
          callbackURL: next,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-6 px-4">
      <div>
        <div className="mb-3 flex items-center gap-2">
          <span className="relative inline-block h-4 w-4">
            <span className="absolute left-0 top-0 h-3 w-3 rounded-[3px] border-[1.5px] border-ink opacity-50" />
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-[3px] border-[1.5px] border-ink" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Cardstack Studio</span>
        </div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">Sign in to your account</h1>
        <p className="mt-1.5 text-[13px] text-ink-55">
          Use your work identity. Each account is a workspace with its own CRM connection and layouts.
        </p>
      </div>

      {providers.length === 0 ? (
        <div className="st-card p-4 text-[13px] text-ink-55">
          No SSO providers are configured on this deploy. Set{" "}
          <code className="font-mono text-[12px]">GOOGLE_CLIENT_ID</code> /{" "}
          <code className="font-mono text-[12px]">HUBSPOT_CLIENT_*</code> /{" "}
          <code className="font-mono text-[12px]">SALESFORCE_CLIENT_*</code> plus{" "}
          <code className="font-mono text-[12px]">BETTER_AUTH_SECRET</code> and{" "}
          <code className="font-mono text-[12px]">DATABASE_URL</code>.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {providers.map((provider) => (
            <button
              key={provider}
              type="button"
              className="st-btn st-btn--primary w-full justify-center py-2.5 text-[13px]"
              disabled={busy !== null}
              onClick={() => signIn(provider)}
            >
              {busy === provider ? "Redirecting…" : LABELS[provider]}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-[12.5px] text-drift-ink">{error}</p>}
    </div>
  );
}

export function LoginForm({ providers }: { providers: Provider[] }) {
  return (
    <Suspense fallback={<div className="p-8 text-ink-55">Loading…</div>}>
      <LoginInner providers={providers} />
    </Suspense>
  );
}
