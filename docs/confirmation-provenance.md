# Confirmation provenance

*Added 2026-08-02. Closes item 19 of `docs/ux-review-2026-07-26.md`.*

CLAUDE.md hard rule 8 says every write is preceded by a confirmation diff, and
the Permissions page tells admins that "require confirmation" is locked on
because it's the product's spine. Until now that was true only by convention.

The record card computed the diff **in the browser**, showed it, and then called
`crm_update_record`. A direct model tool call with the same arguments was
indistinguishable — to the server *and* to the audit log — from a write a rep
had actually read and approved. The compliance record was logging a claim it had
no way to check, which is the one thing a compliance record must not do.

## The mechanism

```
rep edits fields
  → crm_preview_update {object, id, patch}          ← server reads current values,
                                                       runs the write gauntlet,
                                                       returns the diff + token
  → card renders THE SERVER'S diff
  → rep confirms
  → crm_update_record {object, id, patch, confirmToken}
  → server verifies the token against this exact write
  → audit entry: confirmation.via = "widget"
```

The token (`apps/mcp-server/src/confirm-token.ts`) is an HMAC-SHA256 over a body
that commits to **tenant, object, record id, actor, and a hash of the exact
patch**, plus issue/expiry timestamps. It is opaque to the widget, which only
passes it back.

Properties worth keeping:

- **Bound, not merely signed.** A token minted for one diff cannot authorize a
  different field, a different value, a different record, a different workspace,
  or a different user. Changing any of them fails verification.
- **A bad token aborts the write.** It never silently downgrades to
  `via: "model"` — a caller presenting an invalid token is a bug or an attack,
  and treating it as an ordinary model write would launder exactly the false
  "rep confirmed this" the mechanism exists to prevent.
- **Replayable within 5 minutes, deliberately.** Single-use would need a KV
  round trip on every write, costing the server its statelessness (PLAN.md spike
  #2), and buys little: the only write a captured token authorizes is the
  byte-identical one the rep already confirmed. It also keeps "Edit & retry"
  after a partial failure working, since that re-submits the confirmed diff.
- **Never degrades to unsigned.** `signInterviewState` passes tokens through
  unsigned when `CARDSTACK_ENCRYPTION_KEY` is absent; confirm tokens must not,
  because an unsigned one would let anything forge rep provenance. With no key
  configured they fall back to a per-process random secret — still unforgeable,
  just not valid across a restart, which a 5-minute TTL makes harmless.

The server also computes the diff from **freshly read** values rather than
whatever the card was holding, and only fields that actually change enter the
diff (and therefore the token), so a no-op field can't ride along unconfirmed.

## What the audit log now records

`AuditEntry.confirmation` is `{ via, confirmationId?, previewedAt? }`:

| Value | Meaning | Studio shows |
|---|---|---|
| `widget` | Server verified a token minted for this exact diff | **Rep confirmed** |
| `model` | No token presented — a legitimate model-driven write, but nobody saw a diff | **Model-initiated** |
| absent | Logged before 2026-08-02, or by a write path not yet tokenized | **Not recorded** |

Absent is deliberately distinct from `model`. Guessing an origin in a compliance
record is worse than admitting the server doesn't know. The CSV export leaves
`confirmedVia` empty for those rows for the same reason.

No migration is needed: entries are stored as whole JSON blobs (Postgres JSONB /
JSON-lines), so the new field is additive and old rows read back with
`confirmation: undefined`.

## One floor, four write paths

*Updated 2026-08-03.* Every write path is now gated to the same standard, though
by two shapes of gate. Both are HMAC-signed by the **same** signer
(`confirm-token.ts`), so there is one security floor rather than two.

| Path | Gate | Logs |
|---|---|---|
| `crm_update_record` | Confirm token bound to the diff | `widget` / `model` |
| `crm_complete_task` | Confirm token bound to the task | `widget` / `model` |
| Native flow write (interpreter) | Signed interview state carrying `pendingWrite` + explicit `confirmWrite` | `widget` |
| Quick-action execute | Signed quick-action state in `confirming` + explicit `confirmWrite` | `widget` |
| `crm_create_record` | none | `model` |

**Why two shapes and not one.** A confirm token binds a *known diff computed up
front*. A flow interview can't work that way — the write target isn't known until
the interpreter has walked the rep through the screens, and it lives in
server-held state the whole time. The interview state IS the binding: only the
server mints it, only a `confirm-write` pause sets `pendingWrite`, and at that
pause the interpreter deliberately **ignores caller-supplied answers**
([flow-interview.ts:1553](../packages/core/src/flow-interview.ts:1553) returns
before the merge at `:1594`), so the write executes with the values the rep saw.
Same guarantee, reached the way a multi-screen interview has to reach it.

`crm_create_record` genuinely has no confirm surface yet — the card posts a chat
followup and the model calls the tool. In-widget create (design 10b) is the fix;
until then `model` is the honest record.

### The unsigned-passthrough hole (fixed)

`signInterviewState`/`verifyInterviewState` used to pass state through **unsigned**
whenever `CARDSTACK_ENCRYPTION_KEY` was absent. Interview state is not a cursor —
it carries `pendingWrite` and the answers a write executes with — so an unsigned
one was a forgeable *write authorization*: hand-craft a state, pass
`confirmWrite: true`, and the server would execute it with attacker-chosen
values. Production always had the key set, so this was never live, but dev and
any self-host run without it. Both signers now share the non-degrading secret.
