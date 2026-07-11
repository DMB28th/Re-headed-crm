"use client";
/**
 * CRM-fetch failure state — every Studio surface that talks to the connected
 * portal renders THIS instead of hanging on "Loading…" (live-sandbox feedback
 * 2026-07-11). The raw error is shown because it names the fix (missing
 * private-app scope, expired token, rate limit).
 */
import Link from "next/link";

export function LoadFailed({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="mx-auto mt-12 max-w-[560px] rounded-[13px] border border-line p-6">
      <h2 className="text-[14px] font-semibold">Couldn't reach the CRM</h2>
      <p className="mt-2 break-words rounded-[8px] bg-drift p-3 text-[12px] text-drift-ink">
        {error}
      </p>
      <p className="mt-3 text-[12px] text-ink-55">
        If this mentions a 403 or scopes, the connection's credentials are missing a permission —
        fix the private app / connected app and reconnect. Expired or revoked tokens need a{" "}
        <Link href="/connections" className="underline">
          reconnect
        </Link>
        .
      </p>
      <button type="button" className="st-btn mt-4" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
