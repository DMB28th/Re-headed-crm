# GitHub source and documentation reconciliation

October 15, 2026. This branch publishes a native-only snapshot of the verified local integration baseline `a9a304e` together with the architecture, product overview, field mapping and overnight progress documentation. The snapshot starts from GitHub main `451ba21`; it does not push the integration branch's internal execution-log history. `a9a304e` identifies local provenance; the PR's commit contains the reconciled publishable snapshot.

## Scope

The native `force-app`, UI sources, scripts, tests, project/package metadata, reviewed plans and sanitized verification materials come from the committed integration baseline. The original implementation checkouts are preserved. Uncommitted Flow compiler/provider/publication/controller changes, unqualified lookup materials, raw local QA directories, credentials, deployment settings and `.superpowers` execution logs are excluded. No legacy Node/HubSpot/Railway application code is changed.

Project documentation is copied from the documentation checkout, reconciled with the latest milestone report, and linked through repository-relative paths. References to the earlier HXL source use the inspected GitHub main revision. Historical verification counts and observed inventories retain their original dates. The native README and persistent instructions now point to the current status; the root README identifies its remaining Node deployment instructions as historical.

## Fresh publication checks

| Check | Result |
| --- | --- |
| Complete native local Node suite | 511 passed; zero failures/skips/cancellations |
| Offline checkpoint preparation Python suite | 14 passed |
| Normal UI rebuild with existing SDK 1.7.4 | All three generated current StaticResources and two demo HTML files byte-identical |
| Secret scan | Gitleaks 8.30.1 native directory scan passed after exactly three reviewed checksum false positives |
| False-positive review | Three flagged entries independently matched JSON SHA-256 source checksums; narrow file/line/rule fingerprints recorded in `.gitleaksignore`, no broad suppression |
| Independent publishing review | Native-only scope and all eight ZIP contents inspected for credential material; no publishing blocker found |

Tests used Node 24 and existing local jsdom/Vite/SDK dependencies, supplied through `CARDSTACK_UI_DEPENDENCIES` and `NODE_PATH`. They exercise source and synthetic contracts, not Salesforce access or actual clients. The original native/host evidence is retained separately in the [overnight status](OVERNIGHT_PROGRESS_2026-10-15.md) and [combined milestone](COMBINED_WORKSPACE_MILESTONE_2026-10-14.md).

## Proof and merge boundaries

The combined developer QA application and scoped native patches were deployed and tested by Editor Chat. Normal local assets being restored/rebuilt does not mean those ordinary assets were deployed to replace the QA variant. The broad native milestone run remains 938/940 followed by the recorded focused corrections; no new broad native pass is claimed here. Fresh installation/upgrade and release qualification remain pending.

Flow authorization and managed user/org identity verification advanced beyond the older activation notes; acquisition, compilation/publication and interpreted host acceptance were still in progress at the documentation snapshot. Lookup remains unsupported. This PR does not deploy source, create or modify org credentials, release a package, change legacy infrastructure, or merge itself.
