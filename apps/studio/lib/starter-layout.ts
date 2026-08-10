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
  // Salesforce objects that have no Name: Task/Event title on Subject, Case on
  // CaseNumber. Without these the fallback picks `Id` and every card is titled
  // with a raw record id.
  "Subject",
  "CaseNumber",
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

// ---- Palette ranking (UX review 2026-07-26 P1-8) -------------------------
// Describe order is API order, which fronts Account ID / Deleted / Master
// Record and nine address components. The palette ranks by signal instead
// and folds plumbing into collapsed groups.

/** Record-keeping plumbing an admin almost never puts on a card. */
const SYSTEM_FIELD =
  /^(Id|IsDeleted|MasterRecordId|SystemModstamp|CreatedById|LastModifiedById|LastViewedDate|LastReferencedDate|LastActivityDate|RecordTypeId|CleanStatus|Jigsaw.*|PhotoUrl)$|^hs_(object_id|createdate|lastmodifieddate|all_|user_ids)/i;

/** Compound-address components (Billing/Shipping/Mailing/bare Lead variants). */
const ADDRESS_FIELD =
  /^(Billing|Shipping|Mailing|Other)?(Street|City|State|StateCode|PostalCode|Country|CountryCode|Latitude|Longitude|GeocodeAccuracy|Address)$/;

export type PaletteGroup = "main" | "address" | "system";

export function paletteGroup(field: FieldDescribe): PaletteGroup {
  if (SYSTEM_FIELD.test(field.api)) return "system";
  if (ADDRESS_FIELD.test(field.api)) return "address";
  return "main";
}

/** Higher = earlier in the palette. Known high-signal names first, then the
 * generic score, with a nudge for admin-created custom fields. */
export function paletteRank(field: FieldDescribe): number {
  const known = BODY_PRIORITY.indexOf(field.api);
  if (known >= 0) return 1000 - known;
  let value = score(field);
  if (field.api.endsWith("__c")) value += 2;
  return value;
}

/** True when a field makes sense as a card title/subtitle — keeps `Deleted`
 * and `System Modstamp` out of the header dropdowns. */
export function headerCandidate(field: FieldDescribe): boolean {
  return paletteGroup(field) !== "system" && field.type !== "boolean";
}

export function generateStarterLayout(
  tenantId: string,
  describe: ObjectDescribe,
  crm: "hubspot" | "salesforce" = "hubspot",
): LayoutConfig {
  const fields = describe.fields;
  // The fallbacks skip system plumbing — `Id` is required, string-typed and
  // first in Salesforce's describe, so an unfiltered search titles the card
  // with a raw record id.
  const titleable = fields.filter((f) => paletteGroup(f) !== "system");
  const title =
    pick(fields, TITLE_CANDIDATES) ??
    titleable.find((f) => f.required && f.type === "string") ??
    titleable.find((f) => f.type === "string") ??
    titleable[0] ??
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
