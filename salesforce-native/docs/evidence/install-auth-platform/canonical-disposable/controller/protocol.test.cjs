'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PassThrough}=require('node:stream');
const {HttpApi}=require('/usr/local/lib/sf/node_modules/@jsforce/jsforce-node/lib/http-api');
const {StreamPromise}=require('/usr/local/lib/sf/node_modules/@jsforce/jsforce-node/lib/util/promise');
const {getLogger}=require('/usr/local/lib/sf/node_modules/@jsforce/jsforce-node/lib/util/logger');
let protocol={};try{protocol=require('./protocol.cjs');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const base='https://fixed.example.com/cardstackauthprobe',issuer='https://org.example.com';
const identity={org:'00D000000000001',actor:'005000000000001'},siteId='0DM000000000001';
const expectedValues={text:'café ✓ "quoted"',amount:0,accepted:false,choice:'beta',rating:'hot',notes:'first\nsecond',enabled:false};
const URI='ui://cardstack/apex-transport-probe.html';
const html=fs.readFileSync(__dirname+'/../staticresources/CardstackCanonicalProbeUi.resource','utf8');
const annotations={readOnlyHint:true,destructiveHint:false,openWorldHint:false};
const tools=[{name:'open_cardstack_apex_probe',description:'Render disposable seven-field Salesforce-hosted UI. Synthetic values only.',annotations,inputSchema:{type:'object',properties:{},additionalProperties:false},_meta:{ui:{resourceUri:URI,visibility:['model','app']},'openai/outputTemplate':URI,'openai/widgetAccessible':true}},
{name:'echo_cardstack_values',description:'Echo exact seven typed synthetic values; no CRM access.',annotations,inputSchema:{type:'object',properties:{text:{type:'string'},amount:{type:'number'},accepted:{type:'boolean'},choice:{type:'string'},rating:{type:'string'},notes:{type:'string'},enabled:{type:'boolean'}},required:['text','amount','accepted','choice','rating','notes','enabled'],additionalProperties:false},_meta:{ui:{visibility:['app']}}}];
function proof(){return {identity:{...identity},ownership:{verified:true,...identity,siteId},testGate:{exactSixtyTestsPassed:true,...identity},currentUse:{effective:true,...identity,permission:'Cardstack_Use_Connections',hasActivationRequired:false},activeSite:{siteId,active:true,savedVerified:true},siteBase:base,issuer};}
function fixture(req){
 const path=new URL(req.url).pathname,client=path.includes('/chatgpt/')?'chatgpt':'claude';let status=200,body,headers={'content-type':'application/json'};
 const exact=/\/cardstackauthprobe\/services\/apexrest\/cardstack\/v1\/(claude|chatgpt)\/(mcp|metadata)$/.test(path);
 if(req.url.startsWith('http:'))return {status:302,body:'',headers:{location:'https://never-follow.invalid'}};
 if(req.url.startsWith(issuer))return {status:503,body:{error:'public_context_unavailable'},headers};
 if(!exact||req.url.includes('?'))return {status:404,body:{error:'unknown_probe_route'},headers};
 if(path.endsWith('/metadata'))body={resource:base+'/services/apexrest/cardstack/v1/'+client+'/mcp',authorization_servers:[issuer],scopes_supported:['api','refresh_token'],bearer_methods_supported:['header']};
 else if(req.headers.Authorization!=='Bearer offline-managed-sentinel'){status=401;body={error:'authentication_required'};headers['www-authenticate']='Bearer resource_metadata="'+base+'/services/apexrest/cardstack/v1/'+client+'/metadata", scope="api refresh_token"';}
 else if(req.method!=='POST'){status=405;body={error:'method_not_allowed'};}
 else {
  let rpc;try{rpc=JSON.parse(req.body);}catch{body={jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid JSON request'}};}
  if(rpc){if(Array.isArray(rpc))body={jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid protocol request'}};
   else if(!Object.hasOwn(rpc,'id')){status=202;body='';}
   else {let result;
    switch(rpc.method){case 'initialize':result={protocolVersion:rpc.params.protocolVersion,serverInfo:{name:'Cardstack canonical synthetic probe',version:'0.0.1'},capabilities:{tools:{},resources:{},extensions:{'io.modelcontextprotocol/ui':{}}}};break;
    case 'ping':result={};break;case 'tools/list':result={tools};break;
    case 'resources/list':result={resources:[{uri:URI,name:'cardstack_apex_transport_probe',mimeType:'text/html;profile=mcp-app'}]};break;
    case 'resources/read':if(rpc.params.uri!==URI)body={jsonrpc:'2.0',id:rpc.id,error:{code:-32602,message:'Unknown resource'}};else result={contents:[{uri:URI,mimeType:'text/html;profile=mcp-app',text:html,_meta:{ui:{csp:{connectDomains:[],resourceDomains:[],frameDomains:[]}},'openai/widgetCSP':{connect_domains:[],resource_domains:[]}}}]};break;
    case 'tools/call':result={content:[{type:'text',text:rpc.params.name==='open_cardstack_apex_probe'?'Disposable Salesforce-hosted synthetic UI; no CRM access.':'Exact synthetic values received; no CRM writes.'}],structuredContent:rpc.params.name==='open_cardstack_apex_probe'?{status:'ready'}:rpc.params.arguments};break;
    default:body={jsonrpc:'2.0',id:rpc.id,error:{code:-32601,message:'Unknown method'}};
    }if(result)body={jsonrpc:'2.0',id:rpc.id,result};
   }
  }
 }
 return {status,body,headers};
}
function harness({changeProof,changeResponse,evidenceSource='offline-injected',now=()=>Date.now()}={}){
 assert.equal(typeof protocol.createMeasurement,'function','Measurement factory must exist');let guards=0,requests=[];
 const connection={version:'67.0',accessToken:'offline-managed-sentinel',_refreshDelegate:{isRefreshing:()=>false,refresh(){throw Error('refresh');}}};
 const sdk={HttpApi,StreamPromise,getLogger,request(req){requests.push(structuredClone(req));const s=new PassThrough();queueMicrotask(()=>{let r=fixture(req);if(changeResponse)r=changeResponse(r,req)||r;s.emit('response',{statusCode:r.status,headers:r.headers});s.end(typeof r.body==='string'?r.body:JSON.stringify(r.body));});return s;}};
 const measurement=protocol.createMeasurement({pins:{...identity,siteId,siteBase:base,issuer},connection,sdk,evidenceSource,now,verifyCurrent:async()=>{guards++;const p=proof();return changeProof?changeProof(p,guards):p;}});
 return {measurement,requests,guards:()=>guards};
}
test('fixed cases preserve exact newline/false/zero and repeat calls as protocol-only evidence',async()=>{
 const h=harness();const r=await h.measurement.runCases(['claude.echo','claude.empty-echo','claude.repeat.echo']);assert.equal(r.complete,false);assert.equal(r.allCasesPass,false);assert.equal(r.liveExecution,false);assert.equal(h.guards(),3);assert.deepEqual(r.coveredCaseIds,['claude.echo','claude.empty-echo','claude.repeat.echo']);assert.ok(r.cases.every(x=>x.status==='Pass'));assert.deepEqual(JSON.parse(h.requests[0].body).params.arguments,expectedValues);assert.equal(JSON.parse(h.requests[1].body).params.arguments.text,'');assert.deepEqual(JSON.parse(h.requests[2].body).params.arguments,expectedValues);assert.ok(r.limitations.includes('PROTOCOL_REPEAT_ONLY'));assert.ok(!JSON.stringify(r).includes(identity.org));
});
test('full fixed list independently checks both clients, hostile pointers, denials, errors and stateless repeats',async()=>{
 const h=harness();const ids=h.measurement.caseIds;assert.ok(ids.includes('chatgpt.initialize-2025-11-25'));assert.ok(ids.includes('claude.negative-encoded'));assert.ok(ids.includes('chatgpt.http-metadata'));const r=await h.measurement.runCases(ids);assert.equal(r.complete,true);assert.equal(r.allCasesPass,false);assert.equal(r.cases.filter(x=>x.status==='Fail').length,0);assert.equal(r.cases.filter(x=>x.status==='Unknown').length,2);assert.equal(r.cases.find(x=>x.id==='claude.non-site').status,'Pass');assert.equal(h.guards(),ids.length);assert.ok(!JSON.stringify(r).includes('fixed.example'));
});
test('wrong org/actor/checksum18, missing ownership/testgate/current Use or inactive Site blocks each named case',async()=>{
 for(const changeProof of [p=>({...p,identity:{...p.identity,org:'00D000000000002'}}),p=>({...p,identity:{...p.identity,actor:'005000000000001AAB'}}),p=>({...p,ownership:undefined}),p=>({...p,testGate:{...p.testGate,exactSixtyTestsPassed:false}}),p=>({...p,currentUse:{...p.currentUse,effective:false}}),p=>({...p,currentUse:{...p.currentUse,hasActivationRequired:true}}),p=>({...p,activeSite:{...p.activeSite,active:false}}),p=>({...p,siteBase:base+'/cardstackauthprobe'})]){const h=harness({changeProof});const r=await h.measurement.runCases(['claude.ping']);assert.equal(r.cases[0].code,'CONTEXT_REJECTED');assert.equal(r.cases[0].attempts,0);assert.equal(h.requests.length,0);}
});
test('normalizes valid15 at ingestion and accepts full checksum18 equality',async()=>{
 const {normalizeId}=require('./core.cjs');const h=harness({changeProof:p=>({...p,identity:{org:normalizeId(identity.org),actor:normalizeId(identity.actor)}})});assert.equal((await h.measurement.runCases(['claude.ping'])).cases[0].status,'Pass');
});
test('context drift after a Pass is retained safely and prevents further requests',async()=>{
 const h=harness({changeProof:(p,n)=>n===1?p:{...p,identity:{...p.identity,actor:'005000000000002'}}});const r=await h.measurement.runCases(['claude.ping','claude.open']);assert.deepEqual(r.cases.map(x=>x.status),['Pass','Unknown']);assert.equal(h.requests.length,1);
});
test('fixed case selection rejects arbitrary/duplicate/repeated IDs before a probe',async()=>{
 const h=harness();for(const ids of [['https://hostile.invalid'],['claude.ping','claude.ping'],[]])await assert.rejects(h.measurement.runCases(ids),/^Error: PROTOCOL_CASE_SELECTION$/);assert.equal(h.requests.length,0);await h.measurement.runCase('claude.ping');await assert.rejects(h.measurement.runCase('claude.ping'),/^Error: PROTOCOL_CASE_ALREADY_ATTEMPTED$/);assert.equal(h.requests.length,1);
});
test('successful response requires exact JSON-RPC keys/version/request id beyond the result checker',async()=>{
 for(const alter of [b=>({...b,id:999}),b=>({...b,jsonrpc:'1.0'}),b=>({...b,actorId:'private'}),b=>({result:b.result})]){const h=harness({changeResponse:r=>({...r,body:alter(r.body)})});assert.equal((await h.measurement.runCases(['claude.ping'])).cases[0].status,'Fail');}
});
test('error code AND fixed message must match; raw messages never enter receipt',async()=>{
 const h=harness({changeResponse:r=>({...r,body:{...r.body,error:{code:-32601,message:'Unknown resource'}}})});const r=await h.measurement.runCase('claude.unknown-method');assert.equal(r.cases[0].status,'Fail');assert.ok(!JSON.stringify(r).includes('Unknown resource'));
});
test('extra typed fields, stringfalse, wrong fallbacks, broadened CSP and UI aliases fail',async()=>{
 for(const [id,mutate] of [['claude.echo',r=>{r.body.result.structuredContent.enabled='false';}],['claude.echo',r=>{r.body.result.structuredContent.actorId='private';}],['claude.open',r=>{r.body.result.content[0].text='private';}],['claude.html',r=>{r.body.result.contents[0]._meta['openai/widgetCSP'].resource_domains=['https://hostile.invalid'];}],['claude.tools',r=>{r.body.result.tools[1]._meta.ui.visibility=['app','model'];}]]){const h=harness({changeResponse:r=>{r=structuredClone(r);mutate(r);return r;}});assert.equal((await h.measurement.runCase(id)).cases[0].status,'Fail');}
});
test('provider non-Site503/HTML differs from exact fixture503; denial cannot manufacture fixture Pass',async()=>{
 const h=harness({changeResponse:r=>({...r,status:503,body:{error:'platform_unavailable'}})});const r=await h.measurement.runCase('claude.non-site');assert.equal(r.cases[0].status,'Unknown');assert.equal(r.cases[0].code,'PROVIDER_DENIAL');
});
test('retains operation times/evidence source and strict receipt allowlist',async()=>{
 let t=Date.parse('2026-10-10T12:00:00Z');const h=harness({now:()=>t++});const r=await h.measurement.runCase('claude.ping');assert.equal(r.cases[0].startedAt,'2026-10-10T12:00:00.000Z');assert.equal(r.cases[0].endedAt,'2026-10-10T12:00:00.001Z');assert.equal(r.evidenceSource,'offline-injected');assert.equal(protocol.validateMeasurementReceipt(r),r);assert.throws(()=>protocol.validateMeasurementReceipt({...r,raw:'private'}),/^Error: PROTOCOL_RECEIPT_REJECTED$/);assert.throws(()=>protocol.validateMeasurementReceipt({...r,cases:[{...r.cases[0],body:'private'}]}),/^Error: PROTOCOL_RECEIPT_REJECTED$/);
});
test('injected SDK cannot be relabeled as live execution',()=>{
 assert.throws(()=>harness({evidenceSource:'root-live-http'}),/^Error: PROTOCOL_LIVE_SDK_REQUIRED$/);
});
test('both canonical clients include named non-Site failclosed case',async()=>{
 const h=harness();assert.ok(h.measurement.caseIds.includes('chatgpt.non-site'));assert.equal((await h.measurement.runCase('chatgpt.non-site')).cases[0].status,'Pass');
});
test('pure aggregation combines disjoint validated batch receipts without claiming partial coverage complete',async()=>{
 const a=await harness().measurement.runCase('claude.ping'),b=await harness().measurement.runCase('chatgpt.ping');assert.equal(typeof protocol.aggregateReceipts,'function');const r=protocol.aggregateReceipts([a,b]);assert.deepEqual(r.coveredCaseIds,['claude.ping','chatgpt.ping']);assert.equal(r.complete,false);assert.equal(r.allCasesPass,false);assert.equal(r.liveExecution,false);assert.equal(r.evidenceSource,'offline-injected');assert.throws(()=>protocol.aggregateReceipts([a,a]),/^Error: PROTOCOL_RECEIPT_DUPLICATE$/);assert.throws(()=>protocol.aggregateReceipts([{...a,raw:'private'}]),/^Error: PROTOCOL_RECEIPT_REJECTED$/);
});
test('aggregation rejects mixed offline/live evidence rather than promoting injected observations',async()=>{
 const a=await harness().measurement.runCase('claude.ping'),b=await harness().measurement.runCase('chatgpt.ping');const live={...b,evidenceSource:'root-live-http',liveExecution:true,cases:b.cases.map(c=>({...c,source:'root-live-http'}))};assert.throws(()=>protocol.aggregateReceipts([a,live]),/^Error: PROTOCOL_RECEIPT_SOURCE_MISMATCH$/);
});
test('fixed JSON fixture response with wrong content-type cannot Pass',async()=>{
 const h=harness({changeResponse:r=>({...r,headers:{'content-type':'text/plain'}})});assert.equal((await h.measurement.runCase('claude.ping')).cases[0].status,'Fail');
});
test('raw callback errors are sanitized; strict receipt rejects null and invented covered cases',async()=>{
 const h=harness({changeProof:()=>{throw Error('secret synthetic raw identity');}}),r=await h.measurement.runCase('claude.ping');assert.equal(r.cases[0].code,'CONTEXT_REJECTED');assert.ok(!JSON.stringify(r).includes('secret'));assert.throws(()=>protocol.validateMeasurementReceipt({...r,cases:[null]}),/^Error: PROTOCOL_RECEIPT_REJECTED$/);assert.throws(()=>protocol.validateMeasurementReceipt({...r,coveredCaseIds:['private-case']}),/^Error: PROTOCOL_RECEIPT_REJECTED$/);
});
test('review R1 non-Site fixture-shaped503 requires JSON content-type for either client',async()=>{
 for(const client of ['claude','chatgpt'])for(const contentType of ['text/plain','application/octet-stream',undefined]){
  const h=harness({changeResponse:r=>({...r,headers:contentType?{'content-type':contentType}:{}})}),r=await h.measurement.runCase(client+'.non-site');assert.equal(r.cases[0].status,'Unknown');assert.equal(r.cases[0].code,'PROVIDER_DENIAL');
 }
 for(const contentType of ['application/json','application/json; charset=UTF-8']){const h=harness({changeResponse:r=>({...r,headers:{'content-type':contentType}})});assert.equal((await h.measurement.runCase('claude.non-site')).cases[0].status,'Pass');}
});
test('review R2 notification202 requires raw empty response and rejects null/whitespace for either client',async()=>{
 for(const client of ['claude','chatgpt'])for(const body of ['null',' ','\n','{}']){const h=harness({changeResponse:r=>({...r,body})}),r=await h.measurement.runCase(client+'.notification');assert.equal(r.cases[0].status,'Fail');assert.equal(r.cases[0].code,'CONTRACT_MISMATCH');}
 const h=harness();assert.equal((await h.measurement.runCase('claude.notification')).cases[0].status,'Pass');
});
