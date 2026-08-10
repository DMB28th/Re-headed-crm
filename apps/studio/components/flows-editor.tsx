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
import { IN_CHAT_RENDER_MODES } from "@cardstack/core";
import type { FlowRenderMode, FlowRenderModeConfig, FlowSummary } from "@cardstack/core";
import { LoadFailed } from "./load-failed";
import { StatusChip, STATUS_FLASH_MS } from "./ui/status-chip";

/**
 * The modes Studio offers. All THREE render inside the chat card — handing a
 * rep off to a Salesforce browser tab is not a render mode an admin should be
 * choosing (2026-08-10c). `handoff` survives in the zod enum only so configs
 * written earlier still parse; it is deliberately absent here.
 *
 * `delivered` is whether the CHAT RUNTIME implements the rung, not whether the
 * policy stores. Reality check before flipping one: the flow-run widget's only
 * action today is host.openLink(launchUrl), so nothing renders in-card yet.
 */
const MODES: {
  value: (typeof IN_CHAT_RENDER_MODES)[number];
  label: string;
  note: string;
  delivered: boolean;
}[] = [
  {
    value: "auto",
    label: "Auto",
    note: "Host-native controls where possible, guarded embed where not.",
    delivered: false,
  },
  {
    value: "native",
    label: "Native only",
    note: "Host-native controls only; screens that can't map need a custom screen.",
    delivered: false,
  },
  {
    value: "embedded",
    label: "Embedded",
    note: "Salesforce renders the screen inside a guarded boundary in the card.",
    delivered: false,
  },
];

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

  const savePolicy = async (
    flowApiName: string,
    patch: { mode?: FlowRenderMode; active?: boolean },
  ) => {
    const existing = modeByFlow.get(flowApiName);
    const res = await fetch("/api/flows", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flowApiName,
        mode: patch.mode ?? existing?.mode ?? "auto",
        active: patch.active ?? existing?.active ?? false,
      }),
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
            Synced from the CRM. Switch on the flows reps should be able to run from chat, and
            choose how each one renders in the card. The CRM still owns branching and writes.
          </p>
        </div>
        <span className="st-chip-mono bg-crmmeta text-crmmeta-ink">{crmLabel}</span>
      </div>

      <div className="mt-5 rounded-[10px] border-l-[3px] border-warn-dot bg-draft px-4 py-3 text-[12px] leading-snug text-draft-ink">
        <span className="font-semibold">In-chat rendering isn&apos;t built yet.</span> A flow you
        switch on today still finishes by opening {crmLabel} in a browser tab — the in-card
        rendering these modes describe ships with the flow runtime. Switch a flow on only if that
        hand-off is acceptable for it in the meantime.
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
          const active = saved?.active ?? false;
          return (
            <div
              key={flow.api}
              className={`st-card p-4 ${active ? "" : "bg-paper/60"}`}
            >
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
                      {active
                        ? "Reps can run this from a card action."
                        : "Off — reps can't run this from chat."}
                    </span>
                  </div>
                </div>
                {/* The real gate: crm_flow_start refuses a flow that is off,
                    so this is a switch and not a label. */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={active}
                  aria-label={`${active ? "Switch off" : "Switch on"} ${flow.label} for chat`}
                  className={`flex shrink-0 items-center gap-2 rounded-[999px] border px-2.5 py-1 text-[11.5px] transition-colors ${
                    active
                      ? "border-published-ink/30 bg-published text-published-ink"
                      : "border-line bg-surface text-ink-45 hover:text-ink"
                  }`}
                  onClick={() => void savePolicy(flow.api, { active: !active })}
                >
                  <span
                    className={`inline-block h-3 w-6 rounded-full transition-colors ${
                      active ? "bg-success-dot" : "bg-line"
                    }`}
                  >
                    <span
                      className={`mt-[2px] block h-2 w-2 rounded-full bg-white transition-transform ${
                        active ? "translate-x-[16px]" : "translate-x-[4px]"
                      }`}
                    />
                  </span>
                  {active ? "Active" : "Off"}
                </button>
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
                  <label className="block text-[11px] text-ink-55">
                    <span className="st-section-label">Renders as</span>
                    <select
                      className="st-input mt-1.5 w-full"
                      value={current}
                      disabled={!active}
                      title={
                        active
                          ? undefined
                          : "Switch the flow on to choose how it renders."
                      }
                      onChange={(e) =>
                        void savePolicy(flow.api, { mode: e.target.value as FlowRenderMode })
                      }
                    >
                      {MODES.map((mode) => (
                        <option key={mode.value} value={mode.value}>
                          {mode.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="mt-1.5 text-[11px] leading-snug text-ink-45">
                    {MODES.find((mode) => mode.value === current)?.note}
                  </div>
                  {active && (
                    // The banner says in-card rendering isn't built; this says
                    // it where the consequence lands, on a flow that is ON.
                    <div className="mt-1.5 text-[11px] leading-snug text-draft-ink">
                      <span className="font-semibold">Today: </span>
                      reps still finish this flow in a {crmLabel} tab until in-card rendering
                      ships.
                    </div>
                  )}
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
