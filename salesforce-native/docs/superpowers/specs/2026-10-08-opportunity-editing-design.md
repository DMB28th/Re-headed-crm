# Opportunity editing inside chat

Date: October 8, 2026
Status: Superseded as the next implementation scope by the custom MCP Apps migration direction; implementation has not started.
The Opportunity field requirements remain a future acceptance scenario. See 2026-10-08-custom-mcp-apps-migration-design.md.
Execution preference: Subagent-Driven Development, selected by the user.

## Intended outcome

An admin publishes an Opportunity record-card action in Cardstack Studio. A user clicks that action in Claude, edits Stage, Close Date, and Amount through guided HXL inputs, reviews current and proposed values, explicitly confirms, and sees the saved, refreshed Opportunity card.

This extends the native record editor already verified for Account. Salesforce-hosted Apex, HXL widgets, and Studio remain the architecture. No external runtime service is introduced.

## Scope

Support updates to existing Opportunity records. Preserve existing Account text/integer editing and published actions. Add single-select picklist, date, and decimal/currency handling for the Opportunity milestone. The runtime object comes from the record ID and must match the published action's object.

The release acceptance path uses StageName, CloseDate, and Amount. Existing text/integer types remain usable on Opportunity where exposed and editable. Decimal support follows the target field's precision and scale; it is not limited to integer amounts.

Excluded: record creation, Contact expansion, lookups, dependent picklists, multi-select picklists, rich text, full Screen Flow interpretation, arbitrary flow-variable mappings, delete operations, and simultaneous multi-field forms. StageName support is mandatory for calling this milestone complete.

## Admin authoring

Objects → Opportunity → Actions offers the native in-chat record-edit process. The admin selects one to twenty distinct exposed, editable, supported fields in order. Starting-value mappings retain the existing choices: current value, exposed record field, constant, or user answer. Record ID is implicit card context and cannot be redirected by a mapping.

Published layout settings control whether chat edits are enabled, each field's required/read-only state, action availability, and mappings. Drafts never authorize runtime editing. Salesforce field accessibility and updateability remain additional constraints. A field is required when either Salesforce or the published layout requires it; Studio cannot weaken a Salesforce requirement.

Unsupported fields or incompatible literal defaults produce a field-specific authoring error. Field-source defaults are validated when resolved at runtime. Disabled, unpublished, mismatched, or invalid actions do not become executable buttons. Existing Account configurations continue to work without migration.

## Runtime boundaries

Keep CardstackRecordEditAction as the external tool entry point and retain its operations: start, answer, skip, clear, back, resume, cancel, and confirm. Extend CardstackRecordEditService using an object-aware field adapter for reading defaults, validating answers, creating typed patches, comparing values, and generating review text. Both the action resolver and editor use the same supported-field rules.

Picklist option resolution is a separate provider with an explicit contract: object, record type, field, current user, valid choices, and availability/error. Options must reflect the Opportunity's record type and sales process and use labels for display with exact API values for submission. Generic field-describe choices alone do not satisfy that contract. No free-text Stage fallback may be represented as a verified picker.

The implementation plan must establish a documented, Salesforce-hosted way to supply those choices in the connected-user execution context. This is the first feasibility checkpoint. If it cannot be verified, stop that capability with a specific unsupported reason and report the platform limit; do not broaden permissions, add external hosting, or claim the complete milestone is delivered. A new credential or security-sensitive configuration requires separate review before enabling it.

If tool-output schemas change, introduce versioned Lightning Types and HXL widgets and update the Hosted MCP binding. Preserve installed versions and avoid changing immutable released schemas in place.

## Input behavior

Use the proven one-field-per-step transport. Widgets submit literal values rather than asking the model to reinterpret them. Every response carries the latest interaction revision; authority and validation remain in Apex.

- Stage: display only authoritative allowed choices. Submit the selected API value. If the current value is no longer selectable, show it as the current value and allow Keep current, but do not offer it as a new choice.
- Close Date: use a date input where its HXL transport is verified, otherwise a clearly labeled YYYY-MM-DD text input. Reject ambiguous formats and invalid calendar dates. Do not convert through a timezone.
- Amount: use a verified numeric input or a clearly labeled decimal text input. Accept a plain decimal value, including zero; reject grouping separators, currency symbols, exponent notation, and values outside field precision/scale. Show the record's applicable currency. Do not infer conversions or silently round.
- Optional clearing: use the explicit Clear value operation. Empty numeric/date answers are validation errors, not inferred clears. Required fields cannot be cleared.

Back retains answers; Keep current removes any previously entered patch for that field. Cancel never saves, including unsent input content. Defaults do not become writes until accepted. If there are no effective changes, finish with a no-changes receipt without DML.

## Review, governance, and recovery

Review shows field labels and current → proposed values in action order, using labels for Stage and unambiguous date/currency formatting. Internal confirmation keys never appear in rendered text.

Retain actor binding, private interaction state, revision checks, fifteen-minute expiry, published policy binding, mapped-source freshness, exact patch confirmation, and repeat-safe completion receipts. Policy, permissions, record type, selectable options, or source/target data changing must prevent an old review from being saved. Revalidation before confirmation must match the validated values and option context used for that review.

A stale record or configuration requires a new edit; never silently move the confirmation to another review. A recoverable input error leaves the current field and prior answers intact. Salesforce validation or automation errors leave the edits recoverable and clearly unsaved. If a confirmation is invalidated or consumed, generate a new review before another confirmation; do not reuse a stale grant. Successful save renders the refreshed record once.

Sharing and field permissions apply to reads and writes as the connected user. Published Cardstack rules can narrow access, never widen it. Existing audit behavior applies to the final operation. No new execution path bypasses the preview/confirmation/write contract.

## Verification and release acceptance

Automated coverage must establish:

1. Existing Account editing/actions still work, including zero, empty text, Unicode, Back → Keep current, cancellation, and repeat-safe completion.
2. Opportunity record IDs, published actions, mapped defaults, allowed fields, and read-only/required rules are enforced; alternate-record/object requests cannot redirect an interaction.
3. Stage options and submitted API values obey record type/sales process. Missing option context and unsupported dependent fields fail clearly. Changed option/record-type context invalidates an old review.
4. Dates reject impossible/ambiguous values. Amount preserves decimals and zero, rejects excess precision/scale and unsupported formats, and compares normalized typed values correctly.
5. No writes occur before exact confirmation. Stale revisions, wrong actors, altered patches, policy changes, record changes, and expired interactions cannot save.
6. Validation errors, correction, resume, Back, Skip, Clear, Cancel, and duplicate confirmation have truthful states and preserve or discard answers as specified.

Live Claude QA uses disposable Opportunity records and temporary published configuration. Prove the real record-card button, picker and literal input transport, invalid-input correction, current → proposed review, pre-confirm unchanged record, exact save, refreshed card, cancellation, and stale-data rejection. Test at least two distinct record-type/sales-process configurations for option fidelity, if the org permits setting up those fixtures; if not, retain that release claim as unverified and do not claim general record-type support.

Run the complete development-org Apex suite, Studio tests, and a fresh installed-package suite after changes. Build an unpromoted beta and verify the companion bindings. Record actual test totals and evidence rather than reusing older release counts. ChatGPT parity is a separate live check; if unavailable, label it unverified.

Restore original configs/drafts and temporary org settings, remove disposable fixtures, and leave JWT ON after every deployment session. Never log credentials, session IDs, private interaction keys, or confirmation tokens. Commit only authoritative salesforce-native source; retired apps/ and packages/ remain untouched.

## Completion boundary

Delivered means the configured Opportunity action works end to end inside Claude, with StageName, CloseDate, and Amount plus the governance and recovery checks above. A text-only tool response, a Salesforce handoff, or passing Apex tests alone is insufficient.

Next after this milestone: broaden field/object support and design a compatibility report for supported Screen Flow interpretation. Those are separate scopes, not implied by this release.
