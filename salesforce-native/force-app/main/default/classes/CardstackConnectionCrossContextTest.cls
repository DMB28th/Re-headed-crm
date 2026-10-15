/** Real permission/repository integration; only supported platform context is simulated. */
@IsTest private with sharing class CardstackConnectionCrossContextTest {
    private static final String ORIGIN = 'https://context.example';
    private static final String ISSUER = 'https://context.my.salesforce.com';
    private static final String PREFIX = '/cardstack';
    private static final String ROUTE = '/services/apexrest/cardstack/v1/';

    private class Actors {
        User admin;
        User ordinary;
        Actors() {
            admin = CardstackConnectionTestFactory.namedUser();
            ordinary = CardstackConnectionTestFactory.namedUser();
            CardstackConnectionTestFactory.assign(admin, 'Cardstack_Admin');
            CardstackConnectionTestFactory.assign(ordinary, 'Cardstack_User');
        }
    }
    private static Id site(Integer suffix) {
        String key = Schema.Site.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED).getKeyPrefix();
        return (Id)CardstackConnectionTypes.normalizeId(key + '0'.repeat(11) + String.valueOf(suffix));
    }
    private static void platform(Id siteId, String prefix, String origin, String issuer) {
        CardstackConnectionContext.platformOverrideEnabled = true;
        CardstackConnectionContext.siteIdOverride = siteId == null ? null : CardstackConnectionTypes.normalizeId(String.valueOf(siteId));
        CardstackConnectionContext.pathPrefixOverride = prefix;
        CardstackConnectionContext.baseRequestUrlOverride = origin == null ? null : origin + prefix;
        CardstackConnectionContext.orgIssuerOverride = issuer;
        // Same supported Site getter equivalent at ingress; no descriptor/snapshot injection.
        CardstackMcpIngress.siteOverride = siteId;
        Assert.isNull(CardstackMcpIngress.contextOverride, 'Real context resolution');
        Assert.isNull(CardstackMcpIngress.snapshotOverride, 'Real repository snapshot');
        Assert.isNull(CardstackMcpIngress.namedOverride, 'Actual named actor');
        Assert.isNull(CardstackConnectionAccess.adminOverride, 'Actual admin permission');
        Assert.isNull(CardstackConnectionAccess.userOverride, 'Actual use permission');
    }
    private static void outside() { platform(null, '', null, ISSUER); }
    private static void matching() { platform(site(1), PREFIX, ORIGIN, ISSUER); }
    private static CardstackConnectionTypes.SetupInput input(String client, Integer revision) {
        CardstackConnectionTypes.SetupInput value = new CardstackConnectionTypes.SetupInput();
        value.client = client;
        value.publicClientId = 'public-cross-context';
        value.callbacks = new List<String>{'https://client.example/callback'};
        value.siteId = site(1);
        value.sitePrefix = PREFIX;
        value.enabledIntent = true;
        value.expectedRevision = revision;
        return value;
    }
    private static void save(User admin, CardstackConnectionTypes.SetupInput value) {
        System.runAs(admin) {
            Assert.isTrue(FeatureManagement.checkPermission('Cardstack_Manage_Connections'), 'Admin assignment prerequisite');
            Assert.isTrue(FeatureManagement.checkPermission('Cardstack_Use_Connections'), 'Admin use prerequisite');
            CardstackConnectionSetup.save(value);
        }
    }
    private static Cardstack_Connection_Setup__c stored(String client) {
        // Test-only inspection of private evidence; no production access grant.
        return [SELECT Id, Revision__c, Configuration__c, Configuration_Digest__c
            FROM Cardstack_Connection_Setup__c WHERE Client__c = :client WITH SYSTEM_MODE LIMIT 1];
    }
    private static Map<String,Object> config(Cardstack_Connection_Setup__c row) {
        return (Map<String,Object>)JSON.deserializeUntyped(row.Configuration__c);
    }
    private static void ordinaryPermission() {
        Assert.isTrue(FeatureManagement.checkPermission('Cardstack_Use_Connections'), 'Ordinary use assignment prerequisite');
        Assert.isFalse(FeatureManagement.checkPermission('Cardstack_Manage_Connections'), 'Ordinary user has no admin grant');
    }
    private static Map<String,Object> call(String client, String method, Map<String,Object> params) {
        RestContext.request = new RestRequest();
        RestContext.response = new RestResponse();
        RestContext.request.httpMethod = 'POST';
        RestContext.request.requestURI = ROUTE + client + '/mcp';
        RestContext.request.requestBody = Blob.valueOf(JSON.serialize(new Map<String,Object>{
            'jsonrpc'=>'2.0', 'id'=>1, 'method'=>method, 'params'=>params}));
        CardstackMcpIngress.post();
        return (Map<String,Object>)JSON.deserializeUntyped(RestContext.response.responseBody.toString());
    }
    private static void denied(String client, Integer status, String code) {
        Map<String,Object> response = call(client, 'ping', new Map<String,Object>());
        Assert.areEqual(status, RestContext.response.statusCode, 'Exact fail-closed HTTP status');
        Assert.areEqual(code, response.get('error'), 'Sanitized boundary denial');
    }
    private static Map<String,Object> fixture() {
        return new Map<String,Object>{'text'=>'café ✓ "quoted"', 'amount'=>0, 'accepted'=>false,
            'choice'=>'beta', 'rating'=>'hot', 'notes'=>'first\nsecond', 'enabled'=>false};
    }
    private static void exchange(String client) {
        ordinaryPermission();
        Map<String,Object> ping = call(client, 'ping', new Map<String,Object>());
        Assert.areEqual(200, RestContext.response.statusCode, 'Named ping through real saved configuration');
        Assert.areEqual(new Map<String,Object>(), ping.get('result'), 'Successful ping envelope');
        Map<String,Object> opened = call(client, 'tools/call', new Map<String,Object>{
            'name'=>'cardstack_connection_diagnostic', 'arguments'=>new Map<String,Object>()});
        Assert.areEqual(200, RestContext.response.statusCode, 'Named open HTTP status');
        Map<String,Object> result = (Map<String,Object>)opened.get('result');
        Assert.isNotNull(result, 'Diagnostic result exists');
        Assert.isFalse(result.get('isError') == true, 'Diagnostic open succeeds');
        Map<String,Object> meta = (Map<String,Object>)result.get('_meta');
        Assert.isNotNull(meta, 'Private UI protocol envelope exists');
        Map<String,Object> attempt = (Map<String,Object>)meta.get('cardstack/connectionDiagnostic');
        Map<String,Object> echoed = call(client, 'tools/call', new Map<String,Object>{
            'name'=>'cardstack_connection_echo', 'arguments'=>new Map<String,Object>{
                'attemptKey'=>attempt.get('attemptKey'), 'challenge'=>attempt.get('challenge'), 'values'=>fixture()}});
        Assert.areEqual(200, RestContext.response.statusCode, 'Named echo HTTP status');
        Map<String,Object> echoResult = (Map<String,Object>)echoed.get('result');
        Assert.isFalse(echoResult.get('isError') == true, 'Exact echo succeeds');
        Map<String,Object> receipt = (Map<String,Object>)echoResult.get('structuredContent');
        Assert.areEqual(true, receipt.get('exactValues'), 'Real repository-bound exchange accepted');
        Assert.isTrue(client.equals((String)receipt.get('client')), 'Exact canonical client retained');
        Map<String,Object> values = (Map<String,Object>)receipt.get('values');
        Assert.areEqual(fixture().keySet(), values.keySet(), 'Exactly seven fixture keys');
        for(String key : new List<String>{'text','choice','rating','notes'}) {
            Assert.isTrue(values.get(key) instanceof String, 'String fixture type');
            Assert.isTrue(((String)fixture().get(key)).equals((String)values.get(key)), 'Case-sensitive fixed fixture');
        }
        Assert.isTrue(values.get('amount') instanceof Decimal || values.get('amount') instanceof Integer, 'JSON numeric zero type');
        Assert.areEqual(Decimal.valueOf('0'), Decimal.valueOf(String.valueOf(values.get('amount'))), 'Numeric zero retained');
        Assert.areEqual(false, values.get('accepted'), 'False accepted value retained');
        Assert.areEqual(false, values.get('enabled'), 'False enabled value retained');
    }
    private static void outsideExchange(String client) {
        Actors actors = new Actors();
        outside();
        save(actors.admin, input(client, 0));
        matching();
        Test.startTest();
        System.runAs(actors.ordinary) { exchange(client); }
        Test.stopTest();
    }
    @IsTest static void outsideSaveResolvesMatchingSite() {
        Actors actors = new Actors();
        outside();
        save(actors.admin, input('claude', 0));
        Map<String,Object> persisted = config(stored('claude'));
        Assert.isNull(persisted.get('resourceUrl'), 'Studio has no observed resource baseline');
        Assert.isNull(persisted.get('metadataUrl'), 'Studio has no observed metadata baseline');
        matching();
        Test.startTest();
        System.runAs(actors.ordinary) {
            ordinaryPermission();
            CardstackConnectionTypes.SetupView view = CardstackConnectionSetup.snapshot('claude').setupView;
            Assert.areEqual('Needs verification', view.summary, 'Visibility alone is not configuration drift');
            Assert.areEqual(ORIGIN + PREFIX + ROUTE + 'claude/mcp', view.resourceUrl, 'Derived resource with exactly one prefix');
            Assert.areEqual(ORIGIN + PREFIX + ROUTE + 'claude/metadata', view.metadataUrl, 'Derived metadata with exactly one prefix');
            Assert.areEqual('Unknown', view.checks[1].status, 'OAuth policy remains unverified');
            outside();
            view = CardstackConnectionSetup.snapshot('claude').setupView;
            Assert.areEqual('Needs verification', view.summary, 'Return to Studio is not drift');
            Assert.isNull(view.resourceUrl, 'Unavailable resource remains unavailable');
            Assert.isNull(view.metadataUrl, 'Unavailable metadata remains unavailable');
            Assert.areEqual('Unknown', view.checks[0].status, 'No fabricated Site evidence');
        }
        Test.stopTest();
    }
    @IsTest static void studioSaveAllowsClaudeExchange() { outsideExchange('claude'); }
    @IsTest static void studioSaveAllowsChatgptExchange() { outsideExchange('chatgpt'); }

    @IsTest static void identicalSaveAcrossVisibilityIsNoop() {
        Actors actors = new Actors();
        outside();
        save(actors.admin, input('claude', 0));
        Cardstack_Connection_Setup__c beforeRow = stored('claude');
        matching();
        Test.startTest();
        save(actors.admin, input('claude', 1));
        Test.stopTest();
        Cardstack_Connection_Setup__c afterRow = stored('claude');
        Assert.areEqual(1, afterRow.Revision__c, 'Visibility-only save preserves revision');
        Assert.isTrue(beforeRow.Configuration_Digest__c.equals(afterRow.Configuration_Digest__c), 'Visibility-only save preserves binding digest');
        Assert.isTrue(beforeRow.Configuration__c.equals(afterRow.Configuration__c), 'No-op preserves originally unknown evidence');
    }
    @IsTest static void knownBaselineSurvivesOutsideNoop() {
        Actors actors = new Actors();
        matching();
        save(actors.admin, input('claude', 0));
        Cardstack_Connection_Setup__c beforeRow = stored('claude');
        outside();
        Test.startTest();
        save(actors.admin, input('claude', 1));
        Test.stopTest();
        Cardstack_Connection_Setup__c afterRow = stored('claude');
        Assert.areEqual(1, afterRow.Revision__c, 'Outside no-op preserves known revision');
        Assert.isTrue(beforeRow.Configuration_Digest__c.equals(afterRow.Configuration_Digest__c), 'Known binding digest retained');
        Assert.isTrue(beforeRow.Configuration__c.equals(afterRow.Configuration__c), 'Known endpoint evidence retained byte-for-byte');
        platform(site(1), PREFIX, 'https://changed.example', ISSUER);
        System.runAs(actors.ordinary) { denied('claude', 503, 'connection_setup_unavailable'); }
    }
    @IsTest static void outsideSemanticEditRetainsApplicableBaseline() {
        Actors actors = new Actors();
        matching();
        save(actors.admin, input('claude', 0));
        Cardstack_Connection_Setup__c beforeRow = stored('claude');
        outside();
        CardstackConnectionTypes.SetupInput changed = input('claude', 1);
        changed.publicClientId = 'changed-public-client';
        Test.startTest();
        save(actors.admin, changed);
        Cardstack_Connection_Setup__c afterRow = stored('claude');
        Assert.areEqual(2, afterRow.Revision__c, 'Real semantic edit advances revision');
        Assert.isFalse(beforeRow.Configuration_Digest__c.equals(afterRow.Configuration_Digest__c), 'Real edit writes a new digest');
        Assert.areEqual(ORIGIN + PREFIX + ROUTE + 'claude/mcp', config(afterRow).get('resourceUrl'), 'Unavailable current context preserves applicable known resource evidence');
        Assert.areEqual(ORIGIN + PREFIX + ROUTE + 'claude/metadata', config(afterRow).get('metadataUrl'), 'Unavailable current context preserves applicable known metadata evidence');
        platform(site(1), PREFIX, 'https://changed.example', ISSUER);
        System.runAs(actors.ordinary) { denied('claude', 503, 'connection_setup_unavailable'); }
        Test.stopTest();
    }
    @IsTest static void knownHostnameChangeBlocksIngress() {
        Actors actors = new Actors();
        matching();
        save(actors.admin, input('claude', 0));
        platform(site(1), PREFIX, 'https://changed.example', ISSUER);
        Test.startTest();
        System.runAs(actors.ordinary) {
            Assert.areEqual('Stale', CardstackConnectionSetup.snapshot('claude').setupView.summary, 'Known hostname drift stays stale');
            denied('claude', 503, 'connection_setup_unavailable');
        }
        Test.stopTest();
    }
    @IsTest static void unknownBaselineDoesNotClaimDomainChangeProof() {
        Actors actors = new Actors();
        outside();
        save(actors.admin, input('claude', 0));
        platform(site(1), PREFIX, 'https://later.example', ISSUER);
        Test.startTest();
        System.runAs(actors.ordinary) {
            CardstackConnectionTypes.SetupView view = CardstackConnectionSetup.snapshot('claude').setupView;
            Assert.areEqual('Needs verification', view.summary, 'An unknown baseline cannot identify historical domain drift');
            Assert.areEqual('Unknown', view.checks[1].status, 'Policy remains unverified despite current context');
        }
        Test.stopTest();
        Assert.isNull(config(stored('claude')).get('resourceUrl'), 'Read does not manufacture a stored domain baseline');
    }
    @IsTest static void issuerDriftWithoutEndpointsIsStale() {
        Actors actors = new Actors();
        outside();
        save(actors.admin, input('claude', 0));
        platform(null, '', null, 'https://changed.my.salesforce.com');
        Test.startTest();
        System.runAs(actors.ordinary) {
            CardstackConnectionTypes.SetupView view = CardstackConnectionSetup.snapshot('claude').setupView;
            Assert.isNull(view.resourceUrl, 'Endpoints remain unreadable');
            Assert.areEqual('Stale', view.summary, 'Issuer drift is independent of endpoint visibility');
            try {
                CardstackConnectionDiagnostics.open('claude');
                Assert.fail('Stale issuer cannot authorize diagnostic open');
            } catch(CardstackConnectionTypes.ConnectionException e) {
                Assert.areEqual('DIAGNOSTIC_REJECTED', e.getMessage(), 'Sanitized stale-issuer rejection');
            }
        }
        Test.stopTest();
    }
    private static void changedSelection(Boolean changeSite) {
        Actors actors = new Actors();
        matching();
        save(actors.admin, input('claude', 0));
        outside();
        CardstackConnectionTypes.SetupInput changed = input('claude', 1);
        if(changeSite) { changed.siteId = site(2); } else { changed.sitePrefix = '/other'; }
        Test.startTest();
        save(actors.admin, changed);
        Test.stopTest();
        Cardstack_Connection_Setup__c row = stored('claude');
        Assert.areEqual(2, row.Revision__c, 'A changed selection increments revision');
        Assert.isNull(config(row).get('resourceUrl'), 'Prior Site endpoint evidence is not inherited');
        Assert.isNull(config(row).get('metadataUrl'), 'Prior metadata evidence is not inherited');
        System.runAs(actors.ordinary) {
            matching();
            denied('claude', 503, 'connection_setup_unavailable');
        }
    }
    @IsTest static void changedSelectedSiteDropsOldEvidence() { changedSelection(true); }
    @IsTest static void changedSelectedPrefixDropsOldEvidence() { changedSelection(false); }

    private static void legacySave(Boolean changed) {
        Actors actors = new Actors();
        matching();
        save(actors.admin, input('claude', 0));
        Cardstack_Connection_Setup__c legacy = stored('claude');
        // Reproduce a legacy digest over full stored configuration, including endpoints.
        legacy.Configuration_Digest__c = EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256', Blob.valueOf(legacy.Configuration__c)));
        System.runAs(actors.admin) { Database.update(legacy, AccessLevel.SYSTEM_MODE); }
        CardstackConnectionTypes.DiagnosticOpen active;
        if(!changed) {
            System.runAs(actors.ordinary) { active = CardstackConnectionDiagnostics.open('claude'); }
        }
        outside();
        CardstackConnectionTypes.SetupInput next = input('claude', 1);
        if(changed) { next.publicClientId = 'changed-public-client'; }
        Test.startTest();
        save(actors.admin, next);
        Test.stopTest();
        Cardstack_Connection_Setup__c afterRow = stored('claude');
        Assert.areEqual(changed ? 2 : 1, afterRow.Revision__c, 'Legacy revision changes only for semantic edits');
        if(changed) {
            Assert.isFalse(legacy.Configuration_Digest__c.equals(afterRow.Configuration_Digest__c), 'Semantic edit writes a new digest');
            Assert.areEqual('changed-public-client', config(afterRow).get('publicClientId'), 'Semantic edit persisted');
        } else {
            Assert.isTrue(legacy.Configuration_Digest__c.equals(afterRow.Configuration_Digest__c), 'No-op retains original legacy binding digest');
            Assert.isTrue(legacy.Configuration__c.equals(afterRow.Configuration__c), 'No-op retains legacy observed evidence');
            matching();
            System.runAs(actors.ordinary) {
                Assert.isTrue(CardstackConnectionDiagnostics.echo(active.attemptKey, active.challenge, fixture()).exactValues,
                    'Migration-only no-op preserves an active diagnostic binding');
            }
        }
    }
    @IsTest static void legacyDigestNoopRetainsBinding() { legacySave(false); }
    @IsTest static void legacyDigestSemanticEditAdvancesRevision() { legacySave(true); }

    private static void boundary(String mismatch) {
        Actors actors = new Actors();
        User deniedActor;
        if(mismatch.equals('permission')) { deniedActor = CardstackConnectionTestFactory.namedUser(); }
        matching();
        CardstackConnectionTypes.SetupInput value = input('claude', 0);
        if(mismatch.equals('disabled')) { value.enabledIntent = false; }
        save(actors.admin, value);
        if(mismatch.equals('site')) { platform(site(2), PREFIX, ORIGIN, ISSUER); }
        if(mismatch.equals('prefix')) { platform(site(1), '/other', ORIGIN, ISSUER); }
        Test.startTest();
        System.runAs(deniedActor == null ? actors.ordinary : deniedActor) {
            if(mismatch.equals('permission')) {
                Assert.isFalse(FeatureManagement.checkPermission('Cardstack_Use_Connections'), 'Unassigned actor has no Use grant');
                denied('claude', 403, 'cardstack_use_required');
            } else if(mismatch.equals('disabled')) {
                denied('claude', 403, 'connection_disabled');
            } else {
                denied(mismatch.equals('client') ? 'chatgpt' : 'claude', 503, 'connection_setup_unavailable');
            }
        }
        Test.stopTest();
    }
    @IsTest static void wrongSiteFailsClosed() { boundary('site'); }
    @IsTest static void wrongPrefixFailsClosed() { boundary('prefix'); }
    @IsTest static void wrongClientFailsClosed() { boundary('client'); }
    @IsTest static void missingPermissionFailsClosed() { boundary('permission'); }
    @IsTest static void disabledSetupFailsClosed() { boundary('disabled'); }
}
