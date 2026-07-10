# Handoff: Cardstack — Widget + Studio

## Overview
Cardstack lets CRM admins design interactive "record cards" that render inside AI chat apps (Claude, ChatGPT, Copilot) via the MCP Apps standard. Reps ask for records/lists in chat and get live, editable cards; admins design and govern those cards in a standalone web app (Studio). This package documents the complete v1 design: every widget state, the Studio (builder, lists, permissions, assignment, home, navigation), screen-flow rendering, the custom-screen SDK, and the rep-facing home card.

## About the Design Files
`Cardstack Designs.dc.html` is a **design reference created in HTML** — a single canvas document containing all mockups, organized in numbered turns (newest at top). It is a prototype showing intended look and behavior, **not production code to copy**. The task is to recreate these designs in the target codebase's environment (React etc.) using its established patterns — or choose an appropriate stack if none exists. Open the file in a browser and pan/zoom; every mockup has a stable id badge (`1a`, `2b`, `11c` …) referenced throughout this README.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii, and copy are final-intent. Recreate pixel-perfectly, with one crucial exception: **the Widget surface must not hard-code its visual values** — see below.

---

## The two-surface architecture (the most important thing to get right)

### Surface A — The Widget (renders in chat, host-native)
- ALL surfaces, typography, inputs, spacing, and light/dark mode come from the **host's CSS variables at runtime**. The mockups simulate a generic neutral host (system-ui, white cards on `#f4f3f1` chat bg light / `#30302e` on `#262624` dark, near-black `#1f2023` primary buttons). Treat these as *placeholder host tokens*, not brand values.
- Constraints: ~680px wide desktop, 380px mobile variant; flat, minimal borders, generous whitespace; no entrance animations (micro-transitions <150ms on state change only); no modals, no navigation, no arbitrary external loads (MCP host rules).
- Identity layer (the only "ours" parts): the source/maker chip "HubSpot · via Cardstack" with the two-overlapping-rounded-rects glyph (one placement, bottom-right, every widget; removable for white-label without leaving a hole), and two signature behaviors: the **signing-style confirmation diff** and the **stale-card refresh**.

### Surface B — The Studio (standalone web app, our brand)
Full brand expression. All Studio tokens below apply here and only here.

---

## Screens / Views (by canvas id)

### Widget states (turn 1, plus 5b, 7a/7b, 10a/10b, 11c, 12a)
- **1a Record card, read-only (680, light)**: header (deal name 600/17px, meta line, stage pill), 2-col field grid (label 500/11px at 50% opacity, value 400/14px), null values render as muted "—" at 35% opacity — always shown, never hidden, not configurable. Fields with a CRM description show a 12px ⓘ icon after the label; hover reveals a dark tooltip (`#1f2023` bg, 240px) with the description + "Field description from HubSpot" attribution. Contacts related list (26px initial avatars, role-label pills, "Show 4 more contacts"), activity timeline (6px dots, right-aligned timestamps), action row (primary "Edit fields", secondary "Log a note", right-aligned trust line "Writes require confirmation"), maker chip bottom-right.
- **1b Edit mode / dirty state**: changed fields get amber (`#c47d1e`) border + 6px amber dot on label; FLS-blocked fields render read-only with a "Read-only · Salesforce field security" pill; open picklist dropdown with filter input and "8 more — type to filter" affordance for 40-value lists; footer: "2 unsaved changes" (amber), Discard (ghost), "Review & save…" (primary).
- **1c Confirmation diff (signing moment)**: FIELD/BEFORE/AFTER 3-col table (150px/1fr/1fr); before = red `#9a3b30` strikethrough; after = green `#1c6b46` on `#eefaf2` pill (color + strikethrough + labels — never color alone); primary button "✎ Confirm & write to HubSpot"; footer "Written as {user} · logged in HubSpot history".
- **1d Dark mode**: card `#30302e`, text `#f2f1ec`, borders `rgba(255,255,255,.09)`, primary button inverts to light; diff colors become `#e08c7f` / `#7fd6a4` at low-alpha backgrounds.
- **1e Edge states** (each a full-width card): loading skeleton (gray bars + "Loading … from HubSpot"); empty ("No fields configured for Deals" + "Copy request for your admin"); error ("HubSpot didn't respond / Nothing was written" + Retry); re-auth ("HubSpot connection expired" + "Reconnect HubSpot", edits kept); **stale card** (top strip "Edited in a newer card — showing values from 12:40" + underlined Refresh, body at 60% opacity); **partial write failure** ("Saved 1 of 2 changes", per-field rows: green ✓ saved, red ✕ with the CRM's verbatim validation message inline + "Edit & retry" — never a generic error).
- **1f Results table (680)**: header = natural-language count ("8 open deals over €50,000") + mono `layout v4` chip + maker chip; 4-col grid rows; hover row = darker bg + 3px left inset bar + "Open card ↗"; stage pills color-coded; footer "Showing 5 of 8 · click a row to open its card" + "Show 3 more". European formats mixed in (€ and `1 240 000,00 kr`).
- **1g Mobile 380**: record card 1-col with label-left/value-right rows; buttons full-width, min-height 44px; results become tappable summary cards.
- **1h Stress test**: 40-char labels, wrapping titles (`text-wrap: balance`), 4-line clamped textarea + "Show full note", 3-col dense section for short values, SEK/EUR/CEST formats, and the pushback note "cards over ~15 fields work better split by audience".
- **5b List resolution**: "show me my deals" → results table headed by the saved view's name + "Your saved HubSpot view"; footer links filters to the CRM. Ambiguous ask state: "matches 3 saved views" picker; choice is remembered.
- **7a/7b Home card ("open my CRM")**: launcher, NOT a dashboard — no charts/KPIs. Sections: **Your lists** (2×2 tiles + "All 6 lists"), **Picked up recently** (type pill + name + activity note), **Follow-ups** (CRM tasks; overdue = red-tinted row; checking off is a confirmed write), trust line + maker chip. 380 variant: one column, 44px targets.
- **10a Screen flow mid-run**: flow renders as a card state — step dots + "Step 2 of 3", flow inputs, Cancel flow / Back / Continue, note "Step 3 reviews everything this flow will write". No modal.
- **10b Home actions + create form**: record-less actions (+ New deal, Log a note, Start flow); create form = object layout rendered as a form, CRM-required fields badged `required` and listed first; "Review & create…".
- **11c Embedded screen**: org component inside a blue-tinted boundary (border `rgba(26,58,110,.25)`, header strip `#eef3fa` with S mark + "Rendered by Salesforce — your org's component, your session" + mono component name). Deliberately NOT host-themed. Fallback state: "This chat app doesn't allow embedded pages" + "Open in Salesforce ↗" + waiting spinner; flow auto-resumes.
- **12a Record card with custom section**: same boundary treatment embedded as a layout section ("Pricing & quotes", `c:cpqPricingSummary`), read-only in card, edits hand off.
- **4c Write receipt (opinionated take)**: after a confirmed write the card collapses to a compact receipt: green ✓ + "2 fields written to HubSpot" + timestamp/author, per-field before→after lines, "Open current card". The scrollback becomes an audit trail.

### Studio screens (turns 2, 3, 5, 6, 8, 9, 10c, 11, 12)
- **2a Layout builder** (three zones): left palette 264px (search, grouped fields with type tags, amber dot = missing description, used fields dimmed "On card", "Metadata gaps" nudge card deep-linking "Fix in HubSpot ↗"); center canvas (Header block "Always first", sections with drag handle + 1|2|3 column segmented control, field chips with Editable/Read-only toggles, mid-drag drop indicator = 2px dashed accent line + ghost chip, per-field popover: name + mono api-name/type, "Reps can edit" toggle, "Required" toggle with "Can't be saved empty from chat", permissions cross-link; related-list and Actions blocks; "+ Add section" dashed; 15-field split-by-audience nudge); right rail 396px (live REAL widget preview, 680/380 + Light/Dark toggles, draft-vs-published explainer). Top bar: object switcher, `Draft · v5 from v4` chip, "Saved just now", View as…, `{ }` (read-only layout JSON for review/source control), "Publish layout…".
- **2b Publish flow**: modal reusing the signing mechanic — `+ added` / `− removed` / `~ changed` rows vs v4, "Publish to 38 users", "Previous versions are kept — roll back to v4 anytime."
- **2c Connect & onboarding**: HubSpot OAuth card; Salesforce card with Production/Sandbox radio ("one CRM per workspace"); connection health (token, metadata sync, note that switching CRMs disconnects + archives); pick-an-object grid ("Most used ✓"); auto-generation progress (✓ read 60 fields → picked 9 high-signal → grouped into 2 sections → rendering preview) landing as a draft.
- **2e Permissions**: "Allow writes from chat" toggle; "Require confirmation on every write" LOCKED ON ("it's the product's spine"); field denylist chips; FLS-wins footnote.
- **2f/2g/2h/2i Assignment**: list view (pinned un-removable default row, audience rows with layout picker + version chip, drag priority, conflict note "4 users also match … → priority 1 wins", drift row = red bg + strikethrough + "Re-map"/Remove, overrides strip "3 individual overrides… Review"); coverage strip ("142 → default · 38 → AE card · 12 → CS card · 3 overrides · 0 unassigned"); matrix view (audiences × objects, cell picker popover, "inherits default" empties, row/col bulk-assign checkboxes); **View as** (user picker + WHY trace timeline: matched audience via CRM grouping / also-matches-skipped with reorder link / final layout + effective permissions, beside the exact rendered card); teaching empty state ("Everyone gets 'AE deal card'. Add an audience to vary it.").
- **3a Actions editor**: reorderable list, first = Primary, built-ins + record actions, toggles; trust line non-removable.
- **3b Related list picker**: CRM associations incl. custom objects (purple mono `custom object` tag), per-list settings (columns chips, show-initially 3/5/10 segmented, sort).
- **3c Object picker**: standard + custom (`p_subscriptions`, Salesforce `__c`) as first-class.
- **3d Requirements pass-through**: `Required · SFDC` amber badge on chips (can't remove field); conditional-required warning banner ("Loss reason … isn't on this layout") with "Add field" / "Ask inline"; validation rules listed read-only per field ("we can't evaluate Apex — listed for awareness"); page-layout import (copies once, doesn't sync).
- **3e Audience picker**: segmented source tabs (HubSpot teams / SF profiles / permission sets / roles), synced member counts, overlap warnings.
- **3f Rules in the widget**: purple `Salesforce rule` badge + plain-language hint under the tripped field while editing (with computed %), restated on the diff with "may reject this — you can still try; a rejection won't touch other fields."
- **5a List views page**: per-object tab; synced views table (VIEW / FILTERS (read-only, from CRM) / VISIBILITY / ASK CLAUDE WITH aliases / EXPOSED IN CHAT toggle); default view badge; private views stay private but reps can always call their own; drift row with Re-map.
- **6a IA map**: Connect → Studio home → per-object four tabs (Layouts · Lists · Permissions · Assignment, sharing one header) → Publish → widget. Rule: everything an admin does is scoped to one object at a time.
- **6b Studio home**: greeting + live-user count; resume-draft banner (amber left border); object cards with inline status (draft chip, "1 broken — re-map" in red, "34 fields lack descriptions" amber); "+ Add an object" dashed card; Recent publishes list (incl. a rollback entry); problems surface inline, no alert inbox; amber dot on Connections nav.
- **8a Home card builder**: same three zones; blocks instead of fields (Header, Lists [All exposed/Curated + max tiles 2/4/6], Follow-ups, Picked up recently, + palette: Pinned records, Actions); "no dashboard blocks on purpose" note; assigned by audience like record layouts; preview "as {rep}" — admin shapes the frame, rep data fills at render.
- **9a Add-block menu**: Pinned records, Actions, Recent receipts (marked "later").
- **10c Add action picker**: built-ins + screen flows synced from Salesforce (screens/writes summary per flow); unsupported flows (custom Lightning components) flagged "can't render in chat" with **Map inputs** / **Build screen** fork (11b).
- **11a Custom screen SDK editor**: dark code pane (`#22242c`, mono 12/1.75) showing the `screen({ id, inputs, render: ({ui, record}) => ui.stack(...), validate, submit: (v) => flow.output(v) })` shape — no direct writes, values return to the flow, rep confirms in the diff. Passing guardrail checks under the code: no network/storage/DOM escape · writes only via flow.output → confirmation diff · host tokens auto (dark mode passes). Right: live preview with the validate error actually firing; test-data tab; versioned/published/rollback like layouts.
- **11c/11d Embeds + default flow rendering**: `ui.embed(lightning("c:...", {recordId, height}), { fallback: "open-in-salesforce" })` — fallback required at publish; embeds only from the connected org's domain, sandboxed from the rest of the card. Rendering ladder: 1·NATIVE (standard screens → host controls) → 2·EMBEDDED (custom/LWC screens render inside the chat card) → 3·HANDOFF (fallback for 2 when host blocks embeds: browser tab ↗, chat waits + resumes). Per-flow modes: **Auto (default, zero-config)**, Native only (blocks publish until unsupported screens are mapped/built), Embedded end-to-end.
- **12b Studio navigation shell**: 224px left rail — Home; OBJECTS group (active object expands to Layouts/Lists/Permissions/Assignment, draft chips + red/amber status dots inline; "+ Add object"); SHARED group (Home card, Custom screens, Flows); Connections pinned bottom with status dot. Object landing page = hub of four status cards.

## Interactions & Behavior
- Widget writes are optimistic where safe: per-field quiet inline spinner, never a full-card overlay. Micro-transitions <150ms; no entrance animations.
- Confirmation diff is mandatory for EVERY write (field edits, task check-off, creates, flow outputs) — one behavior across the product; publishing layouts reuses the same diff visual.
- Stale card: older cards in scrollback that know a newer version exists show the strip + Refresh; confirmed-write cards collapse to receipts (4c).
- Full keyboard path; visible focus rings (host style in widget, `0 0 0 3px rgba(47,53,80,.14)` in Studio); contrast holds in both modes; diff uses labels + strikethrough, not color alone.
- Microcopy: sentence case; verb-first buttons ("Publish layout", "Review & save…"); errors = what happened + what to do, in the CRM's vocabulary; trust line "Writes require confirmation" wherever writes are possible.

## State Management (design-implied)
- Layouts, home cards, and custom screens: draft → published versions (v1…vN), rollback; reps see published only, picked up on next render.
- Assignment resolution: default (exactly one, always) → audience rules (CRM groupings, explicit drag-ordered priority) → individual overrides (counted, flagged). Drift → fall back to default + broken-link state.
- Widget card state machine: loading → ready(read-only) ↔ editing(dirty) → confirming(diff) → writing(per-field) → receipt | partial-failure; orthogonal: stale, re-auth, error, empty.
- Flow runtime: server-driven (CRM evaluates branching; client renders current screen; ladder per screen: native/embedded/handoff).

## Design Tokens (Studio ONLY — the widget inherits host tokens)
- **Color**: paper `#f6f6f4` · surface `#ffffff` · ink/text `#191c24` · accent `#2f3550` (oklch .35 .05 275; hover `#252a40`; focus ring `rgba(47,53,80,.14)`) · muted text = ink at 55%/50%/45% · borders `rgba(20,24,40,.08–.15)`.
- **State tints**: draft/caution `#faf3dd`/`#8a5a10` (border `rgba(138,109,31,.2)`) · published/after `#eefaf2`/`#1c6b46` · drift/before `#fbeae7` or `#fdf7f6`/`#9a3b30` · CRM-metadata purple `#f0edf7`/`#5a4a8a` · success dot `#1c9d5f` · warn dot `#c47d1e`.
- **Type**: Instrument Sans (Google Fonts, 400–700) + ui-monospace for version chips/api names/counts. Scale: 600/16 page title · 600/13.5 card heading · 400/12.5 body · 400/11.5 @55% secondary · 600/10.5 +6% tracking SECTION LABELS · mono 500/10.5 data chips.
- **Spacing**: 4px base — 4 · 8 · 12 · 16 · 22 · 28.
- **Radius**: 7 controls · 8–9 inputs/buttons · 10 rows · 12–14 cards · pill chips.
- Widget mock placeholder host tokens (do NOT hard-code; map to host vars): text `#1a1a1a`, muted = 50–55%, null = 35%, card `#fff`, chat bg `#f4f3f1`, primary `#1f2023`, borders `rgba(0,0,0,.07–.15)`; dark: card `#30302e`, chat `#262624`, text `#f2f1ec`. Diff/status hues as in State tints (dark variants `#e08c7f`/`#7fd6a4`).

## Component Inventory (specimens in 4a/4b on the canvas)
Buttons (primary/hover/secondary/ghost/disabled/dashed-add) · inputs (default/focus/error/dirty-amber) · chips & badges (maker chip + glyph, Draft/Published mono version pills, `custom object`, `Required · SFDC`, `N validation rules`, overrides pill) · toggles (on/off/locked-on) · segmented controls · diff row · coverage nudge · drift row · stage pills · role-label pills · ⓘ tooltip · step dots · embed boundary · SDK guardrail checks.

## Assets
None required — the only mark is the two-overlapping-rounded-rects glyph drawn in CSS/SVG (working name "Cardstack" is subject to change; don't hard-bake a logo). Embedded-component regions in mocks are striped SVG placeholders; production renders the org's real component.

## Anti-goals (hold the line)
No dashboards/charts/analytics anywhere (including Studio home and home-card blocks). No parallel org chart or view builder — the CRM is the source of truth for people, views, flows, and field metadata. No widget capabilities beyond what MCP hosts allow. One CRM per workspace.

## Files
- `Cardstack Designs.dc.html` — the full design canvas (open in a browser; ids `1a`–`12b` map to this README)
- `support.js` — runtime for the canvas file (reference-viewing only, not part of the design)
