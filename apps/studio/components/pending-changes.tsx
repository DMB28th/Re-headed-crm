"use client";
/**
 * Review & publish (docs/studio-staging-model.md).
 *
 * The one place that answers "what have I staged, and what will reps see?"
 * across all six governed surfaces. Before this, layouts published from the
 * builder, the home card from its own page, and lists and flows didn't publish
 * at all — they went live on save.
 *
 * Deviation from the design doc (noted per hard rule 6): this is a route, not a
 * modal. Every editor's "Staged" chip links here, so it needs an address.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { PublishResult, StagedChange } from "@cardstack/config-store";
import { LoadFailed } from "./load-failed";
import { ErrorNotice } from "./ui/error-notice";

const SURFACE_LABEL: Record<StagedChange["surface"], string> = {
  layout: "Layout",
  exposures: "Lists",
  flows: "Flow",
  homecard: "Home card",
  screen: "Screen",
};

/** Where an entry's editor lives, so a row is one click from being fixed. */
function editorHref(change: StagedChange): string {
  switch (change.surface) {
    case "layout":
      return `/objects/${change.object}/layouts`;
    case "exposures":
      return `/objects/${change.object}/lists`;
    case "flows":
      return "/flows";
    case "homecard":
      return "/home-card";
    case "screen":
      return "/custom-screens";
  }
}

const keyOf = (change: StagedChange) => `${change.surface}:${change.object}:${change.audience ?? ""}`;

function DiffRows({ diff }: { diff: StagedChange["diff"] }) {
  const rows = [
    ...diff.added.map((text) => ({ sign: "+", text, tone: "text-published-ink" })),
    ...diff.removed.map((text) => ({ sign: "−", text, tone: "text-drift-ink" })),
    ...diff.changed.map((text) => ({ sign: "~", text, tone: "text-draft-ink" })),
  ];
  return (
    <ul className="mt-2 space-y-0.5">
      {rows.map((row, i) => (
        <li key={i} className="flex gap-2 text-[11.5px] leading-snug">
          <span className={`font-mono ${row.tone}`}>{row.sign}</span>
          <span className="text-ink-55">{row.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function PendingChanges() {
  const [changes, setChanges] = useState<StagedChange[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [results, setResults] = useState<PublishResult[] | null>(null);
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/pending");
      const data = (await res.json()) as { changes?: StagedChange[]; error?: string };
      if (!res.ok || data.error) {
        setLoadError(data.error ?? `Request failed (${res.status}).`);
        return;
      }
      setChanges(data.changes ?? []);
      setSelected(new Set((data.changes ?? []).map(keyOf)));
    } catch (error) {
      setLoadError(String(error));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const publish = async () => {
    if (!changes) return;
    setPublishing(true);
    setPublishError(null);
    setResults(null);
    try {
      const keys = changes
        .filter((change) => selected.has(keyOf(change)))
        .map(({ surface, object, audience }) => ({ surface, object, audience }));
      const res = await fetch("/api/pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys }),
      });
      const data = (await res.json()) as { results?: PublishResult[]; error?: string };
      if (data.error) {
        setPublishError(data.error);
        return;
      }
      // 207 = some published, some didn't. Say so rather than showing "done".
      setResults(data.results ?? []);
      await load();
    } catch (error) {
      setPublishError(String(error));
    } finally {
      setPublishing(false);
    }
  };

  if (loadError) return <LoadFailed error={loadError} onRetry={() => void load()} />;
  if (!changes) return <div className="text-[12.5px] text-ink-45">Loading pending changes…</div>;

  const failed = results?.filter((result) => !result.ok) ?? [];
  const succeeded = results?.filter((result) => result.ok) ?? [];

  return (
    <div className="max-w-[720px]">
      <h1 className="text-[16px] font-semibold">Review &amp; publish</h1>
      <p className="mt-1 text-[12.5px] text-ink-55">
        Everything you&apos;ve staged, across every object and shared surface. Reps keep seeing the
        published version until you publish here.
      </p>

      {results && (
        <div className="mt-5 space-y-2">
          {succeeded.length > 0 && (
            <div className="rounded-[10px] border-l-[3px] border-published-ink bg-published px-4 py-3 text-[12.5px] text-published-ink">
              Published {succeeded.length} change{succeeded.length === 1 ? "" : "s"} — live for reps
              now.
            </div>
          )}
          {failed.length > 0 && (
            <ErrorNotice
              error={{
                kind: "unknown",
                title: `${failed.length} change${failed.length === 1 ? "" : "s"} didn't publish`,
                // Publishing is sequential, not atomic — anything that
                // succeeded above is already live and is NOT rolled back.
                action:
                  "The changes listed above did publish and are live. Fix the ones below and publish again.",
                raw: failed
                  .map((result) => `${SURFACE_LABEL[result.surface]} ${result.object}: ${result.error}`)
                  .join("\n"),
              }}
            />
          )}
        </div>
      )}

      {publishError && <ErrorNotice error={publishError} className="mt-5" />}

      {changes.length === 0 ? (
        <div className="mt-6 rounded-[13px] border border-dashed border-line p-6 text-center">
          <div className="text-[13px] font-medium">Nothing staged.</div>
          <p className="mx-auto mt-1 max-w-[420px] text-[12px] text-ink-55">
            Edits in the builder, lists, flows and the home card land here as drafts. Reps see the
            published version until you publish them.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5 flex items-center justify-between">
            <span className="st-section-label">
              {changes.length} pending change{changes.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              className="text-[11.5px] text-ink-55 underline underline-offset-2 hover:text-ink"
              onClick={() =>
                setSelected(
                  selected.size === changes.length ? new Set() : new Set(changes.map(keyOf)),
                )
              }
            >
              {selected.size === changes.length ? "Select none" : "Select all"}
            </button>
          </div>

          <div className="mt-2 space-y-2">
            {changes.map((change) => {
              const key = keyOf(change);
              return (
                <div key={key} className="st-card p-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={selected.has(key)}
                      aria-label={`Publish ${SURFACE_LABEL[change.surface]} ${change.label}`}
                      onChange={() =>
                        setSelected((current) => {
                          const next = new Set(current);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        })
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="st-chip-mono bg-crmmeta text-crmmeta-ink">
                          {SURFACE_LABEL[change.surface]}
                        </span>
                        <Link
                          href={editorHref(change)}
                          // Object api names arrive lowercase ("deals"); flow
                          // api names and "Home card" are already written the
                          // way they should read, so don't re-case those.
                          className={`text-[13px] font-semibold hover:underline ${
                            change.surface === "layout" || change.surface === "exposures"
                              ? "capitalize"
                              : ""
                          }`}
                        >
                          {change.label}
                        </Link>
                        <span className="st-chip-mono bg-paper text-ink-45">
                          {change.publishedRevision === null
                            ? "never published"
                            : `v${change.publishedRevision} → v${change.publishedRevision + 1}`}
                        </span>
                      </div>
                      <DiffRows diff={change.diff} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex items-center justify-between">
            <p className="text-[11.5px] text-ink-45">
              Published one at a time — if one fails, the ones before it stay live.
            </p>
            <button
              type="button"
              className="st-btn st-btn--primary"
              disabled={publishing || selected.size === 0}
              onClick={publish}
            >
              {publishing
                ? "Publishing…"
                : `Publish ${selected.size} change${selected.size === 1 ? "" : "s"}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
