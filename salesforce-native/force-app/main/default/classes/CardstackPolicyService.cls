/** Published configuration narrows Salesforce access; drafts never grant writes. */
public with sharing class CardstackPolicyService {
    public class Policy {
        public String objectApiName;
        public String revision;
        public Boolean editEnabled = false;
        public Map<String, FieldPolicy> fields = new Map<String, FieldPolicy>();
    }
    public class FieldPolicy {
        public String apiName;
        public String dataType;
        public Boolean required = false;
        public Boolean readOnly = true;
    }
    public static Policy resolve(String objectApiName) {
        Schema.SObjectType objectType = Schema.getGlobalDescribe().get(objectApiName);
        if (objectType == null || !objectType.getDescribe().isAccessible()) {
            throw new PolicyException('Object is not available.');
        }
        Schema.DescribeSObjectResult describe = objectType.getDescribe();
        Policy policy = new Policy();
        policy.objectApiName = describe.getName();
        String raw = CardstackConfigService.getConfig('layout:' + policy.objectApiName + ':default');
        policy.revision = EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256', Blob.valueOf(raw == null ? '' : raw)));
        if (String.isBlank(raw)) return policy;
        Map<String,Object> cfg;
        try { cfg = (Map<String,Object>) JSON.deserializeUntyped(raw); }
        catch (Exception e) { throw new PolicyException('Published layout is invalid.'); }
        if (cfg == null) return policy;
        Map<String,Object> permissions = mapOf(cfg.get('permissions'));
        policy.editEnabled = enabled(permissions.get('writeEnabled')) && describe.isUpdateable();
        Set<String> denied = new Set<String>();
        for (Object value : listOf(permissions.get('fieldDenylist'))) {
            if (value instanceof String) denied.add(((String)value).trim().toLowerCase());
        }
        List<Object> configured = new List<Object>();
        configured.addAll(listOf(cfg.get('highlights')));
        List<Object> sections = listOf(cfg.get('sections'));
        if (sections.isEmpty()) sections = listOf(mapOf(cfg.get('recordCard')).get('sections'));
        if (sections.isEmpty()) configured.addAll(listOf(cfg.get('fields')));
        else for (Object section : sections) configured.addAll(listOf(mapOf(section).get('fields')));
        Map<String,Schema.SObjectField> fields = describe.fields.getMap();
        for (Object value : configured) {
            Map<String,Object> entry = mapOf(value);
            Object api = entry.get('api') == null ? entry.get('name') : entry.get('api');
            if (!(api instanceof String) || !fields.containsKey(((String)api).trim())) continue;
            Schema.DescribeFieldResult field = fields.get(((String)api).trim()).getDescribe();
            if (!field.isAccessible()) continue;
            FieldPolicy fp = new FieldPolicy();
            fp.apiName = field.getName();
            fp.dataType = String.valueOf(field.getType());
            fp.required = enabled(entry.get('required')) || !field.isNillable();
            fp.readOnly = !policy.editEnabled || !enabled(entry.get('editable'))
                || enabled(entry.get('readOnly')) || !field.isUpdateable()
                || denied.contains(fp.apiName.toLowerCase());
            if (policy.fields.containsKey(fp.apiName)) {
                FieldPolicy previous = policy.fields.get(fp.apiName);
                fp.readOnly = fp.readOnly || previous.readOnly;
                fp.required = fp.required || previous.required;
            }
            policy.fields.put(fp.apiName,fp);
        }
        return policy;
    }
    public static void validateChanges(Policy policy,List<CardstackPreviewUpdateAction.PatchEntry> changes) {
        if (!policy.editEnabled) throw new PolicyException('Chat edits are disabled. Ask an admin to publish a write-enabled layout or open the record in Salesforce.');
        for (CardstackPreviewUpdateAction.PatchEntry change:changes) {
            FieldPolicy field=policy.fields.get(change.fieldApiName.trim());
            if (field==null || field.readOnly) throw new PolicyException('Field is not enabled for chat editing: '+change.fieldApiName);
            if (field.required && String.isBlank(change.newValue)) throw new PolicyException('Required field cannot be blank: '+field.apiName);
        }
    }
    public static void validateResult(Policy policy,SObject record,List<CardstackPreviewUpdateAction.PatchEntry> changes) {
        Map<String,Object> answers=new Map<String,Object>();
        for (CardstackPreviewUpdateAction.PatchEntry change:changes) answers.put(change.fieldApiName.trim(),change.newValue);
        for (FieldPolicy field:policy.fields.values()) {
            if (!field.required) continue;
            Object value=answers.containsKey(field.apiName) ? answers.get(field.apiName) : record.get(field.apiName);
            if (value==null || (value instanceof String && String.isBlank((String)value))) throw new PolicyException('Required field cannot be blank: '+field.apiName);
        }
    }
    private static Boolean enabled(Object value) { return value instanceof Boolean && (Boolean)value; }
    private static Map<String,Object> mapOf(Object value) {
        return value instanceof Map<String,Object> ? (Map<String,Object>)value : new Map<String,Object>();
    }
    private static List<Object> listOf(Object value) {
        return value instanceof List<Object> ? (List<Object>)value : new List<Object>();
    }
    public class PolicyException extends Exception {}
}
