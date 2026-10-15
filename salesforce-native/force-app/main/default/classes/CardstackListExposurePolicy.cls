/** Published, restrictive list exposure policy. Drafts never authorize runtime. */
public with sharing class CardstackListExposurePolicy {
    public class PolicyException extends Exception {}
    private static final String DENIED = 'List not available in chat. Check the published list policy and your Salesforce access.';
    public class Policy {
        public Integer version;
        public String mode = 'legacy';
        public Boolean allowAdHoc = true;
        public Set<String> views = new Set<String>();
        public Set<String> customLists = new Set<String>();
    }
    /** @param objectApi Native object name. @return Published policy; unreadable is denied. */
    public static Policy loadPublished(String objectApi) {
        try {
            requireConfigRead();
            String key = 'exposures:' + objectApi;
            List<Cardstack_Config__c> rows = [
                SELECT Value__c FROM Cardstack_Config__c
                WHERE Name = :key AND Is_Active__c = true WITH USER_MODE LIMIT 1
            ];
            if (rows.isEmpty()) { return new Policy(); }
            // An active empty configuration is corrupt, not an absent policy.
            if (String.isBlank(rows[0].Value__c)) { throw new PolicyException(DENIED); }
            return parse(objectApi, rows[0].Value__c);
        } catch (Exception failure) {
            Policy denied = new Policy(); denied.mode = 'denied'; denied.allowAdHoc = false;
            return denied;
        }
    }
    /** @param key Stored surface. @param json Candidate JSON. @throws PolicyException Invalid policy. */
    public static void validateCandidate(String key, String json) {
        if (key == null || !key.startsWith('exposures:')) { return; }
        if (!Pattern.matches('exposures:[A-Za-z][A-Za-z0-9_]*', key) || String.isBlank(json)) {
            throw new PolicyException(DENIED);
        }
        parse(key.substring('exposures:'.length()), json);
    }
    /** @param policy Published decision. @param targetKind Source kind. @param canonicalKey Full identity. @return Whether selected. */
    public static Boolean isAllowed(Policy policy, String targetKind, String canonicalKey) {
        if (policy == null || policy.mode == 'denied') { return false; }
        if (policy.mode == 'legacy') { return true; }
        if (targetKind == 'cardstack') { return policy.customLists.contains(canonicalKey); }
        if (targetKind != 'salesforce') { return false; }
        try { return policy.views.contains(CardstackConnectionTypes.normalizeId(canonicalKey)); }
        catch (Exception invalidIdentity) { return false; }
    }
    /** @param policy Published decision. @return Whether an unnamed request is allowed. */
    public static Boolean allowsAdHoc(Policy policy) {
        return policy != null && policy.mode != 'denied' && policy.allowAdHoc == true;
    }
    /** Shared preflight for user-mode policy and saved-filter reads. */
    public static void requireConfigRead() {
        if (!Schema.sObjectType.Cardstack_Config__c.isAccessible()
            || !Schema.sObjectType.Cardstack_Config__c.fields.Name.isAccessible()
            || !Schema.sObjectType.Cardstack_Config__c.fields.Value__c.isAccessible()
            || !Schema.sObjectType.Cardstack_Config__c.fields.Is_Active__c.isAccessible()) {
            throw new PolicyException(DENIED);
        }
    }
    @TestVisible private static Policy parse(String objectApi, String raw) {
        if (raw == null) { return new Policy(); }
        try {
            Object decoded = JSON.deserializeUntyped(raw);
            if (!(decoded instanceof Map<String,Object>)) { throw new PolicyException(DENIED); }
            Map<String,Object> value = (Map<String,Object>)decoded;
            if (!value.containsKey('version')) {
                if (!isLegacy(value)) { throw new PolicyException(DENIED); }
                return new Policy();
            }
            Object version = value.get('version');
            if (!(version instanceof Integer) && !(version instanceof Decimal)) { throw new PolicyException(DENIED); }
            if (Decimal.valueOf(String.valueOf(version)) != 1) { throw new PolicyException(DENIED); }
            Policy policy = new Policy(); policy.mode = 'explicit'; policy.version = 1; policy.allowAdHoc = false;
            if (value.containsKey('allowAdHoc')) {
                if (!(value.get('allowAdHoc') instanceof Boolean)) { throw new PolicyException(DENIED); }
                policy.allowAdHoc = (Boolean)value.get('allowAdHoc');
            }
            readTargets(value.get('views'), 'viewId', objectApi, policy.views);
            readTargets(value.get('customLists'), 'key', objectApi, policy.customLists);
            return policy;
        } catch (Exception invalidPolicy) {
            throw new PolicyException(DENIED, invalidPolicy);
        }
    }
    private static void readTargets(Object rawRows, String identityField, String objectApi, Set<String> allowed) {
        if (!(rawRows instanceof List<Object>)) { throw new PolicyException(DENIED); }
        Set<String> seen = new Set<String>();
        for (Object rawRow : (List<Object>)rawRows) {
            if (!(rawRow instanceof Map<String,Object>)) { throw new PolicyException(DENIED); }
            Map<String,Object> row = (Map<String,Object>)rawRow;
            if (!(row.get(identityField) instanceof String) || !(row.get('enabled') instanceof Boolean)) { throw new PolicyException(DENIED); }
            String key = (String)row.get(identityField);
            if (identityField == 'viewId') {
                key = CardstackConnectionTypes.normalizeId(key);
                if (!key.startsWith('00B')) { throw new PolicyException(DENIED); }
            } else if (!key.startsWith('listview:' + objectApi + ':')
                || !Pattern.matches('listview:[A-Za-z][A-Za-z0-9_]*:[a-z0-9_]+', key)) {
                throw new PolicyException(DENIED);
            }
            if (seen.contains(key)) { throw new PolicyException(DENIED); }
            seen.add(key);
            if ((Boolean)row.get('enabled')) { allowed.add(key); }
        }
    }
    private static Boolean isLegacy(Map<String,Object> value) {
        if (value.containsKey('allowAdHoc') || !(value.get('views') instanceof List<Object>)) { return false; }
        for (Object raw : (List<Object>)value.get('views')) {
            if (!(raw instanceof Map<String,Object>)) { return false; }
            Map<String,Object> row = (Map<String,Object>)raw;
            if (!(row.get('viewId') instanceof String) || !(row.get('exposed') instanceof Boolean) || row.containsKey('enabled')) { return false; }
        }
        if (!value.containsKey('customLists')) { return true; }
        if (!(value.get('customLists') instanceof List<Object>)) { return false; }
        for (Object raw : (List<Object>)value.get('customLists')) {
            if (!(raw instanceof Map<String,Object>)) { return false; }
            Map<String,Object> row = (Map<String,Object>)raw;
            if (!(row.get('id') instanceof String) || !(row.get('name') instanceof String)
                || row.containsKey('enabled') || row.containsKey('key')) { return false; }
        }
        return true;
    }
}
