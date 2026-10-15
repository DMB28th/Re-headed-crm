/** Supported API67 Site context only. No private queries, self-REST or caller URL input. */
public with sharing class CardstackConnectionContext {
    // Only supported platform getter values may be simulated; explicit flag represents null context.
    @TestVisible private static Boolean platformOverrideEnabled = false;
    @TestVisible private static String siteIdOverride;
    @TestVisible private static String pathPrefixOverride;
    @TestVisible private static String baseRequestUrlOverride;
    @TestVisible private static String orgIssuerOverride;
    /** Named setup retains selected Site configuration when metadata cannot be read. */
    public static CardstackConnectionTypes.ContextView resolve(String client, Id siteId, String prefix) {
        CardstackConnectionTypes.requireClient(client);
        String normalizedPrefix = CardstackConnectionTypes.normalizePrefix(prefix);
        CardstackConnectionTypes.ContextView result = describe(client);
        String currentSite = Test.isRunningTest() && platformOverrideEnabled ? siteIdOverride : Site.getSiteId();
        if(siteId != null) siteId = (Id)CardstackConnectionTypes.normalizeId(String.valueOf(siteId));
        if(siteId == null || currentSite == null ||
            !CardstackConnectionTypes.normalizeId(currentSite).equals(String.valueOf(siteId)) ||
            !result.sitePrefix.equals(normalizedPrefix)) {
            result.resourceUrl = null; result.metadataUrl = null;
            result.checks = new List<CardstackConnectionTypes.CheckView>{unknown('site')};
        }
        result.siteId = siteId; result.sitePrefix = normalizedPrefix;
        return result;
    }
    /** Fixed installed named API endpoint; no Site discovery or caller URL is involved. */
    public static CardstackConnectionTypes.ContextView directDescriptor(String client) {
        if(!CardstackConnectionTypes.DIRECT_CLIENT.equals(client)) throw new CardstackConnectionTypes.ConnectionException('INVALID_SETUP');
        CardstackConnectionTypes.ContextView view = new CardstackConnectionTypes.ContextView();
        view.sitePrefix = '';
        view.issuer = URL.getOrgDomainUrl().toExternalForm();
        view.resourceUrl = view.issuer + CardstackConnectionTypes.DIRECT_PATH;
        CardstackConnectionTypes.CheckView check = new CardstackConnectionTypes.CheckView();
        check.stage = 'directTransport'; check.status = 'Pass'; check.source = 'Registered Salesforce org API endpoint'; check.checkedAt = Datetime.now();
        view.checks = new List<CardstackConnectionTypes.CheckView>{check};
        return view;
    }
    /** True only in an actual Salesforce Site context; supported getter, no URL inference. */
    public static Boolean isSiteContext() {
        return (Test.isRunningTest() && platformOverrideEnabled ? siteIdOverride : Site.getSiteId()) != null;
    }
    /** Public discovery reads only platform context and excludes all identity. */
    public static CardstackConnectionTypes.ContextView publicDescriptor(String client) {
        CardstackConnectionTypes.requireClient(client);
        return describe(client);
    }
    private static CardstackConnectionTypes.ContextView describe(String client) {
        CardstackConnectionTypes.ContextView view = new CardstackConnectionTypes.ContextView();
        view.sitePrefix = CardstackConnectionTypes.normalizePrefix(
            Test.isRunningTest() && platformOverrideEnabled ? pathPrefixOverride : Site.getPathPrefix());
        view.issuer = Test.isRunningTest() && platformOverrideEnabled ? orgIssuerOverride : URL.getOrgDomainUrl().toExternalForm();
        view.checks = new List<CardstackConnectionTypes.CheckView>{unknown('site')};
        String base = Test.isRunningTest() && platformOverrideEnabled ? baseRequestUrlOverride : Site.getBaseRequestUrl();
        if(!String.isBlank(base) && base.startsWith('https://')) {
            // getBaseRequestUrl already includes prefix; never append it again.
            if(base.endsWith('/')) base = base.substring(0,base.length()-1);
            view.resourceUrl = base + '/services/apexrest/cardstack/v1/' + client + '/mcp';
            view.metadataUrl = base + '/services/apexrest/cardstack/v1/' + client + '/metadata';
            CardstackConnectionTypes.CheckView check = new CardstackConnectionTypes.CheckView();
            check.stage = 'site'; check.status = 'Pass'; check.source = 'Salesforce Site context'; check.checkedAt = Datetime.now();
            view.checks = new List<CardstackConnectionTypes.CheckView>{check};
        }
        return view;
    }
    /** Unknown is a lack of readable evidence, never a failed/verified policy. */
    public static CardstackConnectionTypes.CheckView unknown(String stage) {
        CardstackConnectionTypes.CheckView check = new CardstackConnectionTypes.CheckView();
        check.stage = stage; check.status = 'Unknown'; check.source = 'Manual Salesforce Setup inspection required';
        check.checkedAt = Datetime.now(); check.errorCode = 'UNKNOWN_METADATA';
        return check;
    }
}
