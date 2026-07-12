/** Field inputs for edit mode (design 1b): control type from config override or describe metadata. */
import { useState, type KeyboardEvent } from "react";
import type { CrmFieldValue, FieldDescribe, LayoutField } from "@cardstack/core";
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
  onChange,
}: {
  field: LayoutField;
  meta: FieldDescribe | undefined;
  value: CrmFieldValue;
  dirty: boolean;
  onChange: (value: CrmFieldValue) => void;
}) {
  const control = field.control ?? controlFromMeta(meta);
  const className = `wd-input${dirty ? " wd-input--dirty" : ""}`;
  const commonProps = {
    className,
    "aria-label": meta?.label ?? field.api,
  };

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

function controlFromMeta(meta: FieldDescribe | undefined): string {
  switch (meta?.type) {
    case "picklist":
      return "picklist";
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
