'use strict';
// Root-injected installed SDK only. No connections, credential IO or calls on import.
const PREFIX='/cardstackauthprobe',ROOT='/services/apexrest/cardstack/v1/';
const URI='ui://cardstack/apex-transport-probe.html';
const NEGATIVE_SUFFIXES=['Claude/mcp','claude/MCP','claude/nested/mcp','unknown/mcp','claude/%6dcp','claude/mcp/extra','claude/mcp?unexpected=1','chatgpt/Metadata','chatgpt/nested/mcp','chatgpt/%6dcp','chatgpt/mcp/extra','chatgpt/mcp?unexpected=1'];
const PATHS=new Set(['claude/mcp','claude/metadata','chatgpt/mcp','chatgpt/metadata',...NEGATIVE_SUFFIXES].map(x=>ROOT+x));
const need=(v,c)=>{if(!v)throw Error(c);};
function validatePins(siteBase,issuer){
 need(typeof siteBase==='string'&&/^https:\/\/[A-Za-z0-9.-]+\/cardstackauthprobe$/.test(siteBase)&&typeof issuer==='string'&&/^https:\/\/[A-Za-z0-9.-]+$/.test(issuer),'PROTOCOL_PIN_REJECTED');
 const s=new URL(siteBase),i=new URL(issuer);need(s.origin+PREFIX===siteBase&&i.origin===issuer&&!s.port&&!i.port,'PROTOCOL_PIN_REJECTED');
}
function createBoundedTransport({connection,sdk,siteBase,issuer}){
 validatePins(siteBase,issuer);need(connection?.version==='67.0'&&typeof sdk?.HttpApi==='function'&&typeof sdk?.request==='function'&&typeof sdk?.StreamPromise?.create==='function'&&typeof sdk?.getLogger==='function','PROTOCOL_SDK_REQUIRED');
 // Installed fetch/request-helper loggers are shared; silence raw SDK output
 // through their supported API before any request, including transport errors.
 const silence=()=>{for(const name of ['fetch','request-helper','http-api'])sdk.getLogger(name).setLogLevel('NONE');};
 class NoRefreshApi extends sdk.HttpApi {
  getRefreshDelegate(){return undefined;}
  isErrorResponse(){return false;}
  async getResponseBody(response){return response.body;}
  async getError(){return Error('TRANSPORT_FAILURE');}
 }
 class PublicApi extends NoRefreshApi {beforeSend(){/* No managed bearer on public requests. */}}
 async function request(input){
  need(input&&typeof input==='object'&&Object.keys(input).every(k=>['auth','method','path','body','hostile','large','target'].includes(k))&&['named','public','fabricated'].includes(input.auth)&&['GET','POST','DELETE'].includes(input.method)&&PATHS.has(input.path)&&(!Object.hasOwn(input,'target')||['non-site','http-negative'].includes(input.target))&&(!Object.hasOwn(input,'hostile')||input.hostile===true)&&(!Object.hasOwn(input,'large')||input.large===true)&&(!Object.hasOwn(input,'body')||typeof input.body==='string'),'PROTOCOL_REQUEST_REJECTED');
  need(input.target!=='non-site'||(input.auth==='named'&&[ROOT+'claude/mcp',ROOT+'chatgpt/mcp'].includes(input.path)&&!input.hostile&&!input.large),'PROTOCOL_REQUEST_REJECTED');
  need(input.target!=='http-negative'||(input.auth==='public'&&input.method==='GET'&&[ROOT+'claude/metadata',ROOT+'chatgpt/metadata'].includes(input.path)&&input.body===undefined&&!input.hostile&&!input.large),'PROTOCOL_REQUEST_REJECTED');
  if(input.large){let b;try{b=JSON.parse(input.body);}catch{}need(input.auth==='named'&&input.method==='POST'&&[ROOT+'claude/mcp',ROOT+'chatgpt/mcp'].includes(input.path)&&b?.jsonrpc==='2.0'&&['number','string'].includes(typeof b.id)&&b.method==='resources/read'&&JSON.stringify(b.params)==='{"uri":"'+URI+'"}'&&Object.keys(b).sort().join(',')==='id,jsonrpc,method,params','PROTOCOL_REQUEST_REJECTED');}
  need(input.body===undefined||Buffer.byteLength(input.body)<=16384,'PROTOCOL_REQUEST_REJECTED');
  const cap=input.large?1048576:65536,options={responseType:'text',followRedirect:false,timeout:15000,httpProxy:undefined,retry:{maxRetries:0,methods:[],statusCodes:[],errorCodes:[]}};
  const headers={'content-type':'application/json','accept':'application/json'};
  if(input.auth==='fabricated')headers.Authorization='Bearer cardstack-invalid-synthetic-sentinel';
  if(input.hostile){headers['X-Forwarded-Host']='hostile.invalid';headers.Forwarded='host=hostile.invalid;proto=http';}
  const outgoing={method:input.method,url:(input.target==='non-site'?issuer:input.target==='http-negative'?siteBase.replace(/^https:/,'http:'):siteBase)+input.path,headers,...(input.body===undefined?{}:{body:input.body})};
  let limitCode;
  // Do not use Transport.httpRequest's complete listener: it calls unbounded
  // readAll before HttpApi sees the response. Consume the SDK request stream.
  const transport={httpRequest(req,opts){return sdk.StreamPromise.create(()=>{
   let stream,settled=false,timer,head;const chunks=[];let size=0;
   const promise=new Promise((resolve,reject)=>{
    const fail=code=>{if(settled)return;settled=true;limitCode=code;clearTimeout(timer);chunks.length=0;reject(Error(code));stream?.destroy();};
    timer=setTimeout(()=>fail('CONSUMER_TIMEOUT'),15000);
    try{stream=sdk.request(req,opts);}catch{fail('TRANSPORT_FAILURE');return;}
    stream.on('error',()=>fail('TRANSPORT_FAILURE'));
    stream.on('response',r=>{if(settled)return;head={statusCode:r.statusCode,headers:{'content-type':r.headers?.['content-type'],'www-authenticate':r.headers?.['www-authenticate']}};});
    stream.on('data',chunk=>{if(settled)return;const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=b.length;if(size>cap){fail('BODY_LIMIT');return;}chunks.push(b);});
    stream.on('end',()=>{if(settled)return;settled=true;clearTimeout(timer);if(!head||!Number.isInteger(head.statusCode)){reject(Error('TRANSPORT_FAILURE'));return;}resolve({...head,body:Buffer.concat(chunks).toString('utf8')});});
   });return {stream,promise};
  });}};
  silence();const api=new (input.auth==='named'?NoRefreshApi:PublicApi)(connection,{...options,transport});
  api._logger={debug(){},error(){}};
  let response;api.on('response',r=>{response={status:r.statusCode,body:r.body,headers:r.headers};});
  try{await api.request(outgoing);}catch{return {code:limitCode||'TRANSPORT_FAILURE',networkAbort:'Unknown'};}
  if(response.status>=300&&response.status<=399)return {code:'PROVIDER_REDIRECT',networkAbort:'Unknown'};
  if(/^text\/html(?:;|$)/i.test(response.headers['content-type']||''))return {code:'PROVIDER_HTML',networkAbort:'Unknown'};
  return {...response,networkAbort:'Unknown'};
 }
 return {request};
}
module.exports={createBoundedTransport,validatePins,NEGATIVE_SUFFIXES,ROOT,PREFIX,URI};
