"use client";
/**
 * Flows (design 10c/11d): synced CRM flows plus Cardstack render-mode policy.
 * Runtime tools land next; this page is the durable admin contract they read.
 */
import { useEffect, useMemo, useState } from "react";
import type { FlowRenderMode, FlowRenderModeConfig, FlowSummary } from "@cardstack/core";
import { LoadFailed } from "./load-failed";

const MODES: { value: FlowRenderMode; label: string; note: string }[] = [
  { value: "auto", label: "Auto", note: "Native first, embed when needed, hand off if blocked." },
  { value: "native", label: "Native", note: "Only host-native controls; unsupported screens must be mapped." },
  { value: "embedded", label: "Embedded", note: "Salesforce renders the screen inside a guarded boundary." },
  { value: "handoff", label: "Handoff", note: "Always open in Salesforce and resume from chat." },
];

interface FlowsResponse {
  flows: FlowSummary[];
  modes: FlowRenderModeConfig[];
  connection: { status: "connected" | "disconnected"; crm: "hubspot" | "salesforce"; live?: boolean };
  error?: string;
}

export function FlowsEditor() {
  const [data, setData] = useState<FlowsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savedFlow, setSavedFlow] = useState<string | null>(null);
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
            modes: [
              ...prev.modes.filter((m) => m.flowApiName !== flowApiName),
              json.mode!,
            ],
          }
        : prev,
    );
    setSavedFlow(flowApiName);
    setTimeout(() => setSavedFlow(null), 1400);
  };

  if (loadError) {
    return <LoadFailed error={loadError} onRetry={() => setReloadKey((key) => key + 1)} />;
  }
  if (!data) return <div className="text-[12.5px] text-ink-45">Loading flows...</div>;

  const crmLabel = data.connection.crm === "salesforce" ? "Salesforce" : "HubSpot";

  return (
    <div className="max-w-[920px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[16px] font-semibold">Flows</h1>
          <p className="mt-1 text-[12.5px] text-ink-55">
            Synced from the CRM. Studio chooses how each flow renders in chat; the CRM still
            owns branching and writes.
          </p>
        </div>
        <span className="st-chip-mono bg-crmmeta text-crmmeta-ink">{crmLabel}</span>
      </div>

      <div className="mt-5 rounded-[10px] border border-line-soft bg-paper px-4 py-3 text-[12px] leading-snug text-ink-55">
        <span className="font-semibold text-ink-55">Handoff is live.</span> Reps can start a
        configured flow from a card, answer its inputs in chat, and open it in Salesforce to
        finish. <span className="font-semibold text-ink-55">Native</span> and{" "}
        <span className="font-semibold text-ink-55">Embedded</span> render modes are not delivered
        yet and fall back to the open-in-Salesforce handoff.
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2.5">
        {data.flows.length === 0 && (
          <div className="st-card px-4 py-5 text-[12.5px] text-ink-55">
            No flows are available from this connection yet.
            {data.connection.crm === "salesforce"
              ? " Salesforce flow sync needs the Tooling/API coverage called out in the design spike; the page is ready for the adapter to start returning flows."
              : " HubSpot workflow input-step sync lands after the Salesforce flow runtime."}
          </div>
        )}

        {data.flows.map((flow) => {
          const saved = modeByFlow.get(flow.api);
          const current = saved?.mode ?? "auto";
          return (
            <div key={flow.api} className="st-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] font-semibold">{flow.label}</span>
                    <span className="st-chip-mono bg-crmmeta text-crmmeta-ink">Flow action</span>
                    <span className="st-chip-mono bg-paper text-ink-45">{flow.screens} screens</span>
                    {savedFlow === flow.api && (
                      <span className="st-chip-mono bg-published text-published-ink">saved</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="st-chip-mono bg-paper text-ink-45">{flow.api}</span>
                    <span className="text-[11.5px] text-ink-45">
                      Available to attach from object card actions.
                    </span>
                  </div>
                </div>
                <span className="st-chip-mono bg-published text-published-ink">
                  open-in-Salesforce fallback
                </span>
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_1.25fr]">
                <div className="rounded-[9px] border border-line-soft bg-paper px-3 py-2">
                  <div className="st-section-label">Writes</div>
                  <div className="mt-1 text-[12px] leading-snug text-ink-55">
                    {flow.writesSummary}
                  </div>
                </div>
                <div className="rounded-[9px] border border-line-soft bg-paper px-3 py-2">
                  <div className="st-section-label">Inputs</div>
                  {flow.inputVariables && flow.inputVariables.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {flow.inputVariables.map((input) => (
                        <span
                          key={input.name}
                          className="st-chip-mono bg-surface text-ink-45"
                          title={input.description}
                        >
                          {input.name}
                          {input.required ? " *" : ""}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-1 text-[11.5px] text-ink-45">
                      No variables discovered yet. Actions can still map inputs manually.
                    </div>
                  )}
                </div>
                <div className="rounded-[9px] border border-line-soft bg-paper px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="st-section-label">Render mode</span>
                    <div className="inline-flex overflow-hidden rounded-[8px] border border-line bg-surface">
                      {MODES.map((mode) => (
                        <button
                          key={mode.value}
                          type="button"
                          className={`px-2.5 py-1 text-[11.5px] ${
                            current === mode.value ? "bg-accent text-white" : "text-ink-55"
                          }`}
                          title={mode.note}
                          onClick={() => saveMode(flow.api, mode.value)}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-1.5 text-[11px] text-ink-45">
                    {MODES.find((mode) => mode.value === current)?.note}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
