/** Disposable public-context measurement only. No SOQL, DML, identity or bearer access. */
@RestResource(urlMapping='/cardstack-public-context-probe/v1/*')
global with sharing class CardstackPublicContextProbe {
    // Measurement control for this approved disposable Site only; never production discovery.
    private static final String APPROVED_PROBE_PREFIX = '/cardstackauthprobe';
    /** Returns supported platform URL context for the controller's private comparison. */
    @HttpGet global static void get() {
        RestContext.response.addHeader('Content-Type', 'application/json');
        RestContext.response.addHeader('Cache-Control', 'no-store');
        if (!isContextRoute(RestContext.request.requestURI, Site.getPathPrefix())) {
            RestContext.response.statusCode = 404;
            RestContext.response.responseBody = Blob.valueOf('{"error":"unknown_probe_route"}');
            return;
        }
        RestContext.response.statusCode = 200;
        RestContext.response.responseBody = Blob.valueOf(JSON.serialize(new Map<String,Object>{
            'baseRequestUrl' => Site.getBaseRequestUrl(),
            'baseSecureUrl' => Site.getBaseSecureUrl(),
            'pathPrefix' => Site.getPathPrefix(),
            'orgDomainUrl' => URL.getOrgDomainUrl().toExternalForm()
        }));
    }
    // A Site prefix is a path component; normalize its leading separator only.
    @TestVisible private static Boolean isContextRoute(String requestedRoute, String prefix) {
        String route = '/services/apexrest/cardstack-public-context-probe/v1/context';
        String resourceRoute = '/cardstack-public-context-probe/v1/context';
        if (requestedRoute == route || requestedRoute == resourceRoute) return true;
        if (requestedRoute == APPROVED_PROBE_PREFIX + route ||
            requestedRoute == APPROVED_PROBE_PREFIX + resourceRoute) return true;
        if (String.isBlank(prefix)) return false;
        String normalizedPrefix = prefix.startsWith('/') ? prefix : '/' + prefix;
        return requestedRoute == normalizedPrefix + route ||
            requestedRoute == normalizedPrefix + resourceRoute;
    }
}
