'use strict';
const {httpsOrigin,identityUrl,boundedGet}=require('./http-core.cjs');
const {normalizeId}=require('./salesforce-id.cjs');
// Explicit injected transport is required. No CLI/default fetch or filesystem credential loading.
async function measure(input,fetcher){
 const failure={validityPassed:false,schemaValid:false,transportFailure:true};
 try{
  if(typeof fetcher!=='function')return failure;
  const actor=normalizeId(input.expectedActor),org=normalizeId(input.expectedOrg);
  const approved=input.approved;
  if(!approved||httpsOrigin(approved.instanceOrigin)!==approved.instanceOrigin||httpsOrigin(approved.loginOrigin)!==approved.loginOrigin||httpsOrigin(approved.identityOrigin)!==approved.identityOrigin)return failure;
  const origin=httpsOrigin(input.token.instanceUrl),idUrl=identityUrl(input.token,org);
  if(input.token.instanceUrl!==approved.instanceOrigin||input.token.loginOrigin!==approved.loginOrigin||new URL(idUrl).origin!==approved.identityOrigin||input.siteBase!==approved.siteBase)return failure;
  if(normalizeId(new URL(idUrl).pathname.split('/')[3])!==actor)return failure;
  const site=new URL(input.siteBase);
  if(site.protocol!=='https:'||!site.hostname.endsWith('.my.salesforce-sites.com')||site.username||site.password||site.port||site.pathname!=='/cardstackauthprobe'||site.search||site.hash)return failure;
  if(!['named','revoked','guest','fabricated'].includes(input.mode)||!['use','admin','other','nested/use'].includes(input.route)||typeof input.token.accessToken!=='string'||!input.token.accessToken)return failure;
  const restUrl=origin+'/services/data/v67.0/sobjects';
  const probeUrl=site.href+'/services/apexrest/cardstack-ordinary-user-probe/v1/'+input.route;
  if(input.mode==='revoked'){
   const rest=await boundedGet(restUrl,input.token.accessToken,fetcher,2*1024*1024);
   const probe=await boundedGet(probeUrl,input.token.accessToken,fetcher);
   return {validityPassed:false,schemaValid:false,postRevokeRestStatus:rest.status,probeStatus:probe.status,transportFailure:!!rest.error||!!probe.error};
  }
  const identity=await boundedGet(idUrl,input.token.accessToken,fetcher);
  const rest=await boundedGet(restUrl,input.token.accessToken,fetcher,2*1024*1024);
  let identityMatches=false;
  try{identityMatches=identity.status===200&&identity.body?.asserted_user===true&&normalizeId(identity.body.user_id)===actor&&normalizeId(identity.body.organization_id)===org;}catch{}
  const validityPassed=identityMatches&&rest.status===200&&Array.isArray(rest.body?.sobjects);
  const probe=await boundedGet(probeUrl,input.mode==='guest'?null:input.mode==='fabricated'?'deliberately-invalid-boundary-control':input.token.accessToken,fetcher);
  const body=probe.body;const keys=['authorized','namedActor','privateCreate','privateDelete','privateRead','privateUpdate'];
  const schemaValid=input.route==='use'&&probe.status===200&&body&&Object.keys(body).sort().join(',')===keys.join(',')&&keys.every(key=>typeof body[key]==='boolean')&&body.namedActor===true&&body.authorized===true;
  return {validityPassed,schemaValid:!!schemaValid,identityStatus:identity.status,restStatus:rest.status,actorMatches:identityMatches,probeStatus:probe.status,transportFailure:!!identity.error||!!rest.error||!!probe.error,...(schemaValid?{privateCrud:{read:body.privateRead,create:body.privateCreate,update:body.privateUpdate,delete:body.privateDelete}}:{})};
 }catch{return failure;}
}
module.exports={measure};
