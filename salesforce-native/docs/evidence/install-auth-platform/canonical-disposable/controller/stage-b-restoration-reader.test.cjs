'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const core=require('./core.cjs'),{PRIVATE_DIR}=require('./stage-b-session.cjs');
const source=path.join(__dirname,'stage-b-restoration-reader.cjs');
const names=['intent','result','ui','before','after'].map(n=>'root-site-restoration-'+n+'-private.json').concat('root-site-restoration-inactive.png');
const sealName='root-site-restoration-evidence-seal-private.json';
const iso=n=>new Date(Date.now()-10000+n*1000).toISOString();
function fixture(extraSite={}){
 const identity={org:core.normalizeId('00D000000000001'),actor:core.normalizeId('005000000000001')};
 const site={Id:core.normalizeId('0DM000000000001'),Status:'Inactive',GuestUserId:core.normalizeId('005000000000002'),UrlPathPrefix:'cardstackauthprobe',...extraSite};
 const baseline={snapshot:{identity,site}};baseline.binding=core.digest(baseline.snapshot);
 const intent={kind:'ROOT_SITE_RESTORATION_INTENT',version:1,org:identity.org,controller:identity.actor,siteId:site.Id,siteName:'CardstackAuthDiscoveryProbe',fromActive:true,toActive:false,baselineBinding:baseline.binding,ownedDigest:'a'.repeat(64),accessPreparationDigest:'b'.repeat(64),priorJournalDigest:'c'.repeat(64),checkedAt:iso(2)};
 const result={source:'operator-ui',org:identity.org,controller:identity.actor,siteId:site.Id,active:false,savedVerified:true,checkedAt:iso(3),intentDigest:core.digest(intent)};
 const query=status=>({done:true,totalSize:1,records:[{...site,Status:status}]});
 const values=[intent,result,{checkedAt:result.checkedAt,proof:result,ax:'42 link Activate, Help: Activate - Record 1 - Cardstack Auth Discovery Probe, Value: Activate'}, {checkedAt:iso(1),identity,priorJournalDigest:intent.priorJournalDigest,site:query('Active')},{checkedAt:iso(4),identity,site:query('Inactive')},Buffer.from('synthetic PNG bytes')];
 const files=Object.fromEntries(names.map((n,i)=>[n,Buffer.isBuffer(values[i])?values[i]:Buffer.from(JSON.stringify(values[i]))]));
 const stats={},reads={};const base={dev:1,ino:1,mode:0o700,nlink:1,birthtimeMs:1,mtimeMs:1,isDirectory:()=>true,isFile:()=>false,isSymbolicLink:()=>false};
 names.concat(sealName).forEach((n,i)=>stats[n]={...base,ino:i+2,mode:0o600,isDirectory:()=>false,isFile:()=>true,birthtimeMs:i===0?10:20,mtimeMs:i===0?10:20});
 function seal(){files[sealName]=Buffer.from(JSON.stringify(Object.fromEntries(names.map(n=>[n,core.sha(files[n])]))));}seal();
 function edit(n,fn){const v=JSON.parse(files[n]);fn(v);files[n]=Buffer.from(JSON.stringify(v));seal();}
 const fake={constants:fs.constants,lstatSync:t=>t===PRIVATE_DIR?base:stats[path.basename(t)],realpathSync:t=>t,openSync:t=>t,fstatSync:t=>stats[path.basename(t)],readFileSync:t=>{const n=path.basename(t);reads[n]=(reads[n]||0)+1;return files[n];},closeSync:()=>{}};
 const module={exports:{}};vm.runInNewContext(fs.readFileSync(source,'utf8'),{require:n=>n==='node:fs'?fake:n==='./core.cjs'?core:n==='./stage-b-session.cjs'?{PRIVATE_DIR}:require(n),module,Buffer,structuredClone,Date});
 return {baseline,intent,result,files,stats,base,reads,seal,edit,fake,reader:module.exports.createRootRestorationEvidenceReader};
}
test('import performs no evidence IO; valid sealed evidence produces exact recovery proof and reads each file once',async()=>{
 const f=fixture();assert.deepEqual(f.reads,{});const proof=await f.reader({dir:PRIVATE_DIR,baseline:f.baseline})({intent:f.intent,result:f.result});
 assert.equal(JSON.stringify(proof),JSON.stringify({verified:true,intentDigest:core.digest(f.intent),resultDigest:core.digest(f.result),intentPersistedBeforeUi:true,actualSavedUiVerified:true,restSiteInactiveVerified:true,identity:f.baseline.snapshot.identity,siteId:f.intent.siteId}));
 assert.deepEqual(f.reads,Object.fromEntries(names.concat(sealName).map(n=>[n,1])));
});
const mutations={
 'partial seal':f=>{const s=JSON.parse(f.files[sealName]);delete s[names[0]];f.files[sealName]=Buffer.from(JSON.stringify(s));},
 'extra seal key':f=>{const s=JSON.parse(f.files[sealName]);s.other='a'.repeat(64);f.files[sealName]=Buffer.from(JSON.stringify(s));},
 'tampered screenshot':f=>{f.files[names[5]]=Buffer.from('changed');},
 'directory mode':f=>{f.base.mode=0o755;},'directory symlink':f=>{f.base.isSymbolicLink=()=>true;},
 'file mode':f=>{f.stats[names[0]].mode=0o644;},'file symlink':f=>{f.stats[names[0]].isSymbolicLink=()=>true;},'file hardlink':f=>{f.stats[names[0]].nlink=2;},
 'extra REST attributes':f=>f.edit(names[4],v=>v.site.records[0].attributes={type:'Site'}),
 'changed original field':f=>f.edit(names[4],v=>v.site.records[0].UrlPathPrefix='wrong'),
 'wrong full site id':f=>f.edit(names[4],v=>v.site.records[0].Id=core.normalizeId('0DM000000000002')),
 'invalid identity checksum':f=>f.edit(names[4],v=>v.identity.org=v.identity.org.slice(0,15)+'ZZZ'),
 'short identity':f=>f.edit(names[4],v=>v.identity.actor=v.identity.actor.slice(0,15)),
 'extra query row':f=>f.edit(names[4],v=>v.site.records.push(v.site.records[0])),
 'partial query':f=>f.edit(names[4],v=>v.site.done=false),
 'query pagination':f=>f.edit(names[4],v=>v.site.nextRecordsUrl='/next'),
 'wrong UI row':f=>f.edit(names[2],v=>v.ax=v.ax.replace('Record 1','Record 2')),
 'unanchored UI claim':f=>f.edit(names[2],v=>v.ax='claimed '+v.ax),
 'Deactivate UI':f=>f.edit(names[2],v=>v.ax+='\n43 link Deactivate'),
 'privileges error':f=>f.edit(names[2],v=>v.ax+='\nInsufficient Privileges'),
 'UI proof mismatch':f=>f.edit(names[2],v=>v.proof.savedVerified=false),
 'UI date mismatch':f=>f.edit(names[2],v=>v.checkedAt=iso(4)),
 'missing chronology':f=>f.edit(names[3],v=>delete v.checkedAt),
 'before after intent':f=>f.edit(names[3],v=>v.checkedAt=iso(4)),
 'after before result':f=>f.edit(names[4],v=>v.checkedAt=iso(2)),
 'after in future':f=>f.edit(names[4],v=>v.checkedAt=new Date(Date.now()+60000).toISOString()),
 'intent filesystem mtime late':f=>{f.stats[names[0]].mtimeMs=30;},
 'intent filesystem birthtime late':f=>{f.stats[names[0]].birthtimeMs=30;},
 'prior journal mismatch':f=>f.edit(names[3],v=>v.priorJournalDigest='d'.repeat(64)),
 'stored callback mismatch':f=>{f.result={...f.result,checkedAt:iso(5)};},
 'wrong baseline binding':f=>{f.baseline.binding='d'.repeat(64);}
};
for(const [label,mutate] of Object.entries(mutations))test('rejects '+label,async()=>{const f=fixture();mutate(f);await assert.rejects(async()=>f.reader({dir:PRIVATE_DIR,baseline:f.baseline})({intent:f.intent,result:f.result}));});
test('rejects alternate directory',()=>{const f=fixture();assert.throws(()=>f.reader({dir:'/alternate',baseline:f.baseline}));});

test('rejects every missing seal member and non SHA256 hash',async()=>{
 for(const n of names){const f=fixture();const seal=JSON.parse(f.files[sealName]);delete seal[n];f.files[sealName]=Buffer.from(JSON.stringify(seal));await assert.rejects(async()=>f.reader({dir:PRIVATE_DIR,baseline:f.baseline})({intent:f.intent,result:f.result}));}
 const f=fixture(),seal=JSON.parse(f.files[sealName]);seal[names[0]]='not-sha256';f.files[sealName]=Buffer.from(JSON.stringify(seal));await assert.rejects(async()=>f.reader({dir:PRIVATE_DIR,baseline:f.baseline})({intent:f.intent,result:f.result}));
});
test('rejects directory realpath redirection and inode replacement',async()=>{
 const f=fixture();f.fake.realpathSync=()=>'/redirected';assert.throws(()=>f.reader({dir:PRIVATE_DIR,baseline:f.baseline}));
 const g=fixture(),reader=g.reader({dir:PRIVATE_DIR,baseline:g.baseline});const stat=g.fake.lstatSync;g.fake.lstatSync=t=>t===PRIVATE_DIR?{...g.base,ino:99}:stat(t);await assert.rejects(reader({intent:g.intent,result:g.result}));
});
test('rejects descriptor replacement, nonregular records and insecure seal',async()=>{
 for(const mutate of [f=>{const stat=f.fake.fstatSync;f.fake.fstatSync=t=>({...stat(t),ino:999});},f=>{f.stats[names[3]].isFile=()=>false;},f=>{f.stats[sealName].mode=0o644;}]){const f=fixture();mutate(f);await assert.rejects(async()=>f.reader({dir:PRIVATE_DIR,baseline:f.baseline})({intent:f.intent,result:f.result}));}
});
test('rejects exact schema violations and full REST actor mismatch',async()=>{
 for(const [n,mutate] of [[names[4],v=>v.identity.actor=core.normalizeId('005000000000003')],[names[4],v=>delete v.site.records[0].GuestUserId],[names[4],v=>v.site.records[0].unexpected=true],[names[3],v=>v.site.totalSize=2],[names[2],v=>v.extra=true],[names[4],v=>v.site.records[0].Status='Active']]){const f=fixture();f.edit(n,mutate);await assert.rejects(async()=>f.reader({dir:PRIVATE_DIR,baseline:f.baseline})({intent:f.intent,result:f.result}));}
});
test('revalidates evidence on repeated callback calls rather than caching proof',async()=>{
 const f=fixture(),reader=f.reader({dir:PRIVATE_DIR,baseline:f.baseline});await reader({intent:f.intent,result:f.result});f.files[names[5]]=Buffer.from('later tampering');await assert.rejects(reader({intent:f.intent,result:f.result}));
});
test('invalid result chronology remains rejected when stored input and UI are consistently resealed',async()=>{
 const f=fixture();f.result.checkedAt=f.intent.checkedAt;f.files[names[1]]=Buffer.from(JSON.stringify(f.result));f.edit(names[2],v=>{v.proof=f.result;v.checkedAt=f.result.checkedAt;});f.seal();await assert.rejects(async()=>f.reader({dir:PRIVATE_DIR,baseline:f.baseline})({intent:f.intent,result:f.result}));
});

test('accepts exact original four-field normalized Site baseline without Name or attributes',async()=>{
 const f=fixture();assert.deepEqual(Object.keys(f.baseline.snapshot.site).sort(),['GuestUserId','Id','Status','UrlPathPrefix']);assert.equal((await f.reader({dir:PRIVATE_DIR,baseline:f.baseline})({intent:f.intent,result:f.result})).verified,true);
});
test('rejects wrong original prefix and baseline GuestUserId checksum18',()=>{
 for(const edit of [s=>s.UrlPathPrefix='foreign',s=>s.GuestUserId=s.GuestUserId.slice(0,15)+'ZZZ',s=>s.GuestUserId=s.GuestUserId.slice(0,15),s=>delete s.GuestUserId]){const f=fixture();edit(f.baseline.snapshot.site);f.baseline.binding=core.digest(f.baseline.snapshot);assert.throws(()=>f.reader({dir:PRIVATE_DIR,baseline:f.baseline}));}
});
test('preserves all original Site fields including attributes when actually present',async()=>{
 const f=fixture({attributes:{type:'Site',url:'/synthetic'}});const reader=f.reader({dir:PRIVATE_DIR,baseline:f.baseline});assert.equal((await reader({intent:f.intent,result:f.result})).verified,true);f.edit(names[4],v=>v.site.records[0].attributes.url='/changed');await assert.rejects(reader({intent:f.intent,result:f.result}));
});
test('rejects changed original REST GuestUserId',async()=>{
 const f=fixture();f.edit(names[4],v=>v.site.records[0].GuestUserId=core.normalizeId('005000000000003'));await assert.rejects(async()=>f.reader({dir:PRIVATE_DIR,baseline:f.baseline})({intent:f.intent,result:f.result}));
});
