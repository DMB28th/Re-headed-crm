'use strict';
const {normalizeId}=require('./salesforce-id.cjs');
const expected={noUse:403,use:200,admin:403,unknown:404,nested:404,guest:401,fabricated:401,revokeUse:403,validToken:403,revokedToken:401};
// Pure private-measurement assessment; no network, tokens or private file reads.
function validate(receipt){
 const unknown={stage:'Unknown',scope:'ordinary-user native boundary'};
 try{
  if(!receipt||receipt.ordinaryInteractive!==true||receipt.profile!=='Minimum Access - Salesforce'||receipt.apiAccess!==true||receipt.ownedAssignmentRemoved!==true||receipt.tokenRevoked!==true)return unknown;
  const actor=normalizeId(receipt.actor),org=normalizeId(receipt.org);
  if(!Array.isArray(receipt.steps)||receipt.steps.length!==Object.keys(expected).length||receipt.steps.some((step,index)=>step?.name!==Object.keys(expected)[index]))return unknown;
  const seen=new Map();
  for(const step of receipt.steps){
   const m=step.measurement;
   if(step.error!==false||!m||m.transportFailure!==false||normalizeId(step.actor)!==actor||normalizeId(step.org)!==org||typeof step.tokenLabel!=='string'||!step.tokenLabel)return unknown;
   if(step.name!=='revokedToken'&&(m.validityPassed!==true||m.actorMatches!==true||m.identityStatus!==200||m.restStatus!==200))return unknown;
   if(typeof m.probeStatus!=='number')return unknown;
   seen.set(step.name,step);
  }
  const same=seen.get('noUse').tokenLabel;
  if(['use','admin','unknown','nested','guest','fabricated','revokeUse','validToken','revokedToken'].some(name=>seen.get(name).tokenLabel!==same))return unknown;
  const revoked=seen.get('revokedToken');
  if(revoked.preRevokeControl!=='validToken'||revoked.measurement.postRevokeRestStatus!==401)return unknown;
  const use=seen.get('use').measurement;
  if(use.schemaValid!==true||!use.privateCrud||Object.keys(use.privateCrud).sort().join(',')!=='create,delete,read,update'||['read','create','update','delete'].some(key=>typeof use.privateCrud[key]!=='boolean')||typeof receipt.managePermission!=='boolean')return unknown;
  // CRUD originates only in the exact validated Use measurement, never receipt defaults.
  const fail=receipt.managePermission||Object.values(use.privateCrud).some(value=>value!==false)||[...seen].some(([name,step])=>step.measurement.probeStatus!==expected[name]);
  return {stage:fail?'Fail':'Pass',scope:unknown.scope};
 }catch{return unknown;}
}
module.exports={validate};
