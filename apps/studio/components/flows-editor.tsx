"use client";
/**
 * Flows (design 10c/11d/11a): synced CRM flows, their render-mode policy, and
 * the custom screens that replace whatever can't render natively.
 *
 * Custom screens used to be their own top-level rail entry, which read as a
 * second unrelated area and let you create screens attached to no flow. They
 * belong here: 10c's "Build screen" fork is the intended entry point, and the
 * flow ladder is the only thing that ever executes a screen.
 * Runtime tools land next; this page is the durable admin contract they read.
 *
 * A render-mode change STAGES as a draft (docs/studio-staging-model.md) — it
 * changes how every rep's flow renders, so it publishes with everything else.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { FlowRenderMode, FlowRenderModeConfig, FlowSummary } from "@cardstack/core";
import { LoadFailed } from "./load-failed";
import { StatusChip, STATUS_FLASH_MS } from "./ui/status-chip";

/**
 * `delivered` is whether the CHAT RUNTIME implements the rung, not whether the
 * policy stores. Studio is the durable admin contract the runtime will read, so
 * an undelivered rung stays selectable — but the card has to say what a rep
 * actually gets today rather than presenting four equal options.
 *
 * Reality check before changing these: `renderMode` reaches the widget payload
 * (core/payload.ts) and no widget reads it, so every mode resolves to handoff.
 * Flip a flag here only when a widget actually branches on it.
 */
const MODES: {
  value: FlowRenderMode;
  label: string;
  note: string;
  delivered: boolean;
}[] = [
  {
    value: "auto",
    label: "Auto",
    note: "Native first, embed when needed, hand off if blocked.",
    delivered: true,
  },
  {
    value: "native",
    label: "Native",
    note: "Only host-native controls; unsupported screens must be mapped.",
    delivered: false,
  },
  {
    value: "embedded",
    label: "Embedded",
    note: "Salesforce renders the screen inside a guarded boundary.",
    delivered: false,
  },
  {
    value: "handoff",
    label: "Handoff",
    note: "Always open in Salesforce and resume from chat.",
    delivered: true,
  },
];

/** What a rep gets TODAY for a chosen mode — the ladder only has one rung. */
function effectiveToday(mode: FlowRenderMode): { text: string; warn: boolean } {
  if (mode === "handoff") {
    return { text: "Reps open the flow in Salesforce and resume in chat.", warn: false };
  }
  if (mode === "auto") {
    return {
      text: "Today Auto has one rung: reps get the open-in-Salesforce handoff. Native and embedded join the ladder as they ship.",
      warn: false,
    };
  }
  return {
    text: `${mode === "native" ? "Native" : "Embedded"} rendering isn't delivered yet — reps get the open-in-Salesforce handoff until it ships. The policy is stored and will take effect then.`,
    warn: true,
  };
}

/** A custom screen, as the Flows page needs to list it. */
export interface ScreenSummary {
  id: string;
  label: string;
  flowApiName: string | null;
  replacesComponent: string | null;
  hasDraft: boolean;
  publishedRevision: number | null;
}

interface FlowsResponse {
  flows: FlowSummary[];
  modes: FlowRenderModeConfig[];
  /** Flow api names with an unpublished draft policy. */
  staged?: string[];
  /** Custom screens, grouped onto their flow below. */
  screens?: ScreenSummary[];
  connection: { status: "connected" | "disconnected"; crm: "hubspot" | "salesforce"; live?: boolean };
  error?: string;
}

export function FlowsEditor() {
  const router = useRouter();
  const [data, setData] = useState<FlowsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savedFlow, setSavedFlow] = useState<string | null>(null);
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
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

  const screensByFlow = useMemo(() => {
    const map = new Map<string, ScreenSummary[]>();
    for (const screen of data?.screens ?? []) {
      if (!screen.flowApiName) continue;
      map.set(screen.flowApiName, [...(map.get(screen.flowApiName) ?? []), screen]);
    }
    return map;
  }, [data]);

  /**
   * Screens written before custom screens became flow-scoped. Nothing can
   * render them, so they're surfaced rather than hidden — an orphan you can't
   * see is one you can't fix.
   */
  const unattachedScreens = (data?.screens ?? []).filter((screen) => !screen.flowApiName);

  const buildScreen = async (flowApiName: string, flowLabel: string) => {
    setCreatingFor(flowApiName);
    try {
      const res = await fetch("/api/custom-screens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowApiName, label: `${flowLabel} screen` }),
      });
      const json = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !json.id) {
        setLoadError(json.error ?? `Request failed (${res.status}).`);
        return;
      }
      router.push(`/custom-screens/${json.id}`);
    } finally {
      setCreatingFor(null);
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
            modes: [
              ...prev.modes.filter((m) => m.flowApiName !== flowApiName),
              json.mode!,
            ],
          }
        : prev,
    );
    setSavedFlow(flowApiName);
    setTimeout(() => setSavedFlow(null), STATUS_FLASH_MS);
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
                    {(savedFlow === flow.api || data.staged?.includes(flow.api)) && (
                      <StatusChip status="staged" />
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
                            current === mode.value
                              ? "bg-accent text-white"
                              : mode.delivered
                                ? "text-ink-55"
                                : "text-ink-45"
                          }`}
                          title={
                            mode.delivered
                              ? mode.note
                              : `${mode.note} — not delivered yet; reps get the handoff until it ships.`
                          }
                          onClick={() => saveMode(flow.api, mode.value)}
                        >
                          {mode.label}
                          {!mode.delivered && (
                            <span
                              aria-label="not delivered yet"
                              className={`ml-1 ${current === mode.value ? "text-white/70" : "text-warn-dot"}`}
                            >
                              •
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-1.5 text-[11px] text-ink-45">
                    {MODES.find((mode) => mode.value === current)?.note}
                  </div>
                  {/* What a rep gets today, for the mode actually selected —
                      the banner above says the ladder is one rung; this says
                      it per flow, where the choice is being made. */}
                  <div
                    className={`mt-1.5 text-[11px] leading-snug ${
                      effectiveToday(current).warn ? "text-draft-ink" : "text-ink-45"
                    }`}
                  >
                    <span className="font-semibold">Today: </span>
                    {effectiveToday(current).text}
                  </div>
                </div>
              </div>

              {/* Custom screens live with their flow (design 10c's "Build
                  screen" fork) — a screen only ever runs through this ladder. */}
              <div className="mt-3 border-t border-line-soft pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="st-section-label">Custom screens</span>
                  <button
                    type="button"
                    className="st-btn !py-1 text-[11.5px]"
                    disabled={creatingFor !== null}
                    onClick={() => void buildScreen(flow.api, flow.label)}
                  >
                    {creatingFor === flow.api ? "Creating…" : "+ Build screen"}
                  </button>
                </div>
                {(screensByFlow.get(flow.api)?.length ?? 0) === 0 ? (
                  <p className="mt-1.5 text-[11.5px] text-ink-45">
                    None yet. Build one when a screen in this flow can&apos;t render natively in
                    chat — a custom Lightning component, say.
                  </p>
                ) : (
                  <div className="mt-2 space-y-1">
                    {screensByFlow.get(flow.api)!.map((screen) => (
                      <Link
                        key={screen.id}
                        href={`/custom-screens/${screen.id}`}
                        className="flex flex-wrap items-center gap-1.5 rounded-[8px] px-2 py-1.5 text-[12px] hover:bg-paper"
                      >
                        <span className="font-medium">{screen.label}</span>
                        {screen.replacesComponent && (
                          <span className="st-chip-mono bg-paper text-ink-45">
                            {screen.replacesComponent}
                          </span>
                        )}
                        {screen.hasDraft && <StatusChip status="staged" />}
                        {screen.publishedRevision !== null && (
                          <span className="st-chip-mono bg-published text-published-ink">
                            v{screen.publishedRevision}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {unattachedScreens.length > 0 && (
          <div className="st-card border-warn-dot/40 p-4">
            <div className="flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-warn-dot" />
              <span className="text-[13px] font-semibold">Screens with no flow</span>
            </div>
            <p className="mt-1 text-[12px] text-ink-55">
              Built before screens were scoped to a flow. Nothing renders them until each one
              picks its flow — open a screen to attach it.
            </p>
            <div className="mt-2 space-y-1">
              {unattachedScreens.map((screen) => (
                <Link
                  key={screen.id}
                  href={`/custom-screens/${screen.id}`}
                  className="flex items-center gap-1.5 rounded-[8px] px-2 py-1.5 text-[12px] hover:bg-paper"
                >
                  <span className="font-medium">{screen.label}</span>
                  <span className="st-chip-mono bg-draft text-draft-ink">needs a flow</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
