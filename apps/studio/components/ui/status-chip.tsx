"use client";
/**
 * One save/publish vocabulary for every Studio editor.
 *
 * There used to be four dialects — "Saved just now", "Saved to draft", a green
 * `saved` chip and nothing — at 1.4s, 1.6s and 2.0s. The wording and the timing
 * live here now, so the nav rail and the editor can never disagree about
 * whether an edit is live.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type SaveStatus =
  | "clean"
  | "saving"
  | "saved"
  | "staged"
  | "publishing"
  | "published"
  | "failed";

/** How long a transient confirmation stays up, everywhere. */
export const STATUS_FLASH_MS = 1600;

const COPY: Record<SaveStatus, { label: string; title?: string } | null> = {
  clean: null,
  saving: { label: "Saving…" },
  saved: { label: "Saved" },
  staged: {
    label: "Staged",
    title: "Saved as a draft. Reps still see the published version until you publish.",
  },
  publishing: { label: "Publishing…" },
  published: { label: "Published — live for reps" },
  failed: { label: "Couldn't save — retry" },
};

export function StatusChip({
  status,
  onRetry,
  /** Where "Staged" points. Defaults to the pending-changes tray. */
  href = "/publish",
}: {
  status: SaveStatus;
  onRetry?: () => void;
  href?: string;
}) {
  const copy = COPY[status];
  if (!copy) return <span className="text-[11.5px] text-ink-45">{" "}</span>;

  if (status === "failed") {
    return (
      <button
        type="button"
        className="st-chip-mono bg-drift text-drift-ink"
        title="The last autosave failed — this draft is not stored. Click to retry."
        onClick={onRetry}
      >
        {copy.label}
      </button>
    );
  }

  if (status === "staged") {
    return (
      <Link
        href={href}
        className="st-chip-mono bg-draft text-draft-ink hover:underline"
        title={copy.title}
      >
        {copy.label}
      </Link>
    );
  }

  if (status === "published") {
    return <span className="st-chip-mono bg-published text-published-ink">{copy.label}</span>;
  }

  return <span className="text-[11.5px] text-ink-45">{copy.label}</span>;
}

/**
 * Drives a StatusChip from save calls: `saving` while in flight, then the
 * resting state (`staged` for governed surfaces), flashing `saved`/`published`
 * for STATUS_FLASH_MS in between. One timer discipline instead of three.
 */
export function useSaveStatus(resting: SaveStatus = "staged") {
  const [status, setStatus] = useState<SaveStatus>("clean");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const flash = (transient: SaveStatus, settleTo: SaveStatus = resting) => {
    clearTimeout(timer.current);
    setStatus(transient);
    timer.current = setTimeout(() => setStatus(settleTo), STATUS_FLASH_MS);
  };

  /** Wrap a save/publish call: sets saving → flashes done → settles. */
  const track = async <T,>(
    run: () => Promise<T>,
    options: { done?: SaveStatus; settleTo?: SaveStatus; pending?: SaveStatus } = {},
  ): Promise<T | undefined> => {
    clearTimeout(timer.current);
    setStatus(options.pending ?? "saving");
    try {
      const result = await run();
      flash(options.done ?? "saved", options.settleTo ?? resting);
      return result;
    } catch {
      setStatus("failed");
      return undefined;
    }
  };

  return { status, setStatus, flash, track };
}
