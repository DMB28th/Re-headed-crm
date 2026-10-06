# Published record actions implementation

Approved outcome: Studio action picker/mappings → published record button → supported in-chat process → exact review/confirm/save → refreshed card. Extend the existing record/editor path; no external hosting or Screen Flow runtime endpoints.

First executable process: Account text/integer field editing. Input mappings select editable target fields and starting values from current values, exposed/readable record fields, string constants, or user answers. Record ID is always the card context, never a configurable alternate target. Starting values are not writes: Next submits them, Keep current skips them. Bound interaction state retains resolved defaults, fields, policy revision, source freshness, and exact confirmation.

Salesforce flows: choose a published launch card from Flows. Its button is explicitly Open in Salesforce, maps only recordId, and never claims in-chat execution. Unsupported legacy action types are preserved but not rendered as executable buttons.

- [x] Add failing tests for published action lookup, disabled/missing/draft isolation, mapped constants/zero/read fields, denied fields, exact guided save, mapping freshness, and disabled actions hidden.
- [x] Add CardstackRecordActionService for published configuration/validated target resolution; extend editor start with actionName and server-held defaults/sources. Existing unconfigured edit operation stays compatible.
- [x] Extend Studio authoring with process/launch picker, ordered input rows, validation, and metadata-preserving serialization. Test round trips, unknown targets, duplicates, missing inputs, and zero/empty constants.
- [x] Add versioned record output types/widget and rendered action buttons. In-chat messages carry record ID and actionName, never credentials. Flow URLs are constructed by Apex from validated published flow API names.
- [x] Deploy API67 with final JWT ON; full Apex and Studio suite. Own live Studio staging/publication and Claude button/input/review/save/read-back/refresh/cancel QA on disposable data; restore all original data/drafts/config.
- [x] Build/install unpromoted beta, document supported limits, commit/push main. Any failure preserves existing published behavior and truthful runtime state.

Verification: 172/172 development Apex, 167/167 clean installed Apex, 26/26 Studio. Beta 0.1.0.8 built/installed; live native action and Lightning flow-context QA passed. Original configs/drafts/debug preference restored; disposable data removed; final JWT ON.
