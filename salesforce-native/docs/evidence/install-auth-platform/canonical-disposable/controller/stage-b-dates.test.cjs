'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {selectSessionTransitions} = require('./stage-b-dates.cjs');
const org='00D000000000001EAA', actor='005000000000001AAA', appId='0X0000000000001CAA';
const time = n => `2026-10-10T15:${String(n).padStart(2,'0')}:00Z`;
const now = Date.parse(time(50));
function args() {
 const historicalApps = ['Card_Stack_SFAPP','Runtime','ChatGPT','Beta'].map((name,i)=>({name,id:`0X000000000000${i+1}CAA`,lastModifiedDate:time(0),policies:{jwtEnabled:true}}));
 const transitions = Array.from({length:7},(_,i)=>({kind:'APPROVED_JWT_TRANSITION',source:'operator-ui',approved:true,org,controller:actor,appName:'Card_Stack_SFAPP',appId,fromLastModifiedDate:time(i),toLastModifiedDate:time(i+1),fromJwtOn:i%2===0,jwtOn:i%2!==0,savedVerified:true,humanUiReadback:true,checkedAt:time(i+1),reviewedAt:time(i+1),screenshotSha256:String(i+1).repeat(64)}));
 const baselineApps=structuredClone(historicalApps);baselineApps[0].lastModifiedDate=time(6);
 return {historicalApps,baselineApps,identity:{org,actor},transitions,verifyProof:async()=>true,now};
}
test('consumes verified historical prefix and returns cloned OFF1 session suffix without input mutation',async()=>{
 const a=args(), original=structuredClone({...a,verifyProof:undefined}), verified=[];
 a.verifyProof=async proof=>{verified.push(proof.screenshotSha256);proof.kind='mutated callback copy';return true;};
 const suffix=await selectSessionTransitions(a);
 assert.deepEqual(suffix,a.transitions.slice(6));
 assert.deepEqual({...a,verifyProof:undefined},original);
 assert.equal(verified.length,13); // Entire chain, then the six-proof historical prefix.
 assert.deepEqual(verified.slice(7),a.transitions.slice(0,6).map(p=>p.screenshotSha256));
 suffix[0].kind='modified return';assert.equal(a.transitions[6].kind,'APPROVED_JWT_TRANSITION');
});
test('preserves aborted OFF1/ON1 and subsequent OFF2 in the session suffix',async()=>{
 const a=args();for(let i=7;i<9;i++)a.transitions.push({...a.transitions[0],fromLastModifiedDate:time(i),toLastModifiedDate:time(i+1),fromJwtOn:i%2===0,jwtOn:i%2!==0,checkedAt:time(i+1),reviewedAt:time(i+1)});
 assert.deepEqual(await selectSessionTransitions(a),a.transitions.slice(6));
});
test('rejects tampered prefix, suffix, holes, provenance, times and nonliteral private approval',async()=>{
 for(const mutate of [a=>a.transitions[0].approved=false,a=>a.transitions[1].screenshotSha256='invalid',a=>a.transitions[6].humanUiReadback=false,a=>a.transitions.splice(2,1),a=>a.transitions[0].controller='005000000000002AAA',a=>a.transitions[0].source='api',a=>a.transitions[0].reviewedAt=time(49),a=>a.verifyProof=()=>1,a=>a.verifyProof=undefined,a=>a.verifyProof=p=>p.screenshotSha256!=='1'.repeat(64)]){
  const a=args();mutate(a);await assert.rejects(selectSessionTransitions(a));
 }
});
test('date equal with wrong JWT state is not a boundary',async()=>{
 const a=args();a.baselineApps[0].policies.jwtEnabled=false;
 await assert.rejects(selectSessionTransitions(a),/SESSION_DATE_BOUNDARY_REQUIRED/);
});
test('ignores a same-date terminal with the wrong state while selecting the unique ON boundary',async()=>{
 const a=args();a.transitions[6].toLastModifiedDate=time(6);
 assert.deepEqual(await selectSessionTransitions(a),a.transitions.slice(6));
});
test('same-date distinct toggles yielding repeated matching states are ambiguous',async()=>{
 const a=args();a.baselineApps[0].lastModifiedDate=time(0);for(const p of a.transitions){p.fromLastModifiedDate=time(0);p.toLastModifiedDate=time(0);}
 await assert.rejects(selectSessionTransitions(a),/SESSION_DATE_BOUNDARY_AMBIGUOUS/);
});
test('rejects unrelated app date, ID and name drift, malformed sets and missing boundary',async()=>{
 for(const mutate of [a=>a.baselineApps[1].lastModifiedDate=time(4),a=>a.baselineApps[1].id='0X0000000000009CAA',a=>a.baselineApps[1].name='Other',a=>a.baselineApps.pop(),a=>a.baselineApps[2]=structuredClone(a.baselineApps[1]),a=>a.baselineApps[0].lastModifiedDate=time(40),a=>a.baselineApps[0].policies.jwtEnabled=undefined]){
  const a=args();mutate(a);await assert.rejects(selectSessionTransitions(a));
 }
});
test('zero prefix requires matching historical date and state including first proof state fallback',async()=>{
 const a=args();a.baselineApps=structuredClone(a.historicalApps);assert.deepEqual(await selectSessionTransitions(a),a.transitions);
 delete a.historicalApps[0].policies;assert.deepEqual(await selectSessionTransitions(a),a.transitions);
 a.transitions=[];await assert.rejects(selectSessionTransitions(a),/SESSION_DATE_BOUNDARY_REQUIRED/);
});
test('empty chain with known matching state needs no proof verifier',async()=>{
 const a=args();a.baselineApps=structuredClone(a.historicalApps);a.transitions=[];delete a.verifyProof;
 assert.deepEqual(await selectSessionTransitions(a),[]);
});
test('rejects supplied nonchecksum18 identifiers instead of silently normalizing them',async()=>{
 for(const mutate of [a=>a.historicalApps[0].id=appId.slice(0,15),a=>a.identity.org=org.slice(0,15),a=>a.transitions[0].controller=actor.slice(0,15),a=>a.transitions[0].appId='0X0000000000001AAA']){
  const a=args();mutate(a);await assert.rejects(selectSessionTransitions(a),/ID/);
 }
});
test('import performs no filesystem, network, child-process or auth operations',()=>{
 const Module=require('node:module'), original=Module._load;
 delete require.cache[require.resolve('./stage-b-dates.cjs')];
 Module._load=function(name,...rest){assert.ok(!/^(?:node:)?(?:fs|https?|net|tls|child_process)$/.test(name),`unexpected IO import: ${name}`);return original.call(this,name,...rest);};
 try{assert.equal(typeof require('./stage-b-dates.cjs').selectSessionTransitions,'function');}finally{Module._load=original;}
});
