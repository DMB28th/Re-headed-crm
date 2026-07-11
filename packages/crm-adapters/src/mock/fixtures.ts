/**
 * In-memory fixture portal for the MockCrmAdapter (HubSpot-flavored).
 * Sized per PLAN.md: ~15 deals, ~20 contacts, ~10 companies, associations,
 * activity, saved views, tasks, flows, validation rules. Some fields have
 * empty descriptions ON PURPOSE — they feed the V3 metadata-coverage nudge.
 */
import type {
  ActivityEntry,
  CrmTask,
  FieldDescribe,
  FlowSummary,
  ObjectDescribe,
  RecentRecord,
  RuleSummary,
  SavedView,
} from "@cardstack/core";

export const DEAL_STAGES = [
  "Discovery",
  "Qualification",
  "Proposal",
  "Negotiation",
  "Contract sent",
  "Closed won",
  "Closed lost",
] as const;

const dealFields: FieldDescribe[] = [
  { api: "dealname", label: "Deal name", type: "string", required: true, readOnly: false, description: "Short descriptive name; convention is Company — motion (e.g. renewal, expansion)." },
  { api: "amount", label: "Amount", type: "currency", required: false, readOnly: false, description: "ARR value of the deal, not TCV.", currencyCode: "USD" },
  { api: "closedate", label: "Close date", type: "date", required: false, readOnly: false, description: "Expected signature date, not go-live." },
  { api: "dealstage", label: "Stage", type: "picklist", required: true, readOnly: false, values: [...DEAL_STAGES], description: "Pipeline stage. 'Contract sent' means paper is out for signature." },
  { api: "pipeline", label: "Pipeline", type: "string", required: false, readOnly: false },
  { api: "next_step", label: "Next step", type: "textarea", required: false, readOnly: false },
  { api: "deal_owner", label: "Deal owner", type: "string", required: false, readOnly: false },
  { api: "renewal_date", label: "Renewal date", type: "date", required: false, readOnly: false, description: "Contract anniversary; drives the renewal pipeline." },
  { api: "deal_type", label: "Deal type", type: "picklist", required: false, readOnly: false, values: ["New business", "Renewal", "Expansion"] },
  { api: "forecast_amount", label: "Forecast amount", type: "currency", required: false, readOnly: true, description: "Computed: amount × stage probability. Read-only.", currencyCode: "USD" },
  { api: "health_score", label: "Health score", type: "number", required: false, readOnly: true },
  { api: "commission", label: "Commission", type: "currency", required: false, readOnly: false, currencyCode: "USD" },
  { api: "loss_reason", label: "Loss reason", type: "picklist", required: false, readOnly: false, values: ["Price", "Competitor", "No decision", "Product gap"] },
  { api: "company", label: "Company", type: "string", required: false, readOnly: true, description: "Primary associated company (flattened from the association by the adapter)." },
];

const contactFields: FieldDescribe[] = [
  { api: "name", label: "Name", type: "string", required: true, readOnly: false },
  { api: "jobtitle", label: "Job title", type: "string", required: false, readOnly: false },
  { api: "email", label: "Email", type: "email", required: false, readOnly: false },
  { api: "phone", label: "Phone", type: "phone", required: false, readOnly: false },
  { api: "role", label: "Role", type: "picklist", required: false, readOnly: false, values: ["Decision maker", "Champion", "Influencer", "Blocker"], description: "Buying-committee role on the associated deal." },
  { api: "company", label: "Company", type: "string", required: false, readOnly: false },
];

const companyFields: FieldDescribe[] = [
  { api: "name", label: "Company name", type: "string", required: true, readOnly: false },
  { api: "domain", label: "Domain", type: "url", required: false, readOnly: false },
  { api: "industry", label: "Industry", type: "string", required: false, readOnly: false },
  { api: "annualrevenue", label: "Annual revenue", type: "currency", required: false, readOnly: false, currencyCode: "USD" },
];

export const OBJECTS: Record<string, ObjectDescribe> = {
  deals: {
    api: "deals", label: "Deal", labelPlural: "Deals", custom: false,
    fields: dealFields,
    relationships: [
      { api: "deal_contacts", label: "Contacts", relatedObject: "contacts" },
      { api: "deal_company", label: "Company", relatedObject: "companies" },
    ],
  },
  contacts: {
    api: "contacts", label: "Contact", labelPlural: "Contacts", custom: false,
    fields: contactFields,
    relationships: [],
  },
  companies: {
    api: "companies", label: "Company", labelPlural: "Companies", custom: false,
    fields: companyFields,
    relationships: [{ api: "company_deals", label: "Deals", relatedObject: "deals" }],
  },
};

export interface FixtureRecord {
  id: string;
  fields: Record<string, string | number | boolean | null>;
}

/* 7 OPEN deals over $50k (golden path 1); 15 total. */
export const DEALS: FixtureRecord[] = [
  { id: "d-001", fields: { dealname: "Meridian Health — annual renewal", amount: 128400, closedate: "2026-07-31", dealstage: "Contract sent", pipeline: "Sales pipeline", next_step: "Countersign and schedule kickoff with clinical ops.", deal_owner: "Dan K.", renewal_date: "2026-08-01", deal_type: "Renewal", forecast_amount: 115560, health_score: 86, commission: 12840, loss_reason: null, company: "Meridian Health Systems" } },
  { id: "d-002", fields: { dealname: "Ardent Logistics — expansion", amount: 94000, closedate: "2026-08-14", dealstage: "Negotiation", pipeline: "Sales pipeline", next_step: "Legal reviewing MSA redlines.", deal_owner: "Priya N.", renewal_date: null, deal_type: "Expansion", forecast_amount: 65800, health_score: 74, commission: 9400, loss_reason: null, company: "Ardent Logistics" } },
  { id: "d-003", fields: { dealname: "Bluepeak Analytics — new business", amount: 76500, closedate: "2026-08-28", dealstage: "Proposal", pipeline: "Sales pipeline", next_step: "Proposal review call Thursday.", deal_owner: "Dan K.", renewal_date: null, deal_type: "New business", forecast_amount: 38250, health_score: 68, commission: 7650, loss_reason: null, company: "Bluepeak Analytics" } },
  { id: "d-004", fields: { dealname: "Nordwind Travel — renewal", amount: 68000, closedate: "2026-09-04", dealstage: "Negotiation", pipeline: "Sales pipeline", next_step: "Waiting on procurement portal invite.", deal_owner: "Priya N.", renewal_date: "2026-09-15", deal_type: "Renewal", forecast_amount: 47600, health_score: 71, commission: 6800, loss_reason: null, company: "Nordwind Travel" } },
  { id: "d-005", fields: { dealname: "Cobalt Manufacturing — pilot to production", amount: 61200, closedate: "2026-09-30", dealstage: "Discovery", pipeline: "Sales pipeline", next_step: "Site visit with plant manager.", deal_owner: "Marta S.", renewal_date: null, deal_type: "Expansion", forecast_amount: 12240, health_score: 55, commission: 6120, loss_reason: null, company: "Cobalt Manufacturing" } },
  { id: "d-006", fields: { dealname: "Helix Biotech — platform", amount: 55000, closedate: "2026-08-21", dealstage: "Qualification", pipeline: "Sales pipeline", next_step: null, deal_owner: "Dan K.", renewal_date: null, deal_type: "New business", forecast_amount: 16500, health_score: 61, commission: 5500, loss_reason: null, company: "Helix Biotech" } },
  { id: "d-007", fields: { dealname: "Summit Ridge Insurance — claims suite", amount: 52300, closedate: "2026-09-12", dealstage: "Proposal", pipeline: "Sales pipeline", next_step: "Security questionnaire due Friday.", deal_owner: "Marta S.", renewal_date: null, deal_type: "New business", forecast_amount: 26150, health_score: 65, commission: 5230, loss_reason: null, company: "Summit Ridge Insurance" } },
  { id: "d-008", fields: { dealname: "Fernwood Media — starter", amount: 42000, closedate: "2026-08-07", dealstage: "Negotiation", pipeline: "Sales pipeline", next_step: "Discount approval pending.", deal_owner: "Priya N.", renewal_date: null, deal_type: "New business", forecast_amount: 29400, health_score: 70, commission: 4200, loss_reason: null, company: "Fernwood Media" } },
  { id: "d-009", fields: { dealname: "Quarry & Co — data add-on", amount: 38500, closedate: "2026-10-02", dealstage: "Discovery", pipeline: "Sales pipeline", next_step: null, deal_owner: "Dan K.", renewal_date: null, deal_type: "Expansion", forecast_amount: 7700, health_score: 52, commission: 3850, loss_reason: null, company: "Quarry & Co" } },
  { id: "d-010", fields: { dealname: "Lakeshore Dental — group plan", amount: 24000, closedate: "2026-09-18", dealstage: "Proposal", pipeline: "Sales pipeline", next_step: "Send revised seat count.", deal_owner: "Marta S.", renewal_date: null, deal_type: "New business", forecast_amount: 12000, health_score: 63, commission: 2400, loss_reason: null, company: "Lakeshore Dental" } },
  { id: "d-011", fields: { dealname: "Orbital Systems — trial conversion", amount: 18000, closedate: "2026-08-25", dealstage: "Qualification", pipeline: "Sales pipeline", next_step: null, deal_owner: "Priya N.", renewal_date: null, deal_type: "New business", forecast_amount: 5400, health_score: 58, commission: 1800, loss_reason: null, company: "Orbital Systems" } },
  { id: "d-012", fields: { dealname: "Pinebrook Schools — district license", amount: 150000, closedate: "2026-06-20", dealstage: "Closed won", pipeline: "Sales pipeline", next_step: null, deal_owner: "Dan K.", renewal_date: "2027-06-20", deal_type: "New business", forecast_amount: 150000, health_score: 92, commission: 15000, loss_reason: null, company: "Pinebrook Schools" } },
  { id: "d-013", fields: { dealname: "Vantage Retail — POS integration", amount: 87000, closedate: "2026-06-30", dealstage: "Closed lost", pipeline: "Sales pipeline", next_step: null, deal_owner: "Marta S.", renewal_date: null, deal_type: "New business", forecast_amount: 0, health_score: 20, commission: 0, loss_reason: "Competitor", company: "Vantage Retail" } },
  { id: "d-014", fields: { dealname: "Copperline Energy — starter", amount: 9500, closedate: "2026-09-26", dealstage: "Discovery", pipeline: "Sales pipeline", next_step: null, deal_owner: "Priya N.", renewal_date: null, deal_type: "New business", forecast_amount: 1900, health_score: 49, commission: 950, loss_reason: null, company: "Copperline Energy" } },
  { id: "d-015", fields: { dealname: "Atlas Freight — starter", amount: 12750, closedate: "2026-10-09", dealstage: "Qualification", pipeline: "Sales pipeline", next_step: null, deal_owner: "Dan K.", renewal_date: null, deal_type: "New business", forecast_amount: 3825, health_score: 57, commission: 1275, loss_reason: null, company: "Atlas Freight" } },
];

export const CONTACTS: FixtureRecord[] = [
  { id: "c-001", fields: { name: "Rachel Sato", jobtitle: "CFO", email: "rsato@meridianhealth.example", phone: "+1 415 555 0141", role: "Decision maker", company: "Meridian Health Systems" } },
  { id: "c-002", fields: { name: "Marcus Oyelaran", jobtitle: "VP Clinical Ops", email: "m.oyelaran@meridianhealth.example", phone: "+1 415 555 0176", role: "Champion", company: "Meridian Health Systems" } },
  { id: "c-003", fields: { name: "Dana Whitfield", jobtitle: "IT Director", email: "dwhitfield@meridianhealth.example", phone: null, role: "Influencer", company: "Meridian Health Systems" } },
  { id: "c-004", fields: { name: "Elena Brandt", jobtitle: "Head of Procurement", email: "e.brandt@meridianhealth.example", phone: null, role: "Influencer", company: "Meridian Health Systems" } },
  { id: "c-005", fields: { name: "Sam Kessler", jobtitle: "Security Lead", email: "skessler@meridianhealth.example", phone: null, role: "Blocker", company: "Meridian Health Systems" } },
  { id: "c-006", fields: { name: "Tomas Rivera", jobtitle: "COO", email: "t.rivera@ardentlog.example", phone: "+1 312 555 0102", role: "Decision maker", company: "Ardent Logistics" } },
  { id: "c-007", fields: { name: "Aisha Bello", jobtitle: "Ops Analyst", email: "a.bello@ardentlog.example", phone: null, role: "Champion", company: "Ardent Logistics" } },
  { id: "c-008", fields: { name: "Greg Lindqvist", jobtitle: "CTO", email: "greg@bluepeak.example", phone: null, role: "Decision maker", company: "Bluepeak Analytics" } },
  { id: "c-009", fields: { name: "Mina Chow", jobtitle: "Data Lead", email: "mina@bluepeak.example", phone: null, role: "Champion", company: "Bluepeak Analytics" } },
  { id: "c-010", fields: { name: "Ola Nordvik", jobtitle: "Managing Director", email: "ola@nordwind.example", phone: "+47 22 55 01 03", role: "Decision maker", company: "Nordwind Travel" } },
  { id: "c-011", fields: { name: "Petra Kaminski", jobtitle: "Procurement Manager", email: "p.kaminski@nordwind.example", phone: null, role: "Influencer", company: "Nordwind Travel" } },
  { id: "c-012", fields: { name: "Ray Donnelly", jobtitle: "Plant Manager", email: "rdonnelly@cobaltmfg.example", phone: null, role: "Champion", company: "Cobalt Manufacturing" } },
  { id: "c-013", fields: { name: "Ingrid Falk", jobtitle: "VP Research", email: "ifalk@helixbio.example", phone: null, role: "Decision maker", company: "Helix Biotech" } },
  { id: "c-014", fields: { name: "Jo Hartley", jobtitle: "Claims Director", email: "jhartley@summitridge.example", phone: null, role: "Champion", company: "Summit Ridge Insurance" } },
  { id: "c-015", fields: { name: "Luis Ferreira", jobtitle: "CEO", email: "luis@fernwood.example", phone: null, role: "Decision maker", company: "Fernwood Media" } },
  { id: "c-016", fields: { name: "Beth Anand", jobtitle: "Office Manager", email: "beth@lakeshoredental.example", phone: null, role: "Decision maker", company: "Lakeshore Dental" } },
  { id: "c-017", fields: { name: "Viktor Hale", jobtitle: "Founder", email: "viktor@orbital.example", phone: null, role: "Decision maker", company: "Orbital Systems" } },
  { id: "c-018", fields: { name: "Nadia Osei", jobtitle: "Superintendent", email: "n.osei@pinebrook.example", phone: null, role: "Decision maker", company: "Pinebrook Schools" } },
  { id: "c-019", fields: { name: "Carl Jensen", jobtitle: "Retail Ops Lead", email: "carl@vantageretail.example", phone: null, role: "Champion", company: "Vantage Retail" } },
  { id: "c-020", fields: { name: "Faye Ito", jobtitle: "Logistics Coordinator", email: "faye@atlasfreight.example", phone: null, role: "Influencer", company: "Atlas Freight" } },
];

export const COMPANIES: FixtureRecord[] = [
  { id: "co-01", fields: { name: "Meridian Health Systems", domain: "meridianhealth.example", industry: "Healthcare", annualrevenue: 220000000 } },
  { id: "co-02", fields: { name: "Ardent Logistics", domain: "ardentlog.example", industry: "Transportation", annualrevenue: 95000000 } },
  { id: "co-03", fields: { name: "Bluepeak Analytics", domain: "bluepeak.example", industry: "Software", annualrevenue: 18000000 } },
  { id: "co-04", fields: { name: "Nordwind Travel", domain: "nordwind.example", industry: "Travel", annualrevenue: 41000000 } },
  { id: "co-05", fields: { name: "Cobalt Manufacturing", domain: "cobaltmfg.example", industry: "Manufacturing", annualrevenue: 130000000 } },
  { id: "co-06", fields: { name: "Helix Biotech", domain: "helixbio.example", industry: "Biotech", annualrevenue: 27000000 } },
  { id: "co-07", fields: { name: "Summit Ridge Insurance", domain: "summitridge.example", industry: "Insurance", annualrevenue: 88000000 } },
  { id: "co-08", fields: { name: "Fernwood Media", domain: "fernwood.example", industry: "Media", annualrevenue: 12000000 } },
  { id: "co-09", fields: { name: "Pinebrook Schools", domain: "pinebrook.example", industry: "Education", annualrevenue: 0 } },
  { id: "co-10", fields: { name: "Vantage Retail", domain: "vantageretail.example", industry: "Retail", annualrevenue: 305000000 } },
];

/** dealId → contactIds (buying committee), in display order. */
export const DEAL_CONTACT_ASSOCIATIONS: Record<string, string[]> = {
  "d-001": ["c-001", "c-002", "c-003", "c-004", "c-005"],
  "d-002": ["c-006", "c-007"],
  "d-003": ["c-008", "c-009"],
  "d-004": ["c-010", "c-011"],
  "d-005": ["c-012"],
  "d-006": ["c-013"],
  "d-007": ["c-014"],
  "d-008": ["c-015"],
  "d-010": ["c-016"],
  "d-011": ["c-017"],
  "d-012": ["c-018"],
  "d-013": ["c-019"],
  "d-015": ["c-020"],
};

export const ACTIVITY: Record<string, ActivityEntry[]> = {
  "d-001": [
    { id: "a-101", kind: "email", summary: "Contract emailed to Rachel Sato", timestamp: "2026-07-08T15:12:00Z" },
    { id: "a-102", kind: "call", summary: "Call — pricing objection resolved", timestamp: "2026-07-04T17:30:00Z" },
    { id: "a-103", kind: "meeting", summary: "Renewal review with clinical ops", timestamp: "2026-06-26T16:00:00Z" },
    { id: "a-104", kind: "note", summary: "Security questionnaire cleared", timestamp: "2026-06-19T09:41:00Z" },
  ],
  "d-002": [
    { id: "a-201", kind: "email", summary: "MSA redlines sent to legal", timestamp: "2026-07-07T11:02:00Z" },
    { id: "a-202", kind: "meeting", summary: "Expansion scoping with ops team", timestamp: "2026-06-30T14:00:00Z" },
  ],
  "d-003": [
    { id: "a-301", kind: "call", summary: "Discovery recap; proposal promised", timestamp: "2026-07-02T18:20:00Z" },
  ],
  "d-004": [
    { id: "a-401", kind: "note", summary: "Procurement portal registration pending", timestamp: "2026-07-06T08:15:00Z" },
  ],
};

export const SAVED_VIEWS: SavedView[] = [
  { id: "v-01", object: "deals", name: "My open deals", filterSummary: "Owner is me · Stage is not Closed won/lost", visibility: "shared" },
  { id: "v-02", object: "deals", name: "Closing this quarter", filterSummary: "Close date this quarter · Stage is open", visibility: "shared" },
  { id: "v-03", object: "deals", name: "Renewals — next 90 days", filterSummary: "Renewal date within 90 days", visibility: "shared" },
  { id: "v-04", object: "deals", name: "Big deals (>$50k)", filterSummary: "Amount over $50,000 · Stage is open", visibility: "private" },
];

export const TASKS: CrmTask[] = [
  { id: "t-01", subject: "Countersign Meridian renewal", dueDate: "2026-07-11", status: "open", relatedRecordId: "d-001", relatedRecordName: "Meridian Health — annual renewal" },
  { id: "t-02", subject: "Chase Ardent legal on MSA", dueDate: "2026-07-09", status: "open", relatedRecordId: "d-002", relatedRecordName: "Ardent Logistics — expansion" },
  { id: "t-03", subject: "Prep Bluepeak proposal review", dueDate: "2026-07-10", status: "open", relatedRecordId: "d-003", relatedRecordName: "Bluepeak Analytics — new business" },
  { id: "t-04", subject: "Send Summit Ridge security questionnaire", dueDate: "2026-07-08", status: "open", relatedRecordId: "d-007", relatedRecordName: "Summit Ridge Insurance — claims suite" },
  { id: "t-05", subject: "Book Cobalt site visit", dueDate: "2026-07-15", status: "open", relatedRecordId: "d-005", relatedRecordName: "Cobalt Manufacturing — pilot to production" },
  { id: "t-06", subject: "Log Pinebrook kickoff notes", dueDate: "2026-07-01", status: "completed", relatedRecordId: "d-012", relatedRecordName: "Pinebrook Schools — district license" },
];

export const RECENT_RECORDS: RecentRecord[] = [
  { id: "d-001", object: "deals", name: "Meridian Health — annual renewal", note: "Contract emailed to Rachel Sato", timestamp: "2026-07-08T15:12:00Z" },
  { id: "d-002", object: "deals", name: "Ardent Logistics — expansion", note: "MSA redlines sent to legal", timestamp: "2026-07-07T11:02:00Z" },
  { id: "c-001", object: "contacts", name: "Rachel Sato", note: "Opened the proposal twice yesterday", timestamp: "2026-07-06T19:40:00Z" },
  { id: "d-004", object: "deals", name: "Nordwind Travel — renewal", note: "Procurement portal registration pending", timestamp: "2026-07-06T08:15:00Z" },
  { id: "co-01", object: "companies", name: "Meridian Health Systems", note: "New security contact added", timestamp: "2026-07-05T10:05:00Z" },
];

export const VALIDATION_RULES: RuleSummary[] = [
  { id: "r-01", name: "Loss reason required when Closed lost", fields: ["dealstage", "loss_reason"], errorMessage: "Loss reason is required when the deal stage is Closed lost." },
  { id: "r-02", name: "Amount must be positive", fields: ["amount"], errorMessage: "Amount must be greater than zero." },
];

export const FLOWS: FlowSummary[] = [
  { api: "Renewal_Playbook", label: "Renewal playbook", screens: 3, writesSummary: "Updates renewal date, creates follow-up task" },
  { api: "Discount_Approval", label: "Discount approval", screens: 2, writesSummary: "Creates approval request, updates amount" },
];

/** Field the demo tenant's config denies — must never reach a widget. */
export const DENYLISTED_FIELD = "commission";
