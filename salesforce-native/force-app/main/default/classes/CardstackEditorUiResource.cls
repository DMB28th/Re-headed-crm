/**
 * Fixed native editor registration. Current addresses bind exact installed Body bytes.
 * Unversioned aliases are legacy mutable reads, never advertised as current builds.
 */
public with sharing class CardstackEditorUiResource {
    public enum Family { OPPORTUNITY, RECORD }
    /** A readable native asset and its immutable current address, loaded together. */
    public class Asset { public String uri; public String html; }

    private static String prefix(Family resourceFamily) {
        if(resourceFamily == Family.OPPORTUNITY) { return 'ui://cardstack/opportunity-edit-v1'; }
        if(resourceFamily == Family.RECORD) { return 'ui://cardstack/record-edit-v1'; }
        return null;
    }
    /** @param resourceFamily Trusted native registration. @param uri Requested address. @return Exact legacy alias match. */
    public static Boolean isLegacy(Family resourceFamily,String uri) {
        String registered = prefix(resourceFamily);
        return registered != null && (registered+'.html').equals(uri);
    }
    /** @param resourceFamily Trusted native registration. @param uri Requested address. @return Only an exact alias or well-formed family digest address. */
    public static Boolean accepts(Family resourceFamily,String uri) {
        String registered = prefix(resourceFamily);
        if(registered == null || uri == null) { return false; }
        if(isLegacy(resourceFamily,uri)) { return true; }
        String versionPrefix = registered+'-sha256-';
        if(!uri.startsWith(versionPrefix)) { return false; }
        return Pattern.matches('[a-f0-9]{64}\\.html',uri.substring(versionPrefix.length()));
    }
    /**
     * @param resourceFamily Trusted enum maps to two fixed asset names; never derived from caller URI.
     * @param overrideEnabled Existing adapter test seam; ignored outside native tests.
     * @param overrideBody Synthetic native-test bytes; ignored outside native tests.
     * @return Current snapshot or null for missing, empty, unreadable or inaccessible bytes.
     */
    public static Asset load(Family resourceFamily,Boolean overrideEnabled,Blob overrideBody) {
        CardstackConnectionAccess.requireUser();
        String registered = prefix(resourceFamily);
        if(registered == null) { return null; }
        String resourceName = resourceFamily == Family.OPPORTUNITY ? 'CardstackOpportunityEditUi' : 'CardstackRecordEditUi';
        Blob body;
        if(Test.isRunningTest() && overrideEnabled == true) { body=overrideBody; }
        else {
            try {
                List<StaticResource> resources = [SELECT Body FROM StaticResource WHERE Name=:resourceName WITH USER_MODE LIMIT 1];
                if(!resources.isEmpty()) { body=resources[0].Body; }
            } catch(QueryException error) { return null; }
        }
        if(body == null || body.size()==0) { return null; }
        Asset asset = new Asset();
        try { asset.html=body.toString(); } catch(StringException error) { return null; }
        asset.uri=registered+'-sha256-'+EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256',body)).toLowerCase()+'.html';
        return asset;
    }
}
