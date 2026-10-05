# Cardstack beta distribution

Validated beta **0.1.0.2**, 81% Apex coverage. [Install beta](https://login.salesforce.com/packaging/installPackage.apexp?p0=04tg8000000QF0DAAW).

Keep versions **beta**. Do not run `sf package version promote`.

The Dev Hub is `cardstack-spike2`; package ID is `0Hog80000004dFhCAI`. Source is consolidated in `force-app/`. The full package attempt failed because HXL widgets were unavailable in Salesforce's validation org. The core beta excludes widgets, Lightning types, MCP definitions, and org-specific OAuth metadata.

```sh
python3 scripts/build-package.py --core-only /absolute/path/to/new-stage
cd /absolute/path/to/new-stage
sf package version create --package Cardstack --installation-key-bypass --code-coverage --definition-file config/package-org.json --target-dev-hub cardstack-spike2 --api-version 67.0
```

Use the returned `04t` ID to form `https://login.salesforce.com/packaging/installPackage.apexp?p0=04t...`. An install link is valid only after the request succeeds.

After core installation, an admin enables the HXL beta and Hosted MCP, configures an External Client App for the subscriber org, deploys companion widgets and Lightning types, and then deploys the Cardstack MCP definition. Connect Claude to `https://api.salesforce.com/platform/mcp/v1/custom/Cardstack` and refresh its tools list. Assign package permission sets and required Apex/CRM/MCP access. The current companion workflow requires Salesforce CLI; it does not yet meet the intended one-link admin-first installation experience.

For companion deployment, use `package/companion.xml` from the authoritative project, API 67.0, and a fresh opaque login. Restore the subscriber External Client App JWT setting to ON after deployment. OAuth secrets and local client-app metadata are never included in the companion archive.

## Deferred packaging work

Investigate a supported way to provision HXL in package validation orgs, move widget/Lightning-type metadata into the package, and automate subscriber MCP/OAuth onboarding. McpServerDefinition currently has no unlocked-package support in the official metadata coverage report. Track platform changes before claiming a complete single-link package.

References: [Metadata coverage](https://developer.salesforce.com/docs/success/metadata-coverage-report/references), [HXL prerequisites](https://developer.salesforce.com/docs/platform/hxl/guide/prerequisites.html).

## Layout repair after beta 0.1.0.2

The current source adds the Classic-style palette/canvas builder with per-section 1/2/3-column choices and `cardstackRecordV2` structured chat rendering. Beta 0.1.0.2 predates this repair. A new package version was blocked by the Dev Hub daily package-version-create limit on October 5, 2026; no replacement install URL is claimed. Deploy current native metadata to apply the repair until another unpromoted beta can be built.
