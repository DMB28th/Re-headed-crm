/** Current actor's native views and active saved filters; no self-REST or permission expansion. */
public with sharing class CardstackListCatalog {
    public interface MetadataProvider {
        List<ListView> nativeViews(String objectApi);
    }
    private with sharing class NativeMetadataProvider implements MetadataProvider {
        public List<ListView> nativeViews(String objectApi) {
            return [SELECT Id, Name, DeveloperName FROM ListView WHERE SobjectType = :objectApi WITH USER_MODE ORDER BY Name];
        }
    }
    @TestVisible private static MetadataProvider metadataProvider = new NativeMetadataProvider();
    /** @param objectApi Native object API. @return Current actor's readable metadata; failures propagate. */
    public static List<ListView> nativeViews(String objectApi) {
        Schema.SObjectType objectType = Schema.getGlobalDescribe().get(objectApi);
        if (objectType == null || !objectType.getDescribe().isAccessible()) { return new List<ListView>(); }
        return metadataProvider.nativeViews(objectApi);
    }
    /** @param objectApi Native object API. @return Canonical metadata rows, without saved filter payloads. */
    public static List<Map<String,Object>> available(String objectApi) {
        List<Map<String,Object>> catalog = new List<Map<String,Object>>();
        Schema.SObjectType objectType = Schema.getGlobalDescribe().get(objectApi);
        if (objectType == null || !objectType.getDescribe().isAccessible()) { return catalog; }
        for (ListView view : nativeViews(objectApi)) {
            String key = CardstackConnectionTypes.normalizeId(String.valueOf(view.Id));
            catalog.add(new Map<String,Object>{'kind'=>'salesforce', 'key'=>key, 'viewId'=>key,
                'label'=>view.Name, 'developerName'=>view.DeveloperName, 'availability'=>'available'});
        }
        CardstackListExposurePolicy.requireConfigRead();
        String keyPattern = 'listview:' + objectApi + ':%';
        List<Cardstack_Config__c> saved = [SELECT Name, Value__c FROM Cardstack_Config__c
            WHERE Name LIKE :keyPattern AND Is_Active__c = true WITH USER_MODE ORDER BY Name];
        // LIKE treats underscore as a wildcard; check the literal canonical prefix as well.
        String prefix = 'listview:' + objectApi + ':';
        for (Cardstack_Config__c row : saved) {
            if (!row.Name.startsWith(prefix)) { continue; }
            String label = row.Name.substring(prefix.length());
            String availability = 'available';
            try {
                Map<String,Object> filters = (Map<String,Object>)JSON.deserializeUntyped(row.Value__c);
                if (filters == null) { throw new CardstackListExposurePolicy.PolicyException('Invalid saved filters.'); }
                if (filters.get('displayName') instanceof String && !String.isBlank((String)filters.get('displayName'))) { label = (String)filters.get('displayName'); }
            } catch (Exception invalidSaved) { availability = 'unavailable'; }
            catalog.add(new Map<String,Object>{'kind'=>'cardstack','key'=>row.Name,'label'=>label,'availability'=>availability});
        }
        return catalog;
    }
}
