/** Field inputs for edit mode (design 1b): control type from config override or describe metadata. */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type {
  CrmFieldValue,
  FieldDescribe,
  LayoutField,
  LookupOption,
  LookupOptionsPayload,
} from "@cardstack/core";
import type { WidgetHost } from "./card.tsx";
import { coerceInputValue, datetimeLocalToIso, inputDisplayValue } from "./edit-machine.ts";

/** Above this, a native select becomes the filterable combobox (design 1b). */
const COMBOBOX_THRESHOLD = 10;
/** Visible rows in the combobox list; the rest collapse to "N more — type to filter". */
const COMBOBOX_VISIBLE = 8;

interface PicklistOption {
  value: string;
  label: string;
}

/**
 * Options come from describe values; owner-style fields (enumeration with no
 * values but populated valueLabels) fall back to the labels map so they render
 * a usable name picker instead of an empty dropdown.
 */
function picklistOptions(meta: FieldDescribe | undefined): PicklistOption[] {
  if (meta?.values?.length) {
    return meta.values.map((v) => ({ value: v, label: meta.valueLabels?.[v] ?? v }));
  }
  return Object.entries(meta?.valueLabels ?? {}).map(([value, label]) => ({ value, label }));
}

export function FieldInput({
  field,
  meta,
  value,
  dirty,
  displayLabel,
  host,
  onChange,
}: {
  field: LayoutField;
  meta: FieldDescribe | undefined;
  value: CrmFieldValue;
  dirty: boolean;
  /** For lookup fields: the human label of the current value (record name). */
  displayLabel?: string | undefined;
  /** Host bridge for async lookups; null in hostless previews. */
  host?: WidgetHost | null | undefined;
  onChange: (value: CrmFieldValue, displayLabel?: string) => void;
}) {
  const control = field.control ?? controlFromMeta(meta);
  const className = `wd-input${dirty ? " wd-input--dirty" : ""}`;
  const commonProps = {
    className,
    "aria-label": meta?.label ?? field.api,
  };

  if (control === "lookup") {
    if (host) {
      return (
        <LookupInput
          meta={meta}
          api={field.api}
          value={value}
          dirty={dirty}
          displayLabel={displayLabel ?? (value === null ? "" : String(value))}
          host={host}
          onChange={onChange}
        />
      );
    }
    // Hostless preview: no search bridge, and free-typing a NAME into a field
    // that stores an ID would corrupt the write — show it read-only instead.
    return (
      <input
        {...commonProps}
        type="text"
        disabled
        value={displayLabel ?? inputDisplayValue(value)}
        title="Lookup editing needs the chat host"
      />
    );
  }

  switch (control) {
    case "picklist": {
      const options = picklistOptions(meta);
      if (options.length > COMBOBOX_THRESHOLD) {
        return (
          <PicklistCombobox
            options={options}
            value={value}
            dirty={dirty}
            label={meta?.label ?? field.api}
            onChange={onChange}
          />
        );
      }
      return (
        <select
          {...commonProps}
          value={inputDisplayValue(value)}
          onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    case "textarea":
      return (
        <textarea
          {...commonProps}
          rows={3}
          value={inputDisplayValue(value)}
          onChange={(e) => onChange(coerceInputValue(e.target.value, meta))}
        />
      );
    case "checkbox":
      return (
        <input
          type="checkbox"
          className={className}
          aria-label={meta?.label ?? field.api}
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case "datetime":
      return (
        <input
          {...commonProps}
          type="datetime-local"
          value={inputDisplayValue(value, "datetime")}
          onChange={(e) => onChange(datetimeLocalToIso(e.target.value))}
        />
      );
    default:
      return (
        <input
          {...commonProps}
          type={inputType(control)}
          step={control === "currency" || control === "number" ? "any" : undefined}
          value={inputDisplayValue(value, control)}
          onChange={(e) => onChange(coerceInputValue(e.target.value, meta))}
        />
      );
  }
}

/**
 * Filterable picklist for long value lists (design 1b): text input + filtered
 * list capped at 8 rows with the "N more — type to filter" affordance.
 * Full keyboard path: arrows move, Enter picks, Escape closes.
 */
function PicklistCombobox({
  options,
  value,
  dirty,
  label,
  onChange,
}: {
  options: PicklistOption[];
  value: CrmFieldValue;
  dirty: boolean;
  label: string;
  onChange: (value: CrmFieldValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [active, setActive] = useState(0);

  const selectedLabel =
    value === null || value === undefined || value === ""
      ? ""
      : (options.find((o) => o.value === String(value))?.label ?? String(value));

  const needle = filter.trim().toLowerCase();
  const clearOption: PicklistOption = { value: "", label: "—" };
  const matches = needle
    ? options.filter(
        (o) => o.label.toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle),
      )
    : [clearOption, ...options];
  const visible = matches.slice(0, COMBOBOX_VISIBLE);
  const hidden = matches.length - visible.length;

  const pick = (option: PicklistOption) => {
    onChange(option.value === "" ? null : option.value);
    setFilter("");
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setFilter("");
      setOpen(false);
      return;
    }
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      setActive(0);
      e.preventDefault();
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      setActive((a) => Math.min(a + 1, visible.length - 1));
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setActive((a) => Math.max(a - 1, 0));
      e.preventDefault();
    } else if (e.key === "Enter") {
      const option = visible[active];
      if (option) pick(option);
      e.preventDefault();
    }
  };

  return (
    <div className="wd-combobox">
      <input
        className={`wd-input${dirty ? " wd-input--dirty" : ""}`}
        role="combobox"
        aria-expanded={open}
        aria-label={label}
        aria-autocomplete="list"
        placeholder={open ? selectedLabel || "Type to filter…" : undefined}
        value={open ? filter : selectedLabel}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => {
          setFilter("");
          setOpen(false);
        }}
        onChange={(e) => {
          setFilter(e.target.value);
          setActive(0);
          if (!open) setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <div
          className="wd-combobox-list"
          role="listbox"
          aria-label={`${label} options`}
          // Options commit on mousedown — before the input's blur closes the list.
          onMouseDown={(e) => e.preventDefault()}
        >
          {visible.map((option, i) => (
            <div
              key={option.value || "__clear"}
              role="option"
              aria-selected={String(value ?? "") === option.value}
              className={`wd-combobox-option${i === active ? " wd-combobox-option--active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(option)}
            >
              {option.label}
            </div>
          ))}
          {visible.length === 0 && <div className="wd-combobox-empty cs-muted">No matches</div>}
          {hidden > 0 && (
            <div className="wd-combobox-more cs-muted">{hidden} more — type to filter</div>
          )}
        </div>
      )}
    </div>
  );
}

/** Debounce for lookup typeahead — each search is a host tool call. */
const LOOKUP_DEBOUNCE_MS = 300;
const LOOKUP_MIN_CHARS = 2;

/**
 * Reference-field editor (Salesforce-style lookup): type ≥2 chars and the CRM
 * is searched live through the host (crm_lookup_search); picking an option
 * commits the record ID while the card keeps showing the NAME. Polymorphic
 * lookups (Owner, What) get a target-object switcher.
 */
function LookupInput({
  meta,
  api,
  value,
  dirty,
  displayLabel,
  host,
  onChange,
}: {
  meta: FieldDescribe | undefined;
  api: string;
  value: CrmFieldValue;
  dirty: boolean;
  displayLabel: string;
  host: WidgetHost;
  onChange: (value: CrmFieldValue, displayLabel?: string) => void;
}) {
  const targets = meta?.referenceTo ?? [];
  const [target, setTarget] = useState(targets[0] ?? "");
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [options, setOptions] = useState<LookupOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  // Stale-response guard: only the LATEST search may update the list.
  const seqRef = useRef(0);

  const query = filter.trim();
  useEffect(() => {
    if (!open || query.length < LOOKUP_MIN_CHARS || !target) {
      setOptions(null);
      setLoading(false);
      setSearchError(null);
      return;
    }
    const seq = ++seqRef.current;
    setLoading(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const result = await host.callTool("crm_lookup_search", {
            object: target,
            query,
          });
          if (seqRef.current !== seq) return;
          const data = result.structuredContent as LookupOptionsPayload | undefined;
          if (!result.isError && data?.kind === "lookup-options") {
            setOptions(data.options);
            setSearchError(null);
          } else {
            const text = result.content?.find((c) => c.type === "text")?.text;
            setOptions([]);
            setSearchError(text ?? "Search failed.");
          }
        } catch (error) {
          if (seqRef.current === seq) {
            setOptions([]);
            setSearchError(error instanceof Error ? error.message : String(error));
          }
        } finally {
          if (seqRef.current === seq) setLoading(false);
        }
      })();
    }, LOOKUP_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [open, query, target, host]);

  const label = meta?.label ?? api;
  const hasValue = value !== null && value !== undefined && value !== "";
  const visible = options ?? [];

  const pick = (option: LookupOption) => {
    onChange(option.id, option.label);
    setFilter("");
    setOpen(false);
  };
  const clear = () => {
    onChange(null);
    setFilter("");
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setFilter("");
      setOpen(false);
      return;
    }
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      setActive(0);
      e.preventDefault();
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      setActive((a) => Math.min(a + 1, visible.length - 1));
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setActive((a) => Math.max(a - 1, 0));
      e.preventDefault();
    } else if (e.key === "Enter") {
      const option = visible[active];
      if (option) pick(option);
      e.preventDefault();
    }
  };

  return (
    <div className="wd-lookup">
      {targets.length > 1 && (
        <select
          className="wd-input wd-lookup-target"
          aria-label={`${label} target object`}
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
            setOptions(null);
            setActive(0);
          }}
        >
          {targets.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      )}
      <div className="wd-combobox">
        <input
          className={`wd-input${dirty ? " wd-input--dirty" : ""}`}
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          aria-autocomplete="list"
          placeholder={open ? displayLabel || `Search ${target}…` : undefined}
          value={open ? filter : displayLabel}
          onFocus={() => {
            setOpen(true);
            setActive(0);
          }}
          onBlur={() => {
            setFilter("");
            setOpen(false);
          }}
          onChange={(e) => {
            setFilter(e.target.value);
            setActive(0);
            if (!open) setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        {open && (
          <div
            className="wd-combobox-list"
            role="listbox"
            aria-label={`${label} matches`}
            // Options commit on mousedown — before the input's blur closes the list.
            onMouseDown={(e) => e.preventDefault()}
          >
            {query.length < LOOKUP_MIN_CHARS ? (
              <>
                {hasValue && (
                  <div role="option" aria-selected={false} className="wd-combobox-option" onClick={clear}>
                    — <span className="cs-muted">clear</span>
                  </div>
                )}
                <div className="wd-combobox-empty cs-muted">
                  Type to search {target || "records"}…
                </div>
              </>
            ) : loading ? (
              <div className="wd-combobox-empty cs-muted">Searching…</div>
            ) : searchError ? (
              <div className="wd-combobox-empty cs-muted">{searchError}</div>
            ) : visible.length === 0 ? (
              <div className="wd-combobox-empty cs-muted">No {target} matches “{query}”</div>
            ) : (
              visible.map((option, i) => (
                <div
                  key={option.id}
                  role="option"
                  aria-selected={String(value ?? "") === option.id}
                  className={`wd-combobox-option${i === active ? " wd-combobox-option--active" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(option)}
                >
                  {option.label}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function controlFromMeta(meta: FieldDescribe | undefined): string {
  switch (meta?.type) {
    case "picklist":
      return "picklist";
    case "reference":
      return "lookup";
    case "textarea":
      return "textarea";
    case "boolean":
      return "checkbox";
    case "currency":
    case "number":
    case "percent":
      return "number";
    case "date":
      return "date";
    case "datetime":
      return "datetime";
    case "email":
      return "email";
    case "phone":
      return "phone";
    case "url":
      return "url";
    default:
      return "text";
  }
}

function inputType(control: string): string {
  switch (control) {
    case "currency":
    case "number":
      return "number";
    case "date":
      return "date";
    case "email":
      return "email";
    case "phone":
      return "tel";
    case "url":
      return "url";
    default:
      return "text";
  }
}
