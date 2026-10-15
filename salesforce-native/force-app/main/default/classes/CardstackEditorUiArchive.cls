/**
 * Bounded exact-byte historical renderer reads. No discovery or interaction authority.
 * All entries are fixed qualified releases; names never derive from caller input.
 */
public with sharing class CardstackEditorUiArchive {
    private static final Map<String,String> RESOURCES=new Map<String,String>{
        'ui://cardstack/record-edit-v1-sha256-a2a99a80ee382b9922804f720e2e7c9dd1c18cdba95988c4eea2a430e4f4d075.html'=>'CardstackRecordUi3daad61',
        'ui://cardstack/opportunity-edit-v1-sha256-c24749508bbe8ff9163e328b84916bfaed2e1fb9e36b2315f1fda86e64e8455f.html'=>'CardstackOpportunityUi3daad61',
        'ui://cardstack/record-edit-v1-sha256-5552323110417f4e8d870affa2030ce04a4b7c82e805abcca82cfdcdd28c3b56.html'=>'CardstackRecordUi5275b7e',
        'ui://cardstack/opportunity-edit-v1-sha256-e2b9d0699964d727fd6c0b113cce7f61c03062dd7ac19d96bc7eef1f175767eb.html'=>'CardstackOpportunityUi5275b7e'
    };
    @TestVisible private static Boolean overrideEnabled=false;
    @TestVisible private static Blob overrideBody;
    /**
     * @param resourceFamily Trusted adapter family.
     * @param requestedUri Exact retained content address.
     * @return Exact checked historical asset, or null when unknown, inaccessible or corrupt.
     */
    public static CardstackEditorUiResource.Asset load(CardstackEditorUiResource.Family resourceFamily,String requestedUri) {
        if(!CardstackEditorUiResource.accepts(resourceFamily,requestedUri) || !RESOURCES.containsKey(requestedUri)) { return null; }
        CardstackConnectionAccess.requireUser();
        String resourceName=RESOURCES.get(requestedUri);
        Blob body;
        if(Test.isRunningTest() && overrideEnabled) { body=overrideBody; }
        else {
            try {
                List<StaticResource> resources=[SELECT Body FROM StaticResource WHERE Name=:resourceName WITH USER_MODE LIMIT 1];
                if(!resources.isEmpty()) { body=resources[0].Body; }
            } catch(QueryException failure) { return null; }
        }
        if(body == null || body.size() == 0) { return null; }
        String digest=EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256',body)).toLowerCase();
        if(!requestedUri.endsWith('-sha256-'+digest+'.html')) { return null; }
        CardstackEditorUiResource.Asset asset=new CardstackEditorUiResource.Asset();
        try { asset.html=body.toString(); } catch(StringException failure) { return null; }
        asset.uri=requestedUri;
        return asset;
    }
}
