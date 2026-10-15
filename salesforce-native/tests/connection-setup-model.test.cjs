const test = require('node:test');
const assert = require('node:assert/strict');
let model;
test.before(async () => { model = await import('../force-app/main/default/lwc/cardstackConnectionSetupModel/cardstackConnectionSetupModel.js'); });
const view = (client = 'claude', extra = {}) => ({ client, revision: 1, publicClientId: 'public', callbacks: ['https://client.example/callback'], sitePrefix: '/chat', enabledIntent: true, versions: {package:'1'}, checks: [{stage:'site',status:'Unknown',source:'Manual Salesforce Setup inspection required',checkedAt:null,errorCode:'UNKNOWN_METADATA'}], summary:'Needs verification', stepStates:{}, ...extra });
test('unreadableSettingUnknown', () => { const parsed = model.parseView(JSON.stringify(view())); assert.equal(parsed.checks[0].status, 'Unknown'); assert.equal(model.connectionStatus(parsed), 'Needs verification'); });
test('manualFlagCannotVerify', () => { assert.equal(model.connectionStatus(view('claude',{stepStates:{verify:true,claude:true},claudeConnected:true})), 'Needs verification'); });
test('dismissedLegacyChecklistCannotHideStaleConnection', () => { assert.equal(model.showConnectionAttention({claude:view('claude',{summary:'Stale'}),chatgpt:view('chatgpt')},true), true); });
test('independentClientStatuses', () => { const s=model.createState(); model.acceptView(s,view()); model.acceptView(s,view('chatgpt',{summary:'Stale'})); assert.equal(model.connectionStatus(s.clients.claude.view),'Needs verification'); assert.equal(model.connectionStatus(s.clients.chatgpt.view),'Stale'); });
test('staleSavePreservesDraft', () => { const s=model.createState(); model.acceptView(s,view()); model.editDraft(s,'claude','publicClientId','my unsaved edit'); model.recordFailure(s,'claude',{body:{message:'STALE_SETUP'}}); model.acceptView(s,view('claude',{revision:2,publicClientId:'someone else'})); assert.equal(s.clients.claude.draft.publicClientId,'my unsaved edit'); assert.equal(s.clients.claude.draft.expectedRevision,1); assert.equal(s.clients.claude.view.revision,2); assert.equal(s.clients.claude.error,'STALE_SETUP'); });
test('ordinaryUserCannotSave', () => { const s=model.createState(); model.acceptView(s,view()); model.recordFailure(s,'claude',{body:{message:'NOT_AUTHORIZED'}}); assert.throws(()=>model.savePayload(s,'claude'),/NOT_AUTHORIZED/); });
test('errorOutputSanitized', () => { assert.equal(model.safeError({body:{message:'session token PRIVATE'}}),'SETUP_UNAVAILABLE'); assert.equal(model.safeError({body:{message:'STALE_SETUP'}}),'STALE_SETUP'); });
test('switchingClientsPreservesIndependentDrafts', () => { const s=model.createState(); model.acceptView(s,view()); model.acceptView(s,view('chatgpt')); model.editDraft(s,'claude','publicClientId','first'); model.editDraft(s,'chatgpt','publicClientId','second'); assert.equal(model.savePayload(s,'claude').publicClientId,'first'); assert.equal(model.savePayload(s,'chatgpt').publicClientId,'second'); });
test('resumeHistoryIsIndependentOfReadiness', () => { const s=model.createState(); model.acceptView(s,view('claude',{stepStates:{installation:true,verify:true}})); assert.equal(s.clients.claude.draft.stepStates.installation,true); assert.equal(model.connectionStatus(s.clients.claude.view),'Needs verification'); });
test('savedRevisionAdoptsOnlyAfterSuccessfulSave', () => { const s=model.createState(); model.acceptView(s,view()); model.editDraft(s,'claude','publicClientId','new'); model.acceptView(s,view('claude',{revision:2,publicClientId:'new'}),true); assert.equal(s.clients.claude.draft.expectedRevision,2); assert.equal(s.clients.claude.dirty,false); });
test('rejectMalformedOversizeAndPrivateResponse', () => { for(const data of ['{', 'x'.repeat(65537), JSON.stringify(view('claude',{siteId:'private'})), JSON.stringify(view('claude',{checks:[{stage:'site',status:'Connected'}]}))]) assert.throws(()=>model.parseView(data),/INVALID_RESPONSE/); });
test('safeRecoveryLinksAndSeparateStages', () => { const r=model.recovery('htmlLoading','UI_LOAD_FAILED'); assert.match(r.message,/resource|bridge/i); assert.match(r.href,/^\/lightning\/setup\//); assert.equal(model.recovery('site','https://evil.test').href,'/lightning/setup/CustomDomain/home'); });
test('manualFlagsCannotEraseFailedEvidence', () => { assert.equal(model.connectionStatus(view('claude',{checks:[{stage:'diagnosticExchange',status:'Fail'}],stepStates:{verify:true}})),'Needs attention'); });
test('supportSummaryRejectsPrivateAndOversizedOutput', () => { const valid={status:'Needs verification',versions:{package:'1'},checks:[{stage:'site',status:'Unknown',errorCode:'UNKNOWN_METADATA',checkedAt:null}]}; assert.deepEqual(model.parseSupportSummary(JSON.stringify(valid)),valid); for(const input of [JSON.stringify({...valid,actor:'private'}), 'x'.repeat(65537)]) assert.throws(()=>model.parseSupportSummary(input),/INVALID_RESPONSE/); });
test('receiptRejectsPayloadAndPrivateReference', () => { const receipt={client:'claude',versions:{package:'1'},configurationRevision:1,checkedAt:null,expiresAt:null,exactValues:true,stages:[]}; assert.deepEqual(model.parseReceipt(JSON.stringify(receipt)),receipt); assert.throws(()=>model.parseReceipt(JSON.stringify({...receipt,values:{secret:'private'}})),/INVALID_RESPONSE/); assert.throws(()=>model.parseReceipt(JSON.stringify({...receipt,reference:'check_private'})),/INVALID_RESPONSE/); });
test('unknownSaveRecoveryPrecedesConfigurationDrift', () => { assert.match(model.recovery('configuration','SAVE_OUTCOME_UNKNOWN').message,/authoritative receipt/); });
test('expiredDiagnosticDirectsFreshAttemptInAffectedClient', () => {
    const result = model.recovery('diagnosticExchange','ATTEMPT_EXPIRED');
    assert.match(result.message,/fresh diagnostic/i);
    assert.match(result.message,/affected client/i);
    assert.doesNotMatch(result.message,/Site settings.*unreadable/i);
    assert.notEqual(result.href,'/lightning/setup/CustomDomain/home');
});
const observedState = () => {
    const state = model.createState();
    for (const client of ['claude','chatgpt']) model.acceptView(state,view(client,{checks:[
        {stage:'diagnosticExchange',status:'Pass'}, {stage:'clientUiObserved',status:'Pass'}
    ]}));
    return state;
};
test('failedRefreshKeepsSummaryAttentionConsistent', () => {
    const state = observedState();
    assert.equal(model.connectionSummary(state).needsAttention,false);
    model.recordFailure(state,'claude',new Error('network unavailable'));
    const result = model.connectionSummary(state);
    assert.deepEqual(result.clients,[{client:'claude',status:'Needs attention'},{client:'chatgpt',status:'Client UI observed'}]);
    assert.equal(result.needsAttention,true);
});
test('authorizationLossKeepsSummaryAttentionConsistent', () => {
    const state = observedState();
    model.recordFailure(state,'chatgpt',new Error('NOT_AUTHORIZED'));
    const result = model.connectionSummary(state);
    assert.equal(result.clients[1].status,'Admin permission required');
    assert.equal(result.needsAttention,true);
});

test('siteRecoveryNavigatesToActualSalesforceSitesSetup', () => {
    // Salesforce Quick Find > Sites uses CustomDomain in the fresh API67 org.
    // A Sites/home regression would send these blocked stages to Page not found.
    for (const [stage, code] of [
        ['site', 'UNKNOWN_METADATA'],
        ['site', 'ISSUER_MISMATCH'],
        ['metadata', 'METADATA_MISMATCH'],
        ['site', 'https://evil.test/steal']
    ]) {
        const result = model.recovery(stage, code);
        const destination = new URL(result.href, 'https://admin.example.my.salesforce.com');
        assert.equal(destination.origin, 'https://admin.example.my.salesforce.com');
        assert.equal(destination.pathname, '/lightning/setup/CustomDomain/home', `${stage}/${code}`);
        assert.equal(destination.search, '');
        assert.equal(destination.hash, '');
    }
});

test('oauthRecoveryNavigatesToActualExternalClientAppManager', () => {
    // Actual Setup Quick Find > External Client App Manager in the fresh org.
    // ExternalClientApps/home sends these recovery actions to Page not found.
    for (const [stage, code] of [
        ['oauthPolicy', 'UNKNOWN_METADATA'],
        ['oauthPolicy', 'REDIRECT_MISMATCH'],
        ['oauthPolicy', 'GUEST_401'],
        ['configuration', 'STALE_SETUP'],
        ['htmlLoading', 'UI_LOAD_FAILED'],
        ['hostBridge', 'UI_LOAD_FAILED'],
        ['clientUiObserved', 'UI_LOAD_FAILED'],
        ['oauthPolicy', 'https://evil.test/steal']
    ]) {
        const result = model.recovery(stage, code);
        const destination = new URL(result.href, 'https://admin.example.my.salesforce.com');
        assert.equal(destination.origin, 'https://admin.example.my.salesforce.com');
        assert.equal(destination.pathname, '/lightning/setup/ManageExternalClientApplication/home', `${stage}/${code}`);
        assert.equal(destination.search, '');
        assert.equal(destination.hash, '');
    }
});

test('configurationDriftBlocksVerificationEvenWithoutDiagnosticHistory', () => {
    const state=model.createState();model.acceptView(state,view('claude',{summary:'Stale',checks:[{stage:'site',status:'Pass'},{stage:'configuration',status:'Stale',errorCode:'STALE_SETUP'}]}));
    assert.equal(model.setupStages(state.clients.claude).find(stage=>stage.key==='verify').status,'stale');
    assert.equal(model.nextSetupStage(state.clients.claude),'verify');
});
test('originatingRequestFailurePreservesOtherClientDraftAndEvidence', () => {
    const state=observedState();model.editDraft(state,'claude','publicClientId','claude-draft');model.editDraft(state,'chatgpt','publicClientId','chatgpt-draft');
    model.recordFailure(state,'claude',new Error('NOT_AUTHORIZED'));
    assert.equal(model.setupStages(state.clients.claude).some(stage=>stage.status==='verified'),false);
    assert.equal(model.setupStages(state.clients.chatgpt).find(stage=>stage.key==='verify').status,'verified');
    assert.equal(model.savePayload(state,'chatgpt').publicClientId,'chatgpt-draft');assert.equal(state.clients.claude.draft.publicClientId,'claude-draft');assert.equal(state.clients.chatgpt.error,null);
});

test('savedDirectEnrollmentRetainsModeAndNoSiteOnUiSave', () => {
    const state=model.createState();
    const direct=view('chatgpt',{transportKind:'direct-org-api/v1',routeVersion:'apex-probe/v1',sitePrefix:'',metadataUrl:null,checks:[{stage:'directTransport',status:'Pass'}]});
    model.acceptView(state,model.parseView(JSON.stringify(direct)));
    model.editDraft(state,'chatgpt','publicClientId','edited');
    const payload=model.savePayload(state,'chatgpt');
    assert.equal(payload.transportKind,'direct-org-api/v1'); assert.equal(payload.routeVersion,'apex-probe/v1');
    assert.equal(payload.siteId,''); assert.equal(payload.sitePrefix,'');
});
test('directTransportGuideExplainsExistingEndpointWithoutSiteOrAuthToggle', () => {
    const state=model.createState();model.acceptView(state,view('chatgpt',{transportKind:'direct-org-api/v1',routeVersion:'apex-probe/v1',checks:[{stage:'directTransport',status:'Pass'}]}));
    const stage=model.setupStages(state.clients.chatgpt).find(item=>item.key==='site');
    assert.equal(stage.title,'Inspect the existing direct endpoint'); assert.equal(stage.status,'verified');
    assert.match(stage.nextAction,/existing.*endpoint/i); assert.doesNotMatch(stage.nextAction,/guest|active Site|JWT OFF/i);
});
test('unknownTransportAndDirectClaudeResponseRejected', () => {
    for(const extra of [{transportKind:'other'},{transportKind:'direct-org-api/v1',routeVersion:'other'}]) assert.throws(()=>model.parseView(JSON.stringify(view('chatgpt',extra))),/INVALID_RESPONSE/);
    assert.throws(()=>model.parseView(JSON.stringify(view('claude',{transportKind:'direct-org-api/v1',routeVersion:'apex-probe/v1'}))),/INVALID_RESPONSE/);
});
test('dirtyDirectDraftSurvivesFreshSiteResponse', () => {
    const state=model.createState();model.acceptView(state,view('chatgpt',{transportKind:'direct-org-api/v1',routeVersion:'apex-probe/v1',sitePrefix:''}));
    model.editDraft(state,'chatgpt','publicClientId','mine');model.acceptView(state,view('chatgpt',{revision:2}));
    assert.equal(model.savePayload(state,'chatgpt').transportKind,'direct-org-api/v1');assert.equal(model.savePayload(state,'chatgpt').expectedRevision,1);
});

test('savedDirectRecoveryPreservesExistingAuthAndAvoidsSiteInstructions', () => {
    for(const [stage,code] of [['oauthPolicy','GUEST_401'],['oauthPolicy','REDIRECT_MISMATCH'],['site','ISSUER_MISMATCH'],['site','METADATA_MISMATCH'],['site','UNKNOWN_METADATA'],['oauthPolicy','UNKNOWN_METADATA'],['directTransport','UNKNOWN_METADATA']]) {
        const result=model.recovery(stage,code,'direct-org-api/v1');
        assert.doesNotMatch(result.message,/JWT|opaque|selected Site|Site settings|guest ingress/i,`${stage}/${code}`);
        assert.match(result.message,/existing|saved.*enrollment/i);assert.match(result.message,/preserve.*auth.*settings/i);
        assert.notEqual(result.href,'/lightning/setup/CustomDomain/home');
    }
    assert.match(model.recovery('oauthPolicy','GUEST_401').message,/JWT OFF/,'Existing Site guidance stays intact');
    assert.equal(model.recovery('site','ISSUER_MISMATCH').href,'/lightning/setup/CustomDomain/home');
});
test('savedDirectStageRecoveryUsesSavedModeForUnknownEvidence', () => {
    const state=model.createState();model.acceptView(state,view('chatgpt',{transportKind:'direct-org-api/v1',routeVersion:'apex-probe/v1',sitePrefix:'',checks:[{stage:'directTransport',status:'Unknown'},{stage:'oauthPolicy',status:'Unknown',errorCode:'GUEST_401'}]}));
    for(const key of ['site','chatgpt']) {
        const stage=model.setupStages(state.clients.chatgpt).find(item=>item.key===key);
        assert.doesNotMatch(stage.recovery.message,/JWT|opaque|selected Site|Site settings|guest ingress/i);
        assert.notEqual(stage.recovery.href,'/lightning/setup/CustomDomain/home');
    }
});
