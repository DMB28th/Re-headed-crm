# Stage A root controller source

This supplemental Stage A revision corrects only the rejected temporary permission
API name to `ApiEnabled`. Root reported the first single deployment as Failed
with `Unknown user permission: APIEnabled` and zero tests run, then independently
verified all four components absent, the full baseline preserved, Site inactive,
and deployment JWT ON. Root's API67 Profile metadata read independently confirmed
`ApiEnabled` enabled and `APIEnabled` absent. No worker read private evidence.
The old failed revision remains in Git and its private attempt records stay
immutable. `core.PRIVATE_DIR` now pins the exact sibling
`canonical-stage-a-revision2`; root alone creates it with mode 0700, copies reviewed
helpers and the actual immutable baseline/date proofs, and captures fresh preflight
before one exclusive new attempt. Review the changed artifact before root invokes
it. This is source recovery, not main-plan production Task3 or live proof.

Failed deployment ZIP SHA256: `a1ee4a3dbc2de6a8dddb2ec97ca697e9855738a56f8cb7c1fe882fca62e35ee3`.
Corrected deployment ZIP SHA256: `0254b198c7c303f699ff009ba8dea0d4e9dbca726cbfcae60f06e2b78a34baa2`. Cleanup remains
`b256372aa78693ab396854bc21f4146aa506b09959ec905bf6374d36c7da3329`.

Import-only source; no CLI, auth loading, connection creation, browser actions,
private JSON reads, or network calls occur on import. The worker ran only offline
tests. Root owns the approved live session, evidence, access, measurements, and
cleanup. `core.cjs` implements snapshot, preflight, single enqueue, status, and
installed ownership capture. Separate `access.cjs` and `cleanup.cjs` now prepare
owned access and destructive cleanup through injected root operations and the
two-phase root CUA interface below. Root must independently review that source
and its adapters before invocation. Offline guards do not establish live support.

## Exact root wiring

Root must first review its two read-only collectors and root evidence callbacks described below.
They receive an existing API67 managed connection and return private data in
memory; they must never print it. The adapter rejects paginated actor identity.
All other collectors must reject pagination/incomplete responses themselves.
Neither collector may substitute the earlier sanitized baseline receipt for full
current metadata, assignments, references, or policies.

```js
const fs = require('node:fs');
const core = require('/Users/danielben-atar/.codex/worktrees/mcp-apps-delivery-proof/Re-headed-crm/salesforce-native/docs/evidence/install-auth-platform/canonical-disposable/controller/core.cjs');
const {createRootAdapter} = require('/Users/danielben-atar/.codex/worktrees/mcp-apps-delivery-proof/Re-headed-crm/salesforce-native/docs/evidence/install-auth-platform/canonical-disposable/controller/root-adapter.cjs');
const {createCollectors} = require('/Users/danielben-atar/.codex/worktrees/mcp-apps-delivery-proof/Re-headed-crm/salesforce-native/docs/evidence/install-auth-platform/canonical-disposable/controller/collectors.cjs');

// Root only: c is its existing fresh API67 managed connection; org is its Org.
// Root supplies actual private pins and evidence callbacks; values are never printed.
const {captureSnapshot,captureInstalled} = createCollectors({
  pins:collectorPins, readUiEvidence, recordProvenance,
  verifyReviewedDateTransition, // optional; required only for reviewed date transitions
  now:()=>Date.now()
});
const adapter = createRootAdapter({
  connection:c, orgId:org.getOrgId(),
  username:c.getAuthInfo().getUsername(), captureSnapshot, captureInstalled
});
const privateParent = '/Users/danielben-atar/Documents/Codex/2026-10-05/codex-handoff-cardstack-native-salesforce-package/work';
const target = JSON.parse(fs.readFileSync(privateParent+'/install-auth-native-boundary/target-org-private.json','utf8'));
const foundation = JSON.parse(fs.readFileSync(privateParent+'/install-auth-state-validation/foundation-baseline-private.json','utf8'));
const options = {
  adapter, store:core.storeAt(core.PRIVATE_DIR),
  approved:true, approval:{stage:'A',approved:true},
  pins:{targetOrgId:target.targetOrgId,foundationBaseline:foundation},
  artifacts:core.loadArtifacts('/Users/danielben-atar/.codex/worktrees/mcp-apps-delivery-proof/Re-headed-crm/salesforce-native/docs/evidence/install-auth-platform/canonical-disposable'),
  expected:{pageSourceHash:referenceConstantPageHash,existingAppNames:fourHistoricallyApprovedNames},
  now:()=>Date.now()
};
// Root invokes exactly the intended operation, once per independently reviewed step.
const receipt = await core.snapshot(options); // first baseline only, no overwrite
// await core.preflight(options); // fresh full snapshot must exactly match baseline
// await core.deploy({...options,auth}); // see private auth input below
// await core.status(options); // only polls immutable known job; never submits
// await core.verifyInstalled({...options,auth}); // after exact completed test gate
console.log(JSON.stringify(receipt)); // only this sanitized result
```

Catch errors at the root entry point with a fixed sanitized category; never print
`error`, `error.message`, `stack`, auth input, connection, snapshot, installed
payload, job records, or paths to private evidence. There is no worker-executable
entry point. Root uses separately recorded saved/read-back JWT OFF and fresh login
proof before deploy. It **must always save/verify JWT ON in its own finally path**,
including an ambiguous enqueue or failed compile/test, and retain separate ON
evidence. This module does not automate JWT UI changes or claim restoration.

## captureSnapshot({connection,identity}) result

Return this exact structure, with full safe metadata and complete query results.
All IDs are normalized by the core; malformed checksum18 is rejected, and equality
uses full IDs. Fields containing keys, secrets, tokens, authorization, password,
fingerprints, or session IDs are rejected. Do not request secret-bearing ECA
metadata types or query fields. Root must collect the safe app metadata/policies
through its reviewed supported mechanism; this module does not guess new ECA or
Metadata job APIs.

| Field | Required content |
| --- | --- |
| identity | `{org,actor}` from current managed identity |
| site | Complete safe selected Site row including `Id,GuestUserId,Status,UrlPathPrefix`; inactive exact prefix |
| siteMetadata | Complete safe Site metadata; `fullName:CardstackAuthDiscoveryProbe`, `active:false`, `indexPage:CardstackSiteAuthProbeHome` |
| siteContext | `{baseUrl,domain,urlPathPrefix}`; HTTPS exact `/cardstackauthprobe`, no credentials/query/fragment, hostname equals domain |
| guestUser | `Id,ProfileId`; exact selected Site guest identity |
| guestProfile | `{Id,metadata}`; full safe profile metadata including original TabSet/class/page/custom access |
| guestSet | Complete safe guest profile-owned PS row including `Id,ProfileId` |
| guestGrants | **All** guest SetupEntityAccess records, including `Id,SetupEntityId,SetupEntityType`; no ApexClass/ApexPage/CustomPermission; preserve other baseline grants |
| guestObjectGrants | Complete nonzero CRUD/ViewAll/ModifyAll grants; must be empty; do not omit grants by querying only Cardstack objects |
| page | `{id,sourceHash}` for exact unchanged constant page; hash exact agreed reference-normalized markup |
| foundation | `{sets,metadata,assignments}`: exact complete Admin/User PS IDs/metadata and all assignments with full normalized IDs and set names |
| existingApps | Exactly four `{name,id,lastModifiedDate,metadata,policies}`: complete supported API67 ExternalClientApplication metadata and available list dates, plus separately labeled safe actual supported UI policy observations; unavailable policy fields explicitly Unknown |
| operator | `Id,ProfileId,IsActive:true,profileMetadata,permissionSet,assignments`; full safe profile metadata, profile-owned PS including ProfileId, all current assignments |
| operatorUse | Existing effective Use proof described below; no granting |
| collisions | `{classes:[],resources:[],permissionSets:[],apps:[]}`: complete supported Salesforce proposed-name checks; after deployment component arrays have exact installed `{Id,Name}` rows |
| clientObservation | `{name:'Cardstack Fresh Install QA',coverage:'installed-only',installedNameAbsent:true,draftInventory:'Unknown'}` from actual bound root UI; no global unsaved-draft completeness claim |
| references | `{complete:true,records:[]}` before deploy; complete selected-component dependencies and access references after deploy, including collateral profile access |
| metadataJobs | `{complete:true,pending:[]}` from reviewed controller evidence; Unknown must fail closed |
| completeness | Exactly `{guestGrants:true,guestObjects:true,foundationAssignments:true,apps:true,collisions:true,metadataJobs:true}` |

Required identities cannot be omitted or null: Site Id/GuestUserId; guest User
Id/ProfileId; guest Profile Id; guest PS Id/ProfileId; page id; operator
Id/ProfileId; operator profile-owned PS Id/ProfileId; all app ids; guest SEA
Id/ParentId/SetupEntityId; all foundation assignment Id/permissionSetId/assigneeId;
all operator assignment Id/PermissionSetId/AssigneeId. Guest SEA ParentId must be
the exact guest PS, and operator assignment AssigneeId must be the current actor.
Collision rows require Id/Name, and reference records ownerId/entityId. Valid
15-character inputs normalize to checksum18; invalid 18-character checksums fail
before baseline persistence. CustomSite siteAdmin/siteGuestRecordDefaultOwner are
actual schema username references; preserve their full string values privately,
without treating them as Salesforce IDs.

Reference records use `{ownerType,ownerId,entityType,entityId,enabled}`. Ownership
capture permits only the current admin Profile's enabled access to the two new
classes, the owned minimal PS's enabled ingress access, and frozen owned-class
references to owned classes/resource. Any foreign reference blocks capture. The
entire operator Profile metadata must be unchanged except enabled class access to
the exact two owned classes. Root must collect **all** references; an empty
dependency query alone does not prove the absence of Profile/PS access references.

Root schema discovery found API67 exposes ExternalClientApplication metadata,
with safe fullName/contactEmail/distributionState/isProtected/label/
orgScopedExternalApp fields. No per-app OAuth/policy metadata type was exposed;
global ExternalClientAppSettings does not supply a per-app policy relationship.
Do not query global Metadata/secret settings or invent OAuth settings/policy APIs.
API policy proof remains **Unknown**. A policies projection may explicitly use
`{source:'operator-ui',status:'Unknown',...actualObservedSafeFields}` and retain
unreadable fields as Unknown. Core freezes/comparisons preserve this truthfully
labeled projection; they do not turn it into complete API policy verification.
Do not put placeholder booleans into an observation.

For the deployment app, normalize its independently saved/read-back **UI** JWT policy into
`policies.jwtEnabled`. Keep all other safe metadata/policy fields alongside it;
avoid duplicating the JWT flag in nested fields. The only deploy drift exception is
`Card_Stack_SFAPP`'s exact same app ID changing this boolean ON→OFF, bound to saved
OFF proof. All full API metadata and other policy values remain exact. Available
ECA list dates are retained. Date drift blocks unless the optional separately
reviewed JWT transition chain below validates; the immutable baseline is never edited.

`operatorUse` always includes `{effective:true,org,actor,permission:'Cardstack_Use_Connections',method}`.
Supported method-specific proofs:

- `effectiveCustomPermissions`: root's complete effective permission read.
- `approvedRuntime`: additionally `approved:true,namedFixtureVerified:true` from a
  separately approved current named fixture check.
- `directAssignment`: additionally `hasActivationRequired:false,assigneeId,
  permissionSetId,assignmentId,assignmentPermissionSetId,customPermissionId,
  setupEntityAccessId,setupEntityParentId,setupEntityId,
  permissionName:'Cardstack_Use_Connections'`. The assignee must be current actor;
  both assignment and SEA parents must be the same PS; SEA entity must be the
  exact Use custom permission. Root obtains these from complete queries and the
  direct PS's `HasActivationRequired=false`; no new Use assignment is allowed.

## Private deploy auth input

Root constructs `auth` from its fresh managed login binding/receipt plus the
current connection binding, without printing or storing token contents:

```js
const auth = {
  checkedAt:binding.checkedAt, org:currentOrg18, actor:currentActor18,
  managedAuthValid:true, freshOpaqueManagedLogin:true, opaque:true,
  tokenFingerprint:binding.tokenFingerprint,
  connectionFingerprint:currentManagedConnectionFingerprint,
  jwtOffSaved:true,
  jwtOffProof:{
    org:currentOrg18, controller:currentActor18,
    appName:'Card_Stack_SFAPP', appId:deploymentApp18,
    checkedAt:savedOffProofTime, savedVerified:true, jwtOn:false
  }
};
```

Both login and saved OFF proof must be younger than ten minutes, with OFF proof at
or before login. Current connection fingerprint must equal the private binding.
Live app snapshot must contain actual separate saved UI JWT false readback;
its evidence is not an API policy proof. Tokens are never accepted
as module inputs. Fingerprints stay in root memory; attempt/job records omit them.

An exclusive attempt marker is durably written **before** the single enqueue. If
enqueue errors or the returned job ID is absent/invalid, the attempt remains and
future submissions are blocked. Never delete it to retry. Status operates only
on the immutable known job. Unknown outcomes require root's separate evidence.

## captureInstalled({connection}) result

Return `{classes,resource,permissionSet}`. `classes` is exactly two
`{id,name,source,apiVersion:67,status:'Active'}` rows. `source` must equal frozen
source, allowing only Salesforce's single omitted final newline; the actual
deployed source hash and frozen source hash are both retained privately.
`resource` is `{id,name:'CardstackCanonicalProbeUi',bytes:Buffer,
contentType:'text/html',cacheControl:'Private'}`. Bytes must match frozen UI SHA256.
`permissionSet` is `{id,name:'Cardstack_Canonical_Probe',metadata}`; metadata has
only fullName/label, ApiEnabled, ingress class access and optional false
hasActivationRequired/description. Any custom, object, field, page or extra grant
blocks ownership capture.
SDK fields `applicationVisibilities`, `customMetadataTypeAccesses`,
`customPermissions`, `externalDataSourceAccesses`, `fieldPermissions`,
`flowAccesses`, `objectPermissions`, `pageAccesses`, `recordTypeVisibilities`
and `tabSettings` may appear only as empty arrays; full metadata is retained,
and any nonempty listed collection or unknown field is rejected.

Status creates an immutable test gate only after done/success, exactly the sixty
inventory methods once each, no failures, zero component/test errors and sixty
completed tests. Installed verification requires that gate, original job and
baseline binding before writing one immutable `owned-components-private.json`.
It does not grant/activate/delete anything. Run it before access changes; if JWT
is still OFF pass the bound auth proof, otherwise the restored baseline must match.

## Exact installed guest profile representation

Ownership requires the entire original guest profile metadata plus exactly one
`{apexClass:'CardstackCanonicalProbe',enabled:false}` and exactly one
`{apexClass:'CardstackCanonicalProbeTest',enabled:false}` entry, with exact keys.
Enabled, duplicate, foreign or otherwise changed metadata blocks capture. Ownership
retains full returned `guestProfileMetadata` and `guestProfileMetadataDigest`;
access binds both the digest and exact original-plus-disabled shape each time.
Current access and destructive preflight compare the installed representation.
Only a journal-owned ingress/page grant replaces its single exact disabled entry
with `enabled:true`; removal restores that recorded disabled representation.
The existing disabled `CardstackSiteAuthProbeHome` page entry is replaced, never
duplicated. Post-destructive cleanup still requires the full immutable original
profile; the installed disabled class additions must disappear with owned classes.
No baseline metadata or actual provider readback is rewritten by these checks.

The core/access guest comparison preserves every adapter-returned metadata key,
including `attributes`. The unchanged collector's existing `read` boundary invokes
`normalizeRecords` on SDK metadata first, so it cannot expose attributes keys that
were already removed there. Root reported none in the actual supported shape;
this source slice makes no broader raw-SDK preservation claim.

## Verification and remaining root work

Run only the focused controller tests:

```sh
node --test salesforce-native/docs/evidence/install-auth-platform/canonical-disposable/controller/controller.test.cjs salesforce-native/docs/evidence/install-auth-platform/canonical-disposable/controller/root-adapter.test.cjs salesforce-native/docs/evidence/install-auth-platform/canonical-disposable/controller/collectors.test.cjs salesforce-native/docs/evidence/install-auth-platform/canonical-disposable/controller/dates.test.cjs
```

These tests establish offline guards, not live platform support. Root still must
review the supported collectors and its evidence callbacks, acquire fresh login/UI proof,
perform the approved live deploy, save/verify JWT ON, and review the separate
access/removal/destructive journal and root adapters before exposure. The frozen
destructive ZIP must not be submitted without the ownership, source, reference,
and drift safeguards described below.

Named protocol measurement belongs to root's separate approved transport. An
existing managed connection can use its installed HttpApi response hook and
`followRedirect:false,responseType:'text'` under the root-reviewed origin, timeout
and size bounds. Do not extract/forward tokens or treat protocol success as iframe
proof. No OAuth app/draft/consent operations are implemented here.

## Stable read-only collector API

`createCollectors({pins,readUiEvidence,recordProvenance,verifyReviewedDateTransition,now})`
returns `captureSnapshot({connection,identity})` and `captureInstalled({connection})`.
The connection must be root's existing API67 connection; collectors never create
one. The callbacks/objects contain private IDs and must never be logged.

Required `pins`:

```js
{
  org, actor, // independently approved historical target org and Admin assignee
  siteId, guestUserId, guestProfileId, guestSetId, pageId,
  siteBase, constantPageMarkup,
  historicalApps:[{name,id,lastModifiedDate,metadata}], // exactly four complete safe API records
  foundationMetadata:[/* complete Cardstack_User/Admin metadata */],
  resourceSha256, resourceByteLength // exact frozen UI bytes
}
```

Root maps the five reuse IDs from historical ordinary scope
`site.Id,site.GuestUserId,guestProfileId,guestPermissionSetId,pageId`. Same-name rows
with foreign identities fail before provenance/baseline persistence. The constant
page compares reference-normalized `.trim()` markup and its hash. Profile metadata
fullName is obtained only from API67 `metadata.list(Profile)` rows whose checksum18
id equals the actual User.ProfileId; display Profile.Name is never inferred to be
the metadata name. Queries must be done=true, nonpaginated and count-complete.

`readUiEvidence({identity,appInventory})` returns current actual root observations:

```js
{
  source:'operator-ui', org, controller, checkedAt,
  metadataJobs:{complete:true,pending:[]},
  clientObservation:{name:'Cardstack Fresh Install QA',coverage:'installed-only',
    installedNameAbsent:true,draftInventory:'Unknown'},
  appPolicies:[{name,id,values:{source:'operator-ui',apiPolicyRead:'Unknown',
    /* actual safe observed fields; deployment app requires actual jwtEnabled */}}],
  reviewedAppDateTransitions:[] // optional, see below
}
```

Proof source/org/controller/age (<10 minutes), four app names/full IDs, empty
pending jobs and exact installed-only client observation are checked. No default
UI proof, pending-job completeness, draft inventory or policy API is generated.
Proof times and screenshots stay outside canonical snapshot equality; only the
actual observed values are projected. Draft completeness stays Unknown and
Stage B creation requires its separate checks/approval. Other app policy fields
may truthfully remain Unknown. Root must supply the real saved UI JWT boolean.

`recordProvenance(privateRecord)` must durably append a new private600 record and
throw on failure. The collector awaits it before returning. It receives current
full available app/profile list projections, root UI evidence (including proof
times), dependency rows and global SEA rows. For example, root may call its
existing `privateStore.create('collector-provenance-'+Date.now()+'-'+randomHex+'-private.json',record)`.
No historical snapshot is overwritten. Root owns screenshot/private-file
verification and evidence retention. API/schema failures remain failures.

Collectors query the exact Site/users/profile-owned sets, all guest SEA/object
permissions, complete foundation metadata/assignments, all operator assignments,
the exact Use CustomPermission and direct non-session-activated PS grants. They
retain all guest object rows separately and reject nonzero grants at core scope
validation. ECA metadata permits only `fullName`, `contactEmail`,
`distributionState`, `isProtected`, `label`, `orgScopedExternalApp` and the observed
optional safe `description`. Every returned field remains in the complete exact
historical comparison; unknown and secret-bearing fields fail closed.
After components exist, both Tooling MetadataComponentDependency and **global**
SetupEntityAccess are read for all owned IDs; SEA parents map to Profile versus
PermissionSet through actual full PS ProfileId. Owned set assignments/groups are
also captured for drift detection. No REST Site update is used or implemented.

Installed resource reads accept only the exact relative API67 StaticResource Body
path whose full ID matches the queried resource. Managed request uses
`connection.request({method:'GET',url:body},{responseType:'text',followRedirect:false})`,
with transport options in the SDK's second argument. Invalid response shapes, replacement
characters/lone surrogates/invalid UTF8 buffers, wrong byte length or frozen hash
fail closed. No token is extracted or forwarded to another origin.

## Reviewed deployment-app date projection

`dates.cjs` is a source-only guard and requires independent review before root
uses its optional exception. Read-only ON baseline/preflight requires no date
transition verifier when all historical app dates match. Unreviewed date drift
always blocks. Only `Card_Stack_SFAPP` dates may advance through exact saved UI JWT
toggles; every other app date and all full app metadata stay exact.

Each root append-only reviewed proof has:

```js
{
  kind:'APPROVED_JWT_TRANSITION',source:'operator-ui',approved:true,
  org,controller,appName:'Card_Stack_SFAPP',appId,
  fromLastModifiedDate,toLastModifiedDate,fromJwtOn,jwtOn,
  savedVerified:true,humanUiReadback:true,checkedAt,reviewedAt,screenshotSha256
}
```

The chain must begin at the immutable historical date, link each observed date
and opposite JWT value, progress monotonically, and terminate at the exact current
available list date and actual saved UI JWT value. The root callback
`verifyReviewedDateTransition(proof)` must independently validate its private
append-only evidence/screenshot and return true; a mere proof-shaped object is
insufficient. No screenshot path/content is read by this source helper.

Pass the historical chain in `readUiEvidence` for collector checks. For core
deploy/installed verification, pass `reviewedAppDateTransitions` and
`verifyReviewedDateTransition` as options, with a chain starting at that core
baseline's captured app date. The OFF proof must still satisfy the distinct fresh
login/saved-OFF guard. The ON terminal proof does not replace root's mandatory
finally restoration/readback evidence. No source action changes dates or JWT.

## Owned access and cleanup API

All operations use the same original `options`, private `core.storeAt` store,
exclusive controller lock, immutable baseline, immutable exact-test gate and
original known deploy job. `access.prepare(options)` freezes their bindings and
the full owned-record digest before any assignment/grant/exposure. It validates
the cleanup ZIP byte hash and both exact API67 manifests before exposure.
Preparation requires the actual collector baseline, including complete
`ownedAssignments`, `ownedPermissionSetGroups`, operator direct permission sets,
non-session-activated direct existing Use proof and profile-owned set evidence.
No baseline or owned record is rewritten.

Root adds these reviewed capabilities to `options`:

```js
options.rootSiteUi = {
  source:'root-cua', twoPhase:true,
  siteUpdateable:false, statusUpdateable:false
}; // capability declaration; this is not saved UI proof
options.operations = {
  createAssignment, // exact {AssigneeId,PermissionSetId}; returns {id,success:true}
  addGuestAccess,   // exact {ParentId,SetupEntityId,SetupEntityType}; returns {id,success:true}
  removeAssignment, // exact owned {Id,AssigneeId,PermissionSetId,PermissionSetGroupId:null}
  removeGuestAccess // exact owned {Id,ParentId,SetupEntityId,SetupEntityType}
}; // removals return {success:true}; failures throw without printing raw errors
options.adapter.absenceReferences = absenceReferences;
```

The callback `absenceReferences({identity,componentIds})` must normalize/bind the
original four owned IDs and current approved org/operator, read complete global
SetupEntityAccess and Tooling MetadataComponentDependency relationships for those
IDs, and original-owned PermissionSetAssignment and PermissionSetGroupComponent
relationships. Return `{complete:true,records:[...all four query results]}`.
Every nonempty relationship blocks final proof. It must not infer absence from a
query by current names; names disappear before this verification. Root's reviewed
reader owns supported queries and completeness checks; this module invents no API.

Assignment and SEA callbacks receive only exact controller-derived scope. Root
uses its existing managed API67 connection and validates SaveResult failures.
For SEA creation, the callback projects the bound input to SDK
`{ParentId,SetupEntityId}` only: `SetupEntityType` is readback-derived and remains
in the controller intent/result-state comparison, never in the SDK create payload.
Assignment SDK create uses `{AssigneeId,PermissionSetId}`; removals call supported
`.destroy` on only the exact controller-owned `Id`. Create success defaults only when a valid returned ID exists and no failure is
present; explicit `success:false`, nonempty errors, invalid IDs or exceptions
leave the intent pending. Only a narrow ID/success projection enters the journal;
raw SaveResult diagnostics, tokens and auth fingerprints are never retained.
There is no Profile/PermissionSet metadata write, Use grant, object access, or
resource/private-service guest access operation.

The guarded sequence is `prepare`, `assign`, `grantIngress`, `grantPage`, then
`beginSiteUi(options,true)`. Begin durably creates the exact pending intent,
releases the private lock, and returns only an action-required receipt with
`active` and `intentDigest`. **Begin does not change the Site.** Root then performs
the approved CUA action on the actual selected Setup Sites row. No URL or generic
UI action is generated by this module. Root privately saves actual UI evidence,
then calls `completeSiteUi(options,proof)` with:

```js
{
  source:'operator-ui', org:approvedOrg18, controller:approvedOperator18,
  siteId:approvedOriginalSite18, active:true, savedVerified:true,
  checkedAt:actualSavedReadbackTime,
  intentDigest:beginReceipt.intentDigest
}
```

For restoration, begin uses `false` and the saved proof has `active:false`.
Proof must match the same pending intent digest, exact identities and active
state, be younger than ten minutes, and be at or after that intent. Completion
persists the bound proof before independent complete Site/CustomSite and
preservation readback. Only exact `Status`/`active` changes are permitted; all
other Site metadata remains equal. `activate`/`restore` are aliases for begin
and never claim activation/restoration themselves. No Site REST update exists.

Every write has append-only `access-event-N-private.json` intent, narrow result,
and verified events linked by digests. `core.storeAt` exclusively creates and
fsyncs the private600 files and private700 directory before returning. The result
ID is persisted before readback; a verified event clears logical pending state
only after exact independent readback. Unknown/no-return writes block retry,
removal and cleanup. `reconcile(options)` performs readback only for an already
persisted known result; it never submits a new write or adopts a discovered ID.
A pending root Site intent can only complete through its own bound saved UI proof.
Never delete a pending intent to retry.

`removeAccess(options)` returns a durable `rootSiteUiActionRequired` restoration
receipt while the Site is active. Root completes that restoration intent with
CUA and saved proof, then calls removal again. Removal independently checks full
ownership/source/reference/preservation state before deleting the exact owned
page SEA, ingress SEA, and operator assignment, in that order. It preserves the
original page, TabSet, other access, existing Use and foundation assignments.
`measureAndRemove(options,measurement)` catches measurement failure without
exposing its raw error and enters this same restoration route, returning
`measurementFailed` alongside the action requirement. Root must finish the UI
restoration and call removal again before destructive preflight. Missing proof,
unresolved writes or foreign drift leave cleanup unverified and block mutation.

Destructive sequencing uses `cleanup.preflight(options)` after all access is
restored, then root's separate saved JWT OFF → fresh managed opaque login →
`cleanup.enqueue({...options,auth})`. Preflight and enqueue independently verify
exact current sources/resource/minimalset/IDs and references, zero owned
assignment/groups, baseline guest access, complete foundation/four-app state,
inactive Site and no pending metadata job. The only allowed deployment Profile
collateral is the frozen two owned enabled class entries, bound to the exact
approved operator profile-owned PS ID. Full profile metadata minus those entries
must equal the original baseline. No profile cleanup write is performed.

The cleanup byte hash is
`b256372aa78693ab396854bc21f4146aa506b09959ec905bf6374d36c7da3329`.
Only the two classes, resource and temporary set appear in the destructive
manifest. Exclusive `cleanup-attempt-private.json` is durable before one enqueue;
a known normalized ID is exclusively persisted as `cleanup-job-private.json`.
Ambiguous enqueue cannot retry. `cleanup.status(options)` polls only that job,
stores safe status projections, and freezes a known terminal gate. It does not
restore JWT. Root must always save/read back actual JWT ON in its own finally
path and retain evidence, including failed/ambiguous submission.

`cleanup.finalize({...options,jwtOnProof})` requires a known terminal job plus
independent exact-name absence, original-ID reference absence, complete baseline
Site/page/guest/profile/foundation/four-app preservation, no pending write/job,
and fresh actual saved UI ON proof. The proof has `source:'operator-ui'`, bound
`org`, `controller`, deployment `appName`/`appId`, `jwtOn:true`,
`savedVerified:true`, and `checkedAt` at or after this metadata attempt. Both fresh
login and saved OFF proof keep the existing exact org/operator/app binding and
ten-minute limits. Available app dates are retained and may change only through
the existing independently reviewed actual saved JWT transition chain; full
metadata/policies and other dates remain exact. The original baseline is immutable.
No auth fingerprint/token enters attempt/job records or receipts.

A failed deployment never authorizes access. If there is no captured ownership,
access preparation or cleanup attempt, root may call
`cleanup.verifyFailedDeploymentAbsence({...options,jwtOnProof})`. This requires
an independently queried bound known `Failed`/`Canceled` deployment and complete
fresh exact-name absence with all baseline state restored and saved JWT ON proof.
`rollbackOnError:true` alone never proves absence. Unknown jobs and partial
components block this route; no partial-component adoption/cleanup is implemented.

Run the complete offline controller suite (46 tests at this source revision):

```sh
node --test salesforce-native/docs/evidence/install-auth-platform/canonical-disposable/controller/*.test.cjs
```

These are source/offline guards only. Root must separately review and wire the
managed Salesforce mutation adapter, original-ID absence reader, and CUA proof
storage. Only the public operation receipts may be printed. Internal exported
helpers, inputs, journal, ownership, collectors and proofs contain private IDs.
No live provider, deployment, grant, activation, restoration, or client proof is
claimed by this source or its tests. Stage B remains outside this controller.

## Bounded fixed protocol measurement (source/offline implemented)

`protocol.cjs` exports `createMeasurement`, `validateMeasurementReceipt`, and the
pure `aggregateReceipts`. `protocol-transport.cjs` owns the bounded installed-SDK
transport. Importing either performs no auth loading, private IO, connection
creation, or requests. Only root invokes this source after independent review.
The worker's results are offline tests, with no live Salesforce/client claim.

Root supplies its **same existing API 67 managed connection**, trusted original
org/operator/Site pins, and `verifyCurrent`. The callback must call reviewed
`access.locked(args, ...)`, `access.context(args)`, and `access.current(args,b,o,j.state)`
before each case; require the saved active journal state, full current active
Site snapshot, immutable owned source/test gate, original actor/org, and current
non-session-activated Use permission. Root's `protocol-guard.cjs` composes these
checks. The measurement does not grant access, activate a Site, replace those
checks with booleans, or own cleanup. Root must still complete its independent
finally cleanup, including the existing two-phase saved/read-back Site UI path,
when measurement returns Unknown/Fail or throws.

The exact callback result is private in memory:

```js
{
  identity:{org,actor},
  ownership:{verified:true,org,actor,siteId},
  testGate:{exactSixtyTestsPassed:true,org,actor},
  currentUse:{effective:true,org,actor,
    permission:'Cardstack_Use_Connections',hasActivationRequired:false},
  activeSite:{siteId,active:true,savedVerified:true},
  siteBase,issuer
}
```

`pins` is `{org,actor,siteId,siteBase,issuer}`, independently derived from the
immutable original baseline and trusted org origin, never request headers or an
observation. Every ID is checksum18-normalized at ingestion and compared in
full. `siteBase` is the exact pinned HTTPS origin plus `/cardstackauthprobe`,
without port, credentials, query, or fragment. `issuer` is the independently
bound HTTPS org origin. Missing/drifting proof yields a zero-attempt
`CONTEXT_REJECTED` Unknown case. Root proof age limits remain unchanged; refresh
read-only saved UI evidence between bounded batches as needed.

Root-only wiring, after its guard is reviewed:

```js
const lib='/usr/local/lib/sf/node_modules/@jsforce/jsforce-node/lib/';
const sdk={
  HttpApi:require(lib+'http-api').HttpApi,
  request:require(lib+'request').default,
  StreamPromise:require(lib+'util/promise').StreamPromise,
  getLogger:require(lib+'util/logger').getLogger
};
// createProtocolGuard is root's separately reviewed import-only composition.
const {pins,verifyCurrent}=createProtocolGuard({args,connection,siteBase});
const {createMeasurement}=require('./protocol.cjs');
const measurement=createMeasurement({
  pins,verifyCurrent,connection,sdk,evidenceSource:'root-live-http',now:()=>Date.now()
});
// Inspect caseIds without a request; root selects only these fixed IDs.
const receipt=await measurement.runCases(reviewedFixedCaseIds);
// Only sanitized receipt may be serialized. Never print transport responses.
```

`evidenceSource:'offline-injected'` requires no live SDK reference and always
sets `liveExecution:false`. `root-live-http` requires the exact four installed
SDK references above; injected substitutes cannot be relabeled as live. Root
must additionally ensure actual runtime provenance (no test dispatcher or
transport substitution), actual current evidence, and approved invocation. A
receipt label alone is not independent proof of a live operation.

`caseIds` is an immutable list. `runCase(id)` and `runCases(ids)` accept only
nonempty selections of fixed IDs and reject unknown, duplicate, previously
attempted, or concurrent selections before sending. Each case invokes its guard
and makes at most one transport call. Fail/Unknown preserves earlier cases and
does not claim complete success. Within an instance, returned receipts are
cumulative; `receipt()` returns current sanitized coverage without a request.

The fixed list covers both clients' public metadata/challenge and hostile-header
pointer checks; anonymous/fabricated tools/resource denial; strict case, nested,
unknown, encoded, extra and query paths; named non-Site failclosed 503; named
GET/DELETE 405; both protocol versions; notification 202; ping/tools/resources/HTML/
open; exact typed echo and empty text; invalid JSON/batch/unknown method/resource;
and separately identified repeats of supported requests. Repeats compare against
the same exact deterministic contract and pinned HTML, proving protocol stateless
behavior only. They do not prove chat reload, iframe rendering, or a host bridge.
The exact notes value is an actual newline (`'first\nsecond'`), and zero/false/empty
text remain typed values. No identity or debug fields are accepted in results.

All normal requests use the pinned HTTPS Site origin and fixed routes. Named
non-Site negatives use only the trusted issuer plus each fixed MCP route. The
single HTTP exception is anonymous GET of each fixed metadata route on the same
pinned Site hostname/prefix, changing only HTTPS to HTTP. It cannot carry managed
or fabricated authorization, a payload, hostile headers, or any other path.
Provider redirect/block/HTML handling remains a separately labeled Unknown;
it cannot establish the fixture's exact 503 failclosed response.

The transport constructs its own second HttpApi options:
`responseType:'text',followRedirect:false,timeout:15000,httpProxy:undefined`, with
`retry:{maxRetries:0,methods:[],statusCodes:[],errorCodes:[]}`. A supported protected
HttpApi subclass returns no refresh delegate even if one exists on the connection;
it never changes stored credentials. Named authentication is performed only by
the installed SDK's `beforeSend`; public/fabricated requests use a subclass that
does not run that managed-auth hook. Fabricated authorization is the fixed
`cardstack-invalid-synthetic-sentinel`. Root's existing local no-refresh boundary
should remain applied to the same connection for all other REST/SOAP operations.

The installed Transport's `complete` listener calls unbounded `readAll`. This
transport instead consumes the installed low-level request stream itself with a
15-second whole-response consumer deadline and normal 64 KiB byte cap. Only exact
named `resources/read` with the pinned UI URI can use 1 MiB. The decoded HTML must
also have byteLength 309866 and SHA256
`2ca5d8564f646d661763dfc924d49133ad66e43d195f990a690d47eb73ea758f`.
Only status/body and content-type/www-authenticate are captured privately. Raw
headers/errors/connection/auth never enter receipts. Supported SDK logger APIs
silence shared fetch/request-helper/http-api logging; the per-call subclass also
suppresses raw logging/error parsing. Root must keep measurement serialized with
its other connection operations.

The SDK's timeout covers initial fetch through headers, while the consumer timer
also bounds body consumption. On time/size failure, stream consumption is stopped,
but the installed API does not expose a verified underlying fetch/body cancellation
handle. Every receipt therefore retains `NETWORK_ABORT_UNVERIFIED`; this source
does not claim a network abort. Redirects are never followed. Offline MockAgent
checks exercise the actual installed request's 420/503 retry behavior and redirect
handling with network disabled.

Receipts have an explicit separate allowlist, without modifying frozen schemas:
`schemaVersion,evidenceSource,liveExecution,complete,allCasesPass,requiredCaseCount,
coveredCaseIds,cases,limitations`. Case fields are exactly
`id,stage,status,source,code,startedAt,endedAt,attempts`; IDs here are public fixed
case labels, never Salesforce identifiers. Actual operation timestamps are retained.
`complete` means all fixed case IDs have a receipt, including failures/unknowns;
`allCasesPass` additionally requires every case to Pass. Successful named payloads
require exact JSON-RPC keys/version/request ID in addition to `validateObservation`.
RPC errors require the fixed case's exact code **and** message. Exact non-Site 503
uses its own stage and checker; provider handling stays Unknown.

For separate root processes, `aggregateReceipts(disjointBatchReceipts)` validates
every receipt and merges only disjoint fixed cases. It rejects duplicate/unknown
IDs, extra fields, and mixed offline/live sources, then recomputes exact coverage.
Do not aggregate overlapping cumulative receipts from one instance. Root must
select receipts from the same approved immutable baseline/ownership/session scope;
this pure helper carries no credential state or private binding identifiers and
cannot independently establish that provenance. Partial batches never become a
complete Stage A or a live-client proof claim.

Focused offline verification (includes the actual 15s deadline test):

```sh
node --test salesforce-native/docs/evidence/install-auth-platform/canonical-disposable/controller/protocol.test.cjs salesforce-native/docs/evidence/install-auth-platform/canonical-disposable/controller/protocol-transport.test.cjs
```

No live measurement, ChatGPT/Claude connection, callback/OAuth observation, or
Stage B operation was performed by the worker. Root owns those separate steps.
