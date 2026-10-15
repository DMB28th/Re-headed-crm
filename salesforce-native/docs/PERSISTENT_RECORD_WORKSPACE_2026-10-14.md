# Persistent Salesforce record workspace

October 14, 2026. Application `5275b7e` is deployed to the existing persistent org
`cardstack-spike2`, API67. Actual ChatGPT and Claude acceptance passed for the configured
ten-field Lead workspace, with one independently verified native save per host.

## Delivered behavior

One shared workspace has a stable record identity header, configured sections, an
inner scrolling area and reachable task actions. Editing updates retain actual
field controls, exact drafts, touched/clear intent, focus and selection. Preparing
Review and saving retain the task while disabling duplicate actions. Review and
receipt rows follow configured sections. Salesforce owns review, explicit Confirm,
validation, authorization, audit and durable receipt state; no object-specific
writer or new public authority was introduced.

After successful Refresh, the header uses the checked current record name/object.
Historical receipt values remain unchanged, including if a later refresh fails.
Host `maxHeight` is a ceiling: the app uses a compact preferred 500px overall
envelope capped by that ceiling, while a valid fixed height retains its explicit
size. Checked safe-area insets fit inside the envelope, and theme-only updates
retain sizing. When the measured identity/action chrome cannot fit, the flowing
fallback makes all actions and content scroll-reachable. This does not promise
that fifty actions or a long name fit inside a tiny viewport without scrolling,
or that the app controls the outer conversation viewport.

## Coherent qualification and deployment

The `3daad61` baseline passed **808/808 native methods** with **90.38% aggregate
coverage**. Independent readback reconciled **329 metadata files**, including
nine explained platform-default XML differences. The final `5275b7e` deployment
changed only **three StaticResources**. All **357 non-UI core files** are byte
identical to the qualified baseline; Apex, permissions and backend behavior were
not changed by this UI delta.

The new immutable UI artifact passed **124/124 focused native resource/adapter
methods**, and independent retrieval matched all **six resource/body metadata
files** exactly. The final shared renderer/contract suites passed **93 focused
checks**, with the existing offline builder retaining SDK **1.7.4**. This is a
qualified unchanged native baseline plus a tested UI delta, not a claim that
another full 808-method run was performed for the delta. Superseded candidates
and the earlier canceled `1702e6c` run remain preserved as historical evidence.

| Evidence boundary | Result |
| --- | --- |
| Complete native local Node suite before isolated presentation corrections | 442 passed; subsequent corrections used focused checks |
| Final focused shared renderer/contract suites | 93 passed, zero failed/skipped |
| Qualified native baseline | 808/808, 90.38% coverage |
| UI delta native resource/adapter regression | 124/124 exact expected methods |
| Independent UI resource retrieval | Six files match exactly; 357 non-UI core files unchanged |
| Source review and scoped presentation corrections | Approved |
| Final preservation and rebuild | Six original configs and five pre-existing dirty-file hashes unchanged; all five rebuilt assets match `5275b7e` |
| Synthetic real-browser continuity | Active field, selection, exact draft, Clear and inner scroll retained across a public context update |
| Synthetic normal/narrow geometry | Reachable actions; no horizontal overflow at 390x844 |
| Synthetic constrained geometry | Long-name/288px Review and fifty-action Card remain scroll-reachable |
| Actual ChatGPT configured ten-field Lead | PASSED: validation, Back/re-review, one Confirm, receipt, fresh checked header and native readback |
| Actual ChatGPT cancellation before/after Review | PASSED: zero added audits and unchanged native values |
| Actual Claude configured ten-field Lead | PASSED: validation, Back/re-review, one Confirm, receipt, fresh name and all reviewed native values |
| Actual Claude cancellation before/after Review | PASSED: unchanged native values and LastModifiedDate; audit delta zero |
| Actual host action visibility | Both corrected 500px workspaces had visible footers; Claude retained the measured outer iframe position/ancestor scroll at two checkpoints |
| Actual-host lost Confirm response / delayed stale-record switch | NOT_RUN |

Synthetic browser fixtures prove renderer behavior and measured geometry; they do
not establish Salesforce permissions, actual-host delivery or CRM writes.

## Actual-host observations

ChatGPT completed the ten-field Lead journey. Invalid Employees `1.5` produced a
client correction error. Back retained the proposal; re-review then one explicit
Confirm produced a receipt and exactly one new native save audit. Refresh showed
current values and the fresh checked record name. Draft cancellation and
cancellation after Review each had zero new audits and no native record changes,
independently verified.

In Claude, the existing conversation failed to load the changed resource even
after refreshing the existing tool discovery. A fresh conversation after that
same existing tool refresh loaded the corrected 500px app. Claude then passed
the complete ten-field journey: Employees `1.5` was blocked; Back retained the
proposal; re-review and one Confirm produced the receipt; Refresh showed the fresh
checked name and all reviewed native values. Draft and Review cancellation each
left native values and LastModifiedDate unchanged, with zero audit delta relative
to the preceding ChatGPT save. Total native audit delta from the common baseline
was two: one save per host.

Both actual hosts had visible action footers in the corrected 500px workspace.
In Claude, the measured outer iframe before Review and after Refresh retained
height 500, top 134 and bottom 634 in a 720px viewport; the enclosing ancestor
scrollTop remained 186. These are observations at those two checkpoints, not an
app-controlled outer-scroll guarantee.

The observed fresh-conversation recovery required no new connection or
authentication change. Keep historical-card loading separate from fresh-conversation
acceptance, and do not
claim every old conversation can recover a changed resource.

## Remaining capabilities and proof boundaries

- Natural name resolution/disambiguation is separate from known-ID Open.
- Supported scalar fields use checked native descriptors, precision/scale and
  current choices. REFERENCE lookup remains unsupported: suggestions alone do
  not prove source-field eligibility or fresh locked confirmation. See
  [native qualification](LOOKUP_NATIVE_QUALIFICATION_2026-10-14.md).
- Actual-host response-loss and delayed stale-record-switch faults remain NOT_RUN;
  backend/renderer fixtures do not qualify those actual-host rows.
- No new org, authentication, credentials, package release or fresh-install claim.
  Existing OAuth settings remain unchanged and deployment JWT remains ON.

The [actual-client evidence](evidence/configurable-record-edit/persistent-workspace-live-clients-2026-10-14.json)
records the verified journeys and proof boundaries. Root owns the final
live-acceptance and preservation receipts. The historical-conversation loading limitation and uninduced
actual-host fault cases remain explicit despite both completed happy journeys.

## Evidence and environment preservation

[Sanitized milestone receipt](evidence/configurable-record-edit/persistent-workspace-live-clients-2026-10-14.json) separates backend qualification, renderer checks and actual-client acceptance. The final independent offline rebuild matched all five committed assets exactly. All six published configuration records and five pre-existing dirty files remained unchanged. Existing host connections continue to use `cardstack-spike2`. Temporary renderer fixture hosting was stopped; no new development org was created.
