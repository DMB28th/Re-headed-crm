# PR note — actions editor (design 3a)

Hard rule 6 requires a note for every deviation from `/design`, and hard rule 1
requires a migration note for schema changes. Both are covered here.

## What shipped

Admins can now compose a record card's action row in Studio
(`/objects/[object]/actions`, reachable from the "Card actions" tab in the nav
rail): reorder by drag, rename, toggle on/off, remove, add from a per-object
discovery picker, and map a screen flow's input variables. The record card
renders that configuration — all four action types, in configured order, first
one primary — and the MCP server refuses actions the admin turned off.

All mutation and render decisions for `recordCard.actions` live in one pure
module, `packages/core/src/card-actions.ts`, so the actions editor, the Flows
admin toggle and the card cannot disagree about what "off" means.

## Schema change (hard rule 1)

`CardAction` gains `enabled` (default `true`) on every variant. Migration note is
in the header comment of `packages/core/src/layout-config.ts`. Defaulted, so
stored configs parse unchanged. A disabled action keeps its label, position and
input mappings; it is hidden from the card and REFUSED server-side at both
chokepoints (`crm_flow_start` / `crm_flow_continue` / `crm_quick_action_start`),
and stays visible and re-enableable in Studio. Removal from the array remains a
separate, destructive operation.

## Deviations from /design

**1. The Flows page toggle no longer deletes, and no longer auto-publishes.**
Disabling a flow from the Flows admin page used to DELETE the card action,
destroying any hand-mapped flow inputs. It now sets `enabled: false` through the
shared module, so the action keeps its label, position and mappings. The route
also saves to the DRAFT instead of publishing immediately, matching every other
Studio editor; changes go live at the next publish from the builder. The route's
old comment argued for immediate publish because "exposing a flow IS the admin's
intent" — that rationale is superseded, because two surfaces editing one array
cannot hold opposite publish semantics. The Flows page's success copy and its
standing explanatory line were updated to the draft language, and the response no
longer carries `revision`.

**2. The mapping editor gates input sources by the variable's type.**
`/design` does not specify this. A collection variable is offered only
`selection` (the schema pins `valueType: "recordIds"` there); a scalar variable
is offered `context`, `field`, `literal` and `ask`. This stops admins producing
mappings the runtime cannot resolve. It is isolated in one function
(`sourcesFor`), so relaxing it to "offer all five, warn on mismatch" is a
one-line change.

**3. An empty `actions` array keeps the legacy "Edit fields" button.**
Every layout predating this editor has `actions: []` and must not silently lose
its edit affordance. An empty CONFIGURATION keeps the legacy button; an empty
RESULT (everything configured but all disabled) correctly renders no buttons.

**4. `update_record` rows have no remove button.**
Matching the existing carve-out in `builder/canvas.tsx`. Because the card's
legacy fallback fires only on an EMPTY array, removing the sole `update_record`
from a non-empty array would leave a card with no way to edit at all. The on/off
switch still turns it off while preserving its position, label and the ability to
re-enable it.

**5. Each row's on/off switch carries a short hint that `/design` does not specify.**
Server-side refusal of a disabled action exists for `screen_flow` and
`quick_action` only — `crm_create_record` and the `crm_preview_update` /
`crm_update_record` pair never consult `recordCard.actions`, and never did. So
turning off a `create_related` or `update_record` row hides its button but does
not stop the model doing the same thing when a rep asks in chat. The switch looks
identical on all four types, so the hint says which case each row is: hidden and
refused, or hidden only. Their real gate — `permissions.writeEnabled`, FLS, and
the confirmation token — is unchanged.

## Known limits, deliberately shipped

- `builder/canvas.tsx` still hand-rolls its own `recordCard.actions` mutations
  rather than routing through `packages/core`'s card-actions module. It agrees
  with the actions editor today, but by coincidence rather than by construction.
  Its header comment now says so. Migrating it is a follow-up.
- Typing an unparseable value into a number literal in the mapping editor
  silently coerces to `0`, and a boolean literal is a free-text input where
  anything other than "true" reads as false. Both are follow-ups.
- The per-object discovery route caps the flow catalog at 40 with no "showing 40
  of N" affordance; orgs with more flows lose the rest from the picker.
- `pnpm lint` executes zero tasks — turbo declares the task but no workspace
  package defines a lint script. Pre-existing; nothing on this branch was linted.

## Not done

Not deployed. Deployment is out of scope and needs explicit confirmation — the
Salesforce connected app rotates refresh tokens with reuse detection, so a
careless deploy can revoke the live connection's grant family.
