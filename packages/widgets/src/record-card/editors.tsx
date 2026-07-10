/** Field inputs for edit mode (design 1b): control type from config override or describe metadata. */
import type { CrmFieldValue, FieldDescribe, LayoutField } from "@cardstack/core";
import { coerceInputValue, inputDisplayValue } from "./edit-machine.ts";

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
    case "picklist":
      return (
        <select
          {...commonProps}
          value={inputDisplayValue(value)}
          onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        >
          <option value="">—</option>
          {(meta?.values ?? []).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      );
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
    default:
      return (
        <input
          {...commonProps}
          type={inputType(control)}
          step={control === "currency" || control === "number" ? "any" : undefined}
          value={inputDisplayValue(value)}
          onChange={(e) => onChange(coerceInputValue(e.target.value, meta))}
        />
      );
  }
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
    case "datetime":
      return "datetime-local";
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
