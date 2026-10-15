/** Unit envelope tests. These cannot simulate a live guest Site context. */
@IsTest private with sharing class CardstackPublicContextProbeTest {
    private static void prepare(String path) {
        RestContext.request = new RestRequest();
        RestContext.request.requestURI = path;
        RestContext.request.httpMethod = 'GET';
        RestContext.response = new RestResponse();
    }
    @IsTest static void shouldReturnOnlyPublicContext_WhenContextRequested() {
        prepare('/services/apexrest/cardstack-public-context-probe/v1/context');
        Integer queriesBefore = Limits.getQueries();
        Integer dmlBefore = Limits.getDmlStatements();
        Test.startTest();
        CardstackPublicContextProbe.get();
        Test.stopTest();
        Map<String,Object> result = (Map<String,Object>)JSON.deserializeUntyped(
            RestContext.response.responseBody.toString());
        Assert.areEqual(200, RestContext.response.statusCode, 'Context envelope must succeed');
        Assert.areEqual(new Set<String>{'baseRequestUrl','baseSecureUrl','pathPrefix','orgDomainUrl'},
            result.keySet(), 'Only public URL context may leave the probe');
        Assert.areEqual(queriesBefore, Limits.getQueries(), 'No setup or data queries permitted');
        Assert.areEqual(dmlBefore, Limits.getDmlStatements(), 'No mutations permitted');
    }
    @IsTest static void shouldRejectUnknownRoute_WhenToolRequested() {
        prepare('/services/apexrest/cardstack-public-context-probe/v1/tools');
        Test.startTest();
        CardstackPublicContextProbe.get();
        Test.stopTest();
        Assert.areEqual(404, RestContext.response.statusCode, 'No tool execution route exists');
        Assert.areEqual('{"error":"unknown_probe_route"}',
            RestContext.response.responseBody.toString(), 'Error must remain sanitized');
    }
    @IsTest static void shouldRejectNestedRoute_WhenContextSuffixRequested() {
        prepare('/services/apexrest/cardstack-public-context-probe/v1/tools/context');
        Test.startTest();
        CardstackPublicContextProbe.get();
        Test.stopTest();
        Assert.areEqual(404, RestContext.response.statusCode,
            'A nested context suffix must not match the exact probe route');
        Assert.areEqual('{"error":"unknown_probe_route"}',
            RestContext.response.responseBody.toString(), 'Nested route must fail closed');
    }
    @IsTest static void shouldAcceptExactSiteRoute_WhenPrefixHasNoLeadingSlash() {
        Test.startTest();
        Boolean matches = CardstackPublicContextProbe.isContextRoute(
            '/partners/services/apexrest/cardstack-public-context-probe/v1/context', 'partners');
        Test.stopTest();
        Assert.isTrue(matches, 'Prefix component must produce exactly one leading separator');
    }
    @IsTest static void shouldAcceptExactSiteRoute_WhenPrefixHasLeadingSlash() {
        Test.startTest();
        Boolean matches = CardstackPublicContextProbe.isContextRoute(
            '/partners/services/apexrest/cardstack-public-context-probe/v1/context', '/partners');
        Test.stopTest();
        Assert.isTrue(matches, 'Documented leading slash must remain unchanged');
    }
    @IsTest static void shouldRejectWrongPrefix_WhenSiteRouteRequested() {
        Test.startTest();
        Boolean matches = CardstackPublicContextProbe.isContextRoute(
            '/unapproved/services/apexrest/cardstack-public-context-probe/v1/context', 'partners');
        Test.stopTest();
        Assert.isFalse(matches, 'A different Site prefix must not match');
    }
    @IsTest static void shouldRejectNestedSiteRoute_WhenPrefixHasNoLeadingSlash() {
        Test.startTest();
        Boolean matches = CardstackPublicContextProbe.isContextRoute(
            '/partners/services/apexrest/cardstack-public-context-probe/v1/tools/context', 'partners');
        Test.stopTest();
        Assert.isFalse(matches, 'Normalization must not admit nested context suffixes');
    }
    @IsTest static void shouldAcceptExactRelativeRoute_WhenResourcePathPresented() {
        Test.startTest();
        Boolean matches = CardstackPublicContextProbe.isContextRoute(
            '/cardstack-public-context-probe/v1/context', 'partners');
        Test.stopTest();
        Assert.isTrue(matches, 'Exact resource-relative internal path must match');
    }
    @IsTest static void shouldAcceptExactRelativeSiteRoute_WhenPrefixPresented() {
        Test.startTest();
        Boolean matches = CardstackPublicContextProbe.isContextRoute(
            '/partners/cardstack-public-context-probe/v1/context', '/partners');
        Test.stopTest();
        Assert.isTrue(matches, 'Exact current-prefix resource-relative path must match');
    }
    @IsTest static void shouldRejectQuery_WhenRawUriContainsQuery() {
        Test.startTest();
        Boolean matches = CardstackPublicContextProbe.isContextRoute(
            '/cardstack-public-context-probe/v1/context?extra=true', 'partners');
        Test.stopTest();
        Assert.isFalse(matches, 'Undocumented query-bearing representation must fail closed');
    }
    @IsTest static void shouldRejectExtraSegment_WhenRawUriHasTrailingSegment() {
        Test.startTest();
        Boolean matches = CardstackPublicContextProbe.isContextRoute(
            '/partners/cardstack-public-context-probe/v1/context/extra', 'partners');
        Test.stopTest();
        Assert.isFalse(matches, 'Extra segments must not match the exact resource route');
    }
    @IsTest static void shouldMeasureApprovedSite_WhenSupportedContextIsEmpty() {
        Test.startTest();
        Boolean matches = CardstackPublicContextProbe.isContextRoute(
            '/cardstackauthprobe/services/apexrest/cardstack-public-context-probe/v1/context', '');
        Test.stopTest();
        Assert.isTrue(matches, 'Approved measurement route must not depend on the context under test');
    }
    @IsTest static void shouldMeasureApprovedRelativeSite_WhenSupportedContextIsNull() {
        Test.startTest();
        Boolean matches = CardstackPublicContextProbe.isContextRoute(
            '/cardstackauthprobe/cardstack-public-context-probe/v1/context', null);
        Test.stopTest();
        Assert.isTrue(matches, 'Approved exact relative path must expose no additional endpoint');
    }
    @IsTest static void shouldRejectUnknownSite_WhenSupportedContextIsEmpty() {
        Test.startTest();
        Boolean matches = CardstackPublicContextProbe.isContextRoute(
            '/unapproved/services/apexrest/cardstack-public-context-probe/v1/context', '');
        Test.stopTest();
        Assert.isFalse(matches, 'Measurement control must never admit an arbitrary prefix');
    }
}
