# Proposed shared-control QA update

October 12, 2026. **Approved, deployed and independently verified; live retest in progress.** The user requested date pickers, existing/default picklist selection and numeric comma grouping. Source `fccf5162864397f17ba942fe818aff704fe8c975` implements these in the shared renderer. The user approved this exact two-resource QA update with “approved” after reviewing the prepared scope; the preceding source8ffd115f deployment remains separate.

## Exact action and boundaries

Deploy only `StaticResource:CardstackOpportunityEditUi` and `StaticResource:CardstackOpportunityPreviewUi`, with their unchanged metadata, through API67 to the existing owned one-day org `cardstack-opportunity-screen-qa-95acd7d`. No new package, org, backend/LWC deployment, rights, Site, app, host connection, dependency or release. Existing acceptance/write budgets and exact owned cleanup remain in force; three native save effects have been observed so far, with five slots remaining in the original eight-effect limit.

The four frozen files and exact two-member manifest are private in `.superpowers/sdd/2026-10-11-opportunity-custom-mcp-apps/shared-control-ux-prepared/`. Before submission, verify every hash and the exact owned org's full18 identity. Use standard Metadata deployment with no skip-validation or conflict override. Require Success and independent retrieval/hash agreement. Stop and preserve failure if Salesforce refuses; do not create another beta or substitute a target.

| Resource | SHA256 |
| --- | --- |
| Runtime | `3cec5c61012b9e4e30d53f285d557af89a139b5a5f306f4f9ff0cecb093f4597` |
| Preview | `cd87dfa5bcb7b47cb7d8a2150b19174baeb66faeea56ed689a3b2ef64b36599f` |

## Reviewed behavior

DATE uses the browser's native picker and canonical YYYY-MM-DD value, without timezone conversion or hijacking calendar Enter. Picklists select the server's starting value unless a retained proposal or explicit Keep overrides it; untouched current values remain omissions. Inactive values display as unavailable instead of inventing a replacement. A missing initializer does not cause a guessed default.

INTEGER/DECIMAL/DOUBLE/CURRENCY use type-aware comma grouping and strict string-only canonicalization. Large integers, signs, zeros and fractional precision are retained; malformed comma groups are rejected. Numeric-looking STRING values stay literal. Checked public type metadata supports summaries and is reset on record/interview/access changes; a restored receipt lacking type metadata remains literal. Salesforce still owns choices, authorization, review and execution. Browser formatting creates no extra field changes.

Snapshot and Starting value wording now distinguish cached record results and retained proposals from current Salesforce values. This does not deliver full-chat receipt recovery. Both clients currently restore their original Open snapshot after reload; an explicit Refresh obtains current values.

The coordinator's covering renderer suite passed40/40. Consolidated source review found no blocker, and independent reconstruction reproduced all three generated bundles byte-exactly with matching CSP hashes. These remain renderer/source evidence. Actual native picker behavior and each client's updated controls are unverified until deployment and real walkthrough.

## Live retest

Exercise Studio's Opportunity and generic showcases: open and select a native calendar date; verify its exact value, keyboard behavior, required errors and disabled Save. Verify loaded picklists, explicit Keep and exact comma formatting, including a large integer, malformed grouping and numeric-looking text.

In both existing owned clients as ordinary A, verify starting values, native Stage contexts, grouped inputs and typed server Review; cancel where a save is unnecessary. Use at most two of the remaining authorized save slots if needed to demonstrate exact canonical date/decimal values, receipt and independent fresh read. Keep renderer, native and actual-client outcomes separate. Lost-response and delayed-record-switch cases are not promoted from local tests into live proof.

Describe the environment as installed beta0.1.0.11 plus reviewed UI-resource QA updates, not a fresh package containing the changes. No unchanged530-method backend rerun is proposed for this UI-only update. Cleanup remains the exact previously approved owned-client/app/Site/org cleanup; preserve all prior environments, historical failures and five pre-dirty files.

## Execution checkpoint

Standard deployment initially stopped locally on four tracking conflicts. Isolated read-only retrieval matched the exact previous installed8ffd resources, so normal retrieval reconciled the private project’s two-resource local baseline. The same approved files were restored and one normal retry succeeded:2 components,0 errors. Final independent retrieval matched all4 files, also checked by the coordinator. No conflict override or tracking reset was used; the initial failure is preserved.

Actual Studio now renders Discovery preselected, Amount10,000 and a native segmented date/calendar control. Calendar Left changed the selected day by one. Final day selection and client walkthroughs remain pending because the active Chrome window moved away during testing. No new CRM save effect occurred. [Safe update receipt](evidence/opportunity-edit-2026-10-11/shared-control-ux-fccf516.json).
