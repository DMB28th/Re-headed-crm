"use client";
/**
 * Screen-flow input mapping editor (task 9): one row per input variable the
 * flow itself declares, each choosing how that variable gets its value at
 * run time — one of the five `ActionInputMapping` sources from
 * `packages/core`'s layout-config schema.
 *
 * Deliberately narrower than builder/canvas.tsx's `ActionInputsEditor`,
 * which lets an admin invent arbitrarily-named inputs against a full
 * `ObjectDescribe` (field/relationship pickers as selects). This editor has
 * no describe context — actions-editor.tsx only has the object's api name —
 * and its row set is fixed by what the flow declares, not admin-invented, so
 * `field`/`object`/`relationship` are plain text inputs rather than selects.
 *
 * Every source's field set matches the schema in packages/core/src/
 * layout-config.ts exactly (context/field/literal/ask/selection) — no extra
 * controls beyond what each variant carries.
 */
import { useEffect, useState } from "react";
import type {
  ActionContextKey,
  ActionInputMapping,
  ActionInputMappings,
  ActionInputValueType,
} from "@cardstack/core";

export interface ActionInputVariable {
  name: string;
  dataType: string;
  isCollection: boolean;
}

type MappingSource = ActionInputMapping["source"];

// Source of truth for the enum is packages/core/src/layout-config.ts
// (ActionContextKey) — mirrored here as label pairs the same way
// builder/canvas.tsx's CONTEXT_KEYS does, since the two editors can't share
// a components-layer module without either depending on the other.
const CONTEXT_KEYS: { value: ActionContextKey; label: string }[] = [
  { value: "recordId", label: "Current record id" },
  { value: "objectApiName", label: "Current object" },
  { value: "crm", label: "CRM kind" },
  { value: "tenantId", label: "Tenant" },
  { value: "userId", label: "Current user id" },
  { value: "userEmail", label: "Current user email" },
  { value: "audience", label: "Audience" },
  { value: "actionSessionId", label: "Action session" },
];

const SCALAR_SOURCES: { value: Exclude<MappingSource, "selection">; label: string }[] = [
  { value: "context", label: "Context" },
  { value: "field", label: "Record field" },
  { value: "literal", label: "Literal" },
  { value: "ask", label: "Ask rep" },
];

/**
 * Type gate (task-9 Step 2, this plan's addition beyond /design — not in
 * the schema itself): a collection variable can only bind to "selection",
 * since the schema pins that source's valueType to "recordIds"; every
 * scalar variable offers the other four. Kept as one small function so
 * relaxing it later ("offer all five, warn on mismatch") is a one-line
 * change here instead of scattered conditionals.
 */
function sourcesFor(isCollection: boolean): { value: MappingSource; label: string }[] {
  if (isCollection) return [{ value: "selection", label: "Selected rows" }];
  return SCALAR_SOURCES;
}

/** Date → date, Number/Currency → number, Boolean → boolean, else string. */
function preselectValueType(dataType: string): ActionInputValueType {
  const lower = dataType.toLowerCase();
  if (lower === "date") return "date";
  if (lower === "number" || lower === "currency") return "number";
  if (lower === "boolean") return "boolean";
  return "string";
}

function parseLiteral(raw: string, valueType: ActionInputValueType): string | number | boolean | null {
  if (valueType === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  if (valueType === "boolean") return raw.trim().toLowerCase() === "true";
  return raw;
}

export function ActionInputsEditor({
  variables,
  value,
  onChange,
}: {
  /** `undefined` = the flow's definition was unreadable (installed/managed
   *  flow); `[]` = readable, and it genuinely takes no inputs. These are
   *  different states — see the caution note below. */
  variables: ActionInputVariable[] | undefined;
  value: ActionInputMappings;
  onChange: (next: ActionInputMappings) => void;
}) {
  if (variables === undefined) {
    return (
      <div className="rounded-[9px] bg-draft px-3 py-2.5 text-[12px] text-draft-ink">
        We couldn&apos;t read this flow&apos;s variables, so we can&apos;t list its inputs. The
        flow&apos;s own screens will collect them.
      </div>
    );
  }

  if (variables.length === 0) {
    return <p className="text-[12px] text-ink-45">This flow takes no input variables.</p>;
  }

  return (
    <div>
      <p className="text-[11px] text-ink-45">
        How each variable gets its value when the flow runs — resolved once, whether the rep
        clicks the button or triggers it from chat.
      </p>
      <div className="mt-2 space-y-2">
        {variables.map((variable) => (
          <VariableRow
            key={variable.name}
            variable={variable}
            mapping={value[variable.name]}
            onChange={(mapping) => onChange({ ...value, [variable.name]: mapping })}
            onClear={() => {
              const next = { ...value };
              delete next[variable.name];
              onChange(next);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function VariableRow({
  variable,
  mapping,
  onChange,
  onClear,
}: {
  variable: ActionInputVariable;
  mapping: ActionInputMapping | undefined;
  onChange: (next: ActionInputMapping) => void;
  /** Removes this variable's entry from the mappings record entirely,
   *  reverting to "no explicit mapping" (the runtime falls back to its safe
   *  host context). Only shown once a mapping exists to clear. */
  onClear: () => void;
}) {
  const sources = sourcesFor(variable.isCollection);
  const fallbackSource = sources[0]!.value;
  const valueType = preselectValueType(variable.dataType);

  // "field" and "ask" both require a non-empty string the schema will reject
  // if blank (min-1). Switching to one of those sources must not write an
  // invalid mapping and trip a 400 on save — so the select below is allowed
  // to show a source that ISN'T committed yet, and only commits once the
  // admin has typed something valid. sourceDraft carries that "picked but
  // not yet valid" state; it clears itself once `mapping` catches up.
  const [sourceDraft, setSourceDraft] = useState<MappingSource | null>(null);
  useEffect(() => {
    if (mapping && sourceDraft === mapping.source) setSourceDraft(null);
  }, [mapping, sourceDraft]);
  const displaySource = sourceDraft ?? mapping?.source ?? fallbackSource;

  const onSourceChange = (nextSource: MappingSource) => {
    if (nextSource === "context") {
      onChange({ source: "context", key: "recordId", valueType });
      setSourceDraft(null);
      return;
    }
    if (nextSource === "literal") {
      onChange({ source: "literal", value: "", valueType });
      setSourceDraft(null);
      return;
    }
    if (nextSource === "selection") {
      onChange({ source: "selection", valueType: "recordIds", required: false });
      setSourceDraft(null);
      return;
    }
    // field / ask: nothing valid to commit yet — wait for input.
    setSourceDraft(nextSource);
  };

  return (
    <div className="rounded-[9px] border border-line-soft bg-paper p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="st-chip-mono bg-surface text-ink-45" title={variable.dataType}>
          {variable.name}
        </span>
        <span className="text-[11px] text-ink-45">{variable.dataType}</span>
        <select
          className="st-input py-1 text-[11.5px]"
          aria-label={`Value source for ${variable.name}`}
          value={displaySource}
          onChange={(e) => onSourceChange(e.target.value as MappingSource)}
        >
          {sources.map((source) => (
            <option key={source.value} value={source.value}>
              {source.label}
            </option>
          ))}
        </select>
        {mapping && (
          <button
            type="button"
            className="ml-auto text-ink-45 hover:text-drift-ink"
            aria-label={`Clear mapping for ${variable.name}`}
            title="Clear — the runtime will fall back to its safe host context"
            onClick={() => {
              setSourceDraft(null);
              onClear();
            }}
          >
            ×
          </button>
        )}
      </div>

      <div className="mt-2">
        {displaySource === "context" && (
          <ContextFields
            mapping={mapping?.source === "context" ? mapping : undefined}
            valueType={valueType}
            onChange={onChange}
          />
        )}
        {displaySource === "field" && (
          <FieldControl
            key={variable.name}
            mapping={mapping?.source === "field" ? mapping : undefined}
            valueType={valueType}
            onCommit={(m) => {
              onChange(m);
              setSourceDraft(null);
            }}
          />
        )}
        {displaySource === "literal" && (
          <LiteralControl
            key={variable.name}
            mapping={mapping?.source === "literal" ? mapping : undefined}
            valueType={valueType}
            onChange={onChange}
          />
        )}
        {displaySource === "ask" && (
          <AskControl
            key={variable.name}
            mapping={mapping?.source === "ask" ? mapping : undefined}
            valueType={valueType}
            onCommit={(m) => {
              onChange(m);
              setSourceDraft(null);
            }}
          />
        )}
        {displaySource === "selection" && (
          <SelectionControl
            mapping={mapping?.source === "selection" ? mapping : undefined}
            onChange={onChange}
          />
        )}
      </div>
    </div>
  );
}

function ContextFields({
  mapping,
  valueType,
  onChange,
}: {
  mapping: Extract<ActionInputMapping, { source: "context" }> | undefined;
  valueType: ActionInputValueType;
  onChange: (next: ActionInputMapping) => void;
}) {
  return (
    <select
      className="st-input min-w-[200px] py-1 text-[11.5px]"
      aria-label="Context value"
      value={mapping?.key ?? "recordId"}
      onChange={(e) => onChange({ source: "context", key: e.target.value as ActionContextKey, valueType })}
    >
      {CONTEXT_KEYS.map((key) => (
        <option key={key.value} value={key.value}>
          {key.label}
        </option>
      ))}
    </select>
  );
}

/** Field-API-name input, commit-on-blur (matches actions-editor.tsx's label
 *  idiom), with validation: an empty value never commits, since the schema
 *  requires `field.min(1)` — it would fail `parseLayoutConfig` on save. */
function FieldControl({
  mapping,
  valueType,
  onCommit,
}: {
  mapping: Extract<ActionInputMapping, { source: "field" }> | undefined;
  valueType: ActionInputValueType;
  onCommit: (next: ActionInputMapping) => void;
}) {
  const [text, setText] = useState(mapping?.field ?? "");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setText(mapping?.field ?? "");
    setError(null);
  }, [mapping]);

  return (
    <div>
      <input
        className="st-input min-w-[220px] py-1 text-[11.5px]"
        aria-label="Field API name"
        placeholder="Field API name, e.g. Amount"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const trimmed = text.trim();
          if (!trimmed) {
            setError("Enter a field API name, or pick a different source.");
            return;
          }
          setError(null);
          onCommit({ source: "field", field: trimmed, valueType });
        }}
      />
      {error && <p className="mt-1 text-[11px] text-drift-ink">{error}</p>}
    </div>
  );
}

function LiteralControl({
  mapping,
  valueType,
  onChange,
}: {
  mapping: Extract<ActionInputMapping, { source: "literal" }> | undefined;
  valueType: ActionInputValueType;
  onChange: (next: ActionInputMapping) => void;
}) {
  const [text, setText] = useState(mapping ? String(mapping.value ?? "") : "");
  useEffect(() => {
    setText(mapping ? String(mapping.value ?? "") : "");
  }, [mapping]);

  return (
    <input
      className="st-input min-w-[220px] py-1 text-[11.5px]"
      aria-label="Literal value"
      placeholder="Static value"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onChange({ source: "literal", value: parseLiteral(text, valueType), valueType })}
    />
  );
}

/** Prompt input, commit-on-blur with the same empty-guard as FieldControl —
 *  the schema requires `prompt.min(1)`. The required switch commits
 *  immediately once a valid mapping exists; before that it just adjusts
 *  what gets committed once the prompt is filled in. */
function AskControl({
  mapping,
  valueType,
  onCommit,
}: {
  mapping: Extract<ActionInputMapping, { source: "ask" }> | undefined;
  valueType: ActionInputValueType;
  onCommit: (next: ActionInputMapping) => void;
}) {
  const [text, setText] = useState(mapping?.prompt ?? "");
  const [error, setError] = useState<string | null>(null);
  const [required, setRequired] = useState(mapping?.required ?? true);
  useEffect(() => {
    setText(mapping?.prompt ?? "");
    setError(null);
    setRequired(mapping?.required ?? true);
  }, [mapping]);

  const commit = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Enter a prompt, or pick a different source.");
      return;
    }
    setError(null);
    onCommit({ source: "ask", prompt: trimmed, valueType, required });
  };

  return (
    <div className="flex flex-wrap items-start gap-2">
      <div>
        <input
          className="st-input min-w-[240px] py-1 text-[11.5px]"
          aria-label="Prompt shown before launch"
          placeholder="Prompt shown before launch"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
        />
        {error && <p className="mt-1 text-[11px] text-drift-ink">{error}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={required}
        aria-label={required ? "Required before launch" : "Optional"}
        title={required ? "Required before launch" : "Optional"}
        className={`h-5 w-9 shrink-0 rounded-full transition-colors ${required ? "bg-accent" : "bg-line"}`}
        onClick={() => {
          const next = !required;
          setRequired(next);
          // A valid ask mapping already exists — the required flag alone is
          // always safe to commit. If none exists yet (still typing the
          // prompt), this just updates what `commit` will send.
          if (mapping) onCommit({ ...mapping, required: next });
        }}
      >
        <span
          className={`block h-4 w-4 rounded-full bg-white transition-transform ${
            required ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function SelectionControl({
  mapping,
  onChange,
}: {
  mapping: Extract<ActionInputMapping, { source: "selection" }> | undefined;
  onChange: (next: ActionInputMapping) => void;
}) {
  const [objectText, setObjectText] = useState(mapping?.object ?? "");
  const [relationshipText, setRelationshipText] = useState(mapping?.relationship ?? "");
  useEffect(() => {
    setObjectText(mapping?.object ?? "");
    setRelationshipText(mapping?.relationship ?? "");
  }, [mapping]);

  const required = mapping?.required ?? false;

  const commit = (patch: Partial<{ object: string; relationship: string; required: boolean }>) => {
    const nextObject = patch.object ?? objectText;
    const nextRelationship = patch.relationship ?? relationshipText;
    onChange({
      source: "selection",
      object: nextObject.trim() || undefined,
      relationship: nextRelationship.trim() || undefined,
      valueType: "recordIds",
      required: patch.required ?? required,
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        className="st-input min-w-[180px] py-1 text-[11.5px]"
        aria-label="Related object (optional)"
        placeholder="Object (optional)"
        value={objectText}
        onChange={(e) => setObjectText(e.target.value)}
        onBlur={() => commit({})}
      />
      <input
        className="st-input min-w-[180px] py-1 text-[11.5px]"
        aria-label="Relationship name (optional)"
        placeholder="Relationship (optional)"
        value={relationshipText}
        onChange={(e) => setRelationshipText(e.target.value)}
        onBlur={() => commit({})}
      />
      <button
        type="button"
        role="switch"
        aria-checked={required}
        aria-label={required ? "Selection required" : "Selection optional"}
        title={required ? "Selection required" : "Selection optional"}
        className={`h-5 w-9 shrink-0 rounded-full transition-colors ${required ? "bg-accent" : "bg-line"}`}
        onClick={() => commit({ required: !required })}
      >
        <span
          className={`block h-4 w-4 rounded-full bg-white transition-transform ${
            required ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
