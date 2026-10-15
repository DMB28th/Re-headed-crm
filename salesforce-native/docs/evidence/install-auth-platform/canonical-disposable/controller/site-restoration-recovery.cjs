'use strict';
// Import-only. Reconciles a known ROOT restoration; never invokes UI or provider writes.
// Root supplies immutable intent/result and verifyRootRestorationEvidence({intent,result}).
// The root callback must verify its actual fixed private files, before-UI persistence,
// saved UI evidence and REST inactive readback. Its exact return schema appears below.
// Historical evidence never substitutes for fresh original access.current(active:false).
const core=require('./core.cjs'),access=require('./access.cjs');
const need=(v,c)=>{if(!v)throw Error(c);};
const exact=(a,b)=>core.guestMetadataEqual(a,b);
const KEYS={
 intent:['kind','version','org','controller','siteId','siteName','fromActive','toActive','baselineBinding','ownedDigest','accessPreparationDigest','priorJournalDigest','checkedAt'],
 result:['source','org','controller','siteId','active','savedVerified','checkedAt','intentDigest'],
 proof:['verified','intentDigest','resultDigest','intentPersistedBeforeUi','actualSavedUiVerified','restSiteInactiveVerified','identity','siteId']
};
const RECORD='site-restoration-recovery-private.json';
const keys=(v,wanted)=>v&&typeof v==='object'&&!Array.isArray(v)&&exact(Object.keys(v),wanted);
// Preserve every key, including attributes, in the internal recovery record's digest.
function shape(v){return Array.isArray(v)?['array',...v.map(shape).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]:v&&typeof v==='object'?['object',...Object.keys(v).sort().map(k=>[k,shape(v[k])])]:[typeof v,v];}
const strictDigest=v=>core.sha(JSON.stringify(shape(v)));
function closedActivation(args,seq){
 need(seq>=3,'CLOSED_ACTIVATION_REQUIRED');
 const end=args.store.read('access-event-'+seq+'-private.json'),result=args.store.read('access-event-'+(seq-1)+'-private.json'),intent=args.store.read('access-event-'+(seq-2)+'-private.json');
 need(end.kind==='verified'&&result.kind==='result'&&intent.kind==='intent'&&[end,result,intent].every(e=>e.operation==='activate')&&end.state.active===true&&intent.state.active===false&&exact(result.state,end.state)&&exact(end.state,{...intent.state,active:true}),'CLOSED_ACTIVATION_REQUIRED');
 const proof=result.result;need(keys(proof,KEYS.result)&&proof.source==='operator-ui'&&proof.savedVerified===true&&proof.active===true&&proof.intentDigest===intent.digest&&proof.org===intent.input.org&&proof.controller===intent.input.controller&&proof.siteId===intent.input.siteId&&Date.parse(proof.checkedAt)>=Date.parse(intent.at),'CLOSED_ACTIVATION_REQUIRED');
 return {state:end.state,head:end.digest,checkedAt:proof.checkedAt};
}
function context(args){
 need(!args.store.exists('cleanup-attempt-private.json'),'CLEANUP_ALREADY_ATTEMPTED');
 const b=access.baseline(args),o=access.ownership(args,b),p=access.prepared(args,b,o),j=access.journal(args,p);
 return {b,o,p,j};
}
function validateInput(args,c,input,activation){
 core.secretFree(input);need(keys(input,['intent','result'])&&keys(input.intent,KEYS.intent)&&keys(input.result,KEYS.result),'ROOT_RESTORATION_SCHEMA');
 const v=core.normalizeRecords(input),i=v.intent,r=v.result,who=c.b.snapshot.identity;
 need(i.kind==='ROOT_SITE_RESTORATION_INTENT'&&i.version===1&&i.org===who.org&&i.controller===who.actor&&i.siteId===c.b.snapshot.site.Id&&i.siteName==='CardstackAuthDiscoveryProbe'&&i.fromActive===true&&i.toActive===false&&i.baselineBinding===c.b.binding&&i.ownedDigest===core.digest(c.o)&&i.accessPreparationDigest===core.digest(c.p)&&i.priorJournalDigest===activation.head,'ROOT_RESTORATION_BINDING');
 need(r.source==='operator-ui'&&r.org===i.org&&r.controller===i.controller&&r.siteId===i.siteId&&r.active===false&&r.savedVerified===true&&r.intentDigest===core.digest(i),'KNOWN_ROOT_RESTORATION_REQUIRED');
 const before=Date.parse(i.checkedAt),after=Date.parse(r.checkedAt),active=Date.parse(activation.checkedAt);
 need([before,after,active,args.now()].every(Number.isFinite)&&before>=active&&after>before&&after<=args.now(),'ROOT_RESTORATION_CHRONOLOGY');
 return v;
}
async function evidence(args,c,input){
 need(typeof args.verifyRootRestorationEvidence==='function','ROOT_RESTORATION_VERIFIER_REQUIRED');let proof;
 try{proof=await args.verifyRootRestorationEvidence(structuredClone(input));}catch{throw Error('ROOT_RESTORATION_EVIDENCE_UNVERIFIED');}
 core.secretFree(proof);need(keys(proof,KEYS.proof)&&keys(proof.identity,['org','actor']),'ROOT_RESTORATION_EVIDENCE_UNVERIFIED');proof=core.normalizeRecords(proof);
 need(proof.verified===true&&proof.intentDigest===core.digest(input.intent)&&proof.resultDigest===core.digest(input.result)&&proof.intentPersistedBeforeUi===true&&proof.actualSavedUiVerified===true&&proof.restSiteInactiveVerified===true&&exact(proof.identity,c.b.snapshot.identity)&&proof.siteId===c.b.snapshot.site.Id,'ROOT_RESTORATION_EVIDENCE_UNVERIFIED');return proof;
}
function eventBody(record,index){
 const common={rootRestorationRecoveryDigest:record.digest};
 if(index===0)return {...common,kind:'intent',operation:'restore',input:{org:record.intent.org,controller:record.intent.controller,siteId:record.intent.siteId,siteName:record.intent.siteName,active:false},state:record.priorState};
 if(index===1)return {...common,kind:'result',operation:'restore',result:record.result,state:{...record.priorState,active:false}};
 return {...common,kind:'verified',operation:'restore',state:{...record.priorState,active:false}};
}
function verifyProgress(args,c,record){
 const count=c.j.seq-record.priorSeq;need(count>=0&&count<=3,'RESTORATION_JOURNAL_BINDING');
 for(let n=0;n<count;n++){
  const e=args.store.read('access-event-'+(record.priorSeq+n+1)+'-private.json');
  const body=Object.fromEntries(Object.entries(e).filter(([k])=>!['seq','previous','binding','at','digest'].includes(k)));
  need(exact(body,eventBody(record,n)),'RESTORATION_JOURNAL_BINDING');
 }
 if(count===3){need(!c.j.pending&&exact(c.j.state,{...record.priorState,active:false}),'RESTORATION_JOURNAL_BINDING');throw Error('RESTORATION_ALREADY_RECONCILED');}
 need(exact(c.j.state,record.priorState)&&(count===0?!c.j.pending&&c.j.previous===record.intent.priorJournalDigest:c.j.pending?.operation==='restore'),'RESTORATION_JOURNAL_BINDING');return count;
}
function append(args,c,body){
 const e={seq:c.j.seq+1,previous:c.j.previous,binding:c.p.binding,at:new Date(args.now()).toISOString(),...body};core.secretFree(e);e.digest=core.digest(e);
 args.store.create('access-event-'+e.seq+'-private.json',e);c.j.seq=e.seq;c.j.previous=e.digest;
}
async function reconcile(args,input){return access.locked(args,async()=>{
 const c=context(args),exists=args.store.exists(RECORD);let record,activation,priorSeq,count=0;
 if(exists){
  record=args.store.read(RECORD);core.secretFree(record);
  need(keys(record,['version','binding','priorSeq','priorState','intent','result','rootProof','freshReadbackCheckedAt','digest'])&&record.version===1&&record.digest===strictDigest(Object.fromEntries(Object.entries(record).filter(([k])=>k!=='digest')))&&record.binding===c.b.binding&&Number.isInteger(record.priorSeq),'RESTORATION_RECOVERY_BINDING');
  priorSeq=record.priorSeq;activation=closedActivation(args,priorSeq);need(exact(record.priorState,activation.state),'RESTORATION_RECOVERY_BINDING');count=verifyProgress(args,c,record);
 }else{
  need(!c.j.pending&&c.j.state.active===true&&c.j.state.assignment&&c.j.state.ingress&&c.j.state.page,'CLOSED_ACTIVATION_REQUIRED');priorSeq=c.j.seq;activation=closedActivation(args,priorSeq);need(c.j.previous===activation.head&&exact(c.j.state,activation.state),'CLOSED_ACTIVATION_REQUIRED');
 }
 const bound=validateInput(args,c,input,activation);if(exists)need(exact(record.intent,bound.intent)&&exact(record.result,bound.result),'RESTORATION_RECOVERY_BINDING');
 const identity=await core.authority(args);need(exact(identity,c.b.snapshot.identity),'ACTOR_BINDING');const proof=await evidence(args,c,bound);
 // No adapter substitution, cached snapshot projection, metadata fallback or relaxed guard.
 // Failure here leaves the existing journal and recovery record completely unchanged.
 await access.current(args,c.b,c.o,{...activation.state,active:false});
 if(!exists){record={version:1,binding:c.b.binding,priorSeq,priorState:activation.state,...bound,rootProof:proof,freshReadbackCheckedAt:new Date(args.now()).toISOString()};record.digest=strictDigest(record);args.store.create(RECORD,record);}
 // Only file appends follow known outcome + fresh proof. Interrupted appends may
 // resume by the exact same provenance; no UI or provider mutation can be repeated.
 for(let n=count;n<3;n++)append(args,c,eventBody(record,n));
 return {success:true,knownRootRestorationReconciled:true,siteInactive:true,ownedAccessPreserved:true};
});}
module.exports={reconcile};
