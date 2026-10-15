/** Direct enrollment source contracts. Native compilation/execution is root-owned. */
@IsTest private with sharing class CardstackDirectSetupTest {
    private static CardstackConnectionTypes.SetupInput direct(Integer revision) {
        CardstackConnectionAccess.adminOverride = true;
        CardstackConnectionAccess.userOverride = true;
        CardstackConnectionTypes.SetupInput input = new CardstackConnectionTypes.SetupInput();
        input.client = 'chatgpt'; input.expectedRevision = revision;
        input.transportKind = 'direct-org-api/v1'; input.routeVersion = 'apex-probe/v1';
        input.publicClientId = 'public-existing-client'; input.callbacks = new List<String>{'https://client.example/callback'};
        input.enabledIntent = true; return input;
    }
    @IsTest static void directEnrollmentDerivesEndpointWithoutSite() {
        Test.startTest();
        CardstackConnectionTypes.SetupView view = CardstackConnectionSetup.save(direct(0));
        CardstackConnectionTypes.SetupSnapshot snapshot = CardstackConnectionSetup.snapshot('chatgpt');
        Test.stopTest();
        Assert.areEqual('direct-org-api/v1', view.transportKind, 'Explicit private mode');
        Assert.areEqual('apex-probe/v1', view.routeVersion, 'Fixed registered route');
        Assert.areEqual(URL.getOrgDomainUrl().toExternalForm() + '/services/apexrest/cardstack-mcp-probe/', view.resourceUrl, 'Derived endpoint');
        Assert.areEqual(URL.getOrgDomainUrl().toExternalForm(), view.issuer, 'Native issuer');
        Assert.isNull(view.metadataUrl, 'Direct route does not pretend to publish Site discovery');
        Assert.isNull(snapshot.siteId, 'No invented Site'); Assert.isTrue(snapshot.isCurrentOrg(), 'Current private org binding');
        Assert.isFalse(JSON.serialize(snapshot).contains(String.valueOf(UserInfo.getOrganizationId())), 'Private org is transient');
    }
    @IsTest static void directNoopPreservesDigestRevisionAndEvidence() {
        CardstackConnectionSetup.save(direct(0));
        CardstackConnectionTypes.DiagnosticOpen attempt = CardstackConnectionDiagnostics.open('chatgpt');
        CardstackConnectionDiagnostics.echo(attempt.attemptKey, attempt.challenge, attempt.fixture);
        String digest = CardstackConnectionSetup.snapshot('chatgpt').configurationDigest;
        CardstackConnectionTypes.SetupInput input = direct(1);
        input.stepStates = new Map<String,Boolean>{'site'=>true};
        Test.startTest();
        CardstackConnectionTypes.SetupView saved = CardstackConnectionSetupController.save(input);
        Assert.areEqual(1, saved.revision, 'History is not enrollment');
        Assert.areEqual(digest, CardstackConnectionSetup.snapshot('chatgpt').configurationDigest, 'Digest unchanged');
        Assert.areEqual('Diagnostic passed', CardstackConnectionSetupController.load('chatgpt').summary, 'Evidence unchanged');
        Integer writes = Limits.getDmlStatements(); CardstackConnectionSetup.save(input);
        Assert.areEqual(writes, Limits.getDmlStatements(), 'Identical save does not write'); Test.stopTest();
    }
    @IsTest static void blankUiInputRetainsSavedDirectTransport() {
        CardstackConnectionSetup.save(direct(0));
        String input = '{"client":"chatgpt","expectedRevision":1,"publicClientId":"edited","callbacks":["https://client.example/callback"],"siteId":"","sitePrefix":"","enabledIntent":true}';
        Test.startTest();
        Map<String,Object> output = (Map<String,Object>)JSON.deserializeUntyped(CardstackConnectionSetupController.saveForUi(input));
        Assert.areEqual('direct-org-api/v1', output.get('transportKind'), 'Blank Site cannot switch transport');
        Assert.areEqual('apex-probe/v1', output.get('routeVersion'), 'Route retained');
        Assert.isNull(CardstackConnectionSetup.snapshot('chatgpt').siteId, 'No previous Site resurrection');
        Assert.isFalse(output.containsKey('orgIdentity'), 'Private org omitted'); Test.stopTest();
    }
    @IsTest static void transportChangeAdvancesRevisionAndInvalidatesEvidence() {
        CardstackConnectionTypes.SetupInput site = direct(0); site.transportKind = null; site.routeVersion = null;
        site.siteId = (Id)CardstackConnectionTypes.normalizeId(Schema.Site.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED).getKeyPrefix() + '0'.repeat(12));
        site.sitePrefix = '/chat'; CardstackConnectionSetup.save(site);
        CardstackConnectionTypes.DiagnosticOpen attempt = CardstackConnectionDiagnostics.open('chatgpt');
        CardstackConnectionDiagnostics.echo(attempt.attemptKey, attempt.challenge, attempt.fixture);
        String oldDigest = CardstackConnectionSetup.snapshot('chatgpt').configurationDigest;
        Test.startTest(); CardstackConnectionTypes.SetupView saved = CardstackConnectionSetup.save(direct(1));
        Assert.areEqual(2, saved.revision, 'Transport changes semantics');
        Assert.areNotEqual(oldDigest, CardstackConnectionSetup.snapshot('chatgpt').configurationDigest, 'Old binding invalidated');
        Assert.areEqual('Stale', CardstackConnectionSetupController.load('chatgpt').summary, 'Old diagnostic becomes stale'); Test.stopTest();
    }
    @IsTest static void unchangedLegacySiteRowKeepsSerializedDigestAndActiveEvidence() {
        CardstackConnectionTypes.SetupInput input = direct(7); input.transportKind = 'site/v1'; input.routeVersion = null;
        input.siteId = (Id)CardstackConnectionTypes.normalizeId(Schema.Site.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED).getKeyPrefix() + '0'.repeat(12)); input.sitePrefix = '/chat';
        String issuer = URL.getOrgDomainUrl().toExternalForm();
        String serialized = '{"client":"chatgpt","publicClientId":"public-existing-client","callbacks":["https://client.example/callback"],"siteId":"'+String.valueOf(input.siteId)+'","sitePrefix":"/chat","enabledIntent":true,"resourceUrl":"'+issuer+'/chat/services/apexrest/cardstack/v1/chatgpt/mcp","metadataUrl":"'+issuer+'/chat/services/apexrest/cardstack/v1/chatgpt/metadata","issuer":"'+issuer+'","packageVersion":"0.1.0.8","transportVersion":"cardstack/v1","uiVersion":"mcp-apps/v1","permissionPolicyRevision":"1"}';
        String digest = 'legacy-observed-digest';
        Database.insert(new Cardstack_Connection_Setup__c(Client__c='chatgpt',Revision__c=7,Configuration__c=serialized,Configuration_Digest__c=digest),AccessLevel.SYSTEM_MODE);
        CardstackConnectionTypes.DiagnosticOpen attempt = CardstackConnectionDiagnostics.open('chatgpt');
        CardstackConnectionDiagnostics.echo(attempt.attemptKey,attempt.challenge,attempt.fixture);
        Test.startTest(); CardstackConnectionSetup.save(input);
        Assert.areEqual(0,Limits.getDmlStatements(),'Legacy semantic no-op has no writes');
        Cardstack_Connection_Setup__c saved = [SELECT Configuration__c,Configuration_Digest__c,Revision__c FROM Cardstack_Connection_Setup__c WHERE Client__c='chatgpt' WITH SYSTEM_MODE LIMIT 1];
        Assert.areEqual(serialized,saved.Configuration__c,'Exact retained serialized Site shape');
        Assert.areEqual(digest,saved.Configuration_Digest__c,'Legacy observed digest retained');
        Assert.areEqual(7,saved.Revision__c,'Revision retained');
        Assert.areEqual('Diagnostic passed',CardstackConnectionSetupController.load('chatgpt').summary,'Active evidence remains bound');
        Test.stopTest();
    }
    private static void rejects(CardstackConnectionTypes.SetupInput input) {
        Test.startTest();
        try { CardstackConnectionSetup.save(input); Assert.fail('Invalid enrollment rejected'); }
        catch(CardstackConnectionTypes.ConnectionException e) { Assert.areEqual('INVALID_SETUP', e.getMessage(), 'Safe error'); }
        Assert.areEqual(0, Limits.getDmlStatements(), 'No partial setup'); Test.stopTest();
    }
    @IsTest static void directClaudeRejected() { CardstackConnectionTypes.SetupInput input = direct(0); input.client = 'claude'; rejects(input); }
    @IsTest static void directSiteIdRejected() { CardstackConnectionTypes.SetupInput input = direct(0); input.siteId = (Id)CardstackConnectionTypes.normalizeId(Schema.Site.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED).getKeyPrefix() + '0'.repeat(12)); rejects(input); }
    @IsTest static void directPrefixRejected() { CardstackConnectionTypes.SetupInput input = direct(0); input.sitePrefix = '/chat'; rejects(input); }
    @IsTest static void unknownTransportRejected() { CardstackConnectionTypes.SetupInput input = direct(0); input.transportKind = 'unknown'; rejects(input); }
    @IsTest static void wrongRouteVersionRejected() { CardstackConnectionTypes.SetupInput input = direct(0); input.routeVersion = 'v2'; rejects(input); }
    @IsTest static void directEnabledNeedsPublicClient() { CardstackConnectionTypes.SetupInput input = direct(0); input.publicClientId = ''; rejects(input); }
    @IsTest static void directEnabledNeedsCallbacks() { CardstackConnectionTypes.SetupInput input = direct(0); input.callbacks.clear(); rejects(input); }
    @IsTest static void directManageDeniedBeforeQueries() {
        CardstackConnectionTypes.SetupInput input = direct(0); CardstackConnectionAccess.adminOverride = false;
        Test.startTest();
        try { CardstackConnectionSetup.save(input); Assert.fail('Manage required'); }
        catch(CardstackConnectionTypes.ConnectionException e) { Assert.areEqual('NOT_AUTHORIZED', e.getMessage(), 'Safe denial'); }
        Assert.areEqual(0, Limits.getQueries(), 'Denied before private query'); Assert.areEqual(0, Limits.getDmlStatements(), 'Denied before write'); Test.stopTest();
    }
    @IsTest static void directOptimisticRevisionRequired() {
        CardstackConnectionSetup.save(direct(0)); Test.startTest();
        try { CardstackConnectionSetup.save(direct(0)); Assert.fail('Stale enrollment rejected'); }
        catch(CardstackConnectionTypes.ConnectionException e) { Assert.areEqual('STALE_SETUP', e.getMessage(), 'Safe conflict'); }
        Assert.areEqual(0, Limits.getDmlStatements(), 'No overwrite'); Test.stopTest();
    }
}
