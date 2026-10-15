/** Mandatory server-owned audit for one validated Opportunity save; never best-effort. */
public with sharing class CardstackOpportunityWriteAudit {
    // Narrow test-only failures still execute the required native insert.
    @TestVisible private static Boolean failAppend = false;
    @TestVisible private static Integer appendAttempts = 0;
    /**
     * @param recordId Server-validated Opportunity identity; no external entry point.
     * @param receipt Server-validated saved receipt and exact reviewed diff.
     * @throws AuditException For invalid context or any required insertion failure.
     */
    public static void appendRequired(Id recordId, CardstackOpportunityEditTypes.Receipt receipt) {
        CardstackConnectionAccess.requireUser();
        if(recordId!=null && recordId.getSObjectType()==Contact.SObjectType) {
            // Preserve the older Contact overload while narrowing membership to
            // one checked published capability, rather than a Contact whitelist.
            if(receipt==null || receipt.diff==null) throw new AuditException('INVALID_AUDIT_CONTEXT');
            CardstackRecordScreenCapability.Definition matched;
            for(CardstackRecordActionService.Definition action:CardstackRecordActionService.available('Contact')) {
                if(!CardstackRecordScreenCapability.currentOnly(action)) continue;
                CardstackRecordScreenCapability.Definition capability=CardstackRecordScreenCapability.resolveDefinition(recordId,action.name);
                Boolean member=true;
                for(CardstackOpportunityEditTypes.DiffRow diff:receipt.diff) if(diff==null || !CardstackRecordScreenCapability.exactField(capability.fields,diff.fieldApi)) member=false;
                if(member) { matched=capability; break; }
            }
            if(matched!=null) { appendRequired(recordId,receipt,matched); return; }
            throw new AuditException('INVALID_AUDIT_CONTEXT');
        }
        appendRequired(recordId,receipt,null);
    }
    /** Generic audit membership comes from the same revalidated capability as the native writer. */
    public static void appendRequired(Id recordId, CardstackOpportunityEditTypes.Receipt receipt, CardstackRecordScreenCapability.Definition capability) {
        CardstackConnectionAccess.requireUser();
        validate(recordId, receipt, capability);
        String details = JSON.serialize(new Map<String,Object>{'contractVersion'=>capability!=null?'record-write-audit/v1':'opportunity-write-audit/v1', 'receipt'=>receipt});
        if (Blob.valueOf(details).size() > 32768) { throw new AuditException('INVALID_AUDIT_CONTEXT'); }
        Cardstack_Audit_Log__c row = new Cardstack_Audit_Log__c(Action__c='UPDATE', Tool_Name__c=capability!=null?'cardstack_record_edit_transition':'crm_opportunity_edit_confirm',
            User__c=UserInfo.getUserId(), Record_Id__c=CardstackConnectionTypes.normalizeId(String.valueOf(recordId)),
            Timestamp__c=Datetime.now(), Details__c=details);
        if (Test.isRunningTest()) {
            appendAttempts++;
            if (failAppend) { row.Action__c = null; }
        }
        // Named access/actor/target/receipt were validated above. Ordinary audit CRUD
        // stays ungranted; this required insert cannot strip fields or swallow errors.
        try { insert as system row; }
        catch (DmlException error) { throw new AuditException('AUDIT_UNAVAILABLE', error); }
    }
    private static void validate(Id recordId, CardstackOpportunityEditTypes.Receipt receipt, CardstackRecordScreenCapability.Definition capability) {
        if(capability!=null) CardstackRecordScreenCapability.validate(capability.objectApiName,capability.action,capability.published);
        if (recordId == null || recordId.getSObjectType()!=(capability==null?Opportunity.SObjectType:capability.objectType) || receipt == null
            || receipt.status != 'saved' || receipt.reference == null || !Pattern.matches('receipt-[0-9a-f]{32}', receipt.reference)
            || receipt.actorDisplayName != UserInfo.getName() || receipt.completedAt == null
            || !Pattern.matches('[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z', receipt.completedAt)
            || receipt.diff == null || receipt.diff.isEmpty() || receipt.diff.size() > (capability!=null ? 20 : 3)) { throw new AuditException('INVALID_AUDIT_CONTEXT'); }
        Set<String> fields = new Set<String>();
        for (CardstackOpportunityEditTypes.DiffRow diff : receipt.diff) {
            if (diff == null || !(capability!=null ? CardstackRecordScreenCapability.exactField(capability.fields,diff.fieldApi) : new Set<String>{'StageName','CloseDate','Amount'}.contains(diff.fieldApi))
                || fields.contains(diff.fieldApi) || String.isBlank(diff.label)
                || (diff.beforeValue == null ? diff.afterValue == null : diff.beforeValue.equals(diff.afterValue))
                || (diff.afterValue == null && (capability==null ? diff.fieldApi != 'Amount' : !capability.policy.clearableFields.contains(diff.fieldApi)))) { throw new AuditException('INVALID_AUDIT_CONTEXT'); }
            fields.add(diff.fieldApi);
        }
    }
    /** Required audit failure propagates to the save transaction. */
    public class AuditException extends Exception {}
}
