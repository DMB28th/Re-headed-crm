/**
 * Fresh record-type-scoped Stage API values from supported API 67 ConnectApi.
 * No generic Describe picklist fallback, credentials, callouts or CRM mutation.
 */
public with sharing class CardstackOpportunityStageProvider {
    /** Native choices boundary; fixture replacement is private and test-visible only. */
    public interface OptionsSource {
        /**
         * @param objectApi Validated Opportunity API name.
         * @param recordTypeId Validated full checksum18 actual/master context.
         * @return Native Stage options; missing context fails closed.
         */
        CardstackOpportunityEditTypes.StageContext fetch(String objectApi, String recordTypeId);
    }
    @TestVisible private static OptionsSource source;

    /**
     * @param objectApi Intended target object API name.
     * @param recordTypeId Actual record type, or platform master context, checksum18.
     * @return Fresh Stage API values/literal JSON display labels and context fingerprint.
     * @throws StageUnavailableException For denied/unsupported/unreadable context.
     */
    public static CardstackOpportunityEditTypes.StageContext resolve(String objectApi, String recordTypeId) {
        if (objectApi == null || !objectApi.equals('Opportunity')) {
            throw new StageUnavailableException('UNSUPPORTED_OBJECT');
        }
        Schema.DescribeSObjectResult objectDescribe = Opportunity.SObjectType.getDescribe();
        Schema.DescribeFieldResult stageDescribe = Opportunity.StageName.getDescribe();
        if (UserInfo.getUserType().equals('Guest') || !objectDescribe.isAccessible()
            || !objectDescribe.isUpdateable() || !stageDescribe.isAccessible() || !stageDescribe.isUpdateable()) {
            throw new StageUnavailableException('STAGE_ACCESS_DENIED');
        }
        String contextId;
        try {
            contextId = CardstackOpportunityEditTypes.requireRecordTypeContext(recordTypeId);
        } catch (CardstackOpportunityEditTypes.ContextException error) {
            throw new StageUnavailableException('STAGE_CONTEXT_UNAVAILABLE', error);
        }
        OptionsSource boundary = Test.isRunningTest() && source != null ? source : new NativeOptionsSource();
        CardstackOpportunityEditTypes.StageContext raw;
        try {
            raw = boundary.fetch(objectApi, contextId);
        } catch (Exception error) {
            throw new StageUnavailableException('STAGE_CONTEXT_UNAVAILABLE', error);
        }
        return copyAndFingerprint(raw, contextId, stageDescribe.getLength());
    }

    private static CardstackOpportunityEditTypes.StageContext copyAndFingerprint(
        CardstackOpportunityEditTypes.StageContext raw, String contextId, Integer maxLength) {
        if (raw == null || raw.recordTypeId == null || !raw.recordTypeId.equals(contextId)
            || raw.choices == null || raw.choices.isEmpty()) {
            throw new StageUnavailableException('STAGE_CONTEXT_UNAVAILABLE');
        }
        CardstackOpportunityEditTypes.StageContext result = new CardstackOpportunityEditTypes.StageContext();
        result.recordTypeId = contextId;
        Set<String> seen = new Set<String>();
        for (CardstackOpportunityEditTypes.Choice item : raw.choices) {
            if (item == null || String.isBlank(item.value) || item.value.length() > maxLength
                || item.label == null || item.label.length() > 255 || seen.contains(item.value)) {
                throw new StageUnavailableException('STAGE_CONTEXT_UNAVAILABLE');
            }
            seen.add(item.value);
            CardstackOpportunityEditTypes.Choice choice = new CardstackOpportunityEditTypes.Choice();
            choice.value = item.value;
            // Preserve Unicode/native JSON text; future DOM rendering must use textContent.
            choice.label = item.label;
            result.choices.add(choice);
        }
        List<String> values = new List<String>(seen);
        values.sort();
        result.fingerprint = CardstackOpportunityEditTypes.digest(
            new List<Object>{'opportunity-stage/v1', 'Opportunity', 'StageName', contextId, values});
        return result;
    }

    /**
     * Pure mapping shared by supported native fetch and typed response unit fixtures.
     * @param collection Typed native response; no API/session substitution.
     * @param recordTypeId Already authorized full actual/master context.
     * @return Only literal StageName values/labels; null indicates unavailable context.
     */
    @TestVisible private static CardstackOpportunityEditTypes.StageContext mapNativeStageValues(
        ConnectApi.PicklistValuesCollection collection, String recordTypeId) {
        if (collection == null || collection.picklistFieldValues == null
            || !collection.picklistFieldValues.containsKey('StageName')) {
            return null;
        }
        ConnectApi.PicklistValues stages = collection.picklistFieldValues.get('StageName');
        if (stages == null || stages.values == null
            || (stages.controllerValues != null && !stages.controllerValues.isEmpty())) {
            return null;
        }
        CardstackOpportunityEditTypes.StageContext result = new CardstackOpportunityEditTypes.StageContext();
        result.recordTypeId = recordTypeId;
        for (ConnectApi.PicklistValue item : stages.values) {
            if (item == null) { return null; }
            CardstackOpportunityEditTypes.Choice choice = new CardstackOpportunityEditTypes.Choice();
            choice.label = item.label;
            choice.value = item.value;
            result.choices.add(choice);
        }
        return result;
    }

    /** Only the supported native API obtains runtime Stage choices. */
    private with sharing class NativeOptionsSource implements OptionsSource {
        /**
         * @param objectApi Validated Opportunity API name.
         * @param recordTypeId Validated actual/master checksum18 context.
         * @return Only the native StageName options; null indicates unavailable capability.
         */
        public CardstackOpportunityEditTypes.StageContext fetch(String objectApi, String recordTypeId) {
            ConnectApi.PicklistValuesCollection collection = ConnectApi.RecordUi.getPicklistValuesByRecordType(objectApi, recordTypeId);
            return CardstackOpportunityStageProvider.mapNativeStageValues(collection, recordTypeId);
        }
    }
    /** Bounded provider capability failure. */
    public class StageUnavailableException extends Exception {}
}
