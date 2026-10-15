'use strict';
// Supplemental four-GET observation only. Import performs no IO or SDK loading.
const core=require('./core.cjs'),stage=require('./stage-c-session.cjs');
const {ROOT,validatePins}=require('./protocol-transport.cjs');
const need=(v,c)=>{if(!v)throw Error(c);};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const CASES=Object.freeze(['claude','chatgpt'].flatMap(client=>[
 Object.freeze({id:client+'.mcp',request:Object.freeze({auth:'named',method:'GET',path:ROOT+client+'/mcp'})}),
 Object.freeze({id:client+'.encoded-mcp',request:Object.freeze({auth:'named',method:'GET',path:ROOT+client+'/%6dcp'})})]));
const ERRORS=['authentication_required','unknown_probe_route','method_not_allowed','cardstack_use_required'];
const UNKNOWN=['TRANSPORT_FAILURE','CONSUMER_TIMEOUT','BODY_LIMIT','PROVIDER_REDIRECT','PROVIDER_HTML'];
function bindProof(raw,pins){
 const same=x=>object(x)&&core.normalizeId(x.org)===pins.org&&core.normalizeId(x.actor)===pins.actor;
 need(same(raw?.identity)&&same(raw.ownership)&&raw.ownership.verified===true&&core.normalizeId(raw.ownership.siteId)===pins.siteId&&same(raw.testGate)&&raw.testGate.exactSixtyTestsPassed===true&&same(raw.currentUse)&&raw.currentUse.effective===true&&raw.currentUse.permission==='Cardstack_Use_Connections'&&raw.currentUse.hasActivationRequired===false&&core.normalizeId(raw.activeSite?.siteId)===pins.siteId&&raw.activeSite.active===true&&raw.activeSite.savedVerified===true&&raw.siteBase===pins.siteBase&&raw.issuer===pins.issuer,'ROUTE_CONTEXT_REJECTED');
}
function classify(response){
 if(!object(response)||response.code){const code=UNKNOWN.includes(response?.code)?response.code:'TRANSPORT_FAILURE';return {httpStatus:'Unknown',statusAvailable:false,contentCategory:code==='PROVIDER_HTML'?'provider-html':code==='PROVIDER_REDIRECT'?'provider-redirect':'transport-unknown',fixtureError:'None',stopReason:code};}
 if(!Number.isInteger(response.status)||response.status<100||response.status>599||typeof response.body!=='string')return classify({code:'TRANSPORT_FAILURE'});
 const status={httpStatus:response.status,statusAvailable:true};
 if(!/^application\/json(?:;|$)/i.test(response.headers?.['content-type']||''))return {...status,contentCategory:'provider-nonjson',fixtureError:'None',stopReason:'PROVIDER_DENIAL'};
 let value;try{value=JSON.parse(response.body);}catch{return {...status,contentCategory:'invalid-json',fixtureError:'None',stopReason:'PROVIDER_DENIAL'};}
 const exact=object(value)&&Object.keys(value).length===1&&ERRORS.includes(value.error);
 return {...status,contentCategory:exact?'fixture-json':'nonfixture-json',fixtureError:exact?value.error:'None',stopReason:'None'};
}
function createRouteObservation({pins:rawPins,transport,verifyCurrent,store,binding,evidenceSource,sdk}){
 need(object(rawPins)&&typeof transport?.request==='function'&&typeof verifyCurrent==='function'&&['offline-injected','root-live-http'].includes(evidenceSource),'ROUTE_INPUT');
 if(evidenceSource==='root-live-http'){
  const lib='/usr/local/lib/sf/node_modules/@jsforce/jsforce-node/lib/';let installed;
  try{installed={HttpApi:require(lib+'http-api').HttpApi,request:require(lib+'request').default,StreamPromise:require(lib+'util/promise').StreamPromise,getLogger:require(lib+'util/logger').getLogger};}catch{throw Error('ROUTE_LIVE_SDK_REQUIRED');}
  need(Object.keys(installed).every(k=>sdk?.[k]===installed[k]),'ROUTE_LIVE_SDK_REQUIRED');
 }
 const pins={org:core.normalizeId(rawPins.org),actor:core.normalizeId(rawPins.actor),siteId:core.normalizeId(rawPins.siteId),siteBase:rawPins.siteBase,issuer:rawPins.issuer};validatePins(pins.siteBase,pins.issuer);
 function check(){try{stage.verifyStore(store);const b=store.read('baseline-private.json');need(typeof binding==='string'&&/^[a-f0-9]{64}$/.test(binding)&&b?.binding===binding&&b.binding===core.digest(b.snapshot)&&core.equal(b.snapshot.identity,{org:pins.org,actor:pins.actor})&&b.snapshot.site.Id===pins.siteId&&b.snapshot.siteContext.baseUrl===pins.siteBase,'ROUTE_BINDING');}catch{throw Error('ROUTE_BINDING');}}
 const exists=name=>{try{return store.exists(name);}catch{throw Error('ROUTE_PERSISTENCE_UNRESOLVED');}};
 const persist=(name,value)=>{try{store.create(name,value);}catch{throw Error('ROUTE_PERSISTENCE_UNRESOLVED');}};
 check();let busy=false,stopped=false,stopReason='None';const observed=[];
 const receipt=()=>({schemaVersion:1,evidenceSource,liveExecution:evidenceSource==='root-live-http',requiredCaseCount:4,complete:observed.length===4,cases:observed.map(c=>({...c})),stopReason,independentConsentRevocation:'Unknown',networkAbort:'Unknown'});
 async function run(...selection){
  need(selection.length===0,'ROUTE_CASE_SELECTION');need(!busy,'ROUTE_OBSERVATION_BUSY');need(!stopped,'ROUTE_OBSERVATION_STOPPED');busy=true;
  try{for(const entry of CASES){
   check();const prefix='route-observation-'+entry.id.replace('.','-');
   need(!exists(prefix+'-attempt-private.json')&&!exists(prefix+'-result-private.json'),'ROUTE_ALREADY_ATTEMPTED');
   try{bindProof(await verifyCurrent(),pins);check();}catch{stopped=true;stopReason='CONTEXT_REJECTED';return receipt();}
   // Exclusive durable attempt precedes the sole bounded transport call. A
   // failed result write still leaves the attempt prohibiting another request.
   persist(prefix+'-attempt-private.json',{caseId:entry.id,binding,evidenceSource,attempts:1});
   let outcome;try{outcome=classify(await transport.request(entry.request));}catch{outcome=classify({code:'TRANSPORT_FAILURE'});}
   const result={id:entry.id,...outcome};persist(prefix+'-result-private.json',result);observed.push(result);
   if(outcome.stopReason!=='None'){stopped=true;stopReason=outcome.stopReason;break;}
  }return receipt();}finally{busy=false;}
 }
 return Object.freeze({run,receipt});
}
module.exports={createRouteObservation};
