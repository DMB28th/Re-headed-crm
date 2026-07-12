"use client";
/**
 * Lists (design 5a + feedback 2026-07-11): two sources, one exposure model.
 * - CRM saved views sync read-only — filters are managed in the CRM.
 * - Cardstack lists are admin-defined HERE (name + filters) and run through
 *   the adapter's search. Both expose/alias/default the same way.
 */
import { useEffect, useState } from "react";
import {
  summarizeCustomFilters,
  VALUELESS_LIST_OPS,
  type CustomList,
  type CustomListFilter,
  type FilterLabels,
  type ObjectDescribe,
  type SavedView,
  type ViewExposure,
  type ViewExposuresConfig,
} from "@cardstack/core";
import { LoadFailed } from "./load-failed";

const OPS: { value: CustomListFilter["op"]; label: string }[] = [
  { value: "eq", label: "is" },
  { value: "neq", label: "is not" },
  { value: "contains", label: "contains" },
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
  { value: "is_empty", label: "is empty" },
  { value: "not_empty", label: "is not empty" },
];

export function ViewsEditor({ object }: { object: string }) {
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [describe, setDescribe] = useState<ObjectDescribe | null>(null);
  const [exposures, setExposures] = useState<ViewExposuresConfig | null>(null);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    (async () => {
      setLoadError(null);
      try {
        const res = await fetch(`/api/views/${object}`);
        const data = (await res.json()) as {
          savedViews: SavedView[];
          exposures: ViewExposuresConfig;
          describe: ObjectDescribe;
          error?: string;
        };
        if (!res.ok || data.error) {
          setLoadError(data.error ?? `Request failed (${res.status}).`);
          return;
        }
        setSavedViews(data.savedViews);
        setExposures(data.exposures);
        setDescribe(data.describe);
      } catch (error) {
        setLoadError(String(error));
      }
    })();
  }, [object, reloadKey]);

  const save = async (next: ViewExposuresConfig) => {
    setExposures(next);
    await fetch(`/api/views/${object}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  if (loadError) {
    return <LoadFailed error={loadError} onRetry={() => setReloadKey((k) => k + 1)} />;
  }
  if (!exposures || !describe) return <div className="text-[12.5px] text-ink-45">Loading…</div>;

  const exposureFor = (viewId: string): ViewExposure =>
    exposures.views.find((v) => v.viewId === viewId) ?? {
      viewId,
      exposed: false,
      aliases: [],
      isDefault: false,
    };

  const updateView = (viewId: string, patch: Partial<ViewExposure>) => {
    const others = exposures.views.filter((v) => v.viewId !== viewId);
    let views = [...others, { ...exposureFor(viewId), ...patch }];
    if (patch.isDefault) {
      views = views.map((v) => (v.viewId === viewId ? v : { ...v, isDefault: false }));
    }
    void save({ ...exposures, views });
  };

  const labelOf = (api: string) => describe.fields.find((f) => f.api === api)?.label ?? api;

  // Field + picklist labels so summaries read "Deal Stage is Closed won", not
  // "dealstage eq 2540864".
  const filterLabels: FilterLabels = Object.fromEntries(
    describe.fields.map((f) => [
      f.api,
      { label: f.label, ...(f.valueLabels ? { valueLabels: f.valueLabels } : {}) },
    ]),
  );

  const summarize = (list: CustomList): string =>
    summarizeCustomFilters({ ...list, filterSummary: undefined }, filterLabels);

  const updateCustomList = (id: string, patch: Partial<CustomList>) => {
    const customLists = exposures.customLists.map((list) => {
      if (list.id !== id) return list;
      const next = { ...list, ...patch };
      return { ...next, filterSummary: summarize(next) };
    });
    void save({ ...exposures, customLists });
  };

  const addCustomList = () => {
    const id = `cl-${Date.now().toString(36)}`;
    const list: CustomList = {
      id,
      name: "New list",
      filters: [],
      filterSummary: "All records",
    };
    setEditing(id);
    void save({
      ...exposures,
      customLists: [...exposures.customLists, list],
      views: [...exposures.views, { viewId: id, exposed: true, aliases: [], isDefault: false }],
    });
  };

  const deleteCustomList = (id: string) => {
    setEditing((e) => (e === id ? null : e));
    void save({
      ...exposures,
      customLists: exposures.customLists.filter((l) => l.id !== id),
      views: exposures.views.filter((v) => v.viewId !== id),
    });
  };

  const exposureRowControls = (viewId: string) => {
    const exposure = exposureFor(viewId);
    return {
      exposure,
      aliasInput: (
        <input
          className="st-input text-[11.5px]"
          placeholder="my deals, open deals…"
          defaultValue={exposure.aliases.join(", ")}
          onBlur={(e) =>
            updateView(viewId, {
              aliases: e.target.value
                .split(",")
                .map((a) => a.trim())
                .filter(Boolean),
            })
          }
        />
      ),
      toggle: (
        <button
          type="button"
          role="switch"
          aria-checked={exposure.exposed}
          onClick={() => updateView(viewId, { exposed: !exposure.exposed })}
          className={`h-5 w-9 rounded-full transition-colors ${exposure.exposed ? "bg-accent" : "bg-line"}`}
        >
          <span
            className={`block h-4 w-4 rounded-full bg-white transition-transform ${exposure.exposed ? "translate-x-4" : "translate-x-0.5"}`}
          />
        </button>
      ),
      defaultChip: exposure.isDefault ? (
        <span className="st-chip-mono bg-published text-published-ink">default</span>
      ) : (
        exposure.exposed && (
          <button
            type="button"
            className="text-[10.5px] text-ink-45 underline"
            onClick={() => updateView(viewId, { isDefault: true })}
          >
            make default
          </button>
        )
      ),
    };
  };

  return (
    <div className="max-w-[820px]">
      <div className="flex items-center justify-between">
        <h1 className="text-[16px] font-semibold capitalize">{object} · Lists</h1>
        <span className="text-[11.5px] text-ink-45">{saved ? "Saved" : " "}</span>
      </div>
      <p className="mt-1 text-[12.5px] text-ink-55">
        Two sources: saved views sync from the CRM (filters managed there), and Cardstack lists
        you define right here. Both decide what chat can see and what phrases reach them.
        Changes apply on the next ask (no publish step).
      </p>

      <h2 className="st-section-label mt-6">Synced from the CRM</h2>
      <div className="st-card mt-2 overflow-hidden">
        <div className="grid grid-cols-[1.4fr_1.6fr_1.6fr_auto] gap-3 border-b border-line-soft px-4 py-2">
          {["View", "Filters (from CRM)", "Ask Claude with", "Exposed"].map((h) => (
            <span key={h} className="st-section-label">
              {h}
            </span>
          ))}
        </div>
        {savedViews.length === 0 && (
          <div className="px-4 py-3 text-[12.5px] text-ink-45">
            No CRM lists for this object. HubSpot <strong>Lists</strong> (Contacts ▸ Lists, plus
            company/deal lists) import here automatically when the token has the{" "}
            <code className="st-chip-mono bg-paper">crm.lists.read</code> scope — Connections shows a
            note if it's missing. The object-table “saved views” aren't in HubSpot's public API;
            recreate those as Cardstack lists below.
          </div>
        )}
        {savedViews.map((view) => {
          const { aliasInput, toggle, defaultChip } = exposureRowControls(view.id);
          return (
            <div
              key={view.id}
              className="grid grid-cols-[1.4fr_1.6fr_1.6fr_auto] items-center gap-3 border-b border-line-soft px-4 py-2.5 last:border-b-0"
            >
              <span className="text-[12.5px]">
                <span className="font-medium">{view.name}</span>
                <span className="mt-0.5 flex items-center gap-1.5">
                  {view.visibility === "private" && (
                    <span className="st-chip-mono bg-paper text-ink-45">private</span>
                  )}
                  {defaultChip}
                </span>
              </span>
              <span className="text-[11.5px] text-ink-55">{view.filterSummary}</span>
              {aliasInput}
              {toggle}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="st-section-label">Cardstack lists</h2>
        <button type="button" className="st-btn" onClick={addCustomList}>
          + New list
        </button>
      </div>
      <div className="st-card mt-2 overflow-hidden">
        {exposures.customLists.length === 0 && (
          <div className="px-4 py-3 text-[12.5px] text-ink-45">
            None yet — Cardstack lists are filters you define here, without touching the CRM.
          </div>
        )}
        {exposures.customLists.map((list) => {
          const { aliasInput, toggle, defaultChip } = exposureRowControls(list.id);
          const isEditing = editing === list.id;
          return (
            <div key={list.id} className="border-b border-line-soft last:border-b-0">
              <div className="grid grid-cols-[1.4fr_1.6fr_1.6fr_auto] items-center gap-3 px-4 py-2.5">
                <span className="text-[12.5px]">
                  {isEditing ? (
                    <input
                      className="st-input w-full py-1 text-[12.5px] font-medium"
                      value={list.name}
                      onChange={(e) => updateCustomList(list.id, { name: e.target.value })}
                    />
                  ) : (
                    <span className="font-medium">{list.name}</span>
                  )}
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <span className="st-chip-mono bg-crmmeta text-crmmeta-ink">Cardstack</span>
                    {defaultChip}
                  </span>
                </span>
                <span className="text-[11.5px] text-ink-55">
                  {summarize(list)}
                  <button
                    type="button"
                    className="ml-2 text-[10.5px] text-ink-45 underline"
                    onClick={() => setEditing(isEditing ? null : list.id)}
                  >
                    {isEditing ? "done" : "edit"}
                  </button>
                  {deleteConfirm === list.id ? (
                    <>
                      <button
                        type="button"
                        className="ml-2 text-[10.5px] text-drift-ink underline"
                        onClick={() => {
                          deleteCustomList(list.id);
                          setDeleteConfirm(null);
                        }}
                      >
                        {(() => {
                          const ex = exposureFor(list.id);
                          return ex.isDefault
                            ? "delete — reps' default ask breaks"
                            : ex.aliases.length > 0
                              ? `delete — "${ex.aliases[0]}" stops resolving`
                              : "confirm delete";
                        })()}
                      </button>
                      <button
                        type="button"
                        className="ml-1.5 text-[10.5px] text-ink-45 underline"
                        onClick={() => setDeleteConfirm(null)}
                      >
                        cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="ml-2 text-[10.5px] text-drift-ink underline"
                      onClick={() => setDeleteConfirm(list.id)}
                    >
                      delete
                    </button>
                  )}
                </span>
                {aliasInput}
                {toggle}
              </div>
              {isEditing && (
                <FilterEditor
                  describe={describe}
                  filters={list.filters}
                  onChange={(filters) => updateCustomList(list.id, { filters })}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Filter rows: field / op / value. Values type by the field's describe. */
function FilterEditor({
  describe,
  filters,
  onChange,
}: {
  describe: ObjectDescribe;
  filters: CustomListFilter[];
  onChange: (filters: CustomListFilter[]) => void;
}) {
  const fieldMeta = (api: string) => describe.fields.find((f) => f.api === api);

  const update = (i: number, patch: Partial<CustomListFilter>) =>
    onChange(filters.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  const valueInput = (filter: CustomListFilter, i: number) => {
    // is_empty / not_empty take no operand.
    if (VALUELESS_LIST_OPS.includes(filter.op)) return null;
    const meta = fieldMeta(filter.field);
    if (meta?.values) {
      return (
        <select
          className="st-input py-1 text-[11.5px]"
          value={String(filter.value ?? "")}
          onChange={(e) => update(i, { value: e.target.value })}
        >
          <option value="">—</option>
          {meta.values.map((v) => (
            <option key={v} value={v}>
              {meta.valueLabels?.[v] ?? v}
            </option>
          ))}
        </select>
      );
    }
    const numeric = meta?.type === "number" || meta?.type === "currency";
    return (
      <input
        className="st-input w-[140px] py-1 text-[11.5px]"
        type={numeric ? "number" : "text"}
        placeholder={meta?.type === "date" ? "YYYY-MM-DD" : "value"}
        defaultValue={filter.value === null ? "" : String(filter.value)}
        onBlur={(e) =>
          update(i, { value: numeric ? Number(e.target.value) : e.target.value })
        }
      />
    );
  };

  return (
    <div className="space-y-2 border-t border-line-soft bg-paper px-4 py-3">
      {filters.map((filter, i) => (
        <div key={i} className="flex items-center gap-2">
          <select
            className="st-input py-1 text-[11.5px]"
            value={filter.field}
            onChange={(e) => update(i, { field: e.target.value, value: "" })}
          >
            {describe.fields.map((f) => (
              <option key={f.api} value={f.api}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            className="st-input py-1 text-[11.5px]"
            value={filter.op}
            onChange={(e) => {
              const op = e.target.value as CustomListFilter["op"];
              // Emptiness ops carry no value; clear it so we never ship EQ "".
              update(i, VALUELESS_LIST_OPS.includes(op) ? { op, value: undefined } : { op });
            }}
          >
            {OPS.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
          {valueInput(filter, i)}
          <button
            type="button"
            className="text-ink-45 hover:text-drift-ink"
            aria-label="Remove filter"
            onClick={() => onChange(filters.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="rounded-[8px] border border-dashed border-line px-2.5 py-1 text-[11.5px] text-ink-45 hover:text-ink"
        onClick={() =>
          onChange([
            ...filters,
            { field: describe.fields[0]!.api, op: "eq", value: "" },
          ])
        }
      >
        + Add filter
      </button>
      <span className="ml-3 text-[11px] text-ink-45">Filters are ANDed · applied on the next ask</span>
    </div>
  );
}
