# Cardstack chat and material review index

> **Current status — October 15:** Case editing, explicit record discovery, related-list navigation and controlled recovery/stale-result checks passed in both hosts; combined source is `a9a304e`. Flow OAuth and managed user/org verification succeeded; Studio acquisition/compilation is being tested. Lookup remains unsupported. See [overnight progress and current evidence](OVERNIGHT_PROGRESS_2026-10-15.md). Earlier inventory and test results below retain their dated scope.


Reviewed October 14, 2026. This documents retrieval coverage, authority and limitations for the architecture/product review. It is not a transcript archive. Credentials, transient OAuth URLs, tokens, private interaction keys and raw tool outputs are excluded.

## Discovery and review method

- `list_threads(limit=50)` returned all pinned chats and the 50 most recent non-pinned entries. This API has no older-page cursor; it does not establish all account history.
- Codex archive listing returned two entries and no next cursor. One cwd-matched archive concerned another product and was excluded from Cardstack conclusions.
- ChatGPT archive listing returned three unrelated entries and no next cursor.
- Local first-record `session_meta` discovery scanned **344 JSONL files** under `~/.codex/sessions` and `archived_sessions`. The cwd match for re-headed/cardstack/card-stack found **17 root sessions** and **196 subagent sessions**. Subagent metadata was inventoried, not exhaustively read; no raw private tool logs were exported. One voice chat identified by title was outside that cwd match and reviewed separately.
- **17 Codex chats / 287 returned turns** were paginated via `read_thread` to `hasMore=false`. The table includes two unrelated roots (watch skill and privacy response) discovered in the project cwd and excluded from product conclusions.
- **16 relevant visible ChatGPT chats / 33 returned turns** were read to `hasMore=false`. These contain host/probe request and response text; successful tool invocation prose does not itself prove iframe rendering. Current live acceptance is supported by dated source receipts and screenshots.
- Returned conversational messages, user requirements and final reports were reviewed. Tool/command entries were used as provenance pointers rather than a complete audit of every historical action.

Root session metadata discovery recovered older Cardstack chats absent from the sidebar, notably July20 field/action mapping and user-auth work, July27 Railway UX/auth deployment, and the October10 second auth/install chat. Exact titles below come from `read_thread`; no invented title was substituted.

## Codex conversation inventory

| Exact returned title | Chat ID | Retrieval coverage |
| --- | --- | --- |
| Editor Chat | `01a12b18-ea71-70a3-a73f-21ea0752cdfd` | 40 turns / 4 pages; hasMore=false |
| Improve the Salesforce admin UX | `01a134d7-5f0f-7621-8072-36f00fd38892` | 7 turns / 1 pages; hasMore=false |
| Build dynamic lookup picker | `01a1325f-9911-7870-b1bf-7821fff5bf94` | 12 turns / 2 pages; hasMore=false |
| Speed Up CRM Editing | `01a13615-4799-7bb3-b436-33318c90eef8` | 18 turns / 2 pages; hasMore=false |
| Map the project architecture | `01a1324e-4af9-7f60-a1cd-ffe055f6f2fc` | 7 turns / 1 pages; hasMore=false |
| Continue Cardstack Salesforce work | `01a10ba0-f5a5-7752-badc-b3775920d803` | 65 turns / 7 pages; hasMore=false |
| Cardstack production auth and installation… | `01a12500-2f98-7f80-bcfd-e2c504786489` | 37 turns / 4 pages; hasMore=false |
| Update Salesforce-native build plan | `01a12855-a23d-7a40-b269-c804a7850b27` | 3 turns / 1 pages; hasMore=false |
| Approve MCP Apps migration spec | `01a11ba7-7312-7441-8539-61398a72b8da` | 51 turns / 6 pages; hasMore=false |
| Continue Cardstack Salesforce work | `01a11ba5-d7f4-7050-8b61-b29f039f84e1` | 2 turns / 1 pages; hasMore=false |
| Review missing app features | `019f7f7e-fc9c-7313-82d2-2ad9a7c32d37` | 11 turns / 2 pages; hasMore=false |
| Add user authentication filters | `019f804a-9298-7810-b47d-b3430fa2334b` | 11 turns / 2 pages; hasMore=false |
| Explain Cardstack Salesforce link | `019f8079-839a-7161-85e9-3d6b4fd1cfc6` | 10 turns / 1 pages; hasMore=false |
| Review app UX and backend | `019fa39b-e592-7a72-9fd9-533983d10c7f` | 4 turns / 1 pages; hasMore=false |
| Cardstack production auth and installation… (2) | `01a1255e-4d7b-7e23-a330-8be367b03c8b` | 4 turns / 1 pages; hasMore=false |

Two unrelated conversations discovered through shared checkout metadata were excluded from product conclusions; their titles, identifiers and subject matter are omitted from this publication.

The present “Document Cardstack CRM architecture” chat was listed as active and excluded from the historical count.

## ChatGPT host/probe inventory

| Exact returned title | Chat ID | Retrieval coverage |
| --- | --- | --- |
| Open Salesforce Opportunity | `6acebd7b-c7b0-83e9-9d0b-528d6fbee11c` | 5 turns; first page hasMore=false |
| Open QA Opportunity | `6ace5c66-2b58-83ea-941c-9b7dbb79c0da` | 1 turns; first page hasMore=false |
| Open Cardstack Contact | `6ace3c43-9508-83ea-81dc-af9e6b180b5e` | 2 turns; first page hasMore=false |
| Open Opportunity Screen | `6acd755e-6584-83e9-9865-3a664a6b353e` | 1 turns; first page hasMore=false |
| Open connection test | `6acb795e-7430-83e9-b0f4-6c59cee71b39` | 5 turns; first page hasMore=false |
| Open Transport Probe | `6acaccad-d398-83ea-ac2b-de5f6c4ccee3` | 1 turns; first page hasMore=false |
| Salesforce probe test | `6ac7c794-e4e0-83ea-b587-eb92d8b7c012` | 1 turns; first page hasMore=false |
| Cardstack Input Error | `6ac3d15c-9da4-83e9-9d3e-f9e7a6420c05` | 1 turns; first page hasMore=false |
| Show Cardstack Error | `6ac3d0d9-f1ac-83ea-b8da-a406067515af` | 1 turns; first page hasMore=false |
| Show CardstackInputBoundaryAction | `6ac3cdc6-a654-83ea-a01b-047668e6b6a5` | 2 turns; first page hasMore=false |
| Cardstack input probe | `6ac3cd26-1838-83e9-91c6-adf0549f6951` | 1 turns; first page hasMore=false |
| Call Input Action | `6ac3c91d-7864-83ea-bc25-1bd3cd36f415` | 2 turns; first page hasMore=false |
| Render Salesforce Widget | `6ac3c867-8240-83ea-95e8-02ddb4ded1fd` | 2 turns; first page hasMore=false |
| Render editable screen | `6ac3b494-b668-83ea-b00c-85484d9b8abe` | 1 turns; first page hasMore=false |
| Render Salesforce Iframe | `6ac3b15a-f290-83ea-9b5b-69ae892d06ae` | 2 turns; first page hasMore=false |
| Render interactive form | `6ac3ac41-8610-83e9-8bfc-3018429ba95b` | 5 turns; first page hasMore=false |

Several old probe chats report no visible resource or HXL expression failures. Keep these failures as historical evidence. They are superseded for the current configured workflow by October14 actual-client proof; do not retroactively change their outcome.

The title “Open Salesforce Opportunity” currently includes requests to open an owned Lead. A chat title is not proof of its current record/object scope.

## Decision ledger

| Source chat | Decision or evidence | How to use it |
| --- | --- | --- |
| Continue Cardstack Salesforce work `01a10ba0…` | Native beta HXL testing, confirmation/governance, record actions; later user explicitly selected HXL retirement and renderer/interpreter reuse while keeping Apex/Studio | Historical release proof and architecture transition; old HXL limits are not latest custom-renderer limits |
| Continue Cardstack Salesforce work `01a11ba5…` | User explicitly states whole project hosted in Salesforce | Authoritative hosting direction; Railway deployment text in root docs is historical |
| Approve MCP Apps migration spec | Synthetic delivery, ordinary-user authorization/private setup boundaries, auth runbook and install design | Separate synthetic transport/auth proof from CRM product proof |
| Cardstack production auth and installation… and (2) | Unreleased validation package fresh install, auth/client proof, cleanup; natural refresh in both hosts; revoked-token/rotation evidence gaps | Historical exact-artifact install proof; no automatic latest-editor install claim |
| Update Salesforce-native build plan | User authorized documentation-only error and visual requirements | Requirements/checklists; not implementation/deployment authorization |
| Editor Chat | Opportunity → shared editor; configuration reuse; persistent integration; current October14 ten-field Lead milestone | Latest product/deployed-behavior report, corroborated by dated worktree receipts |
| Improve the Salesforce admin UX | Reviewed admin source and reusable publication/navigation/list changes; owner handoff | Contributor local report is superseded for deployment by combined-owner receipts |
| Build dynamic lookup picker | Picker/adapter local proof; incomplete native restriction/freshness backend | Lookup remains unsupported; UI tests do not establish governed writes |
| Speed Up CRM Editing | User wants generic engine, configuration reuse, fewer fragmented milestones and one persistent integration owner | Product intent; unrelated noisy voice tail omitted |
| Map the project architecture | Explanations and reusable dynamic lookup proposal | Design/context; proposal is not delivered lookup |
| Review missing app features / Add user authentication filters / Explain Cardstack Salesforce link / Review app UX and backend | Historical Node widgets/actions/mappings, identity, Studio and Railway work | Retired implementation history and reuse rationale |

## Materials used for PRD conclusions

Primary-checkout sources read: root AGENTS, native AGENTS, README, CLAUDE, PLAN, package/source directory inventory, native README, RECORD_ACTIONS, migration/error/visual/admin plans and source-check materials. Root Node milestone claims are preserved as historical and not copied into current-native “built” rows.

Current status comes from the combined integration worktree, not only primary-checkout docs:

- [Persistent record workspace, October14](PERSISTENT_RECORD_WORKSPACE_2026-10-14.md)
- [Configurable scenarios, October13 with October14 actual screens](CARDSTACK_CONFIGURABLE_SCENARIOS_2026-10-13.md)
- [Persistent combined integration](CARDSTACK_PERSISTENT_INTEGRATION_2026-10-13.md)
- [Admin source QA and limits](STUDIO_ADMIN_EXPERIENCE_QA_2026-10-13.md)
- [Native lookup qualification](LOOKUP_NATIVE_QUALIFICATION_2026-10-14.md)

The companion architecture/deployment reviewer independently inspected actual Salesforce source/deployment and Railway inventory. That audit found Railway production services still running despite the Salesforce-only architectural decision. “Retired architecture” therefore does not mean “decommissioned service.”

## Coverage limits and open collection work

- All accessible chats discovered by these bounded methods were reviewed for subject relevance; this is **not an exhaustive claim over every ChatGPT/Claude account, deleted chat, remote host or private attachment**.
- Claude historical conversations are referenced by dated QA artifacts and source links; they were not retrieved through the Codex chat reader.
- The local cwd filter can miss older chats in unrelated directories unless titles/summaries expose the relationship; July/session discovery reduces but cannot eliminate that gap.
- Subagent rollouts and all 344 session bodies were not exhaustively audited. This review favors owner summaries, source, dated receipts and user messages.
- The root reviewer searched connected Drive for Cardstack/re-headed/card-stack and found no matches. Pages searches for Cardstack/re-headed yielded only a generic “Your guide to pages,” with no relevant project content. This is search coverage, not proof that no related document exists under another title.
- No Page was open beside this chat (`page_id:null`).
- Historical screenshots, temporary files, external design references and raw credential-bearing QA files were not copied into the documentation. Follow sanitized source references when further validation is needed.
- No deployment, configuration publication, CRM write, chat message to another thread or service retirement was performed by this documentation review.

## How to maintain this index

When a future milestone completes, add the exact source revision, target environment, artifact identity, host proof and remaining boundaries to the deployment inventory and product status. Record a proposal as a proposal until reviewed implementation and actual acceptance exist. Reconcile older “pending” docs by dated receipts; retain failed historical runs as evidence rather than rewriting them.


## October 15 incremental Editor Chat review

Read the latest four turns, then the next ten older turns, focusing on owner messages and final reports. Reviewed the completed combined milestone turn `01a13c38-78a9-77f0-a0c7-2c7010628a00` through its final `a9a304e` handoff, subsequent credential setup reports, and active Flow turn `01a13f72-7b8a-7141-ba5c-fdcf0a185276` twice. The latter reports successful OAuth and real managed-callout user/org verification, followed by Studio loading/compilation testing. This is a bounded incremental read, not a repeat of all original chats or a completed active-turn outcome. Original retrieval counts remain the October 14 snapshot.

The [October 15 current-status report](OVERNIGHT_PROGRESS_2026-10-15.md) supersedes earlier pending Case/discovery/related/fault-acceptance labels and the old Flow credential blocker. Preparatory docs are older than the active authorization evidence. No other chat was messaged and no credential values were copied.
