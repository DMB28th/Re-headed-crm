'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const core=require('./core.cjs'),stage=require('./stage-b-session.cjs');
const source=path.resolve(__dirname,'../../../../../../.superpowers/sdd/2026-10-08-mcp-apps-install-auth/task-8-root-closure-reader-source.cjs');
const org='00D000000000001EAA',actor='005000000000001AAA',identity={org,actor},jobId='0Af000000000001CAA';
const statusName='cleanup-status-1791644400000-012345abcdef-private.json';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function fixture(){
 const snap={identity,existingApps:[{name:'Card_Stack_SFAPP',id:'0X0000000000001CAA',policies:{jwtEnabled:true}}]},binding=core.digest(snap);
 const owned={binding,org,actor,classes:[{name:'CardstackCanonicalProbe',id:'01p000000000001AAA'},{name:'CardstackCanonicalProbeTest',id:'01p000000000002AAA'}],resource:{name:'CardstackCanonicalProbeUi',id:'081000000000001AAA'},permissionSet:{name:'Cardstack_Canonical_Probe',id:'0PS000000000003GAA'},references:[],operatorProfileMetadata:{fullName:'Admin'},guestProfileMetadata:{fullName:'Guest'},guestProfileMetadataDigest:core.digest({fullName:'Guest'})};
 const prepared={binding,identity,ownedDigest:core.digest(owned),cleanupHash:core.CLEANUP_HASH,testGateDigest:'1'.repeat(64),jobDigest:'2'.repeat(64),rootSiteUi:{source:'root-cua',twoPhase:true,siteUpdateable:false,statusUpdateable:false}};
 const result={done:true,success:true,status:'Succeeded',numberComponentErrors:0,numberTestErrors:0};
 const records={
 'baseline-private.json':{snapshot:snap,binding},
 'cleanup-final-private.json':{binding,jobId,ownedDigest:core.digest(owned),accessPreparationDigest:core.digest(prepared),journalDigest:'3'.repeat(64),baselinePreserved:true,ownedComponentsAbsent:true,jwtOnProof:{source:'operator-ui',org,controller:actor,appName:'Card_Stack_SFAPP',appId:'0X0000000000001CAA',jwtOn:true,savedVerified:true,checkedAt:'2026-10-10T15:00:01Z'}},
 'cleanup-terminal-private.json':{binding,jobId,statusRecord:statusName,result},
 [statusName]:{binding,jobId,result,checkedAt:'2026-10-10T15:00:00Z'},
 'cleanup-job-private.json':{binding,id:jobId,org,actor},
 'cleanup-attempt-private.json':{binding,zipHash:core.CLEANUP_HASH,preflightDigest:'4'.repeat(64),org,actor,at:'2026-10-10T14:59:00Z'},
 'owned-components-private.json':owned,'access-prepared-private.json':prepared
 };
 const files=new Map(),reads=new Map();let seal;
 function reseal(){files.clear();for(const[n,r]of Object.entries(records))files.set(path.join(core.PRIVATE_DIR,n),Buffer.from(JSON.stringify(r)));seal={identity,files:Object.fromEntries(Object.keys(records).map(n=>[n,hash(files.get(path.join(core.PRIVATE_DIR,n)))]))};saveSeal();}
 function saveSeal(){files.set(path.join(stage.PRIVATE_DIR,'stage-a-closure-seal-private.json'),Buffer.from(JSON.stringify(seal)));}
 reseal();
 const descriptors=new Map();let next=1;
 const stat={isFile:()=>true,isSymbolicLink:()=>false,mode:0o100600,nlink:1,dev:1,ino:1};
 const boundary={constants:fs.constants,lstatSync:p=>{assert(files.has(p),'Synthetic record exists');return stat;},openSync:p=>{assert(files.has(p));const fd=next++;descriptors.set(fd,p);return fd;},fstatSync:fd=>{assert(descriptors.has(fd));return stat;},closeSync:fd=>descriptors.delete(fd),readFileSync:p=>{if(typeof p==='number')p=descriptors.get(p);assert(files.has(p),'No real private file access');reads.set(p,(reads.get(p)||0)+1);return Buffer.from(files.get(p));}};
 function load(){const module={exports:{}};vm.runInThisContext('(function(require,module,exports,__dirname){'+fs.readFileSync(source,'utf8')+'\n})',{filename:source})(n=>n==='node:fs'?boundary:n.endsWith('/core.cjs')?core:n.endsWith('/stage-b-session.cjs')?stage:require(n),module,module.exports,stage.PRIVATE_DIR);return module.exports;}
 return {records,files,reads,boundary,load,reseal,saveSeal,get seal(){return seal;}};
}
test('root closure reader accepts complete exact eight-file closure proof',async()=>{const f=fixture();assert.equal(await f.load().verifyStageAClosure({identity}),true);});
test('root closure reader rejects empty partial extra and malformed seal hashes',async()=>{
 for(const kind of ['empty','partial','extra','malformed']){const f=fixture();if(kind==='empty')f.seal.files={};if(kind==='partial')delete f.seal.files['cleanup-attempt-private.json'];if(kind==='extra')f.seal.files['extra-private.json']='0'.repeat(64);if(kind==='malformed')f.seal.files['baseline-private.json']='not-sha';f.saveSeal();await assert.rejects(f.load().verifyStageAClosure({identity}));}
});
test('root closure reader rejects bytes changed after the seal was produced',async()=>{const f=fixture();f.files.set(path.join(core.PRIVATE_DIR,'cleanup-attempt-private.json'),Buffer.from('{}'));await assert.rejects(f.load().verifyStageAClosure({identity}));});
test('root closure reader rejects wrong status binding and cleanup job identity',async()=>{
 for(const edit of [f=>f.records[statusName].binding='0'.repeat(64),f=>f.records['cleanup-job-private.json'].actor='005000000000002AAA',f=>f.records['cleanup-job-private.json'].org='00D000000000002EAA']){const f=fixture();edit(f);f.reseal();await assert.rejects(f.load().verifyStageAClosure({identity}));}
});
test('root closure reader rejects other status filenames even when resealed',async()=>{
 for(const name of ['deploy-status-1791644400000-012345abcdef-private.json','cleanup-status-1-short-private.json','cleanup-status-1791644400000-012345abcdef-private.json/../other-private.json']){const f=fixture();f.records['cleanup-terminal-private.json'].statusRecord=name;f.records[name]=f.records[statusName];delete f.records[statusName];f.reseal();await assert.rejects(f.load().verifyStageAClosure({identity}));}
});
test('root closure reader rejects resealed cleanup artifact ownership and preparation drift',async()=>{
 for(const edit of [f=>f.records['cleanup-attempt-private.json'].zipHash='0'.repeat(64),f=>f.records['cleanup-attempt-private.json'].actor='005000000000002AAA',f=>f.records['access-prepared-private.json'].cleanupHash='0'.repeat(64),f=>f.records['owned-components-private.json'].actor='005000000000002AAA',f=>f.records['cleanup-final-private.json'].ownedDigest='0'.repeat(64),f=>f.records['cleanup-final-private.json'].accessPreparationDigest='0'.repeat(64),f=>f.records['access-prepared-private.json'].identity={org,actor:'005000000000002AAA'}]){const f=fixture();edit(f);f.reseal();await assert.rejects(f.load().verifyStageAClosure({identity}));}
});
test('root closure reader parses only the bytes it hashed and reads each record once',async()=>{
 const f=fixture(),read=f.boundary.readFileSync;f.boundary.readFileSync=p=>{const name=typeof p==='number'?null:p;const bytes=read(p);if(name&&f.reads.get(name)>1)return Buffer.from('{}');return bytes;};assert.equal(await f.load().verifyStageAClosure({identity}),true);for(const n of Object.keys(f.seal.files))assert.equal(f.reads.get(path.join(core.PRIVATE_DIR,n)),1);
});
test('root closure reader imports without filesystem I/O',()=>{const f=fixture();for(const k of ['lstatSync','openSync','fstatSync','readFileSync'])f.boundary[k]=()=>assert.fail('Import I/O');f.load();});
test('root closure reader requires every mandatory seal member separately',async()=>{
 for(const name of Object.keys(fixture().seal.files)){const f=fixture();delete f.seal.files[name];f.saveSeal();await assert.rejects(f.load().verifyStageAClosure({identity}),/STAGE_A_CLOSURE_UNPROVED/);}
 for(const files of [undefined,null,[],false,'invalid']){const f=fixture();f.seal.files=files;f.saveSeal();await assert.rejects(f.load().verifyStageAClosure({identity}),/STAGE_A_CLOSURE_UNPROVED/);}
});
test('root closure reader verifies all hashes before parsing any evidence record',async()=>{
 const f=fixture(),name=path.join(core.PRIVATE_DIR,'baseline-private.json');f.files.set(name,Buffer.from('invalid json'));f.seal.files['baseline-private.json']=hash(f.files.get(name));f.seal.files['access-prepared-private.json']='0'.repeat(64);f.saveSeal();await assert.rejects(f.load().verifyStageAClosure({identity}),/STAGE_A_CLOSURE_UNPROVED/);
});
test('root closure reader refuses private mode symlink hardlink and descriptor substitution',async()=>{
 for(const change of [{mode:0o100644},{isSymbolicLink:()=>true},{nlink:2}]){const f=fixture(),stat=f.boundary.lstatSync;f.boundary.lstatSync=p=>({...stat(p),...change});await assert.rejects(f.load().verifyStageAClosure({identity}),/PRIVATE_RECORD/);}
 const f=fixture(),stat=f.boundary.fstatSync;f.boundary.fstatSync=fd=>({...stat(fd),ino:2});await assert.rejects(f.load().verifyStageAClosure({identity}),/PRIVATE_RECORD/);
});
test('root closure reader compares normalized full job identity and rejects malformed checksum',async()=>{
 const f=fixture();f.records['cleanup-job-private.json'].org=org.slice(0,15);f.records['cleanup-job-private.json'].actor=actor.slice(0,15);f.reseal();assert.equal(await f.load().verifyStageAClosure({identity}),true);
 f.records['cleanup-job-private.json'].actor='005000000000001AAB';f.reseal();await assert.rejects(f.load().verifyStageAClosure({identity}),/ID_INVALID/);
});
test('root closure reader normalizes full cleanup job IDs and rejects mismatched readback IDs',async()=>{
 const f=fixture();f.records['cleanup-job-private.json'].id=jobId.slice(0,15);for(const n of ['cleanup-final-private.json','cleanup-terminal-private.json',statusName])f.records[n].jobId=jobId.slice(0,15);f.reseal();assert.equal(await f.load().verifyStageAClosure({identity}),true);
 for(const n of ['cleanup-final-private.json','cleanup-terminal-private.json',statusName]){const bad=fixture();bad.records[n].jobId='0Af000000000002CAA';bad.reseal();await assert.rejects(bad.load().verifyStageAClosure({identity}),/STAGE_A_CLOSURE_UNPROVED/);}
 const checksum=fixture();checksum.records['cleanup-job-private.json'].id='0Af000000000001CAB';checksum.reseal();await assert.rejects(checksum.load().verifyStageAClosure({identity}),/ID_INVALID/);
});
test('root closure reader validates saved ON proof identity and full deployment app checksum18',async()=>{
 for(const edit of [p=>p.appId='0X0000000000001CAB',p=>p.org='00D000000000002EAA',p=>p.controller='005000000000002AAA',p=>p.savedVerified=false,p=>p.jwtOn=false,p=>p.checkedAt='2026-10-10T14:58:00Z']){const f=fixture();edit(f.records['cleanup-final-private.json'].jwtOnProof);f.reseal();await assert.rejects(f.load().verifyStageAClosure({identity}));}
});
