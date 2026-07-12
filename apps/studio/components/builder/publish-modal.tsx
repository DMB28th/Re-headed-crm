"use client";
/** Publish flow (2b): the signing mechanic again — diff vs published, then commit. */
import { useEffect, useState } from "react";
import type { LayoutDiff } from "@cardstack/config-store";

export function PublishModal({
  object,
  objectLabel,
  publishedRevision,
  onClose,
  onPublished,
}: {
  object: string;
  /** CRM display label — page titles never show raw api slugs. */
  objectLabel?: string;
  publishedRevision: number | null;
  onClose: () => void;
  onPublished: () => void;
}) {
  const [diff, setDiff] = useState<LayoutDiff | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/layout/${object}`);
      const data = (await res.json()) as { diff: LayoutDiff | null };
      setDiff(data.diff ?? { added: [], removed: [], changed: [] });
    })();
  }, [object]);

  const publish = async () => {
    setPublishing(true);
    setError(null);
    const res = await fetch(`/api/layout/${object}/publish`, { method: "POST" });
    if (res.ok) onPublished();
    else {
      setError(((await res.json()) as { error?: string }).error ?? "Publish failed");
      setPublishing(false);
    }
  };

  const empty = diff && diff.added.length + diff.removed.length + diff.changed.length === 0;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[rgba(20,24,40,0.35)]">
      <div className="st-card w-[460px] p-5">
        <h2 className="text-[14px] font-semibold">
          Publish {objectLabel ?? object} layout {publishedRevision ? `v${publishedRevision + 1}` : ""}
        </h2>
        <p className="mt-1 text-[11.5px] text-ink-55">
          Changes vs {publishedRevision ? `v${publishedRevision}` : "nothing published"} — the same
          before/after mechanic reps confirm writes with.
        </p>

        <div className="mt-3 max-h-[260px] space-y-1 overflow-y-auto">
          {!diff && <div className="text-[12px] text-ink-45">Computing diff…</div>}
          {empty && (
            <div className="text-[12px] text-ink-45">
              No draft changes — edit the layout first, or publish anyway to re-stamp the revision.
            </div>
          )}
          {diff?.added.map((k) => (
            <div key={`a-${k}`} className="rounded-[8px] bg-published px-2.5 py-1 text-[12px] text-published-ink">
              + {k}
            </div>
          ))}
          {diff?.removed.map((k) => (
            <div key={`r-${k}`} className="rounded-[8px] bg-drift px-2.5 py-1 text-[12px] text-drift-ink">
              − {k}
            </div>
          ))}
          {diff?.changed.map((k) => (
            <div key={`c-${k}`} className="rounded-[8px] bg-draft px-2.5 py-1 text-[12px] text-draft-ink">
              ~ {k}
            </div>
          ))}
        </div>

        {error && <div className="mt-2 rounded-[8px] bg-drift px-2.5 py-1.5 text-[12px] text-drift-ink">{error}</div>}

        <div className="mt-4 flex items-center justify-between">
          <span className="text-[11.5px] text-ink-45">
            Publishes to 38 users · previous versions are kept — roll back anytime.
          </span>
          <span className="flex gap-2">
            <button type="button" className="st-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="st-btn st-btn--primary"
              onClick={publish}
              disabled={publishing || !diff}
            >
              {publishing ? "Publishing…" : "Publish layout"}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
