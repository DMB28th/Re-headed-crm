"use client";
/**
 * Flows (redesigned 2026-07-26; deviation from the original render-mode-only
 * 10c/11d page, per product direction): the org's EXISTING screen flows are
 * the catalog — nothing is authored here. For each flow the admin sees what
 * the in-chat interpreter can do with it (Chat-ready / Partial / Opens in
 * CRM), toggles which object cards expose it, and reviews the automatic
 * input mapping (recordId always flows; name-matched fields map themselves;
 * the flow's own screens collect the rest). Enabling publishes immediately —
 * layout history keeps every revision rollbackable.
 */
import { useEffect, useMemo, useState } from "react";
import type { FlowRenderMode, FlowRenderModeConfig, FlowSupportReport } from "@cardstack/core";
import { LoadFailed } from "./load-failed";

interface FlowRow {
  api: string;
  label: string;
  screens: number;
  writesSummary: string;
  support: FlowSupportReport | null;
  inputVariables: { name: string; dataType: string }[];
  assignedTo: { object: string; label: string }[];
}

interface FlowsResponse {
  flows: FlowRow[];
  modes: FlowRenderModeConfig[];
  objects: string[];
  connection: { status: "connected" | "disconnected"; crm: "hubspot" | "salesforce"; live?: boolean };
  error?: string;
}

const MODES: { value: FlowRenderMode; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "native", label: "Native" },
  { value: "handoff", label: "Handoff" },
];

function SupportBadge({ support }: { support: FlowSupportReport | null }) {
  if (!support) {
    return (
      <span
        className="st-chip-mono bg-paper text-ink-45"
        title="This flow's definition isn't readable (installed/managed flow) — it opens in the CRM."
      >
        Opens in CRM
      </span>
    );
  }
  if (support.level === "full") {
    return (
      <span className="st-chip-mono bg-published text-published-ink" title="Every screen and element renders in chat.">
        Chat-ready
      </span>
    );
  }
  if (support.level === "partial") {
    const blockers = support.blockers
      .slice(0, 4)
      .map((b) => `${b.name}: ${b.reason}`)
      .join("\n");
    return (
      <span
        className="st-chip-mono bg-crmmeta text-crmmeta-ink"
        title={`Renders in chat until a blocked element, then opens in the CRM.\n${blockers}`}
      >
        Partial · {support.blockers.length} blocker{support.blockers.length === 1 ? "" : "s"}
      </span>
    );
  }
  return (
    <span className="st-chip-mono bg-paper text-ink-45" title="No screens to render — opens in the CRM.">
      Opens in CRM
    </span>
  );
}

export function FlowsEditor() {
  const [data, setData] = useState<FlowsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    void (async () => {
      setLoadError(null);
      try {
        const res = await fetch("/api/flows");
        const json = (await res.json()) as FlowsResponse;
        if (!res.ok || json.error) {
          setLoadError(json.error ?? `Request failed (${res.status}).`);
          return;
        }
        setData(json);
      } catch (error) {
        setLoadError(String(error));
      }
    })();
  }, [reloadKey]);

  const modeByFlow = useMemo(
    () => new Map((data?.modes ?? []).map((mode) => [mode.flowApiName, mode])),
    [data],
  );

  const toggleAssignment = async (flow: FlowRow, object: string, enabled: boolean) => {
    const key = `${flow.api}:${object}`;
    setBusyKey(key);
    setNotice(null);
    try {
      const res = await fetch("/api/flows/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowApiName: flow.api, object, enabled }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        revision?: number;
        mappedInputs?: string[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setLoadError(json.error ?? `Request failed (${res.status}).`);
        return;
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              flows: prev.flows.map((f) =>
                f.api !== flow.api
                  ? f
                  : {
                      ...f,
                      assignedTo: enabled
                        ? [...f.assignedTo, { object, label: f.label }]
                        : f.assignedTo.filter((a) => a.object !== object),
                    },
              ),
            }
          : prev,
      );
      setNotice(
        enabled
          ? `${flow.label} is live on the ${object} card (rev ${json.revision})` +
              (json.mappedInputs && json.mappedInputs.length > 0
                ? ` — auto-mapped: ${json.mappedInputs.join(", ")}`
                : "")
          : `${flow.label} removed from the ${object} card (rev ${json.revision})`,
      );
      setTimeout(() => setNotice(null), 3500);
    } finally {
      setBusyKey(null);
    }
  };

  const saveMode = async (flowApiName: string, mode: FlowRenderMode) => {
    const res = await fetch("/api/flows", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flowApiName, mode }),
    });
    const json = (await res.json()) as { mode?: FlowRenderModeConfig; error?: string };
    if (!res.ok || !json.mode) {
      setLoadError(json.error ?? `Request failed (${res.status}).`);
      return;
    }
    setData((prev) =>
      prev
        ? {
            ...prev,
            modes: [...prev.modes.filter((m) => m.flowApiName !== flowApiName), json.mode!],
          }
        : prev,
    );
  };

  if (loadError) {
    return <LoadFailed error={loadError} onRetry={() => setReloadKey((key) => key + 1)} />;
  }
  if (!data) return <div className="text-[12.5px] text-ink-45">Loading flows...</div>;

  const crmLabel = data.connection.crm === "salesforce" ? "Salesforce" : "HubSpot";
  const chatReady = data.flows.filter((f) => f.support?.level === "full").length;

  return (
    <div className="max-w-[920px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[16px] font-semibold">Flows</h1>
          <p className="mt-1 text-[12.5px] text-ink-55">
            Your org&apos;s screen flows, as they are — pick which ones reps can run from chat and
            which cards offer them. Variables map themselves from the record.
          </p>
        </div>
        <span className="st-chip-mono bg-crmmeta text-crmmeta-ink">{crmLabel}</span>
      </div>

      {notice && (
        <div className="mt-3 rounded-[10px] border border-line-soft bg-published px-4 py-2.5 text-[12px] text-published-ink">
          {notice}
        </div>
      )}

      <div className="mt-4 text-[11.5px] text-ink-45">
        {data.flows.length} flows · {chatReady} chat-ready · exposing a flow publishes the card
        immediately (history keeps every revision).
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2.5">
        {data.flows.length === 0 && (
          <div className="st-card px-4 py-5 text-[12.5px] text-ink-55">
            No active screen flows found in this {crmLabel} connection.
          </div>
        )}

        {data.flows.map((flow) => {
          const assignedObjects = new Set(flow.assignedTo.map((a) => a.object));
          const currentMode = modeByFlow.get(flow.api)?.mode ?? "auto";
          return (
            <div key={flow.api} className="st-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] font-semibold">{flow.label}</span>
                    <SupportBadge support={flow.support} />
                    {flow.screens > 0 && (
                      <span className="st-chip-mono bg-paper text-ink-45">
                        {flow.screens} screen{flow.screens === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  <div className="mt-1">
                    <span className="st-chip-mono bg-paper text-ink-45">{flow.api}</span>
                  </div>
                </div>
                <div className="inline-flex overflow-hidden rounded-[8px] border border-line bg-surface">
                  {MODES.map((mode) => (
                    <button
                      key={mode.value}
                      type="button"
                      className={`px-2 py-0.5 text-[11px] ${
                        currentMode === mode.value ? "bg-accent text-white" : "text-ink-45"
                      }`}
                      onClick={() => saveMode(flow.api, mode.value)}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <div className="rounded-[9px] border border-line-soft bg-paper px-3 py-2">
                  <div className="st-section-label">Available on</div>
                  {data.objects.length === 0 ? (
                    <div className="mt-1 text-[11.5px] text-ink-45">
                      No cards configured yet — build an object&apos;s card first.
                    </div>
                  ) : (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {data.objects.map((object) => {
                        const on = assignedObjects.has(object);
                        const busy = busyKey === `${flow.api}:${object}`;
                        return (
                          <button
                            key={object}
                            type="button"
                            disabled={busy}
                            className={`rounded-[8px] border px-2.5 py-1 text-[11.5px] ${
                              on
                                ? "border-accent bg-accent text-white"
                                : "border-line bg-surface text-ink-55"
                            } ${busy ? "opacity-60" : ""}`}
                            title={
                              on
                                ? `Remove from the ${object} card`
                                : `Expose on the ${object} card`
                            }
                            onClick={() => toggleAssignment(flow, object, !on)}
                          >
                            {busy ? "…" : object}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="rounded-[9px] border border-line-soft bg-paper px-3 py-2">
                  <div className="st-section-label">Record → flow variables</div>
                  {flow.inputVariables.length === 0 ? (
                    <div className="mt-1 text-[11.5px] text-ink-45">
                      No input variables — the record id is passed automatically.
                    </div>
                  ) : (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {flow.inputVariables.map((v) => (
                        <span
                          key={v.name}
                          className="st-chip-mono bg-surface text-ink-45"
                          title={
                            v.name.toLowerCase() === "recordid"
                              ? "Receives the record's id automatically."
                              : "Auto-maps to a matching record field; otherwise the flow's own screens collect it."
                          }
                        >
                          {v.name}
                          {v.name.toLowerCase() === "recordid" ? " ← record" : ""}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
