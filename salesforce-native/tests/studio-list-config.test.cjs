const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const base = path.resolve(__dirname, '../force-app/main/default/lwc');
const modelPath = path.join(base,'cardstackListConfigModel/cardstackListConfigModel.js');
const source = name => fs.readFileSync(path.join(base,name,name+'.js'),'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const id = '00B000000000001EAA';
const other = '00B000000000002EAA';
const catalog = [{kind:'salesforce',key:id,label:'Shared',availability:'available'},{kind:'cardstack',key:'listview:Account:shared',label:'Shared',availability:'available'}];
const policy = extra => JSON.stringify({version:1,allowAdHoc:false,views:[],customLists:[],...extra});
const deferred = () => {let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function model() {
 assert.ok(fs.existsSync(modelPath),'Missing declarative exposure model');
 const context={};vm.runInNewContext(source('cardstackListConfigModel').replace(/export /g,''),context);return context;
}
function component(name,extra={}) {
 const events=[];const context={LightningElement:class {dispatchEvent(e){events.push(e);}},CustomEvent:class {constructor(type,opts){this.type=type;Object.assign(this,opts);}},ShowToastEvent:class {},DraftDialog:{open:async()=> 'stay'},...model(),...extra};
 vm.runInNewContext(source('cardstackStudioModel').replace(/export /g,''),context);
 const code=source(name).replace(/^import .*;$/gm,'').replace(/^\s*@wire\(.*\)\s*$/gm,'').replace(/@(track|api)\s+/g,'').replace(/export default class \w+/,'globalThis.Component = class');
 require('./studio-authoring-fixture.cjs').install(context);vm.runInNewContext(code,context);const instance=new context.Component();instance.template={querySelector:()=>null};instance.toast=()=>{};return {instance,context,events};
}
async function editor(extra={},value=policy()) {
 let state={liveValue:value};const result=component('cardstackListConfig',{getStudioListCatalog:async()=>catalog,getStagingInfoFresh:async()=>state,saveDraft:async input=>{state={...state,draft:{Id:'a01000000000001AAA',Draft_Value__c:input.value}};},...extra});
 result.instance.objectApi='Account';await result.instance.refresh();return result;
}
const toggle = (editor,key=id,enabled=true,kind='salesforce') => editor.handleSelection({target:{checked:enabled},currentTarget:{dataset:{kind,key}}});
test('unversionedValuesNeedExplicitMigration',()=>{
 const m=model();const legacy=m.parseExposure('{"views":[],"customLists":[]}',catalog);assert.equal(legacy.mode,'legacy');assert.equal(JSON.parse(m.serializeExposure(legacy)).version,undefined);
 const migrated=m.migrateExposure(legacy);assert.equal(migrated.mode,'v1');assert.equal(migrated.working.allowAdHoc,false);assert.equal(migrated.working.views.length,0);
 assert.equal(m.parseExposure('{"views":[{"viewId":"old","enabled":true}]}',catalog).mode,'unavailable');
 assert.equal(m.parseExposure('{"views":[],"allowAdHoc":false}',catalog).mode,'unavailable');
});
test('unknownValuesAndUnresolvedSelectionsSurviveRoundTrip',()=>{
 const m=model();const json=policy({legacyHint:{count:0,enabled:false},views:[{viewId:other,enabled:true,future:0}],customLists:[{key:'listview:Account:deleted',enabled:true,future:false}]});
 const parsed=m.parseExposure(json,catalog);assert.equal(parsed.mode,'v1');assert.deepEqual(JSON.parse(m.serializeExposure(parsed)),JSON.parse(json));
 const edited=m.setExposure(parsed,'salesforce',other,false);assert.equal(JSON.parse(m.serializeExposure(edited)).views[0].future,0);assert.equal(JSON.parse(m.serializeExposure(parsed)).views[0].enabled,true);
});
test('zeroAndFalseDoNotBecomeDefaults',()=>{
 const m=model();const parsed=m.parseExposure(policy({legacyHint:0}),[]);const value=JSON.parse(m.serializeExposure(parsed));assert.equal(value.allowAdHoc,false);assert.equal(value.views.length,0);assert.equal(value.legacyHint,0);
 assert.equal(m.parseExposure('{"version":1,"views":[],"customLists":[]}',[]).working.allowAdHoc,false);
});
test('malformedVersionsRowsIdentitiesAndDuplicateTargetsAreUnavailable',()=>{
 const m=model();for(const value of [policy({version:2}),policy({allowAdHoc:0}),'{"version":1,"views":[]}',policy({views:[{viewId:'00B000000000001AAA',enabled:true}]}),policy({views:[{viewId:id,enabled:'true'}]}),policy({views:[{viewId:id,enabled:true},{viewId:id.slice(0,15),enabled:false}]}),policy({customLists:[{key:'listview:Other:shared',enabled:true}]}),'{broken']) assert.equal(m.parseExposure(value,catalog,'Account').mode,'unavailable',value);
 const canonical=m.parseExposure(policy({views:[{viewId:id.slice(0,15),enabled:false}]}),catalog);assert.equal(JSON.parse(m.serializeExposure(canonical)).views[0].viewId,id);
});
test('migrationRetainsLegacyInspectionWithoutSelectingItsOldEnabledChoices',()=>{
 const m=model();const legacy={views:[{viewId:id,exposed:true,aliases:['old'],zero:0}],customLists:[{id:'old',name:'Name',flag:false}],future:false};const migrated=m.migrateExposure(m.parseExposure(JSON.stringify(legacy),catalog));const serialized=JSON.parse(m.serializeExposure(migrated));assert.equal(serialized.views.length,0);assert.equal(serialized.future,false);assert.deepEqual(serialized.legacyExposure.views,legacy.views);assert.deepEqual(serialized.legacyExposure.customLists,legacy.customLists);
});
test('deletedSelectionsAndLabelCollisionsAreVisibleWithCanonicalSource',async()=>{
 const {instance:b}=await editor({},policy({views:[{viewId:other,enabled:true}]}));assert.equal(b.rows.find(row=>row.key===other).unavailable,true);assert.equal(b.rows.find(row=>row.key===other).enabled,true);
 for(const row of b.rows.filter(row=>row.label==='Shared')) {assert.match(row.choiceLabel,new RegExp(row.key));assert.match(row.description,/fallback|saved Cardstack filters/i);}
 b.handleSearch({target:{value:'deleted'}});assert.ok(b.rows.some(row=>row.key===other));
});
test('failedSaveRetainsSelectionAndDoesNotNotify',async()=>{
 const {instance:b,events}=await editor({saveDraft:async()=>{throw new Error('Save failed');}});toggle(b);assert.equal(await b.save(),false);assert.equal(b.model.working.views[0].enabled,true);assert.equal(b.isDirty,true);assert.equal(events.length,0);assert.equal(b.saveUnknown,false);
});
test('successfulSaveSeparatesWorkingSavedLiveAndHandsOffExactDraft',async()=>{
 const {instance:b,events}=await editor();toggle(b);assert.equal(await b.save(),true);assert.equal(JSON.parse(b.savedJson).views[0].enabled,true);assert.equal(JSON.parse(b.liveJson).views.length,0);assert.equal(b.isDirty,false);assert.deepEqual(plain(events[0].detail),{keys:['exposures:Account'],operation:'save'});b.openPublish();assert.deepEqual(plain(events[1].detail),{tab:'publish',draftId:'a01000000000001AAA'});
});
test('newerEditsDuringSuccessfulSaveAreRetainedAndBlockLeave',async()=>{
 const gate=deferred(),started=deferred();let submitted;const {instance:b}=await editor({DraftDialog:{open:async()=> 'save'},saveDraft:input=>{submitted=input.value;started.resolve();return gate.promise;},getStagingInfoFresh:async()=>submitted?{draft:{Draft_Value__c:submitted}}:{liveValue:policy()}});toggle(b);const leaving=b.requestLeave();await started.promise;toggle(b,id,false);gate.resolve();assert.equal(await leaving,false);assert.equal(b.model.working.views[0].enabled,false);assert.equal(JSON.parse(b.savedJson).views[0].enabled,true);
});
test('unknownSaveBlocksRetryLeaveAndCoalescesAuthoritativeReconciliation',async()=>{
 let submitted,writes=0,reads=0;const {instance:b,context,events}=await editor({saveDraft:async input=>{submitted=input.value;writes++;throw new Error('Lost response');},getStagingInfoFresh:async()=>{reads++;if(!submitted)return {liveValue:policy()};throw new Error('Offline');}});toggle(b);await b.save();assert.equal(b.saveUnknown,true);assert.equal(await b.requestLeave(),false);await b.save();assert.equal(writes,1);
 const gate=deferred();context.getStagingInfoFresh=()=>{reads++;return gate.promise;};const before=reads;const first=b.checkSavedState(),second=b.checkSavedState();assert.equal(reads,before+1);gate.resolve({draft:{Draft_Value__c:submitted}});await Promise.all([first,second]);assert.equal(b.saveUnknown,false);assert.equal(events.length,1);await b.checkSavedState();assert.equal(reads,before+1);assert.equal(await b.requestLeave(),true);
});
test('refreshAndOldObjectResponsesPreserveNewerWorkingChanges',async()=>{
 const {instance:b,context}=await editor();const gate=deferred();context.getStagingInfoFresh=()=>gate.promise;const loading=b.refresh();toggle(b);gate.resolve({liveValue:policy({allowAdHoc:true})});await loading;assert.equal(b.model.working.views[0].enabled,true);
 const older=deferred();context.getStagingInfoFresh=({key})=>key==='exposures:Account'?older.promise:Promise.resolve({liveValue:policy({allowAdHoc:true})});const stale=b.refresh();b.objectApi='Contact';await b.refresh();older.resolve({liveValue:policy()});await stale;assert.equal(b.objectApi,'Contact');assert.equal(b.model.working.allowAdHoc,true);
});
test('SaveDiscardStayWorkThroughActualParentChildLeaveBoundary',async()=>{
 for(const choice of ['stay','discard','save']) {
  const child=await editor({DraftDialog:{open:async()=>choice}});const {instance:p}=component('cardstackObjectConfig');p.selectedObject='Account';p.parseWorkingModel('{"highlights":[{"api":"Name"}]}');p.savedLayoutJson=p.buildLayoutJson();p.template.querySelector=selector=>selector==='c-cardstack-list-config'?child.instance:null;
  // Stale retired raw-list values never cause a second parent save/leave prompt.
  p.draftValues={lists:'stale raw value'};p.savedListsJson='old raw value';toggle(child.instance);assert.equal(await p.requestLeave(),choice!=='stay');assert.equal(child.instance.isDirty,choice==='stay');assert.equal(p.selectedObject,'Account');
 }
});
test('parentLayoutRefreshDoesNotReadOrResetChildListStateAndBubbledEventsUseExistingContract',async()=>{
 const child=await editor();toggle(child.instance);const reads=[];const {instance:p}=component('cardstackObjectConfig',{getStagingInfoFresh:async({key})=>{reads.push(key);return {liveValue:key.startsWith('layout:')?'{"highlights":[{"api":"Name"}]}':'[]'};}});p.selectedObject='Account';p.template.querySelector=selector=>selector==='c-cardstack-list-config'?child.instance:null;await p.loadStaging();assert.equal(reads.includes('exposures:Account'),false);assert.equal(child.instance.isDirty,true);
 const html=fs.readFileSync(path.join(base,'cardstackObjectConfig/cardstackObjectConfig.html'),'utf8');assert.match(html,/<c-cardstack-list-config object-api=\{selectedObject\}/);assert.doesNotMatch(html,/Lists JSON \(draft\)/);
});
test('legacyRequiresExplicitMigrationAndUnavailableCannotSave',async()=>{
 let writes=0;const legacy=await editor({saveDraft:async()=>{writes++;}},'{"views":[],"customLists":[]}');assert.equal(legacy.instance.canEdit,false);await legacy.instance.save();assert.equal(writes,0);legacy.instance.startMigration();assert.equal(legacy.instance.canEdit,true);assert.equal(legacy.instance.isDirty,true);
 const broken=await editor({saveDraft:async()=>{writes++;}},policy({version:9}));assert.equal(broken.instance.canEdit,false);await broken.instance.save();assert.equal(writes,0);assert.match(broken.instance.modeMessage,/unsupported|unavailable/i);
});
test('cleanRefreshReplacesInputsAndDirtyRefreshRetainsThemEvenWhenBaselineChanges',async()=>{
 const {instance:b,context}=await editor();context.getStagingInfoFresh=async()=>({liveValue:policy({allowAdHoc:true})});await b.refresh();assert.equal(b.model.working.allowAdHoc,true);assert.equal(b.isDirty,false);
 toggle(b);context.getStagingInfoFresh=async()=>({liveValue:policy()});await b.refresh();assert.equal(b.model.working.allowAdHoc,true);assert.equal(b.model.working.views[0].enabled,true);assert.equal(b.isDirty,true);
});
test('migrationDoesNotOverwriteAnUnknownArchiveProperty',()=>{
 const m=model();const legacy={views:[],customLists:[],legacyExposure:{future:0}};const value=JSON.parse(m.serializeExposure(m.migrateExposure(m.parseExposure(JSON.stringify(legacy),catalog))));assert.deepEqual(value.legacyExposure,{future:0});assert.deepEqual(value.legacyExposure2,{views:[],customLists:[]});
});
for(const outcome of ['resolve','reject'])test('staleObjectRecovery'+outcome+'CannotRelockOrNotifyNewObject',async()=>{
 let submitted;const {instance:b,context,events}=await editor({saveDraft:async input=>{submitted=input.value;},getStagingInfoFresh:async()=>submitted?Promise.reject(new Error('Unknown')):{liveValue:policy()}});toggle(b);await b.save();const gate=deferred();context.getStagingInfoFresh=()=>gate.promise;const stale=b.checkSavedState();b.objectApi='Contact';context.getStagingInfoFresh=async()=>({liveValue:policy({allowAdHoc:true})});await b.refresh();if(outcome==='resolve')gate.resolve({draft:{Draft_Value__c:submitted}});else gate.reject(new Error('Old read failed'));await stale;assert.equal(b.saveUnknown,false);assert.equal(b.checkingSavedState,false);assert.equal(b.model.working.allowAdHoc,true);assert.equal(events.length,0);
});
test('lostWriteResponseWithConfirmedSaveNotifiesOnlyOnceAndIgnoresJsonObjectKeyOrder',async()=>{
 let submitted;const {instance:b,events}=await editor({saveDraft:async input=>{submitted=JSON.parse(input.value);throw new Error('Lost response');},getStagingInfoFresh:async()=>submitted?{liveValue:policy(),draft:{Id:'a01000000000001AAA',Draft_Value__c:JSON.stringify({customLists:submitted.customLists,views:submitted.views,allowAdHoc:submitted.allowAdHoc,version:1})}}:{liveValue:policy()}});toggle(b);assert.equal(await b.save(),true);assert.equal(b.isDirty,false);assert.equal(events.length,1);await b.checkSavedState();assert.equal(events.length,1);
});
test('catalogFailureAndMalformedConfiguredValuesRemainInspectableAndCannotOverwrite',async()=>{
 const {instance:b}=await editor({getStudioListCatalog:async()=>{throw new Error('Metadata read failed');}},policy({views:[{viewId:other,enabled:true}]}));assert.equal(b.canEdit,false);assert.equal(b.rows.find(row=>row.key===other).enabled,true);assert.match(b.catalogError,/unavailable/);assert.match(b.retainedJson,/00B000000000002EAA/);assert.equal(await b.save(),false);
});
test('editsMadeWhileDiscardDialogIsOpenCannotBeLost',async()=>{
 const gate=deferred();const {instance:b}=await editor({DraftDialog:{open:()=>gate.promise}});toggle(b);const leave=b.requestLeave();b.handleAdHoc({target:{checked:true}});gate.resolve('discard');assert.equal(await leave,false);assert.equal(b.allowAdHoc,true);assert.equal(b.model.working.views[0].enabled,true);
});
test('parentObjectSwitchIsBlockedByListSaveAndUnknownOutcome',async()=>{
 const gate=deferred();const child=await editor({saveDraft:()=>gate.promise,getStagingInfoFresh:async()=>({liveValue:policy()})});toggle(child.instance);const {instance:p}=component('cardstackObjectConfig');p.selectedObject='Account';p.template.querySelector=()=>child.instance;const saving=child.instance.save();await p.openObject('Contact');assert.equal(p.selectedObject,'Account');gate.reject(new Error('Save failed'));await saving;child.instance.saveUnknown=true;await p.openObject('Contact');assert.equal(p.selectedObject,'Account');
});
test('leaveDialogCannotDiscardWhileFreshSavedStateIsStillLoading',async()=>{
 const dialog=deferred(),read=deferred();const {instance:b,context}=await editor({DraftDialog:{open:()=>dialog.promise}});toggle(b);const leaving=b.requestLeave();context.getStagingInfoFresh=()=>read.promise;const refresh=b.refresh();dialog.resolve('discard');assert.equal(await leaving,false);assert.equal(b.model.working.views[0].enabled,true);read.resolve({liveValue:policy()});await refresh;
});
function parentWithChild(child,extra={}) {
 const result=component('cardstackObjectConfig',extra);const p=result.instance;p.selectedObject='Account';p.wiredFieldsResult={data:[{api:'Name',label:'Name',type:'STRING',updateable:true}]};p.parseWorkingModel('{"highlights":[{"api":"Name"}]}');p.savedLayoutJson=p.buildLayoutJson();p.template.querySelector=selector=>selector==='c-cardstack-list-config'?child.instance:null;return result;
}
test('listEditsDuringActualParentLeaveSaveRetainSelectionAndBlockNavigation',async()=>{
 const gate=deferred(),started=deferred();let submitted;const child=await editor();const {instance:p}=parentWithChild(child,{DraftDialog:{open:async()=> 'save'},saveDraft:input=>{submitted=input.value;started.resolve();return gate.promise;},getStagingInfoFresh:async()=>({draft:{Draft_Value__c:submitted}})});p.workingHighlights[0].label='Parent submitted';const leaving=p.requestLeave();await started.promise;toggle(child.instance);gate.resolve();assert.equal(await leaving,false);assert.equal(child.instance.isDirty,true);assert.equal(child.instance.model.working.views[0].enabled,true);assert.equal(p.isDirty,false);assert.equal(JSON.parse(p.savedLayoutJson).highlights[0].label,'Parent submitted');
});
test('pendingChildRefreshDuringActualParentLeaveSaveBlocksNavigation',async()=>{
 const gate=deferred(),started=deferred(),read=deferred();let submitted;const child=await editor();const {instance:p}=parentWithChild(child,{DraftDialog:{open:async()=> 'save'},saveDraft:input=>{submitted=input.value;started.resolve();return gate.promise;},getStagingInfoFresh:async()=>({draft:{Draft_Value__c:submitted}})});p.workingHighlights[0].label='Parent submitted';const leaving=p.requestLeave();await started.promise;child.context.getStagingInfoFresh=()=>read.promise;const refresh=child.instance.refresh();gate.resolve();assert.equal(await leaving,false);assert.equal(child.instance.loading,true);read.resolve({liveValue:policy()});await refresh;
});
test('childSelectionChangedDuringParentDiscardDialogRetainsBothEditors',async()=>{
 const dialog=deferred(),opened=deferred();const child=await editor();const {instance:p}=parentWithChild(child,{DraftDialog:{open:()=>{opened.resolve();return dialog.promise;}}});p.workingHighlights[0].label='Parent working';const leaving=p.requestLeave();await opened.promise;toggle(child.instance);dialog.resolve('discard');assert.equal(await leaving,false);assert.equal(p.workingHighlights[0].label,'Parent working');assert.equal(child.instance.isDirty,true);
});
test('parentDiscardDialogCannotLoseNewerParentEdits',async()=>{
 const dialog=deferred(),opened=deferred();const child=await editor();const {instance:p}=parentWithChild(child,{DraftDialog:{open:()=>{opened.resolve();return dialog.promise;}}});p.workingHighlights[0].label='Original working';const leaving=p.requestLeave();await opened.promise;p.workingHighlights[0].label='Newer parent';dialog.resolve('discard');assert.equal(await leaving,false);assert.equal(p.workingHighlights[0].label,'Newer parent');assert.equal(p.isDirty,true);
});
test('parentSaveDialogDoesNotAutomaticallySaveNewerInputsWithoutAnotherReview',async()=>{
 const dialog=deferred(),opened=deferred();let writes=0;const child=await editor();const {instance:p}=parentWithChild(child,{DraftDialog:{open:()=>{opened.resolve();return dialog.promise;}},saveDraft:async()=>{writes++;}});p.workingHighlights[0].label='Original working';const leaving=p.requestLeave();await opened.promise;p.workingHighlights[0].label='Newer parent';dialog.resolve('save');assert.equal(await leaving,false);assert.equal(p.workingHighlights[0].label,'Newer parent');assert.equal(writes,0);
});
test('newParentWorkDuringDelayedChildLeaveCannotBeDiscardedByEarlierParentConsent',async()=>{
 const gate=deferred(),started=deferred();let submitted;const child=await editor({DraftDialog:{open:async()=> 'save'},saveDraft:input=>{submitted=input.value;started.resolve();return gate.promise;},getStagingInfoFresh:async()=>submitted?{draft:{Draft_Value__c:submitted}}:{liveValue:policy()}});toggle(child.instance);const {instance:p}=parentWithChild(child);const leaving=p.requestLeave();await started.promise;p.workingHighlights[0].label='Newer parent during child save';gate.resolve();assert.equal(await leaving,false);assert.equal(child.instance.isDirty,false);assert.equal(p.isDirty,true);assert.equal(p.workingHighlights[0].label,'Newer parent during child save');
});
test('parentBusyStateStartingDuringDelayedChildDiscardBlocksNavigation',async()=>{
 const dialog=deferred(),opened=deferred();const child=await editor({DraftDialog:{open:()=>{opened.resolve();return dialog.promise;}}});toggle(child.instance);const {instance:p}=parentWithChild(child);const leaving=p.requestLeave();await opened.promise;p.checkingSavedState=true;dialog.resolve('discard');assert.equal(await leaving,false);assert.equal(p.checkingSavedState,true);assert.equal(child.instance.isDirty,false);
});
test('cleanChildAndParentNativeDiscardStillPermitLeaving',async()=>{
 const child=await editor();const {instance:p}=parentWithChild(child,{DraftDialog:{open:async()=> 'discard'}});p.workingHighlights[0].label='Discard this';assert.equal(await p.requestLeave(),true);assert.equal(p.isDirty,false);assert.equal(child.instance.isDirty,false);
});
test('listEditsDuringActualParentActionAdditionBlockLeaveWithoutSecondSave',async()=>{
 const gate=deferred(),started=deferred();let submitted,writes=0;const child=await editor();const {instance:p}=parentWithChild(child,{DraftDialog:{open:async()=> 'save'},saveDraft:input=>{writes++;submitted=input.value;started.resolve();return gate.promise;},getStagingInfoFresh:async()=>({draft:{Draft_Value__c:submitted}})});p.publishedFlows=[{apiName:'Review'}];p.newAction={name:'review',label:'Review',type:'flow',flowApiName:'Review',enabled:true,mappings:[]};const leaving=p.requestLeave();await started.promise;toggle(child.instance);gate.resolve();assert.equal(await leaving,false);assert.equal(child.instance.isDirty,true);assert.equal(p.isDirty,false);assert.equal(JSON.parse(p.savedLayoutJson).actions[0].name,'review');assert.equal(writes,1);
});
test('parentDiscardBlockedByChildUnknownSaveDoesNotDiscardOrRetryChildInputs',async()=>{
 const dialog=deferred(),opened=deferred();let submitted,writes=0;const child=await editor({saveDraft:async input=>{writes++;submitted=input.value;throw new Error('Lost write response');},getStagingInfoFresh:async()=>submitted?Promise.reject(new Error('Unknown saved state')):{liveValue:policy()}});const {instance:p}=parentWithChild(child,{DraftDialog:{open:()=>{opened.resolve();return dialog.promise;}}});p.workingHighlights[0].label='Parent working';const leaving=p.requestLeave();await opened.promise;toggle(child.instance);await child.instance.save();assert.equal(child.instance.saveUnknown,true);dialog.resolve('discard');assert.equal(await leaving,false);assert.equal(p.workingHighlights[0].label,'Parent working');assert.equal(child.instance.model.working.views[0].enabled,true);assert.equal(child.instance.saveUnknown,true);assert.equal(writes,1);
});
