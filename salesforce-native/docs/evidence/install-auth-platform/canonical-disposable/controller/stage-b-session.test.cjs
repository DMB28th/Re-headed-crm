'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const fixed='/Users/danielben-atar/Documents/Codex/2026-10-05/codex-handoff-cardstack-native-salesforce-package/work/install-auth-state-validation/canonical-stage-b';
const org='00D000000000001EAA',actor='005000000000001AAA',who={org,actor};
// Load the actual source with only its fs boundary substituted. Production exposes
// no alternate path or test factory. Every synthetic fs path is confined to temp.
function load(name,overrides={}){
 const filename=path.join(__dirname,name),module={exports:{}};
 const run=vm.runInThisContext('(function(require,module,exports){'+fs.readFileSync(filename,'utf8')+'\n})',{filename});
 run(n=>Object.hasOwn(overrides,n)?overrides[n]:require(n.startsWith('.')?path.resolve(__dirname,n):n),module,module.exports);return module.exports;
}
function fixture(t){
 const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'stage-b-source-')));fs.chmodSync(temp,0o700);
 t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const map=p=>{assert(typeof p==='string'&&(p===fixed||p.startsWith(fixed+'/')),'synthetic fs confinement');return temp+p.slice(fixed.length);};
 const boundary=new Proxy(fs,{get(target,k){
  if(k==='realpathSync')return p=>{const actual=fs.realpathSync(map(p));return actual===temp?fixed:actual;};
  if(['lstatSync','existsSync','openSync','unlinkSync','readFileSync'].includes(k))return (p,...a)=>target[k](typeof p==='number'?p:map(p),...a);
  return target[k];
 }});
 const stage=load('stage-b-session.cjs',{'node:fs':boundary});
 const core=load('core.cjs',{'./stage-b-session.cjs':stage});
 const store=stage.storeAt(fixed);
 const adapter={identity:async()=>({...who}),snapshot:async()=>{throw Error('FRESH_SNAPSHOT_REACHED');},enqueue:()=>assert.fail('No deploy mutations in Stage B harness')};
 const args={approved:true,approval:{stage:'B',approved:true},store,adapter,pins:{targetOrgId:org,foundationBaseline:{assignments:[{permissionSet:'Cardstack_Admin',assigneeId:actor}]}},verifyStageAClosure:async({identity})=>{assert.deepEqual(identity,who);return true;}};
 return {stage,core,store,args,temp};
}
test('Stage B admits exact source store and true independently bound closure',async t=>{
 const {stage,core,args}=fixture(t);assert.deepEqual(await stage.verifyAuthority(args,who),who);assert.deepEqual(await core.authority(args),who);
 await assert.rejects(core.snapshot(args),/FRESH_SNAPSHOT_REACHED/);assert.equal(args.store.exists('baseline-private.json'),false);
});
test('Stage A approval and identity binding retain original behavior',async t=>{
 const {core,args}=fixture(t);args.approval.stage='A';delete args.verifyStageAClosure;args.store={};
 assert.deepEqual(await core.authority(args),who);args.pins.targetOrgId='00D000000000002EAA';await assert.rejects(core.authority(args),/ACTOR_BINDING/);
});
test('Stage B rejects unapproved execution and store impersonation before closure',async t=>{
 const {stage,core,args}=fixture(t);
 for(const edit of [a=>a.approved=false,a=>a.approval.approved=false,a=>a.store={},a=>a.store={...args.store},a=>a.store={dir:fixed,stage:'B'},a=>a.store={dir:require('./core.cjs').PRIVATE_DIR}]){
  const changed={...args,approval:{...args.approval},verifyStageAClosure:()=>assert.fail('closure reached without valid authority')};edit(changed);
  await assert.rejects(stage.verifyAuthority(changed,who));await assert.rejects(core.authority(changed));
 }
});
test('Stage B refuses absent false truthy and failed closure proof',async t=>{
 const {stage,args}=fixture(t);
 for(const callback of [undefined,()=>false,()=>1,()=>({closed:true}),async()=>{throw Error('private proof details');}])await assert.rejects(stage.verifyAuthority({...args,verifyStageAClosure:callback},who),/STAGE_A_CLOSURE/);
});
test('Stage B rejects malformed or unbound identity and keeps original adapter',async t=>{
 const {stage,core,args}=fixture(t);
 for(const identity of [null,{}, {org,actor:null},{org,actor:'005000000000001AAB'},{org,actor,extra:true}])await assert.rejects(stage.verifyAuthority(args,identity));
 args.adapter.identity=async()=>({org,actor:'005000000000002AAA'});await assert.rejects(core.authority(args),/ACTOR_BINDING/);
});
test('closure callback cannot mutate the authority identity',async t=>{
 const {core,args}=fixture(t);args.verifyStageAClosure=({identity})=>{identity.actor='005000000000002AAA';return true;};assert.deepEqual(await core.authority(args),who);
});
test('fixed Stage B path rejects alternatives and aliases without opening them',t=>{
 const {stage}=fixture(t);for(const dir of [fixed+'/',fixed+'/../canonical-stage-b',require('./core.cjs').PRIVATE_DIR,'/tmp/stage-b'])assert.throws(()=>stage.storeAt(dir),/PRIVATE_DIRECTORY/);
});
test('Stage B rejects directory modes symlinks and directory replacement',t=>{
 const {stage,store,temp}=fixture(t);fs.chmodSync(temp,0o755);assert.throws(()=>stage.storeAt(fixed),/PRIVATE_DIRECTORY/);assert.throws(()=>store.exists('baseline-private.json'),/PRIVATE_DIRECTORY/);fs.chmodSync(temp,0o700);
 const moved=temp+'-moved';fs.renameSync(temp,moved);t.after(()=>fs.rmSync(moved,{recursive:true,force:true}));fs.symlinkSync(moved,temp);assert.throws(()=>stage.storeAt(fixed),/PRIVATE_DIRECTORY/);fs.unlinkSync(temp);fs.mkdirSync(temp,{mode:0o700});assert.throws(()=>store.create('attempt-private.json',{}),/PRIVATE_DIRECTORY/);
});
test('journal persists private exclusive records and exclusive locks',t=>{
 const {store,temp}=fixture(t);store.create('attempt-private.json',{value:1});assert.deepEqual(store.read('attempt-private.json'),{value:1});assert.equal(fs.statSync(path.join(temp,'attempt-private.json')).mode&0o777,0o600);
 assert.throws(()=>store.create('attempt-private.json',{value:2}),/EEXIST/);assert.deepEqual(store.read('attempt-private.json'),{value:1});const unlock=store.lock();assert.throws(()=>store.lock(),/EEXIST/);unlock();assert.equal(store.exists('controller-lock-private.json'),false);
 for(const name of ['../escape.json','bad/name.json','Upper.json'])assert.throws(()=>store.create(name,{}),/RECORD_NAME/);
});
test('journal refuses insecure records symlinks and dangling symlinks',t=>{
 const {store,temp}=fixture(t);store.create('unsafe-private.json',{});fs.chmodSync(path.join(temp,'unsafe-private.json'),0o644);assert.throws(()=>store.read('unsafe-private.json'),/PRIVATE_RECORD/);assert.throws(()=>store.exists('unsafe-private.json'),/PRIVATE_RECORD/);
 fs.symlinkSync(path.join(temp,'unsafe-private.json'),path.join(temp,'link-private.json'));assert.throws(()=>store.read('link-private.json'),/PRIVATE_RECORD/);assert.throws(()=>store.create('link-private.json',{}));
 fs.symlinkSync(path.join(temp,'missing'),path.join(temp,'dangling-private.json'));assert.throws(()=>store.exists('dangling-private.json'),/PRIVATE_RECORD/);
});
test('source imports perform no filesystem operations',()=>{
 const deny=new Proxy({constants:fs.constants},{get(o,k){if(k==='constants')return o[k];return ()=>assert.fail('Import performed filesystem I/O');}});
 load('stage-b-session.cjs',{'node:fs':deny});load('core.cjs',{'node:fs':deny});
});
test('Stage B refuses Stage A approval even with a bound B journal',async t=>{
 const {stage,args}=fixture(t);await assert.rejects(stage.verifyAuthority({...args,approval:{stage:'A',approved:true}},who),/APPROVAL/);
});
test('journal rejects hard links and refuses to unlink a substituted lock',t=>{
 const {store,temp}=fixture(t);store.create('original-private.json',{});fs.linkSync(path.join(temp,'original-private.json'),path.join(temp,'alias-private.json'));assert.throws(()=>store.read('original-private.json'),/PRIVATE_RECORD/);
 const unlock=store.lock();fs.renameSync(path.join(temp,'controller-lock-private.json'),path.join(temp,'old-lock-private.json'));store.create('controller-lock-private.json',{replacement:true});assert.throws(unlock,/PRIVATE_RECORD/);assert.deepEqual(store.read('controller-lock-private.json'),{replacement:true});
});
test('closure proof is rechecked on every authority evaluation',async t=>{
 const {core,args}=fixture(t);let closed=true;args.verifyStageAClosure=()=>closed;assert.deepEqual(await core.authority(args),who);closed=false;await assert.rejects(core.authority(args),/STAGE_A_CLOSURE_UNPROVED/);
});
function baseline(){
 return {
 identity:{org,actor},site:{Id:'0DM000000000001GAA',GuestUserId:'005000000000002AAA',Status:'Inactive',UrlPathPrefix:'cardstackauthprobe'},siteMetadata:{fullName:'CardstackAuthDiscoveryProbe',active:false,indexPage:'CardstackSiteAuthProbeHome'},siteContext:{baseUrl:'https://fixture.example/cardstackauthprobe',domain:'fixture.example',urlPathPrefix:'cardstackauthprobe'},
 guestUser:{Id:'005000000000002AAA',ProfileId:'00e000000000001AAA'},guestProfile:{Id:'00e000000000001AAA',metadata:{fullName:'Guest'}},guestSet:{Id:'0PS000000000001GAA',ProfileId:'00e000000000001AAA'},guestGrants:[],guestObjectGrants:[],page:{id:'066000000000001AAA',sourceHash:'1'.repeat(64)},
 foundation:{metadata:[{fullName:'Cardstack_User'},{fullName:'Cardstack_Admin'}],assignments:[{Id:'0Pa000000000001CAA',permissionSet:'Cardstack_Admin',permissionSetId:'0PS000000000004GAA',assigneeId:actor}]},
 existingApps:['Card_Stack_SFAPP','B','C','D'].map((name,i)=>({name,id:['0X0000000000001CAA','0X0000000000002CAA','0X0000000000003CAA','0X0000000000004CAA'][i],lastModifiedDate:'2026-10-10T14:00:00Z',metadata:{fullName:name},policies:{jwtEnabled:true}})),
 operatorUse:{effective:true,method:'effectiveCustomPermissions',permission:'Cardstack_Use_Connections',actor,org},operator:{Id:actor,ProfileId:'00e000000000002AAA',IsActive:true,profileMetadata:{fullName:'Admin'},permissionSet:{Id:'0PS000000000002GAA',ProfileId:'00e000000000002AAA'},assignments:[]},references:{complete:true,records:[]},
 collisions:{classes:[],resources:[],permissionSets:[],apps:[]},clientObservation:{name:'Cardstack Fresh Install QA',installedNameAbsent:true,draftInventory:'Unknown',coverage:'installed-only'},metadataJobs:{complete:true,pending:[]},completeness:{guestGrants:true,guestObjects:true,foundationAssignments:true,apps:true,collisions:true,metadataJobs:true}
 };
}
function ready(f){
 const snap=baseline();f.args.adapter.snapshot=async identity=>{assert.deepEqual(identity,who);return structuredClone(snap);};f.args.expected={pageSourceHash:'1'.repeat(64),existingAppNames:['Card_Stack_SFAPP','B','C','D']};f.args.now=()=>Date.parse('2026-10-10T15:00:00Z');f.args.artifacts=f.core.loadArtifacts(path.resolve(__dirname,'..'));return snap;
}
test('Stage B captures fresh independent baseline and preflight without any enqueue',async t=>{
 const f=fixture(t),snap=ready(f);await f.core.snapshot(f.args);assert.deepEqual(f.store.read('baseline-private.json').snapshot,snap);await f.core.preflight(f.args);assert.equal(f.store.exists('preflight-private.json'),true);await assert.rejects(f.core.snapshot(f.args),/EXISTING_RECORD/);
});
test('Stage B baseline preserves rejection of new ECA and installed named client',async t=>{
 for(const kind of ['ECA','client']){
  const f=fixture(t),snap=ready(f);if(kind==='ECA')snap.existingApps.push({name:'Cardstack_ChatGPT_Fresh_Install_QA',id:'0X0000000000005CAA',metadata:{},policies:{},lastModifiedDate:'2026-10-10T14:00:00Z'});else snap.clientObservation.installedNameAbsent=false;
  await assert.rejects(f.core.snapshot(f.args),kind==='ECA'?/APP_SCOPE/:/CLIENT_OBSERVATION_REQUIRED/);assert.equal(f.store.exists('baseline-private.json'),false);
 }
});
test('Stage B preflight requires a new full snapshot and rejects original baseline drift',async t=>{
 const f=fixture(t),snap=ready(f);await f.core.snapshot(f.args);snap.guestProfile.metadata.fullName='Changed';await assert.rejects(f.core.preflight(f.args),/BASELINE_DRIFT/);assert.equal(f.store.exists('preflight-private.json'),false);
});
test('Stage B refuses an actual source-created Stage A store',async t=>{
 const f=fixture(t),aDir=require('./core.cjs').PRIVATE_DIR;
 const boundary=new Proxy(fs,{get(target,k){
  const map=p=>{assert(typeof p==='string'&&(p===aDir||p.startsWith(aDir+'/')),'synthetic Stage A confinement');return f.temp+p.slice(aDir.length);};
  if(k==='realpathSync')return p=>{const actual=fs.realpathSync(map(p));return actual===f.temp?aDir:actual;};
  if(['lstatSync','existsSync','openSync','unlinkSync','readFileSync'].includes(k))return (p,...a)=>target[k](typeof p==='number'?p:map(p),...a);return target[k];
 }});
 const stageA=load('core.cjs',{'node:fs':boundary}).storeAt(aDir);await assert.rejects(f.core.authority({...f.args,store:stageA,verifyStageAClosure:()=>assert.fail('Stage A store reached closure verifier')}),/STAGE_B_STORE/);
});
