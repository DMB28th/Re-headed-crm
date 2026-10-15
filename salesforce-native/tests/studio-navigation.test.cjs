const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const base = path.resolve(__dirname, '../force-app/main/default/lwc');
const plain = value => JSON.parse(JSON.stringify(value));
function component(name, extra = {}) {
    const events = [], frames = [];
    const context = {LightningElement:class {dispatchEvent(event) { events.push(event); }},
        CustomEvent:class {constructor(type, options) { this.type=type; Object.assign(this,options); }},
        ShowToastEvent:class {}, setTimeout, requestAnimationFrame:callback=>frames.push(callback),
        refreshApex:async()=>{}, ...extra};
    for (const model of ['cardstackStudioModel','cardstackStudioKeys']) vm.runInNewContext(fs.readFileSync(path.join(base,model,model+'.js'),'utf8').replace(/export /g,''),context);
    const source=fs.readFileSync(path.join(base,name,name+'.js'),'utf8').replace(/^import .*;$/gm,'').replace(/^\s*@wire\(.*\)\s*$/gm,'').replace(/@(track|api)\s+/g,'').replace(/export default class \w+/,'globalThis.Component = class');
    require('./studio-authoring-fixture.cjs').install(context);vm.runInNewContext(source,context);
    const instance = new context.Component();
    instance.template={querySelector:()=>null};
    return {instance,context,events,frames};
}
const overview = {org:{orgName:'Example Org',orgId:'00D000000000001EAA',userName:'admin@example.invalid'},activePendingDraftCount:207,objects:[
    {objectApi:'Account',label:'Account',hasLive:true,hasDraft:false,latestDraftId:null,metadataStatus:'ready'},
    {objectApi:'Contact',label:'Contact',hasLive:false,hasDraft:true,latestDraftId:'a01000000000001AAA',metadataStatus:'ready'},
    {objectApi:'Missing__c',label:'Missing__c',hasLive:true,hasDraft:false,latestDraftId:null,metadataStatus:'unavailable'}],recentActivity:[]};
test('overviewIsDefaultWithSixDestinations',()=>{
    const {instance:shell}=component('cardstackStudio');
    assert.equal(shell.activeTab,'overview');
    assert.deepEqual(plain(shell.navItems),[{value:'overview',label:'Overview'},{value:'setup',label:'Setup'},{value:'objects',label:'Record Cards'},{value:'flows',label:'Flows'},{value:'publish',label:'Review & Publish'},{value:'audit',label:'Activity'}]);
    shell.wiredOverview({data:overview}); assert.equal(shell.publishLabel,'Review & Publish (207)');
    const html=fs.readFileSync(path.join(base,'cardstackStudio/cardstackStudio.html'),'utf8');
    assert.match(html,/value="setup"[\s\S]*?<c-cardstack-connection-setup/);
    assert.doesNotMatch(html,/setup-checklist/);
});
test('overviewActionOpensExactObjectOrDraft',async()=>{
    const {instance:shell,frames}=component('cardstackStudio'); const calls=[];let releaseObject;const objectGate=new Promise(resolve=>{releaseObject=resolve;});let opened=false;
    shell.template.querySelector=selector=>selector==='c-cardstack-object-config'?{openObject:async api=>{calls.push(api);await objectGate;}}:selector==='c-cardstack-publish-center'?{focusDraft:async id=>calls.push(id)}:null;
    const opening=shell.handleNavigateTab({detail:{tab:'objects',objectApi:'Contact'}}).then(()=>{opened=true;});
    assert.equal(shell.activeTab,'objects'); assert.deepEqual(calls,[]); assert.equal(frames.length,1,'targeted navigation waits for the rendered tab'); frames.shift()();await Promise.resolve();assert.equal(opened,false,'navigation awaits the child public method');releaseObject();await opening; assert.deepEqual(calls,['Contact']);
    const draft=shell.handleNavigateTab({detail:{tab:'publish',draftId:'a01000000000001AAA'}});frames.shift()();await draft;assert.deepEqual(calls,['Contact','a01000000000001AAA']);
    await shell.handleNavigateTab({detail:{tab:'unknown'}}); assert.equal(shell.activeTab,'publish');
    const {instance:dashboard,events}=component('cardstackDashboard');dashboard.wired({data:overview});
    dashboard.openObject({currentTarget:{dataset:{object:'Contact'}}});dashboard.openDraft({currentTarget:{dataset:{id:'a01000000000001AAA'}}});
    assert.deepEqual(plain(events.map(event=>event.detail)),[{tab:'objects',objectApi:'Contact'},{tab:'publish',draftId:'a01000000000001AAA'}]);
});
test('configChangeRefreshesOverviewAndPendingCount',async()=>{
    const calls=[],gates=[];const wait=label=>{calls.push(label);return new Promise(resolve=>gates.push(resolve));};
    const {instance:shell}=component('cardstackStudio',{refreshApex:result=>{assert.equal(result.data,overview);return wait('count');}});
    assert.equal(typeof shell.wiredOverview,'function','authoritative count wire exists');shell.wiredOverview({data:overview});shell.template.querySelector=selector=>({refresh:()=>wait(selector)});
    let finished=false;const refresh=shell.handleConfigChange({detail:{keys:['layout:Contact:default'],operation:'save'}}).then(()=>{finished=true;});
    assert.deepEqual(calls,['count','c-cardstack-dashboard','c-cardstack-publish-center']);await Promise.resolve();assert.equal(finished,false);
    gates.forEach(resolve=>resolve());await refresh;assert.equal(finished,true);shell.wiredOverview({data:{...overview,activePendingDraftCount:206}});assert.equal(shell.publishLabel,'Review & Publish (206)');
    const results=[];const {instance:dashboard}=component('cardstackDashboard',{refreshApex:async result=>results.push(result)});const wire={data:overview},draftWire={data:[]};dashboard.wired(wire);dashboard.wiredDrafts(draftWire);await dashboard.refresh();assert.deepEqual(results,[wire,draftWire]);
});
test('firstRunCanAuthorBeforeConnectionVerification',async()=>{
    const {instance:dashboard,events}=component('cardstackDashboard');dashboard.wired({data:{...overview,activePendingDraftCount:0,objects:[{objectApi:'Contact',label:'Contact',hasLive:false,hasDraft:false,metadataStatus:'ready'}]}});
    assert.ok(dashboard.nextAction,'first-run contextual action exists');assert.deepEqual(plain(dashboard.nextAction.target),{tab:'objects',objectApi:'Contact'});dashboard.handleNextAction();assert.deepEqual(plain(events[0].detail),{tab:'objects',objectApi:'Contact'});
    const {instance:shell,frames}=component('cardstackStudio');let wizardCalls=0;shell.template.querySelector=()=>({openWizard:()=>wizardCalls++});await shell.handleNavigateTab({detail:{tab:'flows'}});assert.equal(wizardCalls,0);
    let setupStage;shell.template.querySelector=()=>({openStage:key=>{setupStage=key;}});const setup=shell.handleNavigateTab({detail:{tab:'setup',setupStage:'verify'}});assert.equal(frames.length,1);frames.shift()();await setup;assert.equal(shell.activeTab,'setup');assert.equal(setupStage,'verify');assert.equal(wizardCalls,0);assert.equal(frames.length,0);
    const {instance:objects}=component('cardstackObjectConfig');let loaded=false;objects.loadStaging=async()=>{assert.equal(objects.selectedObject,'Contact');loaded=true;};await objects.openObject('Contact');assert.equal(loaded,true);assert.equal(objects.objectSearch,'');
});
test('overviewKeepsDraftAndPublishedStateSeparateAndNamesSupportedDrafts',()=>{
    const {instance:dashboard}=component('cardstackDashboard');dashboard.wired({data:overview});assert.equal(typeof dashboard.wiredDrafts,'function','supported draft summaries are available');dashboard.wiredDrafts({data:[
        {Id:'a01000000000001AAA',Status__c:'Draft',Config__r:{Name:'layout:Contact:default'}},
        {Id:'a01000000000002AAA',Status__c:'Draft',Config__r:{Name:'flows'}},
        {Id:'a01000000000003AAA',Status__c:'Draft',Config__r:{Name:'homecard'}}]});
    assert.deepEqual(plain(dashboard.pendingDrafts).map(row=>row.label),['Contact record card','Flow launch cards']);assert.equal(dashboard.pendingDraftCount,207);assert.match(dashboard.draftSummary,/Showing 2 of 207/);
    assert.equal(dashboard.objectRows.find(row=>row.objectApi==='Missing__c').status,'Published · Metadata unavailable');assert.equal(dashboard.objectRows.find(row=>row.objectApi==='Contact').status,'Draft saved');
    dashboard.data.objects[0].hasDraft=true;assert.equal(dashboard.objectRows[0].status,'Published · Draft saved');assert.match(dashboard.orgContextLabel,/Salesforce org context/i);assert.doesNotMatch(dashboard.orgContextLabel,/connected/i);
});
test('recordCardSaveNotifiesShellOnlyAfterConfirmedSave',async()=>{
    const {instance:objects,context,events}=component('cardstackObjectConfig');objects.selectedObject='Account';objects.toast=()=>{};objects.loadStaging=async()=>{};objects.wiredFieldsResult={data:[{api:'Name',label:'Name',type:'STRING',updateable:'false'}]};objects.workingHighlights=objects.enrichFields([{api:'Name'}]);
    let authoritative={};context.getStagingInfoFresh=async()=>authoritative;context.saveDraft=async input=>{authoritative={draft:{Id:'a01000000000001AAA',Draft_Value__c:input.value}};};await objects.stageLayout();assert.deepEqual(plain(events.map(event=>event.detail)),[{keys:['layout:Account:default'],operation:'save'}]);
    events.length=0;objects.workingHighlights[0].label='New submitted label';context.saveDraft=async()=>{throw new Error('Rejected');};await objects.stageLayout();assert.deepEqual(events,[]);
});
test('flowSaveNotifiesShellAfterWizardCompletionAndConfirmedRemoval',async()=>{
    const {instance:flow,context,events}=component('cardstackFlowConfig');flow.load=async()=>{flow.staging={draft:{Id:'a01000000000001AAA',Draft_Value__c:'[]'}};};flow.toast=()=>{};
    await flow.handleWizardDone({detail:{outcome:'saved'}});assert.deepEqual(plain(events.map(event=>event.detail)),[{keys:['flows'],operation:'save'}]);
    events.length=0;context.getStagingInfo=async()=>({liveValue:'[{"apiName":"ExampleFlow"}]'});context.saveDraft=async()=>{};await flow.removeCard({currentTarget:{dataset:{api:'ExampleFlow'}}});assert.deepEqual(plain(events.map(event=>event.detail)),[{keys:['flows'],operation:'save'}]);
});
test('closingUnchangedFlowWizardDoesNotClaimAConfigurationSave',async()=>{
    const {instance:flow,events}=component('cardstackFlowConfig');flow.staging={draft:{Id:'a01000000000001AAA',Draft_Value__c:'[]'}};flow.load=async()=>{};await flow.handleWizardDone({detail:{outcome:'canceled'}});assert.deepEqual(events,[]);
});
test('actualWizardConfirmedSaveRefreshesShellCountDespiteParentReadFailure',async()=>{
    const oldDraft={liveValue:'[]',draft:{Id:'a01000000000001AAA',Draft_Value__c:'[]'}};
    const {instance:flow}=component('cardstackFlowConfig',{getStagingInfo:async()=>{throw new Error('Post-save read failed');}});flow.staging=oldDraft;flow.showWizard=true;
    const {instance:shell}=component('cardstackStudio',{refreshApex:async()=>shell.wiredOverview({data:{...overview,activePendingDraftCount:208}})});shell.wiredOverview({data:overview});
    let parentCompletion,shellRefresh,saved;const changes=[];flow.dispatchEvent=event=>{changes.push(event);shellRefresh=shell.handleConfigChange(event);};
    let authoritative=oldDraft;const {instance:wizard}=component('cardstackFlowWizard',{getStagingInfo:async()=>oldDraft,getStagingInfoFresh:async()=>authoritative,saveDraft:async input=>{saved=input;authoritative={draft:{Id:'a01000000000002AAA',Draft_Value__c:input.value}};}});wizard.toast=()=>{};
    wizard.dispatchEvent=event=>{parentCompletion=flow.handleWizardDone(event);};
    await wizard.loadExisting();wizard.selectedFlow={apiName:'Review',label:'Review'};wizard.flowLabel='Review';await wizard.stagePolicy();await parentCompletion;await shellRefresh;
    assert.equal(saved.key,'flows');assert.equal(JSON.parse(saved.value)[0].apiName,'Review');assert.equal(flow.showWizard,false);assert.equal(flow.error,'Post-save read failed');assert.equal(flow.staging,oldDraft);
    assert.deepEqual(plain(changes.map(event=>event.detail)),[{keys:['flows'],operation:'save'}]);assert.equal(shell.publishLabel,'Review & Publish (208)');
});
