/** REST boundary source tests; injected Site/guest context is not platform auth proof. */
@IsTest private with sharing class CardstackMcpIngressTest {
    private static final String ROOT = '/services/apexrest/cardstack/v1/';
    private static final String BASE = 'https://unit.example/cardstack';
    private static void context(String client) {
        CardstackConnectionTypes.ContextView view = new CardstackConnectionTypes.ContextView();
        view.sitePrefix = '/cardstack'; view.issuer = 'https://unit.my.salesforce.com';
        view.resourceUrl = BASE + ROOT + client + '/mcp';
        view.metadataUrl = BASE + ROOT + client + '/metadata';
        CardstackMcpIngress.contextOverride = view;
        CardstackMcpIngress.namedOverride = true;
        CardstackConnectionAccess.userOverride = true;
        CardstackMcpIngress.siteOverride = (Id)CardstackConnectionTypes.normalizeId(
            Schema.Site.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED).getKeyPrefix() + '0'.repeat(12));
        CardstackConnectionTypes.SetupSnapshot snapshot = new CardstackConnectionTypes.SetupSnapshot();
        snapshot.siteId = CardstackMcpIngress.siteOverride; snapshot.sitePrefix = '/cardstack';
        snapshot.setupView = new CardstackConnectionTypes.SetupView();
        snapshot.setupView.client = client; snapshot.setupView.enabledIntent = true;
        snapshot.setupView.resourceUrl = view.resourceUrl; snapshot.setupView.metadataUrl = view.metadataUrl;
        snapshot.setupView.issuer = view.issuer;
        CardstackMcpIngress.snapshotOverride = snapshot;
    }
    private static void request(String verb, String uri, String body) {
        RestContext.request = new RestRequest(); RestContext.response = new RestResponse();
        RestContext.request.httpMethod = verb; RestContext.request.requestURI = uri;
        if(body != null) RestContext.request.requestBody = Blob.valueOf(body);
        if(verb.equals('GET')) CardstackMcpIngress.get(); else CardstackMcpIngress.post();
    }
    private static Map<String,Object> body() {
        return (Map<String,Object>)JSON.deserializeUntyped(RestContext.response.responseBody.toString());
    }
    private static void httpError(Integer status, String error) {
        Assert.areEqual(status, RestContext.response.statusCode, 'Exact HTTP status');
        Assert.areEqual(new Map<String,Object>{'error'=>error}, body(), 'Sanitized error only');
    }
    @IsTest static void guestCannotExecuteOrReadResources() {
        context('claude'); CardstackMcpIngress.namedOverride = false;
        Test.startTest();
        request('GET', ROOT+'claude/metadata', null);
        Assert.areEqual(200, RestContext.response.statusCode, 'Discovery remains public');
        request('GET', ROOT+'claude/mcp', null); httpError(401, 'authentication_required');
        Assert.areEqual('Bearer resource_metadata="'+BASE+ROOT+'claude/metadata", scope="api refresh_token"',
            RestContext.response.headers.get('WWW-Authenticate'), 'Exact sibling pointer');
        for(String method : new List<String>{'resources/read','tools/call'}) {
            request('POST', ROOT+'claude/mcp', '{"jsonrpc":"2.0","id":1,"method":"'+method+'"}');
            httpError(401, 'authentication_required');
        }
        Assert.areEqual(0, Limits.getQueries(), 'Guest never reads private setup or resources');
        Assert.areEqual(0, Limits.getDmlStatements(), 'No CRM or diagnostic writes');
        Assert.areEqual(0, Limits.getCallouts(), 'No callouts'); Test.stopTest();
    }
    @IsTest static void metadataResourceExact() {
        context('chatgpt'); CardstackMcpIngress.namedOverride = false;
        Test.startTest(); request('GET', '/cardstack'+ROOT+'chatgpt/metadata', null);
        Assert.areEqual(new Map<String,Object>{'resource'=>BASE+ROOT+'chatgpt/mcp',
            'authorization_servers'=>new List<Object>{'https://unit.my.salesforce.com'},
            'scopes_supported'=>new List<Object>{'api','refresh_token'},
            'bearer_methods_supported'=>new List<Object>{'header'}}, body(), 'Public descriptor exactly once');
        Assert.areEqual(0, Limits.getQueries(), 'No private queries'); Test.stopTest();
    }
    @IsTest static void callerHeadersCannotChangeDescriptor() {
        context('claude'); RestContext.request = new RestRequest(); RestContext.response = new RestResponse();
        RestContext.request.requestURI = ROOT+'claude/metadata';
        RestContext.request.addHeader('Forwarded', 'host=hostile.example');
        RestContext.request.addHeader('X-Forwarded-Host', 'hostile.example');
        Test.startTest(); CardstackMcpIngress.get(); Test.stopTest();
        Assert.areEqual(BASE+ROOT+'claude/mcp', body().get('resource'), 'Only supported context supplies host');
    }
    @IsTest static void namedWithoutPermission403() {
        context('claude'); CardstackConnectionAccess.userOverride = null;
        User actor = CardstackConnectionTestFactory.namedUser();
        Test.startTest(); System.runAs(actor) {
            request('POST', ROOT+'claude/mcp', 'malformed'); httpError(403, 'cardstack_use_required');
            Assert.areEqual(0, Limits.getQueries(), 'Permission precedes private setup');
        } Test.stopTest();
    }
    @IsTest static void revokedPermissionDeniedOnNextCall() {
        context('claude'); CardstackConnectionAccess.userOverride = null;
        User actor = CardstackConnectionTestFactory.namedUser();
        CardstackConnectionTestFactory.assign(actor, 'Cardstack_User');
        Test.startTest(); System.runAs(actor) {
            request('GET', ROOT+'claude/mcp', null);
            Assert.areEqual(405, RestContext.response.statusCode, 'Authorized named GET');
        }
        List<PermissionSetAssignment> grants = [
            SELECT Id FROM PermissionSetAssignment
            WHERE AssigneeId = :actor.Id AND PermissionSet.Name = 'Cardstack_User'
                AND PermissionSet.IsOwnedByProfile = false
        ];
        Assert.areEqual(1, grants.size(), 'Exactly the explicit Cardstack User grant is removed');
        delete grants;
        Assert.areEqual(0, [SELECT count() FROM PermissionSetAssignment WHERE Id IN :grants], 'Explicit grant deleted');
        System.runAs(actor) {
            request('POST', ROOT+'claude/mcp', '{"jsonrpc":"2.0","id":1,"method":"ping"}');
            httpError(403, 'cardstack_use_required');
        } Test.stopTest();
    }
    @IsTest static void canonicalInternalRoutesAreExact() {
        context('claude'); Test.startTest();
        for(String base : new List<String>{ROOT, '/cardstack/v1/', '/cardstack'+ROOT, '/cardstack/cardstack/v1/'}) {
            request('GET', base+'claude/mcp', null); httpError(405, 'method_not_allowed');
        } Test.stopTest();
    }
    @IsTest static void invalidRoute404() {
        context('claude'); Test.startTest();
        for(String uri : new List<String>{ROOT+'CLAUDE/mcp',ROOT+'claude/MCP',ROOT+'other/mcp',ROOT+'claude/mcp/',
            ROOT+'claude/mcp/extra','/nested'+ROOT+'claude/mcp',ROOT+'claude%2Fmcp',ROOT+'%63laude/mcp',
            ROOT+'claude/mcp?x=1',ROOT+'claude//mcp',ROOT+'claude/../mcp',ROOT+'claude%5cmcp'}) {
            request('GET', uri, null); httpError(404, 'unknown_probe_route');
        } Test.stopTest();
    }
    @IsTest static void queryParametersRejected() {
        context('claude'); RestContext.request = new RestRequest(); RestContext.response = new RestResponse();
        RestContext.request.requestURI = ROOT+'claude/mcp'; RestContext.request.addParameter('x','1');
        Test.startTest(); CardstackMcpIngress.get(); Test.stopTest(); httpError(404, 'unknown_probe_route');
    }
    @IsTest static void missingPublicContextFailsClosed() {
        context('claude'); CardstackMcpIngress.contextOverride.resourceUrl = null;
        Test.startTest(); request('GET', ROOT+'claude/metadata', null); Test.stopTest();
        httpError(503, 'public_context_unavailable');
    }
    @IsTest static void disabledIntentFailsBeforeParsing() {
        context('claude'); CardstackMcpIngress.snapshotOverride.setupView.enabledIntent = false;
        Test.startTest(); request('POST', ROOT+'claude/mcp', 'malformed'); Test.stopTest(); httpError(403, 'connection_disabled');
    }
    @IsTest static void missingSiteFailsClosed() {
        context('claude'); CardstackMcpIngress.snapshotOverride.siteId = null;
        Test.startTest(); request('GET', ROOT+'claude/mcp', null); Test.stopTest(); httpError(503, 'connection_setup_unavailable');
    }
    @IsTest static void mismatchedSiteFailsClosed() {
        context('claude');
        String otherSite = CardstackConnectionTypes.normalizeId(
            Schema.Site.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED).getKeyPrefix() + '0'.repeat(11) + '1');
        Assert.areEqual(18, otherSite.length(), 'Synthetic Site ID normalized to checksum18 at ingestion');
        Assert.isFalse(otherSite.equals(CardstackConnectionTypes.normalizeId(String.valueOf(CardstackMcpIngress.siteOverride))), 'Full Site IDs differ');
        CardstackMcpIngress.snapshotOverride.siteId = (Id)otherSite;
        Test.startTest(); request('GET', ROOT+'claude/mcp', null); Test.stopTest(); httpError(503, 'connection_setup_unavailable');
    }
    @IsTest static void mismatchedPrefixFailsClosed() {
        context('claude'); CardstackMcpIngress.snapshotOverride.sitePrefix = '/other';
        Test.startTest(); request('GET', ROOT+'claude/mcp', null); Test.stopTest(); httpError(503, 'connection_setup_unavailable');
    }
    @IsTest static void mismatchedClientFailsClosed() {
        context('claude'); CardstackMcpIngress.snapshotOverride.setupView.client = 'chatgpt';
        Test.startTest(); request('GET', ROOT+'claude/mcp', null); Test.stopTest(); httpError(503, 'connection_setup_unavailable');
    }
    @IsTest static void mismatchedResourceFailsClosed() {
        context('claude'); CardstackMcpIngress.snapshotOverride.setupView.resourceUrl = 'https://other.example/mcp';
        Test.startTest(); request('GET', ROOT+'claude/mcp', null); Test.stopTest(); httpError(503, 'connection_setup_unavailable');
    }
    @IsTest static void staleSetupFailsClosed() {
        context('claude'); CardstackMcpIngress.snapshotOverride.setupView.summary = 'Stale';
        Test.startTest(); request('GET', ROOT+'claude/mcp', null); Test.stopTest(); httpError(503, 'connection_setup_unavailable');
    }
    @IsTest static void malformedJson32700() {
        context('claude'); Test.startTest(); request('POST', ROOT+'claude/mcp', '{'); Test.stopTest(); rpcError(-32700);
    }
    @IsTest static void batchRejected() {
        context('claude'); Test.startTest(); request('POST', ROOT+'claude/mcp', '[]'); Test.stopTest(); rpcError(-32600);
    }
    @IsTest static void bodyLimitCountsBytes() {
        context('claude'); String value = '{"jsonrpc":"2.0","id":1,"method":"ping","padding":"'+'é'.repeat(8200)+'"}';
        Assert.isTrue(value.length() < 16384, 'Character count below limit');
        Test.startTest(); request('POST', ROOT+'claude/mcp', value); Test.stopTest(); rpcError(-32600);
    }
    @IsTest static void exactBodyLimitAccepted() {
        context('claude'); String value = '{"jsonrpc":"2.0","id":1,"method":"ping"}';
        value += ' '.repeat(16384-Blob.valueOf(value).size());
        Test.startTest(); request('POST', ROOT+'claude/mcp', value); Test.stopTest();
        Assert.areEqual(new Map<String,Object>(), body().get('result'), 'Exactly 16KiB accepted');
    }
    @IsTest static void notification202() {
        context('claude'); Test.startTest(); request('POST', ROOT+'claude/mcp', '{"jsonrpc":"2.0","method":"notifications/initialized"}');
        Assert.areEqual(202, RestContext.response.statusCode, 'Notification accepted');
        Assert.isNull(RestContext.response.responseBody, 'Exactly empty body, never JSON null');
        Assert.areEqual(0, Limits.getDmlStatements(), 'No DML'); Assert.areEqual(0, Limits.getCallouts(), 'No callouts'); Test.stopTest();
    }
    @IsTest static void missingMethodIsNotNotification() {
        context('claude'); Test.startTest(); request('POST', ROOT+'claude/mcp', '{"jsonrpc":"2.0"}'); Test.stopTest(); rpcError(-32600);
    }
    private static void rpcError(Integer code) {
        Assert.areEqual(200, RestContext.response.statusCode, 'JSON-RPC response status');
        Assert.areEqual(code, ((Map<String,Object>)body().get('error')).get('code'), 'Exact protocol error');
    }
}
