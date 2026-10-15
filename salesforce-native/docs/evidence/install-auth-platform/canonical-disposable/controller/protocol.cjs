'use strict';
// Fixed synthetic protocol cases; root alone supplies current guarded authority
// and invokes measurement. No auth/private IO/network side effects on import.
const {isDeepStrictEqual:eq}=require('node:util');
const {normalizeId}=require('./core.cjs');
const {validateObservation}=require('../contract.cjs');
const {createBoundedTransport,validatePins,ROOT,PREFIX,URI}=require('./protocol-transport.cjs');
const HASH='2ca5d8564f646d661763dfc924d49133ad66e43d195f990a690d47eb73ea758f';
const VALUES={text:'café ✓ "quoted"',amount:0,accepted:false,choice:'beta',rating:'hot',notes:'first\nsecond',enabled:false};
const need=(v,c)=>{if(!v)throw Error(c);};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const keys=(x,ks)=>object(x)&&eq(Object.keys(x).sort(),ks.slice().sort());
function fixedCases(){
 const cases=[];
 for(const client of ['claude','chatgpt']){
  const path=ROOT+client+'/mcp',metadata=ROOT+client+'/metadata';let nextId=1;
  const add=(name,stage,request,extra={})=>cases.push({id:client+'.'+name,client,stage,request,...extra});
  const rpc=(name,stage,method,params,extra={})=>{const id=nextId++;add(name,stage,{auth:'named',method:'POST',path,body:JSON.stringify({jsonrpc:'2.0',id,method,...(params?{params}:{})}),...(stage==='html'?{large:true}:{})},{rpcId:id,...extra});};
  add('metadata','metadata',{auth:'public',method:'GET',path:metadata});
  add('hostile-metadata','metadata',{auth:'public',method:'GET',path:metadata,hostile:true});
  add('guest-mcp','challenge',{auth:'public',method:'GET',path});
  add('hostile-challenge','challenge',{auth:'public',method:'GET',path,hostile:true});
  for(const auth of ['public','fabricated'])for(const method of ['tools/list','resources/read'])add(auth+'-'+method.replace('/','-'),'challenge',{auth,method:'POST',path,body:JSON.stringify({jsonrpc:'2.0',id:nextId++,method,...(method==='resources/read'?{params:{uri:URI}}:{})})});
  const negatives=[['case',client==='claude'?'Claude/mcp':'chatgpt/Metadata'],['nested',client+'/nested/mcp'],['unknown','unknown/mcp'],['encoded',client+'/%6dcp'],['extra',client+'/mcp/extra'],['query',client+'/mcp?unexpected=1']];
  for(const [name,suffix] of negatives)add('negative-'+name,'invalid-route',{auth:'named',method:'GET',path:ROOT+suffix});
  add('http-metadata','http-handling',{auth:'public',method:'GET',path:metadata,target:'http-negative'});
  add('non-site','non-site',{auth:'named',method:'POST',path,target:'non-site',body:JSON.stringify({jsonrpc:'2.0',id:nextId++,method:'ping'})});
  for(const method of ['GET','DELETE'])add('method-'+method.toLowerCase(),'method-denied',{auth:'named',method,path});
  for(const version of ['2025-06-18','2025-11-25'])rpc('initialize-'+version,'initialize','initialize',{protocolVersion:version},{protocolVersion:version});
  add('notification','notification',{auth:'named',method:'POST',path,body:'{"jsonrpc":"2.0","method":"notifications/initialized"}'});
  const supported=[['ping','ping','ping'],['tools','tools','tools/list'],['resources','resources','resources/list'],['html','html','resources/read',{uri:URI}],['open','open','tools/call',{name:'open_cardstack_apex_probe',arguments:{}}],['echo','echo','tools/call',{name:'echo_cardstack_values',arguments:VALUES},{expectedValues:VALUES}],['empty-echo','echo','tools/call',{name:'echo_cardstack_values',arguments:{...VALUES,text:''}},{expectedValues:{...VALUES,text:''}}]];
  for(const args of supported)rpc(...args);
  add('invalid-json','rpc-error',{auth:'named',method:'POST',path,body:'{'},{rpcId:null,code:-32700,message:'Invalid JSON request'});
  add('batch','rpc-error',{auth:'named',method:'POST',path,body:'[]'},{rpcId:null,code:-32600,message:'Invalid protocol request'});
  rpc('unknown-method','rpc-error','unknown/synthetic',undefined,{code:-32601,message:'Unknown method'});
  rpc('unknown-resource','rpc-error','resources/read',{uri:'ui://unknown-synthetic'},{code:-32602,message:'Unknown resource'});
  for(const version of ['2025-06-18','2025-11-25'])rpc('repeat.initialize-'+version,'initialize','initialize',{protocolVersion:version},{protocolVersion:version});
  add('repeat.notification','notification',{auth:'named',method:'POST',path,body:'{"jsonrpc":"2.0","method":"notifications/initialized"}'});
  for(const args of supported)rpc('repeat.'+args[0],...args.slice(1));
 }
 return cases;
}
const FIXED=fixedCases(),CASE_IDS=FIXED.map(c=>c.id);
const SOURCES=['offline-injected','root-live-http'];
const CODES=['CONTRACT_MATCH','CONTRACT_MISMATCH','CONTEXT_REJECTED','TRANSPORT_FAILURE','CONSUMER_TIMEOUT','BODY_LIMIT','PROVIDER_REDIRECT','PROVIDER_HTML','PROVIDER_DENIAL','HTTP_RESPONSE_UNCLASSIFIED'];
const LIMITATIONS=['NETWORK_ABORT_UNVERIFIED','PROTOCOL_REPEAT_ONLY'];
function validateMeasurementReceipt(r){
 const fields=['schemaVersion','evidenceSource','liveExecution','complete','allCasesPass','requiredCaseCount','coveredCaseIds','cases','limitations'];
 const time=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x)&&Number.isFinite(Date.parse(x));
 need(keys(r,fields)&&r.schemaVersion===1&&SOURCES.includes(r.evidenceSource)&&r.liveExecution===(r.evidenceSource==='root-live-http')&&r.requiredCaseCount===CASE_IDS.length&&Array.isArray(r.coveredCaseIds)&&new Set(r.coveredCaseIds).size===r.coveredCaseIds.length&&r.coveredCaseIds.every(x=>CASE_IDS.includes(x))&&Array.isArray(r.cases)&&r.cases.every(object)&&eq(r.cases.map(x=>x.id),r.coveredCaseIds)&&eq(r.limitations,LIMITATIONS),'PROTOCOL_RECEIPT_REJECTED');
 for(const c of r.cases){const fixed=FIXED.find(f=>f.id===c.id);need(keys(c,['id','stage','status','source','code','startedAt','endedAt','attempts'])&&c.stage===fixed.stage&&['Pass','Fail','Unknown'].includes(c.status)&&c.source===r.evidenceSource&&CODES.includes(c.code)&&time(c.startedAt)&&time(c.endedAt)&&Date.parse(c.endedAt)>=Date.parse(c.startedAt)&&[0,1].includes(c.attempts)&&((c.code==='CONTRACT_MATCH')===(c.status==='Pass'))&&((c.code==='CONTRACT_MISMATCH')===(c.status==='Fail'))&&(c.attempts===0?c.code==='CONTEXT_REJECTED':c.code!=='CONTEXT_REJECTED'),'PROTOCOL_RECEIPT_REJECTED');}
 need(r.complete===(r.coveredCaseIds.length===CASE_IDS.length)&&r.allCasesPass===(r.complete&&r.cases.every(c=>c.status==='Pass')),'PROTOCOL_RECEIPT_REJECTED');return r;
}
function bindProof(raw,pins){
 need(object(raw),'PROTOCOL_CONTEXT_REJECTED');
 const same=x=>object(x)&&normalizeId(x.org)===pins.org&&normalizeId(x.actor)===pins.actor;
 need(same(raw.identity)&&same(raw.ownership)&&raw.ownership.verified===true&&normalizeId(raw.ownership.siteId)===pins.siteId&&same(raw.testGate)&&raw.testGate.exactSixtyTestsPassed===true&&same(raw.currentUse)&&raw.currentUse.effective===true&&raw.currentUse.permission==='Cardstack_Use_Connections'&&raw.currentUse.hasActivationRequired===false&&normalizeId(raw.activeSite?.siteId)===pins.siteId&&raw.activeSite.active===true&&raw.activeSite.savedVerified===true&&raw.siteBase===pins.siteBase&&raw.issuer===pins.issuer,'PROTOCOL_CONTEXT_REJECTED');
}
function classify(entry,response,pins){
 if(response.code)return {status:'Unknown',code:response.code};
 const jsonContentType=/^application\/json(?:;|$)/i.test(response.headers?.['content-type']||'');
 // The frozen checker permits decoded null for notifications; the measured
 // transport must require an actually empty raw response, including whitespace.
 if(entry.stage==='notification'&&response.status===202&&response.body!=='')return {status:'Fail',code:'CONTRACT_MISMATCH'};
 let body;try{body=response.body===''?'':JSON.parse(response.body);}catch{return {status:'Unknown',code:'PROVIDER_DENIAL'};}
 if(entry.stage==='http-handling')return {status:'Unknown',code:'HTTP_RESPONSE_UNCLASSIFIED'};
 if(entry.stage==='non-site')return response.status===503&&jsonContentType&&eq(body,{error:'public_context_unavailable'})?{status:'Pass',code:'CONTRACT_MATCH'}:{status:'Unknown',code:'PROVIDER_DENIAL'};
 const o={...entry,id:entry.rpcId,response:{status:response.status,body,headers:response.headers}};
 let pass;
 try{pass=validateObservation(o,{client:entry.client,base:pins.siteBase,prefix:PREFIX,issuer:pins.issuer,htmlHash:HASH}).status==='Pass';}catch{pass=false;}
 if(['initialize','ping','tools','resources','html','open','echo'].includes(entry.stage))pass=pass&&keys(body,['jsonrpc','id','result'])&&body.jsonrpc==='2.0'&&eq(body.id,entry.rpcId);
 if(entry.stage==='rpc-error')pass=pass&&body.error.message===entry.message;
 if(entry.stage==='html')pass=pass&&Buffer.byteLength(body?.result?.contents?.[0]?.text||'')===309866;
 pass=pass&&jsonContentType;
 if(pass)return {status:'Pass',code:'CONTRACT_MATCH'};
 // Recognizable fixture shapes fail their exact contract; provider handling is
 // separate Unknown. Never turn a platform blocking status into fixture proof.
 const fixtureLike=object(body)&&(Object.hasOwn(body,'jsonrpc')||Object.hasOwn(body,'result')||Object.hasOwn(body,'resource')||['authentication_required','unknown_probe_route','method_not_allowed','cardstack_use_required'].includes(body.error));
 return fixtureLike?{status:'Fail',code:'CONTRACT_MISMATCH'}:{status:'Unknown',code:'PROVIDER_DENIAL'};
}
function createMeasurement({pins:rawPins,connection,sdk,verifyCurrent,evidenceSource,now=()=>Date.now()}){
 need(object(rawPins)&&typeof verifyCurrent==='function'&&SOURCES.includes(evidenceSource)&&typeof now==='function','PROTOCOL_INPUT_REJECTED');
 if(evidenceSource==='root-live-http'){
  const lib='/usr/local/lib/sf/node_modules/@jsforce/jsforce-node/lib/';let installed;
  try{installed={HttpApi:require(lib+'http-api').HttpApi,request:require(lib+'request').default,StreamPromise:require(lib+'util/promise').StreamPromise,getLogger:require(lib+'util/logger').getLogger};}catch{throw Error('PROTOCOL_LIVE_SDK_REQUIRED');}
  need(Object.keys(installed).every(k=>sdk?.[k]===installed[k]),'PROTOCOL_LIVE_SDK_REQUIRED');
 }
 const pins={org:normalizeId(rawPins.org),actor:normalizeId(rawPins.actor),siteId:normalizeId(rawPins.siteId),siteBase:rawPins.siteBase,issuer:rawPins.issuer};validatePins(pins.siteBase,pins.issuer);
 const transport=createBoundedTransport({connection,sdk,...pins}),covered=new Map();let busy=false;
 const receipt=()=>validateMeasurementReceipt({schemaVersion:1,evidenceSource,liveExecution:evidenceSource==='root-live-http',complete:covered.size===CASE_IDS.length,allCasesPass:covered.size===CASE_IDS.length&&[...covered.values()].every(c=>c.status==='Pass'),requiredCaseCount:CASE_IDS.length,coveredCaseIds:[...covered.keys()],cases:[...covered.values()].map(c=>({...c})),limitations:[...LIMITATIONS]});
 async function runCases(ids){
  need(!busy,'PROTOCOL_MEASUREMENT_BUSY');need(Array.isArray(ids)&&ids.length>0&&ids.length<=CASE_IDS.length&&new Set(ids).size===ids.length&&ids.every(x=>CASE_IDS.includes(x)),'PROTOCOL_CASE_SELECTION');need(ids.every(x=>!covered.has(x)),'PROTOCOL_CASE_ALREADY_ATTEMPTED');busy=true;
  try{for(const caseId of ids){const entry=FIXED.find(c=>c.id===caseId),startedAt=new Date(now()).toISOString();let attempts=0,outcome;
   try{bindProof(await verifyCurrent(),pins);}catch{outcome={status:'Unknown',code:'CONTEXT_REJECTED'};}
   if(!outcome){attempts=1;try{outcome=classify(entry,await transport.request(entry.request),pins);}catch{outcome={status:'Unknown',code:'TRANSPORT_FAILURE'};}}
   covered.set(caseId,{id:caseId,stage:entry.stage,...outcome,source:evidenceSource,startedAt,endedAt:new Date(now()).toISOString(),attempts});
  }return receipt();}finally{busy=false;}
 }
 return {caseIds:Object.freeze([...CASE_IDS]),runCases,runCase:id=>runCases([id]),receipt};
}
function aggregateReceipts(receipts){
 need(Array.isArray(receipts)&&receipts.length>0&&receipts.length<=CASE_IDS.length,'PROTOCOL_RECEIPT_REJECTED');
 const validated=receipts.map(validateMeasurementReceipt),source=validated[0].evidenceSource,cases=[],seen=new Set();
 for(const r of validated){need(r.evidenceSource===source,'PROTOCOL_RECEIPT_SOURCE_MISMATCH');for(const c of r.cases){need(!seen.has(c.id),'PROTOCOL_RECEIPT_DUPLICATE');seen.add(c.id);cases.push({...c});}}
 return validateMeasurementReceipt({schemaVersion:1,evidenceSource:source,liveExecution:source==='root-live-http',complete:seen.size===CASE_IDS.length,allCasesPass:seen.size===CASE_IDS.length&&cases.every(c=>c.status==='Pass'),requiredCaseCount:CASE_IDS.length,coveredCaseIds:cases.map(c=>c.id),cases,limitations:[...LIMITATIONS]});
}
module.exports={createMeasurement,validateMeasurementReceipt,aggregateReceipts};
