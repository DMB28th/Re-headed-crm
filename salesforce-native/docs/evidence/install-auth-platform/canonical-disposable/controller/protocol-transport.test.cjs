'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {PassThrough}=require('node:stream');
const {HttpApi}=require('/usr/local/lib/sf/node_modules/@jsforce/jsforce-node/lib/http-api');
const {StreamPromise}=require('/usr/local/lib/sf/node_modules/@jsforce/jsforce-node/lib/util/promise');
const {getLogger}=require('/usr/local/lib/sf/node_modules/@jsforce/jsforce-node/lib/util/logger');
const {createBoundedTransport}=require('./protocol-transport.cjs');
const base='https://fixed.example.com/cardstackauthprobe';
function harness({status=200,chunks=['{}'],headers={'content-type':'application/json'},delay=0,never=false,error}={}){
 let attempts=0,seen;
 const connection={version:'67.0',accessToken:'offline-managed-sentinel',_refreshDelegate:{refresh(){throw Error('refresh must not run');},isRefreshing(){return false;}}};
 const sdk={HttpApi,StreamPromise,getLogger,request(request,options){
  attempts++;seen={request,options};const stream=new PassThrough();
  setTimeout(()=>{if(error){stream.emit('error',Error(error));return;}stream.emit('response',{statusCode:status,headers});if(!never){for(const chunk of chunks)stream.write(chunk);stream.end();}},delay);
  return stream;
 }};
 return {transport:createBoundedTransport({connection,sdk,siteBase:base,issuer:'https://org.example.com'}),seen:()=>seen,attempts:()=>attempts};
}
const named={auth:'named',method:'POST',path:'/services/apexrest/cardstack/v1/claude/mcp',body:'{"jsonrpc":"2.0","id":1,"method":"ping"}'};
test('named SDK auth owns second options and does not refresh or retry 401/420',async()=>{
 for(const status of [401,420,503]){const h=harness({status});assert.equal((await h.transport.request(named)).status,status);assert.equal(h.attempts(),1);const {request,options}=h.seen();assert.equal(request.headers.Authorization,'Bearer offline-managed-sentinel');assert.equal(request.url,base+named.path);assert.deepEqual(options.retry,{maxRetries:0,methods:[],statusCodes:[],errorCodes:[]});assert.equal(options.timeout,15000);assert.equal(options.followRedirect,false);assert.equal(options.responseType,'text');assert.equal(request.timeout,undefined);}
});
test('public/fabricated requests never receive managed auth; fixed hostile headers cannot change URL',async()=>{
 const h=harness();await h.transport.request({...named,auth:'public',hostile:true});assert.equal(h.seen().request.headers.Authorization,undefined);assert.equal(h.seen().request.url,base+named.path);assert.equal(h.seen().request.headers['X-Forwarded-Host'],'hostile.invalid');
 await h.transport.request({...named,auth:'fabricated'});assert.equal(h.seen().request.headers.Authorization,'Bearer cardstack-invalid-synthetic-sentinel');
});
test('rejects route overrides, cross-origin URLs, noncanonical origins and unapproved paths before sending',async()=>{
 const h=harness();for(const extra of [{url:'https://evil.invalid'},{headers:{Authorization:'secret'}},{path:'//evil.invalid'},{path:'/services/data/v67.0/sobjects/Account'},{path:'/services/apexrest/cardstack/v1/claude/mcp?arbitrary=yes'},{method:'PATCH'}])await assert.rejects(h.transport.request({...named,...extra}),/^Error: PROTOCOL_REQUEST_REJECTED$/);assert.equal(h.attempts(),0);
 for(const siteBase of ['http://fixed.example.com/cardstackauthprobe',base+'/x',base+'?x=1','https://a:b@fixed.example.com/cardstackauthprobe','https://fixed.example.com:443/cardstackauthprobe'])assert.throws(()=>createBoundedTransport({connection:{version:'67.0'},sdk:{HttpApi,StreamPromise,getLogger,request(){}},siteBase,issuer:'https://org.example.com'}),/^Error: PROTOCOL_PIN_REJECTED$/);
});
test('redirects, HTML provider denial and raw network errors remain safe private outcome categories',async()=>{
 for(const [input,want] of [[{status:302,headers:{location:'https://secret.invalid/auth?token=private'}},'PROVIDER_REDIRECT'],[{status:403,headers:{'content-type':'text/html'},chunks:['secret html']},'PROVIDER_HTML'],[{error:'raw secret token username'},'TRANSPORT_FAILURE']]){const h=harness(input),r=await h.transport.request(named);assert.equal(r.code,want);assert.equal(h.attempts(),1);assert.ok(!JSON.stringify(r).includes('secret'));}
});
test('64KiB streaming cap terminates consumption; large body allowance is only named exact resources/read',async()=>{
 const h=harness({chunks:['x'.repeat(65536),'x']});assert.equal((await h.transport.request(named)).code,'BODY_LIMIT');
 await assert.rejects(h.transport.request({...named,large:true}),/^Error: PROTOCOL_REQUEST_REJECTED$/);
 const large=harness({chunks:['x'.repeat(70000)]});const r=await large.transport.request({...named,body:'{"jsonrpc":"2.0","id":1,"method":"resources/read","params":{"uri":"ui://cardstack/apex-transport-probe.html"}}',large:true});assert.equal(r.body.length,70000);
 const oversize=harness({chunks:['x'.repeat(1048577)]});assert.equal((await oversize.transport.request({...named,body:'{"jsonrpc":"2.0","id":1,"method":"resources/read","params":{"uri":"ui://cardstack/apex-transport-probe.html"}}',large:true})).code,'BODY_LIMIT');
});
test('consumer whole-response deadline includes slow body; receipt never claims underlying network abort',async()=>{
 const h=harness({never:true});const start=Date.now();const r=await h.transport.request(named);assert.equal(r.code,'CONSUMER_TIMEOUT');assert.ok(Date.now()-start>=14900);assert.equal(r.networkAbort,'Unknown');assert.equal(h.attempts(),1);
});
test('HTTP negative exception allows only anonymous fixed metadata GET on pinned hostname',async()=>{
 const h=harness({status:302});assert.equal((await h.transport.request({auth:'public',method:'GET',path:'/services/apexrest/cardstack/v1/chatgpt/metadata',target:'http-negative'})).code,'PROVIDER_REDIRECT');assert.equal(h.seen().request.url,'http://fixed.example.com/cardstackauthprobe/services/apexrest/cardstack/v1/chatgpt/metadata');assert.equal(h.seen().request.headers.Authorization,undefined);
 for(const extra of [{auth:'named'},{auth:'fabricated'},{method:'POST'},{body:'sensitive'},{path:'/services/apexrest/cardstack/v1/chatgpt/mcp'},{hostile:true}])await assert.rejects(h.transport.request({auth:'public',method:'GET',path:'/services/apexrest/cardstack/v1/chatgpt/metadata',target:'http-negative',...extra}),/^Error: PROTOCOL_REQUEST_REJECTED$/);
});
test('installed low-level request effectively makes one420/503 attempt with no redirect follow (offline MockAgent)',async()=>{
 const undici=require('/usr/local/lib/sf/node_modules/@jsforce/jsforce-node/node_modules/undici');
 const realRequest=require('/usr/local/lib/sf/node_modules/@jsforce/jsforce-node/lib/request').default;
 const previous=undici.getGlobalDispatcher(),mock=new undici.MockAgent();mock.disableNetConnect();undici.setGlobalDispatcher(mock);
 try{for(const status of [420,503,302]){mock.get('https://fixed.example.com').intercept({path:'/cardstackauthprobe/services/apexrest/cardstack/v1/claude/mcp',method:'GET'}).reply(status,'{}',{headers:{'content-type':'application/json',location:'https://never-follow.invalid'}});
  const transport=createBoundedTransport({connection:{version:'67.0'},sdk:{HttpApi,StreamPromise,getLogger,request:realRequest},siteBase:base,issuer:'https://org.example.com'});
  const r=await transport.request({auth:'public',method:'GET',path:named.path});if(status===302)assert.equal(r.code,'PROVIDER_REDIRECT');else assert.equal(r.status,status);mock.assertNoPendingInterceptors();
 }}finally{undici.setGlobalDispatcher(previous);await mock.close();}
});
test('installed raw transport errors are silenced even when logger was enabled (offline MockAgent)',async()=>{
 const undici=require('/usr/local/lib/sf/node_modules/@jsforce/jsforce-node/node_modules/undici'),realRequest=require('/usr/local/lib/sf/node_modules/@jsforce/jsforce-node/lib/request').default;
 const previous=undici.getGlobalDispatcher(),mock=new undici.MockAgent();mock.disableNetConnect();undici.setGlobalDispatcher(mock);
 const savedLog=console.log,savedError=console.error,output=[];console.log=(...x)=>output.push(x);console.error=(...x)=>output.push(x);getLogger('fetch').setLogLevel('DEBUG');
 try{mock.get('https://fixed.example.com').intercept({path:'/cardstackauthprobe/services/apexrest/cardstack/v1/claude/mcp',method:'GET'}).replyWithError(Error('private synthetic raw failure'));
  const transport=createBoundedTransport({connection:{version:'67.0',_logLevel:'DEBUG'},sdk:{HttpApi,StreamPromise,getLogger,request:realRequest},siteBase:base,issuer:'https://org.example.com'});const r=await transport.request({auth:'public',method:'GET',path:named.path});assert.equal(r.code,'TRANSPORT_FAILURE');assert.deepEqual(output,[]);
 }finally{console.log=savedLog;console.error=savedError;undici.setGlobalDispatcher(previous);await mock.close();}
});
