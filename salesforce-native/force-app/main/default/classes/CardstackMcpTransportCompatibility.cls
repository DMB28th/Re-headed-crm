/** Exact synthetic aliases retained only for chats on the existing direct connection. */
public with sharing class CardstackMcpTransportCompatibility {
    private static final String URI = 'ui://cardstack/apex-transport-probe.html';
    private static final String OPEN = 'open_cardstack_apex_probe';
    private static final String ECHO = 'echo_cardstack_values';
    private static final String RESOURCE = 'CardstackMcpTransportProbeUi';
    private static final String MIME = 'text/html;profile=mcp-app';
    private static final Map<String,String> TYPES = new Map<String,String>{'text'=>'string','amount'=>'number','accepted'=>'boolean','choice'=>'string','rating'=>'string','notes'=>'string','enabled'=>'boolean'};
    @TestVisible private static Boolean resourceOverrideEnabled = false;
    @TestVisible private static Blob resourceOverride;
    /** Identify only exact old names; caller must still validate the full protocol envelope. */
    public static Boolean accepts(Map<String,Object> request) {
        if(request == null || !(request.get('params') instanceof Map<String,Object>)) return false;
        Map<String,Object> params = (Map<String,Object>)request.get('params');
        return ('tools/call'.equals(request.get('method')) && (OPEN.equals(params.get('name')) || ECHO.equals(params.get('name')))) ||
            ('resources/read'.equals(request.get('method')) && URI.equals(params.get('uri')));
    }
    /** Add compatibility descriptors to the shared dispatcher result on this route only. */
    public static void appendCatalog(Map<String,Object> request, Map<String,Object> response) {
        CardstackConnectionAccess.requireUser();
        Map<String,Object> result = (Map<String,Object>)response.get('result');
        if('tools/list'.equals(request.get('method'))) {
            Map<String,Object> properties = new Map<String,Object>();
            for(String key : TYPES.keySet()) properties.put(key, new Map<String,Object>{'type'=>TYPES.get(key)});
            List<Object> tools = (List<Object>)result.get('tools');
            tools.add(tool(OPEN, 'Render the retained synthetic seven-field UI. No CRM operations.', new Map<String,Object>{'type'=>'object','properties'=>new Map<String,Object>(),'additionalProperties'=>false}, true));
            tools.add(tool(ECHO, 'Echo exact synthetic values only. No CRM operations.', new Map<String,Object>{'type'=>'object','properties'=>properties,'additionalProperties'=>false}, false));
        } else if('resources/list'.equals(request.get('method'))) {
            ((List<Object>)result.get('resources')).add(new Map<String,Object>{'uri'=>URI,'name'=>'cardstack_apex_transport_probe','mimeType'=>MIME});
        }
    }
    /** Bounded synthetic-only calls after authoritative ingress and dispatcher validation. */
    public static Map<String,Object> handle(Map<String,Object> request) {
        CardstackConnectionAccess.requireUser();
        if(!accepts(request)) return CardstackMcpDispatcher.error(request == null ? null : request.get('id'), -32602, 'Unknown synthetic alias');
        Object id = request.get('id'); Map<String,Object> params = (Map<String,Object>)request.get('params');
        if('resources/read'.equals(request.get('method'))) {
            Object resource = resourceResult();
            return resource == null ? CardstackMcpDispatcher.error(id, -32603, 'Synthetic UI unavailable') : success(id,resource);
        }
        if(params.containsKey('arguments') && !(params.get('arguments') instanceof Map<String,Object>)) return CardstackMcpDispatcher.error(id, -32602, 'Invalid tool params');
        Map<String,Object> args = params.containsKey('arguments') ? (Map<String,Object>)params.get('arguments') : new Map<String,Object>();
        if(OPEN.equals(params.get('name'))) {
            if(!args.isEmpty()) return CardstackMcpDispatcher.error(id, -32602, 'Unexpected arguments');
            return success(id,toolResult('Disposable Salesforce-hosted custom UI probe; no CRM writes.', new Map<String,Object>{'status'=>'ready'}));
        }
        if(!validEcho(args)) return CardstackMcpDispatcher.error(id, -32602, 'Invalid argument type or size');
        return success(id,toolResult('Exact synthetic values received; no CRM writes.',args));
    }
    private static Boolean validEcho(Map<String,Object> args) {
        for(String key : args.keySet()) {
            if(!TYPES.containsKey(key)) return false;
            Object value = args.get(key); String type = TYPES.get(key);
            if(value == null || (type.equals('string') && (!(value instanceof String) || ((String)value).length() > 1000)) ||
                (type.equals('boolean') && !(value instanceof Boolean)) ||
                (type.equals('number') && !(value instanceof Decimal) && !(value instanceof Integer) && !(value instanceof Long) && !(value instanceof Double))) return false;
        }
        return true;
    }
    private static Map<String,Object> tool(String name, String description, Map<String,Object> schema, Boolean interactive) {
        Map<String,Object> meta = interactive ? new Map<String,Object>{'ui'=>new Map<String,Object>{'resourceUri'=>URI},'openai/outputTemplate'=>URI,'openai/widgetAccessible'=>true} : new Map<String,Object>{'ui'=>new Map<String,Object>{'visibility'=>new List<Object>{'app'}}};
        return new Map<String,Object>{'name'=>name,'description'=>description,'inputSchema'=>schema,'_meta'=>meta,
            'annotations'=>new Map<String,Object>{'readOnlyHint'=>true,'destructiveHint'=>false,'openWorldHint'=>false}};
    }
    private static Object resourceResult() {
        Blob body;
        if(Test.isRunningTest() && resourceOverrideEnabled) body = resourceOverride;
        else {
            try {
                List<StaticResource> rows = [SELECT Body FROM StaticResource WHERE Name = :RESOURCE WITH USER_MODE LIMIT 1];
                body = rows.isEmpty() ? null : rows[0].Body;
            } catch(QueryException e) { return null; }
        }
        if(body == null || body.size() == 0) return null;
        String html;
        try { html = body.toString(); } catch(StringException e) { return null; }
        Map<String,Object> csp = new Map<String,Object>{'connectDomains'=>new List<Object>(),'resourceDomains'=>new List<Object>(),'frameDomains'=>new List<Object>()};
        return new Map<String,Object>{'contents'=>new List<Object>{new Map<String,Object>{'uri'=>URI,'mimeType'=>MIME,'text'=>html,
            '_meta'=>new Map<String,Object>{'ui'=>new Map<String,Object>{'csp'=>csp},'openai/widgetCSP'=>new Map<String,Object>{'connect_domains'=>new List<Object>(),'resource_domains'=>new List<Object>()}}}}};
    }
    private static Map<String,Object> toolResult(String message, Object structured) {
        return new Map<String,Object>{'content'=>new List<Object>{new Map<String,Object>{'type'=>'text','text'=>message}},'structuredContent'=>structured};
    }
    private static Map<String,Object> success(Object id, Object result) { return new Map<String,Object>{'jsonrpc'=>'2.0','id'=>id,'result'=>result}; }
}
