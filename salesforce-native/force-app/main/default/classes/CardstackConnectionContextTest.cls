/** Context tests contain no org-specific Site IDs or endpoints. */
@IsTest private with sharing class CardstackConnectionContextTest {
    @IsTest static void publicDescriptorHasNoPrivateQueries() {
        Test.startTest(); Integer beforeQueries = Limits.getQueries();
        CardstackConnectionTypes.ContextView view = CardstackConnectionContext.publicDescriptor('claude');
        Assert.areEqual(beforeQueries, Limits.getQueries(), 'Public path must never query private state');
        Assert.isNull(view.siteId, 'Public descriptor excludes Site identity');
        Assert.areEqual(URL.getOrgDomainUrl().toExternalForm(), view.issuer, 'Issuer current org');
        Test.stopTest();
    }
    @IsTest static void unreadableMetadataIsUnknown() {
        Test.startTest();
        CardstackConnectionTypes.ContextView view = CardstackConnectionContext.resolve('chatgpt', null, '/cardstack');
        Assert.isNull(view.resourceUrl, 'No fabricated endpoint');
        Assert.areEqual('Unknown', view.checks[0].status, 'Unreadable never Pass/Fail');
        Assert.areEqual('UNKNOWN_METADATA', view.checks[0].errorCode, 'Exact safe category');
        Test.stopTest();
    }
    @IsTest static void unknownPublicClientRejected() {
        Test.startTest();
        try { CardstackConnectionContext.publicDescriptor('other'); Assert.fail('Invalid client'); }
        catch(CardstackConnectionTypes.ConnectionException e) { Assert.areEqual('INVALID_CLIENT', e.getMessage(), 'Exact code'); }
        Test.stopTest();
    }
    @IsTest static void normalizePlatformIdToChecksum18() {
        String full = String.valueOf(UserInfo.getUserId());
        Test.startTest();
        Assert.areEqual(full, CardstackConnectionTypes.normalizeId(full.substring(0,15)), '15 input normalized');
        Assert.areEqual(full, CardstackConnectionTypes.normalizeId(full), '18 checksum accepted');
        Test.stopTest();
    }
    @IsTest static void invalidIdChecksumRejected() {
        String full = String.valueOf(UserInfo.getUserId());
        String bad = full.substring(0,17) + (full.endsWith('A') ? 'B' : 'A');
        Test.startTest();
        try { CardstackConnectionTypes.normalizeId(bad); Assert.fail('Checksum rejected'); }
        catch(CardstackConnectionTypes.ConnectionException e) { Assert.areEqual('INVALID_SETUP', e.getMessage(), 'Safe code'); }
        Test.stopTest();
    }
}
