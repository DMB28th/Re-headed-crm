'use strict';
// Contract checker, never an Apex implementation or OAuth/deployment harness.
const {createHash}=require('node:crypto');
const {isDeepStrictEqual:eq}=require('node:util');
const URI='ui://cardstack/apex-transport-probe.html', MIME='text/html;profile=mcp-app';
const OPEN_TEXT='Disposable Salesforce-hosted synthetic UI; no CRM access.';
const ECHO_TEXT='Exact synthetic values received; no CRM writes.';
const ANNOTATIONS={readOnlyHint:true,destructiveHint:false,openWorldHint:false};
const TOOLS=[
 {name:'open_cardstack_apex_probe',description:'Render disposable seven-field Salesforce-hosted UI. Synthetic values only.',inputSchema:{type:'object',properties:{},additionalProperties:false},_meta:{ui:{resourceUri:URI,visibility:['model','app']},'openai/outputTemplate':URI,'openai/widgetAccessible':true},annotations:ANNOTATIONS},
 {name:'echo_cardstack_values',description:'Echo exact seven typed synthetic values; no CRM access.',inputSchema:{type:'object',properties:{text:{type:'string'},amount:{type:'number'},accepted:{type:'boolean'},choice:{type:'string'},rating:{type:'string'},notes:{type:'string'},enabled:{type:'boolean'}},required:['text','amount','accepted','choice','rating','notes','enabled'],additionalProperties:false},_meta:{ui:{visibility:['app']}},annotations:ANNOTATIONS}
];
const RESOURCE_META={ui:{csp:{connectDomains:[],resourceDomains:[],frameDomains:[]}},'openai/widgetCSP':{connect_domains:[],resource_domains:[]}};
const STAGES=new Set(['metadata','challenge','invalid-route','missing-use','method-denied','notification','initialize','ping','tools','resources','html','open','echo','rpc-error']);
function object(x){return x!==null && typeof x==='object' && (Object.getPrototypeOf(x)===Object.prototype || Object.getPrototypeOf(x)===null);}
function exactKeys(x,keys){return object(x) && eq(Object.keys(x).sort(),keys.slice().sort());}
function expectedContext(c){
 if(!object(c) || !['claude','chatgpt'].includes(c.client) || !/^\/[A-Za-z0-9_-]+$|^$/.test(c.prefix) || !/^https:\/\/[A-Za-z0-9.-]+$/.test(c.issuer) || !/^[a-f0-9]{64}$/.test(c.htmlHash)) throw Error('Invalid expected context');
 let u;try{u=new URL(c.base);}catch{throw Error('Invalid expected context');}
 if(u.protocol!=='https:' || u.username || u.password || u.port || u.search || u.hash || (c.prefix==='' ? u.pathname!=='/' : u.pathname!==c.prefix) || u.origin+ c.prefix!==c.base) throw Error('Invalid expected context');
 return {resource:c.base+'/services/apexrest/cardstack/v1/'+c.client+'/mcp',metadata:c.base+'/services/apexrest/cardstack/v1/'+c.client+'/metadata'};
}
function values(x){return exactKeys(x,['text','amount','accepted','choice','rating','notes','enabled']) && ['text','choice','rating','notes'].every(k=>typeof x[k]==='string' && x[k].length<=1000) && typeof x.amount==='number' && Number.isFinite(x.amount) && typeof x.accepted==='boolean' && typeof x.enabled==='boolean';}
function fallback(r,text){return exactKeys(r,['content','structuredContent']) && eq(r.content,[{type:'text',text}]);}
function toolShape(t){return exactKeys(t,['name','description','inputSchema','_meta','annotations']) && object(t.inputSchema) && object(t.inputSchema.properties) && object(t._meta) && object(t._meta.ui) && object(t.annotations);}
function validateObservation(o,c){
 const urls=expectedContext(c);
 if(!object(o) || !STAGES.has(o.stage)) throw Error('Unapproved observation stage');
 const response=object(o.response) ? o.response : {}, b=response.body;
 const result=object(b) && b.jsonrpc==='2.0' && eq(b.id,o.id) && exactKeys(b,['jsonrpc','id','result']) ? b.result : undefined;
 let pass=false;
 switch(o.stage){
 case 'metadata':pass=response.status===200 && eq(b,{resource:urls.resource,authorization_servers:[c.issuer],scopes_supported:['api','refresh_token'],bearer_methods_supported:['header']});break;
 case 'challenge':pass=response.status===401 && eq(b,{error:'authentication_required'}) && response.headers?.['www-authenticate']==='Bearer resource_metadata="'+urls.metadata+'", scope="api refresh_token"';break;
 case 'invalid-route':pass=response.status===404 && eq(b,{error:'unknown_probe_route'});break;
 case 'missing-use':pass=response.status===403 && eq(b,{error:'cardstack_use_required'});break;
 case 'method-denied':pass=response.status===405 && eq(b,{error:'method_not_allowed'});break;
 case 'notification':pass=response.status===202 && (b===null || b===undefined || b==='');break;
 case 'initialize':pass=response.status===200 && exactKeys(result,['protocolVersion','serverInfo','capabilities']) && result.protocolVersion===o.protocolVersion && ['2025-06-18','2025-11-25'].includes(result.protocolVersion) && eq(result.serverInfo,{name:'Cardstack canonical synthetic probe',version:'0.0.1'}) && eq(result.capabilities,{tools:{},resources:{},extensions:{'io.modelcontextprotocol/ui':{}}});break;
 case 'ping':pass=response.status===200 && eq(result,{});break;
 case 'tools':pass=response.status===200 && exactKeys(result,['tools']) && Array.isArray(result.tools) && result.tools.length===2 && result.tools.every(toolShape) && eq(result.tools,TOOLS);break;
 case 'resources':pass=response.status===200 && eq(result,{resources:[{uri:URI,name:'cardstack_apex_transport_probe',mimeType:MIME}]});break;
 case 'html':{
 if(exactKeys(result,['contents']) && Array.isArray(result.contents) && result.contents.length===1){
  const r=result.contents[0];
  pass=response.status===200 && exactKeys(r,['uri','mimeType','text','_meta']) && r.uri===URI && r.mimeType===MIME && typeof r.text==='string' && createHash('sha256').update(r.text).digest('hex')===c.htmlHash && eq(r._meta,RESOURCE_META);
 }
 break;
 }
 case 'open':pass=response.status===200 && fallback(result,OPEN_TEXT) && eq(result.structuredContent,{status:'ready'});break;
 case 'echo':pass=response.status===200 && values(o.expectedValues) && fallback(result,ECHO_TEXT) && values(result.structuredContent) && eq(result.structuredContent,o.expectedValues);break;
 case 'rpc-error':pass=response.status===200 && exactKeys(b,['jsonrpc','id','error']) && b.jsonrpc==='2.0' && eq(b.id,o.id) && exactKeys(b.error,['code','message']) && b.error.code===o.code && [-32700,-32600,-32602,-32601,-32603].includes(o.code) && typeof b.error.message==='string' && ['Invalid JSON request','Invalid protocol request','Invalid params','Invalid protocol version','Request exceeds synthetic probe limit','Unknown method','Unknown resource','Synthetic UI unavailable','Invalid tool params','Unexpected arguments','Unknown tool','Exact seven arguments required','Invalid argument type or size'].includes(b.error.message);break;
 }
 return {stage:o.stage,status:pass?'Pass':'Fail',evidence:'injected-http-contract'};
}
function validateReceipt(r){
 if(!exactKeys(r,['schemaVersion','liveExecution','stages']) || r.schemaVersion!==1 || r.liveExecution!==false || !Array.isArray(r.stages) || !r.stages.every(s=>exactKeys(s,['stage','status','evidence']) && STAGES.has(s.stage) && ['Pass','Fail','Unknown'].includes(s.status) && s.evidence==='injected-http-contract')) throw Error('Invalid sanitized receipt');
 return r;
}
async function measure(context,cases,request){
 expectedContext(context);
 if(typeof request!=='function' || !Array.isArray(cases)) throw Error('Injected request function required');
 const stages=[];
 for(const entry of cases){
  if(!object(entry) || !STAGES.has(entry.stage) || !object(entry.request) || !['GET','POST','DELETE'].includes(entry.request.method) || !['mcp','metadata'].includes(entry.request.leaf)) throw Error('Unapproved request case');
  // Credentials, if ever used by an approved controller, belong entirely to its closure.
  const response=await request({method:entry.request.method,url:context.base+'/services/apexrest/cardstack/v1/'+context.client+'/'+entry.request.leaf,body:entry.request.body});
  stages.push(validateObservation({...entry,response},context));
 }
 return validateReceipt({schemaVersion:1,liveExecution:false,stages});
}
function validateLiveReceipt(r){
 const schema=require('./live-receipt.schema.json');
 const stage=schema.properties.stages.items.properties;
 const timestamp=x=>typeof x==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(x) && Number.isFinite(Date.parse(x));
 if(!exactKeys(r,schema.required) || r.schemaVersion!==1 || r.liveExecution!==true || !/^[a-f0-9]{64}$/.test(r.deployHash) || !/^[a-f0-9]{64}$/.test(r.cleanupHash) || !Array.isArray(r.stages) || !r.stages.every(s=>exactKeys(s,schema.properties.stages.items.required) && stage.stage.enum.includes(s.stage) && stage.status.enum.includes(s.status) && stage.source.enum.includes(s.source) && stage.code.enum.includes(s.code) && timestamp(s.startedAt) && timestamp(s.endedAt) && Date.parse(s.endedAt)>=Date.parse(s.startedAt) && object(s.checks) && Object.entries(s.checks).every(([k,v])=>Object.hasOwn(stage.checks.properties,k) && typeof v==='boolean'))) throw Error('Invalid sanitized live receipt');
 return r;
}
module.exports={validateObservation,validateReceipt,validateLiveReceipt,measure};
