/** Authoritative direct ingress tests; injected actor/Site seams are not OAuth proof. */
@IsTest private with sharing class CardstackDirectIngressTest {
    private static final String PATH = '/services/apexrest/cardstack-mcp-probe/';
    private static void actor() {
        CardstackMcpTransportProbe.namedOverride = true;
        CardstackConnectionAccess.userOverride = true; CardstackConnectionAccess.adminOverride = true;
        CardstackConnectionContext.platformOverrideEnabled = true; CardstackConnectionContext.siteIdOverride = null;
        CardstackConnectionContext.orgIssuerOverride = URL.getOrgDomainUrl().toExternalForm();
    }
    private static void enroll(Boolean enabled) {
        actor(); CardstackConnectionTypes.SetupInput input = new CardstackConnectionTypes.SetupInput();
        input.client = 'chatgpt'; input.transportKind = 'direct-org-api/v1'; input.routeVersion = 'apex-probe/v1';
        input.publicClientId = 'public-existing-client'; input.callbacks = new List<String>{'https://client.example/callback'};
        input.expectedRevision = 0; input.enabledIntent = enabled; CardstackConnectionSetup.save(input);
    }
    private static void request(String verb, String uri, String payload) {
        RestContext.request = new RestRequest(); RestContext.response = new RestResponse();
        RestContext.request.httpMethod = verb; RestContext.request.requestURI = uri;
        if(payload != null) RestContext.request.requestBody = Blob.valueOf(payload);
        invoke(verb);
    }
    private static void invoke(String verb) {
        if(verb.equals('GET')) CardstackMcpTransportProbe.get();
        else if(verb.equals('POST')) CardstackMcpTransportProbe.post();
        else if(verb.equals('PUT')) CardstackMcpTransportProbe.put();
        else if(verb.equals('PATCH')) CardstackMcpTransportProbe.patch();
        else CardstackMcpTransportProbe.deleteRequest();
    }
    private static String rpc(String method, Map<String,Object> params) {
        return JSON.serialize(new Map<String,Object>{'jsonrpc'=>'2.0','id'=>1,'method'=>method,'params'=>params});
    }
    private static Map<String,Object> body() { return (Map<String,Object>)JSON.deserializeUntyped(RestContext.response.responseBody.toString()); }
    private static void denial(Integer status, String code) {
        Assert.areEqual(status, RestContext.response.statusCode, 'Exact HTTP status');
        Assert.areEqual(new Map<String,Object>{'error'=>code}, body(), 'Fixed public error only');
    }
    private static void noEffects() {
        Assert.areEqual(0, Limits.getQueries(), 'No private/setup/resource query');
        Assert.areEqual(0, Limits.getDmlStatements(), 'No lifecycle or CRM writes');
        Assert.areEqual(0, Limits.getCallouts(), 'No auth forwarding');
    }
    @IsTest static void guestAllHttpMethodsDeniedBeforeQuery() {
        actor(); CardstackMcpTransportProbe.namedOverride = false; Test.startTest();
        for(String verb : new List<String>{'GET','POST','PUT','PATCH','DELETE'}) { request(verb,PATH,rpc('resources/read',new Map<String,Object>{'uri'=>'ui://cardstack/apex-transport-probe.html'})); denial(401,'authentication_required'); }
        noEffects(); Test.stopTest();
    }
    @IsTest static void guestAllProtocolMethodsDeniedBeforeQuery() {
        actor(); CardstackMcpTransportProbe.namedOverride = false; Test.startTest();
        for(String method : new List<String>{'initialize','ping','tools/list','tools/call','resources/list','resources/read'}) { request('POST',PATH,rpc(method,new Map<String,Object>())); denial(401,'authentication_required'); }
        noEffects(); Test.stopTest();
    }
    @IsTest static void missingUseAllMethodsDeniedBeforeQuery() {
        actor(); CardstackConnectionAccess.userOverride = false; Test.startTest();
        for(String verb : new List<String>{'GET','POST','PUT','PATCH','DELETE'}) { request(verb,PATH,'malformed'); denial(403,'cardstack_use_required'); }
        noEffects(); Test.stopTest();
    }
    @IsTest static void missingUseAllProtocolMethodsDeniedBeforeQuery() {
        actor(); CardstackConnectionAccess.userOverride = false; Test.startTest();
        for(String method : new List<String>{'initialize','ping','tools/list','tools/call','resources/list','resources/read'}) { request('POST',PATH,rpc(method,new Map<String,Object>())); denial(403,'cardstack_use_required'); }
        noEffects(); Test.stopTest();
    }
    @IsTest static void actualUnassignedNamedUserDeniedBeforeQuery() {
        User user = CardstackConnectionTestFactory.namedUser(); actor(); CardstackConnectionAccess.userOverride = null;
        Test.startTest(); System.runAs(user) {
            // Native runAs itself counts as DML; measure only the denied invocation.
            Integer queriesBefore = Limits.getQueries();
            Integer writesBefore = Limits.getDmlStatements();
            Integer calloutsBefore = Limits.getCallouts();
            request('POST',PATH,rpc('tools/list',new Map<String,Object>())); denial(403,'cardstack_use_required');
            Assert.areEqual(0,Limits.getQueries()-queriesBefore,'Denied invocation has no private/setup/resource query');
            Assert.areEqual(0,Limits.getDmlStatements()-writesBefore,'Denied invocation has no lifecycle or CRM writes');
            Assert.areEqual(0,Limits.getCallouts()-calloutsBefore,'Denied invocation has no auth forwarding');
        } Test.stopTest();
    }
    @IsTest static void siteCannotUseDirectAllMethodsBeforeQuery() {
        actor(); CardstackConnectionContext.siteIdOverride = CardstackConnectionTypes.normalizeId(Schema.Site.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED).getKeyPrefix() + '0'.repeat(12));
        Test.startTest();
        for(String verb : new List<String>{'GET','POST','PUT','PATCH','DELETE'}) { request(verb,PATH,'malformed'); denial(403,'direct_context_required'); }
        noEffects(); Test.stopTest();
    }
    @IsTest static void hostileUriFormsDeniedBeforeQuery() {
        actor(); Test.startTest();
        for(String uri : new List<String>{PATH+'extra',PATH+'?client=claude',PATH+'/',PATH.replace('probe','%70robe'),PATH.replace('probe','PROBE'),PATH.replace('probe/','probe'),'/chat'+PATH,'https://hostile.example'+PATH,PATH+'../',PATH+'%2f'}) { request('POST',uri,'malformed'); denial(404,'unknown_probe_route'); }
        noEffects(); Test.stopTest();
    }
    @IsTest static void queryParametersDeniedBeforeQuery() {
        actor(); RestContext.request = new RestRequest(); RestContext.response = new RestResponse();
        RestContext.request.requestURI = PATH; RestContext.request.addParameter('client','claude');
        Test.startTest(); CardstackMcpTransportProbe.post(); denial(404,'unknown_probe_route'); noEffects(); Test.stopTest();
    }
    @IsTest static void missingEnrollmentDeniedBeforeParsing() {
        actor(); Test.startTest(); request('POST',PATH,'malformed'); denial(503,'connection_setup_unavailable');
        Assert.areEqual(1, Limits.getQueries(), 'Only private setup read'); Assert.areEqual(0, Limits.getDmlStatements(), 'No writes'); Test.stopTest();
    }
    @IsTest static void disabledEnrollmentDeniedBeforeParsing() {
        enroll(false); Test.startTest(); request('POST',PATH,'malformed'); denial(403,'connection_disabled');
        Assert.areEqual(1, Limits.getQueries(), 'No resources'); Assert.areEqual(0, Limits.getDmlStatements(), 'No writes'); Test.stopTest();
    }
    @IsTest static void siteEnrollmentCannotFallbackToDirect() {
        actor(); CardstackConnectionTypes.SetupInput input = new CardstackConnectionTypes.SetupInput();
        input.client = 'chatgpt'; input.expectedRevision = 0; input.enabledIntent = false; CardstackConnectionSetup.save(input);
        Test.startTest(); request('POST',PATH,'malformed'); denial(503,'connection_setup_unavailable'); Test.stopTest();
    }
    /** Independent mutation fixture can preserve a valid digest while testing other bindings. */
    private static void corrupt(String key, Object value, Boolean repairDigest) {
        Cardstack_Connection_Setup__c row = [SELECT Id, Configuration__c, Configuration_Digest__c FROM Cardstack_Connection_Setup__c WHERE Client__c='chatgpt' WITH SYSTEM_MODE LIMIT 1];
        Map<String,Object> stored = (Map<String,Object>)JSON.deserializeUntyped(row.Configuration__c); stored.put(key,value);
        row.Configuration__c = JSON.serialize(stored);
        if(repairDigest) {
            JSONGenerator writer = JSON.createGenerator(false); writer.writeStartObject();
            for(String field : new List<String>{'transportKind','routeVersion','orgIdentity','client','publicClientId','callbacks','siteId','sitePrefix','enabledIntent','issuer','packageVersion','transportVersion','uiVersion','permissionPolicyRevision'}) { if(stored.get(field) == null) writer.writeNullField(field); else writer.writeObjectField(field,stored.get(field)); }
            writer.writeEndObject(); row.Configuration_Digest__c = EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256',Blob.valueOf(writer.getAsString())));
        }
        Database.update(row,AccessLevel.SYSTEM_MODE);
    }
    private static void invalidEnrollment() {
        Test.startTest(); request('POST',PATH,rpc('resources/list',new Map<String,Object>())); denial(503,'connection_setup_unavailable');
        Assert.areEqual(1, Limits.getQueries(), 'Enrollment failure stops resource query'); Assert.areEqual(0, Limits.getDmlStatements(), 'No writes'); Test.stopTest();
    }
    @IsTest static void wrongOrgFailsClosed() { enroll(true); corrupt('orgIdentity',CardstackConnectionTypes.normalizeId('00D'+'0'.repeat(12)),true); invalidEnrollment(); }
    @IsTest static void wrongClientFailsClosed() { enroll(true); corrupt('client','claude',true); invalidEnrollment(); }
    @IsTest static void wrongKindFailsClosed() { enroll(true); corrupt('transportKind','site/v1',true); invalidEnrollment(); }
    @IsTest static void wrongEndpointFailsClosed() { enroll(true); corrupt('resourceUrl','https://hostile.example/mcp',false); invalidEnrollment(); }
    @IsTest static void missingEndpointFailsClosed() { enroll(true); corrupt('resourceUrl',null,false); invalidEnrollment(); }
    @IsTest static void wrongIssuerFailsClosed() { enroll(true); corrupt('issuer','https://hostile.example',true); invalidEnrollment(); }
    @IsTest static void wrongRouteVersionFailsClosed() { enroll(true); corrupt('routeVersion','v2',true); invalidEnrollment(); }
    @IsTest static void staleContractFailsClosed() { enroll(true); corrupt('uiVersion','old',true); invalidEnrollment(); }
    @IsTest static void stalePackageFailsClosed() { enroll(true); corrupt('packageVersion','old',true); invalidEnrollment(); }
    @IsTest static void staleTransportFailsClosed() { enroll(true); corrupt('transportVersion','old',true); invalidEnrollment(); }
    @IsTest static void stalePermissionPolicyFailsClosed() { enroll(true); corrupt('permissionPolicyRevision','old',true); invalidEnrollment(); }
    @IsTest static void caseChangedContractFailsClosed() { enroll(true); corrupt('uiVersion','MCP-APPS/V1',true); invalidEnrollment(); }
    @IsTest static void corruptDigestFailsClosed() { enroll(true); corrupt('publicClientId','tampered',false); invalidEnrollment(); }
    @IsTest static void unknownPrivateFieldFailsClosed() { enroll(true); corrupt('injectedClient','claude',false); invalidEnrollment(); }
    @IsTest static void malformedStoredJsonFailsClosed() {
        enroll(true); Cardstack_Connection_Setup__c row = [SELECT Id FROM Cardstack_Connection_Setup__c WHERE Client__c='chatgpt' WITH SYSTEM_MODE LIMIT 1];
        row.Configuration__c = '{'; Database.update(row,AccessLevel.SYSTEM_MODE); invalidEnrollment();
    }
    @IsTest static void zeroRevisionFailsClosed() {
        enroll(true); Cardstack_Connection_Setup__c row = [SELECT Id FROM Cardstack_Connection_Setup__c WHERE Client__c='chatgpt' WITH SYSTEM_MODE LIMIT 1];
        row.Revision__c = 0; Database.update(row,AccessLevel.SYSTEM_MODE); invalidEnrollment();
    }
    @IsTest static void hostileHeadersAndBodyCannotSwitchClient() {
        enroll(true); RestContext.request = new RestRequest(); RestContext.response = new RestResponse();
        RestContext.request.requestURI = PATH;
        Map<String,Object> hostileBody = (Map<String,Object>)JSON.deserializeUntyped(rpc('tools/call',new Map<String,Object>{'name'=>'cardstack_connection_diagnostic','arguments'=>new Map<String,Object>()}));
        hostileBody.put('client','claude'); hostileBody.put('resourceUrl','https://hostile.example/mcp');
        RestContext.request.requestBody = Blob.valueOf(JSON.serialize(hostileBody));
        RestContext.request.addHeader('Host','hostile.example'); RestContext.request.addHeader('Forwarded','host=hostile.example'); RestContext.request.addHeader('X-Cardstack-Client','claude'); RestContext.request.addHeader('X-Forwarded-Host','hostile.example');
        Test.startTest(); CardstackMcpTransportProbe.post(); Test.stopTest();
        Map<String,Object> result = (Map<String,Object>)body().get('result'); Map<String,Object> meta = (Map<String,Object>)result.get('_meta');
        Map<String,Object> attempt = (Map<String,Object>)meta.get('cardstack/connectionDiagnostic');
        Assert.areEqual('chatgpt',attempt.get('client'),'Server registration supplies lifecycle client');
    }
    @IsTest static void injectedToolClientRejectedWithoutLifecycleWrite() {
        enroll(true); Test.startTest(); request('POST',PATH,rpc('tools/call',new Map<String,Object>{'name'=>'cardstack_connection_diagnostic','arguments'=>new Map<String,Object>{'client'=>'claude'}}));
        rpcError(-32602); Assert.areEqual(0,Limits.getDmlStatements(),'No diagnostic created'); Test.stopTest();
    }
    @IsTest static void directProductCatalogUsesCurrentResourceUris() {
        enroll(true); Test.startTest(); request('POST',PATH,rpc('tools/list',new Map<String,Object>()));
        List<Object> tools = (List<Object>)((Map<String,Object>)body().get('result')).get('tools');
        String uri;
        for(Object raw : tools) { Map<String,Object> tool = (Map<String,Object>)raw; if('cardstack_record_open'.equals(tool.get('name'))) uri = (String)((Map<String,Object>)((Map<String,Object>)tool.get('_meta')).get('ui')).get('resourceUri'); }
        Assert.areEqual(CardstackRecordMcpAdapter.resourceUri(),uri,'Current helper supplies content URI');
        Assert.isNotNull(uri,'Product tool is actually advertised');
        request('POST',PATH,rpc('resources/read',new Map<String,Object>{'uri'=>uri}));
        List<Object> contents = (List<Object>)((Map<String,Object>)body().get('result')).get('contents');
        Assert.areEqual(uri,((Map<String,Object>)contents[0]).get('uri'),'Exact URI read');
        Assert.areEqual('text/html;profile=mcp-app',((Map<String,Object>)contents[0]).get('mimeType'),'App MIME');
        String html = (String)((Map<String,Object>)contents[0]).get('text');
        String htmlDigest = EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256',Blob.valueOf(html))).toLowerCase();
        Assert.areEqual('ui://cardstack/record-edit-v1-sha256-'+htmlDigest+'.html',uri,'Advertised/requested URI binds exact returned HTML bytes');
        Test.stopTest();
    }
    @IsTest static void legacyAliasesAdvertisedAndBoundedSyntheticOnly() {
        enroll(true); Test.startTest(); request('POST',PATH,rpc('tools/list',new Map<String,Object>()));
        String catalog = JSON.serialize(body()); Assert.isTrue(catalog.contains('open_cardstack_apex_probe'),'Existing open retained'); Assert.isTrue(catalog.contains('echo_cardstack_values'),'Existing app helper retained');
        request('POST',PATH,rpc('tools/call',new Map<String,Object>{'name'=>'open_cardstack_apex_probe','arguments'=>new Map<String,Object>()}));
        Assert.areEqual(new Map<String,Object>{'status'=>'ready'},((Map<String,Object>)body().get('result')).get('structuredContent'),'Exact legacy ready contract');
        Map<String,Object> values = new Map<String,Object>{'text'=>'','amount'=>0,'accepted'=>false,'choice'=>'one','rating'=>'2','notes'=>'','enabled'=>false};
        request('POST',PATH,rpc('tools/call',new Map<String,Object>{'name'=>'echo_cardstack_values','arguments'=>values}));
        Assert.areEqual(values,((Map<String,Object>)body().get('result')).get('structuredContent'),'Exact typed echo');
        values.put('client','claude'); request('POST',PATH,rpc('tools/call',new Map<String,Object>{'name'=>'echo_cardstack_values','arguments'=>values})); rpcError(-32602);
        Assert.areEqual(0,Limits.getDmlStatements(),'Aliases never write CRM or diagnostics'); Assert.areEqual(0,Limits.getCallouts(),'No forwarding'); Test.stopTest();
    }
    @IsTest static void legacyResourceReadsOnlyFixedInstalledSyntheticAsset() {
        enroll(true); CardstackMcpTransportCompatibility.resourceOverrideEnabled = true; CardstackMcpTransportCompatibility.resourceOverride = Blob.valueOf('<html>synthetic-only</html>');
        Test.startTest(); request('POST',PATH,rpc('resources/read',new Map<String,Object>{'uri'=>'ui://cardstack/apex-transport-probe.html'}));
        List<Object> contents = (List<Object>)((Map<String,Object>)body().get('result')).get('contents');
        Assert.areEqual('<html>synthetic-only</html>',((Map<String,Object>)contents[0]).get('text'),'Synthetic resource alias');
        Assert.areEqual(1,Limits.getQueries(),'Only enrollment, synthetic body test seam'); Assert.areEqual(0,Limits.getDmlStatements(),'No writes'); Test.stopTest();
    }
    @IsTest static void malformedEnvelopeCannotReachCompatibility() {
        enroll(true); Test.startTest(); request('POST',PATH,'{"jsonrpc":"2.0","id":true,"method":"tools/call","params":{"name":"open_cardstack_apex_probe"}}'); rpcError(-32600); Test.stopTest();
    }
    @IsTest static void malformedJsonIsSafeProtocolError() { enroll(true); Test.startTest(); request('POST',PATH,'{'); rpcError(-32700); Test.stopTest(); }
    @IsTest static void batchIsRejected() { enroll(true); Test.startTest(); request('POST',PATH,'[]'); rpcError(-32600); Test.stopTest(); }
    @IsTest static void notificationsHaveEmpty202AndNoSyntheticExecution() {
        enroll(true); Test.startTest(); request('POST',PATH,'{"jsonrpc":"2.0","method":"tools/call","params":{"name":"open_cardstack_apex_probe"}}');
        Assert.areEqual(202,RestContext.response.statusCode,'Notification acknowledged'); Assert.isNull(RestContext.response.responseBody,'No JSON null'); Assert.areEqual(0,Limits.getDmlStatements(),'No execution'); Test.stopTest();
    }
    @IsTest static void invalidNotificationEnvelopeRejected() { enroll(true); Test.startTest(); request('POST',PATH,'{"jsonrpc":"2.0"}'); rpcError(-32600); Test.stopTest(); }
    @IsTest static void exact16KiBAccepted() {
        enroll(true); String payload = rpc('ping',new Map<String,Object>()); payload += ' '.repeat(16384-Blob.valueOf(payload).size());
        Test.startTest(); request('POST',PATH,payload); Assert.areEqual(new Map<String,Object>(),body().get('result'),'Exact byte bound'); Test.stopTest();
    }
    @IsTest static void oversizedMultibyteRejected() {
        enroll(true); String payload = rpc('ping',new Map<String,Object>()) + 'é'.repeat(8200);
        Test.startTest(); request('POST',PATH,payload); rpcError(-32600); Test.stopTest();
    }
    @IsTest static void unsupportedHttpMethodsAreGatedAndSafe() {
        enroll(true); Test.startTest();
        for(String verb : new List<String>{'GET','PUT','PATCH','DELETE'}) { request(verb,PATH,null); denial(405,'method_not_allowed'); }
        Assert.areEqual(0,Limits.getDmlStatements(),'No writes'); Test.stopTest();
    }
    private static void rpcError(Integer expected) { Assert.areEqual(200,RestContext.response.statusCode,'Protocol HTTP response'); Assert.areEqual(expected,((Map<String,Object>)body().get('error')).get('code'),'Exact protocol code'); }
}
