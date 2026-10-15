'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const core=require('./core.cjs');
const pins={org:'00D000000000001EAA',actor:'005000000000001AAA',siteId:'0DM000000000001GAA',siteBase:'https://fixture.example/cardstackauthprobe',issuer:'https://fixture.my.salesforce.com'};
const ids=['claude.mcp','claude.encoded-mcp','chatgpt.mcp','chatgpt.encoded-mcp'];
function fixture(responses=[],installed){
 const snapshot={identity:{org:pins.org,actor:pins.actor},site:{Id:pins.siteId},siteContext:{baseUrl:pins.siteBase}},binding=core.digest(snapshot),records=new Map([['baseline-private.json',{snapshot,binding}]]),requests=[];
 const store={exists:n=>records.has(n),read:n=>structuredClone(records.get(n)),create(n,v){assert(!records.has(n),'exclusive record');records.set(n,structuredClone(v));}};
 const proof=()=>({identity:snapshot.identity,ownership:{...snapshot.identity,verified:true,siteId:pins.siteId},testGate:{...snapshot.identity,exactSixtyTestsPassed:true},currentUse:{...snapshot.identity,effective:true,permission:'Cardstack_Use_Connections',hasActivationRequired:false},activeSite:{siteId:pins.siteId,active:true,savedVerified:true},siteBase:pins.siteBase,issuer:pins.issuer});
 const input={pins,store,binding,evidenceSource:'offline-injected',verifyCurrent:async()=>proof(),transport:{async request(r){assert(records.has('route-observation-'+ids[requests.length].replace('.','-')+'-attempt-private.json'),'attempt persisted before request');requests.push(r);return responses[requests.length-1]||{status:405,body:'{"error":"method_not_allowed"}',headers:{'content-type':'application/json'}};}}};
 const filename=path.join(__dirname,'route-observation.cjs'),module={exports:{}};
 vm.runInThisContext('(function(require,module,exports){'+fs.readFileSync(filename,'utf8')+'\n})',{filename})(n=>n.startsWith('/usr/local/')?(installed?(n.endsWith('http-api')?{HttpApi:installed.HttpApi}:n.endsWith('/request')?{default:installed.request}:n.endsWith('/util/promise')?{StreamPromise:installed.StreamPromise}:{getLogger:installed.getLogger}):(()=>{throw Error('Offline SDK boundary');})()):n==='./stage-c-session.cjs'?{verifyStore:s=>assert.equal(s,store)}:require(n.startsWith('.')?path.resolve(__dirname,n):n),module,module.exports);
 return {input,requests,records,proof,create:()=>module.exports.createRouteObservation(input)};
}
test('runs only four fixed named GETs in order with durable separate observations',async()=>{
 const f=fixture(),r=await f.create().run();assert.deepEqual(f.requests,[{auth:'named',method:'GET',path:'/services/apexrest/cardstack/v1/claude/mcp'},{auth:'named',method:'GET',path:'/services/apexrest/cardstack/v1/claude/%6dcp'},{auth:'named',method:'GET',path:'/services/apexrest/cardstack/v1/chatgpt/mcp'},{auth:'named',method:'GET',path:'/services/apexrest/cardstack/v1/chatgpt/%6dcp'}]);assert.deepEqual(r.cases.map(c=>c.id),ids);assert.equal(r.complete,true);assert.equal(r.independentConsentRevocation,'Unknown');assert.equal(f.records.size,9);
});
test('403 404 and 405 remain distinct exact fixture outcomes without unsafe fields',async()=>{
 const unsafe='secret token provider raw text';const f=fixture([{status:403,body:'{"error":"cardstack_use_required"}',headers:{'content-type':'application/json',authorization:unsafe},token:unsafe},{status:404,body:'{"error":"unknown_probe_route"}',headers:{'content-type':'application/json'}},{status:405,body:'{"error":"method_not_allowed"}',headers:{'content-type':'application/json'}},{status:403,body:JSON.stringify({error:unsafe,id:pins.actor}),headers:{'content-type':'application/json'}}]);const r=await f.create().run();assert.deepEqual(r.cases.map(c=>c.httpStatus),[403,404,405,403]);assert.deepEqual(r.cases.map(c=>c.fixtureError),['cardstack_use_required','unknown_probe_route','method_not_allowed','None']);assert.deepEqual(r.cases.map(c=>c.contentCategory),['fixture-json','fixture-json','fixture-json','nonfixture-json']);assert(!JSON.stringify(r).includes(unsafe));assert(!JSON.stringify(r).includes(pins.actor));assert(!JSON.stringify(r).includes('allCasesPass'));
});
test('arbitrary JSON including fixture-shaped extra fields is safely categorized',async()=>{
 for(const body of ['null','[]','false','"text"','{"error":"method_not_allowed","token":"unsafe"}']){const f=fixture([{status:200,body,headers:{'content-type':'application/json'}}]);const r=await f.create().run();assert.equal(r.cases[0].contentCategory,'nonfixture-json');assert.equal(r.cases[0].fixtureError,'None');assert(!JSON.stringify(r).includes('unsafe'));}
});
test('guard failure stops without a request or attempt and cannot be bypassed in same observer',async()=>{
 const f=fixture();f.input.verifyCurrent=()=>{throw Error('private detail');};const observer=f.create(),r=await observer.run();assert.equal(f.requests.length,0);assert.equal(f.records.size,1);assert.equal(r.stopReason,'CONTEXT_REJECTED');assert.equal(observer.receipt().stopReason,'CONTEXT_REJECTED');await assert.rejects(observer.run(),/ROUTE_OBSERVATION_STOPPED/);
});
test('guards each request and stops immediately on transport unknown without retry',async()=>{
 const f=fixture([{code:'PROVIDER_HTML',status:302,body:'unsafe'}]);let guards=0;f.input.verifyCurrent=async()=>{guards++;return f.proof();};const r=await f.create().run();assert.equal(guards,1);assert.equal(f.requests.length,1);assert.equal(r.cases[0].httpStatus,'Unknown');assert.equal(r.cases[0].statusAvailable,false);assert.equal(r.stopReason,'PROVIDER_HTML');await assert.rejects(f.create().run(),/ROUTE_ALREADY_ATTEMPTED/);assert.equal(f.requests.length,1);
});
test('unknown throw persists an attempt and prohibits replay across factories',async()=>{
 const f=fixture();f.input.transport.request=async()=>{throw Error('secret');};const r=await f.create().run();assert.equal(r.stopReason,'TRANSPORT_FAILURE');assert.equal(r.cases[0].httpStatus,'Unknown');await assert.rejects(f.create().run(),/ROUTE_ALREADY_ATTEMPTED/);
});
test('unrelated baseline binding or current proof never reaches transport',async()=>{
 for(const edit of [f=>f.input.binding='0'.repeat(64),f=>f.input.pins={...pins,actor:'005000000000002AAA'},f=>f.records.get('baseline-private.json').snapshot.site.Id='0DM000000000002GAA']){const f=fixture();edit(f);assert.throws(f.create,/ROUTE_BINDING/);assert.equal(f.requests.length,0);}
 const f=fixture();f.input.verifyCurrent=()=>({...f.proof(),identity:{org:pins.org,actor:'005000000000002AAA'}});assert.equal((await f.create().run()).stopReason,'CONTEXT_REJECTED');assert.equal(f.requests.length,0);
});
test('live source requires the original installed SDK references before any request',()=>{
 const f=fixture();f.input.evidenceSource='root-live-http';f.input.sdk={};assert.throws(f.create,/ROUTE_LIVE_SDK_REQUIRED/);assert.equal(f.requests.length,0);
});
test('observer import performs no filesystem or SDK loading',()=>{
 const filename=path.join(__dirname,'route-observation.cjs'),module={exports:{}};vm.runInThisContext('(function(require,module,exports){'+fs.readFileSync(filename,'utf8')+'\n})',{filename})(n=>{assert(!n.startsWith('/usr/local/'),'SDK import');if(n==='node:fs')return new Proxy({},{get:()=>()=>assert.fail('Import IO')});return require(n.startsWith('.')?path.resolve(__dirname,n):n);},module,module.exports);
});
test('live factory accepts only exact four SDK references within synthetic loader',async()=>{
 const sdk={HttpApi:function(){},request:function(){},StreamPromise:{create(){}},getLogger:function(){}};
 const f=fixture([],sdk);f.input.evidenceSource='root-live-http';f.input.sdk=sdk;assert.equal((await f.create().run()).liveExecution,true);
 for(const key of Object.keys(sdk)){const wrong=fixture([],sdk);wrong.input.evidenceSource='root-live-http';wrong.input.sdk={...sdk,[key]:{}};assert.throws(wrong.create,/ROUTE_LIVE_SDK_REQUIRED/);assert.equal(wrong.requests.length,0);}
});
test('every GET requires current proof and stops after an intervening guard rejection',async()=>{
 const f=fixture();let checks=0;f.input.verifyCurrent=()=>++checks===2?Promise.reject(Error('private')):f.proof();const r=await f.create().run();assert.equal(f.requests.length,1);assert.equal(r.cases.length,1);assert.equal(r.stopReason,'CONTEXT_REJECTED');assert(!f.records.has('route-observation-claude-encoded-mcp-attempt-private.json'));
});
test('case selection and writes failing before an attempt perform no request',async()=>{
 const f=fixture(),observer=f.create();await assert.rejects(observer.run(['claude.mcp']),/ROUTE_CASE_SELECTION/);assert.equal(f.requests.length,0);
 f.input.store.create=()=>{throw Error('disk failed');};await assert.rejects(observer.run(),/ROUTE_PERSISTENCE_UNRESOLVED/);assert.equal(f.requests.length,0);
});
test('baseline storage failures never expose raw private text',async()=>{
 const f=fixture();f.input.store.read=()=>{throw Error('private token URL');};assert.throws(f.create,/^Error: ROUTE_BINDING$/);
 });
test('result persistence failure is sanitized and preserves replay barrier',async()=>{
 const g=fixture();const create=g.input.store.create;g.input.store.create=(n,v)=>{if(n.endsWith('-result-private.json'))throw Error('private token URL');create(n,v);};await assert.rejects(g.create().run(),/^Error: ROUTE_PERSISTENCE_UNRESOLVED$/);assert.equal(g.requests.length,1);await assert.rejects(g.create().run(),/ROUTE_ALREADY_ATTEMPTED/);assert.equal(g.requests.length,1);
});
