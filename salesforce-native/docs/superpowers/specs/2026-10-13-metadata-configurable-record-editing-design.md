# Configurable record editing through metadata and published policy

October13,2026. User-directed next milestone, following actual Contact acceptance and the resource-delivery correction. Extends the existing reusable-editor source scope. New persistent artifacts, live fixtures or access are excluded until their concrete bounded scope is prepared. Earlier approvals and the selected subagent execution method persist.

## Acceptance defines reuse

Configure Account Name, Description and NumberOfEmployees through Studio, after native metadata qualification. Open it through the existing generic record tool, edit all three together, validate, Review, Confirm, show the immutable receipt and Refresh. No Account-specific renderer, controller, field preset in runtime code, state machine or writer may be added. Changing configured field membership/order and sections must change the screen without code changes. Contact and Opportunity remain regression fixtures; legacy Account tools remain compatible.

Account is the first new-object fixture because it exercises INTEGER with existing text/clear behavior. Native CURRENCY and DATE support can be added to the shared field codecs in this milestone when exact metadata/context can be enforced. AnnualRevenue is a proposed additional Account field, subject to native eligibility; no standard Account DATE field is assumed. Generic PICKLIST and REFERENCE remain unsupported until exact record-type/dependent-choice and selection providers are implemented. The existing specialized Opportunity Stage provider is preserved.

## Shared capability contract

Resolve the canonical object from the checksum-valid record ID. Published configuration chooses the enabled action, ordered1–20 current-value inputs and layout; native Describe supplies canonical identifiers, types, length, precision/scale, requiredness, readability and updateability. Public descriptions and admin configuration never grant rights.

Use one explicit eligible-CRM-object catalog shared with Studio: core CRM objects and supported ordinary custom objects, excluding setup, metadata, events, custom settings, external/read-only and unsupported object categories. A global Describe entry alone is insufficient. Object-specific approval is configuration plus this eligibility boundary, not a new controller branch. Do not expose arbitrary dynamic queries or accept object identity or patch replacement at Confirm.

The shared entry is `resolveDefinition(Id recordId, String actionName)`; stored-state resolution must independently verify the stored canonical object against that same full record ID. Studio consumes `getRecordEditCapability(String objectApi)` returning a versioned native eligibility descriptor (canonical object, field API/label/type, required/clearable flags, length/precision/scale, eligibility and exclusion reason); this descriptor grants no runtime authority.

Generalize CardstackRecordScreenCapability to own canonical Schema.SObjectType, object API, title projection, ordered fields, field descriptors, native required/readable projection, clearability, checked layout and capability fingerprint. Every read/transition/Confirm re-resolves policy, metadata and rights. Derive dynamic query identifiers only from verified native metadata and bind record IDs. Confirm retains locking, re-read/re-canonicalization and USER_MODE DML.

The same capability must validate repository restoration, typed snapshot identity, write target and audit context. Serialized attributes.type never chooses authority. Create the DML target from the resolved native type, not a Contact-or-Opportunity ternary. Audit uses the resolved capability's field membership instead of maintaining an independent object/type list.

Version new state explicitly if its interpretation changes. Preserve exact existing Opportunity schema1 and Contact schema2 identities, completed receipt/replay semantics and denial behavior. Compatibility decoding is allowed; a second save lifecycle is not. Old pending authority cannot silently gain fields/types through upgrade.

## Shared field codecs

Keep STRING/TEXTAREA/BOOLEAN semantics, including exact Boolean grammar, required final-record validation,4096 bounds and explicit clear. Add generic INTEGER with canonical exact strings, native range validation and fractional/exponent rejection. DATE accepts exact valid calendar literals. Decimal/currency support must enforce native precision/scale without rounding, exponent conversion or JavaScript Number coercion; currency context comes from readable record currency metadata or the existing native single-currency source and is freshness-bound. If context is unavailable, fail closed. Native platform business validation still runs at DML.

The renderer registry already supports these controls. Expand strict generic DTO validation to canonical object names and supported descriptors; remove Contact/003-specific assumptions. Keep tool targets and private metadata keys trusted and fixed. Bind object, record and request generation, including late replies after switching across different objects. Public views remain free of private authority.

Opportunity's compatibility adapter retains native Stage choices, currency/process fingerprints and specialized business validation. Adapters supply data and rules; they do not implement transport, grants, lifecycle, DML or receipts.

## Ownership and integration

One shared-editor owner controls native capability/type codecs, generic MCP/public contracts, shared lifecycle/repository/writer/audit and renderer contracts. Root coordinates that owner and consolidated review. Studio owns authoring/preview against a stable native eligibility descriptor: canonical object, eligible fields, supported type/constraints and useful exclusion reasons. Remove duplicated Contact-only type decisions. Synthetic preview uses the same renderer, with Save disabled and no live authority.

Lookup consumes a stable selected-record identity/display contract and opens the shared editor. It cannot create a second writer, confirmation flow or arbitrary reference update. Existing configuration publication stays authoritative; drafts do not execute.

## Verification and preparation

Development uses focused distinct-risk checks. At one integrated source milestone, build the resources, run relevant renderer/Studio regressions, review the whole change, then execute one coherent native regression/compatibility checkpoint in the existing owned org. Repeat broader checks only after relevant code changes, failures or new risks. Retain historic failures and distinguish local renderer, native transaction and actual host evidence.

Standardize offline deployment preparation around the existing successful procedure: explicit component allowlist, API67 root manifest/ZIP, immutable source/archive digest, exact regular test-method inventory, private before-state archive, safe receipt and independent source/XML agreement. Preparation must not mutate an org; persistent execution remains a separately authorized exact artifact. Authentication, Sites, JWT, permissions and fixtures stay outside this helper.

Actual acceptance requires another object enabled through configuration and the same lifecycle in advertised hosts, with independent record/audit/receipt readback and exact owned cleanup. Prepare native eligibility, actor rights, policy, fixtures, budgets and cleanup before requesting a genuinely new external action. Existing lost-response/switch/B/fresh-package gaps remain explicitly unproved until exercised; no synthetic replacement claim.
