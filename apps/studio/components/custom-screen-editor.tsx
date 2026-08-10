"use client";
/**
 * Custom screen SDK editor (design 11a), scoped to ONE screen.
 *
 * A custom screen is a screen INSIDE a screen flow — the flow render ladder is
 * the only thing that ever executes one. It used to have its own top-level rail
 * entry with its own list, which read as a second, unrelated area and let you
 * create screens attached to no flow at all (dead config). Screens are now
 * found and created from Flows; this route is just where the code pane lives,
 * because a code pane needs the room.
 *
 * Design note (hard rule 6): this DEVIATES from 12b, which lists SHARED as
 * Home card / Custom screens / Flows. It implements 10c's "Build screen" fork
 * instead — the entry point 12b's rail entry was always supposed to complement.
 *
 * Milestone note: this is M6 config with no M6 runtime — no guardrail
 * execution, no live preview, nothing that executes a published screen. It
 * stays VISIBLE rather than hiding behind a flag: the config is durable and
 * already authored in some tenants, hiding it would strand that work, and the
 * surface is now correctly scoped (reachable only from a flow, can't be
 * created or published without one). What it must never do is imply a publish
 * did something — hence the RuntimePendingBanner and the publish confirmation
 * below.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import type { CustomScreenConfig, CustomScreenRecord, FlowSummary } from "@cardstack/core";
import { LoadFailed } from "./load-failed";
import { RuntimePendingBanner } from "./runtime-pending-banner";
import { ConfirmButton } from "./ui/confirm";
import { ErrorNotice } from "./ui/error-notice";
import { StatusChip, useSaveStatus } from "./ui/status-chip";

const CHECKS = [
  "No network, storage, or DOM escape",
  "Writes only through flow.output",
  "Host tokens and dark mode supported",
];

export function CustomScreenEditor({ screenId }: { screenId: string }) {
  const [record, setRecord] = useState<(CustomScreenRecord & { id: string }) | null>(null);
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [draft, setDraft] = useState<CustomScreenConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const { status, track } = useSaveStatus("staged");

  useEffect(() => {
    void (async () => {
      setLoadError(null);
      try {
        const res = await fetch("/api/custom-screens");
        const json = (await res.json()) as {
          records: (CustomScreenRecord & { id: string })[];
          flows: FlowSummary[];
          error?: string;
        };
        if (!res.ok || json.error) {
          setLoadError(json.error ?? `Request failed (${res.status}).`);
          return;
        }
        const found = json.records.find((entry) => entry.id === screenId) ?? null;
        setRecord(found);
        setFlows(json.flows);
        setDraft(found ? { ...(found.draft ?? found.published)!, status: "draft" } : null);
      } catch (error) {
        setLoadError(String(error));
      }
    })();
  }, [screenId, reloadKey]);

  const updateDraft = (patch: Partial<CustomScreenConfig>) =>
    setDraft((current) => (current ? { ...current, ...patch, status: "draft" } : current));

  const saveDraft = async () => {
    if (!draft) return;
    await track(async () => {
      const res = await fetch(`/api/custom-screens/${draft.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        throw new Error(((await res.json()) as { error?: string }).error ?? "Save failed.");
      }
    });
  };

  const publish = async () => {
    if (!draft) return;
    setPublishError(null);
    // Save first so the published revision is what's on screen, not the last
    // thing that happened to be autosaved.
    await saveDraft();
    const ok = await track(
      async () => {
        const res = await fetch(`/api/custom-screens/${draft.id}`, { method: "POST" });
        if (!res.ok) {
          const message = ((await res.json()) as { error?: string }).error ?? "Publish failed.";
          setPublishError(message);
          throw new Error(message);
        }
        return true;
      },
      { pending: "publishing", done: "published", settleTo: "clean" },
    );
    if (ok) setReloadKey((key) => key + 1);
  };

  if (loadError) {
    return <LoadFailed error={loadError} onRetry={() => setReloadKey((key) => key + 1)} />;
  }
  if (!record || !draft) {
    return (
      <div className="mx-auto mt-12 max-w-[560px] rounded-[13px] border border-dashed border-line p-6 text-center">
        <div className="text-[13px] font-medium">That screen doesn&apos;t exist.</div>
        <p className="mt-1 text-[12px] text-ink-55">
          Screens are built from a flow —{" "}
          <Link href="/flows" className="underline">
            go to Flows
          </Link>
          .
        </p>
      </div>
    );
  }

  const flow = flows.find((entry) => entry.api === draft.flowApiName);
  const unattached = !draft.flowApiName;

  return (
    <div className="flex h-[calc(100vh-48px)] min-h-0 flex-col">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/flows" className="text-[11.5px] text-ink-45 hover:text-ink hover:underline">
            ← Flows
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-[16px] font-semibold">{draft.label}</h1>
            {record.published && (
              <span className="st-chip-mono bg-published text-published-ink">
                v{record.published.revision}
              </span>
            )}
            <StatusChip status={status} href={`/custom-screens/${draft.id}`} />
          </div>
          <p className="mt-1 text-[12.5px] text-ink-55">
            {flow ? (
              <>
                A screen inside <strong>{flow.label}</strong>. Values return to the flow — the
                screen never writes to the CRM itself.
              </>
            ) : (
              "Values return to the flow — the screen never writes to the CRM itself."
            )}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          <button type="button" className="st-btn" onClick={() => void saveDraft()}>
            Save draft
          </button>
          <ConfirmButton
            label="Publish"
            className="st-btn st-btn--primary"
            title="Publish this screen?"
            // The M6 screen runtime doesn't exist, so publishing stores a
            // versioned source and nothing more. Saying "live for reps" here
            // would be the one lie left on this surface.
            detail="Stores this source as the published revision, kept for rollback. It won't run yet — the runtime that executes custom screens ships with M6, so reps see no change today."
            confirmLabel="Publish"
            busyLabel="Publishing…"
            busy={status === "publishing"}
            disabled={unattached}
            onConfirm={publish}
          />
        </span>
      </header>

      {unattached && (
        <div className="mb-4 rounded-[10px] border-l-[3px] border-warn-dot bg-draft px-4 py-3 text-[12.5px] text-draft-ink">
          This screen isn&apos;t attached to a flow, so nothing can render it. Pick its flow below
          to make it publishable.
        </div>
      )}
      {publishError && <ErrorNotice error={publishError} className="mb-4" />}

      <div className="mb-4">
        <RuntimePendingBanner feature="Custom screens" milestone="the M6 screen runtime" />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(280px,0.8fr)_minmax(420px,1.2fr)] gap-4">
        <div className="space-y-3 overflow-y-auto">
          <div className="st-card p-4">
            <span className="st-section-label">Screen details</span>
            <label className="mt-3 block text-[11.5px] text-ink-55">
              Label
              <input
                className="st-input mt-1 w-full"
                value={draft.label}
                onChange={(e) => updateDraft({ label: e.target.value })}
              />
            </label>
            <label className="mt-3 block text-[11.5px] text-ink-55">
              Flow
              <select
                className="st-input mt-1 w-full"
                value={draft.flowApiName ?? ""}
                onChange={(e) => updateDraft({ flowApiName: e.target.value || undefined })}
              >
                {/* No "Unassigned" option: a screen with no flow is config that
                    can never run. Legacy unattached screens keep the blank
                    placeholder until one is picked. */}
                {unattached && <option value="">Pick a flow…</option>}
                {flows.map((entry) => (
                  <option key={entry.api} value={entry.api}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-[11.5px] text-ink-55">
              Replaces component
              <input
                className="st-input mt-1 w-full font-mono text-[11.5px]"
                placeholder="c:cpqPricingSummary"
                value={draft.replacesComponent ?? ""}
                onChange={(e) => updateDraft({ replacesComponent: e.target.value || undefined })}
              />
            </label>
          </div>

          <div className="st-card p-4">
            <span className="st-section-label">Publish checks</span>
            <div className="mt-3 space-y-2">
              {CHECKS.map((check) => (
                <div key={check} className="flex items-center gap-2 text-[12px] text-ink-55">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-warn-dot" />
                  {check}
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11.5px] text-ink-45">
              Guardrail execution and live preview are the next runtime slice. This editor stores
              the versioned source they will check.
            </p>
          </div>
        </div>

        <div className="flex min-h-[560px] flex-col overflow-hidden rounded-[13px] border border-line-soft bg-[#22242c]">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
            <span className="font-mono text-[11px] text-white/60">screen source</span>
            <span className="font-mono text-[11px] text-white/40">{draft.id} · draft</span>
          </div>
          <textarea
            className="min-h-0 flex-1 resize-none bg-transparent p-4 font-mono text-[12px] leading-7 text-[#dfe3ee] outline-none"
            spellCheck={false}
            value={draft.source}
            onChange={(e) => updateDraft({ source: e.target.value })}
            onBlur={() => void saveDraft()}
          />
          <div className="border-t border-white/10 px-4 py-3 text-[11.5px] text-white/45">
            No direct writes. Values return to the flow and land through the signing diff.
          </div>
        </div>
      </div>
    </div>
  );
}
