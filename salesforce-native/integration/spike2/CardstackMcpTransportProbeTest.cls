/** Synthetic transport contract only; no CRM fixtures or authority. */
@IsTest private with sharing class CardstackMcpTransportProbeTest {
    private static final String UI_URI = 'ui://cardstack/apex-transport-probe.html';
    @TestSetup static void nativeUseFixture() {
        User actor=CardstackConnectionTestFactory.namedUser();
        CardstackConnectionTestFactory.assign(actor,'Cardstack_User');
    }
    private static void enrollDirect() {
        CardstackConnectionAccess.adminOverride=true;
        CardstackConnectionTypes.SetupInput input=new CardstackConnectionTypes.SetupInput();
        input.client='chatgpt'; input.transportKind='direct-org-api/v1'; input.routeVersion='apex-probe/v1';
        input.expectedRevision=0; input.enabledIntent=true;
        input.publicClientId='synthetic-retained-client';input.callbacks=new List<String>{'https://client.example/callback'};
        CardstackConnectionSetup.save(input);
        CardstackConnectionAccess.adminOverride=null;
    }
    private static Map<String,Object> catalogItem(List<Object> items,String key,String value) {
        for(Object raw:items) { Map<String,Object> item=(Map<String,Object>)raw; if(value.equals(item.get(key))) return item; }
        Assert.fail('Retained synthetic descriptor must remain discoverable.');return null;
    }
    private static Integer expectedSyntheticQueries(String body) {
        // One private enrollment read, plus only explicitly expected resource metadata.
        try {
            Map<String,Object> request=(Map<String,Object>)JSON.deserializeUntyped(body);
            String method=(String)request.get('method');
            if(method=='tools/list' || method=='resources/list') return 3;
            if(method=='resources/read' && request.get('params') instanceof Map<String,Object> && UI_URI.equals(((Map<String,Object>)request.get('params')).get('uri'))) return 2;
        } catch(JSONException malformed) { return 1; }
        return 1;
    }
    private static RestResponse invokeRaw(String body) {
        RestRequest req = new RestRequest();
        req.httpMethod = 'POST';
        req.requestURI = '/services/apexrest/cardstack-mcp-probe/';
        req.requestBody = Blob.valueOf(body);
        RestContext.request = req;
        RestContext.response = new RestResponse();
        User actor=[SELECT Id FROM User WHERE Alias='csconn' LIMIT 1];
        System.runAs(actor) {
        Assert.isTrue(FeatureManagement.checkPermission('Cardstack_Use_Connections'),'Actual native Use fixture.');
        enrollDirect();
        Test.startTest();
        CardstackMcpTransportProbe.post();
        Assert.areEqual(expectedSyntheticQueries(body),Limits.getQueries(),'Only private enrollment and the expected resource reads; no CRM queries.');
        Integer dml = Limits.getDmlStatements();
        Integer callouts = Limits.getCallouts();
        Test.stopTest();
        Assert.areEqual(0, dml, 'Synthetic transport must not mutate business data');
        Assert.areEqual(0, callouts, 'Synthetic transport must not make callouts');
        }
        return RestContext.response;
    }
    private static Map<String,Object> parsed(RestResponse response) {
        Assert.isNotNull(response.responseBody, 'Request must have JSON-RPC response');
        return (Map<String,Object>)JSON.deserializeUntyped(response.responseBody.toString());
    }
    private static Map<String,Object> call(String method, Object params) {
        return parsed(invokeRaw(JSON.serialize(new Map<String,Object>{
            'jsonrpc'=>'2.0', 'id'=>1, 'method'=>method, 'params'=>params
        })));
    }
    private static Map<String,Object> result(Map<String,Object> response) {
        Assert.isTrue(response.containsKey('result'), 'Valid request must produce result');
        return (Map<String,Object>)response.get('result');
    }
    private static void assertError(Map<String,Object> response, Integer code) {
        Assert.isTrue(response.containsKey('error'), 'Invalid request must produce error');
        Assert.areEqual(code, ((Map<String,Object>)response.get('error')).get('code'),
            'Error must identify the failing protocol boundary');
    }
    private static Map<String,Object> echo(Object args) {
        return call('tools/call', new Map<String,Object>{'name'=>'echo_cardstack_values','arguments'=>args});
    }
    @IsTest static void initializeAdvertisesResources() {
        Map<String,Object> data = result(call('initialize', new Map<String,Object>{'protocolVersion'=>'2025-06-18'}));
        Assert.areEqual('2025-06-18', data.get('protocolVersion'), 'Requested supported protocol is preserved');
        Assert.isTrue(((Map<String,Object>)data.get('capabilities')).containsKey('resources'), 'Resources must be advertised');
    }
    @IsTest static void rejectsNumericInitializeVersion() {
        assertError(call('initialize', new Map<String,Object>{'protocolVersion'=>67}), -32602);
    }
    @IsTest static void rejectsObjectInitializeVersion() {
        assertError(call('initialize', new Map<String,Object>{'protocolVersion'=>new Map<String,Object>{'version'=>'2025-06-18'}}), -32602);
    }
    @IsTest static void openToolLinksMatchingResource() {
        List<Object> tools = (List<Object>)result(call('tools/list', new Map<String,Object>())).get('tools');
        Map<String,Object> openTool = catalogItem(tools,'name','open_cardstack_apex_probe');
        Assert.areEqual('open_cardstack_apex_probe', openTool.get('name'), 'Open tool is discoverable');
        Map<String,Object> ui = (Map<String,Object>)((Map<String,Object>)openTool.get('_meta')).get('ui');
        Assert.areEqual(UI_URI, ui.get('resourceUri'), 'Open tool links the served UI resource');
    }
    @IsTest static void listedResourceMatchesUiContract() {
        List<Object> resources = (List<Object>)result(call('resources/list', new Map<String,Object>())).get('resources');
        Map<String,Object> resource = catalogItem(resources,'uri',UI_URI);
        Assert.areEqual(UI_URI, resource.get('uri'), 'Listed resource matches the tool link');
        Assert.areEqual('text/html;profile=mcp-app', resource.get('mimeType'), 'Listed resource has MCP Apps MIME');
    }
    @IsTest static void echoHelperIsAppVisible() {
        List<Object> tools = (List<Object>)result(call('tools/list', new Map<String,Object>())).get('tools');
        Map<String,Object> helper = catalogItem(tools,'name','echo_cardstack_values');
        Assert.areEqual('echo_cardstack_values', helper.get('name'), 'Echo helper is discoverable');
        Assert.isTrue(helper.containsKey('_meta'), 'Echo helper requires app visibility metadata');
        Map<String,Object> ui = (Map<String,Object>)((Map<String,Object>)helper.get('_meta')).get('ui');
        Assert.areEqual(new List<Object>{'app'}, ui.get('visibility'), 'Synthetic helper is callable by app only');
    }
    @IsTest static void resourceReadReturnsMatchingHtml() {
        List<Object> contents = (List<Object>)result(call('resources/read', new Map<String,Object>{'uri'=>UI_URI})).get('contents');
        Assert.areEqual(1, contents.size(), 'Read returns one self-contained UI');
        Map<String,Object> resource = (Map<String,Object>)contents[0];
        Assert.areEqual(UI_URI, resource.get('uri'), 'Read URI matches requested UI');
        Assert.areEqual('text/html;profile=mcp-app', resource.get('mimeType'), 'Read uses MCP Apps MIME');
        Assert.isTrue(((String)resource.get('text')).contains('<form>'), 'Resource contains the synthetic form');
    }
    @IsTest static void rejectsUnknownResource() {
        assertError(call('resources/read', new Map<String,Object>{'uri'=>'ui://unknown/probe.html'}), -32602);
    }
    @IsTest static void exactTypedEchoWithoutMutation() {
        Map<String,Object> values = new Map<String,Object>{'text'=>'café ✓ "quoted"','amount'=>0,'accepted'=>false,
            'choice'=>'beta','rating'=>'hot','notes'=>'first\nsecond','enabled'=>false};
        Map<String,Object> data = result(echo(values));
        Assert.areEqual(values, data.get('structuredContent'), 'All seven exact typed values survive');
        List<Object> content = (List<Object>)data.get('content');
        Assert.isTrue(((String)((Map<String,Object>)content[0]).get('text')).contains('synthetic'), 'Text fallback explains synthetic receipt');
    }
    @IsTest static void emptyTextSurvives() {
        Assert.areEqual(new Map<String,Object>{'text'=>''}, result(echo(new Map<String,Object>{'text'=>''})).get('structuredContent'), 'Blank text must survive');
    }
    @IsTest static void rejectsWrongBooleanType() { assertError(echo(new Map<String,Object>{'accepted'=>'false'}), -32602); }
    @IsTest static void rejectsWrongNumberType() { assertError(echo(new Map<String,Object>{'amount'=>'0'}), -32602); }
    @IsTest static void rejectsWrongStringType() { assertError(echo(new Map<String,Object>{'text'=>false}), -32602); }
    @IsTest static void rejectsNullValue() { assertError(echo(new Map<String,Object>{'enabled'=>null}), -32602); }
    @IsTest static void rejectsUnapprovedArgument() { assertError(echo(new Map<String,Object>{'recordId'=>'not-approved'}), -32602); }
    @IsTest static void rejectsOversizedString() { assertError(echo(new Map<String,Object>{'notes'=>'x'.repeat(1001)}), -32602); }
    @IsTest static void rejectsOversizedRequest() {
        assertError(parsed(invokeRaw(JSON.serialize(new Map<String,Object>{'jsonrpc'=>'2.0','id'=>1,'method'=>'tools/call',
            'params'=>new Map<String,Object>{'name'=>'echo_cardstack_values','arguments'=>new Map<String,Object>{'text'=>'x'.repeat(16385)}}}))), -32600);
    }
    @IsTest static void malformedParamsAreInvalidParams() { assertError(call('tools/call', new List<Object>()), -32602); }
    @IsTest static void malformedArgumentsAreInvalidParams() { assertError(echo(new List<Object>()), -32602); }
    @IsTest static void malformedToolNameIsInvalidParams() { assertError(call('tools/call', new Map<String,Object>{'name'=>false}), -32602); }
    @IsTest static void invalidJsonIsParseError() { assertError(parsed(invokeRaw('{')), -32700); }
    @IsTest static void rejectsUnknownMethod() { assertError(call('records/delete', new Map<String,Object>()), -32601); }
    @IsTest static void initializedNotificationHasNoResult() {
        RestResponse response = invokeRaw('{"jsonrpc":"2.0","method":"notifications/initialized"}');
        Assert.areEqual(202, response.statusCode, 'Notification receives accepted status');
        Assert.isNull(response.responseBody, 'Notification must not receive JSON-RPC response');
    }
    @IsTest static void pingNotificationHasNoResult() {
        RestResponse response = invokeRaw('{"jsonrpc":"2.0","method":"ping"}');
        Assert.areEqual(202, response.statusCode, 'Notification receives accepted status');
        Assert.isNull(response.responseBody, 'Notifications must not receive a JSON-RPC result');
    }
    @IsTest static void invalidEchoNotificationHasNoResult() {
        RestResponse response = invokeRaw('{"jsonrpc":"2.0","method":"tools/call","params":{"name":"echo_cardstack_values","arguments":{"recordId":"not-approved"}}}');
        Assert.areEqual(202, response.statusCode, 'Even failed notification receives accepted status');
        Assert.isNull(response.responseBody, 'Failed notification must not receive JSON-RPC error');
    }
}