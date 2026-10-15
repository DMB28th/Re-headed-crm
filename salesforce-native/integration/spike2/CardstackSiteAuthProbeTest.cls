@IsTest
private with sharing class CardstackSiteAuthProbeTest {
    @TestSetup static void nativeUseFixture() {
        User actor=CardstackConnectionTestFactory.namedUser();
        CardstackConnectionTestFactory.assign(actor,'Cardstack_User');
    }
    private static void assertDirectRouteDenial() {
        Assert.areEqual(404,RestContext.response.statusCode,'Historical Site URI cannot enter the exact direct route.');
        Assert.areEqual(new Map<String,Object>{'error'=>'unknown_probe_route'},response(),'Denial precedes protocol parsing and renderer/private reads.');
    }
    private static void setup(String suffix, String body) {
        RestContext.request = new RestRequest();
        RestContext.request.requestURI = '/services/apexrest/cardstack-auth-site-probe/v1/' + suffix;
        if (body != null) RestContext.request.requestBody = Blob.valueOf(body);
        RestContext.response = new RestResponse();
    }
    private static Map<String,Object> response() {
        return (Map<String,Object>) JSON.deserializeUntyped(RestContext.response.responseBody.toString());
    }
    @IsTest static void publicMetadataNamesExactResourceAndIssuer() {
        setup('metadata', null);
        CardstackSiteAuthProbe.route(false, false);
        Assert.areEqual(200, RestContext.response.statusCode);
        Assert.areEqual('fbcb5d47db3d307c32b63efdd6c2aef68c167f44b6eeb14cc674d7fe0e3b607b',EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256',Blob.valueOf((String)response().get('resource')))), 'Exact retained metadata resource, fingerprinted to keep its private origin out of source.');
        Assert.areEqual(URL.getOrgDomainUrl().toExternalForm(), ((List<Object>)response().get('authorization_servers'))[0]);
    }
    @IsTest static void guestCannotGetTools() {
        setup('mcp', '{"jsonrpc":"2.0","id":1,"method":"tools/list"}');
        CardstackSiteAuthProbe.route(false, true);
        Assert.areEqual(401, RestContext.response.statusCode);
        Assert.isTrue(RestContext.response.headers.get('WWW-Authenticate').contains('Bearer resource_metadata="https://'));
        Assert.areEqual('authentication_required', response().get('error'));
    }
    @IsTest static void guestIdentityDenied() {
        setup('identity', null); CardstackSiteAuthProbe.route(false, false);
        Assert.areEqual(401, RestContext.response.statusCode);
        Assert.isFalse(response().containsKey('actorDigest'));
    }
    @IsTest static void platformActorIdentityAndGetMethod() {
        setup('identity', null); CardstackSiteAuthProbe.get();
        Assert.areEqual(200, RestContext.response.statusCode);
        Assert.areEqual(EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256', Blob.valueOf(UserInfo.getUserId()))), response().get('actorDigest'));
        setup('mcp', null); CardstackSiteAuthProbe.get(); Assert.areEqual(405, RestContext.response.statusCode);
    }
    @IsTest static void initializeAndConstantTool() {
        setup('mcp', '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25"}}');
        CardstackSiteAuthProbe.post();
        Assert.areEqual('2025-11-25', ((Map<String,Object>)response().get('result')).get('protocolVersion'));
        setup('mcp', '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'); CardstackSiteAuthProbe.post();
        Assert.areEqual(1, ((List<Object>)((Map<String,Object>)response().get('result')).get('tools')).size());
        setup('mcp', '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"cardstack_auth_probe","arguments":{}}}'); CardstackSiteAuthProbe.post();
        Assert.isTrue(RestContext.response.responseBody.toString().contains('No CRM access.'));
        Assert.isFalse(RestContext.response.responseBody.toString().contains('actorDigest'));
    }
    @IsTest static void rejectUnknownToolAndArguments() {
        for (String params : new List<String>{'{"name":"unknown"}', '{"name":"cardstack_auth_probe","arguments":{"extra":1}}', '{"name":"cardstack_auth_probe","arguments":4}'}) {
            setup('mcp', '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":' + params + '}'); CardstackSiteAuthProbe.post();
            Assert.areEqual(-32602, ((Map<String,Object>)response().get('error')).get('code'));
        }
    }
    @IsTest static void rejectMalformedBodiesAndMethods() {
        for (String body : new List<String>{'invalid', '[]', null, 'x'.repeat(4097)}) {
            setup('mcp', body); CardstackSiteAuthProbe.post(); Assert.areEqual(400, RestContext.response.statusCode);
        }
        setup('mcp', '{"jsonrpc":"1.0","id":1,"method":"ping"}'); CardstackSiteAuthProbe.post();
        Assert.areEqual(-32600, ((Map<String,Object>)response().get('error')).get('code'));
        setup('mcp', '{"jsonrpc":"2.0","id":1,"method":"unknown"}'); CardstackSiteAuthProbe.post();
        Assert.areEqual(-32601, ((Map<String,Object>)response().get('error')).get('code'));
    }
    @IsTest static void notificationsAndUnknownRoutes() {
        setup('mcp', '{"jsonrpc":"2.0","method":"notifications/initialized"}'); CardstackSiteAuthProbe.post();
        Assert.areEqual(202, RestContext.response.statusCode); Assert.isNull(RestContext.response.responseBody);
        setup('unknown', null); CardstackSiteAuthProbe.get(); Assert.areEqual(404, RestContext.response.statusCode);
        setup('identity', '{}'); CardstackSiteAuthProbe.post(); Assert.areEqual(405, RestContext.response.statusCode);
    }

    private static void invokeUi(Boolean authenticated, String body) {
        setup('ui-mcp', body);
        User actor=[SELECT Id FROM User WHERE Alias='csconn' LIMIT 1];
        System.runAs(actor) {
        Assert.isTrue(FeatureManagement.checkPermission('Cardstack_Use_Connections'),'Native Use is present, so denial tests the route.');
        Test.startTest();
        CardstackSiteAuthProbe.route(authenticated, true);
        Assert.areEqual(0,Limits.getQueries(),'Historical delegation must be denied before private/CRM/resource queries.');
        Integer dml = Limits.getDmlStatements();
        Integer callouts = Limits.getCallouts();
        Test.stopTest();
        Assert.areEqual(0, dml, 'UI probe must not mutate CRM data');
        Assert.areEqual(0, callouts, 'UI probe must not make callouts');
        }
    }
    @IsTest static void uiMetadataNamesExactResource() {
        setup('ui-metadata', null);
        Test.startTest(); CardstackSiteAuthProbe.route(false, false); Test.stopTest();
        Assert.areEqual(200, RestContext.response.statusCode, 'Public metadata must be reachable');
        Assert.areEqual('a3716adb09c607b6df6bc6d147a69d357138e5b7816ca07f8812975ac0c3b2f6',EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256',Blob.valueOf((String)response().get('resource')))), 'Exact retained metadata resource, fingerprinted to keep its private origin out of source.');
    }
    @IsTest static void guestUiResourceDeniedBeforeDelegation() {
        invokeUi(false, '{"jsonrpc":"2.0","id":1,"method":"resources/read","params":{"uri":"ui://cardstack/apex-transport-probe.html"}}');
        Assert.areEqual(401, RestContext.response.statusCode, 'Guest cannot fetch protected renderer');
        Assert.isTrue(RestContext.response.headers.get('WWW-Authenticate').contains('/ui-metadata"'), 'UI challenge must point to matching metadata');
        Assert.areEqual('authentication_required', response().get('error'), 'Guest must not reach renderer dispatcher');
    }
    @IsTest static void namedUiToolsLinkExistingRenderer() {
        invokeUi(true, '{"jsonrpc":"2.0","id":1,"method":"tools/list"}');
        assertDirectRouteDenial();
    }
    @IsTest static void namedUiResourceReadKeepsMimeAndHtml() {
        invokeUi(true, '{"jsonrpc":"2.0","id":1,"method":"resources/read","params":{"uri":"ui://cardstack/apex-transport-probe.html"}}');
        assertDirectRouteDenial();
    }
    @IsTest static void namedUiEchoPreservesExactTypedValues() {
        Map<String,Object> values = new Map<String,Object>{'text'=>'café ✓ "quoted"', 'amount'=>0, 'accepted'=>false, 'choice'=>'beta', 'rating'=>'hot', 'notes'=>'first\nsecond', 'enabled'=>false};
        invokeUi(true, JSON.serialize(new Map<String,Object>{'jsonrpc'=>'2.0', 'id'=>1, 'method'=>'tools/call', 'params'=>new Map<String,Object>{'name'=>'echo_cardstack_values', 'arguments'=>values}}));
        assertDirectRouteDenial();
    }
    @IsTest static void namedUiMalformedJsonReturnsProtocolError() {
        invokeUi(true, '{');
        assertDirectRouteDenial();
    }
    @IsTest static void namedUiNotificationHasNoBody() {
        invokeUi(true, '{"jsonrpc":"2.0","method":"notifications/initialized"}');
        assertDirectRouteDenial();
    }
}