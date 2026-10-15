const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const base = path.resolve(__dirname, '../force-app/main/default/lwc');
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => {let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function component(name, extra={}) {
 const events=[],context={LightningElement:class {dispatchEvent(e){events.push(e);}},LightningModal:class {},CustomEvent:class {constructor(type,opts){this.type=type;Object.assign(this,opts);}},ShowToastEvent:class {},DraftDialog:{open:async()=> 'stay'},refreshApex:async()=>{},requestAnimationFrame:fn=>fn(),...extra};
 for(const model of ['cardstackStudioModel','cardstackStudioKeys','cardstackListConfigModel','cardstackConfigDiff']) vm.runInNewContext(fs.readFileSync(path.join(base,model,model+'.js'),'utf8').replace(/^import .*;$/gm,'').replace(/export /g,''),context);
 const code=fs.readFileSync(path.join(base,name,name+'.js'),'utf8').replace(/^import .*;$/gm,'').replace(/^\s*@wire\(.*\)\s*$/gm,'').replace(/@(track|api)\s+/g,'').replace(/export default class \w+/,'globalThis.Component = class');
 require('./studio-authoring-fixture.cjs').install(context);vm.runInNewContext(code,context);const instance=new context.Component();instance.template={querySelector:()=>null};instance.toast=()=>{};return {instance,context,events};
}
const layout = label => JSON.stringify({sections:[{label:'Details',fields:[{api:'Phone',label}]}]});
const policy = adHoc => JSON.stringify({version:1,allowAdHoc:adHoc,views:[],customLists:[]});
function record(extra={}) {
 const result=component('cardstackObjectConfig',extra),b=result.instance;b.selectedObject='Account';b.wiredFieldsResult={data:[{api:'Phone',label:'Phone',type:'STRING',updateable:true}]};b.parseWorkingModel(layout('Saved'));b.savedLayoutJson=b.buildLayoutJson();b.staging={layout:{liveValue:null,draft:{Id:'a01000000000001AAA',Draft_Value__c:layout('Saved')}}};b.hasDraft=true;b.savedListsJson='[]';b.draftValues={lists:'[]'};return result;
}
for(const operation of ['publish','discard']) test(`shell reconciles retained same-object record, mounted list and flows after ${operation}`,async()=>{
 const fresh={ 'layout:Account:default':{liveValue:layout(operation==='publish'?'Saved':'Live')},'exposures:Account':{liveValue:policy(operation==='publish')},flows:{liveValue:'[{"apiName":"Review","label":"Published"}]'}};
 const reads=[];const read=async({key})=>{reads.push(key);return fresh[key];};
 const {instance:b}=record({getStagingInfoFresh:read});
 const {instance:lists}=component('cardstackListConfig',{getStagingInfoFresh:read,getStudioListCatalog:async()=>[]});lists.objectApi='Account';lists.model=component('cardstackListConfig').context.parseExposure(policy(false),[],'Account');lists._baseline=component('cardstackListConfig').context.exposureFingerprint(lists.model);lists.draftId='a01000000000001AAA';lists.savedJson=policy(false);b.template.querySelector=()=>lists;
 const {instance:flow}=component('cardstackFlowConfig',{getStagingInfoFresh:read});flow.staging={draft:{Id:'a01000000000001AAA',Draft_Value__c:'[]'},liveValue:null};flow.policies=[];
 const {instance:shell}=component('cardstackStudio');shell.activeTab='publish';shell.template.querySelector=s=>s==='c-cardstack-object-config'?b:s==='c-cardstack-flow-config'?flow:null;
 await shell.handleConfigChange({detail:{operation,keys:Object.keys(fresh),publishedContexts:[{key:'layout:Account:default',draftId:'a01000000000001AAA'}]}});
 await shell.handleNavigateTab({detail:{tab:'objects',objectApi:'Account'}});
 assert.equal(b.hasDraft,false);assert.equal(b.savedStatusLabel,'No saved draft');assert.equal(b.liveStatusLabel,'Published card is live');assert.equal(b.workingStatusLabel,'Published');assert.equal(b.workingSections[0].fields[0].label,operation==='publish'?'Saved':'Live');
 assert.equal(lists.draftId,undefined);assert.equal(lists.workingStatus,'Published');assert.equal(lists.allowAdHoc,operation==='publish');assert.equal(flow.hasDraft,false);assert.equal(flow.flowRows[0].status,'Published');assert.ok(reads.includes('layout:Account:default'));assert.ok(reads.includes('exposures:Account'));assert.ok(reads.includes('flows'));
 if(operation==='publish')assert.deepEqual(plain(shell.publishedContexts),[{key:'layout:Account:default',draftId:'a01000000000001AAA'}]);
});
for(const timing of ['before','during']) test(`record refresh updates baselines and keeps dirty inputs ${timing} read`,async()=>{
 const gate=deferred();const {instance:b}=record({getStagingInfoFresh:()=>gate.promise});if(timing==='before')b.workingSections[0].fields[0].label='New input';const refresh=b.refresh(['layout:Account:default']);if(timing==='during')b.workingSections[0].fields[0].label='New input';gate.resolve({liveValue:layout('Live')});await refresh;assert.equal(b.workingSections[0].fields[0].label,'New input');assert.equal(JSON.parse(b.savedLayoutJson).sections[0].fields[0].label,'Live');assert.equal(b.hasDraft,false);assert.equal(b.isDirty,true);assert.equal(b.liveLayout.sections[0].fields[0].label,'Live');
});
test('unrelated keys do not read or perturb retained editors',async()=>{
 let reads=0;const {instance:b}=record({getStagingInfoFresh:async()=>{reads++;}});const before=b.savedLayoutJson;await b.refresh(['layout:Contact:default','exposures:Contact']);assert.equal(reads,0);assert.equal(b.savedLayoutJson,before);
 const {instance:f}=component('cardstackFlowConfig',{getStagingInfoFresh:async()=>{reads++;}});await f.refresh(['layout:Account:default']);assert.equal(reads,0);
});
for(const outcome of ['success','failure']) test(`record rejects stale object-return refresh ${outcome}`,async()=>{
 const gate=deferred();const {instance:b,context}=record({getStagingInfoFresh:()=>gate.promise});const stale=b.refresh(['layout:Account:default']);b.resetWorkingState();b.selectedObject='Contact';b.resetWorkingState();b.selectedObject='Account';context.getStagingInfoFresh=async({key})=>({liveValue:key.startsWith('layout:')?layout('Newest'):'[]'});await b.loadStaging();if(outcome==='success')gate.resolve({liveValue:layout('Stale')});else gate.reject(new Error('Stale error'));await stale;assert.equal(b.workingSections[0].fields[0].label,'Newest');assert.equal(b.saveError,'');
});
test('record failed refresh keeps inputs and baselines with honest error',async()=>{
 const {instance:b}=record({getStagingInfoFresh:async()=>{throw new Error('Offline');}});b.workingSections[0].fields[0].label='Keep';const saved=b.savedLayoutJson;await b.refresh(['layout:Account:default']);assert.equal(b.workingSections[0].fields[0].label,'Keep');assert.equal(b.savedLayoutJson,saved);assert.match(b.saveError,/Offline/);
});
test('record pending save blocks general refresh without releasing unknown recovery',async()=>{
 let reads=0;const {instance:b}=record({getStagingInfoFresh:async()=>{reads++;return {liveValue:layout('Live')};}});b.saveUnknown=true;b._pendingSave={value:'pending'};await b.refresh(['layout:Account:default']);assert.equal(reads,0);assert.equal(b.saveUnknown,true);assert.equal(b._pendingSave.value,'pending');b.saveUnknown=false;b._pendingSave=null;await b.openObject('Account');assert.equal(b.hasDraft,false);
});
test('flow reconciliation preserves open wizard and uses fresh policies while late errors lose authority',async()=>{
 const gate=deferred();let reads=0;const {instance:f,context}=component('cardstackFlowConfig',{getStagingInfoFresh:()=>++reads===1?gate.promise:Promise.resolve({liveValue:'[{"apiName":"New","label":"New"}]'})});f.showWizard=true;f.initialPolicy={apiName:'Old',label:'Working'};const stale=f.refresh(['flows']);await f.refresh(['flows']);gate.reject(new Error('Older read'));await stale;assert.equal(f.policies[0].apiName,'New');assert.equal(f.error,'');assert.equal(f.showWizard,true);assert.equal(f.initialPolicy.label,'Working');
 context.getStagingInfoFresh=async()=>{throw new Error('Offline');};await f.refresh(['flows']);assert.equal(f.policies[0].apiName,'New');assert.match(f.error,/Offline/);
});
for(const choice of ['discard','save']) test(`flow wizard ${choice} cannot authorize leaving newer input`,async()=>{
 const gate=deferred();let state={liveValue:'[]'},writes=0;const {instance:w}=component('cardstackFlowWizard',{DraftDialog:{open:()=>gate.promise},getStagingInfoFresh:async()=>state,saveDraft:async({value})=>{writes++;state={draft:{Draft_Value__c:value}};}});w.ready=true;w.savedInputs='{"apiName":"Review","label":"Saved"}';w.selectedFlow={apiName:'Review'};w.flowLabel='First';const leaving=w.requestLeave();w.flowLabel='Newer';gate.resolve(choice);assert.equal(await leaving,false);assert.equal(w.flowLabel,'Newer');assert.equal(writes,0);
});
test('overview leads with existing work and verifies published experience before more coverage',()=>{
 const {instance:d,events}=component('cardstackDashboard');d.data={activePendingDraftCount:0,objects:[{objectApi:'Campaign',label:'Campaign',metadataStatus:'ready'},{objectApi:'Account',label:'Account',hasLive:true,metadataStatus:'ready'},{objectApi:'Contact',label:'Contact',hasDraft:true,metadataStatus:'ready'}]};assert.deepEqual(plain(d.objectRows).map(r=>r.objectApi),['Contact','Account','Campaign']);assert.equal(d.nextAction.target.tab,'setup');d.configureAnother();assert.deepEqual(plain(events[0].detail),{tab:'objects'});
});
test('review names describe experiences while exact identities remain distinct',()=>{
 const {instance:p}=component('cardstackPublishCenter');p.wiredResult={data:[{Id:'a01000000000001AAA',Name:'Internal draft',Status__c:'Draft',Config__r:{Name:'layout:Account:default'}},{Id:'a01000000000002AAA',Name:'Internal list',Status__c:'Draft',Config__r:{Name:'exposures:Account'}},{Id:'a01000000000003AAA',Status__c:'Draft',Config__r:{Name:'flows'}}]};assert.deepEqual(plain(p.pendingDrafts).map(r=>r.label),['Account record card','Account lists','Flow launch cards']);assert.equal(p.pendingDrafts[0].configKey,'layout:Account:default');assert.equal(p.pendingDrafts[0].Id,'a01000000000001AAA');
 const {instance:r}=component('cardstackReviewDialog');r.reviews=[{key:'layout:Account:default',draftId:'a01000000000001AAA',liveValue:null,draftValue:'{}'},{key:'homecard',draftId:'a01000000000004AAA',liveValue:null,draftValue:'{}'}];assert.equal(r.rows[0].label,'Account record card');assert.equal(r.rows[0].draftId,'a01000000000001AAA');assert.match(r.rows[1].label,/Retained/);assert.match(r.rows[1].label,/homecard/);
});

test('later publication refresh supersedes an in-flight record response',async()=>{
 const old=deferred();const {instance:b,context}=record({getStagingInfoFresh:()=>old.promise});const stale=b.refresh(['layout:Account:default']);context.getStagingInfoFresh=async()=>({liveValue:layout('Newest')});await b.refresh(['layout:Account:default']);old.resolve({liveValue:layout('Older')});await stale;assert.equal(b.workingSections[0].fields[0].label,'Newest');assert.equal(b.isDirty,false);
});
test('actual flow parent leave checks wizard edits arriving after its awaited consent',async()=>{
 const {instance:f}=component('cardstackFlowConfig');const {instance:w}=component('cardstackFlowWizard');w.ready=true;w.savedInputs=w.inputSnapshot();f.showWizard=true;f.template.querySelector=()=>w;const leaving=f.requestLeave();w.flowLabel='Newer';assert.equal(await leaving,false);assert.equal(w.flowLabel,'Newer');
});
test('shell returns to retained editors to retry a failed publication refresh without saving',async()=>{
 let reads=0;const {instance:b,context}=record({getStagingInfoFresh:async()=>{reads++;throw new Error('Offline');}});const {instance:s}=component('cardstackStudio');s.activeTab='publish';s.template.querySelector=selector=>selector==='c-cardstack-object-config'?b:null;await s.handleConfigChange({detail:{operation:'publish',keys:['layout:Account:default']}});assert.match(b.saveError,/Offline/);context.getStagingInfoFresh=async()=>({liveValue:layout('Published')});await s.handleNavigateTab({detail:{tab:'objects'}});assert.equal(b.hasDraft,false);assert.equal(b.saveError,'');assert.equal(b.workingSections[0].fields[0].label,'Published');assert.equal(reads,1);
});

for(const timing of ['before','during']) test(`mounted list keeps working choices ${timing} shell reconciliation`,async()=>{
 const gate=deferred();const {instance:b}=record();const {instance:l,context}=component('cardstackListConfig',{getStudioListCatalog:async()=>[],getStagingInfoFresh:()=>gate.promise});l.objectApi='Account';l.model=context.parseExposure(policy(false),[],'Account');l._baseline=context.exposureFingerprint(l.model);l.savedJson=policy(false);l.draftId='a01000000000001AAA';b.template.querySelector=()=>l;
 const {instance:s}=component('cardstackStudio');s.template.querySelector=selector=>selector==='c-cardstack-object-config'?b:null;
 if(timing==='before')l.handleAdHoc({target:{checked:true}});const refresh=s.handleConfigChange({detail:{operation:'discard',keys:['exposures:Account']}});if(timing==='during')l.handleAdHoc({target:{checked:true}});gate.resolve({liveValue:policy(false)});await refresh;assert.equal(l.allowAdHoc,true);assert.equal(l.isDirty,true);assert.equal(l.draftId,undefined);assert.equal(JSON.parse(l.savedJson).allowAdHoc,false);
});
test('publication refresh leaves flow wizard unknown save and newer label guarded',async()=>{
 const {instance:w}=component('cardstackFlowWizard');w.ready=true;w.selectedFlow={apiName:'Review'};w.flowLabel='Newer input';w.saveUnknown=true;w._pendingSave={value:'submitted'};
 const {instance:f}=component('cardstackFlowConfig',{getStagingInfoFresh:async()=>({liveValue:'[{"apiName":"Review","label":"Published"}]'})});f.showWizard=true;f.template.querySelector=()=>w;const {instance:s}=component('cardstackStudio');s.template.querySelector=selector=>selector==='c-cardstack-flow-config'?f:null;await s.handleConfigChange({detail:{operation:'publish',keys:['flows']}});assert.equal(f.flowRows[0].status,'Published');assert.equal(w.flowLabel,'Newer input');assert.equal(w.saveUnknown,true);assert.equal(w._pendingSave.value,'submitted');assert.equal(await f.requestLeave(),false);
});
test('unrelated event cannot retry a retained record failure or perturb its baseline',async()=>{
 let reads=0;const {instance:b}=record({getStagingInfoFresh:async()=>{reads++;throw new Error('Offline');}});await b.refresh(['layout:Account:default']);const saved=b.savedLayoutJson;await b.refresh(['layout:Contact:default']);assert.equal(reads,1);assert.equal(b.savedLayoutJson,saved);assert.match(b.saveError,/Offline/);
});

test('publication refresh retains open action repair inputs while updating the saved baseline',async()=>{
 const gate=deferred();const action={name:'phone-edit',label:'Saved action',type:'record-edit',enabled:true,mappings:[{fieldApi:'Phone',source:'current'}]};const {instance:b}=record({getStagingInfoFresh:()=>gate.promise});b.workingActions=[b.normalizeAction(action,0)];b.savedLayoutJson=b.buildLayoutJson();b.editAction('phone-edit');b.newAction.label='Working action label';const context=b._actionEdit;
 const refresh=b.refresh(['layout:Account:default']);gate.resolve({liveValue:JSON.stringify({sections:[{label:'Published section',fields:[{api:'Phone',label:'Phone'}]}],actions:[{...action,label:'Published action'}]})});await refresh;assert.equal(b.newAction.label,'Working action label');assert.equal(b._actionEdit,context);assert.equal(b.workingActions[0].label,'Saved action');assert.equal(JSON.parse(b.savedLayoutJson).actions[0].label,'Published action');assert.equal(b.hasUnsavedWork,true);
});
test('actual object switch clears action edit context after discard',async()=>{
 const old=deferred();let reads=0;const {instance:b,context}=record({getStagingInfoFresh:()=>++reads===1?old.promise:Promise.resolve({liveValue:'[]'})});b.workingActions=[b.normalizeAction({name:'phone-edit',label:'Saved action',type:'record-edit',mappings:[{fieldApi:'Phone',source:'current'}]},0)];b.savedLayoutJson=b.buildLayoutJson();b.editAction('phone-edit');b.newAction.label='Discarded form';const stale=b.refresh(['layout:Account:default']);context.DraftDialog.open=async()=> 'discard';context.getStudioFieldCatalog=async()=>[];context.getObjectFields=async()=>[];context.getRecordEditCapability=async()=>({contractVersion:'record-edit-eligibility/v1',objectApiName:'Contact',nativeKeyPrefix:'003',eligible:true,exclusionReason:null,fields:[]});
 // Complete the old refresh, then use the actual leave/discard and reset boundary.
 old.resolve({liveValue:layout('Published')});await stale;await b.openObject('Contact');assert.equal(b.selectedObject,'Contact');assert.equal(b.isEditingAction,false);assert.equal(b.hasNewActionInputs,false);assert.deepEqual(plain(b.workingActions),[]);
});
