# Session 3 — Write path

**Goal:** Golden Path 2 on-platform — edit in the card → confirmation diff →
receipt → audit entry — with the confirmation enforced by a server-verified
signed token (hard rule 8).

## Deliver

- **`ConfirmationSigner`**: HMAC-SHA256 via `Crypto.generateMac` over a
  canonical string of `(tool, object, recordId, sorted field diff, actor id,
  expiry)`, keyed from `MCPforce_Settings__c.Signing_Key__c`. Refuses to
  sign or verify when the key is blank — never degrades to unsigned. A
  `KeyBootstrap` class generates the key on first admin use and the
  post-install script (Session 8) calls it.
- **Tools:** `crm_preview_update` (diff + token), `crm_update_record`
  (verify token, re-read record, refuse if the diff drifted, DML as the rep,
  return receipt), `crm_preview_complete_task` / `crm_complete_task`,
  `crm_create_record` (preview-then-create using the same token shape).
- **`AuditWriter`**: `without sharing` insert of `Audit_Entry__c` with
  actor, object, record, field, before/after, tool, `Confirmed__c = true`
  only when a token verified, and the token hash. Reps hold no DML on the
  object.
- **Widget edit states:** the record-card widget's existing edit machine and
  write states (`packages/widgets/src/record-card/edit-machine.ts`,
  `write-states.tsx`) must work unchanged against the Apex results; if a
  result shape differs, fix Apex, not the widget.

## Out of scope

Flows, quick actions, home card, Studio, audit log UI.

## Read first

- `docs/confirmation-provenance.md` — the rule and its reasoning; port it faithfully.
- `apps/mcp-server/src/confirm-token.ts` — `mintConfirmToken` / `verifyConfirmToken` canonicalisation.
- `apps/mcp-server/src/audit.ts` and `packages/config-store/src/audit-log.ts` — `AuditEntry` fields.
- `apps/mcp-server/src/server.ts` — the preview/update and complete-task tool bodies.

## Acceptance

- In Claude: change Opportunity Amount in the card → diff shown → confirm →
  receipt → `Audit_Entry__c` row with `Confirmed__c = true`.
- Apex tests: update without a token is refused; a token for a different
  diff is refused; an expired token is refused; a token minted by another
  user is refused; the field-level security check happens before DML; the
  audit row is written even when the DML fails (with the failure recorded).
