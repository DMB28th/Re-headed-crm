'use strict';
// Import-only: root supplies captures, readonly mapping and the reviewed single DELETE.
const core=require('./core.cjs'),access=require('./access.cjs');
const {secretFree,normalizeId:id}=core;
// Recovery provenance retains every returned key, including SDK attributes.
function shape(v){return Array.isArray(v)?['array',...v.map(shape).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]:v&&typeof v==='object'?['object',...Object.keys(v).sort().map(k=>[k,shape(v[k])])]:[typeof v,v];}
const digest=v=>core.sha(JSON.stringify(shape(v)));
const NAMES=Object.freeze(['BandwidthExceeded','Exception','FileNotFound','InMaintenance','Unauthorized']);
const PREPARED='site-collateral-prepared-private.json';
const need=(v,c)=>{if(!v)throw Error(c);};
const exact=(a,b)=>core.guestMetadataEqual(a,b);
function normalized(v,key=''){
 if(Array.isArray(v))return v.map(x=>normalized(x,key));
 if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,normalized(x,k)]));
 return v!=null&&/^(Id|id|org|actor|controller|targetOrgId|.*Id)$/.test(key)?id(v):v;
}
function keys(v,wanted){return v&&typeof v==='object'&&!Array.isArray(v)&&exact(Object.keys(v),wanted);}
function stamp(value,args){const age=args.now()-Date.parse(value);need(Number.isFinite(age)&&age>=0,'COLLATERAL_CAPTURE_TIME');}
function context(args){
 need(!args.store.exists('cleanup-attempt-private.json'),'CLEANUP_ALREADY_ATTEMPTED');
 const b=access.baseline(args),o=access.ownership(args,b),p=access.prepared(args,b,o),j=access.journal(args,p),pending=j.pending;
 need(pending?.operation==='activate'&&pending.result&&pending.nextState&&pending.state.active===false&&pending.state.assignment&&pending.state.ingress&&pending.state.page,'KNOWN_ACTIVATION_RESULT_REQUIRED');
 need(exact(pending.nextState,{...pending.state,active:true})&&exact(pending.input,{org:b.snapshot.identity.org,controller:b.snapshot.identity.actor,siteId:b.snapshot.site.Id,siteName:'CardstackAuthDiscoveryProbe',active:true}),'KNOWN_ACTIVATION_RESULT_REQUIRED');
 const r=pending.result;need(keys(r,['source','org','controller','siteId','active','savedVerified','checkedAt','intentDigest'])&&r.source==='operator-ui'&&r.org===pending.input.org&&r.controller===pending.input.controller&&r.siteId===pending.input.siteId&&r.active===true&&r.savedVerified===true&&r.intentDigest===pending.digest&&Date.parse(r.checkedAt)>=Date.parse(pending.at),'KNOWN_ACTIVATION_RESULT_REQUIRED');
 return {b,o,p,j};
}
function bound(c){return {baseline:c.b.binding,owned:digest(c.o),prepared:digest(c.p),accessJournal:c.j.previous,pending:digest(c.j.pending)};}
function projected(args,snapshot){return {...args,adapter:{...args.adapter,snapshot:async()=>structuredClone(snapshot)}};}
function expected(record,completed){
 const e=structuredClone(record.activeSnapshot);
 for(let i=completed;i<NAMES.length;i++){
  e.guestProfile.metadata.pageAccesses=e.guestProfile.metadata.pageAccesses.map(r=>r.apexPage===NAMES[i]?{apexPage:r.apexPage,enabled:true}:r);
  e.guestGrants.push(structuredClone(record.additions[i]));
 }
 return e;
}
async function check(args,c,record,completed){
 const identity=await core.authority(args);need(exact(identity,c.b.snapshot.identity),'ACTOR_BINDING');
 const raw=await args.adapter.snapshot(identity);secretFree(raw);const actual=normalized(raw),wanted=expected(record,completed);
 need(exact(actual,wanted),'COLLATERAL_STATE_DRIFT');
 // The unchanged access gate validates current source/Use/foundation/apps and all supported fields.
 await access.current(projected(args,record.activeSnapshot),c.b,c.o,c.j.pending.nextState);
 return actual;
}
async function prepare(args,input){return access.locked(args,async()=>{
 need(!args.store.exists(PREPARED),'EXISTING_RECORD');need(typeof args.operations?.removeGuestAccess==='function','ROOT_ACCESS_OPERATIONS_REQUIRED');
 const c=context(args);secretFree(input);need(keys(input,['beforeRecord','mappingRecord']),'COLLATERAL_CAPTURE_BINDING');
 const beforeRecord=normalized(input.beforeRecord),mappingRecord=normalized(input.mappingRecord);
 need(keys(beforeRecord,['checkedAt','intentDigest','snapshot'])&&beforeRecord.intentDigest===c.j.pending.digest,'COLLATERAL_CAPTURE_BINDING');
 stamp(beforeRecord.checkedAt,args);need(Date.parse(beforeRecord.checkedAt)>=Date.parse(c.j.pending.at)&&Date.parse(beforeRecord.checkedAt)<=Date.parse(c.j.pending.result.checkedAt),'COLLATERAL_CAPTURE_BINDING');
 await access.current(projected(args,beforeRecord.snapshot),c.b,c.o,c.j.pending.state);
 need(keys(mappingRecord,['source','checkedAt','identity','pages'])&&mappingRecord.source==='root-managed-readonly'&&exact(mappingRecord.identity,c.b.snapshot.identity)&&Array.isArray(mappingRecord.pages)&&mappingRecord.pages.length===5,'COLLATERAL_MAPPING');
 stamp(mappingRecord.checkedAt,args);need(Date.parse(mappingRecord.checkedAt)>=Date.parse(c.j.pending.result.checkedAt),'COLLATERAL_MAPPING');
 const pages=NAMES.map(name=>{const matches=mappingRecord.pages.filter(p=>p.Name===name);need(matches.length===1,'COLLATERAL_MAPPING');const p=matches[0];need(keys(p,['Id','Name','NamespacePrefix'])&&p.NamespacePrefix===null,'COLLATERAL_MAPPING');return p;});
 need(new Set(pages.map(p=>p.Id)).size===5,'COLLATERAL_MAPPING');mappingRecord.pages=pages;
 const activeSnapshot=structuredClone(beforeRecord.snapshot);activeSnapshot.site.Status='Active';activeSnapshot.siteMetadata.active=true;
 for(const name of NAMES){const rows=activeSnapshot.guestProfile.metadata.pageAccesses.filter(r=>r.apexPage===name);need(rows.length===1&&exact(rows[0],{apexPage:name,enabled:false}),'COLLATERAL_PAGE_BASELINE');}
 const identity=await core.authority(args);need(exact(identity,c.b.snapshot.identity),'ACTOR_BINDING');const raw=await args.adapter.snapshot(identity);secretFree(raw);const actual=normalized(raw);
 const forbidden=beforeRecord.snapshot.guestGrants.map(r=>r.SetupEntityId);forbidden.push(c.j.pending.state.ingress.SetupEntityId,c.j.pending.state.page.SetupEntityId);
 const existingIds=new Set(beforeRecord.snapshot.guestGrants.map(r=>r.Id)),additions=pages.map(p=>{
  need(!forbidden.includes(p.Id),'COLLATERAL_MAPPING');const matches=actual.guestGrants.filter(r=>r.SetupEntityId===p.Id);need(matches.length===1,'COLLATERAL_GRANT_SCOPE');const r=matches[0];
  need(keys(r,['Id','ParentId','SetupEntityId','SetupEntityType'])&&!existingIds.has(r.Id)&&r.ParentId===activeSnapshot.guestSet.Id&&r.SetupEntityType==='ApexPage','COLLATERAL_GRANT_SCOPE');return r;
 });
 need(new Set(additions.map(r=>r.Id)).size===5,'COLLATERAL_GRANT_SCOPE');
 const record={version:1,binding:bound(c),beforeRecord,mappingRecord,activeSnapshot,additions};
 await check(projected(args,actual),c,record,0);record.digest=digest(record);args.store.create(PREPARED,record);
 return {success:true,collateralPrepared:true,remaining:5};
});}
function journal(args,record){
 let seq=0,previous=digest(record),completed=0,pending=null;
 while(args.store.exists('site-collateral-event-'+(seq+1)+'-private.json')){
  const e=args.store.read('site-collateral-event-'+(++seq)+'-private.json');secretFree(e);
  need(e.seq===seq&&e.previous===previous&&e.preparedDigest===record.digest&&e.digest===digest(Object.fromEntries(Object.entries(e).filter(([k])=>k!=='digest'))),'COLLATERAL_JOURNAL_BINDING');
  if(e.kind==='intent'){need(!pending&&completed<5&&e.index===completed&&exact(e.input,record.additions[completed]),'COLLATERAL_JOURNAL_BINDING');pending=e;}
  else if(e.kind==='result'){need(pending&&!pending.result&&e.index===completed&&exact(e.result,{success:true}),'COLLATERAL_JOURNAL_BINDING');pending={...pending,result:e.result};}
  else if(e.kind==='verified'){need(pending?.result&&e.index===completed,'COLLATERAL_JOURNAL_BINDING');completed++;pending=null;}
  else throw Error('COLLATERAL_JOURNAL_BINDING');previous=e.digest;
 }
 return {seq,previous,completed,pending};
}
function append(args,record,j,event){const e={seq:j.seq+1,previous:j.previous,preparedDigest:record.digest,at:new Date(args.now()).toISOString(),...event};secretFree(e);e.digest=digest(e);args.store.create('site-collateral-event-'+e.seq+'-private.json',e);j.seq=e.seq;j.previous=e.digest;}
function loaded(args){const c=context(args),record=args.store.read(PREPARED);secretFree(record);need(record?.digest===digest(Object.fromEntries(Object.entries(record).filter(([k])=>k!=='digest')))&&exact(record.binding,bound(c)),'COLLATERAL_PREPARATION_BINDING');return {c,record,j:journal(args,record)};}
async function finish(args,c,record,j){await check(args,c,record,j.completed+1);if(j.completed===4)await access.current(args,c.b,c.o,c.j.pending.nextState);append(args,record,j,{kind:'verified',index:j.completed});return {success:true,collateralWriteVerified:true,remaining:4-j.completed};}
async function removeNext(args){return access.locked(args,async()=>{
 const {c,record,j}=loaded(args);need(!j.pending,'COLLATERAL_PENDING');need(j.completed<5,'COLLATERAL_COMPLETE');await check(args,c,record,j.completed);
 const input=record.additions[j.completed];append(args,record,j,{kind:'intent',index:j.completed,input});let raw;
 try{raw=await args.operations.removeGuestAccess(structuredClone(input));secretFree(raw);need(raw?.success===true&&(!raw.errors||(Array.isArray(raw.errors)&&raw.errors.length===0)),'COLLATERAL_RESULT');}catch{throw Error('COLLATERAL_OUTCOME_UNRESOLVED');}
 append(args,record,j,{kind:'result',index:j.completed,result:{success:true}});return finish(args,c,record,j);
});}
async function reconcile(args){return access.locked(args,async()=>{const {c,record,j}=loaded(args);need(j.pending?.result,'KNOWN_COLLATERAL_RESULT_REQUIRED');return {...await finish(args,c,record,j),reconciledByReadback:true};});}
module.exports={prepare,removeNext,reconcile};
