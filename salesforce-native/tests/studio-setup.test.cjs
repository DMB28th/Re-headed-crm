const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const base = path.resolve(__dirname, '../force-app/main/default/lwc');
let model;
test.before(async () => { model = await import(path.join(base, 'cardstackConnectionSetupModel/cardstackConnectionSetupModel.js')); });
const view = (client = 'claude', extra = {}) => ({client,revision:1,publicClientId:'public',callbacks:['https://client.example/callback'],sitePrefix:'/chat',enabledIntent:true,versions:{package:'1'},checks:[{stage:'site',status:'Unknown',source:'Manual Salesforce Setup inspection required',checkedAt:null,errorCode:'UNKNOWN_METADATA'},{stage:'oauthPolicy',status:'Unknown',source:'Manual Salesforce Setup inspection required',checkedAt:null,errorCode:'UNKNOWN_METADATA'}],summary:'Needs verification',stepStates:{},...extra});
function component(extra = {}) {
    const events = [], context = {LightningElement:class {dispatchEvent(event) {events.push(event);}},CustomEvent:class {constructor(type,options) {this.type=type;Object.assign(this,options);}},hasManageConnections:true, ...model, ...extra};
    const source = fs.readFileSync(path.join(base,'cardstackConnectionSetup/cardstackConnectionSetup.js'),'utf8').replace(/^import .*;$/gm,'').replace(/@api\s+/g,'').replace(/export default class \w+/,'globalThis.Component = class');
    vm.runInNewContext(source,context);
    const instance = new context.Component();instance.template={querySelectorAll:()=>[]};
    for(const client of ['claude','chatgpt']) model.acceptView(instance.state,view(client));
    return {instance,events};
}
test('historyDoesNotVerifyStage', () => {
    const state=model.createState();model.acceptView(state,view());model.editDraft(state,'claude','stepStates',{site:true,claude:true,verify:true});
    assert.equal(typeof model.setupStages,'function');
    assert.equal(model.setupStages(state.clients.claude).find(stage=>stage.key==='site').status,'unknown');
    assert.notEqual(model.setupStages(state.clients.claude).find(stage=>stage.key==='verify').status,'verified');
    assert.equal(model.nextSetupStage(state.clients.claude),'site');
});
test('clientsKeepIndependentDraftAndEvidence', () => {
    const {instance:c}=component();model.acceptView(c.state,view('claude',{checks:[{stage:'diagnosticExchange',status:'Pass'},{stage:'clientUiObserved',status:'Pass'}]}));
    model.editDraft(c.state,'claude','publicClientId','first');model.editDraft(c.state,'chatgpt','publicClientId','second');
    c.openStage('chatgpt');assert.equal(c.client,'chatgpt');assert.equal(c.draft.publicClientId,'second');assert.notEqual(c.activeStage.status,'verified');
    c.openStage('claude');assert.equal(c.draft.publicClientId,'first');c.openStage('verify');assert.equal(c.activeStage.status,'verified');
});
test('unknownMetadataOffersManualInspection', () => {
    const state=model.createState();model.acceptView(state,view());assert.equal(typeof model.setupStages,'function');
    const stages=model.setupStages(state.clients.claude);assert.deepEqual(stages.map(s=>s.key),['installation','site','claude','chatgpt','verify','nextGate']);
    assert.match(stages.find(s=>s.key==='site').nextAction,/inspect/i);assert.equal(stages.find(s=>s.key==='site').recovery.href,'/lightning/setup/CustomDomain/home');
    assert.equal(stages.find(s=>s.key==='claude').recovery.href,'/lightning/setup/ManageExternalClientApplication/home');
});
test('switchingStageDoesNotLoseInputs', () => {
    const {instance:c,events}=component();model.editDraft(c.state,'claude','siteId','0DM000000000001GAA');model.editDraft(c.state,'claude','callbacks',['https://client.example/new']);c.receiptReference='check_'+ 'a'.repeat(64);
    const before=JSON.stringify(c.draft),evidence=JSON.stringify(c.view);c.openStage('site');c.nextStage();
    assert.equal(JSON.stringify(c.draft),before);assert.equal(JSON.stringify(c.view),evidence);assert.equal(c.receiptReference,'check_'+ 'a'.repeat(64));assert.equal(events.length,0);assert.notEqual(c.activeStage.status,'verified');
    const key=c.selectedStage;c.openStage('evil');assert.equal(c.selectedStage,key);
});
test('expiredOrChangedSetupInvalidatesOnlyAffectedEvidence', () => {
    const state=model.createState();for(const client of ['claude','chatgpt']) model.acceptView(state,view(client,{checks:[{stage:'site',status:'Pass'},{stage:'diagnosticExchange',status:'Pass'},{stage:'clientUiObserved',status:'Pass'}]}));
    model.acceptView(state,view('claude',{checks:[{stage:'site',status:'Pass'},{stage:'diagnosticExchange',status:'Fail',errorCode:'ATTEMPT_EXPIRED'},{stage:'clientUiObserved',status:'Unknown'}]}));
    assert.equal(typeof model.setupStages,'function');assert.equal(model.setupStages(state.clients.claude).find(s=>s.key==='verify').status,'blocked');assert.equal(model.setupStages(state.clients.claude).find(s=>s.key==='site').status,'verified');assert.equal(model.setupStages(state.clients.chatgpt).find(s=>s.key==='verify').status,'verified');assert.equal(model.nextSetupStage(state.clients.claude),'verify');
    model.acceptView(state,view('claude',{summary:'Stale',checks:[{stage:'site',status:'Pass'},{stage:'configuration',status:'Stale',errorCode:'STALE_SETUP'},{stage:'diagnosticExchange',status:'Stale',errorCode:'STALE_SETUP'},{stage:'clientUiObserved',status:'Stale'}]}));
    assert.equal(model.setupStages(state.clients.claude).find(s=>s.key==='verify').status,'stale');assert.equal(model.setupStages(state.clients.chatgpt).find(s=>s.key==='verify').status,'verified');
});
test('staleSaveKeepsStagedInputs', async () => {
    const {instance:c}=component({saveForUi:async()=>{throw new Error('STALE_SETUP');}});model.editDraft(c.state,'claude','publicClientId','unsaved');c.openStage('site');await c.save();
    assert.equal(c.draft.publicClientId,'unsaved');assert.equal(c.entry.error,'STALE_SETUP');assert.equal(c.activeStage.key,'site');assert.match(c.errorMessage,/preserved/);
});
test('authorizationFailureCannotShowVerifiedStages', () => {
    const state=model.createState();model.acceptView(state,view('claude',{checks:[{stage:'site',status:'Pass'},{stage:'diagnosticExchange',status:'Pass'},{stage:'clientUiObserved',status:'Pass'}]}));model.recordFailure(state,'claude',new Error('NOT_AUTHORIZED'));
    assert.equal(typeof model.setupStages,'function');assert.equal(model.setupStages(state.clients.claude).some(s=>s.status==='verified'),false);assert.equal(model.nextSetupStage(state.clients.claude),'installation');
});
test('shellConsumesSetupStageAfterTabRender',async()=>{
    const frames=[],context={LightningElement:class{},requestAnimationFrame:fn=>frames.push(fn),...model};
    vm.runInNewContext(fs.readFileSync(path.join(base,'cardstackStudioModel/cardstackStudioModel.js'),'utf8').replace(/export /g,''),context);
    vm.runInNewContext(fs.readFileSync(path.join(base,'cardstackStudio/cardstackStudio.js'),'utf8').replace(/^import .*;$/gm,'').replace(/^\s*@wire\(.*\)\s*$/gm,'').replace(/@track\s+/g,'').replace(/export default class \w+/,'globalThis.Shell=class'),context);
    const shell=new context.Shell(),{instance:setup}=component();shell.template={querySelector:selector=>selector==='c-cardstack-connection-setup'?setup:null};
    const opening=shell.handleNavigateTab({detail:{tab:'setup',setupStage:'site'}});assert.equal(shell.activeTab,'setup');assert.equal(frames.length,1,'Setup targeting waits for the rendered child');frames.shift()();await opening;assert.equal(setup.activeStage.key,'site');
});
test('clientPickerKeepsStageTitleAlignedWithItsInputs', () => {
    const {instance:c}=component();c.openStage('claude');c.switchClient({detail:{value:'chatgpt'}});
    assert.equal(c.activeStage.key,'chatgpt');assert.equal(c.draft.client,'chatgpt');
});
test('stageHeadingFocusWaitsUntilGuideExistsAndIsConsumedOnce', () => {
    const {instance:c}=component();let focused=0;c.template.querySelector=()=>({focus:()=>focused++});
    c.state.clients.claude.draft=null;c.openStage('site');c.renderedCallback();assert.equal(focused,0);
    model.acceptView(c.state,view());c.renderedCallback();c.renderedCallback();assert.equal(focused,1);
});
test('requestedStageSurvivesLateInitialViews', async () => {
    const releases=[];const {instance:c}=component({loadForUi:({client})=>new Promise(resolve=>releases.push(()=>resolve(JSON.stringify(view(client)))))});
    c.state=model.createState();const loading=c.initialize();assert.equal(c.entry.view,null);c.openStage('site');assert.equal(c.canRenderGuide,false);
    releases.forEach(resolve=>resolve());await loading;assert.equal(c.activeStage.key,'site');assert.equal(c.canRenderGuide,true);assert.equal(c.draft.siteId,'');assert.deepEqual(JSON.parse(JSON.stringify(c.draft.stepStates)),{});
});
const observedReceipt = (client='claude') => ({client,versions:{package:'1'},configurationRevision:1,checkedAt:'2026-10-13T12:00:00Z',expiresAt:'2026-10-13T12:10:00Z',exactValues:true,stages:[{stage:'diagnosticExchange',status:'Pass'},{stage:'clientUiObserved',status:'Pass'}]});
test('pendingObservationFailureBelongsToOriginAfterStageClientSwitch',async()=>{
    let reject;const {instance:c}=component({observeForUi:()=>new Promise((resolve,r)=>{reject=r;})});
    model.acceptView(c.state,view('chatgpt',{checks:[{stage:'diagnosticExchange',status:'Pass'},{stage:'clientUiObserved',status:'Pass'}]}));model.editDraft(c.state,'chatgpt','publicClientId','chatgpt-draft');
    c.receiptReference='check_'+ 'a'.repeat(64);const pending=c.observe();assert.equal(c.busy,true);c.openStage('chatgpt');reject(new Error('NOT_AUTHORIZED'));await pending;
    assert.equal(c.state.clients.claude.error,'NOT_AUTHORIZED');assert.equal(c.state.clients.chatgpt.error,null);assert.equal(c.entry.authorized,true);assert.equal(c.draft.publicClientId,'chatgpt-draft');assert.equal(model.setupStages(c.entry).find(s=>s.key==='verify').status,'verified');assert.equal(c.observationText,'');
});
test('pendingObservationSuccessRefreshesOnlyOriginAndCannotDisplayOnOtherClient',async()=>{
    let release;const reads=[];const {instance:c}=component({observeForUi:()=>new Promise(resolve=>{release=resolve;}),loadForUi:async({client})=>{reads.push(client);return JSON.stringify(view(client,{checks:observedReceipt(client).stages}));}});
    c.receiptReference='check_'+ 'a'.repeat(64);const pending=c.observe();c.openStage('chatgpt');release(JSON.stringify(observedReceipt()));await pending;
    assert.deepEqual(reads,['claude']);assert.equal(model.setupStages(c.state.clients.claude).find(s=>s.key==='verify').status,'verified');assert.notEqual(model.setupStages(c.entry).find(s=>s.key==='verify').status,'verified');assert.equal(c.observationText,'');assert.equal(c.observation,null);
});
test('pendingSupportExportCannotDisplayOnOtherClient',async()=>{
    let release;const {instance:c}=component({exportSummary:({client})=>{assert.equal(client,'claude');return new Promise(resolve=>{release=resolve;});}});
    const pending=c.exportSafeSummary();c.openStage('chatgpt');release(JSON.stringify({status:'Diagnostic passed',versions:{package:'claude-package'},checks:[]}));await pending;
    assert.equal(c.client,'chatgpt');assert.equal(c.supportSummary,'');assert.equal(c.entry.error,null);
});
test('pendingSupportExportFailureBelongsToOriginAfterStageClientSwitch',async()=>{
    let reject;const {instance:c}=component({exportSummary:()=>new Promise((resolve,r)=>{reject=r;})});
    const pending=c.exportSafeSummary();c.openStage('chatgpt');reject(new Error('NOT_AUTHORIZED'));await pending;
    assert.equal(c.state.clients.claude.error,'NOT_AUTHORIZED');assert.equal(c.entry.error,null);assert.equal(c.entry.authorized,true);assert.equal(c.supportSummary,'');
});
test('observationRejectsMismatchedClientResponseAndPreservesOriginDraft',async()=>{
    const {instance:c}=component({observeForUi:async()=>JSON.stringify(observedReceipt('chatgpt')),loadForUi:async({client})=>JSON.stringify(view(client))});
    model.editDraft(c.state,'claude','publicClientId','origin-draft');c.receiptReference='check_'+ 'a'.repeat(64);await c.observe();
    assert.equal(c.entry.error,'INVALID_RESPONSE');assert.equal(c.draft.publicClientId,'origin-draft');assert.equal(c.observationText,'');
});
test('clientStageRequestBeforeLoadingKeepsItsTarget',async()=>{
    const releases=[];const {instance:c}=component({loadForUi:({client})=>new Promise(resolve=>releases.push(()=>resolve(JSON.stringify(view(client)))))});
    c.state=model.createState();const pending=c.initialize();c.openStage('chatgpt');releases.forEach(resolve=>resolve());await pending;
    assert.equal(c.client,'chatgpt');assert.equal(c.activeStage.key,'chatgpt');assert.equal(c.draft.client,'chatgpt');
});
test('originClientStillSeesSuccessfulObservationAndSafeSummary',async()=>{
    const {instance:c}=component({observeForUi:async()=>JSON.stringify(observedReceipt()),loadForUi:async({client})=>JSON.stringify(view(client,{checks:observedReceipt(client).stages})),exportSummary:async({client})=>{assert.equal(client,'claude');return JSON.stringify({status:'Client UI observed',versions:{package:'1'},checks:[]});}});
    c.receiptReference='check_'+ 'a'.repeat(64);await c.observe();assert.match(c.observationText,/saved for claude/);assert.equal(c.receiptReference,'');assert.equal(c.entry.error,null);
    await c.exportSafeSummary();assert.equal(JSON.parse(c.supportSummary).status,'Client UI observed');c.openStage('chatgpt');assert.equal(c.observationText,'');assert.equal(c.supportSummary,'');
});

test('savedDirectModeShowsExistingEndpointGuidePerClient', () => {
    const {instance:c}=component();
    model.acceptView(c.state,view('chatgpt',{transportKind:'direct-org-api/v1',routeVersion:'apex-probe/v1',sitePrefix:'',checks:[{stage:'directTransport',status:'Pass'}]}));
    c.openStage('chatgpt'); assert.equal(c.isDirect,true);assert.equal(c.isSiteTransport,false);
    c.openStage('site'); assert.equal(c.activeStage.title,'Inspect the existing direct endpoint');
    c.openStage('claude'); assert.equal(c.isDirect,false);assert.equal(c.isSiteTransport,true);
});
test('directSaveKeepsExistingEnrollmentAcrossInFlightClientSwitch',async()=>{
    let release,sent;
    const direct=(revision=1)=>view('chatgpt',{revision,transportKind:'direct-org-api/v1',routeVersion:'apex-probe/v1',sitePrefix:''});
    const {instance:c}=component({saveForUi:({inputJson})=>{sent=JSON.parse(inputJson);return new Promise(resolve=>{release=()=>resolve(JSON.stringify(direct(2)));});},loadForUi:async({client})=>JSON.stringify(client==='chatgpt'?direct(2):view(client))});
    model.acceptView(c.state,direct());c.openStage('chatgpt');model.editDraft(c.state,'chatgpt','publicClientId','my edit');
    const saving=c.save();c.openStage('claude');release();await saving;
    assert.equal(sent.client,'chatgpt');assert.equal(sent.transportKind,'direct-org-api/v1');assert.equal(sent.routeVersion,'apex-probe/v1');assert.equal(sent.siteId,'');assert.equal(sent.sitePrefix,'');
    assert.equal(c.client,'claude');assert.equal(c.isDirect,false);assert.equal(c.state.clients.chatgpt.draft.transportKind,'direct-org-api/v1');assert.equal(c.state.clients.chatgpt.draft.expectedRevision,2);
});

test('actualSavedDirectRecoveryRowsAndEvidencePreserveExistingAuth', () => {
    const {instance:c}=component();
    model.acceptView(c.state,view('chatgpt',{transportKind:'direct-org-api/v1',routeVersion:'apex-probe/v1',sitePrefix:'',checks:[{stage:'site',status:'Unknown',errorCode:'METADATA_MISMATCH'},{stage:'oauthPolicy',status:'Fail',errorCode:'GUEST_401'}]}));c.openStage('chatgpt');
    for(const result of [...c.recoveryRows,...c.evidence.map(item=>item.recovery),c.currentRecovery]) {
        assert.doesNotMatch(result.message,/JWT|opaque|selected Site|Site settings|guest ingress/i);
        assert.notEqual(result.href,'/lightning/setup/CustomDomain/home');
    }
    assert.match(c.recoveryRows.find(row=>row.key==='guest').message,/preserve.*auth.*settings/i);
    assert.match(c.recoveryRows.find(row=>row.key==='metadata').message,/existing.*endpoint|saved.*enrollment/i);
    c.openStage('claude');assert.match(c.recoveryRows.find(row=>row.key==='guest').message,/JWT OFF/);
    assert.equal(c.recoveryRows.find(row=>row.key==='metadata').href,'/lightning/setup/CustomDomain/home');
});
test('recoveryUsesSavedTransportRatherThanUnsavedDraftMode', () => {
    const {instance:c}=component();
    c.state.clients.claude.draft.transportKind='direct-org-api/v1';
    assert.match(c.recoveryRows.find(row=>row.key==='guest').message,/JWT OFF/);
    assert.equal(c.recoveryRows.find(row=>row.key==='metadata').href,'/lightning/setup/CustomDomain/home');
});
