"use client";
/**
 * Flows (redesigned 2026-07-26; deviation from the original render-mode-only
 * 10c/11d page, per product direction): the org's EXISTING screen flows are
 * the catalog — nothing is authored here. For each flow the admin sees what
 * the in-chat interpreter can do with it (Chat-ready / Partial / Opens in
 * CRM), toggles which object cards expose it, and reviews the automatic
 * input mapping (recordId always flows; name-matched fields map themselves;
 * the flow's own screens collect the rest). Toggling saves to the draft —
 * like every other Studio editor — and goes live at the next publish.
 */
import { useEffect, useMemo, useState } from "react";
import type { FlowRenderMode, FlowRenderModeConfig, FlowSupportReport } from "@cardstack/core";
import { crmDisplayLabel } from "../lib/crm-label";
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

interface QuickActionRow {
  api: string;
  label: string;
  type: string;
  targetObject: string | null;
  support: { level: "full" | "handoff"; note?: string };
  exposed: boolean;
}

interface FlowsResponse {
  flows: FlowRow[];
  modes: FlowRenderModeConfig[];
  objects: string[];
  quickActions?: { object: string; actions: QuickActionRow[] }[];
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
  const [query, setQuery] = useState("");
  const [readiness, setReadiness] = useState<"all" | "ready" | "partial" | "handoff">("all");
  const [showSystem, setShowSystem] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

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

  const toggleQuickAction = async (object: string, action: QuickActionRow, enabled: boolean) => {
    const key = `qa:${action.api}:${object}`;
    setBusyKey(key);
    setNotice(null);
    try {
      const res = await fetch("/api/flows/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowApiName: action.api, object, enabled, kind: "quick_action" }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setLoadError(json.error ?? `Request failed (${res.status}).`);
        return;
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              quickActions: (prev.quickActions ?? []).map((group) =>
                group.object !== object
                  ? group
                  : {
                      ...group,
                      actions: group.actions.map((a) =>
                        a.api === action.api ? { ...a, exposed: enabled } : a,
                      ),
                    },
              ),
            }
          : prev,
      );
      setNotice(
        enabled
          ? `Saved to draft — ${action.label} will show on the ${object} card at the next publish`
          : `Saved to draft — ${action.label} hidden from the ${object} card`,
      );
      setTimeout(() => setNotice(null), 3500);
    } finally {
      setBusyKey(null);
    }
  };

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
          ? `Saved to draft — ${flow.label} will show on the ${object} card at the next publish` +
              (json.mappedInputs && json.mappedInputs.length > 0
                ? ` — auto-mapped: ${json.mappedInputs.join(", ")}`
                : "")
          : `Saved to draft — ${flow.label} hidden from the ${object} card`,
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

  const crmLabel = crmDisplayLabel(data.connection.crm);
  const chatReady = data.flows.filter((f) => f.support?.level === "full").length;
  const normalizedQuery = query.trim().toLowerCase();
  const isSystemFlow = (flow: FlowRow) =>
    /^(approvals workflow:|cms:)|reset password|review flow for activation|verify identity/i.test(
      flow.label,
    );
  const visibleFlows = data.flows.filter((flow) => {
    if (!showSystem && isSystemFlow(flow)) return false;
    if (
      normalizedQuery &&
      !`${flow.label} ${flow.api}`.toLowerCase().includes(normalizedQuery)
    ) {
      return false;
    }
    if (readiness === "ready" && flow.support?.level !== "full") return false;
    if (readiness === "partial" && flow.support?.level !== "partial") return false;
    if (readiness === "handoff" && flow.support?.level !== "handoff" && flow.support !== null) {
      return false;
    }
    return true;
  });

  return (
    <div className="max-w-[1040px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.025em]">Automations</h1>
          <p className="mt-1 max-w-[700px] text-[14px] text-ink-55">
            Choose which CRM flows reps can run from a card. Search first, then configure
            only the automations that belong in chat.
          </p>
        </div>
        <span className="st-chip-mono bg-crmmeta text-crmmeta-ink">{crmLabel}</span>
      </div>

      {notice && (
        <div className="mt-3 rounded-[10px] border border-line-soft bg-published px-4 py-2.5 text-[12px] text-published-ink">
          {notice}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <input
          type="search"
          className="st-input min-w-[260px] flex-1 !px-3 !py-2"
          placeholder="Search flows by name or API…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className="st-input !px-3 !py-2"
          aria-label="Filter by readiness"
          value={readiness}
          onChange={(event) => setReadiness(event.target.value as typeof readiness)}
        >
          <option value="all">All readiness</option>
          <option value="ready">Chat-ready</option>
          <option value="partial">Partial</option>
          <option value="handoff">Opens in CRM</option>
        </select>
        <button type="button" className="st-btn" onClick={() => setShowSystem((value) => !value)}>
          {showSystem ? "Hide platform flows" : "Show platform flows"}
        </button>
      </div>

      <div className="mt-3 text-[12.5px] text-ink-55">
        {data.flows.length} flows · {chatReady} chat-ready · changes save to the draft and go
        live at the next publish.
      </div>

      <div className="st-card mt-3 overflow-hidden">
        <div className="hidden grid-cols-[minmax(240px,1fr)_150px_170px_110px] gap-3 border-b border-line bg-paper px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-55 md:grid">
          <span>Flow</span>
          <span>Readiness</span>
          <span>Available on</span>
          <span className="text-right">Action</span>
        </div>
        {visibleFlows.length === 0 && (
          <div className="st-card px-4 py-5 text-[12.5px] text-ink-55">
            No flows match these filters.
          </div>
        )}

        {visibleFlows.map((flow) => {
          const assignedObjects = new Set(flow.assignedTo.map((a) => a.object));
          const currentMode = modeByFlow.get(flow.api)?.mode ?? "auto";
          const open = expanded === flow.api;
          return (
            <div key={flow.api} className="border-b border-line-soft last:border-b-0">
              <div className="grid items-center gap-3 px-4 py-3 md:grid-cols-[minmax(240px,1fr)_150px_170px_110px]">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold">{flow.label}</div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-ink-45">
                    {flow.api}
                  </div>
                </div>
                <div>
                  <SupportBadge support={flow.support} />
                </div>
                <div className="text-[13px] text-ink-55">
                  {flow.assignedTo.length > 0
                    ? flow.assignedTo.map((item) => item.object).join(", ")
                    : "Not exposed"}
                </div>
                <div className="text-right">
                  <button
                    type="button"
                    className={`st-btn ${open ? "st-btn--primary" : ""}`}
                    aria-expanded={open}
                    onClick={() => setExpanded(open ? null : flow.api)}
                  >
                    {open ? "Close" : "Configure"}
                  </button>
                </div>
              </div>

              {open && (
                <div className="border-t border-line-soft bg-paper px-4 py-4">
                  <div className="grid gap-4 lg:grid-cols-3">
                    <div>
                      <div className="st-section-label">Render mode</div>
                      <div className="mt-2 inline-flex overflow-hidden rounded-[8px] border border-line bg-surface">
                        {MODES.map((mode) => (
                          <button
                            key={mode.value}
                            type="button"
                            className={`px-3 py-1.5 text-[12px] ${
                              currentMode === mode.value ? "bg-accent text-white" : "text-ink-55"
                            }`}
                            onClick={() => saveMode(flow.api, mode.value)}
                          >
                            {mode.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="st-section-label">Available on cards</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {data.objects.map((object) => {
                          const on = assignedObjects.has(object);
                          const busy = busyKey === `${flow.api}:${object}`;
                          return (
                            <button
                              key={object}
                              type="button"
                              disabled={busy}
                              className={`st-btn ${on ? "st-btn--primary" : ""}`}
                              onClick={() => toggleAssignment(flow, object, !on)}
                            >
                              {busy ? "Updating…" : on ? `Remove ${object}` : `Add to ${object}`}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <div className="st-section-label">Inputs</div>
                      <div className="mt-2 text-[13px] text-ink-55">
                        {flow.inputVariables.length > 0
                          ? flow.inputVariables.map((variable) => variable.name).join(", ")
                          : "Record ID is passed automatically."}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(data.quickActions ?? []).some((g) => g.actions.length > 0) && (
        <>
          <div className="mt-8">
            <h2 className="text-[14px] font-semibold">Quick actions</h2>
            <p className="mt-1 text-[12.5px] text-ink-55">
              The CRM&apos;s per-object quick actions. Chat renders the mini-layout with
              record-context defaults; {crmLabel} executes with its own validation.
            </p>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2.5">
            {(data.quickActions ?? []).map((group) => (
              <div key={group.object} className="st-card p-4">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold">{group.object}</span>
                  <span className="st-chip-mono bg-paper text-ink-45">
                    {group.actions.filter((a) => a.support.level === "full").length} chat-ready
                  </span>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {group.actions.map((action) => {
                    const busy = busyKey === `qa:${action.api}:${group.object}`;
                    const renderable = action.support.level === "full";
                    return (
                      <button
                        key={action.api}
                        type="button"
                        disabled={busy || !renderable}
                        className={`rounded-[8px] border px-2.5 py-1 text-[11.5px] ${
                          action.exposed
                            ? "border-accent bg-accent text-white"
                            : renderable
                              ? "border-line bg-surface text-ink-55"
                              : "border-line-soft bg-paper text-ink-45 opacity-60"
                        }`}
                        title={
                          !renderable
                            ? (action.support.note ?? "Not renderable in chat.")
                            : action.exposed
                              ? `Remove ${action.label} from the ${group.object} card`
                              : `Expose ${action.label} on the ${group.object} card` +
                                (action.targetObject ? ` (${action.type} ${action.targetObject})` : "")
                        }
                        onClick={() => toggleQuickAction(group.object, action, !action.exposed)}
                      >
                        {busy ? "…" : action.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
