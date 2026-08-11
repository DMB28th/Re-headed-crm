# CRM MCP Apps — Project Plan

Configurable MCP Apps (SEP-1865) for Salesforce and HubSpot. Two deliverables:

1. **Admin Studio** — a hosted web UI where an admin connects their CRM, chooses which objects/fields to expose, and drag-and-drop designs the widget layout (record cards, related lists, actions, embedded Salesforce screen flows).
2. **MCP App Server** — a multi-tenant MCP server implementing the MCP Apps extension. Tools return `ui://` resources; a generic widget hydrates itself from the tenant's saved layout config + live record data, renders inline in Claude/ChatGPT/Copilot, and supports edits that write back to the CRM.

The core insight: the widget HTML is generic and shipped once. All customization lives in a **layout config JSON** produced by the Admin Studio and delivered to the widget via `structuredContent` at render time. Admins never touch code; the widget never hardcodes a schema.

---

## Architecture

```
┌─────────────────┐        ┌──────────────────────┐
│  Admin Studio    │──────▶│  Config Store         │
│  (Next.js)       │  save │  (Postgres, per-tenant │
│  - OAuth connect │  read │   layout configs +     │
│  - Field picker  │◀──────│   encrypted CRM tokens)│
│  - Layout builder│        └──────────┬───────────┘
└─────────────────┘                    │
                                       ▼
┌─────────────────┐        ┌──────────────────────┐        ┌──────────────┐
│  Claude / GPT /  │  MCP   │  MCP App Server       │  REST  │  Salesforce  │
│  Copilot (host)  │◀──────▶│  (TS, streamable HTTP,│◀──────▶│  HubSpot     │
│  sandboxed iframe│        │   stateless, OAuth2.1)│        │  (adapters)  │
└─────────────────┘        └──────────────────────┘        └──────────────┘
```

### Monorepo layout

```
crm-mcp-apps/
├── apps/
│   ├── studio/            # Next.js admin UI (layout builder, OAuth, tenant mgmt)
│   └── mcp-server/        # MCP server, streamable HTTP transport, stateless JSON
├── packages/
│   ├── core/              # Layout config schema (zod), shared types
│   ├── crm-adapters/      # CrmAdapter interface + salesforce/ + hubspot/ impls
│   └── widgets/           # MCP App widget source → Vite build → self-contained HTML
├── docker-compose.yml     # Postgres + local dev
└── PLAN.md                # this file
```

### Stack

- **TypeScript everywhere.** MCP TypeScript SDK + `@modelcontextprotocol/ext-apps` for the Apps extension helpers (`registerAppTool`, `registerAppResource`).
- **MCP server:** streamable HTTP, stateless JSON (no sessions), OAuth 2.1 for host↔server auth. Deployable as a single Node service.
- **Widgets:** React + Vite with `vite-plugin-singlefile` (or equivalent) so each widget compiles to one self-contained HTML payload — the MCP Apps spec requires the resource to contain everything (no runtime loads from our servers).
- **Studio:** Next.js + a drag-and-drop lib (`dnd-kit`) for the layout builder.
- **DB:** Postgres. Tables: `tenants`, `crm_connections` (encrypted OAuth tokens, refresh handling), `layout_configs` (versioned JSON), `audit_log`.

---

## Part 1: The Layout Config (the contract between everything)

Design this schema first — Studio writes it, the server serves it, the widget renders from it.

```jsonc
{
  "version": 1,
  "tenantId": "t_abc123",
  "crm": "salesforce",                    // or "hubspot"
  "object": "Opportunity",                // or HubSpot object type e.g. "deals"
  "listView": {
    "columns": ["Name", "StageName", "Amount", "CloseDate", "Owner.Name"],
    "defaultSort": { "field": "CloseDate", "dir": "asc" },
    "rowActions": ["open_record", "quick_stage_change"]
  },
  "recordCard": {
    "header": { "title": "Name", "subtitle": "Account.Name", "badge": "StageName" },
    "sections": [
      {
        "label": "Deal Details",
        "columns": 2,
        "fields": [
          { "api": "Amount", "editable": true },
          { "api": "CloseDate", "editable": true },
          { "api": "StageName", "editable": true, "control": "picklist" },
          { "api": "NextStep", "editable": true, "control": "textarea" }
        ]
      }
    ],
    "relatedLists": [
      { "object": "Contact", "relationship": "OpportunityContactRoles",
        "columns": ["Contact.Name", "Role"], "limit": 5 },
      { "object": "Task", "relationship": "Tasks",
        "columns": ["Subject", "ActivityDate", "Status"], "limit": 5 }
    ],
    "actions": [
      { "type": "update_record", "label": "Save" },
      { "type": "create_related", "object": "Task", "label": "Log Task" },
      { "type": "screen_flow", "flowApiName": "Renewal_Playbook",
        "label": "Run Renewal Playbook", "embed": "iframe" }   // SFDC only, Phase 4
    ]
  },
  "permissions": {
    "writeEnabled": true,
    "fieldDenylist": ["Commission__c"],   // never expose even if in CRM
    "requireConfirmation": true            // host-side confirm before writes
  }
}
```

Rules:
- **Denylist enforcement happens server-side**, not in the widget. The widget only ever receives fields the config allows. Never trust the iframe.
- Field metadata (labels, types, picklist values, required flags) is fetched live from the CRM describe/properties APIs and merged into the payload at render time — the config stores API names only, so it doesn't rot when admins rename labels.
- Configs are versioned; the server always serves the latest published version.

---

## Part 2: CRM Adapter Interface

One interface, two implementations. Everything above the adapter is CRM-agnostic.

```typescript
interface CrmAdapter {
  // Metadata
  listObjects(): Promise<ObjectSummary[]>;
  describeObject(objectApi: string): Promise<ObjectDescribe>;  // fields, types, picklists, relationships

  // Data
  search(objectApi: string, query: SearchQuery): Promise<RecordPage>;
  getRecord(objectApi: string, id: string, fields: string[]): Promise<CrmRecord>;
  getRelated(parentId: string, rel: RelatedListConfig): Promise<RecordPage>;
  updateRecord(objectApi: string, id: string, patch: FieldPatch): Promise<CrmRecord>;
  createRecord(objectApi: string, fields: FieldPatch): Promise<CrmRecord>;

  // Auth
  refreshTokenIfNeeded(): Promise<void>;
}
```

**Salesforce adapter:**
- OAuth 2.0 web server flow (Connected App / External Client App). Store refresh token encrypted.
- Use the **UI API** (`/ui-api/record-ui/{id}`) where possible — it returns records *with* layout-aware metadata, respects FLS, and gives picklist values in one call. Fall back to REST + `/sobjects/{obj}/describe`.
- SOQL for related lists and search (SOSL for cross-object search).
- Respect FLS/sharing implicitly: all calls run as the connected user, so Salesforce enforces its own permissions on top of our config layer. This is a selling point — document it.

**HubSpot adapter:**
- OAuth app with granular scopes (crm.objects.deals.read/write etc.).
- CRM v3 Objects API + Properties API (describe equivalent) + Associations v4 (related records equivalent) + Search API.
- Map HubSpot's property groups → our sections concept for smart defaults.

---

## Part 3: MCP App Server

### Tool surface (v1)

| Tool | UI? | Notes |
|---|---|---|
| `crm_list_objects` | no | What's configured for this tenant. Model-facing discovery. |
| `crm_search` | **widget: results table** | Args: object, query text, filters. Returns list per `listView` config. |
| `crm_get_record` | **widget: record card** | The flagship. Renders the configured card with sections, related lists, inline edit. |
| `crm_update_record` | no (widget-invoked) | Called by the widget via tool-call-from-view, or by the model directly. `destructiveHint: false`, `readOnlyHint: false`. |
| `crm_create_record` | no (widget-invoked) | Same pattern. |
| `crm_get_related` | no | Pagination for related lists ("show more" in widget). |

### MCP Apps mechanics (follow SEP-1865 exactly)

- Register each widget HTML as a resource with `mimeType: text/html+mcp` at `ui://crm-apps/record-card` and `ui://crm-apps/results-table`.
- Tools declare `_meta: { ui: { resourceUri: "ui://crm-apps/record-card" } }`.
- Tool responses split into:
  - `content` (text) — a compact model-facing summary ("Rendered Opportunity 'Acme Renewal', stage Negotiation, $120k"). Keep it short; the widget carries the detail. Also serves as fallback for non-supporting hosts.
  - `structuredContent` — hidden from the model, hydrates the widget: `{ layoutConfig, describeMeta, record, related }`.
- Widget → host communication:
  - Inline edits call `crm_update_record` back through the host (auditable, user-confirmable) — do NOT call our API directly from the iframe.
  - Use `updateModelContext` after edits so the model knows the current record state without burning tokens on every keystroke (debounced, last-write-wins).
  - `sendMessage` for "ask Claude about this record" affordances.
- Host theming: read the CSS variables / light-dark mode the host passes at init so the widget looks native.

### Multi-tenancy

- The MCP connection is per-user (OAuth 2.1). Token maps to tenant + CRM connection.
- Stateless server: every request resolves tenant → config → adapter from the DB. No in-memory sessions.

---

## Part 4: Admin Studio

### Screens

1. **Connect** — OAuth flows for Salesforce (prod/sandbox picker) and HubSpot. Show connection health, token refresh status.
2. **Objects** — list of CRM objects (from `listObjects`), toggle which are exposed. Smart defaults: Opportunity/Deal, Account/Company, Contact, Case/Ticket.
3. **Layout Builder** (the centerpiece) —
   - Left panel: available fields (from live describe, searchable, grouped by field type / HubSpot property group).
   - Canvas: drag fields into sections, reorder sections, set columns, toggle editable per field, pick control type overrides.
   - Related lists: pick relationship, choose columns, set limit.
   - Actions: toggle save/create actions; (Phase 4) attach a screen flow.
   - **Live preview**: render the actual widget component (same code as `packages/widgets`) against a sample record. Studio imports the widget package directly — one render codepath, guaranteed fidelity.
4. **Permissions** — write toggle, field denylist, confirmation requirements.
5. **Publish** — version the config, activate.

### Build notes

- The preview reusing the real widget component is the single most important Studio decision. Do not build a separate preview renderer.
- Persist drafts vs published versions. Simple: `layout_configs(status: draft|published, version)`.

---

## Part 5: Screen Flows / LWC embeds (Salesforce) — ⚠️ SPIKE FIRST

This is the highest-risk feature. Do not build until the spike proves it.

**The problem:** MCP App widgets run in a *sandboxed iframe* inside the host. Embedding a Salesforce screen flow means an iframe-within-a-sandboxed-iframe pointed at a Salesforce-hosted page. Constraints:

1. **Lightning Out** is in maintenance mode and has auth/CSP pain. Avoid.
2. **Viable path:** host the flow on an **Experience Cloud (LWR) page**, configure Salesforce CSP `frame-ancestors` to allow the host sandbox origin, and embed via `<iframe>` in the widget. Auth via Experience Cloud session or login redirect.
3. **Unknowns to spike:** does the host's iframe sandbox attribute set (`allow-scripts`, `allow-same-origin`?, `allow-forms`?) permit a nested cross-origin iframe with the capabilities a flow needs? Does Claude's sandbox allow it at all? Test with a trivial flow before designing anything.
4. **Fallback if blocked:** "flow launcher" pattern — widget shows a button that opens the flow in a new browser tab (`openLink`), and a completion webhook/polling updates the widget. Less magical, always works.

Treat LWC embedding the same way: if it works, it works via the same Experience Cloud page mechanism, not Lightning Out.

---

## Phases

**Phase 0 — Hello-world spike (1–2 sessions)**
- Minimal MCP server with one tool + one static widget resource. Connect to Claude.ai, confirm the widget renders, confirm widget→tool round trip and `updateModelContext` work. Clone an example from `github.com/modelcontextprotocol/ext-apps` and modify.
- Exit criteria: a button in a widget in Claude triggers a tool call and the model sees the result.

**Phase 1 — Read-only record card, HubSpot first**
- HubSpot adapter (read paths), hardcoded layout config (no Studio yet), `crm_search` + `crm_get_record` with widgets.
- HubSpot before Salesforce: simpler OAuth, no sandbox/org provisioning friction, faster iteration. (Salesforce adapter lands in Phase 2 — the adapter interface keeps it honest.)
- Exit criteria: "show me the Acme deal" in Claude renders a real record card from a real HubSpot portal.

**Phase 2 — Salesforce adapter + writes**
- Salesforce adapter (UI API), `crm_update_record` with widget inline editing, confirmation flow, audit log.
- Exit criteria: edit an Opportunity stage from inside Claude, verify in Salesforce, see the change reflected via `updateModelContext`.

**Phase 3 — Admin Studio**
- Next.js app: OAuth connect, object toggles, drag-and-drop layout builder with live preview, publish/versioning. Server reads config from DB instead of hardcoded JSON.
- Exit criteria: change a layout in Studio, re-render in Claude, see the new layout with zero code changes.

**Phase 4 — Screen flow embed spike → build or fallback**
- Run the spike from Part 5. Build iframe embed if viable, flow-launcher fallback if not.

**Phase 5 — Production hardening**
- Multi-tenant onboarding, token encryption at rest (KMS), rate limiting, retries/backoff on CRM APIs, OAuth 2.1 server metadata for MCP registry listing, ChatGPT + Copilot host testing, evals (10 read-only Q&A pairs per the MCP eval pattern).

---

## Security requirements (non-negotiable, all phases)

- Field denylist and object allowlist enforced **server-side**; the widget receives only permitted data.
- All writes flow widget → host → MCP tool call (auditable + user-confirmed), never widget → our API directly.
- CRM tokens encrypted at rest; per-tenant isolation on every query (no cross-tenant config/record leakage — test this explicitly).
- Widget HTML contains no secrets, no tenant data at build time; everything arrives via `structuredContent`.
- The CRM's own permission model (Salesforce FLS/sharing, HubSpot scopes) remains the floor — our config only ever narrows, never widens.

## Open questions to resolve during Phase 0/1

1. Exact `_meta` key shape and SDK helpers in the current `ext-apps` release — the spec moved fast between proposal and GA; read the shipped SDK, not blog posts.
2. Does Claude.ai's sandbox support nested cross-origin iframes (gates Phase 4)?
3. `text/html+mcp` payload size limits per host — affects how much we can inline into one widget bundle.
4. View-local tools and host-push-to-view landed in the spec updates? If so, prefer them over the polling patterns.

## Reference material for Claude Code to fetch

- MCP Apps announcement + spec: `https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/` and SEP-1865
- Examples repo: `https://github.com/modelcontextprotocol/ext-apps` (clone; start from an example server)
- MCP TS SDK: `https://github.com/modelcontextprotocol/typescript-sdk`
- Salesforce UI API: record-ui and describe endpoints
- HubSpot CRM v3 Objects / Properties / Associations v4 / Search APIs

---

# Vision & Roadmap Ideas (post-Phase-5 direction)

These are NOT in scope for Phases 0–5, but the config schema and adapter interface
should be designed so none of them require breaking changes. Where a decision today
affects one of these, note it in code comments.

## V1. Role-based layouts (audiences)

One object, multiple published layouts, resolved per user at render time.
- Add `audience` to layout_configs: `{ audienceId, name, memberRule }`. Member rules
  map to CRM-native concepts (Salesforce profile/permission set/role; HubSpot team)
  — never hand-maintained user lists.
- Resolution precedence: individual override > audience rule (explicit, admin-ordered
  priority) > default layout. Exactly one default per object always exists.
- AE sees Amount/Stage/NextStep with write access; CS sees HealthScore/RenewalDate
  read-only; exec sees a rollup summary card. Same tool call, different card.
- Studio assignment page is fully specced in DESIGN-BRIEF.md §6 (simple list +
  matrix views, "view as" preview with match trace, coverage strip, drift states).
- Schema prep NOW: make `layout_configs` keyed on (tenant, object, audience) with a
  `default` audience, even if v1 only ever has one. Store audience `memberRule` as
  a CRM-native reference (profile/team id), resolved at render time.

## V2. Conditional visibility & dynamic layouts

Fields/sections/actions that appear based on record state — the Lightning Dynamic
Forms equivalent.
- Config addition: `visibleWhen: { field, op, value }` on any field/section/action.
  Example: show "Churn reason" section only when StageName = "Closed Lost".
- Evaluate server-side where possible (don't ship hidden data to the iframe), with
  simple client-side re-evaluation for fields edited live in the widget.

## V3. Context annotations (the Contextary crossover)

Semantic notes about fields/objects, invisible to the user but injected into the
**model-facing `content` text** of every tool response. Example: "Amount is ARR,
not TCV", "Ignore StageName for renewals — use Renewal_Stage__c".

**Source of truth is the CRM's own metadata — NOT a new place to type things in.**
- Salesforce: field `description` and `inlineHelpText`, object description,
  picklist value labels/descriptions — all already returned by describe/UI API.
- HubSpot: property `description`, property group names — returned by the
  Properties API.
- The adapter's `describeObject()` already fetches this; the server pipes it into
  the model-facing content for exposed fields. Zero new admin surface area.
- This creates the right incentive loop: better CRM metadata hygiene → smarter
  model → admins finally have a reason to fill in field descriptions.
- Studio's role is **coverage, not authoring**: show "34 of 60 exposed fields have
  no description" and deep-link to edit the field *in the CRM*. Never store
  annotation text in our DB.
- Long-term: a Contextary handbook can be an *additional* metadata source merged
  at describe time — still not hand-typed in Studio.
- Widget makes the human effective; metadata makes the model effective. Same
  describe call, two consumers.

## V4. More widget types (each is just a new ui:// resource + config section)

| Widget | What it renders | Notes |
|---|---|---|
| `pipeline-board` | Kanban of deals by stage, drag to change stage | Drag = `crm_update_record` call via host, confirmable |
| `queue` | "My open tasks / cases / leads" actionable list | Complete/snooze/reassign inline |
| `meeting-prep` | Composite card: account + open opps + recent activity + last emails | The single highest-value rep workflow; composes multiple adapter calls into one card |
| `create-form` | Elicitation form generated from config for `crm_create_record` | Required fields, picklists, validation from describe metadata |
| `forecast-rollup` | Metric cards + trend by stage/owner/period | Read-only, exec audience |
| `dedupe-merge` | Side-by-side duplicate records, pick surviving values | High-trust write; requires confirmation UX design |

## V5. Write governance (the enterprise wedge)

- **Dry-run preview**: every write renders a before/after diff in the widget; user
  confirms the diff, not the intent. Log both.
- **Field-level write rules**: per-audience editable flags (already in config);
  add value constraints (e.g., Amount changes >20% require a reason string).
- **Approval mode**: writes above a threshold create a pending change instead of
  committing; approver gets a queue widget. (Ships way later; schema-prep only.)
- **Audit UI in Studio**: who changed what, from which conversation, when. This is
  the compliance story that closes enterprise deals.

## V6. Layout template packs / marketplace

Prebuilt configs: "AE deal card", "CS renewal card", "SDR prospecting card",
"Support triage card". Import → map fields (assisted by describe metadata +
fuzzy match) → publish. Later: community-submitted packs. This is the PLG hook —
value in the first 10 minutes without touching the builder.

## V7. Usage analytics for admins

Instrument the widget (events → host `logging` affordance → our server): which
fields are viewed, edited, which actions clicked, which layouts never used.
Feed back into Studio: "Nobody has looked at these 6 fields in 90 days — remove
them?" Admins have NEVER had this for page layouts. Genuinely novel.

## V8. Distribution

- Publish to the MCP registry + submit to the Claude connectors directory once
  OAuth 2.1 + server metadata are solid (Phase 5).
- Also test in ChatGPT and M365 Copilot — same server, three distribution channels.
- Pricing sketch: free (1 object, 1 layout, read-only) → team (writes, all objects,
  audiences) → enterprise (governance, audit, approval mode, SSO).

---

# Paint the Picture — Golden Paths, Wireframes & Contracts

This section is the "what done looks like" reference. When in doubt about behavior,
UX, or payload shape, conform to these. Each golden path doubles as a manual
acceptance test at the end of its milestone.

## Golden Path 1 — Search → results → record (M1 exit demo)

```
User:   "pull up our open deals over $50k"
Model:  calls crm_search(object="deals", filters={amount_gt: 50000, stage_not: closed})
Server: resolves tenant → layout config → HubSpot adapter search
        returns content: "Found 7 open deals over $50k, largest is Meridian
                          Health at $128,400 (contract sent)."
        returns structuredContent: { layoutConfig.listView, rows[7] }
Widget: results table renders inline — columns from listView config
User:   clicks the "Meridian Health" row
Widget: sends followup → model calls crm_get_record(id)
Widget: record card renders (Golden Path 2's starting state)
```

## Golden Path 2 — Inline edit → confirmed write → model awareness (M2 exit demo)

```
User:   (record card is showing) changes Stage dropdown to "Negotiation",
        edits Amount to 135000, clicks [Save changes]
Widget: calls crm_update_record via the HOST (tool call, never direct API)
Host:   shows confirmation with before/after diff; user approves
Server: adapter PATCH → CRM; writes audit_log row
        (tenant, user, object, id, field diffs, conversation ref, timestamp)
Widget: re-renders with fresh values; pushes updateModelContext:
        "Deal 'Meridian Health' updated: stage Contract sent→Negotiation,
         amount 128400→135000"
User:   "what did I just change?"
Model:  answers correctly WITHOUT another tool call (context was pushed)
```

## Golden Path 3 — Studio publish → live layout change (M3 exit demo)

```
Admin:  in Studio, drags "Next step" field out of the card, adds "Renewal date",
        clicks Publish (config goes v4 → v5)
User:   (in Claude, same conversation as before) "show me the Meridian deal again"
Widget: record card renders v5 — Renewal date present, Next step gone
        NO code deploy happened. NO server restart. Config read at render time.
```

## Wireframes

### Record card widget (~680px wide in host)

```
┌────────────────────────────────────────────────────────────┐
│ [icon] Meridian Health — annual renewal      (Contract sent)│
│        Meridian Health Systems · Sales pipeline             │
│  Source: HubSpot                    Layout: "AE deal card" v4│
├────────────────────────────────────────────────────────────┤
│ DEAL DETAILS                                                 │
│  Amount        Close date      Stage ▾        Renewal owner  │
│  [$128,400 ]   [Jul 31, 2026]  [Contract sent] [Dan K.    ]  │
├──────────────────────────┬─────────────────────────────────┤
│ CONTACTS                 │ ACTIVITY TIMELINE                 │
│  (RS) Rachel Sato        │  ✉ Contract emailed · 2d ago      │
│       Decision maker·CFO │  ☎ Call — pricing resolved · 6d   │
│  (MO) Marcus Oyelaran    │                                   │
│       Champion · VP      │                                   │
├──────────────────────────┴─────────────────────────────────┤
│ [Save changes] [Enroll in sequence ↗] [Draft follow-up ↗]    │
│                              🔒 Writes require confirmation  │
└────────────────────────────────────────────────────────────┘
```

Layout rules: header = title/subtitle/badge from config. Sections render in config
order, `columns` controls the grid. Editable fields render as inputs/selects;
read-only as text. Related lists cap at `limit` with a "show more" that calls
crm_get_related. Action buttons: `update_record` submits dirty fields;
`screen_flow`/enrollment actions send a followup prompt. Footer lock line always
present when writeEnabled.

### Results table widget

```
┌────────────────────────────────────────────────────────────┐
│ 7 open deals over $50k · sorted by close date       HubSpot │
├──────────────────────┬──────────────┬─────────┬────────────┤
│ Name                 │ Stage        │ Amount  │ Close date │
│ Meridian Health…    ▸│ Contract sent│ $128,400│ Jul 31     │
│ Ardent Logistics…   ▸│ Negotiation  │ $94,000 │ Aug 14     │
│ …                    │              │         │            │
├──────────────────────┴──────────────┴─────────┴────────────┤
│ [Load more]                     Showing 7 of 7 · config v4  │
└────────────────────────────────────────────────────────────┘
```

### Studio layout builder (Phase 3)

```
┌─ Fields (from describe) ──┐ ┌─ Canvas: Deal card ──────────────────┐
│ 🔍 search fields          │ │ ▸ Header  [title: Name][badge: Stage]│
│ ─ Deal information ─      │ │ ▾ Section: Deal details   (2 cols)   │
│  ▤ Amount          [drag] │ │    [Amount ✎][Close date ✎]          │
│  ▤ Close date      [drag] │ │    [Stage ✎ picklist][Owner]         │
│  ▤ Deal type       [drag] │ │ ▾ Related: Contacts (assoc: decision │
│ ─ Forecast ─              │ │    maker) · cols: Name, Role · 5     │
│  ▤ Forecast amount [drag] │ │ ▾ Actions: [Save][Enroll sequence]   │
│  ⚠ 34/60 fields have no   │ ├──────────────────────────────────────┤
│    description → fix in   │ │ LIVE PREVIEW (real widget component) │
│    HubSpot ↗              │ │ ┌──────────────────────────────┐     │
└───────────────────────────┘ │ │  (renders packages/widgets)  │     │
        [Save draft] [Publish v5 ▸]  └──────────────────────────┘     │
                              └──────────────────────────────────────┘
```

## The payload contract (structuredContent for crm_get_record)

```jsonc
{
  "layout": { /* the published layout config, verbatim (post-denylist) */ },
  "meta": {                       // merged live describe data, exposed fields only
    "Amount":    { "label": "Amount", "type": "currency", "required": false,
                   "description": "ARR value of the deal, not TCV" },
    "StageName": { "label": "Stage", "type": "picklist", "required": true,
                   "values": ["Discovery","Negotiation","Contract sent","Closed won","Closed lost"] }
  },
  "record": { "id": "12345", "Amount": 128400, "StageName": "Contract sent", /*…*/ },
  "related": { "contacts": { "rows": [/*…*/], "hasMore": false } },
  "capabilities": { "writeEnabled": true, "editableFields": ["Amount","StageName","CloseDate","NextStep"] }
}
```

The model-facing `content` string for the same call: 1–3 sentences summarizing the
record + any field `description` metadata relevant to interpretation (V3). Never
dump the full record into `content` — the widget carries the detail.

## Mock adapter & fixtures (build in M1, before any real CRM)

- `packages/crm-adapters/src/mock/` — a `MockCrmAdapter` implementing the full
  interface against in-memory fixtures: 1 "portal" with ~15 deals, ~20 contacts,
  ~10 companies, associations, engagement history, realistic describe metadata
  (including some fields with empty descriptions, for the V3 coverage feature).
- All widget/server tests and Studio preview run against the mock. Live-CRM code
  paths are integration-tested separately behind env flags.
- This keeps the dev loop credential-free and lets Claude Code iterate on widgets
  without burning CRM API rate limits.

## Non-goals (v1 — do not build these, even if they seem helpful)

- ~~No custom auth/user management in Studio beyond OAuth-based login (use a library;
  no password flows).~~ **Superseded 2026-08-10:** Cardstack now owns self-serve
  email+password accounts — the Salesforce-as-IdP model made sign-in structurally
  dependent on a connected app existing, which failed in production. See
  docs/superpowers/specs/2026-08-10-self-serve-accounts-design.md.
- No caching layer for CRM data (render-time freshness > speed at MVP; revisit
  with evidence).
- No GraphQL, no message queue, no microservices — one server, one DB.
- No annotation-text storage in our DB (V3 rule: CRM metadata is the source).
- No mobile-specific widget variants (the host handles responsive).
- No webhooks/CRM event subscriptions in v1 (pull-on-render only).
- No AI features inside Studio (layout suggestions etc.) until the manual builder
  is solid.

## Working agreements for Claude Code

- Anything ambiguous about the MCP Apps protocol → fetch the shipped ext-apps SDK
  and spec first; if still ambiguous, implement the simplest interpretation and
  leave a `// SPEC-CHECK:` comment.
- Stop and ask before: adding a dependency >1MB, changing the layout config schema,
  adding a DB table, or any auth-related decision.
- Every milestone ends with the golden-path demo runnable via a documented script
  (`pnpm demo:m1` etc.) against the mock adapter.

---

# Design Handoff Integration (v1 design → build scope)

The `/design` package (Cardstack_Designs_dc.html + its README) is the visual and
behavioral source of truth. **Its existence is not build authorization** — the
design deliberately covers surfaces scheduled for later milestones. This section
maps design → milestones and lists what the design added or changed versus the
sections above. Where this section conflicts with earlier text, this section wins.

## Decisions the design made — now adopted plan-wide

- **One CRM per workspace.** Switching disconnects + archives. Simplifies tenancy;
  kills any residual multi-CRM-per-tenant ambiguity.
- **Confirmation diff on EVERY write** (field edits, task check-off, creates, flow
  outputs) and reused as the Studio publish mechanic. "Require confirmation" is
  locked ON in Permissions — it's the product's spine, not a setting.
- **Write receipt (4c):** after a confirmed write the card collapses to a compact
  receipt (before→after lines, author, timestamp). Scrollback becomes an audit
  trail. `updateModelContext` after a write should mirror the receipt content.
- **Nulls always render as muted "—"** — not configurable, not hidden.
- **Widget card state machine** (from README "State Management"): loading →
  ready ↔ editing(dirty) → confirming(diff) → writing(per-field) → receipt |
  partial-failure; orthogonal flags: stale, re-auth, error, empty. Implement
  as an explicit state machine, not ad-hoc booleans.
- **Field ⓘ tooltips** surface CRM descriptions to the *human* — same describe
  metadata V3 pipes to the model. One source, three consumers now (model, admin
  coverage nudge, rep tooltip).

## New adapter capabilities (extend the CrmAdapter interface)

```typescript
listSavedViews(objectApi): Promise<SavedView[]>       // HubSpot views / SFDC listviews (5a)
getViewRows(viewId, page): Promise<RecordPage>
listTasks(userScope): Promise<TaskPage>               // home card follow-ups (7a)
completeTask(id): Promise<Task>                        // confirmed write
getValidationRules(objectApi): Promise<RuleSummary[]> // SFDC Tooling API (3d) — see spike
listFlows(): Promise<FlowSummary[]>                    // screens/writes summary (10c)
```

## New config entities

- **home_card_configs** — block-based (Header, Lists, Follow-ups, Picked-up-recently,
  Pinned records, Actions), audience-assigned, versioned like layouts (8a).
- **view_exposures** — per synced CRM view: exposed toggle, "Ask Claude with"
  aliases, default-view flag (5a). Filters are read-only from the CRM (no parallel
  view builder — anti-goal).
- **custom_screens** — SDK screens (11a): source, version, publish state, guardrail
  check results. Versioned/rollback like layouts.
- **flow_render_modes** — per flow: Auto (default) | Native only | Embedded end-to-end.

## New/changed tool surface

| Tool | UI | Milestone |
|---|---|---|
| `crm_home` | home card widget (7a) | M4 |
| `crm_list_view` | results table headed by view name (5b) | M2.5 |
| `crm_complete_task` | widget-invoked, confirmed | M4 |
| `crm_flow_start / _continue / _cancel` | flow-as-card-state (10a) | M5 |

Note on `crm_search` vs saved views: "show me my deals" resolves to the user's
exposed views first (with the ambiguous-ask picker from 5b, choice remembered);
free-form filters fall back to ad-hoc search. Aliases must reach the model —
regenerate the tool description (or append to `content`) per tenant with the
exposed views' names + aliases so routing works.

## NEW SPIKES (added to the risk list — do not build on assumptions)

1. **Native flow rendering (the "NATIVE" rung of the ladder).** Rendering standard
   flow screens as host controls requires programmatically driving a Salesforce
   screen-flow interview (start, submit screen values, advance). Public REST
   support for *interactive* screen flows is historically murky (invocable/
   autolaunched ≠ screen flows). Spike against a dev org FIRST; if there's no
   supported API, the ladder becomes EMBEDDED → HANDOFF only and "Native only"
   mode is cut. This spike gates the M5 design, not just its polish.
2. **Flow session state.** Flow interviews are stateful; our server is stateless
   by design. Decide: persist interview handles in Postgres keyed to conversation,
   or hold state CRM-side only. Do not introduce in-memory sessions.
3. **Tooling API for validation rules (3d).** Requires additional OAuth scope and
   returns formula source, not semantics. v1 = list rules per field verbatim
   ("listed for awareness"). The 3f plain-language hints with computed values =
   parse only trivial formula patterns; anything else falls back to showing the
   rule name. Do NOT attempt a general formula evaluator.
4. **Embed boundary (11c)** — unchanged from the Phase 4 spike, but the design
   adds the requirement: embeds only from the connected org's domain, visibly
   NOT host-themed (blue boundary), publish-time-required fallback.

## Revised milestone map (supersedes the Repo Bootstrap list)

- **M0** — unchanged: hello-world MCP App round trip. Design refs: none.
- **M1** — read-only record card + results table, mock adapter. Design refs:
  1a, 1e (loading/empty/error only), 1f, 1g, 1h. Mock fixtures MUST now also
  include: saved views, tasks, flows metadata, validation-rule summaries, and
  fields with descriptions (for ⓘ tooltips + V3).
- **M2** — writes: edit mode, confirmation diff, receipt, partial failure, stale,
  re-auth, audit log, updateModelContext. Design refs: 1b, 1c, 1d, 1e (rest), 4c.
- **M2.5** — saved views: sync, exposure config, `crm_list_view`, ambiguous-ask
  picker. Design refs: 5a, 5b. (Pulled early: it's how reps actually ask.)
- **M3** — Studio: connect/onboarding, builder, permissions, assignment, home,
  nav shell, publish/rollback, View-as. Design refs: 2a–2i, 3a–3e, 6a, 6b, 12b.
  Studio theme = README design tokens (Instrument Sans, accent #2f3550, etc.) →
  Tailwind config in apps/studio.
- **M4** — home card + its builder + tasks. Design refs: 7a, 7b, 8a, 9a, 10b.
- **M5** — flows: ladder per spike results, actions picker, rules read-through.
  Design refs: 10a, 10c, 3f, 3d, 11c, 11d.
- **M6** — custom screen SDK (editor, guardrails, versioning). Design refs: 11a,
  12a. Largest net-new subsystem; do not start before M5 lands.
- **M7** (was M5) — production hardening, registry listing, evals.

## Repo integration

- Commit the design package to `/design` (html + README + support.js).
- CLAUDE.md gains two rules: "UI must match /design; deviations require a PR note"
  and "the /design README's ids (1a…12b) are the acceptance reference per the
  milestone map in PLAN.md — do not build design surfaces ahead of their milestone."

---

# Hosting (MVP — optimize for cheap + zero ops distraction)

## Principles

- The MCP server needs a **stable public HTTPS URL** — Claude.ai connectors point
  at it, so put it behind our own subdomain (`mcp.<domain>`) from day one. The
  platform behind the domain must be swappable; the URL is forever.
- **No platform-specific APIs in app code.** Plain Node container, config via env
  vars, Dockerfile from the start. Any host, any time.
- **Cold starts matter more than compute.** A rep waiting 30+ seconds for a widget
  because the free tier spun down = product feels broken. Avoid free tiers with
  long spin-downs for the MCP server specifically.

## Phase 0–1 (spike/dev): $0

- Run the MCP server on localhost; expose it with a **Cloudflare Tunnel** (free,
  `cloudflared tunnel`) or ngrok to get a public HTTPS URL Claude.ai can connect to.
- Postgres via local docker-compose.
- This is the whole dev loop until there's a second user.

## Phase 1–3 (MVP with real users): ~$5–15/mo

| Component | Pick | Cost | Notes |
|---|---|---|---|
| MCP server | **Fly.io** machine, auto-stop/auto-start | ~$2–5/mo | Sub-second cold starts, real Node container, `fly deploy` |
| Postgres | **Neon** free tier | $0 | 0.5GB, branching DBs pair with preview deploys; upgrade ~$19/mo when needed |
| Studio | **Cloudflare Pages** or Vercel | $0 | CF Pages free tier allows commercial use; Vercel Hobby technically doesn't — check terms |
| Domain + DNS | Cloudflare | ~$10/yr | `mcp.` and `app.` subdomains |
| Token encryption | 32-byte key in env var (AES-GCM) | $0 | KMS is a Phase 5 problem |

Alternative if light ops is acceptable: one **Hetzner VPS** (~$5/mo, 2vCPU/4GB)
running Coolify — server + Postgres + Studio on a single box, push-to-deploy,
most compute per dollar by far. Trade: you own patching/backups. Fine for MVP,
migrate the DB out before real customers.

## What NOT to do at MVP stage

- No AWS/ECS/RDS/KMS — that's the Phase 5 / first-enterprise-security-questionnaire
  move. Migration is a weekend (stateless container + Postgres), which is exactly
  why deferring is safe.
- No serverless for the MCP server (Lambda/Workers) — streamable HTTP + Node-native
  CRM libs (e.g., jsforce) fight the runtimes. Revisit only if scale demands it.
- No Kubernetes. Obviously.

## Upgrade triggers

- Neon free tier storage/compute limits hit → paid Neon (~$19/mo).
- First paying team → move Studio off free tier, add uptime monitoring
  (BetterStack free tier), error tracking (Sentry free tier).
- First security questionnaire → AWS migration (ECS Fargate + RDS + KMS),
  budget ~$100–150/mo baseline.

---

# Repo Bootstrap

## Name

Working name: **`cardstack`** — repo `cardstack-crm` if the plain name is taken.
Alternates considered: `recordcard`, `layoutlayer`, `crmapps`. Decide before Phase 1
ships anything public; rename cost grows from there. (Check npm/domain squatting
before attaching to it.)

## Initial setup (Claude Code: do this first, before Phase 0)

```bash
# pnpm workspaces + turborepo
pnpm init
# workspace layout per the monorepo section above:
# apps/studio, apps/mcp-server, packages/core, packages/crm-adapters, packages/widgets
```

- **Tooling**: pnpm workspaces, turborepo, TypeScript strict, ESLint + Prettier,
  Vitest. Node 22 LTS.
- **CI (GitHub Actions)**: typecheck + lint + test on PR; build all packages.
- **Env handling**: `.env.example` per app, never commit real values. Secrets
  needed: DB URL, encryption key (32-byte, for CRM token AES-GCM), Salesforce
  client id/secret, HubSpot client id/secret.
- **docker-compose**: Postgres 16 for local dev.
- **Conventional commits**; changesets for package versioning later.

## CLAUDE.md (create at repo root — Claude Code reads this every session)

Contents to include:
1. One-paragraph product summary + pointer to PLAN.md.
2. Current phase and its exit criteria (update as phases complete).
3. Hard rules: layout config schema changes require updating zod schema in
   packages/core AND a migration note; denylist enforcement is server-side only;
   no secrets in widget bundles; widgets never call our API directly (host round-trip
   only); adapters never import from apps/*.
4. Commands: build, test, dev, inspector.
5. "Before implementing anything against the MCP Apps spec, fetch the current
   ext-apps SDK docs — do not trust training data or PLAN.md for exact _meta shapes."

## Suggested milestone → issue breakdown

- **M0 (Phase 0)**: repo scaffold · hello-world MCP App server · widget round-trip
  verified in Inspector + Claude.ai
- **M1 (Phase 1)**: core config schema (zod) · HubSpot adapter (read) · results-table
  widget · record-card widget (read-only) · demo against a real HubSpot dev portal
- **M2 (Phase 2)**: Salesforce adapter · write path + confirmation + audit log ·
  inline editing in record card · updateModelContext wiring
- **M3 (Phase 3)**: Studio: OAuth connect · object toggles · drag-drop builder ·
  live preview (imports packages/widgets) · publish/versioning
- **M4 (Phase 4)**: screen-flow embed spike → build or fallback · HubSpot
  workflow/sequence enrollment actions
- **M5 (Phase 5)**: multi-tenant hardening · registry/directory listing · evals
