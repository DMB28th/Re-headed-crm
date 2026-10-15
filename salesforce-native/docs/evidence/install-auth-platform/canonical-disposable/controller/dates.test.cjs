'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{verifyReviewedDates}=require('./dates.cjs');
const org='00D000000000001EAA',actor='005000000000001AAA',appId='0X0000000000001CAA',now=Date.parse('2026-10-10T16:00:00Z');
const base=[{name:'Card_Stack_SFAPP',id:appId,lastModifiedDate:'2026-10-10T15:00:00Z',policies:{jwtEnabled:true}},{name:'B',id:'0X0000000000002CAA',lastModifiedDate:'2026-10-10T15:00:00Z'}];
const off={kind:'APPROVED_JWT_TRANSITION',source:'operator-ui',approved:true,org,controller:actor,appName:'Card_Stack_SFAPP',appId,fromLastModifiedDate:'2026-10-10T15:00:00Z',toLastModifiedDate:'2026-10-10T15:59:00Z',fromJwtOn:true,jwtOn:false,savedVerified:true,humanUiReadback:true,checkedAt:'2026-10-10T15:59:01Z',reviewedAt:'2026-10-10T15:59:02Z',screenshotSha256:'1'.repeat(64)};
function args(){const current=structuredClone(base);current[0].lastModifiedDate=off.toLastModifiedDate;current[0].policies.jwtEnabled=false;return {baselineApps:base,currentApps:current,identity:{org,actor},transitions:[structuredClone(off)],verifyProof:()=>true,now};}
test('reviewed date exception requires exact chained saved UI transition and independently verified proof',async()=>{
 const a=args();await assert.doesNotReject(verifyReviewedDates(a));
 for(const modify of [v=>v.transitions=[],v=>v.verifyProof=undefined,v=>v.verifyProof=()=>false,v=>v.transitions[0].appId='0X0000000000009CAA',v=>v.transitions[0].fromLastModifiedDate='2026-10-10T14:00:00Z',v=>v.transitions[0].humanUiReadback=false,v=>v.transitions[0].jwtOn=true,v=>v.transitions[0].screenshotSha256='invalid']){const v=args();modify(v);await assert.rejects(verifyReviewedDates(v));}
});
test('other app dates remain exact and OFF/ON pair binds current saved ON state',async()=>{
 const a=args();a.currentApps[1].lastModifiedDate='2026-10-10T15:59:00Z';await assert.rejects(verifyReviewedDates(a),/OTHER_APP_DATE_DRIFT/);
 const b=args();b.transitions.push({...off,fromLastModifiedDate:off.toLastModifiedDate,toLastModifiedDate:'2026-10-10T15:59:10Z',fromJwtOn:false,jwtOn:true,checkedAt:'2026-10-10T15:59:11Z',reviewedAt:'2026-10-10T15:59:12Z'});b.currentApps[0].lastModifiedDate='2026-10-10T15:59:10Z';b.currentApps[0].policies.jwtEnabled=true;await assert.doesNotReject(verifyReviewedDates(b));
 b.currentApps[0].policies.jwtEnabled=false;await assert.rejects(verifyReviewedDates(b),/JWT_DATE_TERMINAL_BINDING/);
});
