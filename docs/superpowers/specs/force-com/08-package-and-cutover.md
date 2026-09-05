# Session 8 — Package and cutover

**Goal:** an installable unlocked package, CI that proves it, and the
retirement of the Node stack.

## Deliver

- **Unlocked package** (namespaced) with `package.xml`-free source layout,
  `sf package create` / `version create` scripts, and a versioning note in
  `force-app/README.md`. Versions are promoted only after CI passes.
- **Post-install script** (`InstallHandler`): generates
  `MCPforce_Settings__c.Signing_Key__c` if blank; creates nothing else.
  Confirm from Session 0 whether it can also read the consumer secret; if
  not, the Connect page's "set it" path stays.
- **CI (GitHub Actions):** on every PR create a scratch org, deploy, run
  Apex tests with coverage ≥ 85 % per class, run Jest, build widgets and
  diff against the committed static resources (fail if stale), run the
  contract-test capture and vitest, delete the org. Nightly: package version
  create against the Dev Hub.
- **Named Credential + External Credential** for Studio's Tooling API
  access (`MCPforce_Self`), packaged, with the install guide covering the
  one-time per-user authorisation on the Flows page.
- **Retire:** delete `apps/mcp-server`, `apps/studio`,
  `packages/config-store`, `packages/crm-adapters`, `docker-compose.yml`,
  the `demo:m*` scripts, and the Railway service (memory note
  `railway_deploy`). Keep `packages/core` (schemas + contract tests) and
  `packages/widgets`.
- **Docs:** rewrite `CLAUDE.md` for the new layout, commands, and hard rules
  (rule 5 "adapters never import from apps" and rule 6 "/design" are
  retired; rule 2, 3, 4, 7, 8 stay with on-platform wording; add "config
  reads in chat come only from Published rows"). Update `PLAN.md`'s header
  to point at the overview spec. Move the retired docs under
  `docs/archive/`.
- **Install guide:** `docs/install.md` — install the package, assign
  permission sets, set the consumer secret, share the Connect page.

## Out of scope

AppExchange security review and managed-package conversion (the namespace is
already in place for it).

## Read first

- `docs/superpowers/specs/force-com/00-result.md` — what Session 0 learned about install-time secrets.
- Memory notes `railway_deploy`, `railway_cli_tooling` — what to decommission.
- The current `CLAUDE.md` — which rules survive.

## Acceptance

- A fresh Developer Edition org installs the package version, an admin
  assigns both permission sets, sets the secret, seeds one layout in Studio,
  and a rep connects Claude and runs Golden Paths 1–3 and M4 from the
  install guide alone.
- `main` has no references to Railway, Postgres, HubSpot, tenants or
  workspaces outside `docs/archive/`.
