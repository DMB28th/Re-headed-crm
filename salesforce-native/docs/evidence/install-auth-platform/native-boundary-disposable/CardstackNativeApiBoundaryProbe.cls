/** Disposable native authentication measurement; no data or session inspection. */
@RestResource(urlMapping='/cardstack-native-api-boundary-probe/v1/*')
global with sharing class CardstackNativeApiBoundaryProbe {
    /** Measures platform ingress, then denies any guest actor. */
    @HttpGet global static void get() {
        RestContext.response.addHeader('Content-Type', 'application/json');
        RestContext.response.addHeader('Cache-Control', 'no-store');
        if (!isRoute(RestContext.request.requestURI)) {
            RestContext.response.statusCode = 404;
            RestContext.response.responseBody = Blob.valueOf('{"error":"unknown_probe_route"}');
            return;
        }
        Boolean namedActor = isNamed(UserInfo.getUserType());
        RestContext.response.statusCode = namedActor ? 200 : 401;
        RestContext.response.responseBody = Blob.valueOf(JSON.serialize(new Map<String,Boolean>{
            'handlerReached' => true, 'namedActor' => namedActor
        }));
    }
    // Known disposable prefix is a measurement control, not production discovery.
    @TestVisible private static Boolean isRoute(String path) {
        String resource = '/cardstack-native-api-boundary-probe/v1/native-api';
        return path == resource || path == '/services/apexrest' + resource ||
            path == '/cardstackauthprobe' + resource ||
            path == '/cardstackauthprobe/services/apexrest' + resource;
    }
    @TestVisible private static Boolean isNamed(String userType) {
        return String.isNotBlank(userType) && userType != 'Guest';
    }
}
