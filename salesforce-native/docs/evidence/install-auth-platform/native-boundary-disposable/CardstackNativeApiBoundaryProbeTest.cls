/** Offline-authored tests; runtime native OAuth must be measured separately. */
@IsTest private with sharing class CardstackNativeApiBoundaryProbeTest {
    @IsTest static void shouldMatchOnlyApprovedPaths() {
        String resource = '/cardstack-native-api-boundary-probe/v1/native-api';
        for (String prefix : new List<String>{'', '/services/apexrest', '/cardstackauthprobe', '/cardstackauthprobe/services/apexrest'}) {
            Assert.isTrue(CardstackNativeApiBoundaryProbe.isRoute(prefix + resource), 'Exact representation must match');
        }
        for (String suffix : new List<String>{'/extra', '?extra=true', '/', '/native-api'}) {
            Assert.isFalse(CardstackNativeApiBoundaryProbe.isRoute(resource + suffix), 'Additional URI text must fail');
        }
        Assert.isFalse(CardstackNativeApiBoundaryProbe.isRoute('/other' + resource), 'Unknown prefix denied');
        Assert.isFalse(CardstackNativeApiBoundaryProbe.isRoute(null), 'Null route denied');
    }
    @IsTest static void shouldDenyGuestClassification() {
        Assert.isFalse(CardstackNativeApiBoundaryProbe.isNamed('Guest'), 'Guest cannot be named');
        Assert.isFalse(CardstackNativeApiBoundaryProbe.isNamed(null), 'Missing type fails closed');
        Assert.isTrue(CardstackNativeApiBoundaryProbe.isNamed('Standard'), 'Ordinary named user accepted');
    }
    @IsTest static void shouldReturnOnlyBooleansWithoutDataAccess() {
        RestContext.request = new RestRequest();
        RestContext.request.requestURI = '/services/apexrest/cardstack-native-api-boundary-probe/v1/native-api';
        RestContext.response = new RestResponse();
        Integer queries = Limits.getQueries(); Integer mutations = Limits.getDmlStatements();
        CardstackNativeApiBoundaryProbe.get();
        Map<String,Object> body = (Map<String,Object>)JSON.deserializeUntyped(RestContext.response.responseBody.toString());
        Assert.areEqual(new Set<String>{'handlerReached','namedActor'}, body.keySet(), 'Only synthetic booleans');
        Assert.areEqual(true, body.get('handlerReached'), 'Fixture executed');
        Assert.areEqual(queries, Limits.getQueries(), 'No queries');
        Assert.areEqual(mutations, Limits.getDmlStatements(), 'No mutation');
        Assert.areEqual(200, RestContext.response.statusCode, 'Test runs named user');
    }
    @IsTest static void shouldRejectNestedPath() {
        RestContext.request = new RestRequest();
        RestContext.request.requestURI = '/cardstack-native-api-boundary-probe/v1/tools/native-api';
        RestContext.response = new RestResponse();
        CardstackNativeApiBoundaryProbe.get();
        Assert.areEqual(404, RestContext.response.statusCode, 'Nested suffix denied');
        Assert.areEqual('{"error":"unknown_probe_route"}', RestContext.response.responseBody.toString(), 'Sanitized error');
    }
}
