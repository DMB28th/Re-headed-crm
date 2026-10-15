/** Disposable Salesforce Sites authentication feasibility probe. No CRM access. */
@RestResource(urlMapping='/cardstack-auth-site-probe/v1/*')
global with sharing class CardstackSiteAuthProbe {
    private static final String BASE = 'https://orgfarm-e768adf3fa-dev-ed.develop.my.salesforce-sites.com/cardstackauthprobe/services/apexrest/cardstack-auth-site-probe/v1';
    @HttpGet global static void get() { route(UserInfo.getUserType() != 'Guest', false); }
    @HttpPost global static void post() { route(UserInfo.getUserType() != 'Guest', true); }

    // The platform selects the actor. Never inspect, validate, or forward a bearer token.
    @TestVisible private static void route(Boolean authenticated, Boolean isPost) {
        RestContext.response.addHeader('Content-Type', 'application/json');
        RestContext.response.addHeader('Cache-Control', 'no-store');
        String path = RestContext.request.requestURI;
        System.debug(LoggingLevel.ERROR, 'CARDSTACK_SITE_AUTH_PROBE ' + JSON.serialize(new Map<String,Object>{'event'=>'entry','authenticated'=>authenticated,'isPost'=>isPost,'bodyBytes'=>RestContext.request.requestBody==null?0:RestContext.request.requestBody.size()}));
        Boolean uiRoute = path.endsWith('/ui-mcp');
        Boolean uiMetadata = path.endsWith('/ui-metadata');
        if (!isPost && (path.endsWith('/metadata') || uiMetadata)) {
            send(200, new Map<String,Object>{
                'resource' => BASE + (uiMetadata ? '/ui-mcp' : '/mcp'),
                'authorization_servers' => new List<String>{URL.getOrgDomainUrl().toExternalForm()},
                'scopes_supported' => new List<String>{'api', 'refresh_token'},
                'bearer_methods_supported' => new List<String>{'header'}
            });
            return;
        }
        if (!path.endsWith('/mcp') && !uiRoute && !path.endsWith('/identity')) {
            send(404, new Map<String,Object>{'error' => 'unknown_probe_route'});
            return;
        }
        if (!authenticated) {
            RestContext.response.addHeader('WWW-Authenticate', 'Bearer resource_metadata="' + BASE + (uiRoute ? '/ui-metadata' : '/metadata') + '", scope="api refresh_token"');
            send(401, new Map<String,Object>{'error' => 'authentication_required'});
            return;
        }
        if (path.endsWith('/identity')) {
            if (isPost) { send(405, new Map<String,Object>{'error' => 'method_not_allowed'}); return; }
            // Private API comparison only. This value is never part of a tool result.
            send(200, new Map<String,Object>{'actorDigest' => EncodingUtil.convertToHex(
                Crypto.generateDigest('SHA-256', Blob.valueOf(UserInfo.getUserId())))});
            return;
        }
        if (!isPost) { send(405, new Map<String,Object>{'error' => 'method_not_allowed'}); return; }
        if (uiRoute) {
            // Same Salesforce-selected named actor; no bearer parsing or forwarding.
            CardstackMcpTransportProbe.post();
            return;
        }
        if (RestContext.request.requestBody == null || RestContext.request.requestBody.size() > 4096) {
            send(400, new Map<String,Object>{'error' => 'invalid_probe_body'}); return;
        }
        Object parsed;
        try { parsed = JSON.deserializeUntyped(RestContext.request.requestBody.toString()); }
        catch (JSONException e) { send(400, new Map<String,Object>{'error' => 'invalid_json'}); return; }
        if (!(parsed instanceof Map<String,Object>)) { send(400, new Map<String,Object>{'error' => 'invalid_request'}); return; }
        Map<String,Object> request = (Map<String,Object>) parsed;
        Object id = request.get('id');
        if (request.get('jsonrpc') != '2.0' || !(request.get('method') instanceof String)) {
            rpcError(id, -32600, 'Invalid request'); return;
        }
        if (!request.containsKey('id')) { RestContext.response.statusCode = 202; return; }
        String method = (String) request.get('method');
        System.debug(LoggingLevel.ERROR, 'CARDSTACK_SITE_AUTH_PROBE ' + JSON.serialize(new Map<String,Object>{'event'=>'protocol','method'=>new Set<String>{'initialize','ping','tools/list','tools/call'}.contains(method)?method:'other','requestedJune2025'=>method=='initialize'&&request.get('params') instanceof Map<String,Object>&&((Map<String,Object>)request.get('params')).get('protocolVersion')=='2025-06-18'}));
        if (request.get('params') != null && !(request.get('params') instanceof Map<String,Object>)) {
            rpcError(id, -32602, 'Invalid params'); return;
        }
        Map<String,Object> params = request.get('params') == null ? new Map<String,Object>() : (Map<String,Object>) request.get('params');
        Object result;
        if (method == 'initialize') {
            String version = params.get('protocolVersion') == '2025-11-25' ? '2025-11-25' : '2025-06-18';
            result = new Map<String,Object>{'protocolVersion' => version,
                'serverInfo' => new Map<String,Object>{'name' => 'Cardstack Salesforce Site auth probe', 'version' => '0.0.1'},
                'capabilities' => new Map<String,Object>{'tools' => new Map<String,Object>()}};
        } else if (method == 'ping') result = new Map<String,Object>();
        else if (method == 'tools/list') result = new Map<String,Object>{'tools' => new List<Object>{new Map<String,Object>{
            'name' => 'cardstack_auth_probe', 'description' => 'Return constant synthetic text. No CRM access.',
            'inputSchema' => new Map<String,Object>{'type' => 'object', 'properties' => new Map<String,Object>(), 'additionalProperties' => false},
            'annotations' => new Map<String,Object>{'readOnlyHint' => true, 'destructiveHint' => false, 'openWorldHint' => false}}}};
        else if (method == 'tools/call') {
            if (params.get('name') != 'cardstack_auth_probe' || (params.get('arguments') != null &&
                (!(params.get('arguments') instanceof Map<String,Object>) || !((Map<String,Object>)params.get('arguments')).isEmpty()))) {
                rpcError(id, -32602, 'Invalid synthetic tool request'); return;
            }
            result = new Map<String,Object>{'content' => new List<Object>{new Map<String,Object>{'type' => 'text', 'text' => 'Salesforce authenticated synthetic probe. No CRM access.'}}};
        } else { rpcError(id, -32601, 'Unknown method'); return; }
        send(200, new Map<String,Object>{'jsonrpc' => '2.0', 'id' => id, 'result' => result});
    }
    private static void send(Integer status, Object body) {
        System.debug(LoggingLevel.ERROR, 'CARDSTACK_SITE_AUTH_PROBE ' + JSON.serialize(new Map<String,Object>{'event'=>'response','status'=>status}));
        RestContext.response.statusCode = status;
        RestContext.response.responseBody = Blob.valueOf(JSON.serialize(body));
    }
    private static void rpcError(Object id, Integer code, String message) {
        send(200, new Map<String,Object>{'jsonrpc' => '2.0', 'id' => id,
            'error' => new Map<String,Object>{'code' => code, 'message' => message}});
    }
}
