import type {
  ActionContextKey,
  ActionInputMapping,
  ActionInputMappings,
  ActionInputValueType,
  CrmKind,
} from "./layout-config.js";
import type { CrmFieldValue } from "./crm-types.js";

export type ActionResolvedValue = CrmFieldValue | CrmFieldValue[];

export interface ActionInvocationContext {
  tenantId: string;
  crm: CrmKind;
  objectApiName: string;
  recordId: string;
  userId?: string;
  userEmail?: string;
  audience?: string;
  actionSessionId?: string;
  recordFields?: Record<string, CrmFieldValue>;
  /** Current table selection, plus optional relationship-scoped selections. */
  selections?: Record<string, string[]>;
}

export interface ResolvedActionInput {
  name: string;
  valueType: ActionInputValueType;
  value: ActionResolvedValue;
  source: ActionInputMapping["source"];
}

export interface PendingActionInput {
  name: string;
  prompt: string;
  valueType: ActionInputValueType;
  required: boolean;
}

export interface ResolveActionInputsResult {
  resolved: ResolvedActionInput[];
  pending: PendingActionInput[];
  missing: string[];
}

export function resolveActionInputs({
  inputs,
  context,
  answers = {},
}: {
  inputs: ActionInputMappings;
  context: ActionInvocationContext;
  answers?: Record<string, CrmFieldValue>;
}): ResolveActionInputsResult {
  const resolved: ResolvedActionInput[] = [];
  const pending: PendingActionInput[] = [];
  const missing: string[] = [];

  for (const [name, mapping] of Object.entries(inputs)) {
    const valueType = mappingValueType(mapping);
    if (mapping.source === "context") {
      const value = contextValue(context, mapping.key);
      if (value === undefined) missing.push(name);
      else resolved.push({ name, valueType, value, source: mapping.source });
      continue;
    }
    if (mapping.source === "field") {
      const value = context.recordFields?.[mapping.field];
      if (value === undefined) missing.push(name);
      else resolved.push({ name, valueType, value, source: mapping.source });
      continue;
    }
    if (mapping.source === "literal") {
      resolved.push({ name, valueType, value: mapping.value, source: mapping.source });
      continue;
    }
    if (mapping.source === "selection") {
      const selectionKey = mapping.relationship ?? "current";
      const value = context.selections?.[selectionKey] ?? [];
      if (mapping.required && value.length === 0) missing.push(name);
      else resolved.push({ name, valueType, value, source: mapping.source });
      continue;
    }

    const answer = answers[name];
    if (answer !== undefined) {
      resolved.push({ name, valueType, value: answer, source: mapping.source });
    } else {
      pending.push({
        name,
        prompt: mapping.prompt,
        valueType,
        required: mapping.required,
      });
    }
  }

  return { resolved, pending, missing };
}

function mappingValueType(mapping: ActionInputMapping): ActionInputValueType {
  if (mapping.source === "selection") return "recordIds";
  return mapping.valueType ?? "string";
}

function contextValue(
  context: ActionInvocationContext,
  key: ActionContextKey,
): CrmFieldValue | undefined {
  switch (key) {
    case "recordId":
      return context.recordId;
    case "objectApiName":
      return context.objectApiName;
    case "crm":
      return context.crm;
    case "tenantId":
      return context.tenantId;
    case "userId":
      return context.userId;
    case "userEmail":
      return context.userEmail;
    case "audience":
      return context.audience;
    case "actionSessionId":
      return context.actionSessionId;
  }
}
