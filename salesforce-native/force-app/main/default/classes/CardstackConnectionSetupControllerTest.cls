/** Behavioral adapter and resume contracts. Actual API67 execution is a separate root gate. */
@IsTest private with sharing class CardstackConnectionSetupControllerTest {
    private static CardstackConnectionTypes.SetupInput input(String client, Integer revision) {
        CardstackConnectionAccess.adminOverride = true; CardstackConnectionAccess.userOverride = true;
        CardstackConnectionTypes.SetupInput v = new CardstackConnectionTypes.SetupInput();
        v.client=client; v.expectedRevision=revision; v.publicClientId='public-client';
        v.callbacks=new List<String>{'https://client.example/callback'}; v.sitePrefix='/chat';
        v.siteId=(Id)CardstackConnectionTypes.normalizeId(Schema.Site.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED).getKeyPrefix()+'0'.repeat(12));
        v.enabledIntent=true; return v;
    }
    @IsTest static void jsonSerializationHasNoPrivateFields() {
        CardstackConnectionTypes.SetupInput v=input('claude',0);
        Test.startTest(); CardstackConnectionSetupController.save(v);
        Map<String,Object> result=(Map<String,Object>)JSON.deserializeUntyped(CardstackConnectionSetupController.loadForUi('claude'));
        Test.stopTest();
        Assert.areEqual(new Set<String>{'client','revision','publicClientId','callbacks','sitePrefix','resourceUrl','metadataUrl','issuer','enabledIntent','versions','checks','summary','stepStates'},result.keySet(),'Exact safe output');
        Assert.isFalse(JSON.serialize(result).contains(String.valueOf(v.siteId)),'Private Site excluded');
        Assert.areEqual('/chat',result.get('sitePrefix'),'Safe prefix resumes');
    }
    @IsTest static void changedConfigInvalidatesOnlyAffectedChecks() {
        CardstackConnectionTypes.SetupInput a=input('claude',0), b=input('chatgpt',0);
        CardstackConnectionSetupController.save(a); CardstackConnectionSetupController.save(b);
        CardstackConnectionTypes.DiagnosticOpen first=CardstackConnectionDiagnostics.open('claude');
        CardstackConnectionDiagnostics.echo(first.attemptKey,first.challenge,first.fixture);
        CardstackConnectionTypes.DiagnosticOpen second=CardstackConnectionDiagnostics.open('chatgpt');
        CardstackConnectionDiagnostics.echo(second.attemptKey,second.challenge,second.fixture);
        a.expectedRevision=1; a.publicClientId='changed';
        Test.startTest(); CardstackConnectionSetupController.save(a);
        Assert.areEqual('Stale',CardstackConnectionSetupController.check('claude').summary,'Affected diagnostic stale');
        Assert.areEqual('Diagnostic passed',CardstackConnectionSetupController.check('chatgpt').summary,'Other client evidence retained'); Test.stopTest();
    }
    @IsTest static void historyOnlySavePreservesRevisionDigestAndEvidence() {
        CardstackConnectionTypes.SetupInput v=input('claude',0); CardstackConnectionSetupController.save(v);
        CardstackConnectionTypes.DiagnosticOpen attempt=CardstackConnectionDiagnostics.open('claude');
        CardstackConnectionDiagnostics.echo(attempt.attemptKey,attempt.challenge,attempt.fixture);
        String digest=CardstackConnectionSetupRepository.readAdmin('claude').configurationDigest;
        v.expectedRevision=1; v.stepStates=new Map<String,Boolean>{'verify'=>true};
        Test.startTest(); CardstackConnectionTypes.SetupView result=CardstackConnectionSetupController.save(v);
        Assert.areEqual(1,result.revision,'Guide history is not semantic configuration');
        Assert.areEqual(digest,CardstackConnectionSetupRepository.readAdmin('claude').configurationDigest,'Digest retained');
        Assert.areEqual('Diagnostic passed',CardstackConnectionSetupController.check('claude').summary,'History cannot invalidate current evidence');
        Integer beforeDml=Limits.getDmlStatements(); CardstackConnectionSetupController.save(v);
        Assert.areEqual(beforeDml,Limits.getDmlStatements(),'Repeated history is no-op'); Test.stopTest();
    }
    @IsTest static void staleSavePreservesConfigurationAndHistory() {
        CardstackConnectionTypes.SetupInput v=input('claude',0); v.stepStates=new Map<String,Boolean>{'site'=>true};
        CardstackConnectionSetupController.save(v); v.publicClientId='lost'; v.stepStates.put('site',false);
        Test.startTest();
        try { CardstackConnectionSetupController.save(v); Assert.fail('Stale must fail'); }
        catch(CardstackConnectionTypes.ConnectionException e) { Assert.areEqual('STALE_SETUP',e.getMessage(),'Safe conflict'); }
        CardstackConnectionTypes.SetupView result=CardstackConnectionSetupController.load('claude'); Test.stopTest();
        Assert.areEqual('public-client',result.publicClientId,'No config overwrite'); Assert.areEqual(true,result.stepStates.get('site'),'No history overwrite');
    }
    @IsTest static void blankUiSiteRetainsSelection() {
        CardstackConnectionTypes.SetupInput v=input('claude',0); CardstackConnectionSetupController.save(v);
        v.siteId=null; v.expectedRevision=1; v.publicClientId='edited';
        Test.startTest(); CardstackConnectionSetupController.saveForUi(JSON.serialize(v)); Test.stopTest();
        Assert.isNotNull(CardstackConnectionSetupRepository.readAdmin('claude').siteId,'Saved internal selection retained');
    }
    @IsTest static void absentHistoryPreservesResume() {
        CardstackConnectionTypes.SetupInput v=input('claude',0); v.stepStates=new Map<String,Boolean>{'installation'=>true};
        CardstackConnectionSetupController.save(v); v.expectedRevision=1; v.stepStates=null; v.publicClientId='edited';
        Test.startTest(); CardstackConnectionTypes.SetupView result=CardstackConnectionSetupController.save(v); Test.stopTest();
        Assert.areEqual(true,result.stepStates.get('installation'),'Omitted history preserved');
    }
    @IsTest static void invalidHistoryDoesNotPersist() {
        CardstackConnectionTypes.SetupInput value=input('claude',0);
        value.stepStates=new Map<String,Boolean>{'installation'=>null};
        Test.startTest();
        try { CardstackConnectionSetupController.save(value); Assert.fail('Null history rejected'); }
        catch(CardstackConnectionTypes.ConnectionException e) { Assert.areEqual('INVALID_SETUP',e.getMessage(),'Safe input error'); }
        Assert.areEqual(0,Limits.getDmlStatements(),'No partial save');
        Assert.areEqual(0,CardstackConnectionSetupController.load('claude').revision,'No stored setup'); Test.stopTest();
    }
    @IsTest static void initialEnableWithoutSiteRejected() {
        CardstackConnectionTypes.SetupInput value=input('claude',0); value.siteId=null;
        Test.startTest();
        try { CardstackConnectionSetupController.saveForUi(JSON.serialize(value)); Assert.fail('Selection required'); }
        catch(AuraHandledException e) { Assert.areEqual('INVALID_SETUP',e.getMessage(),'Safe validation'); }
        Assert.areEqual(0,Limits.getDmlStatements(),'No partial save'); Test.stopTest();
    }
    private static void rejectsUi(String json) {
        CardstackConnectionAccess.adminOverride=true;
        Test.startTest();
        try { CardstackConnectionSetupController.saveForUi(json); Assert.fail('Rejected invalid UI input'); }
        catch(AuraHandledException e) { Assert.areEqual('INVALID_SETUP',e.getMessage(),'Only allowlisted error'); }
        Test.stopTest();
    }
    @IsTest static void malformedInputSanitized() { rejectsUi('{private raw'); }
    @IsTest static void privateFieldsRejected() { rejectsUi('{"client":"claude","actor":"private"}'); }
    @IsTest static void endpointInputRejected() { rejectsUi('{"client":"claude","resourceUrl":"https://evil.example"}'); }
    @IsTest static void historyUnknownKeysRejected() { rejectsUi('{"client":"claude","stepStates":{"admin":true}}'); }
    @IsTest static void historyNonBooleanRejected() { rejectsUi('{"client":"claude","stepStates":{"site":"true"}}'); }
    @IsTest static void oversizeInputRejected() { rejectsUi('x'.repeat(32769)); }
    @IsTest static void shortUiSiteRejected() { rejectsUi('{"client":"claude","siteId":"001000000000000"}'); }
    @IsTest static void ordinaryUserCannotUseAdapters() {
        User actor=CardstackConnectionTestFactory.namedUser(); CardstackConnectionTestFactory.assign(actor,'Cardstack_User');
        Test.startTest(); System.runAs(actor) {
            try { CardstackConnectionSetupController.loadForUi('claude'); Assert.fail('Admin required'); }
            catch(AuraHandledException e) { Assert.areEqual('NOT_AUTHORIZED',e.getMessage(),'Denied safe load'); }
            try { CardstackConnectionSetupController.checkForUi('claude'); Assert.fail('Admin required'); }
            catch(AuraHandledException e) { Assert.areEqual('NOT_AUTHORIZED',e.getMessage(),'Denied safe check'); }
            try { CardstackConnectionSetupController.saveForUi('{}'); Assert.fail('Admin required'); }
            catch(AuraHandledException e) { Assert.areEqual('NOT_AUTHORIZED',e.getMessage(),'Denied safe save'); }
            try { CardstackConnectionSetupController.observeForUi('private'); Assert.fail('Admin required'); }
            catch(AuraHandledException e) { Assert.areEqual('NOT_AUTHORIZED',e.getMessage(),'Denied safe observe'); }
            try { CardstackConnectionSetupController.exportSummary('claude'); Assert.fail('Admin required'); }
            catch(AuraHandledException e) { Assert.areEqual('NOT_AUTHORIZED',e.getMessage(),'Denied safe export'); }
        } Test.stopTest();
    }
    @IsTest static void exportUsesSafeAllowlist() {
        CardstackConnectionSetupController.save(input('claude',0));
        Test.startTest(); Map<String,Object> result=(Map<String,Object>)JSON.deserializeUntyped(CardstackConnectionSetupController.exportSummary('claude')); Test.stopTest();
        Assert.areEqual(new Set<String>{'status','versions','checks'},result.keySet(),'No callback, reference, URL or public ID');
        for(Object raw:(List<Object>)result.get('checks')) Assert.areEqual(new Set<String>{'stage','status','errorCode','checkedAt'},((Map<String,Object>)raw).keySet(),'Export stage allowlist');
    }
    @IsTest static void observationOmitsValuesAndReference() {
        CardstackConnectionSetupController.save(input('claude',0));
        CardstackConnectionTypes.DiagnosticOpen attempt=CardstackConnectionDiagnostics.open('claude');
        CardstackConnectionTypes.DiagnosticReceipt receipt=CardstackConnectionDiagnostics.echo(attempt.attemptKey,attempt.challenge,attempt.fixture);
        Test.startTest(); Map<String,Object> result=(Map<String,Object>)JSON.deserializeUntyped(CardstackConnectionSetupController.observeForUi(receipt.reference)); Test.stopTest();
        Assert.areEqual(new Set<String>{'client','versions','configurationRevision','checkedAt','expiresAt','exactValues','stages'},result.keySet(),'Minimum observation shape');
        Assert.areEqual('Client UI observed',CardstackConnectionSetupController.check('claude').summary,'Distinct observation');
    }
}
