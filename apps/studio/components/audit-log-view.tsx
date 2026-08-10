"use client";
/**
 * Audit log (compliance spine): every confirmed chat write, filterable.
 *
 * This used to render whatever the store handed back — capped at 500, with no
 * filter, no paging and no way to answer "who changed amount on this record
 * last Tuesday", which is the only question a compliance surface exists for.
 * Filtering and paging are server-side (see /api/audit) so the page stays the
 * same size whether the tenant has 50 writes or 50,000.
 */
import { useCallback, useEffect, useState } from "react";
import type { AuditEntry } from "@cardstack/config-store";
import { LoadFailed } from "./load-failed";

const PAGE_SIZE = 50;

interface Filters {
  object: string;
  actor: string;
  q: string;
  from: string;
  to: string;
}

const EMPTY: Filters = { object: "", actor: "", q: "", from: "", to: "" };

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

/**
 * Confirmation provenance, stated only as strongly as the server can back it.
 * "Rep confirmed" means a confirm token minted by crm_preview_update verified
 * against this exact diff — not that a widget said so. Entries written before
 * 2026-08-02 carry nothing, and claiming either origin for them would be a
 * guess in a compliance record.
 */
function confirmationLabel(entry: { confirmation?: { via: "widget" | "model" } }): {
  text: string;
  title: string;
  className: string;
} {
  switch (entry.confirmation?.via) {
    case "widget":
      return {
        text: "Rep confirmed",
        title:
          "A rep confirmed this exact diff in the card; the server verified the confirmation token before writing.",
        className: "bg-paper text-ink",
      };
    case "model":
      return {
        text: "Model-initiated",
        title:
          "The assistant called the write tool directly — no confirmation diff was shown to a rep.",
        className: "bg-paper text-ink-55",
      };
    default:
      return {
        text: "Not recorded",
        title: "Logged before Cardstack recorded confirmation provenance (2026-08-02).",
        className: "bg-paper text-ink-45",
      };
  }
}

function toParams(filters: Filters, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, ...extra })) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

export function AuditLogView() {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [objects, setObjects] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (nextFilters: Filters, nextOffset: number) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/audit?${toParams(nextFilters, {
          limit: String(PAGE_SIZE),
          offset: String(nextOffset),
        })}`,
      );
      const data = (await res.json()) as {
        entries?: AuditEntry[];
        total?: number;
        objects?: string[];
        error?: string;
      };
      if (!res.ok || data.error) {
        setLoadError(data.error ?? `Request failed (${res.status}).`);
        return;
      }
      setEntries(data.entries ?? []);
      setTotal(data.total ?? 0);
      setObjects(data.objects ?? []);
    } catch (error) {
      setLoadError(String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced so typing a record id doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => void load(filters, offset), 250);
    return () => clearTimeout(timer);
  }, [filters, offset, load]);

  const update = (patch: Partial<Filters>) => {
    setOffset(0); // a new filter always starts at page one
    setFilters((current) => ({ ...current, ...patch }));
  };

  const filtered = Object.values(filters).some(Boolean);

  if (loadError) return <LoadFailed error={loadError} onRetry={() => void load(filters, offset)} />;

  return (
    <div className="max-w-[980px]">
      <div className="flex items-center justify-between">
        <h1 className="text-[16px] font-semibold">Audit log</h1>
        <a href={`/api/audit?${toParams(filters, { format: "csv" })}`} className="st-btn" download>
          Download CSV{filtered ? " (filtered)" : ""}
        </a>
      </div>
      <p className="mt-1 text-[12.5px] text-ink-55">
        Every write reps confirm from chat, with before/after values, who triggered it and who it
        was written as. Durable across restarts.
      </p>

      <div className="st-card mt-5 flex flex-wrap items-end gap-2 p-3">
        <label className="text-[11px] text-ink-55">
          Object
          <select
            className="st-input mt-1 block w-[150px]"
            value={filters.object}
            onChange={(e) => update({ object: e.target.value })}
          >
            <option value="">All objects</option>
            {objects.map((object) => (
              <option key={object} value={object}>
                {object}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-ink-55">
          Actor
          <input
            className="st-input mt-1 block w-[160px]"
            placeholder="name or email"
            value={filters.actor}
            onChange={(e) => update({ actor: e.target.value })}
          />
        </label>
        <label className="text-[11px] text-ink-55">
          Record or field
          <input
            className="st-input mt-1 block w-[160px]"
            placeholder="record id or field"
            value={filters.q}
            onChange={(e) => update({ q: e.target.value })}
          />
        </label>
        <label className="text-[11px] text-ink-55">
          From
          <input
            type="date"
            className="st-input mt-1 block w-[140px]"
            value={filters.from}
            onChange={(e) => update({ from: e.target.value })}
          />
        </label>
        <label className="text-[11px] text-ink-55">
          To
          <input
            type="date"
            className="st-input mt-1 block w-[140px]"
            value={filters.to}
            onChange={(e) => update({ to: e.target.value })}
          />
        </label>
        {filtered && (
          <button
            type="button"
            className="st-btn ml-auto !py-1 text-[11.5px]"
            onClick={() => {
              setOffset(0);
              setFilters(EMPTY);
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="mt-6 rounded-[13px] border border-dashed border-line p-6 text-center">
          <div className="text-[13px] font-medium">
            {filtered ? "No writes match those filters." : "No chat writes logged yet."}
          </div>
          <p className="mx-auto mt-1 max-w-[420px] text-[12px] text-ink-55">
            {filtered
              ? "Widen the date range or clear a filter."
              : "When a rep confirms an edit from chat, it lands here — field, before, after, timestamp, and the connected user it was written as."}
          </p>
        </div>
      ) : (
        <>
          <div className="st-card mt-4 overflow-hidden">
            <div className="grid grid-cols-[1.3fr_1.1fr_1.1fr_1fr_2fr_0.9fr] gap-3 border-b border-line-soft px-4 py-2">
              {["When", "Actor", "Written as", "Record", "Change", "Confirmation"].map((h) => (
                <span key={h} className="st-section-label">
                  {h}
                </span>
              ))}
            </div>
            {entries.map((e) => (
              <div
                key={e.id}
                className="grid grid-cols-[1.3fr_1.1fr_1.1fr_1fr_2fr_0.9fr] gap-3 border-b border-line-soft px-4 py-2.5 text-[12px] last:border-b-0"
              >
                <span className="text-ink-55">{new Date(e.timestamp).toLocaleString()}</span>
                <span className="break-words">{e.actor?.name ?? "—"}</span>
                <span className="break-words">{e.user}</span>
                <span className="break-words text-ink-55">
                  <span className="st-chip-mono bg-paper text-ink-45">{e.object}</span> {e.recordId}
                </span>
                <span className="flex flex-col gap-0.5 break-words">
                  {e.changes.map((c, i) => (
                    <span key={i}>
                      <strong>{c.field}</strong> {formatValue(c.before)} → {formatValue(c.after)}
                    </span>
                  ))}
                </span>
                <span>
                  {(() => {
                    const badge = confirmationLabel(e);
                    return (
                      <span className={`st-chip-mono ${badge.className}`} title={badge.title}>
                        {badge.text}
                      </span>
                    );
                  })()}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span className="text-[11.5px] text-ink-45">
              {loading ? "Loading…" : `Showing ${offset + 1}–${offset + entries.length} of ${total}`}
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                className="st-btn !py-1 text-[11.5px]"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Previous
              </button>
              <button
                type="button"
                className="st-btn !py-1 text-[11.5px]"
                disabled={offset + entries.length >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Next
              </button>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
