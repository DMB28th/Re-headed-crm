'use strict';
// Pure guard around root's independently reviewed append-only UI/date evidence.
// No file/auth reads or writes. This cannot prove a screenshot without root verifier.
const need=(v,c)=>{if(!v)throw Error(c);};
async function verifyReviewedDates({baselineApps,currentApps,identity,transitions=[],verifyProof,now}){
 const {normalizeId:id,normalizeRecords,equal}=require('./core.cjs');
 const before=normalizeRecords(baselineApps),current=normalizeRecords(currentApps),chain=normalizeRecords(transitions),who=normalizeRecords(identity);
 need(Array.isArray(before)&&Array.isArray(current)&&equal(before.map(a=>({name:a.name,id:a.id})),current.map(a=>({name:a.name,id:a.id}))),'APP_DATE_BINDING');
 for(const b of before){need(typeof b.lastModifiedDate==='string'&&Number.isFinite(Date.parse(b.lastModifiedDate)),'APP_DATE_REQUIRED');const c=current.find(a=>a.id===b.id);need(c&&Number.isFinite(Date.parse(c.lastModifiedDate)),'APP_DATE_REQUIRED');if(b.name!=='Card_Stack_SFAPP')need(c.lastModifiedDate===b.lastModifiedDate,'OTHER_APP_DATE_DRIFT');}
 const targets=before.filter(a=>a.name==='Card_Stack_SFAPP');need(targets.length===1,'DEPLOY_APP_DATE_BINDING');const target=targets[0],live=current.find(a=>a.id===target.id);
 if(!chain.length){need(live.lastModifiedDate===target.lastModifiedDate,'JWT_DATE_PROOF_REQUIRED');return;}
 need(typeof verifyProof==='function','JWT_DATE_VERIFIER_REQUIRED');let previous=target.lastModifiedDate,previousJwt=target.policies?.jwtEnabled,previousReview=-Infinity;
 for(const proof of chain){
  need(proof.kind==='APPROVED_JWT_TRANSITION'&&proof.source==='operator-ui'&&proof.approved===true&&id(proof.org)===who.org&&id(proof.controller)===who.actor&&proof.appName==='Card_Stack_SFAPP'&&id(proof.appId)===target.id&&proof.fromLastModifiedDate===previous&&proof.savedVerified===true&&proof.humanUiReadback===true&&typeof proof.fromJwtOn==='boolean'&&typeof proof.jwtOn==='boolean'&&proof.fromJwtOn!==proof.jwtOn&&(previousJwt===undefined||proof.fromJwtOn===previousJwt),'JWT_DATE_PROOF_BINDING');
  const from=Date.parse(proof.fromLastModifiedDate),to=Date.parse(proof.toLastModifiedDate),checked=Date.parse(proof.checkedAt),reviewed=Date.parse(proof.reviewedAt);
  need([from,to,checked,reviewed].every(Number.isFinite)&&to>=from&&checked>=to&&reviewed>=checked&&reviewed>=previousReview&&reviewed<=now+60000&&/^[a-f0-9]{64}$/.test(proof.screenshotSha256),'JWT_DATE_PROOF_TIME');
  need(await verifyProof(structuredClone(proof))===true,'JWT_DATE_PRIVATE_PROOF');previous=proof.toLastModifiedDate;previousJwt=proof.jwtOn;previousReview=reviewed;
 }
 need(live.lastModifiedDate===previous&&live.policies?.jwtEnabled===previousJwt,'JWT_DATE_TERMINAL_BINDING');
}
module.exports={verifyReviewedDates};
