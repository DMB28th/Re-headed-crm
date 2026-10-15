/** Published fixed-preset validation; configuration only restricts native rights. */
public with sharing class CardstackOpportunityActionPolicy {
    /**
     * @param objectApi Target object API name.
     * @param action Published action definition, never a draft.
     * @param policy Authoritative published policy already restricted by native rights.
     * @throws PolicyException For unsupported definitions or unavailable field rights.
     */
    public static void validate(String objectApi, CardstackRecordActionService.Definition action,
        CardstackPolicyService.Policy policy) {
        validateShape(objectApi, action);
        if (action.enabled != true) { throw new PolicyException('INVALID_PRESET'); }
        if (policy == null || policy.editEnabled != true) { throw new PolicyException('EDIT_DISABLED'); }
        if (policy.objectApiName == null || !policy.objectApiName.equals('Opportunity')) { throw new PolicyException('INVALID_POLICY'); }
        List<String> fields = new List<String>{'StageName', 'CloseDate', 'Amount'};
        for (Integer index = 0; index < fields.size(); index++) {
            CardstackPolicyService.FieldPolicy field = policy.fields == null ? null : policy.fields.get(fields[index]);
            Schema.DescribeFieldResult nativeField = Opportunity.SObjectType.getDescribe().fields.getMap().get(fields[index]).getDescribe();
            if (field == null || field.apiName == null || !field.apiName.equals(fields[index])
                || field.readOnly || !nativeField.isAccessible() || !nativeField.isUpdateable()) {
                throw new PolicyException('FIELD_NOT_EDITABLE');
            }
        }
        if (!Opportunity.SObjectType.getDescribe().isAccessible() || !Opportunity.SObjectType.getDescribe().isUpdateable()
            || UserInfo.getUserType().equals('Guest')) { throw new PolicyException('FIELD_NOT_EDITABLE'); }
    }
    /**
     * Shared exact preset shape, independent of authorization or enable state.
     * Disabled definitions can reduce rights but cannot substitute another mapping.
     * @param objectApi Target object API name.
     * @param action Candidate or published action definition.
     */
    public static void validateShape(String objectApi, CardstackRecordActionService.Definition action) {
        if (objectApi == null || !objectApi.equals('Opportunity')) { throw new PolicyException('UNSUPPORTED_OBJECT'); }
        if (action == null || action.type == null || !action.type.equals('record-edit')
            || action.flowApiName != null || action.mappings == null || action.mappings.size() != 3) {
            throw new PolicyException('INVALID_PRESET');
        }
        List<String> fields = new List<String>{'StageName', 'CloseDate', 'Amount'};
        for (Integer index = 0; index < fields.size(); index++) {
            CardstackRecordActionService.Mapping mapping = action.mappings[index];
            if (mapping == null || mapping.fieldApi == null || !mapping.fieldApi.equals(fields[index])
                || mapping.source == null || !mapping.source.equals('current')
                || mapping.sourceField != null || mapping.value != null) { throw new PolicyException('INVALID_PRESET'); }
        }
    }
    /**
     * Validates Opportunity authoring candidates at both staging and publication.
     * Other config surfaces and object actions retain their existing contracts.
     * @param key Config key whose value is being staged or published.
     * @param raw Actual candidate JSON, never used as runtime authorization.
     */
    public static void validateLayout(String key, String raw) {
        // Text Name equality in the store ignores case; recognize the same key identity.
        if (key == null || !Pattern.matches('layout:opportunity:[^:]+', key.toLowerCase())) return;
        Map<String,Object> cfg;
        List<CardstackRecordActionService.Definition> actions;
        try {
            cfg = (Map<String,Object>)JSON.deserializeUntyped(raw);
            if (cfg == null || cfg.get('actions') == null) return;
            actions = (List<CardstackRecordActionService.Definition>)JSON.deserialize(JSON.serialize(cfg.get('actions')), List<CardstackRecordActionService.Definition>.class);
        } catch (Exception error) { throw new PolicyException('INVALID_PRESET'); }
        CardstackPolicyService.Policy candidate;
        Boolean genericValidated=false;
        for (CardstackRecordActionService.Definition action : actions) {
            if (action == null || action.type != 'record-edit') continue;
            if(!CardstackRecordScreenCapability.hasStage(action)) {
                if(!genericValidated) {
                    CardstackRecordScreenCapability.validateLayout('layout:Opportunity:default',raw);
                    genericValidated=true;
                }
                continue;
            }
            validateShape('Opportunity', action);
            if (action.enabled == null || String.isBlank(action.label) || action.label.length() > 160
                || String.isBlank(action.name) || !Pattern.matches('[a-zA-Z0-9_-]{1,80}', action.name)) {
                throw new PolicyException('INVALID_PRESET');
            }
            Integer matches = 0;
            for (CardstackRecordActionService.Definition other : actions) {
                if (other != null && other.name == action.name) matches++;
            }
            if (matches != 1 || actions.size() > 20) throw new PolicyException('INVALID_PRESET');
            if (action.enabled == true) {
                if (candidate == null) candidate = CardstackPolicyService.resolveCandidate('Opportunity', raw);
                validate('Opportunity', action, candidate);
            }
        }
    }
    /** Bounded fixed-preset denial. */
    public class PolicyException extends Exception {}
}
