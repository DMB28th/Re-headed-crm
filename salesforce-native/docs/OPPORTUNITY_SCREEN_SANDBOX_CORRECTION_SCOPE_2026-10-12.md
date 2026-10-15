# Proposed narrow QA screen correction

October 12, 2026. Prepared, reviewed source; **not deployed**. The previously approved full-UI beta 0.1.0.11 is installed and passed 530/530 methods. Actual Studio preview then exposed an inert Review button: native form submission is forbidden by its intended sandbox. This correction removes that dependency without expanding iframe permissions.

## Exact new action

Deploy only `StaticResource:CardstackOpportunityEditUi` and `StaticResource:CardstackOpportunityPreviewUi`, plus their unchanged resource metadata, through API 67 to the **existing owned one-day QA org** `cardstack-opportunity-screen-qa-95acd7d`. Source is committed at `8ffd115f73b5d13fb2986e7af6444ca06c16de88`. No additional beta, org, backend/LWC deployment, dependency, privilege, callback, hosting service or release is proposed. Existing bounded live acceptance and cleanup approvals continue.

The four exact files and two-member manifest are frozen privately in `.superpowers/sdd/2026-10-11-opportunity-custom-mcp-apps/native-sandbox-correction-prepared/`. Recheck every hash and match the owned org's full18 identity before submission. Use the standard supported Metadata deploy with no skip-validation or tracking override. If Salesforce refuses modification of the installed components, preserve the failure and stop this correction; do not create another version or substitute a target.

| Resource | SHA256 |
| --- | --- |
| Runtime | `4a01a3718f66a4c20cb7ffb12b554890f8afa6935ac744679f4635c2197bcd38` |
| Studio preview | `ab1d9be19fb11c0d8e8d03b40e35c26a8b6a90b982c5db5b492abd5abf718b53` |

The reviewed source uses a JavaScript button and direct single-line Enter activation. Textarea, choice, composition, disabled and detached controls retain their behavior. All35 renderer tests pass; independent reconstruction matches the runtime, preview and synthetic demo byte-for-byte. These are source/renderer findings, not corrected native-browser proof. Apex, Salesforce authority and the allow-scripts-only sandbox are unchanged.

## Concrete retest and evidence boundary

Require deploy Success and independent retrieval/hash agreement for both resources. Then reopen actual Studio preview: change all three values, show invalid-date correction, Review through click and single-line Enter, Back and Cancel, and verify Save disabled. Do not add `allow-forms` or `allow-same-origin` to make the test pass. The three-field preset has no textarea; broader multiline semantics remain renderer-tested unless an actual supported generic preview exposes that control.

Continue the existing ordinary-actor Claude/ChatGPT scenario, keeping native Stage and execution authoritative. Observe each client's actual iframe, Review, explicit Confirm, receipt and independent CRM refresh separately. Preserve unobserved lost-response and late-reply cases as unobserved rather than representing simulated tests as live proof.

Describe this environment as **installed beta0.1.0.11 plus the two reviewed UI-resource QA corrections**. Its original fresh-install/package/test evidence remains valid for the frozen artifact; it does not prove a fresh package containing the correction. No unchanged 530-method backend rerun is proposed for this JavaScript-only patch. A future corrected release artifact needs its own package evidence and authorization.

Cleanup remains the existing exact owned resource/org cleanup, including Site deactivation and deletion of only the matching disposable org. Preserve historical failures and the five pre-dirty files. The installed beta0.1.0.8 and all prior environments/connections remain outside this target.

## Execution receipt

The user authorized continuation after reviewing this proposal. The two-resource API67 correction deployed successfully: 2 components, 0 errors. Independent retrieval matched all four frozen files. Actual Studio synthetic preview passed the three-field and generic walkthroughs recorded in [acceptance evidence](OPPORTUNITY_CUSTOM_UI_QA.md). No additional beta or org was created. Actual chat-client acceptance remains pending; no fresh corrected-package claim is made.
