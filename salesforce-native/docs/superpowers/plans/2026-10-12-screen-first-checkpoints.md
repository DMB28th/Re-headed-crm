# Screen-first checkpoint plan

User-authorized October12 revision; same existing worktree and selected subagent
execution. Source/acceptance contract: ../specs/2026-10-12-reusable-screen-milestone.md.

1. **Working reusable screen** — implement registry/layout/view + transport controller,
   self-contained runtime and bridge-free synthetic preview. Use existing SDK/deps.
   Meaningful tests: all3 literals, type-specific empty/clear/exact-number/calendar/
   picklist handling, server validation, review/confirm/receipt/refresh, cancel/back,
   unknown outcome, record-switch/late replies/reload/teardown. One implementation
   handoff then consolidated spec/quality review and controlled-browser walkthrough.
   Renderer tests are not server or real-client proof.
2. **Compatible Salesforce execution** — in parallel, complete approved beta build
   + fresh install/full suite, resolve distinct package failures without changing
   actor authority. Real supported provider checks determine Stage availability.
   Prepare one concrete integration QA scope for ordinary actors/two processes/
   fixture configs+records/client apps. Existing package-only approval excludes
   those new write/connection actions; do not ask until bundle is ready. Combine
   relevant backend/Account/action regressions with integrated run; no repetitive
   mirrored test batches or full re-reviews for lexical changes.
3. **Actual end-to-end acceptance** — after compatible backend + built UI, connect
   both advertised hosts in authorized QA scope. Demonstrate full3-field scenario,
   validation/cancel/lost response/stale record results, independent CRM/audit/
   receipt readback and refresh distinction. Record client-specific results and
   remaining unsupported behavior; cleanup owned resources, JWT ON, preserve beta.

Studio preset/preview work follows the shared renderer contract and remains within
approved native Studio scope; execution always requires published valid preset.
For reusable presentation, ordinary layouts/descriptors are reusable; the current
backend exposes only the first3-field governed process until another server
capability is separately implemented. No renderer hardcoding of those field APIs.

Superseded: do not wait for package/provider acceptance to start UI source. Keep
actual live gates and evidence distinctions. Source updates requested directly by
user; no additional design/source permission round.
