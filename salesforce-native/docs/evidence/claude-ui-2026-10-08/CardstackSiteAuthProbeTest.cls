@IsTest
private with sharing class CardstackSiteAuthProbeTest {
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
        Assert.areEqual('https://orgfarm-e768adf3fa-dev-ed.develop.my.salesforce-sites.com/cardstackauthprobe/services/apexrest/cardstack-auth-site-probe/v1/mcp', response().get('resource'));
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
        Test.startTest();
        CardstackSiteAuthProbe.route(authenticated, true);
        Integer dml = Limits.getDmlStatements();
        Integer callouts = Limits.getCallouts();
        Test.stopTest();
        Assert.areEqual(0, dml, 'UI probe must not mutate CRM data');
        Assert.areEqual(0, callouts, 'UI probe must not make callouts');
    }
    @IsTest static void uiMetadataNamesExactResource() {
        setup('ui-metadata', null);
        Test.startTest(); CardstackSiteAuthProbe.route(false, false); Test.stopTest();
        Assert.areEqual(200, RestContext.response.statusCode, 'Public metadata must be reachable');
        Assert.areEqual('https://orgfarm-e768adf3fa-dev-ed.develop.my.salesforce-sites.com/cardstackauthprobe/services/apexrest/cardstack-auth-site-probe/v1/ui-mcp', response().get('resource'), 'Metadata must name exact UI endpoint');
    }
    @IsTest static void guestUiResourceDeniedBeforeDelegation() {
        invokeUi(false, '{"jsonrpc":"2.0","id":1,"method":"resources/read","params":{"uri":"ui://cardstack/apex-transport-probe.html"}}');
        Assert.areEqual(401, RestContext.response.statusCode, 'Guest cannot fetch protected renderer');
        Assert.isTrue(RestContext.response.headers.get('WWW-Authenticate').contains('/ui-metadata"'), 'UI challenge must point to matching metadata');
        Assert.areEqual('authentication_required', response().get('error'), 'Guest must not reach renderer dispatcher');
    }
    @IsTest static void namedUiToolsLinkExistingRenderer() {
        invokeUi(true, '{"jsonrpc":"2.0","id":1,"method":"tools/list"}');
        List<Object> tools = (List<Object>)((Map<String,Object>)response().get('result')).get('tools');
        Assert.areEqual(2, tools.size(), 'UI route must reuse two synthetic renderer tools');
        Map<String,Object> open = (Map<String,Object>)tools[0];
        Assert.areEqual('open_cardstack_apex_probe', open.get('name'), 'Open tool must be visible');
        Assert.areEqual('ui://cardstack/apex-transport-probe.html', ((Map<String,Object>)((Map<String,Object>)open.get('_meta')).get('ui')).get('resourceUri'), 'Open tool must link exact deployed resource');
    }
    @IsTest static void namedUiResourceReadKeepsMimeAndHtml() {
        invokeUi(true, '{"jsonrpc":"2.0","id":1,"method":"resources/read","params":{"uri":"ui://cardstack/apex-transport-probe.html"}}');
        List<Object> contents = (List<Object>)((Map<String,Object>)response().get('result')).get('contents');
        Map<String,Object> item = (Map<String,Object>)contents[0];
        Assert.areEqual('text/html;profile=mcp-app', item.get('mimeType'), 'Must retain MCP Apps MIME');
        Assert.isTrue(((String)item.get('text')).contains('<form>'), 'Must return existing bundled form');
    }
    @IsTest static void namedUiEchoPreservesExactTypedValues() {
        Map<String,Object> values = new Map<String,Object>{'text'=>'café ✓ "quoted"', 'amount'=>0, 'accepted'=>false, 'choice'=>'beta', 'rating'=>'hot', 'notes'=>'first\nsecond', 'enabled'=>false};
        invokeUi(true, JSON.serialize(new Map<String,Object>{'jsonrpc'=>'2.0', 'id'=>1, 'method'=>'tools/call', 'params'=>new Map<String,Object>{'name'=>'echo_cardstack_values', 'arguments'=>values}}));
        Assert.areEqual(values, ((Map<String,Object>)response().get('result')).get('structuredContent'), 'Site route must preserve exact types and values');
    }
    @IsTest static void namedUiMalformedJsonReturnsProtocolError() {
        invokeUi(true, '{');
        Assert.areEqual(-32700, ((Map<String,Object>)response().get('error')).get('code'), 'Reuse parser error contract');
    }
    @IsTest static void namedUiNotificationHasNoBody() {
        invokeUi(true, '{"jsonrpc":"2.0","method":"notifications/initialized"}');
        Assert.areEqual(202, RestContext.response.statusCode, 'Notifications must be accepted');
        Assert.isNull(RestContext.response.responseBody, 'Notifications must have no JSON-RPC response');
    }
}
