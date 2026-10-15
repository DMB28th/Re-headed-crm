/** Protocol contracts, with synthetic resource lookup only; no real HTML-loading claim. */
@IsTest private with sharing class CardstackMcpDispatcherTest {
    private static Map<String,Object> call(String method, Object params) {
        CardstackConnectionAccess.userOverride = true;
        Map<String,Object> request = new Map<String,Object>{'jsonrpc'=>'2.0','id'=>'request-1','method'=>method};
        if(params != null) request.put('params', params);
        return CardstackMcpDispatcher.handle('claude', request);
    }
    private static Map<String,Object> result(Map<String,Object> response) {
        Assert.areEqual('2.0', response.get('jsonrpc'), 'RPC version');
        Assert.areEqual('request-1', response.get('id'), 'Exact string ID');
        return (Map<String,Object>)response.get('result');
    }
    @IsTest static void toolsAndResourceContract() {
        CardstackOpportunityMcpAdapter.resourceOverrideEnabled=true; CardstackOpportunityMcpAdapter.resourceOverride=Blob.valueOf('abc');
        CardstackRecordMcpAdapter.resourceOverrideEnabled=true; CardstackRecordMcpAdapter.resourceOverride=Blob.valueOf('abc');
        Test.startTest();
        List<Object> listed = (List<Object>)result(call('tools/list', null)).get('tools');
        List<Object> legacyListed=new List<Object>();
        for(Object item:listed) if(!((String)((Map<String,Object>)item).get('name')).startsWith('cardstack_record_')) legacyListed.add(item);
        Assert.areEqual(6, legacyListed.size(), 'Two unchanged diagnostics plus four Opportunity tools');
        Assert.areEqual(16, listed.size(), 'Four additive generic tools retain all six legacy descriptors');
        Map<String,Object> open = (Map<String,Object>)listed[0], echo = (Map<String,Object>)listed[1];
        Assert.areEqual('cardstack_connection_diagnostic', open.get('name'), 'Interactive tool');
        Assert.areEqual('cardstack_connection_echo', echo.get('name'), 'App-only tool');
        Map<String,Object> openMeta = (Map<String,Object>)open.get('_meta');
        Assert.areEqual(new Map<String,Object>{'resourceUri'=>'ui://cardstack/connection-diagnostic-v1.html',
            'visibility'=>new List<String>{'model','app'}}, openMeta.get('ui'), 'One interactive resource');
        Assert.areEqual(new Map<String,Object>{'visibility'=>new List<String>{'app'}},
            ((Map<String,Object>)echo.get('_meta')).get('ui'), 'Echo invisible to model');
        List<Object> resources = (List<Object>)result(call('resources/list', null)).get('resources');
        Set<String> legacyUris=new Set<String>(), genericUris=new Set<String>();
        for(Object item:resources) { String uri=(String)((Map<String,Object>)item).get('uri'); if(uri=='ui://cardstack/record-edit-v1-sha256-ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad.html') genericUris.add(uri); else legacyUris.add(uri); }
        Assert.areEqual(2, legacyUris.size(), 'Existing diagnostic and separate Opportunity resource');
        Assert.areEqual(new Set<String>{'ui://cardstack/connection-diagnostic-v1.html','ui://cardstack/opportunity-edit-v1-sha256-ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad.html'},legacyUris,'Diagnostic address and current Opportunity content address remain exact');
        Assert.areEqual(new Set<String>{'ui://cardstack/record-edit-v1-sha256-ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad.html'},genericUris,'Only one bounded current generic content address');
        Assert.areEqual(3,resources.size(),'No extra duplicate or unknown resource descriptors');
        Assert.areEqual('ui://cardstack/connection-diagnostic-v1.html', ((Map<String,Object>)resources[0]).get('uri'), 'Exact resource');
        Assert.areEqual('text/html;profile=mcp-app', ((Map<String,Object>)resources[0]).get('mimeType'), 'Exact MIME'); Test.stopTest();
    }
    @IsTest static void bothProtocolVersionsSupported() {
        Test.startTest();
        for(String version : new List<String>{'2025-06-18','2025-11-25'}) {
            Assert.areEqual(version, result(call('initialize', new Map<String,Object>{'protocolVersion'=>version})).get('protocolVersion'), 'Negotiated version');
        } Test.stopTest();
    }
    @IsTest static void unsupportedVersionNegotiatesSupportedVersion() {
        Test.startTest(); Map<String,Object> response = call('initialize', new Map<String,Object>{'protocolVersion'=>'other'}); Test.stopTest();
        Assert.areEqual('2025-06-18', result(response).get('protocolVersion'), 'Server offers supported version');
    }
    @IsTest static void injectedResourceHasExactEnvelope() {
        CardstackMcpDispatcher.resourceOverrideEnabled = true;
        CardstackMcpDispatcher.resourceOverride = Blob.valueOf('<!doctype html><p>Synthetic test only</p>');
        Test.startTest(); Map<String,Object> response = call('resources/read', new Map<String,Object>{'uri'=>'ui://cardstack/connection-diagnostic-v1.html'});
        Assert.areEqual(0, Limits.getQueries(), 'Synthetic lookup only'); Test.stopTest();
        List<Object> contents = (List<Object>)result(response).get('contents');
        Assert.areEqual(1, contents.size(), 'One resource'); Map<String,Object> content = (Map<String,Object>)contents[0];
        Assert.areEqual('<!doctype html><p>Synthetic test only</p>', content.get('text'), 'Exact injected HTML');
        Assert.areEqual('text/html;profile=mcp-app', content.get('mimeType'), 'MIME');
        Assert.areEqual('ui://cardstack/connection-diagnostic-v1.html', content.get('uri'), 'Resource URI');
        Map<String,Object> ui = (Map<String,Object>)((Map<String,Object>)content.get('_meta')).get('ui');
        Assert.areEqual(new Map<String,Object>{'connectDomains'=>new List<Object>(),'resourceDomains'=>new List<Object>(),'frameDomains'=>new List<Object>()}, ui.get('csp'), 'Restrictive CSP');
    }
    @IsTest static void missingResourceUnavailable() {
        CardstackMcpDispatcher.resourceOverrideEnabled = true;
        Test.startTest(); Map<String,Object> response = call('resources/read', new Map<String,Object>{'uri'=>'ui://cardstack/connection-diagnostic-v1.html'}); Test.stopTest();
        error(response, -32603, 'Connection UI unavailable');
    }
    private static void configureDiagnostic() {
        CardstackConnectionAccess.adminOverride = true;
        CardstackConnectionTypes.SetupInput input = new CardstackConnectionTypes.SetupInput();
        input.client='claude'; input.publicClientId='public'; input.callbacks=new List<String>{'https://claude.ai/api/mcp/auth_callback'};
        input.siteId=(Id)CardstackConnectionTypes.normalizeId(Schema.Site.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED).getKeyPrefix()+'0'.repeat(12));
        input.sitePrefix='/cardstack'; input.enabledIntent=true; input.expectedRevision=0;
        CardstackConnectionSetup.save(input);
    }
    @IsTest static void diagnosticSecretsOnlyInUiMetadata() {
        configureDiagnostic(); Test.startTest();
        Map<String,Object> response=result(call('tools/call',new Map<String,Object>{'name'=>'cardstack_connection_diagnostic'}));
        Test.stopTest();
        Map<String,Object> meta=(Map<String,Object>)response.get('_meta');
        CardstackConnectionTypes.DiagnosticOpen attempt=(CardstackConnectionTypes.DiagnosticOpen)meta.get('cardstack/connectionDiagnostic');
        Assert.areEqual('claude',attempt.client,'Initial result binds canonical client');
        Assert.areEqual(CardstackConnectionSetupRepository.versions(),attempt.versions,'Initial result binds server contract versions');
        Map<String,Object> initial=(Map<String,Object>)JSON.deserializeUntyped(JSON.serialize(attempt));
        Assert.areEqual(new Set<String>{'attemptKey','challenge','expiresAt','configurationRevision','resourceUri','fixture','client','versions'},initial.keySet(),'Exact transient UI contract');
        Assert.areEqual(64,attempt.challenge.length(),'UI receives transient challenge');
        Assert.areEqual(64,attempt.attemptKey.length(),'UI receives transient key');
        String modelVisible=JSON.serialize(response.get('content'))+JSON.serialize(response.get('structuredContent'));
        Assert.isFalse(modelVisible.contains(attempt.challenge),'No model-visible challenge');
        Assert.isFalse(modelVisible.contains(attempt.attemptKey),'No model-visible key');
        Assert.areEqual('awaitingEcho',((Map<String,Object>)response.get('structuredContent')).get('status'),'No premature pass');
    }
    @IsTest static void echoReturnsSafeExactReceipt() {
        configureDiagnostic(); CardstackConnectionAccess.userOverride=true;
        CardstackConnectionTypes.DiagnosticOpen attempt=CardstackConnectionDiagnostics.open('claude');
        Test.startTest(); Map<String,Object> response=result(call('tools/call',new Map<String,Object>{'name'=>'cardstack_connection_echo',
            'arguments'=>new Map<String,Object>{'attemptKey'=>attempt.attemptKey,'challenge'=>attempt.challenge,'values'=>attempt.fixture}})); Test.stopTest();
        CardstackConnectionTypes.DiagnosticReceipt receipt=(CardstackConnectionTypes.DiagnosticReceipt)response.get('structuredContent');
        Assert.areEqual(attempt.fixture,receipt.values,'Exact returned values');
        Assert.isTrue(receipt.exactValues,'Server comparison passed');
        Assert.isFalse(JSON.serialize(response).contains(attempt.challenge),'No challenge in response');
        Assert.isFalse(JSON.serialize(response).contains(attempt.attemptKey),'No key in response');
    }
    @IsTest static void rejectedEchoDoesNotReflectInput() {
        Test.startTest(); Map<String,Object> response=result(call('tools/call',new Map<String,Object>{'name'=>'cardstack_connection_echo',
            'arguments'=>new Map<String,Object>{'attemptKey'=>'synthetic-key','challenge'=>'synthetic-challenge','values'=>new Map<String,Object>()}})); Test.stopTest();
        Assert.areEqual(true,response.get('isError'),'Rejected tool');
        Assert.isFalse(JSON.serialize(response).contains('synthetic-challenge'),'No reflected input');
    }
    @IsTest static void routeMismatchCannotSubmit() {
        configureDiagnostic(); CardstackConnectionAccess.userOverride=true;
        CardstackConnectionTypes.DiagnosticOpen attempt=CardstackConnectionDiagnostics.open('claude');
        Test.startTest(); Map<String,Object> response=CardstackMcpDispatcher.handle('chatgpt',new Map<String,Object>{
            'jsonrpc'=>'2.0','id'=>'request-1','method'=>'tools/call','params'=>new Map<String,Object>{'name'=>'cardstack_connection_echo',
            'arguments'=>new Map<String,Object>{'attemptKey'=>attempt.attemptKey,'challenge'=>attempt.challenge,'values'=>attempt.fixture}}});
        Assert.areEqual(0,Limits.getDmlStatements(),'Wrong route cannot transition'); Test.stopTest();
        Assert.areEqual(true,result(response).get('isError'),'Cross-client echo denied');
    }
    @IsTest static void unknownMethod32601() {
        Test.startTest(); Map<String,Object> response = call('Tools/list', null); Test.stopTest(); error(response, -32601, 'Unknown method');
    }
    @IsTest static void legacyCrmToolRejected() {
        Test.startTest(); Map<String,Object> response = call('tools/call', new Map<String,Object>{'name'=>'crm_search'}); Test.stopTest(); error(response, -32602, 'Invalid tool params');
    }
    @IsTest static void wrongResourceRejected() {
        Test.startTest(); Map<String,Object> response = call('resources/read', new Map<String,Object>{'uri'=>'ui://cardstack/other.html'}); Test.stopTest(); error(response, -32602, 'Unknown resource');
    }
    @IsTest static void arrayParamsRejected() {
        Test.startTest(); Map<String,Object> response = call('ping', new List<Object>()); Test.stopTest(); error(response, -32602, 'Invalid params');
    }
    @IsTest static void missingProtocolVersionRejected() {
        Test.startTest(); Map<String,Object> response = call('initialize', null); Test.stopTest(); error(response, -32602, 'Invalid protocol version');
    }
    @IsTest static void malformedNotificationRejected() {
        CardstackConnectionAccess.userOverride = true; Test.startTest();
        Map<String,Object> response = CardstackMcpDispatcher.handle('claude', new Map<String,Object>{'jsonrpc'=>'2.0','method'=>'ping','params'=>false});
        Test.stopTest(); Assert.areEqual(-32602, ((Map<String,Object>)response.get('error')).get('code'), 'Malformed params are not a notification');
    }
    @IsTest static void invalidEnvelopePreservesValidId() {
        CardstackConnectionAccess.userOverride = true; Test.startTest();
        Map<String,Object> response = CardstackMcpDispatcher.handle('claude', new Map<String,Object>{'jsonrpc'=>'wrong','id'=>0,'method'=>'ping'});
        Test.stopTest(); Assert.areEqual(0, response.get('id'), 'Valid numeric ID retained');
        Assert.areEqual(-32600, ((Map<String,Object>)response.get('error')).get('code'), 'Invalid request');
    }
    @IsTest static void nullRequestIdRejected() {
        CardstackConnectionAccess.userOverride = true; Test.startTest();
        Map<String,Object> response = CardstackMcpDispatcher.handle('claude', new Map<String,Object>{'jsonrpc'=>'2.0','id'=>null,'method'=>'ping'});
        Test.stopTest(); Assert.isNull(response.get('id'), 'Invalid null ID');
        Assert.areEqual(-32600, ((Map<String,Object>)response.get('error')).get('code'), 'MCP requests require string or numeric ID');
    }
    @IsTest static void invalidIdIsNotReflected() {
        CardstackConnectionAccess.userOverride = true; Test.startTest();
        Map<String,Object> response = CardstackMcpDispatcher.handle('claude', new Map<String,Object>{'jsonrpc'=>'2.0','id'=>false,'method'=>'ping'});
        Test.stopTest(); Assert.isNull(response.get('id'), 'Invalid ID sanitized');
        Assert.areEqual(-32600, ((Map<String,Object>)response.get('error')).get('code'), 'Invalid request');
    }
    @IsTest static void dispatcherRequiresPermission() {
        CardstackConnectionAccess.userOverride = false; Test.startTest();
        try { CardstackMcpDispatcher.handle('claude', new Map<String,Object>()); Assert.fail('Private dispatcher still gates named callers'); }
        catch(CardstackConnectionTypes.ConnectionException e) { Assert.areEqual('NOT_AUTHORIZED', e.getMessage(), 'No direct bypass'); }
        Test.stopTest();
    }
    @IsTest static void legacyDiagnosticsUnchanged() {
        Test.startTest(); Map<String,Object> initialized = result(call('initialize',new Map<String,Object>{'protocolVersion'=>'2025-06-18'}));
        Assert.areEqual(new Map<String,Object>{'name'=>'Cardstack connection diagnostics','version'=>'1.0.0'},initialized.get('serverInfo'),'Diagnostic package/contract label never bumped for product artifact');
        Map<String,Object> listed = result(call('tools/list',null)); List<Object> tools = (List<Object>)listed.get('tools');
        Assert.areEqual('cardstack_connection_diagnostic',((Map<String,Object>)tools[0]).get('name'),'Existing diagnostic first');
        Assert.areEqual('cardstack_connection_echo',((Map<String,Object>)tools[1]).get('name'),'Existing app echo second');
        error(call('tools/call',new Map<String,Object>{'name'=>'crm_update_record','arguments'=>new Map<String,Object>()}),-32602,'Invalid tool params'); Test.stopTest();
    }
    @IsTest static void shouldRouteDiscoveryWithoutWriteAuthority() {
        CardstackRecordMcpAdapter.resourceOverrideEnabled=true; CardstackRecordMcpAdapter.resourceOverride=Blob.valueOf('abc');
        Test.startTest();
        List<Object> descriptors=(List<Object>)result(call('tools/list',null)).get('tools');
        Map<String,Object> search;
        for(Object row:descriptors) if('cardstack_record_search'.equals(((Map<String,Object>)row).get('name'))) search=(Map<String,Object>)row;
        Assert.isNotNull(search,'Natural record discovery is advertised.');
        Assert.areEqual(true,((Map<String,Object>)search.get('annotations')).get('readOnlyHint'),'Search never writes.');
        Integer writes=Limits.getDmlStatements();
        Map<String,Object> rejected=result(call('tools/call',new Map<String,Object>{'name'=>'cardstack_record_search','arguments'=>new Map<String,Object>()}));
        Assert.areEqual('record-discovery/v1',((Map<String,Object>)rejected.get('structuredContent')).get('contractVersion'),'Closed argument rejection came from discovery adapter.');
        Assert.areEqual(writes,Limits.getDmlStatements(),'Discovery cannot authorize or execute DML.'); Test.stopTest();
    }
    @IsTest static void productToolsRouteExactNamesOnly() {
        CardstackOpportunityMcpAdapter.resourceOverrideEnabled=true; CardstackOpportunityMcpAdapter.resourceOverride=Blob.valueOf('abc');
        CardstackRecordMcpAdapter.resourceOverrideEnabled=true; CardstackRecordMcpAdapter.resourceOverride=Blob.valueOf('abc');
        Test.startTest(); List<Object> tools = (List<Object>)result(call('tools/list',null)).get('tools');
        Assert.areEqual(16,tools.size(),'All six legacy plus four generic descriptors included');
        List<String> names = new List<String>{'cardstack_opportunity_open','cardstack_opportunity_edit_start','cardstack_opportunity_edit_transition','cardstack_opportunity_refresh'};
        for(Integer index=0;index<names.size();index++) { Assert.areEqual(names[index],((Map<String,Object>)tools[index+2]).get('name'),'Exact registered product names'); }
        List<String> genericNames=new List<String>{'cardstack_record_open','cardstack_record_edit_start','cardstack_record_edit_transition','cardstack_record_refresh'};
        for(Integer index=0;index<genericNames.size();index++) {
            Map<String,Object> descriptor=(Map<String,Object>)tools[index+6];
            Assert.areEqual(genericNames[index],descriptor.get('name'),'Exact additive generic tool names');
            Map<String,Object> schema=(Map<String,Object>)descriptor.get('inputSchema');
            Assert.areEqual(false,schema.get('additionalProperties'),'Generic ingress keeps closed schemas');
            Map<String,Object> meta=(Map<String,Object>)descriptor.get('_meta'),ui=(Map<String,Object>)meta.get('ui');
            if(index==0) {
                Assert.areEqual('ui://cardstack/record-edit-v1-sha256-ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad.html',ui.get('resourceUri'),'Generic Open keeps its current native resource');
                Assert.areEqual(ui.get('resourceUri'),meta.get('openai/outputTemplate'),'Generic Open compatibility template matches its native resource');
            } else {
                Assert.isFalse(ui.containsKey('resourceUri'),'Generic helpers are data tools without widget render metadata');
                Assert.isFalse(meta.containsKey('openai/outputTemplate'),'Generic helpers cannot advertise compatibility rendering');
            }
            Assert.areEqual(index==0?new List<String>{'model','app'}:new List<String>{'app'},ui.get('visibility'),'Only generic Open is model-visible');
            Assert.areEqual(true,meta.get('openai/widgetAccessible'),'Generic Open and helpers remain app callable');
        }
        error(call('tools/call',new Map<String,Object>{'name'=>'Cardstack_record_open'}),-32602,'Invalid tool params');
        error(call('tools/call',new Map<String,Object>{'name'=>'cardstack_record_confirm'}),-32602,'Invalid tool params');
        error(call('tools/call',new Map<String,Object>{'name'=>'Cardstack_opportunity_open'}),-32602,'Invalid tool params');
        error(call('tools/call',new Map<String,Object>{'name'=>'cardstack_opportunity_confirm'}),-32602,'Invalid tool params'); Test.stopTest();
    }
    @IsTest static void productResourceMissingNeverReturnsPlaceholder() {
        CardstackOpportunityMcpAdapter.resourceOverrideEnabled=true;
        Test.startTest(); error(call('resources/read',new Map<String,Object>{'uri'=>'ui://cardstack/opportunity-edit-v1.html'}),-32603,'Opportunity UI unavailable');
        error(call('resources/read',new Map<String,Object>{'uri'=>'ui://cardstack/opportunity-edit-v1.html?redirect=x'}),-32602,'Unknown resource'); Test.stopTest();
    }
    @IsTest static void guestDeniedBeforeProductDispatch() {
        CardstackConnectionAccess.userOverride=false; Test.startTest();
        try { CardstackMcpDispatcher.handle('claude',new Map<String,Object>{'jsonrpc'=>'2.0','id'=>'request-1','method'=>'tools/call',
            'params'=>new Map<String,Object>{'name'=>'cardstack_opportunity_open','arguments'=>new Map<String,Object>()}}); Assert.fail('Ingress authorization precedes product dispatch'); }
        catch(CardstackConnectionTypes.ConnectionException failure) { Assert.areEqual('NOT_AUTHORIZED',failure.getMessage(),'Named-user gate unchanged'); }
        Assert.areEqual(0,Limits.getQueries(),'No CRM/private read before named permission'); Assert.areEqual(0,Limits.getDmlRows(),'No mutation before named permission'); Test.stopTest();
    }
    private static void error(Map<String,Object> response, Integer code, String message) {
        Assert.areEqual('request-1', response.get('id'), 'Error retains request ID');
        Assert.areEqual(new Map<String,Object>{'code'=>code,'message'=>message}, response.get('error'), 'Deterministic sanitized error');
    }
}
