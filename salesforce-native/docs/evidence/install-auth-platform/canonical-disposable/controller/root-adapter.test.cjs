'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createRootAdapter}=require('./root-adapter.cjs');
test('root adapter uses complete current username identity query and refuses paginated or ambiguous identity',async()=>{
 const seen=[];const connection={query:async q=>{seen.push(q);return {done:true,totalSize:1,records:[{Id:'005000000000001'}]};}};
 const args={connection,orgId:'00D000000000001',username:"private'operator",captureSnapshot:async()=>({}),captureInstalled:async()=>({})};
 const a=createRootAdapter(args);assert.deepEqual(await a.identity(),{org:'00D000000000001EAA',actor:'005000000000001AAA'});assert.equal(seen[0],"SELECT Id FROM User WHERE Username='private\\'operator'");
 connection.query=async()=>({done:false,totalSize:1,records:[{Id:'005000000000001'}],nextRecordsUrl:'/private'});await assert.rejects(a.identity(),/QUERY_INCOMPLETE/);
});
test('root adapter attaches deploy error listener and only polls requested checksum18 known job',async()=>{
 const calls=[];const promise=Promise.resolve({id:'0Af000000000001CAA'});promise.on=(name,fn)=>calls.push(['listener',name,typeof fn]);
 const c={query:async()=>({done:true,totalSize:1,records:[{Id:'005000000000001'}]}),metadata:{deploy:(zip,options)=>{calls.push(['deploy',zip.length,options]);return promise;},checkDeployStatus:async(...v)=>{calls.push(['status',...v]);return {done:false};}}};
 const a=createRootAdapter({connection:c,orgId:'00D000000000001',username:'private',captureSnapshot:async()=>({}),captureInstalled:async()=>({})});
 const zip=Buffer.from('fixture'),options={checkOnly:false};await a.enqueue(zip,options);await a.status('0Af000000000001',true,true);assert.deepEqual(calls,[['deploy',7,options],['listener','error','function'],['status','0Af000000000001CAA',true,true]]);
 await assert.rejects(a.status('0Af000000000001AAB',true,true),/ID_INVALID/);
});
