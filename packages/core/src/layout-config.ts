/**
 * The layout config — the contract between Studio (writes it), the MCP server
 * (serves it), and the widgets (render from it).
 *
 * Schema-change policy (CLAUDE.md rule 1): any change here requires a migration
 * note in this header.
 *
 * Migration notes:
 * - v1: initial schema. Keyed on (tenantId, object, audience) with a "default"
 *   audience even though v1 only ever resolves one layout per object — this is
 *   deliberate schema-prep for role-based layouts (PLAN.md V1); do not remove.
 * - 2026-07-12: LayoutField gains optional `required` (design 2a's per-field
 *   Required toggle, enforced in crm_update_record: a required field can't be
 *   cleared from chat). Additive + optional — existing configs parse unchanged.
 * - 2026-07-20: screen_flow actions gain an `inputs` mapping contract. Existing
 *   actions default to no explicit inputs; runtimes can still inject their safe
 *   host context, while new Studio configs map variables intentionally.
 */
import { z } from "zod";

export const CrmKind = z.enum(["salesforce", "hubspot"]);
export type CrmKind = z.infer<typeof CrmKind>;

/** Control-type override for an editable field. Defaults derive from describe metadata. */
export const FieldControl = z.enum([
  "text",
  "textarea",
  "picklist",
  "checkbox",
  "date",
  "datetime",
  "currency",
  "number",
  "email",
  "phone",
  "url",
]);
export type FieldControl = z.infer<typeof FieldControl>;

export const LayoutField = z.object({
  /** CRM field API name. Dot paths ("Account.Name") reference parent-object fields, read-only. */
  api: z.string().min(1),
  editable: z.boolean().default(false),
  control: FieldControl.optional(),
  /** Can't be cleared from chat (server-enforced in crm_update_record). */
  required: z.boolean().optional(),
});
export type LayoutField = z.infer<typeof LayoutField>;

export const LayoutSection = z.object({
  label: z.string().min(1),
  columns: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  fields: z.array(LayoutField).min(1),
});
export type LayoutSection = z.infer<typeof LayoutSection>;

export const RelatedListConfig = z.object({
  /** Related object API name, e.g. "Contact" / "contacts". */
  object: z.string().min(1),
  /** Relationship / association API name, e.g. "OpportunityContactRoles". */
  relationship: z.string().min(1),
  columns: z.array(z.string().min(1)).min(1),
  limit: z.number().int().positive().max(50).default(5),
});
export type RelatedListConfig = z.infer<typeof RelatedListConfig>;

export const ActionInputValueType = z.enum([
  "string",
  "number",
  "boolean",
  "date",
  "datetime",
  "recordId",
  "recordIds",
  "json",
]);
export type ActionInputValueType = z.infer<typeof ActionInputValueType>;

export const ActionContextKey = z.enum([
  "recordId",
  "objectApiName",
  "crm",
  "tenantId",
  "userId",
  "userEmail",
  "audience",
  "actionSessionId",
]);
export type ActionContextKey = z.infer<typeof ActionContextKey>;

export const ActionInputMapping = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("context"),
    key: ActionContextKey.default("recordId"),
    valueType: ActionInputValueType.optional(),
  }),
  z.object({
    source: z.literal("field"),
    field: z.string().min(1),
    valueType: ActionInputValueType.optional(),
  }),
  z.object({
    source: z.literal("literal"),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]).default(""),
    valueType: ActionInputValueType.optional(),
  }),
  z.object({
    source: z.literal("ask"),
    prompt: z.string().min(1),
    valueType: ActionInputValueType.default("string"),
    required: z.boolean().default(true),
  }),
  z.object({
    source: z.literal("selection"),
    object: z.string().optional(),
    relationship: z.string().optional(),
    valueType: z.literal("recordIds").default("recordIds"),
    required: z.boolean().default(false),
  }),
]);
export type ActionInputMapping = z.infer<typeof ActionInputMapping>;

export const ActionInputMappings = z.record(z.string().min(1), ActionInputMapping).default({});
export type ActionInputMappings = z.infer<typeof ActionInputMappings>;

export const CardAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("update_record"), label: z.string().min(1) }),
  z.object({
    type: z.literal("create_related"),
    object: z.string().min(1),
    label: z.string().min(1),
  }),
  // Salesforce screen flows land in M5; the config slot exists so publishing a
  // flow action later is not a schema migration.
  z.object({
    type: z.literal("screen_flow"),
    flowApiName: z.string().min(1),
    label: z.string().min(1),
    embed: z.enum(["auto", "native", "embedded", "iframe"]).default("auto"),
    /**
     * Flow/LWC/custom-screen input variables resolved by the action runtime.
     * The same mapping is used whether the rep clicks the button or invokes the
     * action from chat.
     */
    inputs: ActionInputMappings,
  }),
]);
export type CardAction = z.infer<typeof CardAction>;

export const ListViewConfig = z.object({
  columns: z.array(z.string().min(1)).min(1),
  defaultSort: z
    .object({ field: z.string().min(1), dir: z.enum(["asc", "desc"]) })
    .optional(),
  rowActions: z.array(z.string()).default([]),
});
export type ListViewConfig = z.infer<typeof ListViewConfig>;

export const RecordCardConfig = z.object({
  header: z.object({
    title: z.string().min(1),
    subtitle: z.string().optional(),
    badge: z.string().optional(),
  }),
  sections: z.array(LayoutSection).min(1),
  relatedLists: z.array(RelatedListConfig).default([]),
  actions: z.array(CardAction).default([]),
});
export type RecordCardConfig = z.infer<typeof RecordCardConfig>;

export const PermissionsConfig = z.object({
  writeEnabled: z.boolean().default(false),
  /** Field API names never exposed, even if referenced elsewhere. Matches a full
   *  dot-path or the leading segment of one. Enforced server-side only. */
  fieldDenylist: z.array(z.string()).default([]),
  /** Locked ON by design ("the product's spine") — the schema refuses false. */
  requireConfirmation: z.literal(true).default(true),
});
export type PermissionsConfig = z.infer<typeof PermissionsConfig>;

export const LayoutConfig = z.object({
  /** Schema version, not publish version. */
  version: z.literal(1),
  tenantId: z.string().min(1),
  crm: CrmKind,
  /** Object API name: "Opportunity" (SFDC) / "deals" (HubSpot). */
  object: z.string().min(1),
  /** Audience key; v1 resolves only "default". Schema-prep for role-based layouts. */
  audience: z.string().min(1).default("default"),
  /** Admin-facing layout name, shown in the widget's layout chip ("AE deal card"). */
  name: z.string().optional(),
  /** Publish revision (the "v4" in the widget's mono chip). */
  revision: z.number().int().positive().default(1),
  listView: ListViewConfig,
  recordCard: RecordCardConfig,
  permissions: PermissionsConfig,
});
export type LayoutConfig = z.infer<typeof LayoutConfig>;

export type LayoutConfigInput = z.input<typeof LayoutConfig>;

export function parseLayoutConfig(raw: unknown): LayoutConfig {
  return LayoutConfig.parse(raw);
}
