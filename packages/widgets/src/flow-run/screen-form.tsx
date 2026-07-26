/**
 * Native-rung interview form (design 10a). Renders one flow screen's fields —
 * display text, scalar inputs (incl. toggle/email/phone/url styles), text
 * area, radio / dropdown / multiselect choices, sliders, name/address
 * composites, sections, data tables — collects values locally, evaluates
 * same-screen visibility rules live, and advances the interview via
 * crm_flow_continue. The server owns all logic; this form only displays what
 * the payload permits and echoes the opaque interviewState token back.
 */
import { useEffect, useMemo, useState } from "react";
import type {
  FlowRenderField,
  FlowRenderScreen,
  FlowRunPayload,
  FlowVisibilityRule,
} from "@cardstack/core";
import type { WidgetHost } from "../record-card/card.tsx";

type FormValue = string | number | boolean | string[] | null;
type Values = Record<string, FormValue>;

function walkFields(fields: FlowRenderField[], visit: (f: FlowRenderField) => void): void {
  for (const f of fields) {
    visit(f);
    if (f.kind === "section") walkFields(f.fields, visit);
  }
}

function initialValues(screen: FlowRenderScreen): Values {
  const values: Values = {};
  walkFields(screen.fields, (f) => {
    if (f.kind === "input") {
      values[f.name] = f.dataType === "Boolean" ? f.defaultValue === true : (f.defaultValue ?? null);
    } else if (f.kind === "textarea") {
      values[f.name] = f.defaultValue ?? null;
    } else if (f.kind === "choice") {
      values[f.name] =
        f.style === "multiselect"
          ? f.defaultValue
            ? String(f.defaultValue).split(",").map((s) => s.trim()).filter(Boolean)
            : []
          : (f.defaultValue ?? null);
    } else if (f.kind === "slider") {
      values[f.name] = f.defaultValue;
    } else if (f.kind === "composite") {
      for (const sub of f.inputs) values[`${f.name}.${sub.key}`] = null;
    } else if (f.kind === "datatable") {
      values[f.name] = [];
    }
  });
  return values;
}

/** Same-screen visibility, evaluated live as the rep types. */
function visible(rule: FlowVisibilityRule | undefined, values: Values): boolean {
  if (!rule || rule.conditions.length === 0) return true;
  const results = rule.conditions.map((c) => {
    const raw = values[c.ref.split(".")[0] ?? c.ref] ?? values[c.ref] ?? null;
    const l = Array.isArray(raw) ? raw.join(", ") : raw;
    const r = c.value;
    switch (c.operator) {
      case "EqualTo":
        return String(l ?? "") === String(r ?? "") || (l === true && r === true) || (l === false && r === false);
      case "NotEqualTo":
        return String(l ?? "") !== String(r ?? "");
      case "GreaterThan":
        return Number(l) > Number(r);
      case "GreaterThanOrEqualTo":
        return Number(l) >= Number(r);
      case "LessThan":
        return Number(l) < Number(r);
      case "LessThanOrEqualTo":
        return Number(l) <= Number(r);
      case "Contains":
        return String(l ?? "").includes(String(r ?? ""));
      case "IsNull":
        return r === true ? l == null || l === "" : !(l == null || l === "");
      default:
        return true; // unknown operator — show the field rather than hide it
    }
  });
  return rule.logic === "or" ? results.some(Boolean) : results.every(Boolean);
}

function inputType(dataType: string, style?: string): string {
  if (style === "email") return "email";
  if (style === "phone") return "tel";
  if (style === "url") return "url";
  switch (dataType) {
    case "Number":
    case "Currency":
      return "number";
    case "Date":
      return "date";
    case "DateTime":
      return "datetime-local";
    default:
      return "text";
  }
}

function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <span className="fr-field-label">
      {text}
      {required ? <span className="fr-req"> *</span> : null}
    </span>
  );
}

function FieldControl({
  field,
  values,
  onChange,
}: {
  field: FlowRenderField;
  values: Values;
  onChange: (name: string, v: FormValue) => void;
}) {
  if (!visible(field.visibility, values)) return null;
  const value = values[field.name] ?? null;
  const error = field.error ? <div className="fr-error">{field.error}</div> : null;

  if (field.kind === "section") {
    return (
      <fieldset className="fr-section-group">
        {field.label ? <legend className="fr-label">{field.label}</legend> : null}
        <div className="fr-fields">
          {field.fields.map((f) => (
            <FieldControl key={f.name} field={f} values={values} onChange={onChange} />
          ))}
        </div>
      </fieldset>
    );
  }
  if (field.kind === "display") {
    // Server-sanitized display text (rule 2: the iframe only sees permitted content).
    return <div className="fr-display" dangerouslySetInnerHTML={{ __html: field.html }} />;
  }
  if (field.kind === "input" && field.dataType === "Boolean") {
    return (
      <div className="fr-field">
        <label className={field.inputStyle === "toggle" ? "fr-check fr-toggle" : "fr-check"}>
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(field.name, e.target.checked)}
          />
          <span>{field.label}</span>
        </label>
        {error}
      </div>
    );
  }
  if (field.kind === "input") {
    return (
      <label className="fr-field">
        <Label text={field.label} required={field.required} />
        <input
          className="fr-text-input"
          type={inputType(field.dataType, field.inputStyle)}
          step={field.dataType === "Currency" ? "0.01" : undefined}
          value={value === null || value === undefined || value === false ? "" : String(value)}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") return onChange(field.name, null);
            onChange(
              field.name,
              field.dataType === "Number" || field.dataType === "Currency" ? Number(raw) : raw,
            );
          }}
        />
        {error}
      </label>
    );
  }
  if (field.kind === "textarea") {
    return (
      <label className="fr-field">
        <Label text={field.label} required={field.required} />
        <textarea
          className="fr-textarea"
          rows={3}
          value={value === null ? "" : String(value)}
          onChange={(e) => onChange(field.name, e.target.value === "" ? null : e.target.value)}
        />
        {error}
      </label>
    );
  }
  if (field.kind === "slider") {
    const current = typeof value === "number" ? value : field.defaultValue;
    return (
      <label className="fr-field">
        <Label text={`${field.label} — ${current}`} />
        <input
          type="range"
          min={field.min}
          max={field.max}
          step={field.step}
          value={current}
          onChange={(e) => onChange(field.name, Number(e.target.value))}
        />
        {error}
      </label>
    );
  }
  if (field.kind === "composite") {
    return (
      <div className="fr-field">
        <Label text={field.label} />
        <div className="fr-composite">
          {field.inputs.map((sub) => {
            const key = `${field.name}.${sub.key}`;
            const subValue = values[key] ?? null;
            return (
              <label className="fr-field" key={sub.key}>
                <span className="fr-field-sublabel">{sub.label}</span>
                <input
                  className="fr-text-input"
                  type="text"
                  value={subValue === null ? "" : String(subValue)}
                  onChange={(e) => onChange(key, e.target.value === "" ? null : e.target.value)}
                />
              </label>
            );
          })}
        </div>
        {error}
      </div>
    );
  }
  if (field.kind === "choice" && field.style === "radio") {
    return (
      <fieldset className="fr-field fr-choices">
        <legend className="fr-field-label">
          {field.label}
          {field.required ? <span className="fr-req"> *</span> : null}
        </legend>
        {field.options.map((o) => (
          <label className="fr-check" key={o.value}>
            <input
              type="radio"
              name={field.name}
              checked={value === o.value}
              onChange={() => onChange(field.name, o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
        {error}
      </fieldset>
    );
  }
  if (field.kind === "choice" && field.style === "multiselect") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <fieldset className="fr-field fr-choices">
        <legend className="fr-field-label">
          {field.label}
          {field.required ? <span className="fr-req"> *</span> : null}
        </legend>
        {field.options.map((o) => (
          <label className="fr-check" key={o.value}>
            <input
              type="checkbox"
              checked={selected.includes(o.value)}
              onChange={(e) =>
                onChange(
                  field.name,
                  e.target.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value),
                )
              }
            />
            <span>{o.label}</span>
          </label>
        ))}
        {error}
      </fieldset>
    );
  }
  if (field.kind === "choice") {
    return (
      <label className="fr-field">
        <Label text={field.label} required={field.required} />
        <select
          className="fr-select"
          value={value === null ? "" : String(value)}
          onChange={(e) => onChange(field.name, e.target.value === "" ? null : e.target.value)}
        >
          <option value="">— None —</option>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {error}
      </label>
    );
  }
  if (field.kind === "datatable") {
    const selected = Array.isArray(value) ? value : [];
    const toggle = (id: string, checked: boolean) => {
      if (field.selectionMode === "single") return onChange(field.name, checked ? [id] : []);
      if (checked && selected.length >= field.maxSelection) return;
      onChange(field.name, checked ? [...selected, id] : selected.filter((v) => v !== id));
    };
    return (
      <div className="fr-field">
        <Label text={field.label} required={field.required} />
        <div className="fr-table-wrap">
          <table className="fr-table">
            <thead>
              <tr>
                {field.selectionMode !== "none" && <th className="fr-table-sel" />}
                {field.columns.map((c) => (
                  <th key={c.api}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {field.rows.length === 0 ? (
                <tr>
                  <td
                    className="fr-table-empty"
                    colSpan={field.columns.length + (field.selectionMode !== "none" ? 1 : 0)}
                  >
                    No rows.
                  </td>
                </tr>
              ) : (
                field.rows.map((r) => (
                  <tr key={r.id}>
                    {field.selectionMode !== "none" && (
                      <td className="fr-table-sel">
                        <input
                          type={field.selectionMode === "single" ? "radio" : "checkbox"}
                          name={field.name}
                          checked={selected.includes(r.id)}
                          onChange={(e) => toggle(r.id, e.target.checked)}
                        />
                      </td>
                    )}
                    {field.columns.map((c) => (
                      <td key={c.api}>{r.cells[c.api] === null ? "—" : String(r.cells[c.api])}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {error}
      </div>
    );
  }
  return (
    <div className="fr-field fr-unsupported">
      <Label text={field.label} />
      <span className="cs-muted">
        {field.note} Use the CRM link below if this field matters.
      </span>
    </div>
  );
}

export function FlowScreenForm({
  payload,
  host,
  onPayload,
}: {
  payload: FlowRunPayload;
  host: WidgetHost | null;
  onPayload: (next: FlowRunPayload) => void;
}) {
  const screen = payload.screen ?? null;
  const [values, setValues] = useState<Values>(() => (screen ? initialValues(screen) : {}));
  const [busy, setBusy] = useState<null | "next" | "back" | "confirm" | "cancel">(null);
  const [error, setError] = useState<string | null>(null);
  const screenKey = screen ? `${screen.name}:${screen.stepIndex}` : "";
  useEffect(() => {
    if (screen) setValues(initialValues(screen));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenKey]);

  const requiredMissing = useMemo(() => {
    if (!screen) return false;
    let missing = false;
    walkFields(screen.fields, (f) => {
      if (missing || !("required" in f) || !f.required) return;
      if (!visible(f.visibility, values)) return;
      if (f.kind === "input" && f.dataType === "Boolean") return;
      const v = values[f.name];
      if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) {
        missing = true;
      }
    });
    return missing;
  }, [screen, values]);

  const call = async (
    kind: "next" | "back" | "confirm" | "cancel",
    extra: Record<string, unknown>,
  ) => {
    if (!host) return;
    setBusy(kind);
    setError(null);
    try {
      const result = await host.callTool("crm_flow_continue", {
        ...(payload.object ? { object: payload.object } : {}),
        recordId: payload.recordId ?? "",
        flowApiName: payload.flowApiName,
        actionSessionId: payload.actionSessionId,
        interviewState: payload.interviewState ?? "",
        answers: {},
        ...extra,
      });
      const next = result?.structuredContent as FlowRunPayload | undefined;
      if (next?.kind === "flow-run") {
        onPayload(next);
        if (next.status === "finished" && next.finishedSummary) {
          host.updateModelContext(next.finishedSummary);
        }
      } else {
        setError("The flow didn't return a next step — try again.");
      }
    } catch {
      setError("Couldn't reach the flow — try again.");
    } finally {
      setBusy(null);
    }
  };

  if (payload.status === "finished") {
    return (
      <section className="fr-section">
        <div className={payload.finishedFailed ? "fr-finished fr-failed" : "fr-finished"}>
          {payload.finishedFailed ? "⚠️" : "✅"} {payload.finishedSummary ?? "Flow finished."}
        </div>
      </section>
    );
  }

  if (payload.status === "confirm-write" && payload.pendingWrite) {
    const w = payload.pendingWrite;
    const verb = w.kind === "create" ? "Create" : w.kind === "update" ? "Update" : "Delete";
    return (
      <section className="fr-section">
        <h2 className="fr-label">Confirm before anything is written</h2>
        <div className="fr-write">
          <div className="fr-write-title">{w.description}</div>
          {w.targetIds.length > 0 && (
            <div className="cs-muted fr-write-targets">
              {w.targetIds.length} record{w.targetIds.length === 1 ? "" : "s"} affected
            </div>
          )}
          {w.assignments.length > 0 && (
            <dl className="fr-inputs">
              {w.assignments.map((a) => (
                <div className="fr-input" key={a.field}>
                  <dt className="fr-input-name">{a.field}</dt>
                  <dd className="fr-input-value">
                    {a.value === null || a.value === "" ? "—" : String(a.value)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <div className="fr-actions">
            <button
              type="button"
              className="fr-launch"
              disabled={busy !== null}
              onClick={() => call("confirm", { confirmWrite: true })}
            >
              {busy === "confirm" ? "Working…" : `${verb} ${w.object}`}
            </button>
            <button
              type="button"
              className="fr-secondary"
              disabled={busy !== null}
              onClick={() => call("back", { back: true })}
            >
              {busy === "back" ? "…" : "Back"}
            </button>
            <button
              type="button"
              className="fr-secondary"
              disabled={busy !== null}
              onClick={() => call("cancel", { confirmWrite: false })}
            >
              Cancel
            </button>
          </div>
        </div>
        {error && <div className="fr-error">{error}</div>}
      </section>
    );
  }

  if (!screen) return null;
  const totalScreens = payload.screens > 0 ? ` of ~${payload.screens}` : "";
  return (
    <section className="fr-section">
      <div className="fr-screen-head">
        <h2 className="fr-screen-title">{screen.label}</h2>
        <span className="cs-muted fr-step">
          Step {screen.stepIndex}
          {totalScreens}
        </span>
      </div>
      <div className="fr-fields">
        {screen.fields.map((f) => (
          <FieldControl
            key={f.name}
            field={f}
            values={values}
            onChange={(name, v) => setValues((prev) => ({ ...prev, [name]: v }))}
          />
        ))}
      </div>
      <div className="fr-actions">
        {screen.allowBack && (
          <button
            type="button"
            className="fr-secondary"
            disabled={busy !== null}
            onClick={() => call("back", { back: true })}
          >
            {busy === "back" ? "…" : "Back"}
          </button>
        )}
        <button
          type="button"
          className="fr-launch"
          disabled={busy !== null || requiredMissing}
          onClick={() => call("next", { answers: values })}
        >
          {busy === "next" ? "Working…" : "Next"}
        </button>
        {requiredMissing && <span className="cs-muted fr-note">Fill the required fields (*).</span>}
      </div>
      {error && <div className="fr-error">{error}</div>}
    </section>
  );
}
