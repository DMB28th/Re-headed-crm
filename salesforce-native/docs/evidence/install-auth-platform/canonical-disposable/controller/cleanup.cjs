'use strict';
// Import-only destructive controller. Root retains JWT UI/login/finally ownership.
const core=require('./core.cjs'),access=require('./access.cjs'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {equal,digest,sha,normalizeId:id,normalizeRecords,secretFree}=core;
const need=(v,c)=>{if(!v)throw Error(c);};
function assertArchive(zip){
 need(Buffer.isBuffer(zip)&&sha(zip)===core.CLEANUP_HASH,'CLEANUP_ARCHIVE_HASH');let at=0;const files={};
 while(zip.readUInt32LE(at)===0x04034b50){
  const flags=zip.readUInt16LE(at+6),method=zip.readUInt16LE(at+8),size=zip.readUInt32LE(at+18),length=zip.readUInt16LE(at+26),extra=zip.readUInt16LE(at+28),name=zip.subarray(at+30,at+30+length).toString('utf8');
  need(flags===0&&[0,8].includes(method)&&!Object.hasOwn(files,name),'CLEANUP_MANIFEST');const start=at+30+length+extra,data=zip.subarray(start,start+size);files[name]=(method===8?zlib.inflateRawSync(data):data).toString('utf8');at=start+size;
 }
 need(equal(Object.keys(files),['destructiveChanges.xml','package.xml']),'CLEANUP_MANIFEST');
 const head='<Package xmlns="http://soap.sforce.com/2006/04/metadata">',tail='<version>67.0</version></Package>';
 const types='<types><members>CardstackCanonicalProbe</members><members>CardstackCanonicalProbeTest</members><name>ApexClass</name></types><types><members>CardstackCanonicalProbeUi</members><name>StaticResource</name></types><types><members>Cardstack_Canonical_Probe</members><name>PermissionSet</name></types>';
 need(files['destructiveChanges.xml'].trim()===head+types+tail&&files['package.xml'].trim()===head+tail,'CLEANUP_MANIFEST');return true;
}
async function preflight(args){return access.locked(args,async()=>{
 need(!args.store.exists('cleanup-preflight-private.json')&&!args.store.exists('cleanup-attempt-private.json'),'EXISTING_RECORD');const {b,o,p,j}=await access.context(args);need(equal(j.state,access.EMPTY),'ACCESS_REMOVAL_REQUIRED');assertArchive(args.artifacts.cleanup);await access.current(args,b,o,access.EMPTY);
 args.store.create('cleanup-preflight-private.json',{version:1,binding:b.binding,ownedDigest:digest(o),accessPreparationDigest:digest(p),journalDigest:j.previous,cleanupHash:core.CLEANUP_HASH,identity:b.snapshot.identity});
 return {success:true,cleanupPreflight:true,siteInactive:true,ownedAccessAbsent:true,exactFourComponentArchiveVerified:true};
});}
async function enqueue(args){return access.locked(args,async()=>{
 need(!args.store.exists('cleanup-attempt-private.json')&&!args.store.exists('cleanup-job-private.json'),'EXISTING_ATTEMPT');need(args.store.exists('cleanup-preflight-private.json'),'CLEANUP_PREFLIGHT_REQUIRED');
 const {b,o,p,j}=await access.context(args),pre=args.store.read('cleanup-preflight-private.json');need(equal(j.state,access.EMPTY)&&pre.binding===b.binding&&pre.ownedDigest===digest(o)&&pre.accessPreparationDigest===digest(p)&&pre.journalDigest===j.previous&&pre.cleanupHash===core.CLEANUP_HASH&&equal(pre.identity,b.snapshot.identity),'CLEANUP_PREFLIGHT_BINDING');
 core.freshAuth(args.auth,b.snapshot.identity,args.now());assertArchive(args.artifacts.cleanup);const current=await access.current(args,b,o,access.EMPTY,{auth:args.auth});
 const app=current.existingApps.find(a=>a.name==='Card_Stack_SFAPP');need(app?.policies?.jwtEnabled===false&&id(app.id)===id(args.auth.jwtOffProof.appId),'FRESH_AUTH');
 args.store.create('cleanup-attempt-private.json',{at:new Date(args.now()).toISOString(),binding:b.binding,preflightDigest:digest(pre),zipHash:core.CLEANUP_HASH,...b.snapshot.identity});
 let raw;try{raw=await args.adapter.enqueue(args.artifacts.cleanup,{checkOnly:false,rollbackOnError:true,singlePackage:true,testLevel:'NoTestRun'});}catch{throw Error('CLEANUP_OUTCOME_UNRESOLVED');}
 let job;try{job=id(raw.id);}catch{throw Error('CLEANUP_OUTCOME_UNRESOLVED');}
 args.store.create('cleanup-job-private.json',{id:job,binding:b.binding,...b.snapshot.identity});return {success:true,cleanupQueued:true,duplicateSubmissionBlocked:true,jwtRestorationRequired:true};
});}
async function jobContext(args,name){
 const b=access.baseline(args),identity=await core.authority(args);need(equal(identity,b.snapshot.identity),'ACTOR_BINDING');need(args.store.exists(name),'KNOWN_JOB_REQUIRED');const job=normalizeRecords(args.store.read(name));
 need(job.binding===b.binding&&equal(identity,{org:job.org,actor:job.actor}),'JOB_BINDING');id(job.id);return {b,job};
}
async function knownStatus(args,job){
 let raw;try{raw=await args.adapter.status(job.id,true,true);}catch{throw Error('STATUS_UNRESOLVED');}
 need(raw&&typeof raw.id==='string'&&id(raw.id)===job.id,'JOB_BINDING');const statuses=['Pending','InProgress','Succeeded','Failed','Canceled','Canceling'];need(statuses.includes(raw.status)&&typeof raw.done==='boolean'&&typeof raw.success==='boolean','STATUS_UNRESOLVED');
 const result={done:raw.done,success:raw.success,status:raw.status};for(const k of ['numberComponentErrors','numberTestErrors'])if(raw[k]!=null&&Number.isInteger(Number(raw[k]))&&Number(raw[k])>=0)result[k]=Number(raw[k]);
 return result;
}
async function status(args){return access.locked(args,async()=>{
 const {b,job}=await jobContext(args,'cleanup-job-private.json');const attempt=args.store.read('cleanup-attempt-private.json');need(attempt.binding===b.binding&&attempt.zipHash===core.CLEANUP_HASH&&equal({org:attempt.org,actor:attempt.actor},b.snapshot.identity),'JOB_BINDING');
 const result=await knownStatus(args,job),name='cleanup-status-'+args.now()+'-'+crypto.randomBytes(6).toString('hex')+'-private.json';
 args.store.create(name,{binding:b.binding,jobId:job.id,checkedAt:new Date(args.now()).toISOString(),result});
 if(result.done&&['Succeeded','Failed','Canceled'].includes(result.status)&&!args.store.exists('cleanup-terminal-private.json')){
  need(result.status==='Succeeded'?result.success&&result.numberComponentErrors===0&&result.numberTestErrors===0:result.success===false,'STATUS_UNRESOLVED');
  args.store.create('cleanup-terminal-private.json',{binding:b.binding,jobId:job.id,statusRecord:name,result});
 }
 return {...result,jwtRestorationRequired:true};
});}
function jwtOn(args,b,live){
 const proof=normalizeRecords(args.jwtOnProof);secretFree(proof);const attempt=args.store.read(args.store.exists('cleanup-attempt-private.json')?'cleanup-attempt-private.json':'deploy-attempt-private.json');
 const app=live.existingApps.find(a=>a.name==='Card_Stack_SFAPP'),age=args.now()-Date.parse(proof?.checkedAt);
 need(proof?.source==='operator-ui'&&proof.org===b.snapshot.identity.org&&proof.controller===b.snapshot.identity.actor&&proof.appName==='Card_Stack_SFAPP'&&proof.appId===app.id&&proof.jwtOn===true&&proof.savedVerified===true&&app.policies.jwtEnabled===true&&Number.isFinite(age)&&age>=0&&age<600000&&Date.parse(proof.checkedAt)>=Date.parse(attempt.at),'JWT_ON_PROOF_REQUIRED');return proof;
}
async function absence(args,b){
 const identity=await core.authority(args);need(equal(identity,b.snapshot.identity),'ACTOR_BINDING');const raw=normalizeRecords(await args.adapter.snapshot(identity));secretFree(raw);
 need(raw.existingApps.find(a=>a.name==='Card_Stack_SFAPP')?.policies.jwtEnabled===true,'JWT_ON_PROOF_REQUIRED');jwtOn(args,b,raw);
 const live=core.validateSnapshot(raw,identity,args.expected);await access.compareApps(args,b,live);need(equal(live,b.snapshot),'FINAL_BASELINE_DRIFT');return live;
}
async function finalize(args){return access.locked(args,async()=>{
 need(!args.store.exists('cleanup-final-private.json'),'EXISTING_RECORD');const {b,job}=await jobContext(args,'cleanup-job-private.json'),{o,p,j}=await access.context(args);need(equal(j.state,access.EMPTY),'ACCESS_REMOVAL_REQUIRED');
 need(args.store.exists('cleanup-terminal-private.json'),'KNOWN_TERMINAL_JOB_REQUIRED');const terminal=args.store.read('cleanup-terminal-private.json'),record=args.store.read(terminal.statusRecord);
 need(terminal.binding===b.binding&&terminal.jobId===job.id&&record.binding===b.binding&&record.jobId===job.id&&equal(terminal.result,record.result),'JOB_BINDING');
 const actual=await knownStatus(args,job);need(equal(actual,terminal.result)&&actual.done===true&&['Succeeded','Failed','Canceled'].includes(actual.status),'KNOWN_TERMINAL_JOB_REQUIRED');
 const live=await absence(args,b);
 need(typeof args.adapter.absenceReferences==='function','ABSENCE_REFERENCE_COLLECTOR_REQUIRED');
 const refs=normalizeRecords(await args.adapter.absenceReferences({identity:b.snapshot.identity,componentIds:[...o.classes.map(c=>c.id),o.resource.id,o.permissionSet.id]}));secretFree(refs);need(refs?.complete===true&&Array.isArray(refs.records)&&refs.records.length===0,'FINAL_REFERENCE_DRIFT');
 args.store.create('cleanup-final-private.json',{binding:b.binding,jobId:job.id,ownedDigest:digest(o),accessPreparationDigest:digest(p),journalDigest:j.previous,baselinePreserved:true,ownedComponentsAbsent:true,jwtOnProof:jwtOn(args,b,live)});
 return {success:true,ownedComponentsAbsent:true,siteInactive:true,ownedAccessAbsent:true,baselinePreserved:true,actualJwtOnVerified:true,cleanupJobSucceeded:actual.success};
});}
async function verifyFailedDeploymentAbsence(args){return access.locked(args,async()=>{
 need(!args.store.exists('owned-components-private.json')&&!args.store.exists('access-prepared-private.json')&&!args.store.exists('cleanup-attempt-private.json'),'FAILED_DEPLOYMENT_OWNERSHIP_CONFLICT');const {b,job}=await jobContext(args,'deploy-job-private.json');
 const attempt=args.store.read('deploy-attempt-private.json');need(attempt.binding===b.binding&&attempt.zipHash===core.DEPLOY_HASH&&equal({org:attempt.org,actor:attempt.actor},b.snapshot.identity),'JOB_BINDING');
 const known=await knownStatus(args,job);need(known.done===true&&known.success===false&&['Failed','Canceled'].includes(known.status),'KNOWN_FAILED_DEPLOYMENT_REQUIRED');
 // This independent complete exact-name snapshot is mandatory even with rollbackOnError.
 await absence(args,b);args.store.create('deploy-failed-absence-private.json',{binding:b.binding,jobId:job.id,knownStatus:known,baselinePreserved:true,ownedComponentsAbsent:true});
 return {success:true,cleanupSkippedAfterIndependentAbsence:true,ownedComponentsAbsent:true,baselinePreserved:true,siteInactive:true,actualJwtOnVerified:true};
});}
module.exports={assertArchive,preflight,enqueue,status,finalize,verifyFailedDeploymentAbsence};
