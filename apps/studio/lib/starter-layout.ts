/**
 * Starter layout for a newly added object (object picker, 3c): a sane draft
 * generated from describe metadata. The admin shapes it in the builder and
 * nothing reaches reps until they publish.
 */
import { parseLayoutConfig, type LayoutConfig, type ObjectDescribe } from "@cardstack/core";

export function generateStarterLayout(
  tenantId: string,
  describe: ObjectDescribe,
): LayoutConfig {
  const fields = describe.fields;
  const title =
    fields.find((f) => f.required && f.type === "string") ??
    fields.find((f) => f.type === "string") ??
    fields[0];
  if (!title) throw new Error(`${describe.api} has no fields to build a layout from.`);
  const badge = fields.find((f) => f.type === "picklist" && f.api !== title.api);
  const body = fields.filter((f) => f.api !== title.api && f.api !== badge?.api).slice(0, 6);
  if (body.length === 0) body.push(title);

  return parseLayoutConfig({
    version: 1,
    tenantId,
    crm: "hubspot",
    object: describe.api,
    audience: "default",
    name: `${describe.labelPlural} card`,
    revision: 1,
    listView: {
      columns: [title.api, ...body.slice(0, 3).map((f) => f.api)],
      rowActions: ["open_record"],
    },
    recordCard: {
      header: { title: title.api, ...(badge ? { badge: badge.api } : {}) },
      sections: [
        {
          label: "Details",
          columns: 2,
          fields: body.map((f) => ({ api: f.api, editable: false })),
        },
      ],
      relatedLists: [],
      actions: [{ type: "update_record", label: "Save changes" }],
    },
    permissions: { writeEnabled: true, fieldDenylist: [], requireConfirmation: true },
  });
}
