/**
 * Disposable canonical-route synthetic MCP Apps fixture. No CRM IO, bearer access,
 * identity output, private setup reads, callouts, logs or diagnostic persistence.
 * Salesforce selects the actor; current Use permission is checked for every MCP call.
 */
@RestResource(urlMapping='/cardstack/v1/*')
global with sharing class CardstackCanonicalProbe {
    private static final String ROOT='/services/apexrest/cardstack/v1/';
    private static final String URI='ui://cardstack/apex-transport-probe.html';
    private static final String RESOURCE_NAME='CardstackCanonicalProbeUi';
    private static final String MIME='text/html;profile=mcp-app';
    private static final Integer MAX_BYTES=16384;
    private static final Map<String,String> TYPES=new Map<String,String>{'text'=>'string','amount'=>'number',
        'accepted'=>'boolean','choice'=>'string','rating'=>'string','notes'=>'string','enabled'=>'boolean'};
    // Source-test seams only. None is consulted outside Test.isRunningTest().
    @TestVisible private static Boolean testNamed;
    @TestVisible private static Boolean testUse;
    @TestVisible private static String testBase;
    @TestVisible private static String testPrefix;
    @TestVisible private static String testIssuer;
    @TestVisible private static Boolean testResourceMissing=false;

    /** Public metadata or authenticated method denial. */
    @HttpGet global static void get() { route('GET'); }
    /** Authenticated, bounded synthetic MCP request. */
    @HttpPost global static void post() { route('POST'); }
    /** Authenticated method denial; no session or record deletion. */
    @HttpDelete global static void remove() { route('DELETE'); }

    private static String siteBase() {
        return Test.isRunningTest() && testBase!=null ? testBase : Site.getBaseRequestUrl();
    }
    private static String sitePrefix() {
        String value=Test.isRunningTest() && testPrefix!=null ? testPrefix : Site.getPathPrefix();
        if(String.isBlank(value)) return '';
        return value.startsWith('/') ? value : '/'+value;
    }
    private static String issuer() {
        return Test.isRunningTest() && testIssuer!=null ? testIssuer : URL.getOrgDomainUrl().toExternalForm();
    }
    private static Boolean namedActor() {
        return Test.isRunningTest() && testNamed!=null ? testNamed : UserInfo.getUserType()!='Guest';
    }
    private static Boolean currentUse() {
        return Test.isRunningTest() && testUse!=null ? testUse : FeatureManagement.checkPermission('Cardstack_Use_Connections');
    }
    private static Boolean validContext(String base,String prefix,String orgIssuer) {
        // getBaseRequestUrl already includes the Site prefix. Never append it twice.
        if(base==null || orgIssuer==null || !Pattern.matches('https://[A-Za-z0-9.-]+',orgIssuer)) return false;
        if(prefix!='' && !Pattern.matches('/[A-Za-z0-9_-]+',prefix)) return false;
        if(prefix=='' && !Pattern.matches('https://[A-Za-z0-9.-]+',base)) return false;
        if(prefix!='' && (!base.endsWith(prefix) || !Pattern.matches('https://[A-Za-z0-9.-]+',base.substring(0,base.length()-prefix.length())))) return false;
        return true;
    }
    private static String exactRoute(String requested,String prefix) {
        // Repaired public-context fixture documented these four internal URI forms.
        // Match whole strings; never endsWith(), URL-decode, trim or accept nested paths.
        if(String.isBlank(requested)) return null;
        for(String client:new List<String>{'claude','chatgpt'}) {
            for(String leaf:new List<String>{'mcp','metadata'}) {
                String relative='/cardstack/v1/'+client+'/'+leaf;
                String full=ROOT+client+'/'+leaf;
                if(requested.equals(full) || requested.equals(relative) ||
                    (prefix!='' && (requested.equals(prefix+full) || requested.equals(prefix+relative)))) return client+'/'+leaf;
            }
        }
        return null;
    }
    private static void route(String method) {
        RestContext.response.addHeader('Content-Type','application/json');
        RestContext.response.addHeader('Cache-Control','no-store');
        String prefix=sitePrefix();
        String path=exactRoute(RestContext.request.requestURI,prefix);
        if(path==null || (RestContext.request.params!=null && !RestContext.request.params.isEmpty())) {
            send(404,new Map<String,Object>{'error'=>'unknown_probe_route'});return;
        }
        String base=siteBase();String orgIssuer=issuer();
        if(!validContext(base,prefix,orgIssuer)) {send(503,new Map<String,Object>{'error'=>'public_context_unavailable'});return;}
        String client=path.substringBefore('/');
        if(path.endsWith('/metadata')) {
            if(method!='GET') {send(405,new Map<String,Object>{'error'=>'method_not_allowed'});return;}
            send(200,new Map<String,Object>{'resource'=>base+ROOT+client+'/mcp',
                'authorization_servers'=>new List<String>{orgIssuer},'scopes_supported'=>new List<String>{'api','refresh_token'},
                'bearer_methods_supported'=>new List<String>{'header'}});return;
        }
        if(!namedActor()) {
            RestContext.response.addHeader('WWW-Authenticate','Bearer resource_metadata="'+base+ROOT+client+'/metadata", scope="api refresh_token"');
            send(401,new Map<String,Object>{'error'=>'authentication_required'});return;
        }
        if(!currentUse()) {send(403,new Map<String,Object>{'error'=>'cardstack_use_required'});return;}
        if(method!='POST') {send(405,new Map<String,Object>{'error'=>'method_not_allowed'});return;}
        Map<String,Object> response=readRequest();
        if(response==null) {RestContext.response.statusCode=202;RestContext.response.responseBody=null;return;}
        send(200,response);
    }
    private static Map<String,Object> readRequest() {
        Blob body=RestContext.request.requestBody;
        if(body!=null && body.size()>MAX_BYTES) return error(null,-32600,'Request exceeds synthetic probe limit');
        Object parsed;
        try {parsed=JSON.deserializeUntyped(body==null ? '' : body.toString());}
        catch(JSONException e) {return error(null,-32700,'Invalid JSON request');}
        catch(StringException e) {return error(null,-32700,'Invalid JSON request');}
        if(!(parsed instanceof Map<String,Object>)) return error(null,-32600,'Invalid protocol request');
        return dispatch((Map<String,Object>)parsed);
    }
    private static Boolean numberValue(Object value) {
        return value instanceof Decimal || value instanceof Integer || value instanceof Long || value instanceof Double;
    }
    private static Map<String,Object> dispatch(Map<String,Object> request) {
        Object id=request.get('id');
        if(request.get('jsonrpc')!='2.0' || !(request.get('method') instanceof String) ||
            (id!=null && !(id instanceof String) && !numberValue(id))) return error(null,-32600,'Invalid protocol request');
        if(!request.containsKey('id')) return null;
        if(request.get('params')!=null && !(request.get('params') instanceof Map<String,Object>)) return error(id,-32602,'Invalid params');
        Map<String,Object> params=request.get('params')==null ? new Map<String,Object>() : (Map<String,Object>)request.get('params');
        String method=(String)request.get('method');Object result;
        if(method.equals('initialize')) {
            if(!(params.get('protocolVersion') instanceof String)) return error(id,-32602,'Invalid protocol version');
            String version=(String)params.get('protocolVersion');
            if(!version.equals('2025-06-18') && !version.equals('2025-11-25')) version='2025-06-18';
            result=new Map<String,Object>{'protocolVersion'=>version,
                'serverInfo'=>new Map<String,Object>{'name'=>'Cardstack canonical synthetic probe','version'=>'0.0.1'},
                'capabilities'=>new Map<String,Object>{'tools'=>new Map<String,Object>(),'resources'=>new Map<String,Object>(),
                    'extensions'=>new Map<String,Object>{'io.modelcontextprotocol/ui'=>new Map<String,Object>()}}};
        } else if(method.equals('ping')) result=new Map<String,Object>();
        else if(method.equals('tools/list')) result=toolList();
        else if(method.equals('tools/call')) return toolCall(id,params);
        else if(method.equals('resources/list')) result=new Map<String,Object>{'resources'=>new List<Object>{
            new Map<String,Object>{'uri'=>URI,'name'=>'cardstack_apex_transport_probe','mimeType'=>MIME}}};
        else if(method.equals('resources/read')) {
            if(!(params.get('uri') instanceof String) || !URI.equals((String)params.get('uri'))) return error(id,-32602,'Unknown resource');
            result=resourceResult();
            if(result==null) return error(id,-32603,'Synthetic UI unavailable');
        } else return error(id,-32601,'Unknown method');
        return success(id,result);
    }
    private static Map<String,Object> toolList() {
        Map<String,Object> properties=new Map<String,Object>();
        for(String key:TYPES.keySet()) properties.put(key,new Map<String,Object>{'type'=>TYPES.get(key)});
        return new Map<String,Object>{'tools'=>new List<Object>{
            tool('open_cardstack_apex_probe','Render disposable seven-field Salesforce-hosted UI. Synthetic values only.',
                new Map<String,Object>{'type'=>'object','properties'=>new Map<String,Object>(),'additionalProperties'=>false},true),
            tool('echo_cardstack_values','Echo exact seven typed synthetic values; no CRM access.',
                new Map<String,Object>{'type'=>'object','properties'=>properties,'required'=>new List<String>{'text','amount','accepted','choice','rating','notes','enabled'},'additionalProperties'=>false},false)}};
    }
    private static Map<String,Object> tool(String name,String description,Map<String,Object> schema,Boolean interactive) {
        Map<String,Object> ui=interactive ? new Map<String,Object>{'resourceUri'=>URI,'visibility'=>new List<String>{'model','app'}} :
            new Map<String,Object>{'visibility'=>new List<String>{'app'}};
        Map<String,Object> meta=new Map<String,Object>{'ui'=>ui};
        if(interactive) {meta.put('openai/outputTemplate',URI);meta.put('openai/widgetAccessible',true);}
        return new Map<String,Object>{'name'=>name,'description'=>description,'inputSchema'=>schema,'_meta'=>meta,
            'annotations'=>new Map<String,Object>{'readOnlyHint'=>true,'destructiveHint'=>false,'openWorldHint'=>false}};
    }
    private static Map<String,Object> toolCall(Object id,Map<String,Object> params) {
        if(!(params.get('name') instanceof String) || (params.get('arguments')!=null && !(params.get('arguments') instanceof Map<String,Object>))) return error(id,-32602,'Invalid tool params');
        Map<String,Object> args=params.get('arguments')==null ? new Map<String,Object>() : (Map<String,Object>)params.get('arguments');
        if('open_cardstack_apex_probe'.equals((String)params.get('name'))) {
            if(!args.isEmpty()) return error(id,-32602,'Unexpected arguments');
            return success(id,toolResult('Disposable Salesforce-hosted synthetic UI; no CRM access.',new Map<String,Object>{'status'=>'ready'}));
        }
        if(!'echo_cardstack_values'.equals((String)params.get('name'))) return error(id,-32602,'Unknown tool');
        if(args.keySet()!=TYPES.keySet()) return error(id,-32602,'Exact seven arguments required');
        for(String key:TYPES.keySet()) {
            Object value=args.get(key);String type=TYPES.get(key);
            if(value==null || (type=='string' && (!(value instanceof String) || ((String)value).length()>1000)) ||
                (type=='boolean' && !(value instanceof Boolean)) || (type=='number' && !numberValue(value))) return error(id,-32602,'Invalid argument type or size');
        }
        return success(id,toolResult('Exact synthetic values received; no CRM writes.',args));
    }
    private static Map<String,Object> toolResult(String fallback,Map<String,Object> data) {
        return new Map<String,Object>{'content'=>new List<Object>{new Map<String,Object>{'type'=>'text','text'=>fallback}},'structuredContent'=>data};
    }
    private static Map<String,Object> resourceResult() {
        if(Test.isRunningTest() && testResourceMissing) return null;
        Blob body;
        try {
            List<StaticResource> resources=[SELECT Body FROM StaticResource WHERE Name=:RESOURCE_NAME WITH USER_MODE LIMIT 1];
            if(resources.isEmpty() || resources[0].Body==null) return null;
            body=resources[0].Body;
        } catch(QueryException e) {return null;}
        Map<String,Object> csp=new Map<String,Object>{'connectDomains'=>new List<Object>(),'resourceDomains'=>new List<Object>(),'frameDomains'=>new List<Object>()};
        return new Map<String,Object>{'contents'=>new List<Object>{new Map<String,Object>{'uri'=>URI,'mimeType'=>MIME,'text'=>body.toString(),
            '_meta'=>new Map<String,Object>{'ui'=>new Map<String,Object>{'csp'=>csp},
                'openai/widgetCSP'=>new Map<String,Object>{'connect_domains'=>new List<Object>(),'resource_domains'=>new List<Object>()}}}}};
    }
    private static Map<String,Object> success(Object id,Object result) {
        return new Map<String,Object>{'jsonrpc'=>'2.0','id'=>id,'result'=>result};
    }
    private static Map<String,Object> error(Object id,Integer code,String message) {
        return new Map<String,Object>{'jsonrpc'=>'2.0','id'=>id,'error'=>new Map<String,Object>{'code'=>code,'message'=>message}};
    }
    private static void send(Integer status,Object body) {
        RestContext.response.statusCode=status;RestContext.response.responseBody=Blob.valueOf(JSON.serialize(body));
    }
}
