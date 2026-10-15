'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {installedFixture}=require('./access-fixture.cjs');
async function siteUi(f,active){const receipt=await access.beginSiteUi(f.args,active);assert.equal(receipt.rootSiteUiActionRequired,true);const proof=await f.args.operations.setSiteActiveRootUi({org:f.snap.identity.org,controller:f.snap.identity.actor,siteId:f.snap.site.Id,active});return access.completeSiteUi(f.args,{...proof,intentDigest:receipt.intentDigest});}
async function remove(f){const receipt=await access.removeAccess(f.args);if(receipt.rootSiteUiActionRequired){const proof=await f.args.operations.setSiteActiveRootUi({org:f.snap.identity.org,controller:f.snap.identity.actor,siteId:f.snap.site.Id,active:false});await access.completeSiteUi(f.args,{...proof,intentDigest:receipt.intentDigest});return access.removeAccess(f.args);}return receipt;}
let access;try{access=require('./access.cjs');}catch{}
test('owned access journals before mutation and independently verifies returned IDs, UI activation and exact restoration',async()=>{
 assert.equal(typeof access?.prepare,'function');const f=await installedFixture();await access.prepare(f.args);
 const create=f.args.operations.createAssignment;f.args.operations.createAssignment=async row=>{assert(f.s.exists('access-event-1-private.json'));return create(row);};
 await access.assign(f.args);await access.grantIngress(f.args);await access.grantPage(f.args);await siteUi(f,true);
 assert.equal(f.snap.site.Status,'Active');const receipt=await remove(f);assert.equal(receipt.accessRestored,true);assert.deepEqual(f.calls,['assignment','ApexClass','ApexPage','activate-ui','restore-ui','remove-ApexPage','remove-ApexClass','remove-assignment']);assert.equal(f.snap.guestGrants.length,1);assert.equal(f.snap.operator.assignments.length,1);assert(!JSON.stringify(receipt).includes('00D'));
});
test('foreign access, profile, source and reference drift block any next write',async()=>{
 assert.equal(typeof access?.prepare,'function');
 for(const mutate of [f=>f.snap.operator.assignments.push({Id:'0Pa000000000003CAA',PermissionSetId:'0PS000000000005GAA',AssigneeId:f.snap.operator.Id}),f=>f.snap.guestGrants.push({Id:'0J0000000000007CAA',ParentId:f.snap.guestSet.Id,SetupEntityId:'01p000000000003AAA',SetupEntityType:'ApexClass'}),f=>f.snap.references.records.push({ownerType:'Profile',ownerId:'00e000000000003AAA',entityType:'ApexClass',entityId:f.installed.classes[0].id,enabled:true}),f=>f.installed.classes[0].source+='// drift',f=>f.snap.operator.profileMetadata.userPermissions=[{name:'ModifyAllData',enabled:true}]]){const f=await installedFixture();await access.prepare(f.args);mutate(f);await assert.rejects(access.assign(f.args));assert.equal(f.calls.length,0);}
});
test('unknown prior write blocks retries and cleanup; persisted returned ID precedes failed readback',async()=>{
 assert.equal(typeof access?.prepare,'function');const f=await installedFixture();await access.prepare(f.args);f.args.operations.createAssignment=async()=>{throw Error('private raw secret');};await assert.rejects(access.assign(f.args),/ACCESS_OUTCOME_UNRESOLVED/);await assert.rejects(access.assign(f.args),/ACCESS_PENDING/);await assert.rejects(access.removeAccess(f.args),/ACCESS_PENDING/);
 const g=await installedFixture();await access.prepare(g.args);g.args.operations.createAssignment=async()=>({id:'0Pa000000000002CAA'});await assert.rejects(access.assign(g.args),/ACCESS_STATE_DRIFT/);assert.equal(g.s.read('access-event-2-private.json').result.id,'0Pa000000000002CAA');await assert.rejects(access.assign(g.args),/ACCESS_PENDING/);
});
test('failed measurement always restores inactive Site before exact owned removals',async()=>{
 assert.equal(typeof access?.measureAndRemove,'function');const f=await installedFixture();await access.prepare(f.args);await access.assign(f.args);await access.grantIngress(f.args);await access.grantPage(f.args);await siteUi(f,true);const receipt=await access.measureAndRemove(f.args,async()=>{throw Error('measurement failed');});assert.equal(receipt.measurementFailed,true);assert.equal(receipt.rootSiteUiActionRequired,true);const proof=await f.args.operations.setSiteActiveRootUi({org:f.snap.identity.org,controller:f.snap.identity.actor,siteId:f.snap.site.Id,active:false});await access.completeSiteUi(f.args,{...proof,intentDigest:receipt.intentDigest});await access.removeAccess(f.args);assert.equal(f.snap.site.Status,'Inactive');assert.deepEqual(f.calls.slice(-4),['restore-ui','remove-ApexPage','remove-ApexClass','remove-assignment']);
});
test('known result reconciliation verifies full current state without issuing another mutation',async()=>{
 assert.equal(typeof access?.reconcile,'function');const f=await installedFixture();await access.prepare(f.args);const create=f.args.operations.createAssignment;f.args.operations.createAssignment=async row=>{const r=await create(row);f.snap.page.sourceHash='2'.repeat(64);return r;};await assert.rejects(access.assign(f.args),/ACCESS_STATE_DRIFT/);f.snap.page.sourceHash='1'.repeat(64);await access.reconcile(f.args);await access.removeAccess(f.args);assert.deepEqual(f.calls,['assignment','remove-assignment']);
});
test('rejected SaveResult cannot masquerade as success and raw operation fields never reach the journal',async()=>{
 const f=await installedFixture();await access.prepare(f.args);f.args.operations.createAssignment=async()=>({success:false,id:'0Pa000000000002CAA',errors:[{message:'raw secret'}]});await assert.rejects(access.assign(f.args),/ACCESS_OUTCOME_UNRESOLVED/);assert.equal(f.s.exists('access-event-2-private.json'),false);
 const g=await installedFixture();await access.prepare(g.args);const create=g.args.operations.createAssignment;g.args.operations.createAssignment=async row=>({...await create(row),errors:[],debugRaw:'not retained'});await access.assign(g.args);assert.deepEqual(g.s.read('access-event-2-private.json').result,{id:'0Pa000000000002CAA'});
});
test('journal durability failure prevents mutation and stale or collateral Site UI result leaves pending',async()=>{
 const f=await installedFixture();await access.prepare(f.args);const create=f.s.create;f.s.create=(name,v)=>{if(name==='access-event-1-private.json')throw Error('fsync failure');create(name,v);};await assert.rejects(access.assign(f.args));assert.equal(f.calls.length,0);
 const g=await installedFixture();await access.prepare(g.args);await access.assign(g.args);await access.grantIngress(g.args);await access.grantPage(g.args);g.args.operations.setSiteActiveRootUi=async()=>({source:'rest',savedVerified:true});await access.beginSiteUi(g.args,true);await assert.rejects(access.completeSiteUi(g.args,{source:'rest',savedVerified:true}),/SITE_UI_PROOF/);await assert.rejects(access.removeAccess(g.args),/ACCESS_PENDING/);
});
test('operator existing Use, complete object grants, page hash, four app metadata and pending job drift block removals',async()=>{
 for(const mutate of [f=>f.snap.operatorUse.effective=false,f=>f.snap.guestObjectPermissions.push({Id:'110000000000001AAA',ParentId:f.snap.guestSet.Id,PermissionsRead:true}),f=>f.snap.page.sourceHash='2'.repeat(64),f=>f.snap.existingApps[1].metadata.description='foreign',f=>f.snap.metadataJobs.pending.push({Id:'0Af000000000003CAA'})]){const f=await installedFixture();await access.prepare(f.args);await access.assign(f.args);mutate(f);await assert.rejects(access.removeAccess(f.args));assert.deepEqual(f.calls,['assignment']);}
});
test('same-name foreign owned-set assignment or group and changed original ownership gate block access preparation',async()=>{
 for(const mutate of [f=>f.snap.ownedAssignments.push({Id:'0Pa000000000003CAA',PermissionSetId:f.installed.permissionSet.id,AssigneeId:'005000000000003AAA'}),f=>f.snap.ownedPermissionSetGroups.push({Id:'0PG000000000001GAA',PermissionSetId:f.installed.permissionSet.id,PermissionSetGroupId:'0PG000000000002GAA'})]){const f=await installedFixture();mutate(f);await assert.rejects(access.prepare(f.args),/ACCESS_STATE_DRIFT/);assert.equal(f.s.exists('access-prepared-private.json'),false);}
 const f=await installedFixture();await access.prepare(f.args);f.s.m.get('deploy-exact-tests-private.json').statusRecord='changed';await assert.rejects(access.assign(f.args),/ACCESS_PREPARATION_BINDING/);assert.equal(f.calls.length,0);
});
test('two-phase root UI releases lock, blocks duplicate action and rejects a proof bound to another Site',async()=>{
 assert.equal(typeof access.beginSiteUi,'function');const f=await installedFixture();await access.prepare(f.args);await access.assign(f.args);await access.grantIngress(f.args);await access.grantPage(f.args);let locked=false;f.s.lock=()=>{assert.equal(locked,false);locked=true;return()=>{locked=false;};};
 const receipt=await access.beginSiteUi(f.args,true);assert.equal(locked,false);assert.equal(receipt.rootSiteUiActionRequired,true);assert.equal(f.snap.site.Status,'Inactive');assert.equal(f.calls.includes('activate-ui'),false);await assert.rejects(access.beginSiteUi(f.args,true),/ACCESS_PENDING/);
 const proof={source:'operator-ui',org:f.snap.identity.org,controller:f.snap.identity.actor,siteId:'0DM000000000002GAA',intentDigest:receipt.intentDigest,active:true,savedVerified:true,checkedAt:new Date(f.args.now()).toISOString()};await assert.rejects(access.completeSiteUi(f.args,proof),/SITE_UI_PROOF/);assert.equal(f.s.exists('access-event-11-private.json'),false);
 const valid=await f.args.operations.setSiteActiveRootUi({org:f.snap.identity.org,controller:f.snap.identity.actor,siteId:f.snap.site.Id,active:true});await access.completeSiteUi(f.args,{...valid,intentDigest:receipt.intentDigest});const action=await access.removeAccess(f.args);assert.equal(action.active,false);assert.equal(f.snap.site.Status,'Active');assert.equal(f.calls.filter(x=>x.startsWith('remove')).length,0);
});
test('preparation requires current non-session-activated direct Use and exact root CUA capability',async()=>{
 const f=await installedFixture({useMethod:'effectiveCustomPermissions'});await assert.rejects(access.prepare(f.args),/NON_ACTIVATED_USE_REQUIRED/);assert.equal(f.s.exists('access-prepared-private.json'),false);
 const g=await installedFixture();g.args.rootSiteUi={source:'rest',twoPhase:true,siteUpdateable:true,statusUpdateable:true};await assert.rejects(access.prepare(g.args),/ROOT_SITE_UI_CAPABILITY_REQUIRED/);assert.equal(g.s.exists('access-prepared-private.json'),false);
});
test('saved root Site proof must bind the exact pending intent digest, not only the Site and actor',async()=>{
 const f=await installedFixture();await access.prepare(f.args);await access.assign(f.args);await access.grantIngress(f.args);await access.grantPage(f.args);const receipt=await access.beginSiteUi(f.args,true);const proof=await f.args.operations.setSiteActiveRootUi({org:f.snap.identity.org,controller:f.snap.identity.actor,siteId:f.snap.site.Id,active:true});await assert.rejects(access.completeSiteUi(f.args,{...proof,intentDigest:'1'.repeat(64)}),/SITE_UI_PROOF/);assert.equal(f.s.exists('access-event-11-private.json'),false);assert.equal(typeof receipt.intentDigest,'string');await access.completeSiteUi(f.args,{...proof,intentDigest:receipt.intentDigest});
});

test('disabled guest ingress and page entries become exact journal-owned true entries then restore false',async()=>{
 const f=await installedFixture(),original=f.s.read('baseline-private.json').snapshot.guestProfile.metadata,installed=structuredClone(f.snap.guestProfile.metadata);
 await access.prepare(f.args);await access.assign(f.args);await access.grantIngress(f.args);await access.grantPage(f.args);
 assert.deepEqual(f.snap.guestProfile.metadata.classAccesses,[{apexClass:'ExistingGuestClass',enabled:false},{apexClass:'CardstackCanonicalProbe',enabled:true},{apexClass:'CardstackCanonicalProbeTest',enabled:false}]);
 assert.deepEqual(f.snap.guestProfile.metadata.pageAccesses,[{apexPage:'CardstackSiteAuthProbeHome',enabled:true}]);assert.equal(f.snap.guestGrants.length,3);
 await access.removeAccess(f.args);assert.deepEqual(f.snap.guestProfile.metadata,installed);assert.equal(f.snap.guestGrants.length,1);assert.deepEqual(f.s.read('baseline-private.json').snapshot.guestProfile.metadata,original);
});
test('guest ownership digest tampering or rebound foreign metadata blocks access and cleanup preflight',async()=>{
 const cleanup=require('./cleanup.cjs');
 for(const mutate of [o=>o.guestProfileMetadataDigest='0'.repeat(64),o=>{o.guestProfileMetadata.classAccesses.push({apexClass:'ForeignClass',enabled:false});o.guestProfileMetadataDigest=require('./core.cjs').digest(o.guestProfileMetadata);}]){const f=await installedFixture();mutate(f.s.m.get('owned-components-private.json'));await assert.rejects(access.prepare(f.args));assert.equal(f.s.exists('access-prepared-private.json'),false);assert.equal(f.calls.length,0);}
 const f=await installedFixture();await access.prepare(f.args);f.snap.guestProfile.metadata.classAccesses[1].enabled=true;await assert.rejects(cleanup.preflight(f.args),/ACCESS_STATE_DRIFT/);assert.equal(f.s.exists('cleanup-preflight-private.json'),false);
});

test('owned guest metadata extra keys cannot disappear during ownership normalization',async()=>{
 const f=await installedFixture(),o=f.s.m.get('owned-components-private.json');o.guestProfileMetadata.classAccesses[1].attributes={unexpected:true};o.guestProfileMetadataDigest=require('./core.cjs').digest(o.guestProfileMetadata);
 await assert.rejects(access.prepare(f.args));assert.equal(f.s.exists('access-prepared-private.json'),false);assert.equal(f.calls.length,0);
});

test('current guest profile extra fields block access before any write',async()=>{
 const f=await installedFixture();await access.prepare(f.args);f.snap.guestProfile.metadata.tabVisibilities[0].attributes={unexpected:true};await assert.rejects(access.assign(f.args),/ACCESS_STATE_DRIFT/);assert.equal(f.calls.length,0);
});
