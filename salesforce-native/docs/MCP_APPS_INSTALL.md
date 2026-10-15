# MCP Apps source installation guide

This is the preparation recipe for a **new, separately authorized installation**. The current `force-app/` source is Salesforce-native. Staging is an offline file copy; it does not create a package version, install one, activate a Site, or prove client authentication. The installed community beta 0.1.0.8 and its Hosted MCP/HXL companion remain in place. Follow [the beta package guide](../package/UNLOCKED_PACKAGE.md) for that existing distribution; do not treat this guide as a new release link.

Current synthetic installation evidence is for **unreleased 0.1.0.10**, built from `394cdb7`: actual package coverage 88%, fresh installation SUCCESS, and installed RunLocalTests 332/332 Pass. Both actual clients passed iframe/host bridge, seven exact typed values, empty text and full reload checks. Later [lifecycle evidence](evidence/install-auth-package/fresh-lifecycle-0.1.0.10.json) records natural OAuth expiry/client refresh in both clients and owned cleanup: restored default/absent app timeouts, inactive Site, removed owned client entries, deleted scratch org and HTTP404 discovery routes. Direct wire rejection of client-held revoked access/refresh tokens remains unmeasured; final acceptance remains separate. See [the current QA record](MCP_APPS_INSTALL_AUTH_QA.md) for receipts and remaining gates; this is not a release approval. Historical 0.1.0.9 failed actual UI receipt validation before the deadline precision correction and remains audit evidence.

Studio's current “Check installation” display labels `0.1.0.8` as “package.” That value is the fixed **runtime contract identifier**, shared by Apex, UI and diagnostic bindings; it is not the installed artifact version. Inspect Salesforce Setup → Installed Packages and the actual creation/install receipt for the artifact version (0.1.0.10 in current QA). Do not change the contract constant merely to match an artifact number: a contract change affects stale evidence and reverification.

## 1. Stage and inspect source

Use a new destination outside `salesforce-native/` and outside the repository checkout. From `salesforce-native/`:

```sh
python3 scripts/build-package.py --core-only /absolute/private/task-stage/cardstack-core
```

The core stage copies the reviewed Apex, LWC, static resource, object, app, tab, custom permission, flexipage, and Cardstack Admin/User permission-set source, plus `sfdx-project.json` and the package org definition. The core stage excludes `uiWidgets` and `lightningTypes` as the existing beta path requires. A normal stage retains those two companion types for the established separate deployment recipe; it still excludes org-specific metadata. Inspect the staged file inventory and scan for credentials before any version creation. A file-copy result is **not** a Salesforce packageability result. If a new source metadata family is added, update and review the explicit staging allowlist first.

Never add a subscriber Site, domain, guest profile/grants, External Client App, OAuth policy, global OAuth/JWT setting, callback, client credential, or token to core package source. The staging script excludes the known per-org metadata families and any unreviewed top-level family; only `Cardstack_Admin` and `Cardstack_User` permission-set files stage. The runtime HTML must contain no credential. Keep all identifiers and secrets out of release receipts.

The next controlled build gate uses Salesforce CLI package-version creation with API **67.0**, installation-key bypass, code coverage, and `config/package-org.json` in a suitable authorized Dev Hub. Use the command form in [the beta package guide](../package/UNLOCKED_PACKAGE.md#rebuilding), then install the resulting **new** version in a fresh, suitable second org and run its tests. Record the actual version ID privately and a sanitized version label in the QA matrix. A successful stage, prior beta install, or successful dev-org deploy does not satisfy this gate.

## 2. Assign installed access

Assign `Cardstack Admin` to the setup administrator and `Cardstack User` to each connected ordinary user. Confirm class access and Salesforce CRM object/field/record permissions for each user's intended work. The runtime gate checks `Cardstack_Use_Connections`; Studio setup checks `Cardstack_Manage_Connections`. The admin set includes both, while the user set grants Use only. An ordinary user does not need broad metadata administration. Private connection setup and diagnostic objects are server-owned; do not grant users direct CRUD on them. Site guests receive no CRM, setup, diagnostic, renderer, or broad Cardstack class access.

Before any Site/OAuth change, review [the proven auth runbook](MCP_APPS_AUTH_RUNBOOK.md) and capture the subscriber org's baseline. Create a dedicated Salesforce Site/domain and grant its guest only the ingress class and required constant landing page for public discovery/challenge. Verify anonymous requests receive the exact `401` Bearer resource-metadata challenge, and cannot fetch HTML, tools, records, or private setup. Named requests must execute as the connected Salesforce user. The Site prefix is selected for this org; the transport derives each client route from the current Site context and org issuer. It does not accept an arbitrary external endpoint or issuer.

## 3. Configure two Local OAuth apps

Create a separate Local External Client App for Claude and ChatGPT in the subscriber org. For each, configure authorization-code public client, `api` and `refresh_token`/offline access, required PKCE, refresh rotation, and the proven Site-route **opaque token issuance (JWT OFF)**. Use the host's exact callback and only its public client ID in Studio; leave the client secret blank for this public flow. Do not request broad `full`/`web` scopes or enable extra flows as a shortcut. Set app access policy and authorized users explicitly; each person signs in as their own Salesforce user. Salesforce issues and validates tokens, and the client owns refresh. Cardstack does not read, store, forward, decode, refresh, or revoke tokens.

The currently proven Claude callback is `https://claude.ai/api/mcp/auth_callback`; verify it against the current Claude connection screen before registering it. For ChatGPT, create a connection draft, copy the callback shown by that actual connection management screen, register that exact callback in the **ChatGPT** app, then finish consent. Do not reuse a probe callback or assume a universal ChatGPT redirect. The two route paths are `/services/apexrest/cardstack/v1/claude/mcp` and `/services/apexrest/cardstack/v1/chatgpt/mcp`, each with its sibling `/metadata` path under the installed Site prefix. Routes identify setup/diagnostic records; a route or header does not attest which OAuth app issued a bearer.

The deployment app, **Card Stack SFAPP**, is distinct from both runtime apps. If an authorized API67 SOAP Metadata deployment needs temporary JWT OFF and a fresh opaque CLI login, restore and verify deployment-app JWT **ON** in cleanup even after a failure. Active Site runtime apps follow the opaque-token recipe. Do not apply a disposable probe's disabled-app cleanup settings to an active runtime app.

## 4. Complete guided Studio setup and client checks

In Studio, use the connection setup for `claude` and `chatgpt` separately. Record the public client ID, exact registered callback list, selected 18-character Site ID/prefix, and enabled intent. Studio's supported browser boundary is `CardstackConnectionSetupController.loadForUi`, `saveForUi`, `checkForUi`, `observeForUi`, and `exportSummary`, each returning bounded JSON strings. The typed backend methods are internal facades, not browser signatures. Save uses an expected revision; resolve a `STALE_SETUP` against the latest view before retrying. A blank Site selection retains the server-owned prior selection. Current setup derives resource/metadata/issuer from supported Site/org context. It cannot read every Salesforce Site/ECA policy: `Unknown` means manual Salesforce Setup inspection is still required.

The guide's checked steps are resumable **instruction history**, not proof of runtime readiness. `checkForUi` refreshes current actor/context evidence; a diagnostic attempt expires after ten minutes, and old receipts can become `Stale` after revision, contract, or permission drift. `observeForUi` records an operator observation only for an already successful current backend receipt. `exportSummary` omits client IDs, callbacks, URLs, actors, receipt references, payloads, and raw errors. An admin's successful check does not establish an ordinary user's login or either client's actual UI result.

Connect each client independently, consent as a named ordinary user, and run the seven-value synthetic diagnostic in the actual iframe. Check exact types/values, including zero, false, Unicode/quotes, multiline and empty text, then reload the whole chat and repeat. Save separate screenshots and sanitized receipts for Claude and ChatGPT. Run the denial, expiry/refresh/revocation/reconnect, cross-client isolation, stale/upgrade and permission-removal matrix in [the QA guide](MCP_APPS_INSTALL_AUTH_QA.md). Stop on a failed security gate; do not mark a manual checkbox or an older probe result as an installed-product pass.

This installation work does not establish governed Account editing, a complete Screen Flow interpreter, HXL retirement, or release readiness. Those require their own reviewed implementation and live gates.

## 5. Use the supported verification interfaces

The preserved implementation plan contains obsolete `--org`, `--classes` and `--all` examples. Use the interfaces below instead. These examples document future separately authorized live checks; the approval flag is a scope gate, not authorization by itself. Neither helper supports the disposable fresh-install org alias.

From the repository root, the focused Apex helper accepts exactly:

```sh
node salesforce-native/scripts/run-apex-checks.cjs --controller-approved --target-org cardstack-spike2
```

It always runs only `CardstackConnectionSetupTest` and `CardstackConnectionContextTest`, validates their exact source method set, privately captures provider output, emits a bounded sanitized summary, and deletes its temporary capture. It does not accept class selection or `--all`, and cannot establish complete RunLocalTests.

The protocol helper accepts this ordered interface, separately for each client:

```sh
node salesforce-native/scripts/verify-mcp-connection.cjs --controller-approved --target-org cardstack-spike2 --client claude --scope-file /absolute/private/approved-claude-scope.json
```

Use `chatgpt` and its separate scope file for ChatGPT. An optional final `--sf-runtime /absolute/path/to/existing/salesforce-runtime` selects an existing dependency directory from whose `package.json` `@salesforce/core` resolves. The scope file must be owned by the current OS user, a nonsymlink regular file, nonempty, at most 16384 bytes, and mode 0600 (no group/other permissions). Its exact keys are `controllerApproved`, `alias`, `client`, `resourceUrl`, `metadataUrl`, `issuer`, `orgId`, `actorId`, `identityUrl`, and `apiUrl`. Approval must be true; alias must be `cardstack-spike2`; org/actor IDs must be valid full checksum18 IDs. URLs must match the approved Salesforce Site client route, sibling metadata route, org issuer, issuer `/services/oauth2/userinfo`, and issuer `/services/data/v67.0/limits`. Keep this file private; it is not a release receipt. The helper loads existing managed auth only after validation and never refreshes tokens. It cannot prove actual host/iframe/bridge exchange, OAuth expiry/refresh or MCP audience binding; those stages remain Unknown in its protocol summary. Actual client checks need their separate receipts.

For the complete installed-org Apex gate, use the supported Salesforce CLI directly after approval of the exact target. Its RunLocalTests includes local and nonnamespaced unlocked-package tests; it excludes managed and namespaced unlocked-package tests. This package's recorded 332-test result is independent of the focused helper. In a private shell, set `qa_target` to the authorized existing alias and use a new private directory outside the checkout:

```sh
umask 077
qa_capture=$(mktemp -d /tmp/cardstack-full-apex.XXXXXX)
sf apex run test --target-org "$qa_target" --test-level RunLocalTests --api-version 67.0 --result-format json --wait 10 > "$qa_capture/run.json" 2> "$qa_capture/run.stderr"
```

Inspect provider output only privately. A timeout/enqueued response is not a passing suite: obtain the returned test run ID privately, keep it in `qa_run_id`, and fetch completion with:

```sh
sf apex get test --target-org "$qa_target" --test-run-id "$qa_run_id" --api-version 67.0 --result-format json > "$qa_capture/completed.json" 2> "$qa_capture/completed.stderr"
```

Do not print, paste or commit raw CLI JSON, stderr, test run IDs, actor/org IDs, stack traces or provider logs. Preserve command exit status and verify completed outcome, counts, failed class/method names, and the installed test inventory privately; a CLI exit code alone or a partial suite does not prove full completion. Publish only the sanitized artifact label, source identity, UTC time, test level, completed counts and safe failure names. Keep actual package-version coverage separate from test-run coverage. Retain/remove private captures under the owned QA cleanup scope and record cleanup explicitly. These are existing CLI commands, not a new sanitized full-suite helper.
