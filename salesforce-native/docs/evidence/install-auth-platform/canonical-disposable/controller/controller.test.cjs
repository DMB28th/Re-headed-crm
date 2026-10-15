'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('./core.cjs');
const artifactRoot = path.resolve(__dirname, '..');
const inventory = JSON.parse(fs.readFileSync(path.join(artifactRoot, 'sha256-inventory.json')));
// Tests use synthetic IDs and an in-memory boundary; no Salesforce core, auth, or private files.
const org = '00D000000000001EAA', actor = '005000000000001AAA';
const now = Date.parse('2026-10-10T15:00:00Z');
function store() { const m = new Map(); return {exists:n=>m.has(n), read:n=>structuredClone(m.get(n)), create(n,v){assert(!m.has(n),'exclusive record'); m.set(n,structuredClone(v));}, lock(){return ()=>{};}, m}; }
function fixture() {
  const s = store(); let enqueues = 0; let statusCalls = 0;
  const snap = {
    identity:{org,actor}, site:{Id:'0DM000000000001GAA',GuestUserId:'005000000000002AAA',Status:'Inactive',UrlPathPrefix:'cardstackauthprobe'},
    siteMetadata:{fullName:'CardstackAuthDiscoveryProbe',active:false,indexPage:'CardstackSiteAuthProbeHome'},
    siteContext:{baseUrl:'https://fixture.example/cardstackauthprobe',domain:'fixture.example',urlPathPrefix:'cardstackauthprobe'},guestUser:{Id:'005000000000002AAA',ProfileId:'00e000000000001AAA'},guestProfile:{Id:'00e000000000001AAA',metadata:{fullName:'Guest',tabVisibilities:[{tab:'baseline',visibility:'DefaultOn'}],classAccesses:[{apexClass:'ExistingGuestClass',enabled:false}],pageAccesses:[{apexPage:'CardstackSiteAuthProbeHome',enabled:false}]}},
    guestSet:{Id:'0PS000000000001GAA',ProfileId:'00e000000000001AAA'},guestGrants:[{Id:'0J0000000000001CAA',ParentId:'0PS000000000001GAA',SetupEntityId:'02r000000000001AAA',SetupEntityType:'TabSet'}],guestObjectGrants:[],
    page:{id:'066000000000001AAA',sourceHash:'1'.repeat(64)}, foundation:{metadata:[{fullName:'Cardstack_User'},{fullName:'Cardstack_Admin'}],assignments:[{Id:'0Pa000000000001CAA',permissionSet:'Cardstack_Admin',permissionSetId:'0PS000000000004GAA',assigneeId:actor}]},
    existingApps:['Card_Stack_SFAPP','B','C','D'].map((name,i)=>({name,id:['0X0000000000001CAA','0X0000000000002CAA','0X0000000000003CAA','0X0000000000004CAA'][i],lastModifiedDate:'2026-10-10T14:00:00Z',metadata:{fullName:name},policies:{fullName:name,...(i===0?{jwtEnabled:true}:{})}})),
    operatorUse:{effective:true,method:'effectiveCustomPermissions',permission:'Cardstack_Use_Connections',actor,org},
    operator:{Id:actor,ProfileId:'00e000000000002AAA',IsActive:true,profileMetadata:{fullName:'System Administrator'},permissionSet:{Id:'0PS000000000002GAA',ProfileId:'00e000000000002AAA'},assignments:[{Id:'0Pa000000000001CAA',PermissionSetId:'0PS000000000004GAA',AssigneeId:actor,PermissionSetGroupId:null}]},references:{complete:true,records:[]},
    collisions:{classes:[],resources:[],permissionSets:[],apps:[]},clientObservation:{name:'Cardstack Fresh Install QA',installedNameAbsent:true,draftInventory:'Unknown',coverage:'installed-only'},metadataJobs:{complete:true,pending:[]}, completeness:{guestGrants:true,guestObjects:true,foundationAssignments:true,apps:true,collisions:true,metadataJobs:true}
  };
  const adapter = {identity:async()=>({org,actor}),snapshot:async()=>structuredClone(snap),enqueue:async(zip,opts)=>{enqueues++;assert.equal(opts.checkOnly,false);assert.deepEqual(opts.runTests,['CardstackCanonicalProbeTest']);return {id:'0Af000000000001CAA'};},status:async()=>{statusCalls++;return {id:'0Af000000000001CAA',done:true,success:true,status:'Succeeded',numberComponentErrors:0,numberTestErrors:0,numberTestsCompleted:60,details:{runTestResult:{successes:inventory.testMethods.map(methodName=>({name:'CardstackCanonicalProbeTest',methodName})),failures:[]},componentFailures:[]}};}};
  const args={adapter,store:s,approved:true,approval:{stage:'A',approved:true},pins:{targetOrgId:org,foundationBaseline:{assignments:[{permissionSet:'Cardstack_Admin',assigneeId:actor}]}},artifacts:core.loadArtifacts(artifactRoot),expected:{pageSourceHash:'1'.repeat(64),existingAppNames:['Card_Stack_SFAPP','B','C','D']},now:()=>now};
  const auth={checkedAt:new Date(now-1000).toISOString(),org,actor,managedAuthValid:true,freshOpaqueManagedLogin:true,opaque:true,tokenFingerprint:'2'.repeat(64),connectionFingerprint:'2'.repeat(64),jwtOffSaved:true,jwtOffProof:{org,controller:actor,appName:'Card_Stack_SFAPP',appId:'0X0000000000001CAA',checkedAt:new Date(now-2000).toISOString(),savedVerified:true,jwtOn:false}};
  return {args,s,snap,auth,enqueues:()=>enqueues,statusCalls:()=>statusCalls};
}
test('checksum validation prevents full-ID mismatch and malformed suffix adoption',()=>{
  assert.equal(core.normalizeId('005000000000001'),actor);
  assert.throws(()=>core.normalizeId('005000000000001AAA'.slice(0,15)+'AAB'),/ID_INVALID/);
  assert.throws(()=>core.normalizeId('00500000000000!'),/ID_INVALID/);
});
test('I1 omitted or null required snapshot identities fail before baseline persistence',async()=>{
 const paths=[['site','Id'],['site','GuestUserId'],['guestUser','Id'],['guestUser','ProfileId'],['guestProfile','Id'],['guestSet','Id'],['guestSet','ProfileId'],['page','id'],['operator','Id'],['operator','ProfileId'],['operator','permissionSet','Id'],['operator','permissionSet','ProfileId'],['operator','assignments',0,'Id'],['operator','assignments',0,'PermissionSetId'],['operator','assignments',0,'AssigneeId'],['existingApps',0,'id'],['guestGrants',0,'Id'],['guestGrants',0,'ParentId'],['guestGrants',0,'SetupEntityId'],['foundation','assignments',0,'Id'],['foundation','assignments',0,'permissionSetId'],['foundation','assignments',0,'assigneeId']];
 for(const parts of paths)for(const nullValue of [false,true]){const f=fixture();const key=parts.at(-1),obj=parts.slice(0,-1).reduce((v,k)=>v[k],f.snap);if(nullValue)obj[key]=null;else delete obj[key];await assert.rejects(core.snapshot(f.args),/SNAPSHOT_ID_REQUIRED|ID_INVALID/);assert.equal(f.s.m.size,0);}
});
test('I1 malformed grant IDs and unrelated grant parents fail closed; valid 15-character required IDs normalize before persistence',async()=>{
 const f=fixture();f.snap.guestGrants[0].SetupEntityId='02r000000000001AAB';await assert.rejects(core.snapshot(f.args),/ID_INVALID/);assert.equal(f.s.m.size,0);
 const other=fixture();other.snap.guestGrants[0].ParentId='0PS000000000009GAA';await assert.rejects(core.snapshot(other.args),/GUEST_SCOPE/);assert.equal(other.s.m.size,0);
 const valid=fixture();for(const obj of [valid.snap.site,valid.snap.guestSet,valid.snap.operator.permissionSet])obj.Id=obj.Id.slice(0,15);valid.snap.page.id=valid.snap.page.id.slice(0,15);await core.snapshot(valid.args);const b=valid.s.read('baseline-private.json').snapshot;assert.equal(b.site.Id,'0DM000000000001GAA');assert.equal(b.guestSet.Id,'0PS000000000001GAA');assert.equal(b.operator.permissionSet.Id,'0PS000000000002GAA');assert.equal(b.page.id,'066000000000001AAA');
});
test('snapshot binds independently approved admin and rejects inactive-page drift before persistence',async()=>{
 const f=fixture();f.snap.siteMetadata.indexPage='OtherPage';
 await assert.rejects(core.snapshot(f.args),/SITE_SCOPE/);assert.equal(f.s.m.size,0);
 f.snap.siteMetadata.indexPage='CardstackSiteAuthProbeHome';f.args.pins.foundationBaseline.assignments[0].assigneeId='005000000000003';
 await assert.rejects(core.snapshot(f.args),/ACTOR_BINDING/);assert.equal(f.s.m.size,0);
});
test('snapshot refuses existing guest class/page/custom/object access, missing completeness, secrets and missing effective Use',async()=>{
 for(const mutate of [f=>f.snap.guestGrants.push({Id:'0J0000000000002CAA',SetupEntityId:'01p000000000001AAA',SetupEntityType:'ApexClass'}),f=>f.snap.guestObjectGrants.push({Id:'110000000000001AAA'}),f=>f.snap.completeness.apps=false,f=>f.snap.existingApps[0].metadata.consumerKey='secret',f=>delete f.snap.existingApps[0].lastModifiedDate,f=>f.snap.operatorUse.effective=false]){const f=fixture();mutate(f);await assert.rejects(core.snapshot(f.args));assert.equal(f.s.m.size,0);}
});
test('preflight freezes one immutable snapshot and refuses adoption or any later drift',async()=>{
 const f=fixture();await core.snapshot(f.args);await core.preflight(f.args);f.snap.existingApps[0].policies.jwtEnabled=false;assert.equal(f.s.m.size,2);
 await assert.rejects(core.snapshot(f.args),/EXISTING_RECORD/);
 f.snap.guestProfile.metadata.tabVisibilities=[];await assert.rejects(core.deploy({...f.args,auth:f.auth}),/BASELINE_DRIFT/);assert.equal(f.enqueues(),0);
});
test('deploy writes attempt before one enqueue and cannot retry an ambiguous transport failure',async()=>{
 const f=fixture();await core.snapshot(f.args);await core.preflight(f.args);f.snap.existingApps[0].policies.jwtEnabled=false;
 f.args.adapter.enqueue=async()=>{assert(f.s.exists('deploy-attempt-private.json'));throw Error('TOKEN 005000000000001AAA leaked');};
 await assert.rejects(core.deploy({...f.args,auth:f.auth}),/DEPLOYMENT_OUTCOME_UNRESOLVED/);
 await assert.rejects(core.deploy({...f.args,auth:f.auth}),/EXISTING_ATTEMPT/);
 await assert.rejects(core.status(f.args),/KNOWN_JOB_REQUIRED/);assert.equal(f.statusCalls(),0);
});
test('fresh auth binds org/actor/fingerprint and ten-minute age before any enqueue',async()=>{
 for(const change of [{checkedAt:new Date(now-600001).toISOString()},{opaque:false},{connectionFingerprint:'3'.repeat(64)},{jwtOffSaved:false},{actor:'005000000000003'}]){const f=fixture();await core.snapshot(f.args);await core.preflight(f.args);f.snap.existingApps[0].policies.jwtEnabled=false;await assert.rejects(core.deploy({...f.args,auth:{...f.auth,...change}}),/FRESH_AUTH/);assert.equal(f.enqueues(),0);}
});
test('status requires every exact method once, persists raw result privately, exposes only safe failure classifications',async()=>{
 const f=fixture();await core.snapshot(f.args);await core.preflight(f.args);f.snap.existingApps[0].policies.jwtEnabled=false;await core.deploy({...f.args,auth:f.auth});
 const r=await core.status(f.args);assert.equal(r.exactSixtyTestsPassed,true);assert.equal(r.success,true);assert(!JSON.stringify(r).includes(actor));
 f.args.adapter.status=async()=>({id:'0Af000000000001CAA',done:true,success:false,status:'Failed',details:{runTestResult:{successes:[],failures:[{name:'CardstackCanonicalProbeTest',methodName:'guestHtmlDenied',message:'assertion failed 005000000000001AAA secret'}]},componentFailures:[{fullName:'CardstackCanonicalProbe',lineNumber:7,problem:'Invalid type: 005000000000001AAA token secret'}]}});
 const fail=await core.status(f.args);assert.equal(fail.exactSixtyTestsPassed,false);assert.deepEqual(fail.failures,[{category:'invalid-type',name:'CardstackCanonicalProbe',line:7},{category:'test-assertion',name:'CardstackCanonicalProbeTest',method:'guestHtmlDenied'}]);assert(!JSON.stringify(fail).includes('secret'));
});
test('extra, duplicate or omitted passing methods fail exact inventory gate',()=>{
 const successes=inventory.testMethods.map(methodName=>({name:'CardstackCanonicalProbeTest',methodName}));
 assert.equal(core.exactTests({successes}),true);
 for(const altered of [successes.slice(1),[...successes,successes[0]],[...successes.slice(1),{name:'Other',methodName:successes[0].methodName}]])assert.equal(core.exactTests({successes:altered}),false);
});
test('unknown component failure strings are discarded even if they resemble names or IDs',()=>{
 const r=core.sanitizeResult({done:true,success:false,status:'arbitrary secret',details:{componentFailures:{fullName:'005000000000001AAA',lineNumber:-1,problem:'unknown secret'}}});
 assert.deepEqual(r.failures,[{category:'other'}]);assert.equal(r.status,'other');assert(!JSON.stringify(r).includes('secret'));
});
test('installed verification requires completed exact tests and current source/resource/minimal permission metadata before ownership capture',async()=>{
 const f=fixture();await core.snapshot(f.args);await core.preflight(f.args);f.snap.existingApps[0].policies.jwtEnabled=false;await core.deploy({...f.args,auth:f.auth});
 const installed={classes:['CardstackCanonicalProbe','CardstackCanonicalProbeTest'].map((name,i)=>({id:['01p000000000001AAA','01p000000000002AAA'][i],name,source:fs.readFileSync(path.join(artifactRoot,'classes',name+'.cls'),'utf8'),apiVersion:67,status:'Active'})),resource:{id:'081000000000001AAA',name:'CardstackCanonicalProbeUi',bytes:fs.readFileSync(path.join(artifactRoot,'staticresources/CardstackCanonicalProbeUi.resource')),contentType:'text/html',cacheControl:'Private'},permissionSet:{id:'0PS000000000003GAA',name:'Cardstack_Canonical_Probe',metadata:{fullName:'Cardstack_Canonical_Probe',label:'Cardstack Canonical Probe',classAccesses:[{apexClass:'CardstackCanonicalProbe',enabled:true}],userPermissions:[{name:'ApiEnabled',enabled:true}]}}};
 f.args.adapter.installed=async()=>installed;
 await assert.rejects(core.verifyInstalled({...f.args,auth:f.auth}),/EXACT_TESTS_REQUIRED/);
 await core.status(f.args);
 f.snap.collisions.classes=installed.classes.map(r=>({Id:r.id,Name:r.name}));f.snap.collisions.resources=[{Id:installed.resource.id,Name:installed.resource.name}];f.snap.collisions.permissionSets=[{Id:installed.permissionSet.id,Name:installed.permissionSet.name}];f.snap.guestProfile.metadata.classAccesses.push({apexClass:'CardstackCanonicalProbe',enabled:false},{apexClass:'CardstackCanonicalProbeTest',enabled:false});
 installed.resource.bytes=Buffer.from('wrong');await assert.rejects(core.verifyInstalled({...f.args,auth:f.auth}),/RESOURCE_SOURCE/);
 installed.resource.bytes=fs.readFileSync(path.join(artifactRoot,'staticresources/CardstackCanonicalProbeUi.resource'));
 installed.permissionSet.metadata.userPermissions=[{name:'APIEnabled',enabled:true}];await assert.rejects(core.verifyInstalled({...f.args,auth:f.auth}),/MINIMAL_PERMISSION_SET/);assert.equal(f.s.exists('owned-components-private.json'),false);
 installed.permissionSet.metadata.userPermissions=[{name:'ApiEnabled',enabled:true}];
 installed.permissionSet.metadata.customPermissions=[{name:'Cardstack_Use_Connections',enabled:true}];await assert.rejects(core.verifyInstalled({...f.args,auth:f.auth}),/MINIMAL_PERMISSION_SET/);delete installed.permissionSet.metadata.customPermissions;
 const r=await core.verifyInstalled({...f.args,auth:f.auth});assert.equal(r.installedSourcesVerified,true);assert.equal(r.minimalPermissionSetVerified,true);assert(f.s.exists('owned-components-private.json'));assert(!JSON.stringify(r).includes(installed.resource.id));
 await assert.rejects(core.verifyInstalled({...f.args,auth:f.auth}),/EXISTING_RECORD/);
});
test('installed reference guard permits owned minimal-set and exact admin class collateral, refuses foreign references',async()=>{
 const f=fixture();await core.snapshot(f.args);await core.preflight(f.args);f.snap.existingApps[0].policies.jwtEnabled=false;await core.deploy({...f.args,auth:f.auth});await core.status(f.args);
 const classes=['CardstackCanonicalProbe','CardstackCanonicalProbeTest'].map((name,i)=>({id:['01p000000000001AAA','01p000000000002AAA'][i],name,source:fs.readFileSync(path.join(artifactRoot,'classes',name+'.cls'),'utf8'),apiVersion:67,status:'Active'}));
 f.args.adapter.installed=async()=>({classes,resource:{id:'081000000000001AAA',name:'CardstackCanonicalProbeUi',bytes:fs.readFileSync(path.join(artifactRoot,'staticresources/CardstackCanonicalProbeUi.resource')),contentType:'text/html',cacheControl:'Private'},permissionSet:{id:'0PS000000000003GAA',name:'Cardstack_Canonical_Probe',metadata:{fullName:'Cardstack_Canonical_Probe',label:'Cardstack Canonical Probe',classAccesses:[{apexClass:'CardstackCanonicalProbe',enabled:true}],userPermissions:[{name:'ApiEnabled',enabled:true}]}}});
 f.snap.collisions.classes=classes.map(r=>({Id:r.id,Name:r.name}));f.snap.collisions.resources=[{Id:'081000000000001AAA',Name:'CardstackCanonicalProbeUi'}];f.snap.collisions.permissionSets=[{Id:'0PS000000000003GAA',Name:'Cardstack_Canonical_Probe'}];f.snap.guestProfile.metadata.classAccesses.push({apexClass:'CardstackCanonicalProbe',enabled:false},{apexClass:'CardstackCanonicalProbeTest',enabled:false});
 f.snap.operator.profileMetadata.classAccesses=classes.map(r=>({apexClass:r.name,enabled:true}));
 f.snap.references.records=[{ownerType:'PermissionSet',ownerId:'0PS000000000003GAA',entityType:'ApexClass',entityId:classes[0].id,enabled:true},...classes.map(r=>({ownerType:'Profile',ownerId:f.snap.operator.ProfileId,entityType:'ApexClass',entityId:r.id,enabled:true}))];
 f.snap.references.records.push({ownerType:'Profile',ownerId:'00e000000000003AAA',entityType:'ApexClass',entityId:classes[0].id,enabled:true});await assert.rejects(core.verifyInstalled({...f.args,auth:f.auth}),/DEPLOY_REFERENCE_REVIEW_REQUIRED/);
 f.snap.references.records.pop();const r=await core.verifyInstalled({...f.args,auth:f.auth});assert.equal(r.profileCollateralBound,true);
});
test('saved OFF exception is constrained to one deployment-app JWT flag and rejects collateral policy changes',async()=>{
 const f=fixture();f.snap.existingApps[0]={name:'Card_Stack_SFAPP',id:'0X0000000000001CAA',lastModifiedDate:'2026-10-10T14:00:00Z',metadata:{fullName:'Card_Stack_SFAPP'},policies:{fullName:'Card_Stack_SFAPP',jwtEnabled:true,scope:'api'}};f.args.expected.existingAppNames=['Card_Stack_SFAPP','B','C','D'];
 await core.snapshot(f.args);await core.preflight(f.args);f.snap.existingApps[0].policies.jwtEnabled=false;f.snap.existingApps[0].policies.jwtEnabled=false;
 f.snap.existingApps[0].policies.scope='api refresh';await assert.rejects(core.deploy({...f.args,auth:f.auth}),/BASELINE_DRIFT/);assert.equal(f.enqueues(),0);
 f.snap.existingApps[0].policies.scope='api';await core.deploy({...f.args,auth:f.auth});assert.equal(f.enqueues(),1);
});
test('deploy reconciles actual available deployment-app date only through bound reviewed proof while preserving full metadata',async()=>{
 const f=fixture();await core.snapshot(f.args);await core.preflight(f.args);f.snap.existingApps[0].policies.jwtEnabled=false;f.snap.existingApps[0].lastModifiedDate='2026-10-10T14:59:58Z';
 await assert.rejects(core.deploy({...f.args,auth:f.auth}),/JWT_DATE_PROOF_REQUIRED/);assert.equal(f.enqueues(),0);
 const proof={kind:'APPROVED_JWT_TRANSITION',source:'operator-ui',approved:true,org,controller:actor,appName:'Card_Stack_SFAPP',appId:f.snap.existingApps[0].id,fromLastModifiedDate:'2026-10-10T14:00:00Z',toLastModifiedDate:'2026-10-10T14:59:58Z',fromJwtOn:true,jwtOn:false,savedVerified:true,humanUiReadback:true,checkedAt:'2026-10-10T14:59:58Z',reviewedAt:'2026-10-10T14:59:59Z',screenshotSha256:'1'.repeat(64)};
 f.args.reviewedAppDateTransitions=[proof];f.args.verifyReviewedDateTransition=()=>true;
 f.snap.existingApps[0].metadata.contactEmail='changed@example.invalid';await assert.rejects(core.deploy({...f.args,auth:f.auth}),/BASELINE_DRIFT/);assert.equal(f.enqueues(),0);delete f.snap.existingApps[0].metadata.contactEmail;
 await core.deploy({...f.args,auth:f.auth});assert.equal(f.enqueues(),1);assert.equal(f.s.read('baseline-private.json').snapshot.existingApps[0].lastModifiedDate,'2026-10-10T14:00:00Z');
});

// Exercise the ownership boundary with real frozen resource bytes and metadata.
async function cacheFixture(cacheControl){
 const f=fixture();await core.snapshot(f.args);await core.preflight(f.args);f.snap.existingApps[0].policies.jwtEnabled=false;await core.deploy({...f.args,auth:f.auth});await core.status(f.args);
 const classes=['CardstackCanonicalProbe','CardstackCanonicalProbeTest'].map((name,i)=>({id:['01p000000000001AAA','01p000000000002AAA'][i],name,source:fs.readFileSync(path.join(artifactRoot,'classes',name+'.cls'),'utf8'),apiVersion:67,status:'Active'}));
 const resource={id:'081000000000001AAA',name:'CardstackCanonicalProbeUi',bytes:fs.readFileSync(path.join(artifactRoot,'staticresources/CardstackCanonicalProbeUi.resource')),contentType:'text/html',cacheControl};
 const permissionSet={id:'0PS000000000003GAA',name:'Cardstack_Canonical_Probe',metadata:{fullName:'Cardstack_Canonical_Probe',label:'Cardstack Canonical Probe',classAccesses:[{apexClass:'CardstackCanonicalProbe',enabled:true}],userPermissions:[{name:'ApiEnabled',enabled:true}]}};
 f.args.adapter.installed=async()=>({classes,resource,permissionSet});f.snap.collisions.classes=classes.map(r=>({Id:r.id,Name:r.name}));f.snap.collisions.resources=[{Id:resource.id,Name:resource.name}];f.snap.collisions.permissionSets=[{Id:permissionSet.id,Name:permissionSet.name}];f.snap.guestProfile.metadata.classAccesses.push({apexClass:'CardstackCanonicalProbe',enabled:false},{apexClass:'CardstackCanonicalProbeTest',enabled:false});return f;
}
test('installed ownership accepts exact Private resource cache metadata',async()=>{
 const f=await cacheFixture('Private');const receipt=await core.verifyInstalled({...f.args,auth:f.auth});assert.equal(receipt.resourceHashVerified,true);assert.equal(receipt.ownedComponentsCaptured,4);assert.equal(f.s.read('owned-components-private.json').resource.cacheControl,'Private');
});
test('installed ownership rejects Public cache before ownership persistence',async()=>{
 const f=await cacheFixture('Public');await assert.rejects(core.verifyInstalled({...f.args,auth:f.auth}),/RESOURCE_SOURCE/);assert.equal(f.s.exists('owned-components-private.json'),false);
});
test('installed ownership rejects unrecognized or missing resource cache before ownership persistence',async()=>{
 for(const value of ['private','Unknown','',null,undefined]){const f=await cacheFixture(value);await assert.rejects(core.verifyInstalled({...f.args,auth:f.auth}),/RESOURCE_SOURCE/);assert.equal(f.s.exists('owned-components-private.json'),false);}
});

const sdkEmptyPermissionFields=['applicationVisibilities','customMetadataTypeAccesses','customPermissions','externalDataSourceAccesses','fieldPermissions','flowAccesses','objectPermissions','pageAccesses','recordTypeVisibilities','tabSettings'];
async function sdkPermissionFixture(){
 const f=await cacheFixture('Private'),raw=await f.args.adapter.installed();
 Object.assign(raw.permissionSet.metadata,{hasActivationRequired:false,...Object.fromEntries(sdkEmptyPermissionFields.map(name=>[name,[]]))});return {f,metadata:raw.permissionSet.metadata};
}
test('installed ownership accepts SDK empty permission arrays and retains full metadata and digest',async()=>{
 const {f,metadata}=await sdkPermissionFixture(),expected=structuredClone(metadata);
 await core.verifyInstalled({...f.args,auth:f.auth});const owned=f.s.read('owned-components-private.json').permissionSet;
 assert.deepEqual(owned.metadata,expected);assert.equal(owned.digest,'d6eb4ce5899841098080e227ff1f3800618fdb0d78f88d90006ae68bbd670317');
});
test('installed ownership rejects every known nonempty permission array before persistence',async()=>{
 for(const name of sdkEmptyPermissionFields){const {f,metadata}=await sdkPermissionFixture();metadata[name]=[{enabled:true,name:'unapproved'}];await assert.rejects(core.verifyInstalled({...f.args,auth:f.auth}),/MINIMAL_PERMISSION_SET/);assert.equal(f.s.exists('owned-components-private.json'),false);}
});
test('installed ownership rejects unknown empty permission arrays before persistence',async()=>{
 const {f,metadata}=await sdkPermissionFixture();metadata.unapprovedPermissions=[];await assert.rejects(core.verifyInstalled({...f.args,auth:f.auth}),/MINIMAL_PERMISSION_SET/);assert.equal(f.s.exists('owned-components-private.json'),false);
});
test('installed ownership rejects nonarray values for known empty permission fields before persistence',async()=>{
 for(const value of [null,{},false,'']){const {f,metadata}=await sdkPermissionFixture();metadata.objectPermissions=value;await assert.rejects(core.verifyInstalled({...f.args,auth:f.auth}),/MINIMAL_PERMISSION_SET/);assert.equal(f.s.exists('owned-components-private.json'),false);}
});

test('installed ownership retains exact original guest metadata plus both owned disabled classes',async()=>{
 const f=await cacheFixture('Private'),original=f.s.read('baseline-private.json').snapshot.guestProfile.metadata,actual=structuredClone(f.snap.guestProfile.metadata);
 const receipt=await core.verifyInstalled({...f.args,auth:f.auth});assert.equal(receipt.ownedComponentsCaptured,4);
 const o=f.s.read('owned-components-private.json');assert.deepEqual(o.guestProfileMetadata,actual);assert.equal(o.guestProfileMetadataDigest,'9b9ddfe9a6d4f80accf2f2088689c1bb0e87ffe6aafe1dad13817bc988f9019a');assert.deepEqual(f.s.read('baseline-private.json').snapshot.guestProfile.metadata,original);
});
test('installed ownership rejects enabled duplicate foreign or otherwise changed guest metadata before persistence',async()=>{
 const mutations=[m=>m.classAccesses[1].enabled=true,m=>m.classAccesses[1].enabled='false',m=>m.classAccesses.push({...m.classAccesses[1]}),m=>m.classAccesses.push({apexClass:'ForeignClass',enabled:false}),m=>m.classAccesses.pop(),m=>m.classAccesses[1].extra=false,m=>m.classAccesses[0].enabled=true,m=>m.classAccesses.shift(),m=>m.tabVisibilities[0].visibility='Hidden',m=>m.pageAccesses[0].enabled=true,m=>m.unknown=[]];
 for(const mutate of mutations){const f=await cacheFixture('Private');mutate(f.snap.guestProfile.metadata);await assert.rejects(core.verifyInstalled({...f.args,auth:f.auth}));assert.equal(f.s.exists('owned-components-private.json'),false);}
});

test('raw guest metadata rejects extra owned keys and changed unrelated attribute or undefined fields',async()=>{
 for(const mutate of [m=>m.classAccesses[1].attributes={unexpected:true},m=>m.tabVisibilities[0].attributes={unexpected:true},m=>m.unknown=undefined]){const f=await cacheFixture('Private');mutate(f.snap.guestProfile.metadata);await assert.rejects(core.verifyInstalled({...f.args,auth:f.auth}));assert.equal(f.s.exists('owned-components-private.json'),false);}
});
