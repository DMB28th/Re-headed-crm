# Studio Home retirement

Home Card and nondefault audience authoring are retired from current Studio source.
Record cards, object lists, tasks, and Salesforce flow launch cards remain supported.
Studio routes object layouts through `layout:{Object}:default`; the Audience,
Assignment, and audience preview controls have been removed. The Salesforce app no
longer adds the generic `standard-home` navigation item.

`homecard` draft/save and publication fail with `RETIRED_CONFIGURATION` before any
write or publish audit. Nondefault or malformed layout authoring fails with
`UNSUPPORTED_CONFIGURATION`. Setup flags and unrelated compatibility keys retain
existing save behavior. Existing configurations and draft/history records remain
readable; old drafts may still be discarded. Active Studio publication and Overview
counts include only default object layouts, object exposures, and `flows`.

Publish Center classifies unsupported Drafts as retained inspection/discard work
in both All/default and Draft views; they never enter pending publication, bulk
publication, or active diff requests. Its shared key classifier mirrors the Apex
supported-key contract. The controller combines the existing bounded history
window with a separately selected supported candidate window, deduplicated by
full draft ID. Supported configuration IDs are selected before the active draft
query's 200-row limit, so newer retained history cannot displace older supported
work. Overview and checklist use an independent unbounded supported count. The
generic `listDrafts` history query retains its existing 200-row contract.

The Home editor bundle `cardstackHomeCardConfig` is removed from source and the
package manifest. `cardstackSetupChecklist` is also removed from current source:
Studio mounts `cardstackConnectionSetup` directly in its Setup destination. Existing
setup flags remain stored as history; they do not prove current client readiness.

`CardstackHomeAction` and its global `HomeRequest`, `HomeResponse`, `HomeTask`, and
`RecentItem` signatures remain for installed-package upgrade and cached-call
compatibility. Cached calls return empty tasks and recent records, zero counts,
empty identity/amount strings, and exactly:

> Home Card has been retired. Request a record or list instead.

They perform no CRM queries. Home MCP tool and resource bindings are removed from
`Cardstack.mcpServerDefinition-meta.xml`.

The existing `cardstackHomeOutputValues` and `cardstackHomeResult` Lightning types,
Home UiWidget bundle, and installed Apex/type permissions remain compatibility
artifacts in the normal stage and companion inventory. Their presence does not
advertise active Home discovery. Core staging keeps its existing exclusion of all
Lightning types and UiWidgets. No subscriber metadata, configuration, or history
is deleted; no companion destructive deployment is prescribed.

Local tests inspect actual discovery XML, execute default Studio routing/preview,
and stage actual source to prove the editor is absent. Apex tests cover cached
query-free Home, retained draft publication rejection, and discard/history.
Org behavior requires controller-coordinated deployment/test verification; these
source changes alone do not establish installed org behavior.
