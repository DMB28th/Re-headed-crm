/**
 * Private named MCP service: existing diagnostics and exact governed product routes.
 * No direct permission-set/guest grant. Product adapter is fail-closed until native RED.
 */
public with sharing class CardstackMcpDispatcher {
    private static final String RESOURCE_URI = 'ui://cardstack/connection-diagnostic-v1.html';
    private static final String RESOURCE_NAME = 'CardstackConnectionDiagnosticUi';
    private static final String MIME = 'text/html;profile=mcp-app';
    private static final String OPEN_TOOL = 'cardstack_connection_diagnostic';
    private static final String ECHO_TOOL = 'cardstack_connection_echo';
    @TestVisible private static Boolean resourceOverrideEnabled = false;
    @TestVisible private static Blob resourceOverride;

    /**
     * @param client Exact canonical client; this is routing, not OAuth app attestation.
     * @param request Decoded single JSON-RPC object after the ingress byte limit.
     * @return Typed protocol envelope, or null for a valid notification.
     */
    public static Map<String,Object> handle(String client, Map<String,Object> request) {
        CardstackConnectionAccess.requireUser();
        CardstackConnectionTypes.requireClient(client);
        Object id = request == null ? null : request.get('id');
        Boolean validId = request != null && (!request.containsKey('id') || id instanceof String || numberValue(id));
        if(request == null || !(request.get('jsonrpc') instanceof String) || !'2.0'.equals((String)request.get('jsonrpc')) || !(request.get('method') instanceof String) ||
            String.isBlank((String)request.get('method')) || !validId) {
            return error(validId ? id : null, -32600, 'Invalid protocol request');
        }
        if(request.containsKey('params') && !(request.get('params') instanceof Map<String,Object>)) return error(id, -32602, 'Invalid params');
        // Validate the envelope before acknowledging a notification. Never emit JSON null.
        if(!request.containsKey('id')) return null;
        Map<String,Object> params = request.containsKey('params') ? (Map<String,Object>)request.get('params') : new Map<String,Object>();
        return dispatch(client, id, (String)request.get('method'), params);
    }
    private static Map<String,Object> dispatch(String client, Object id, String method, Map<String,Object> params) {
        if(method.equals('initialize')) return initialize(id, params);
        if(method.equals('ping')) return success(id, new Map<String,Object>());
        if(method.equals('tools/list')) return success(id, toolList());
        if(method.equals('tools/call')) return toolCall(client, id, params);
        if(method.equals('resources/list')) return success(id, resourceList());
        if(method.equals('resources/read')) {
            if(params.get('uri') instanceof String && CardstackRecordMcpAdapter.acceptsResourceUri((String)params.get('uri'))) {
                Object productResource=CardstackRecordMcpAdapter.readResource((String)params.get('uri'));
                if(productResource == null && !CardstackRecordMcpAdapter.isLegacyResourceUri((String)params.get('uri'))) return error(id,-32602,'Unknown resource');
                return productResource==null ? error(id,-32603,'Record UI unavailable') : success(id,productResource);
            }
            if(params.get('uri') instanceof String && CardstackOpportunityMcpAdapter.acceptsResourceUri((String)params.get('uri'))) {
                Object productResource = CardstackOpportunityMcpAdapter.readResource((String)params.get('uri'));
                if(productResource == null && !CardstackOpportunityMcpAdapter.isLegacyResourceUri((String)params.get('uri'))) return error(id,-32602,'Unknown resource');
                return productResource == null ? error(id, -32603, 'Opportunity UI unavailable') : success(id, productResource);
            }
            if(!(params.get('uri') instanceof String) || !RESOURCE_URI.equals((String)params.get('uri'))) return error(id, -32602, 'Unknown resource');
            Object resource = resourceResult();
            return resource == null ? error(id, -32603, 'Connection UI unavailable') : success(id, resource);
        }
        return error(id, -32601, 'Unknown method');
    }
    private static Map<String,Object> resourceList() {
        List<Object> resources=new List<Object>{new Map<String,Object>{'uri'=>RESOURCE_URI,'name'=>OPEN_TOOL,'mimeType'=>MIME}};
        String recordUri=CardstackRecordMcpAdapter.resourceUri(),opportunityUri=CardstackOpportunityMcpAdapter.resourceUri();
        if(recordUri != null) resources.add(new Map<String,Object>{'uri'=>recordUri,'name'=>'cardstack_record_open','mimeType'=>MIME});
        if(opportunityUri != null) resources.add(new Map<String,Object>{'uri'=>opportunityUri,'name'=>'cardstack_opportunity_open','mimeType'=>MIME});
        return new Map<String,Object>{'resources'=>resources};
    }
    private static Map<String,Object> initialize(Object id, Map<String,Object> params) {
        if(!(params.get('protocolVersion') instanceof String)) return error(id, -32602, 'Invalid protocol version');
        String version = (String)params.get('protocolVersion');
        if(!version.equals('2025-06-18') && !version.equals('2025-11-25')) version = '2025-06-18';
        return success(id, new Map<String,Object>{'protocolVersion'=>version,
            'serverInfo'=>new Map<String,Object>{'name'=>'Cardstack connection diagnostics','version'=>'1.0.0'},
            'capabilities'=>new Map<String,Object>{'tools'=>new Map<String,Object>(),'resources'=>new Map<String,Object>(),
                'extensions'=>new Map<String,Object>{'io.modelcontextprotocol/ui'=>new Map<String,Object>()}}});
    }
    private static Map<String,Object> toolList() {
        Map<String,Object> openSchema = new Map<String,Object>{'type'=>'object','properties'=>new Map<String,Object>(),'additionalProperties'=>false};
        Map<String,Object> echoSchema = new Map<String,Object>{'type'=>'object','properties'=>new Map<String,Object>{
            'attemptKey'=>new Map<String,Object>{'type'=>'string'},'challenge'=>new Map<String,Object>{'type'=>'string'},
            'values'=>new Map<String,Object>{'type'=>'object'}},
            'required'=>new List<String>{'attemptKey','challenge','values'},'additionalProperties'=>false};
        List<Object> tools = new List<Object>{
            tool(OPEN_TOOL, 'Open a synthetic connection exchange; actual host readiness requires separate evidence.', openSchema, true),
            tool(ECHO_TOOL, 'Submit the exact synthetic fixture from the app. This is not host attestation.', echoSchema, false)};
        String opportunityUri=CardstackOpportunityMcpAdapter.resourceUri(),recordUri=CardstackRecordMcpAdapter.resourceUri();
        tools.addAll(CardstackOpportunityMcpAdapter.tools(opportunityUri));
        tools.addAll(CardstackRecordMcpAdapter.tools(recordUri));
        tools.addAll(CardstackRecordDiscoveryMcpAdapter.tools(recordUri));
        tools.addAll(CardstackRelatedListMcpAdapter.tools(recordUri));
        tools.addAll(CardstackFlowMcpAdapter.toolDefinitions());
        return new Map<String,Object>{'tools'=>tools};
    }
    private static Map<String,Object> tool(String name, String description, Map<String,Object> schema, Boolean interactive) {
        Map<String,Object> ui = interactive ? new Map<String,Object>{'resourceUri'=>RESOURCE_URI,'visibility'=>new List<String>{'model','app'}} :
            new Map<String,Object>{'visibility'=>new List<String>{'app'}};
        Map<String,Object> meta = new Map<String,Object>{'ui'=>ui};
        if(interactive) { meta.put('openai/outputTemplate', RESOURCE_URI); meta.put('openai/widgetAccessible', true); }
        return new Map<String,Object>{'name'=>name,'description'=>description,'inputSchema'=>schema,'_meta'=>meta,
            'annotations'=>new Map<String,Object>{'readOnlyHint'=>false,'destructiveHint'=>false,'openWorldHint'=>false}};
    }
    private static Map<String,Object> toolCall(String client, Object id, Map<String,Object> params) {
        if(!(params.get('name') instanceof String) ||
            (params.containsKey('arguments') && !(params.get('arguments') instanceof Map<String,Object>))) return error(id, -32602, 'Invalid tool params');
        Map<String,Object> args = params.containsKey('arguments') ? (Map<String,Object>)params.get('arguments') : new Map<String,Object>();
        String name = (String)params.get('name');
        if('cardstack_record_flow_start'.equals(name) || 'cardstack_record_flow_transition'.equals(name)) return success(id,CardstackFlowMcpAdapter.call(client,name,args));
        if(CardstackRelatedListMcpAdapter.handles(name)) return success(id,CardstackRelatedListMcpAdapter.call(client,name,args));
        if(CardstackRecordDiscoveryMcpAdapter.handles(name)) return success(id,CardstackRecordDiscoveryMcpAdapter.call(client,name,args));
        if('cardstack_record_open'.equals(name) || 'cardstack_record_edit_start'.equals(name) ||
            'cardstack_record_edit_transition'.equals(name) || 'cardstack_record_refresh'.equals(name)) {
            return success(id,CardstackRecordMcpAdapter.call(client,name,args));
        }
        if('cardstack_opportunity_open'.equals(name) || 'cardstack_opportunity_edit_start'.equals(name) ||
            'cardstack_opportunity_edit_transition'.equals(name) || 'cardstack_opportunity_refresh'.equals(name)) {
            return success(id, CardstackOpportunityMcpAdapter.call(client, name, args));
        }
        if((OPEN_TOOL.equals(name) && !args.isEmpty()) ||
            (ECHO_TOOL.equals(name) && !validEchoArguments(args)) ||
            (!OPEN_TOOL.equals(name) && !ECHO_TOOL.equals(name))) return error(id, -32602, 'Invalid tool params');
        try {
            if(OPEN_TOOL.equals(name)) {
                CardstackConnectionTypes.DiagnosticOpen attempt = CardstackConnectionDiagnostics.open(client);
                Map<String,Object> result = toolResult('Complete the synthetic exchange in the connection UI.',
                    new Map<String,Object>{'status'=>'awaitingEcho','resourceUri'=>RESOURCE_URI,
                        'configurationRevision'=>attempt.configurationRevision,'expiresAt'=>attempt.expiresAt});
                // MCP result _meta is delivered to UI; raw challenge/key never enter model content.
                result.put('_meta', new Map<String,Object>{'cardstack/connectionDiagnostic'=>attempt});
                return success(id, result);
            }
            CardstackConnectionTypes.DiagnosticReceipt receipt = CardstackConnectionDiagnostics.echoForClient(client,
                (String)args.get('attemptKey'), (String)args.get('challenge'), (Map<String,Object>)args.get('values'));
            return success(id, toolResult('Synthetic exact-value exchange passed. Client UI observation is separate.', receipt));
        } catch(CardstackConnectionTypes.ConnectionException e) {
            Map<String,Object> result = toolResult('Connection diagnostic request rejected.', new Map<String,Object>{'status'=>'rejected'});
            result.put('isError', true); return success(id, result);
        }
    }
    private static Map<String,Object> toolResult(String message, Object structured) {
        return new Map<String,Object>{'content'=>new List<Object>{new Map<String,Object>{'type'=>'text','text'=>message}},'structuredContent'=>structured};
    }
    private static Boolean validEchoArguments(Map<String,Object> args) {
        return args.keySet().equals(new Set<String>{'attemptKey','challenge','values'}) &&
            args.get('attemptKey') instanceof String && args.get('challenge') instanceof String && args.get('values') instanceof Map<String,Object>;
    }
    private static Blob resourceBody() {
        if(Test.isRunningTest() && resourceOverrideEnabled) return resourceOverride;
        try {
            List<StaticResource> resources = [SELECT Body FROM StaticResource WHERE Name = :RESOURCE_NAME WITH USER_MODE LIMIT 1];
            return resources.isEmpty() ? null : resources[0].Body;
        } catch(QueryException e) { return null; }
    }
    private static Object resourceResult() {
        Blob body = resourceBody();
        if(body == null || body.size() == 0) return null;
        String html;
        try { html = body.toString(); }
        catch(StringException e) { return null; }
        Map<String,Object> csp = new Map<String,Object>{'connectDomains'=>new List<Object>(),'resourceDomains'=>new List<Object>(),'frameDomains'=>new List<Object>()};
        return new Map<String,Object>{'contents'=>new List<Object>{new Map<String,Object>{'uri'=>RESOURCE_URI,'mimeType'=>MIME,'text'=>html,
            '_meta'=>new Map<String,Object>{'ui'=>new Map<String,Object>{'csp'=>csp},
                'openai/widgetCSP'=>new Map<String,Object>{'connect_domains'=>new List<Object>(),'resource_domains'=>new List<Object>()}}}}};
    }
    private static Boolean numberValue(Object value) {
        return value instanceof Integer || value instanceof Long || value instanceof Decimal || value instanceof Double;
    }
    private static Map<String,Object> success(Object id, Object result) {
        return new Map<String,Object>{'jsonrpc'=>'2.0','id'=>id,'result'=>result};
    }
    /**
     * Build a sanitized JSON-RPC error without private exception data.
     * @param id Valid caller id or null when unavailable.
     * @param code Standard protocol error code.
     * @param message Fixed public error text supplied by the boundary.
     * @return JSON-RPC error envelope.
     */
    public static Map<String,Object> error(Object id, Integer code, String message) {
        return new Map<String,Object>{'jsonrpc'=>'2.0','id'=>id,'error'=>new Map<String,Object>{'code'=>code,'message'=>message}};
    }
}
