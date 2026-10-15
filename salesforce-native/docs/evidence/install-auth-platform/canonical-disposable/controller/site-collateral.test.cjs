'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),access=require('./access.cjs'),core=require('./core.cjs');
const {installedFixture}=require('./access-fixture.cjs');
let recovery;try{recovery=require('./site-collateral.cjs');}catch{}
const names=['BandwidthExceeded','Exception','FileNotFound','InMaintenance','Unauthorized'];
async function fixture(){
 const f=await installedFixture();
 // This task's fixture alone includes the actual pre-existing disabled error pages.
 const rows=names.map(apexPage=>({apexPage,enabled:false}));
 for(const metadata of [f.snap.guestProfile.metadata,f.s.m.get('baseline-private.json').snapshot.guestProfile.metadata,f.s.m.get('owned-components-private.json').guestProfileMetadata])metadata.pageAccesses.push(...structuredClone(rows));
 const b=f.s.m.get('baseline-private.json');b.binding=core.digest(b.snapshot);
 for(const name of ['owned-components-private.json','deploy-job-private.json','deploy-exact-tests-private.json'])f.s.m.get(name).binding=b.binding;
 const owned=f.s.m.get('owned-components-private.json');owned.guestProfileMetadataDigest=core.digest(owned.guestProfileMetadata);
 await access.prepare(f.args);await access.assign(f.args);await access.grantIngress(f.args);await access.grantPage(f.args);
 const intent=await access.beginSiteUi(f.args,true);
 f.beforeRecord={checkedAt:new Date(f.args.now()).toISOString(),intentDigest:intent.intentDigest,snapshot:structuredClone(f.snap)};
 f.mappingRecord={source:'root-managed-readonly',checkedAt:new Date(f.args.now()).toISOString(),identity:f.snap.identity,pages:names.map((Name,i)=>({Id:core.normalizeId('06600000000000'+(i+2)),Name,NamespacePrefix:null}))};
 const proof=await f.args.operations.setSiteActiveRootUi({org:f.snap.identity.org,controller:f.snap.identity.actor,siteId:f.snap.site.Id,active:true});
 f.snap.guestProfile.metadata.pageAccesses=f.snap.guestProfile.metadata.pageAccesses.map(r=>names.includes(r.apexPage)?{...r,enabled:true}:r);
 f.mappingRecord.pages.forEach((p,i)=>f.snap.guestGrants.push({Id:core.normalizeId('0J0'+String(i+7).padStart(12,'0')),ParentId:f.snap.guestSet.Id,SetupEntityId:p.Id,SetupEntityType:'ApexPage'}));
 await assert.rejects(access.completeSiteUi(f.args,{...proof,intentDigest:intent.intentDigest}),/ACCESS_STATE_DRIFT/);
 f.deleted=[];f.args.operations.removeGuestAccess=async row=>{f.deleted.push(structuredClone(row));const page=f.mappingRecord.pages.find(p=>p.Id===row.SetupEntityId);f.snap.guestGrants=f.snap.guestGrants.filter(r=>r.Id!==row.Id);f.snap.guestProfile.metadata.pageAccesses=f.snap.guestProfile.metadata.pageAccesses.map(r=>r.apexPage===page.Name?{...r,enabled:false}:r);return {success:true};};
 f.input={beforeRecord:f.beforeRecord,mappingRecord:f.mappingRecord};return f;
}
test('exact five collateral recovery preserves approved ingress/page and passes existing active reconciliation',async()=>{
 assert.equal(typeof recovery?.prepare,'function');const f=await fixture(),baseline=f.s.read('baseline-private.json');
 await recovery.prepare(f.args,f.input);for(let i=0;i<5;i++){const receipt=await recovery.removeNext(f.args);assert.equal(receipt.success,true);assert(!JSON.stringify(receipt).includes('066'));}
 assert.equal(f.deleted.length,5);assert.equal(f.snap.guestGrants.length,3);assert.equal(f.snap.guestProfile.metadata.pageAccesses.find(r=>r.apexPage==='CardstackSiteAuthProbeHome').enabled,true);assert.equal(f.snap.guestProfile.metadata.classAccesses.find(r=>r.apexClass==='CardstackCanonicalProbe').enabled,true);
 assert.deepEqual(f.s.read('baseline-private.json'),baseline);await access.reconcile(f.args);assert.equal((await access.context(f.args)).j.state.active,true);await assert.rejects(recovery.removeNext(f.args));
});
test('duplicate foreign or changed full state rejects preparation before any DELETE',async()=>{
 assert.equal(typeof recovery?.prepare,'function');for(const change of [f=>f.snap.guestGrants.push({...f.snap.guestGrants.at(-1)}),f=>f.snap.guestGrants.at(-1).ParentId=f.installed.permissionSet.id,f=>f.snap.guestProfile.metadata.pageAccesses.at(-1).extra=true,f=>f.snap.existingApps[2].metadata.description='foreign',f=>f.snap.operatorUse.effective=false,f=>f.snap.references.records.push({foreign:true}),f=>f.snap.guestObjectPermissions.push({foreign:true}),f=>f.installed.classes[0].source+='// foreign',f=>f.beforeRecord.intentDigest='0'.repeat(64),f=>f.mappingRecord.pages[0].NamespacePrefix='foreign',f=>f.mappingRecord.pages[1].Id=f.mappingRecord.pages[0].Id,f=>f.snap.guestProfile.metadata.pageAccesses.at(-1).enabled=false]){const f=await fixture();change(f);await assert.rejects(recovery.prepare(f.args,f.input));assert.equal(f.deleted.length,0);assert.equal(f.s.exists('site-collateral-prepared-private.json'),false);}
});
test('durable intent precedes each DELETE and result precedes independent readback',async()=>{
 assert.equal(typeof recovery?.prepare,'function');const f=await fixture();await recovery.prepare(f.args,f.input);const remove=f.args.operations.removeGuestAccess;
 f.args.operations.removeGuestAccess=async row=>{assert.equal(f.s.read('site-collateral-event-1-private.json').kind,'intent');return remove(row);};
 const snapshot=f.args.adapter.snapshot;let reads=0;f.args.adapter.snapshot=async identity=>{reads++;if(f.deleted.length)assert.equal(f.s.read('site-collateral-event-2-private.json').kind,'result');return snapshot(identity);};
 await recovery.removeNext(f.args);assert(reads>=2);assert.equal(f.s.read('site-collateral-event-3-private.json').kind,'verified');
 const g=await fixture();await recovery.prepare(g.args,g.input);const create=g.s.create;g.s.create=(name,v)=>{if(name==='site-collateral-event-1-private.json')throw Error('durability');create(name,v);};await assert.rejects(recovery.removeNext(g.args));assert.equal(g.deleted.length,0);
});
test('ambiguous DELETE is never retried and cannot be reconciled without known result',async()=>{
 assert.equal(typeof recovery?.prepare,'function');const f=await fixture();await recovery.prepare(f.args,f.input);let calls=0;f.args.operations.removeGuestAccess=async()=>{calls++;throw Error('private provider');};await assert.rejects(recovery.removeNext(f.args),/COLLATERAL_OUTCOME_UNRESOLVED/);await assert.rejects(recovery.removeNext(f.args),/COLLATERAL_PENDING/);await assert.rejects(recovery.reconcile(f.args),/KNOWN_COLLATERAL_RESULT_REQUIRED/);assert.equal(calls,1);
});
test('known result can reconcile by readback without repeating DELETE',async()=>{
 assert.equal(typeof recovery?.prepare,'function');const f=await fixture();await recovery.prepare(f.args,f.input);const remove=f.args.operations.removeGuestAccess;f.args.operations.removeGuestAccess=async row=>{const r=await remove(row);f.snap.foundation.metadata[0].label='foreign';return r;};await assert.rejects(recovery.removeNext(f.args),/COLLATERAL_STATE_DRIFT/);assert.equal(f.s.read('site-collateral-event-2-private.json').kind,'result');await assert.rejects(recovery.removeNext(f.args),/COLLATERAL_PENDING/);delete f.snap.foundation.metadata[0].label;await recovery.reconcile(f.args);assert.equal(f.deleted.length,1);
});
test('fresh drift preparation tampering and rejected result fail closed',async()=>{
 assert.equal(typeof recovery?.prepare,'function');for(const change of [f=>f.snap.siteMetadata.description='foreign',f=>f.snap.guestProfile.metadata.pageAccesses[0].attributes={foreign:true},f=>f.s.m.get('deploy-exact-tests-private.json').extra=true,f=>f.s.m.get('site-collateral-prepared-private.json').mappingRecord.pages[0].Name='foreign']){const f=await fixture();await recovery.prepare(f.args,f.input);change(f);await assert.rejects(recovery.removeNext(f.args));assert.equal(f.deleted.length,0);}
 const f=await fixture();await recovery.prepare(f.args,f.input);f.args.operations.removeGuestAccess=async()=>({success:false,errors:[]});await assert.rejects(recovery.removeNext(f.args),/COLLATERAL_OUTCOME_UNRESOLVED/);assert.equal(f.s.exists('site-collateral-event-2-private.json'),false);
});
test('full private preparation metadata keys remain integrity bound',async()=>{
 const f=await fixture();await recovery.prepare(f.args,f.input);f.s.m.get('site-collateral-prepared-private.json').beforeRecord.snapshot.siteMetadata.attributes={foreign:true};await assert.rejects(recovery.removeNext(f.args),/COLLATERAL_PREPARATION_BINDING/);assert.equal(f.deleted.length,0);
});
