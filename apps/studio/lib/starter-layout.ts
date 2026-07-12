/**
 * Starter layout for an object (object picker 3c / onboarding 2c): "read the
 * fields → pick the high-signal ones → group into two sections", per the
 * design's auto-generation flow. The admin shapes it from there; nothing
 * reaches reps until they publish.
 */
import { parseLayoutConfig, type FieldDescribe, type LayoutConfig, type ObjectDescribe } from "@cardstack/core";

/** Well-known name-ish properties, best first (HubSpot + Salesforce + mock). */
const TITLE_CANDIDATES = [
  "__display_name", // Cardstack-computed contact full name (HubSpot adapter)
  "dealname",
  "hs_full_name_or_email",
  "name",
  "Name",
  "subject",
  "email",
  "firstname",
  "domain",
];

const SUBTITLE_CANDIDATES = ["company", "AccountId", "email", "domain", "website", "jobtitle", "city"];

const BADGE_CANDIDATES = ["dealstage", "StageName", "lifecyclestage", "hs_pipeline_stage", "hs_lead_status", "industry", "role"];

/** High-signal body fields, best first — the ones a rep actually asks about. */
const BODY_PRIORITY = [
  // deals
  "amount", "Amount", "dealstage", "StageName", "closedate", "CloseDate", "pipeline",
  "hubspot_owner_id", "OwnerId", "dealtype", "Type", "description",
  // contacts
  "email", "Email", "phone", "Phone", "jobtitle", "Title", "lifecyclestage",
  "company", "hs_lead_status",
  // companies
  "domain", "Website", "industry", "Industry", "annualrevenue", "AnnualRevenue",
  "numberofemployees", "NumberOfEmployees", "city", "country",
  // generic
  "createdate", "CreatedDate", "notes_last_updated",
];

function pick(fields: FieldDescribe[], candidates: string[]): FieldDescribe | undefined {
  for (const api of candidates) {
    const hit = fields.find((f) => f.api === api);
    if (hit) return hit;
  }
  return undefined;
}

/** Generic fallback score for portals whose good fields aren't on the known lists. */
function score(field: FieldDescribe): number {
  let value = 0;
  if (field.required) value += 3;
  if (field.description) value += 2;
  if (!field.api.startsWith("hs_") && !field.api.startsWith("hubspot_")) value += 2;
  if (["currency", "picklist", "date", "email", "phone"].includes(field.type)) value += 1;
  return value;
}

export function generateStarterLayout(
  tenantId: string,
  describe: ObjectDescribe,
  crm: "hubspot" | "salesforce" = "hubspot",
): LayoutConfig {
  const fields = describe.fields;
  const title =
    pick(fields, TITLE_CANDIDATES) ??
    fields.find((f) => f.required && f.type === "string") ??
    fields.find((f) => f.type === "string") ??
    fields[0];
  if (!title) throw new Error(`${describe.api} has no fields to build a layout from.`);
  const badge = pick(fields.filter((f) => f.api !== title.api), BADGE_CANDIDATES);
  const subtitle = pick(
    fields.filter((f) => f.api !== title.api && f.api !== badge?.api),
    SUBTITLE_CANDIDATES,
  );

  const used = new Set([title.api, badge?.api, subtitle?.api].filter(Boolean) as string[]);
  const known = BODY_PRIORITY.map((api) => fields.find((f) => f.api === api)).filter(
    (f): f is FieldDescribe => !!f && !used.has(f.api),
  );
  const rest = fields
    .filter((f) => !used.has(f.api) && !known.includes(f))
    .sort((a, b) => score(b) - score(a));
  // Design 2c: ~9 high-signal fields grouped into two sections.
  const body = [...known, ...rest].slice(0, 9).map((f) => ({
    api: f.api,
    editable: false as const,
  }));
  if (body.length === 0) body.push({ api: title.api, editable: false });
  const keyDetails = body.slice(0, 5);
  const more = body.slice(5);

  return parseLayoutConfig({
    version: 1,
    tenantId,
    crm,
    object: describe.api,
    audience: "default",
    name: `${describe.labelPlural} card`,
    revision: 1,
    listView: {
      columns: [title.api, ...keyDetails.slice(0, 3).map((f) => f.api)],
      rowActions: ["open_record"],
    },
    recordCard: {
      header: {
        title: title.api,
        ...(subtitle ? { subtitle: subtitle.api } : {}),
        ...(badge ? { badge: badge.api } : {}),
      },
      sections: [
        { label: "Key details", columns: 2, fields: keyDetails },
        ...(more.length > 0 ? [{ label: "More details", columns: 2, fields: more }] : []),
      ],
      relatedLists: [],
      actions: [{ type: "update_record", label: "Save changes" }],
    },
    permissions: { writeEnabled: true, fieldDenylist: [], requireConfirmation: true },
  });
}
