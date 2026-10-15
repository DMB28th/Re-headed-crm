'use strict';
// Root controller only. Importing performs no I/O, connection creation, or auth reads.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const DEPLOY_HASH='0254b198c7c303f699ff009ba8dea0d4e9dbca726cbfcae60f06e2b78a34baa2';
const CLEANUP_HASH='b256372aa78693ab396854bc21f4146aa506b09959ec905bf6374d36c7da3329';
const NAMES=['CardstackCanonicalProbe','CardstackCanonicalProbeTest','CardstackCanonicalProbeUi','Cardstack_Canonical_Probe'];
const PRIVATE_DIR='/Users/danielben-atar/Documents/Codex/2026-10-05/codex-handoff-cardstack-native-salesforce-package/work/install-auth-state-validation/canonical-stage-a-revision2';
const need=(v,c)=>{if(!v)throw Error(c);};
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const list=v=>v==null?[]:Array.isArray(v)?v:[v];
function normalizeId(v){
 need(typeof v==='string'&&/^[A-Za-z0-9]{15}(?:[A-Z0-5]{3})?$/.test(v),'ID_INVALID');
 const base=v.slice(0,15),alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';let suffix='';
 for(let group=0;group<3;group++){let bits=0;for(let bit=0;bit<5;bit++)if(/[A-Z]/.test(base[group*5+bit]))bits|=1<<bit;suffix+=alphabet[bits];}
 need(v.length===15||v.slice(15)===suffix,'ID_INVALID');return base+suffix;
}
function canonical(v){return Array.isArray(v)?v.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).filter(k=>k!=='attributes').sort().map(k=>[k,canonical(v[k])])):v;}
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const digest=v=>sha(JSON.stringify(canonical(v)));
function normalizeRecords(v,key=''){
 if(Array.isArray(v))return v.map(x=>normalizeRecords(x,key));
 if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>k!=='attributes').map(([k,x])=>[k,normalizeRecords(x,k)]));
 if(v!=null&&/^(Id|id|org|actor|controller|targetOrgId|.*Id)$/.test(key))return normalizeId(v);
 return v;
}
function secretFree(v){
 if(Array.isArray(v))return v.forEach(secretFree);
 if(v&&typeof v==='object')for(const [k,x] of Object.entries(v)){
  need(!/^(accessToken|refreshToken|consumerKey|consumerSecret|clientSecret|password|authorization|tokenFingerprint|connectionFingerprint|sessionId|token)$/i.test(k),'SECRET_FIELD');secretFree(x);
 }
}
function loadArtifacts(root){
 const inventory=JSON.parse(fs.readFileSync(path.join(root,'sha256-inventory.json'),'utf8'));
 need(inventory.apiVersion==='67.0'&&inventory.testMethods.length===60&&new Set(inventory.testMethods).size===60,'INVENTORY');
 need(equal(inventory.components,{ApexClass:NAMES.slice(0,2),StaticResource:[NAMES[2]],PermissionSet:[NAMES[3]]}),'INVENTORY');
 for(const file of inventory.deployFiles){need(!path.isAbsolute(file)&&!file.split('/').includes('..'),'INVENTORY');need(sha(fs.readFileSync(path.join(root,file)))===inventory.sourceHashes[file],'SOURCE_HASH');}
 const zip=fs.readFileSync(path.join(root,'deploy.zip')),cleanup=fs.readFileSync(path.join(root,'cleanup.zip'));
 need(sha(zip)===DEPLOY_HASH&&sha(cleanup)===CLEANUP_HASH,'ARCHIVE_HASH');
 return {root,zip,cleanup,testMethods:[...inventory.testMethods],sourceHashes:{...inventory.sourceHashes}};
}
function storeAt(dir){
 // Directory must already have been created privately by root. No fallback directory.
 need(dir===PRIVATE_DIR&&fs.realpathSync(dir)===dir,'PRIVATE_DIRECTORY');
 const stat=fs.lstatSync(dir);need(stat.isDirectory()&&!stat.isSymbolicLink()&&(stat.mode&0o777)===0o700,'PRIVATE_DIRECTORY');
 function target(n){need(/^[a-z0-9-]+(?:-private)?\.json$/.test(n),'RECORD_NAME');return path.join(dir,n);}
 function create(n,v){const fd=fs.openSync(target(n),'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(v,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}const d=fs.openSync(dir,'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}}
 return {exists:n=>fs.existsSync(target(n)),read(n){const t=target(n),s=fs.lstatSync(t);need(s.isFile()&&!s.isSymbolicLink()&&(s.mode&0o777)===0o600,'PRIVATE_RECORD');return JSON.parse(fs.readFileSync(t,'utf8'));},create,lock(){const n='controller-lock-private.json';create(n,{pid:process.pid});return()=>fs.unlinkSync(target(n));}};
}
async function authority(args){
 if(args.approval?.stage==='C'){
  need(args.approved===true&&args.approval.approved===true,'APPROVAL');
  const identity=normalizeRecords(await args.adapter.identity());
  return require('./stage-c-session.cjs').verifyAuthority(args,identity);
 }
 if(args.approval?.stage==='B'){
  need(args.approved===true&&args.approval.approved===true,'APPROVAL');
  const identity=normalizeRecords(await args.adapter.identity());
  return require('./stage-b-session.cjs').verifyAuthority(args,identity);
 }
 need(args.approved===true&&args.approval?.stage==='A'&&args.approval.approved===true,'APPROVAL');
 const identity=normalizeRecords(await args.adapter.identity());
 const admins=list(args.pins.foundationBaseline.assignments).filter(a=>a.permissionSet==='Cardstack_Admin');
 need(admins.length===1&&identity.org===normalizeId(args.pins.targetOrgId)&&identity.actor===normalizeId(admins[0].assigneeId),'ACTOR_BINDING');return identity;
}
function validateSnapshot(raw,identity,expected,installed=false){
 secretFree(raw);const b=normalizeRecords(raw);
 // Normalization cannot validate an omitted field. Require every identity used
 // for binding/removal independently, before comparing relationships or saving.
 const ids=(row,keys)=>{for(const key of keys)need(typeof row?.[key]==='string'&&normalizeId(row[key])===row[key],'SNAPSHOT_ID_REQUIRED');};
 ids(b.identity,['org','actor']);ids(b.site,['Id','GuestUserId']);ids(b.guestUser,['Id','ProfileId']);ids(b.guestProfile,['Id']);ids(b.guestSet,['Id','ProfileId']);ids(b.page,['id']);ids(b.operator,['Id','ProfileId']);ids(b.operator?.permissionSet,['Id','ProfileId']);
 for(const row of list(b.guestGrants)){ids(row,['Id','ParentId','SetupEntityId']);need(typeof row.SetupEntityType==='string'&&row.SetupEntityType.length>0,'GUEST_SCOPE');need(row.ParentId===b.guestSet.Id,'GUEST_SCOPE');}
 for(const row of list(b.foundation?.assignments)){ids(row,['Id','permissionSetId','assigneeId']);need(['Cardstack_User','Cardstack_Admin'].includes(row.permissionSet),'FOUNDATION_SCOPE');}
 for(const row of list(b.operator?.assignments)){ids(row,['Id','PermissionSetId','AssigneeId']);need(row.AssigneeId===b.operator.Id,'OPERATOR_SCOPE');}
 for(const row of list(b.existingApps))ids(row,['id']);
 for(const rows of Object.values(b.collisions||{}))for(const row of list(rows)){ids(row,['Id']);need(typeof row.Name==='string'&&row.Name.length>0,'COLLISION');}
 for(const row of list(b.references?.records)){ids(row,['ownerId','entityId']);need(typeof row.ownerType==='string'&&typeof row.entityType==='string','REFERENCE_SCOPE');}
 need(equal(b.identity,identity),'ACTOR_BINDING');
 need(b.site?.Status==='Inactive'&&b.site.UrlPathPrefix==='cardstackauthprobe'&&b.siteMetadata?.fullName==='CardstackAuthDiscoveryProbe'&&b.siteMetadata.active===false&&b.siteMetadata.indexPage==='CardstackSiteAuthProbeHome','SITE_SCOPE');
 let siteUrl;try{siteUrl=new URL(b.siteContext.baseUrl);}catch{throw Error('SITE_CONTEXT');}
 need(siteUrl.protocol==='https:'&&!siteUrl.username&&!siteUrl.password&&!siteUrl.search&&!siteUrl.hash&&siteUrl.hostname===b.siteContext.domain&&siteUrl.pathname.replace(/\/$/,'')==='/cardstackauthprobe'&&b.siteContext.urlPathPrefix==='cardstackauthprobe','SITE_CONTEXT');
 need(b.guestProfile?.Id===b.guestSet?.ProfileId&&b.guestProfile.metadata&&Array.isArray(b.guestGrants)&&Array.isArray(b.guestObjectGrants),'GUEST_SCOPE');
 need(b.guestUser?.Id===b.site.GuestUserId&&b.guestUser.ProfileId===b.guestProfile.Id,'GUEST_SCOPE');
 need(b.guestGrants.every(r=>!['ApexClass','ApexPage','CustomPermission'].includes(r.SetupEntityType))&&b.guestObjectGrants.length===0,'GUEST_SCOPE');
 need(b.page?.sourceHash===expected.pageSourceHash&&/^[a-f0-9]{64}$/.test(b.page.sourceHash),'PAGE_SOURCE');
 need(equal(list(b.foundation?.metadata).map(r=>r.fullName),['Cardstack_User','Cardstack_Admin'])&&Array.isArray(b.foundation.assignments),'FOUNDATION_SCOPE');
 need(b.existingApps?.length===4&&equal(b.existingApps.map(r=>r.name),expected.existingAppNames)&&new Set(b.existingApps.map(r=>r.id)).size===4&&b.existingApps.every(r=>r.metadata&&r.policies&&typeof r.lastModifiedDate==='string'&&Number.isFinite(Date.parse(r.lastModifiedDate))),'APP_SCOPE');
 const use=b.operatorUse;need(use?.effective===true&&use.org===identity.org&&use.actor===identity.actor&&use.permission==='Cardstack_Use_Connections','EXISTING_USE_REQUIRED');
 need(['effectiveCustomPermissions','approvedRuntime','directAssignment'].includes(use.method),'USE_PROOF');
 if(use.method==='directAssignment')need(use.hasActivationRequired===false&&use.permissionSetId&&use.assignmentId&&use.customPermissionId&&use.setupEntityAccessId&&use.assigneeId===identity.actor&&use.permissionName==='Cardstack_Use_Connections'&&use.setupEntityParentId===use.permissionSetId&&use.setupEntityId===use.customPermissionId&&use.assignmentPermissionSetId===use.permissionSetId,'USE_PROOF');
 if(use.method==='approvedRuntime')need(use.approved===true&&use.namedFixtureVerified===true,'USE_PROOF');
 need(b.operator?.Id===identity.actor&&b.operator.IsActive===true&&b.operator.ProfileId===b.operator.permissionSet?.ProfileId&&b.operator.profileMetadata&&Array.isArray(b.operator.assignments),'OPERATOR_SCOPE');
 need(b.references?.complete===true&&Array.isArray(b.references.records)&&(installed||b.references.records.length===0),'REFERENCE_SCOPE');
 need(equal(Object.keys(b.completeness||{}),['guestGrants','guestObjects','foundationAssignments','apps','collisions','metadataJobs'])&&Object.values(b.completeness).every(v=>v===true),'SNAPSHOT_INCOMPLETE');
 need(equal(Object.keys(b.collisions||{}),['classes','resources','permissionSets','apps'])&&Object.values(b.collisions).every(v=>Array.isArray(v)),'COLLISION');
 if(!installed)need(Object.values(b.collisions).every(v=>v.length===0),'COLLISION');
 else need(b.collisions.apps.length===0,'COLLISION');
 need(b.clientObservation?.name==='Cardstack Fresh Install QA'&&b.clientObservation.installedNameAbsent===true&&b.clientObservation.coverage==='installed-only'&&b.clientObservation.draftInventory==='Unknown','CLIENT_OBSERVATION_REQUIRED');
 need(b.metadataJobs?.complete===true&&Array.isArray(b.metadataJobs.pending)&&b.metadataJobs.pending.length===0,'METADATA_JOB_PENDING');return b;
}
async function verifyDrift(b,live,auth,context={}){
 if(equal(b,live))return;
 // Only the saved deployment-app JWT flag and independently reviewed list-date
 // chain may differ. Full API metadata and every other app date remain exact.
 const before=b.existingApps.find(a=>a.name==='Card_Stack_SFAPP'),after=live.existingApps.find(a=>a.name==='Card_Stack_SFAPP');
 need(before&&after&&before.id===after.id,'BASELINE_DRIFT');const restored=structuredClone(live),target=restored.existingApps.find(a=>a.name==='Card_Stack_SFAPP');
 if(before.policies.jwtEnabled!==after.policies.jwtEnabled){need(auth?.jwtOffSaved===true&&before.policies.jwtEnabled===true&&after.policies.jwtEnabled===false,'BASELINE_DRIFT');target.policies.jwtEnabled=before.policies.jwtEnabled;}
 if(before.lastModifiedDate!==after.lastModifiedDate){await require('./dates.cjs').verifyReviewedDates({baselineApps:b.existingApps,currentApps:live.existingApps,identity:b.identity,transitions:context.reviewedAppDateTransitions,verifyProof:context.verifyReviewedDateTransition,now:context.now()});target.lastModifiedDate=before.lastModifiedDate;}
 need(equal(restored,b),'BASELINE_DRIFT');
}
async function freshSnapshot(args){const identity=await authority(args);return validateSnapshot(await args.adapter.snapshot(identity),identity,args.expected);}
async function withLock(args,fn){const unlock=args.store.lock();try{return await fn();}finally{unlock();}}
async function snapshot(args){return withLock(args,async()=>{
 need(!args.store.exists('baseline-private.json'),'EXISTING_RECORD');const b=await freshSnapshot(args);
 args.store.create('baseline-private.json',{version:1,checkedAt:new Date(args.now()).toISOString(),snapshot:b,binding:digest(b)});
 return {success:true,baselineCaptured:true,siteInactive:true,existingUseProved:true,fourAppsPreserved:true};
});}
async function preflight(args){return withLock(args,async()=>{
 need(!args.store.exists('preflight-private.json'),'EXISTING_RECORD');need(args.store.exists('baseline-private.json'),'BASELINE_REQUIRED');
 const b=args.store.read('baseline-private.json');need(b.binding===digest(b.snapshot),'BASELINE_BINDING');const live=await freshSnapshot(args);await verifyDrift(b.snapshot,live,undefined,args);
 need(!args.store.exists('deploy-attempt-private.json')&&!args.store.exists('deploy-job-private.json'),'EXISTING_ATTEMPT');need(sha(args.artifacts.zip)===DEPLOY_HASH,'ARCHIVE_HASH');
 args.store.create('preflight-private.json',{checkedAt:new Date(args.now()).toISOString(),binding:b.binding,deployHash:DEPLOY_HASH});return {success:true,preflight:true,artifactHashMatches:true,collisionsAbsent:true};
});}
function freshAuth(auth,identity,now){
 const age=now-Date.parse(auth?.checkedAt);let binding=false;try{binding=normalizeId(auth.org)===identity.org&&normalizeId(auth.actor)===identity.actor;}catch{}
 need(binding&&Number.isFinite(age)&&age>=0&&age<600000&&auth.managedAuthValid===true&&auth.freshOpaqueManagedLogin===true&&auth.opaque===true&&auth.jwtOffSaved===true&&/^[a-f0-9]{64}$/.test(auth.tokenFingerprint)&&auth.tokenFingerprint===auth.connectionFingerprint,'FRESH_AUTH');
 const proof=auth.jwtOffProof;let proofBound=false;try{proofBound=normalizeId(proof.org)===identity.org&&normalizeId(proof.controller)===identity.actor&&Boolean(normalizeId(proof.appId));}catch{}
 const proofAge=now-Date.parse(proof?.checkedAt);need(proofBound&&proof.appName==='Card_Stack_SFAPP'&&proof.savedVerified===true&&proof.jwtOn===false&&Number.isFinite(proofAge)&&proofAge>=0&&proofAge<600000&&Date.parse(proof.checkedAt)<=Date.parse(auth.checkedAt),'FRESH_AUTH');
}
async function deploy(args){return withLock(args,async()=>{
 need(!args.store.exists('deploy-attempt-private.json')&&!args.store.exists('deploy-job-private.json'),'EXISTING_ATTEMPT');
 need(args.store.exists('preflight-private.json'),'PREFLIGHT_REQUIRED');const b=args.store.read('baseline-private.json'),p=args.store.read('preflight-private.json');
 need(b.binding===digest(b.snapshot)&&p.binding===b.binding,'BASELINE_BINDING');const live=await freshSnapshot(args);freshAuth(args.auth,live.identity,args.now());await verifyDrift(b.snapshot,live,args.auth,args);
 need(sha(args.artifacts.zip)===DEPLOY_HASH,'ARCHIVE_HASH');
 const deployApp=live.existingApps.find(a=>a.name==='Card_Stack_SFAPP');need(deployApp?.id===normalizeId(args.auth.jwtOffProof.appId)&&deployApp.policies.jwtEnabled===false,'FRESH_AUTH');
 args.store.create('deploy-attempt-private.json',{at:new Date(args.now()).toISOString(),binding:b.binding,zipHash:DEPLOY_HASH,...live.identity});
 // Attempt remains exclusive even if enqueue throws before or after accepting a server job.
 let result;try{result=await args.adapter.enqueue(args.artifacts.zip,{checkOnly:false,rollbackOnError:true,singlePackage:true,testLevel:'RunSpecifiedTests',runTests:['CardstackCanonicalProbeTest']});}catch{throw Error('DEPLOYMENT_OUTCOME_UNRESOLVED');}
 let job;try{job=normalizeId(result.id);}catch{throw Error('DEPLOYMENT_OUTCOME_UNRESOLVED');}
 args.store.create('deploy-job-private.json',{id:job,binding:b.binding,...live.identity});return {success:true,deploymentQueued:true,artifactHashMatches:true,duplicateSubmissionBlocked:true,jwtRestorationRequired:true};
});}
function exactTests(result,methods){
 const expected=methods||loadArtifacts(path.resolve(__dirname,'..')).testMethods;
 const successes=list(result?.successes);return list(result?.failures).length===0&&successes.length===60&&expected.length===60&&new Set(expected).size===60&&expected.every(m=>successes.filter(s=>s.name==='CardstackCanonicalProbeTest'&&s.methodName===m).length===1);
}
function classification(message){
 const s=typeof message==='string'?message:'';
 if(/invalid type|type is not visible/i.test(s))return 'invalid-type';
 if(/unexpected token|expecting|syntax error/i.test(s))return 'syntax';
 if(/invalid field|no such column|unknown property/i.test(s))return 'unknown-field';
 if(/does not exist|incorrect signature|method is not visible/i.test(s))return 'method-signature';
 if(/insufficient|permission|access denied/i.test(s))return 'permission-denied';
 if(/assert|expected.*actual/i.test(s))return 'test-assertion';return 'other';
}
function sanitizeResult(r,methods){
 const allowedMethods=methods||loadArtifacts(path.resolve(__dirname,'..')).testMethods;
 const failures=[...list(r?.details?.componentFailures),...list(r?.details?.runTestResult?.failures)].map(f=>{
  const v={category:classification(f.problem||f.message)};const name=f.fullName||f.name;if(NAMES.includes(name))v.name=name;
  if(v.name&&Number.isInteger(Number(f.lineNumber))&&Number(f.lineNumber)>0&&Number(f.lineNumber)<100000)v.line=Number(f.lineNumber);
  if(v.name==='CardstackCanonicalProbeTest'&&allowedMethods.includes(f.methodName))v.method=f.methodName;return v;
 });
 const value={done:r?.done===true,success:r?.success===true,status:['Pending','InProgress','Succeeded','Failed','Canceled','Canceling'].includes(r?.status)?r.status:'other',exactSixtyTestsPassed:exactTests(r?.details?.runTestResult,allowedMethods),failures};
 for(const k of ['numberComponentsTotal','numberComponentErrors','numberTestErrors','numberTestsCompleted'])if(Number.isInteger(Number(r?.[k]))&&Number(r[k])>=0)value[k]=Number(r[k]);return value;
}
async function status(args){return withLock(args,async()=>{
 const identity=await authority(args);need(args.store.exists('deploy-job-private.json'),'KNOWN_JOB_REQUIRED');const b=args.store.read('baseline-private.json'),job=args.store.read('deploy-job-private.json');
 need(b.binding===digest(b.snapshot)&&job.binding===b.binding&&equal(identity,{org:normalizeId(job.org),actor:normalizeId(job.actor)}),'ACTOR_BINDING');
 let result;try{result=await args.adapter.status(normalizeId(job.id),true,true);}catch{throw Error('STATUS_UNRESOLVED');}
 if(result.id)need(normalizeId(result.id)===normalizeId(job.id),'JOB_BINDING');
 const filename='deploy-status-'+args.now()+'-'+crypto.randomBytes(6).toString('hex')+'-private.json';
 args.store.create(filename,{binding:b.binding,jobId:normalizeId(job.id),checkedAt:new Date(args.now()).toISOString(),result});
 const safe=sanitizeResult(result,args.artifacts.testMethods);
 if(safe.done&&safe.success&&safe.exactSixtyTestsPassed&&safe.failures.length===0&&Number(result.numberTestErrors)===0&&Number(result.numberComponentErrors)===0&&Number(result.numberTestsCompleted)===60&&!args.store.exists('deploy-exact-tests-private.json'))args.store.create('deploy-exact-tests-private.json',{binding:b.binding,jobId:normalizeId(job.id),statusRecord:filename,exactSixtyTestsPassed:true});
 return safe;
});}
function minimalSet(metadata){
 secretFree(metadata);need(metadata?.fullName==='Cardstack_Canonical_Probe'&&metadata.label==='Cardstack Canonical Probe','MINIMAL_PERMISSION_SET');
 const allowed=new Set(['fullName','label','classAccesses','userPermissions','hasActivationRequired','description']);
 const emptyFields=new Set(['applicationVisibilities','customMetadataTypeAccesses','customPermissions','externalDataSourceAccesses','fieldPermissions','flowAccesses','objectPermissions','pageAccesses','recordTypeVisibilities','tabSettings']);
 need(Object.keys(metadata).every(k=>allowed.has(k)||(emptyFields.has(k)&&Array.isArray(metadata[k])&&metadata[k].length===0))&&metadata.hasActivationRequired!==true&&metadata.hasActivationRequired!=='true','MINIMAL_PERMISSION_SET');
 need(equal(list(metadata.classAccesses),[{apexClass:'CardstackCanonicalProbe',enabled:true}])&&equal(list(metadata.userPermissions),[{name:'ApiEnabled',enabled:true}]),'MINIMAL_PERMISSION_SET');
}
function guestMetadataEqual(a,b){
 const shape=value=>Array.isArray(value)?['array',...value.map(shape).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]:value&&typeof value==='object'?['object',...Object.keys(value).sort().map(key=>[key,shape(value[key])])]:[typeof value,value];
 return JSON.stringify(shape(a))===JSON.stringify(shape(b));
}
function validateGuestProfileMetadata(original,actual){
 const names=NAMES.slice(0,2),before=list(original?.classAccesses);
 need(original&&actual&&typeof actual==='object'&&!Array.isArray(actual)&&Array.isArray(actual.classAccesses)&&before.every(row=>!names.includes(row?.apexClass)),'GUEST_PROFILE_COLLATERAL');
 const expected=structuredClone(original);expected.classAccesses=[...before,...names.map(apexClass=>({apexClass,enabled:false}))];
 // Compare complete metadata without the record helpers' attributes omission.
 need(guestMetadataEqual(actual,expected),'GUEST_PROFILE_COLLATERAL');

 const pages=list(actual.pageAccesses).filter(row=>row?.apexPage==='CardstackSiteAuthProbeHome');
 need(pages.length<=1&&pages.every(row=>equal(row,{apexPage:'CardstackSiteAuthProbeHome',enabled:false})),'GUEST_PROFILE_COLLATERAL');
}
async function verifyInstalled(args){return withLock(args,async()=>{
 need(!args.store.exists('owned-components-private.json'),'EXISTING_RECORD');
 need(args.store.exists('deploy-exact-tests-private.json'),'EXACT_TESTS_REQUIRED');const identity=await authority(args),b=args.store.read('baseline-private.json'),gate=args.store.read('deploy-exact-tests-private.json'),job=args.store.read('deploy-job-private.json');
 need(b.binding===digest(b.snapshot)&&gate.binding===b.binding&&job.binding===b.binding&&gate.jobId===normalizeId(job.id)&&equal(identity,b.snapshot.identity),'ACTOR_BINDING');
 const raw=await args.adapter.installed();need(raw?.classes?.length===2&&equal(raw.classes.map(r=>r.name),NAMES.slice(0,2)),'INSTALLED_COMPONENTS');
 const classes=raw.classes.map(r=>{
  need(typeof r.source==='string'&&Number(r.apiVersion)===67&&r.status==='Active','CLASS_SOURCE');
  const frozen=fs.readFileSync(path.join(args.artifacts.root,'classes',r.name+'.cls'),'utf8');need(sha(frozen)===args.artifacts.sourceHashes['classes/'+r.name+'.cls'],'SOURCE_HASH');
  need(r.source===frozen||(frozen.endsWith('\n')&&r.source===frozen.slice(0,-1)),'CLASS_SOURCE');
  return {id:normalizeId(r.id),name:r.name,bodySha256:sha(r.source),frozenSourceSha256:sha(frozen),apiVersion:67};
 });
 const resource=raw.resource;need(resource?.name===NAMES[2]&&Buffer.isBuffer(resource.bytes)&&sha(resource.bytes)===args.artifacts.sourceHashes['staticresources/'+NAMES[2]+'.resource']&&resource.contentType==='text/html'&&resource.cacheControl==='Private','RESOURCE_SOURCE');
 const ps=raw.permissionSet;need(ps?.name===NAMES[3],'MINIMAL_PERMISSION_SET');minimalSet(ps.metadata);
 const owned={version:1,binding:b.binding,...identity,classes,resource:{id:normalizeId(resource.id),name:resource.name,sha256:sha(resource.bytes),contentType:resource.contentType,cacheControl:resource.cacheControl},permissionSet:{id:normalizeId(ps.id),name:ps.name,metadata:ps.metadata,digest:digest(ps.metadata)}};
 const currentSnapshot=await args.adapter.snapshot(identity);validateGuestProfileMetadata(b.snapshot.guestProfile.metadata,currentSnapshot.guestProfile?.metadata);
 const live=validateSnapshot(currentSnapshot,identity,args.expected,true);
 need(equal(live.collisions.classes.map(r=>({Id:r.Id,Name:r.Name})),classes.map(r=>({Id:r.id,Name:r.name})))&&equal(live.collisions.resources.map(r=>({Id:r.Id,Name:r.Name})),[{Id:owned.resource.id,Name:owned.resource.name}])&&equal(live.collisions.permissionSets.map(r=>({Id:r.Id,Name:r.Name})),[{Id:owned.permissionSet.id,Name:owned.permissionSet.name}]),'INSTALLED_COMPONENTS');
 // Deployment may add only access to the two new classes on the current admin profile.
 // Any other reference is retained for root review rather than silently excluded.
 const expectedRefs=list(live.references.records);need(expectedRefs.every(r=>
  (r.ownerType==='Profile'&&r.ownerId===live.operator.ProfileId&&r.entityType==='ApexClass'&&classes.some(c=>c.id===r.entityId)&&r.enabled===true)||
  (r.ownerType==='PermissionSet'&&r.ownerId===owned.permissionSet.id&&r.entityType==='ApexClass'&&r.entityId===classes.find(c=>c.name==='CardstackCanonicalProbe').id&&r.enabled===true)||
  (r.ownerType==='ApexClass'&&classes.some(c=>c.id===r.ownerId)&&((r.entityType==='ApexClass'&&classes.some(c=>c.id===r.entityId))||(r.entityType==='StaticResource'&&r.entityId===owned.resource.id)))
 ),'DEPLOY_REFERENCE_REVIEW_REQUIRED');
 owned.guestProfileMetadata=structuredClone(currentSnapshot.guestProfile.metadata);owned.guestProfileMetadataDigest=digest(owned.guestProfileMetadata);
 const stable=structuredClone(live);stable.collisions=b.snapshot.collisions;stable.references=b.snapshot.references;stable.guestProfile.metadata=structuredClone(b.snapshot.guestProfile.metadata);
 // Entire profile metadata must be unchanged except classAccesses for the exact deleted classes.
 const baselineClasses=list(b.snapshot.operator.profileMetadata.classAccesses),currentClasses=list(stable.operator.profileMetadata.classAccesses);
 need(equal(currentClasses.filter(a=>!NAMES.slice(0,2).includes(a.apexClass)),baselineClasses)&&currentClasses.filter(a=>NAMES.slice(0,2).includes(a.apexClass)).every(a=>a.enabled===true),'DEPLOY_PROFILE_DRIFT');
 if('classAccesses' in b.snapshot.operator.profileMetadata)stable.operator.profileMetadata.classAccesses=baselineClasses;else delete stable.operator.profileMetadata.classAccesses;
 await verifyDrift(b.snapshot,stable,args.auth,args);
 owned.references=expectedRefs;owned.operatorProfileMetadata=live.operator.profileMetadata;args.store.create('owned-components-private.json',owned);
 return {success:true,installedSourcesVerified:true,resourceHashVerified:true,minimalPermissionSetVerified:true,exactSixtyTestsPassed:true,ownedComponentsCaptured:4,profileCollateralBound:true};
});}
module.exports={guestMetadataEqual,validateGuestProfileMetadata,normalizeId,normalizeRecords,secretFree,loadArtifacts,storeAt,snapshot,preflight,deploy,status,verifyInstalled,exactTests,sanitizeResult,validateSnapshot,authority,freshAuth,canonical,equal,digest,sha,DEPLOY_HASH,CLEANUP_HASH,PRIVATE_DIR};
