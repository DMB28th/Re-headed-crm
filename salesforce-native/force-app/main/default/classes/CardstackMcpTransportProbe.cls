/**
 * Existing installed org API route. Salesforce authenticates the named actor;
 * this boundary independently enforces Use, exact registration and private enrollment.
 * Fixed client routing does not attest an OAuth app or token resource audience.
 */
@RestResource(urlMapping='/cardstack-mcp-probe/*')
global with sharing class CardstackMcpTransportProbe {
    private static final Integer MAX_BYTES = 16384;
    @TestVisible private static Boolean namedOverride;
    /** Authenticated streaming GET remains unsupported. */
    @HttpGet global static void get() { route('GET'); }
    /** Bounded protocol requests use the current shared native dispatcher. */
    @HttpPost global static void post() { route('POST'); }
    /** Unsupported verbs pass the same authority checks before safe denial. */
    @HttpPut global static void put() { route('PUT'); }
    /** No transport PATCH operation exists. */
    @HttpPatch global static void patch() { route('PATCH'); }
    /** No transport DELETE operation exists. */
    @HttpDelete global static void deleteRequest() { route('DELETE'); }
    private static void route(String method) {
        RestContext.response.addHeader('Content-Type', 'application/json');
        RestContext.response.addHeader('Cache-Control', 'no-store');
        Boolean named = Test.isRunningTest() && namedOverride != null ? namedOverride : !'Guest'.equals(UserInfo.getUserType());
        if(!named) { httpError(401, 'authentication_required'); return; }
        if(CardstackConnectionContext.isSiteContext()) { httpError(403, 'direct_context_required'); return; }
        try { CardstackConnectionAccess.requireUser(); }
        catch(CardstackConnectionTypes.ConnectionException e) { httpError(403, 'cardstack_use_required'); return; }
        String path = RestContext.request.requestURI;
        if(path == null || (!path.equals(CardstackConnectionTypes.DIRECT_PATH) && !path.equals('/cardstack-mcp-probe/')) ||
            (RestContext.request.params != null && !RestContext.request.params.isEmpty())) {
            httpError(404, 'unknown_probe_route'); return;
        }
        if(!authorizedSetup()) return;
        if(!method.equals('POST')) { httpError(405, 'method_not_allowed'); return; }
        Map<String,Object> response;
        try { response = readRequest(); }
        catch(Exception e) { httpError(500, 'request_unavailable'); return; }
        if(response == null) { RestContext.response.statusCode = 202; RestContext.response.responseBody = null; return; }
        send(200, response);
    }
    private static Boolean authorizedSetup() {
        try {
            CardstackConnectionTypes.SetupSnapshot snapshot = CardstackConnectionSetup.snapshot(CardstackConnectionTypes.DIRECT_CLIENT);
            if(!matchesSetup(snapshot)) { httpError(503, 'connection_setup_unavailable'); return false; }
            if(snapshot.setupView.enabledIntent != true) { httpError(403, 'connection_disabled'); return false; }
            return true;
        } catch(Exception e) {
            // Corrupt/unreadable private data never becomes a protocol or UI response.
            httpError(503, 'connection_setup_unavailable'); return false;
        }
    }
    private static Boolean matchesSetup(CardstackConnectionTypes.SetupSnapshot snapshot) {
        if(snapshot == null || snapshot.setupView == null || !snapshot.isCurrentOrg() || snapshot.siteId != null ||
            !''.equals(snapshot.sitePrefix) || String.isBlank(snapshot.configurationDigest)) return false;
        CardstackConnectionTypes.SetupView view = snapshot.setupView;
        CardstackConnectionTypes.ContextView context = CardstackConnectionContext.directDescriptor(CardstackConnectionTypes.DIRECT_CLIENT);
        return CardstackConnectionTypes.DIRECT_CLIENT.equals(view.client) &&
            CardstackConnectionTypes.DIRECT_TRANSPORT.equals(view.transportKind) && CardstackConnectionTypes.DIRECT_ROUTE.equals(view.routeVersion) &&
            view.revision != null && view.revision > 0 && view.versions != null && view.versions.equals(CardstackConnectionSetupRepository.versions()) &&
            context.resourceUrl.equals(view.resourceUrl) && context.issuer.equals(view.issuer) && view.metadataUrl == null &&
            !'Stale'.equals(view.summary);
    }
    private static Map<String,Object> readRequest() {
        Blob body = RestContext.request.requestBody;
        if(body != null && body.size() > MAX_BYTES) return CardstackMcpDispatcher.error(null, -32600, 'Request exceeds connection limit');
        Object parsed;
        try { parsed = JSON.deserializeUntyped(body == null ? '' : body.toString()); }
        catch(JSONException e) { return CardstackMcpDispatcher.error(null, -32700, 'Invalid JSON request'); }
        catch(StringException e) { return CardstackMcpDispatcher.error(null, -32700, 'Invalid JSON request'); }
        if(!(parsed instanceof Map<String,Object>)) return CardstackMcpDispatcher.error(null, -32600, 'Invalid protocol request');
        Map<String,Object> request = (Map<String,Object>)parsed;
        Boolean legacy = CardstackMcpTransportCompatibility.accepts(request);
        // The same dispatcher validates every envelope and notification. A synthetic
        // alias is validated as ping, so it cannot accidentally reach a CRM adapter.
        Map<String,Object> validated = request.clone();
        if(legacy) validated.put('method', 'ping');
        Map<String,Object> response = CardstackMcpDispatcher.handle(CardstackConnectionTypes.DIRECT_CLIENT, validated);
        if(response == null || response.containsKey('error')) return response;
        if(legacy) return CardstackMcpTransportCompatibility.handle(request);
        CardstackMcpTransportCompatibility.appendCatalog(request, response);
        return response;
    }
    private static void httpError(Integer status, String code) { send(status, new Map<String,Object>{'error'=>code}); }
    private static void send(Integer status, Object body) {
        RestContext.response.statusCode = status;
        RestContext.response.responseBody = Blob.valueOf(JSON.serialize(body));
    }
}
