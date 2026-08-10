"use client";
/**
 * CRM-fetch failure state — every Studio surface that talks to the connected
 * portal renders THIS instead of hanging on "Loading…" (live-sandbox feedback
 * 2026-07-11).
 *
 * The failure is classified rather than dumped: the old version printed the raw
 * error and appended a hand-written "if this mentions a 403 or scopes…" guess
 * underneath it. ErrorNotice states the actual cause up front and keeps the raw
 * text behind Details for whoever has to report it.
 */
import Link from "next/link";
import { ErrorNotice } from "./ui/error-notice";
import { classifyCrmError } from "../lib/crm-error";

export function LoadFailed({ error, onRetry }: { error: string; onRetry: () => void }) {
  const classified = classifyCrmError(error);
  const needsReconnect = classified.kind === "scope" || classified.kind === "auth-expired";
  return (
    <div className="mx-auto mt-12 max-w-[560px]">
      <ErrorNotice error={classified} onRetry={onRetry} />
      {needsReconnect && (
        <p className="mt-3 px-1 text-[12px] text-ink-55">
          Manage credentials under{" "}
          <Link href="/connections" className="underline">
            Connections
          </Link>
          .
        </p>
      )}
    </div>
  );
}
