"use client";
/**
 * The one way Studio shows a failure: what happened, what to do about it, and
 * the raw text tucked behind a disclosure for whoever needs to report it.
 */
import { useState } from "react";
import { classifyCrmError, type ClassifiedError } from "../../lib/crm-error";

export function ErrorNotice({
  error,
  onRetry,
  className = "",
}: {
  /** A caught error, a message string, or an already-classified payload. */
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const classified: ClassifiedError =
    error && typeof error === "object" && "kind" in error && "action" in error
      ? (error as ClassifiedError)
      : classifyCrmError(error);

  return (
    <div
      className={`rounded-[10px] border-l-[3px] border-drift-ink bg-drift px-4 py-3 ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12.5px] font-medium text-drift-ink">{classified.title}</div>
          <p className="mt-1 text-[12px] leading-snug text-drift-ink opacity-90">
            {classified.action}
          </p>
        </div>
        {onRetry && (
          <button type="button" className="st-btn shrink-0 !py-1 text-[11.5px]" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
      {classified.raw && (
        <>
          <button
            type="button"
            className="mt-2 text-[11px] text-drift-ink underline underline-offset-2 opacity-80 hover:opacity-100"
            aria-expanded={showRaw}
            onClick={() => setShowRaw((value) => !value)}
          >
            {showRaw ? "Hide details" : "Details"}
          </button>
          {showRaw && (
            <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap break-words rounded-[7px] bg-[rgba(154,59,48,0.07)] p-2 font-mono text-[10.5px] leading-relaxed text-drift-ink">
              {classified.raw}
            </pre>
          )}
        </>
      )}
    </div>
  );
}
