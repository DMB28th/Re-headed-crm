'use strict';
// Import-only. Every mutation is a root-injected operation on its managed session.
const core=require('./core.cjs'),fs=require('node:fs'),path=require('node:path');
const {normalizeId:id,normalizeRecords,secretFree,equal,digest,sha}=core;
const need=(v,c)=>{if(!v)throw Error(c);},list=v=>v==null?[]:Array.isArray(v)?v:[v];
const PREPARED='access-prepared-private.json';
const EMPTY=Object.freeze({active:false,assignment:null,ingress:null,page:null});
const ROOT_SITE_UI=Object.freeze({source:'root-cua',twoPhase:true,siteUpdateable:false,statusUpdateable:false});
async function locked(args,fn){const unlock=args.store.lock();try{return await fn();}finally{unlock();}}
function baseline(args){const b=args.store.read('baseline-private.json');need(b.binding===digest(b.snapshot),'BASELINE_BINDING');return b;}
function ownership(args,b){
 need(args.store.exists('owned-components-private.json')&&args.store.exists('deploy-exact-tests-private.json')&&args.store.exists('deploy-job-private.json'),'OWNERSHIP_REQUIRED');
 const rawOwned=args.store.read('owned-components-private.json'),o=normalizeRecords(rawOwned),gate=args.store.read('deploy-exact-tests-private.json'),job=normalizeRecords(args.store.read('deploy-job-private.json'));
 o.guestProfileMetadata=structuredClone(rawOwned.guestProfileMetadata);
 secretFree(o);need(o.binding===b.binding&&gate.binding===b.binding&&job.binding===b.binding&&gate.exactSixtyTestsPassed===true&&id(gate.jobId)===job.id&&equal({org:o.org,actor:o.actor},b.snapshot.identity)&&equal({org:job.org,actor:job.actor},b.snapshot.identity),'OWNERSHIP_BINDING');
 need(o.classes?.length===2&&equal(o.classes.map(c=>c.name),['CardstackCanonicalProbe','CardstackCanonicalProbeTest'])&&o.resource?.name==='CardstackCanonicalProbeUi'&&o.permissionSet?.name==='Cardstack_Canonical_Probe'&&Array.isArray(o.references)&&o.operatorProfileMetadata&&o.guestProfileMetadata&&typeof o.guestProfileMetadataDigest==='string','OWNERSHIP_BINDING');
 return o;
}
function prepared(args,b,o){const p=args.store.read(PREPARED);need(p.binding===b.binding&&p.ownedDigest===digest(o)&&p.testGateDigest===digest(args.store.read('deploy-exact-tests-private.json'))&&p.jobDigest===digest(args.store.read('deploy-job-private.json'))&&equal(p.identity,b.snapshot.identity)&&p.cleanupHash===core.CLEANUP_HASH&&equal(p.rootSiteUi,args.rootSiteUi)&&equal(p.rootSiteUi,ROOT_SITE_UI),'ACCESS_PREPARATION_BINDING');return p;}
function journal(args,p){
 let seq=0,previous=digest(p),state=structuredClone(EMPTY),pending=null;
 while(args.store.exists('access-event-'+(seq+1)+'-private.json')){
  const e=args.store.read('access-event-'+(++seq)+'-private.json');secretFree(e);
  need(e.seq===seq&&e.previous===previous&&e.binding===p.binding&&e.digest===digest(Object.fromEntries(Object.entries(e).filter(([k])=>k!=='digest'))),'ACCESS_JOURNAL_BINDING');
  if(e.kind==='intent'){need(!pending&&equal(e.state,state),'ACCESS_JOURNAL_BINDING');pending=e;}
  else if(e.kind==='result'){need(pending&&e.operation===pending.operation&&!pending.result,'ACCESS_JOURNAL_BINDING');pending={...pending,result:e.result,nextState:e.state};}
  else if(e.kind==='verified'){need(pending?.result&&e.operation===pending.operation&&equal(e.state,pending.nextState),'ACCESS_JOURNAL_BINDING');state=e.state;pending=null;}
  else throw Error('ACCESS_JOURNAL_BINDING');previous=e.digest;
 }
 return {seq,previous,state,pending};
}
function append(args,p,j,event){
 const e={seq:j.seq+1,previous:j.previous,binding:p.binding,at:new Date(args.now()).toISOString(),...event};secretFree(e);e.digest=digest(e);
 args.store.create('access-event-'+e.seq+'-private.json',e);j.seq=e.seq;j.previous=e.digest;
}
function accessArrays(s){
 for(const [owner,keys] of [[s.operator.profileMetadata,['classAccesses']],[s.guestProfile.metadata,['classAccesses','pageAccesses']]])for(const k of keys)if(k in owner)owner[k]=list(owner[k]);return s;
}
function addMetadata(metadata,key,entry){
 const nameField=key==='classAccesses'?'apexClass':'apexPage',rows=list(metadata[key]),matches=rows.filter(row=>row?.[nameField]===entry[nameField]);
 need(matches.length<=1&&matches.every(row=>equal(row,{[nameField]:entry[nameField],enabled:false})),'GUEST_PROFILE_COLLATERAL');
 metadata[key]=matches.length?rows.map(row=>row[nameField]===entry[nameField]?entry:row):[...rows,entry];
}
function expectedState(b,o,state){
 const e=structuredClone(b.snapshot);e.operator.profileMetadata=structuredClone(o.operatorProfileMetadata);e.guestProfile.metadata=structuredClone(o.guestProfileMetadata);e.references={complete:true,records:structuredClone(o.references)};
 e.collisions.classes=o.classes.map(r=>({Id:r.id,Name:r.name}));e.collisions.resources=[{Id:o.resource.id,Name:o.resource.name}];e.collisions.permissionSets=[{Id:o.permissionSet.id,Name:o.permissionSet.name}];
 e.site.Status=state.active?'Active':'Inactive';e.siteMetadata.active=state.active;
 if(state.assignment){e.operator.assignments.push(state.assignment);e.ownedAssignments.push(state.assignment);e.operator.directPermissionSets.push({Id:o.permissionSet.id,Name:o.permissionSet.name,HasActivationRequired:false});}
 for(const [key,type,field,name] of [['ingress','ApexClass','classAccesses','CardstackCanonicalProbe'],['page','ApexPage','pageAccesses','CardstackSiteAuthProbeHome']])if(state[key]){
  const row=state[key];e.guestGrants.push(row);addMetadata(e.guestProfile.metadata,field,{[type==='ApexClass'?'apexClass':'apexPage']:name,enabled:true});
  if(key==='ingress')e.references.records.push({ownerType:'Profile',ownerId:e.guestProfile.Id,entityType:type,entityId:row.SetupEntityId,enabled:true,accessId:row.Id,parentId:row.ParentId});
 }
 return e;
}
async function compareApps(args,b,live,auth){
 const actualApps=structuredClone(live.existingApps);
 const target=live.existingApps?.find(a=>a.name==='Card_Stack_SFAPP'),old=b.snapshot.existingApps.find(a=>a.name==='Card_Stack_SFAPP');need(target&&old&&target.id===old.id,'APP_BINDING');
 if(target.policies.jwtEnabled!==old.policies.jwtEnabled){core.freshAuth(auth,b.snapshot.identity,args.now());need(target.policies.jwtEnabled===false&&old.policies.jwtEnabled===true&&id(auth.jwtOffProof.appId)===target.id,'FRESH_AUTH');target.policies.jwtEnabled=old.policies.jwtEnabled;}
 if(target.lastModifiedDate!==old.lastModifiedDate){
  await require('./dates.cjs').verifyReviewedDates({baselineApps:b.snapshot.existingApps,currentApps:actualApps,identity:b.snapshot.identity,transitions:args.reviewedAppDateTransitions,verifyProof:args.verifyReviewedDateTransition,now:args.now()});target.lastModifiedDate=old.lastModifiedDate;
 }
}
function referenceScope(b,o){
 need(o.guestProfileMetadata&&o.guestProfileMetadataDigest===digest(o.guestProfileMetadata),'GUEST_PROFILE_BINDING');
 core.validateGuestProfileMetadata(b.snapshot.guestProfile.metadata,o.guestProfileMetadata);
 const classes=o.classes.map(c=>c.id),ingress=o.classes.find(c=>c.name==='CardstackCanonicalProbe').id;
 need(o.references.every(r=>
  (r.ownerType==='Profile'&&r.ownerId===b.snapshot.operator.ProfileId&&r.parentId===b.snapshot.operator.permissionSet.Id&&r.entityType==='ApexClass'&&classes.includes(r.entityId)&&r.enabled===true&&r.accessId)||
  (r.ownerType==='PermissionSet'&&r.ownerId===o.permissionSet.id&&r.parentId===o.permissionSet.id&&r.entityType==='ApexClass'&&r.entityId===ingress&&r.enabled===true&&r.accessId)||
  (r.ownerType==='ApexClass'&&classes.includes(r.ownerId)&&((r.entityType==='ApexClass'&&classes.includes(r.entityId))||(r.entityType==='StaticResource'&&r.entityId===o.resource.id)))
 ),'OWNED_REFERENCE_SCOPE');
 const clean=structuredClone(o.operatorProfileMetadata),entries=list(clean.classAccesses),old=b.snapshot.operator.profileMetadata;
 need(entries.filter(a=>o.classes.some(c=>c.name===a.apexClass)).every(a=>a.enabled===true&&equal(Object.keys(a),['apexClass','enabled'])),'PROFILE_COLLATERAL');
 const rest=entries.filter(a=>!o.classes.some(c=>c.name===a.apexClass));if('classAccesses' in old)clean.classAccesses=list(old.classAccesses);else delete clean.classAccesses;
 need(equal(rest,list(old.classAccesses))&&equal(clean,old),'PROFILE_COLLATERAL');
}
async function verifySources(args,o){
 const artifacts=core.loadArtifacts(args.artifacts.root);need(equal(artifacts.sourceHashes,args.artifacts.sourceHashes),'SOURCE_HASH');
 const raw=await args.adapter.installed();need(raw?.classes?.length===2&&raw.resource&&raw.permissionSet,'INSTALLED_COMPONENTS');
 for(const c of o.classes){const rows=raw.classes.filter(r=>r.name===c.name);need(rows.length===1,'INSTALLED_COMPONENTS');const r=rows[0],frozen=fs.readFileSync(path.join(artifacts.root,'classes',c.name+'.cls'),'utf8');need(id(r.id)===c.id&&r.status==='Active'&&Number(r.apiVersion)===67&&sha(frozen)===c.frozenSourceSha256&&sha(r.source)===c.bodySha256&&(r.source===frozen||(frozen.endsWith('\n')&&r.source===frozen.slice(0,-1))),'CLASS_SOURCE');}
 const r=raw.resource;need(id(r.id)===o.resource.id&&r.name===o.resource.name&&Buffer.isBuffer(r.bytes)&&sha(r.bytes)===o.resource.sha256&&sha(r.bytes)===artifacts.sourceHashes['staticresources/CardstackCanonicalProbeUi.resource']&&r.contentType===o.resource.contentType&&r.cacheControl===o.resource.cacheControl,'RESOURCE_SOURCE');
 need(id(raw.permissionSet.id)===o.permissionSet.id&&raw.permissionSet.name===o.permissionSet.name&&digest(raw.permissionSet.metadata)===o.permissionSet.digest&&equal(raw.permissionSet.metadata,o.permissionSet.metadata),'MINIMAL_PERMISSION_SET');
}
async function current(args,b,o,state,{auth}={}){
 const identity=await core.authority(args);need(equal(identity,b.snapshot.identity),'ACTOR_BINDING');referenceScope(b,o);await verifySources(args,o);
 const rawSnapshot=await args.adapter.snapshot(identity),live=normalizeRecords(rawSnapshot);live.guestProfile.metadata=structuredClone(rawSnapshot.guestProfile.metadata);secretFree(live);const actual=structuredClone(live),expected=expectedState(b,o,state);
 need(core.guestMetadataEqual(live.guestProfile.metadata,expected.guestProfile.metadata),'ACCESS_STATE_DRIFT');
 // Validate the baseline form after comparing every controlled change exactly.
 await compareApps(args,b,live,auth);need(equal(accessArrays(live),accessArrays(expected)),'ACCESS_STATE_DRIFT');
 core.validateSnapshot(b.snapshot,identity,args.expected);return actual;
}
async function prepare(args){return locked(args,async()=>{
 need(!args.store.exists(PREPARED),'EXISTING_RECORD');const b=baseline(args),o=ownership(args,b);
 need(b.snapshot.operatorUse.method==='directAssignment'&&b.snapshot.operatorUse.hasActivationRequired===false,'NON_ACTIVATED_USE_REQUIRED');need(b.snapshot.operator.permissionSet.IsOwnedByProfile===true&&b.snapshot.guestSet.IsOwnedByProfile===true,'PROFILE_PS_BINDING');
 need(Array.isArray(b.snapshot.ownedAssignments)&&b.snapshot.ownedAssignments.length===0&&Array.isArray(b.snapshot.ownedPermissionSetGroups)&&b.snapshot.ownedPermissionSetGroups.length===0&&Array.isArray(b.snapshot.operator.directPermissionSets),'ACCESS_BASELINE_REQUIRED');
 for(const op of ['createAssignment','addGuestAccess','removeAssignment','removeGuestAccess'])need(typeof args.operations?.[op]==='function','ROOT_ACCESS_OPERATIONS_REQUIRED');
 need(equal(args.rootSiteUi,ROOT_SITE_UI),'ROOT_SITE_UI_CAPABILITY_REQUIRED');need(typeof args.adapter.absenceReferences==='function','ABSENCE_REFERENCE_COLLECTOR_REQUIRED');require('./cleanup.cjs').assertArchive(args.artifacts.cleanup);await current(args,b,o,EMPTY);
 args.store.create(PREPARED,{version:1,binding:b.binding,identity:b.snapshot.identity,ownedDigest:digest(o),testGateDigest:digest(args.store.read('deploy-exact-tests-private.json')),jobDigest:digest(args.store.read('deploy-job-private.json')),cleanupHash:core.CLEANUP_HASH,rootSiteUi:structuredClone(args.rootSiteUi)});
 return {success:true,accessPrepared:true,cleanupPrepared:true,siteInactive:true};
});}
async function context(args){const b=baseline(args),o=ownership(args,b),p=prepared(args,b,o),j=journal(args,p);need(!j.pending,'ACCESS_PENDING');return {b,o,p,j};}
function projectResult(callback,raw){
 need(raw&&typeof raw==='object'&&!Array.isArray(raw),'ACCESS_RESULT');
 if(callback==='createAssignment'||callback==='addGuestAccess'){
  need((raw.success===undefined||raw.success===true)&&(!raw.errors||(Array.isArray(raw.errors)&&raw.errors.length===0)),'ACCESS_RESULT');return {id:id(raw.id)};
 }
 if(callback==='removeAssignment'||callback==='removeGuestAccess'){need(raw.success===true&&(!raw.errors||(Array.isArray(raw.errors)&&raw.errors.length===0)),'ACCESS_RESULT');return {success:true};}
 need(callback==='setSiteActiveRootUi','ACCESS_RESULT');return normalizeRecords(Object.fromEntries(['source','org','controller','siteId','active','savedVerified','checkedAt','intentDigest'].map(k=>[k,raw[k]])));
}
async function reconcile(args){return locked(args,async()=>{
 const b=baseline(args),o=ownership(args,b),p=prepared(args,b,o),j=journal(args,p);need(j.pending?.result&&j.pending.nextState,'KNOWN_ACCESS_RESULT_REQUIRED');
 await current(args,b,o,j.pending.nextState);append(args,p,j,{kind:'verified',operation:j.pending.operation,state:j.pending.nextState});return {success:true,accessWriteVerified:true,reconciledByReadback:true};
});}
async function mutate(args,operation,plan){return locked(args,async()=>{
 const {b,o,p,j}=await context(args);need(!args.store.exists('cleanup-attempt-private.json'),'CLEANUP_ALREADY_ATTEMPTED');await current(args,b,o,j.state);const {input,next,callback}=plan(b,o,j.state);
 append(args,p,j,{kind:'intent',operation,input,state:j.state});let raw;try{raw=await args.operations[callback](structuredClone(input));}catch{throw Error('ACCESS_OUTCOME_UNRESOLVED');}
 let result,state;try{secretFree(raw);result=projectResult(callback,raw);state=next(result);}catch{throw Error('ACCESS_OUTCOME_UNRESOLVED');}
 append(args,p,j,{kind:'result',operation,result,state});await current(args,b,o,state);append(args,p,j,{kind:'verified',operation,state});
 return {success:true,accessWriteVerified:true,siteInactive:!state.active};
});}
const assigned=(s)=>need(!s.active,'RESTORE_SITE_FIRST');
function assign(args){return mutate(args,'assign',(b,o,s)=>{need(!s.assignment&&!s.ingress&&!s.page&&!s.active,'ACCESS_ORDER');const input={AssigneeId:b.snapshot.identity.actor,PermissionSetId:o.permissionSet.id};return {input,callback:'createAssignment',next:r=>({...s,assignment:{Id:id(r.id),...input,PermissionSetGroupId:null}})};});}
function grant(args,key,type){return mutate(args,'grant-'+key,(b,o,s)=>{need(s.assignment&&!s[key]&&!s.active,'ACCESS_ORDER');const input={ParentId:b.snapshot.guestSet.Id,SetupEntityId:key==='ingress'?o.classes.find(c=>c.name==='CardstackCanonicalProbe').id:b.snapshot.page.id,SetupEntityType:type};return {input,callback:'addGuestAccess',next:r=>({...s,[key]:{Id:id(r.id),...input}})};});}
const grantIngress=args=>grant(args,'ingress','ApexClass'),grantPage=args=>grant(args,'page','ApexPage');
function sitePlan(b,s,active){
 need(typeof active==='boolean'&&s.active!==active&&(!active||s.assignment&&s.ingress&&s.page),'ACCESS_ORDER');
 return {org:b.snapshot.identity.org,controller:b.snapshot.identity.actor,siteId:b.snapshot.site.Id,siteName:'CardstackAuthDiscoveryProbe',active};
}
async function beginSiteUi(args,active){return locked(args,async()=>{
 const {b,o,p,j}=await context(args);need(!args.store.exists('cleanup-attempt-private.json'),'CLEANUP_ALREADY_ATTEMPTED');await current(args,b,o,j.state);const input=sitePlan(b,j.state,active);
 append(args,p,j,{kind:'intent',operation:active?'activate':'restore',input,state:j.state});
 return {success:false,rootSiteUiActionRequired:true,active,intentDigest:j.previous};
});}
async function completeSiteUi(args,rawProof){return locked(args,async()=>{
 const b=baseline(args),o=ownership(args,b),p=prepared(args,b,o),j=journal(args,p),pending=j.pending;
 need(pending&&!pending.result&&['activate','restore'].includes(pending.operation),'KNOWN_SITE_UI_INTENT_REQUIRED');secretFree(rawProof);const proof=projectResult('setSiteActiveRootUi',rawProof),input=sitePlan(b,j.state,pending.operation==='activate');
 const age=args.now()-Date.parse(proof.checkedAt);need(proof.intentDigest===pending.digest&&equal(input,pending.input)&&proof.source==='operator-ui'&&proof.org===input.org&&proof.controller===input.controller&&proof.siteId===input.siteId&&proof.active===input.active&&proof.savedVerified===true&&Number.isFinite(age)&&age>=0&&age<600000&&Date.parse(proof.checkedAt)>=Date.parse(pending.at),'SITE_UI_PROOF');
 const state={...j.state,active:input.active};append(args,p,j,{kind:'result',operation:pending.operation,result:proof,state});
 await current(args,b,o,state);append(args,p,j,{kind:'verified',operation:pending.operation,state});return {success:true,siteUiWriteVerified:true,siteInactive:!state.active};
});}
const activate=args=>beginSiteUi(args,true),restore=args=>beginSiteUi(args,false);
function removeGrant(args,key){return mutate(args,'remove-'+key,(b,o,s)=>{assigned(s);need(s[key],'OWNED_GRANT_REQUIRED');return {input:s[key],callback:'removeGuestAccess',next:r=>{need(r.success===true,'ACCESS_REMOVAL_RESULT');return {...s,[key]:null};}};});}
function removeAssignment(args){return mutate(args,'remove-assignment',(b,o,s)=>{assigned(s);need(s.assignment&&!s.ingress&&!s.page,'ACCESS_ORDER');return {input:s.assignment,callback:'removeAssignment',next:r=>{need(r.success===true,'ACCESS_REMOVAL_RESULT');return {...s,assignment:null};}};});}
async function removeAccess(args){
 let c=await locked(args,()=>context(args));if(c.j.state.active)return beginSiteUi(args,false);
 for(const key of ['page','ingress']){c=await locked(args,()=>context(args));if(c.j.state[key])await removeGrant(args,key);}
 c=await locked(args,()=>context(args));if(c.j.state.assignment)await removeAssignment(args);
 return locked(args,async()=>{const {b,o,j}=await context(args);need(equal(j.state,EMPTY),'ACCESS_PENDING');await current(args,b,o,EMPTY);return {success:true,accessRestored:true,siteInactive:true};});
}
async function measureAndRemove(args,measurement){
 need(typeof measurement==='function','MEASUREMENT_REQUIRED');let failed=false;
 try{await locked(args,async()=>{const {b,o,j}=await context(args);need(j.state.active,'ACCESS_ORDER');await current(args,b,o,j.state);});await measurement();}catch{failed=true;}
 const cleanup=await removeAccess(args);if(cleanup.rootSiteUiActionRequired)return {...cleanup,measurementFailed:failed};
 if(failed)throw Error('MEASUREMENT_FAILED');return {success:true,measurementSucceeded:true,accessRestored:true};
}
module.exports={prepare,assign,grantIngress,grantPage,activate,restore,beginSiteUi,completeSiteUi,removeAccess,measureAndRemove,reconcile,locked,baseline,ownership,prepared,journal,context,current,compareApps,verifySources,referenceScope,EMPTY};
