/**
 * Salesforce-owned authentication boundary. Guest grants belong only on this class.
 * Public discovery uses supported Site context; private setup is read only after Use.
 */
@RestResource(urlMapping='/cardstack/v1/*')
global with sharing class CardstackMcpIngress {
    private static final String ROOT = '/services/apexrest/cardstack/v1/';
    private static final Integer MAX_BYTES = 16384;
    // Narrow unit seams, never consulted outside Apex test execution.
    @TestVisible private static Boolean namedOverride;
    @TestVisible private static Id siteOverride;
    @TestVisible private static CardstackConnectionTypes.ContextView contextOverride;
    @TestVisible private static CardstackConnectionTypes.SetupSnapshot snapshotOverride;

    /** Public discovery, or authenticated denial of unsupported streaming GET. */
    @HttpGet global static void get() { route('GET'); }
    /** Authenticate before reading a bounded MCP request. */
    @HttpPost global static void post() { route('POST'); }

    private static void route(String method) {
        RestContext.response.addHeader('Content-Type', 'application/json');
        RestContext.response.addHeader('Cache-Control', 'no-store');
        CardstackConnectionTypes.ContextView context = descriptor('claude');
        if(context == null) { httpError(503, 'public_context_unavailable'); return; }
        String path = exactRoute(RestContext.request.requestURI, context.sitePrefix);
        if(path == null || (RestContext.request.params != null && !RestContext.request.params.isEmpty())) {
            httpError(404, 'unknown_probe_route'); return;
        }
        String client = path.substringBefore('/');
        if(client.equals('chatgpt')) context = descriptor(client);
        if(!validContext(context, client)) { httpError(503, 'public_context_unavailable'); return; }
        if(path.endsWith('/metadata')) {
            if(!method.equals('GET')) { httpError(405, 'method_not_allowed'); return; }
            send(200, new Map<String,Object>{'resource'=>context.resourceUrl,
                'authorization_servers'=>new List<String>{context.issuer},
                'scopes_supported'=>new List<String>{'api','refresh_token'},
                'bearer_methods_supported'=>new List<String>{'header'}});
            return;
        }
        if(!namedActor()) {
            RestContext.response.addHeader('WWW-Authenticate', 'Bearer resource_metadata="'+context.metadataUrl+'", scope="api refresh_token"');
            httpError(401, 'authentication_required'); return;
        }
        try { CardstackConnectionAccess.requireUser(); }
        catch(CardstackConnectionTypes.ConnectionException e) { httpError(403, 'cardstack_use_required'); return; }
        if(!authorizedSetup(client, context)) return;
        if(!method.equals('POST')) { httpError(405, 'method_not_allowed'); return; }
        Map<String,Object> response = readRequest(client);
        if(response == null) {
            RestContext.response.statusCode = 202; RestContext.response.responseBody = null; return;
        }
        send(200, response);
    }
    private static Boolean namedActor() {
        return Test.isRunningTest() && namedOverride != null ? namedOverride : !'Guest'.equals(UserInfo.getUserType());
    }
    private static CardstackConnectionTypes.ContextView descriptor(String client) {
        try {
            return Test.isRunningTest() && contextOverride != null ? contextOverride : CardstackConnectionContext.publicDescriptor(client);
        } catch(Exception e) {
            // Supported context can be absent/unreadable; never expose platform details.
            return null;
        }
    }
    private static Boolean validContext(CardstackConnectionTypes.ContextView context, String client) {
        if(context == null || context.sitePrefix == null || context.issuer == null || context.resourceUrl == null) return false;
        if(!Pattern.matches('https://[A-Za-z0-9.-]+', context.issuer)) return false;
        String prefix = context.sitePrefix;
        if(!prefix.equals('') && !Pattern.matches('/[A-Za-z0-9_-]+', prefix)) return false;
        String suffix = prefix + ROOT + client + '/mcp';
        if(!context.resourceUrl.endsWith(suffix)) return false;
        String origin = context.resourceUrl.substring(0, context.resourceUrl.length()-suffix.length());
        return Pattern.matches('https://[A-Za-z0-9.-]+', origin) &&
            (origin+prefix+ROOT+client+'/metadata').equals(context.metadataUrl);
    }
    private static String exactRoute(String uri, String prefix) {
        if(uri == null) return null;
        // Only these four internal forms were proven. No decoding or normalization.
        for(String client : new List<String>{'claude','chatgpt'}) {
            for(String leaf : new List<String>{'mcp','metadata'}) {
                String relative = '/cardstack/v1/'+client+'/'+leaf;
                String full = ROOT+client+'/'+leaf;
                if(uri.equals(full) || uri.equals(relative) ||
                    (!String.isBlank(prefix) && (uri.equals(prefix+full) || uri.equals(prefix+relative)))) return client+'/'+leaf;
            }
        }
        return null;
    }
    private static Boolean authorizedSetup(String client, CardstackConnectionTypes.ContextView context) {
        CardstackConnectionTypes.SetupSnapshot snapshot;
        try {
            snapshot = Test.isRunningTest() && snapshotOverride != null ? snapshotOverride : CardstackConnectionSetup.snapshot(client);
            String currentSite = Test.isRunningTest() && siteOverride != null ? String.valueOf(siteOverride) : Site.getSiteId();
            if(!matchesSetup(snapshot, client, currentSite, context)) {
                httpError(503, 'connection_setup_unavailable'); return false;
            }
        } catch(Exception e) {
            // Corrupt/unreadable private configuration fails closed without raw data.
            httpError(503, 'connection_setup_unavailable'); return false;
        }
        if(snapshot.setupView.enabledIntent != true) { httpError(403, 'connection_disabled'); return false; }
        return true;
    }
    private static Boolean matchesSetup(CardstackConnectionTypes.SetupSnapshot snapshot, String client,
        String currentSite, CardstackConnectionTypes.ContextView context) {
        if(snapshot == null || snapshot.setupView == null || snapshot.siteId == null || currentSite == null || !snapshot.isCurrentOrg()) return false;
        CardstackConnectionTypes.SetupView view = snapshot.setupView;
        return CardstackConnectionTypes.normalizeId(currentSite).equals(CardstackConnectionTypes.normalizeId(String.valueOf(snapshot.siteId))) &&
            context.sitePrefix.equals(snapshot.sitePrefix) && client.equals(view.client) &&
            context.resourceUrl.equals(view.resourceUrl) && context.metadataUrl.equals(view.metadataUrl) && context.issuer.equals(view.issuer) &&
            !'Stale'.equals(view.summary);
    }
    private static Map<String,Object> readRequest(String client) {
        Blob body = RestContext.request.requestBody;
        if(body != null && body.size() > MAX_BYTES) return CardstackMcpDispatcher.error(null, -32600, 'Request exceeds connection limit');
        Object parsed;
        try { parsed = JSON.deserializeUntyped(body == null ? '' : body.toString()); }
        catch(JSONException e) { return CardstackMcpDispatcher.error(null, -32700, 'Invalid JSON request'); }
        catch(StringException e) { return CardstackMcpDispatcher.error(null, -32700, 'Invalid JSON request'); }
        if(!(parsed instanceof Map<String,Object>)) return CardstackMcpDispatcher.error(null, -32600, 'Invalid protocol request');
        return CardstackMcpDispatcher.handle(client, (Map<String,Object>)parsed);
    }
    private static void httpError(Integer status, String code) { send(status, new Map<String,Object>{'error'=>code}); }
    private static void send(Integer status, Object body) {
        RestContext.response.statusCode = status;
        RestContext.response.responseBody = Blob.valueOf(JSON.serialize(body));
    }
}
