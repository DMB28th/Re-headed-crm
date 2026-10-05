/**
 * Cardstack native port of `crm_update_record`.
 *
 * Writes field changes to a CRM record. Only updateable fields are writable.
 * Pass the confirmToken from crm_preview_update after the user confirms the exact diff. Confirmation is mandatory;
 * the connected user, published policy, values, and record version are verified. Returns per-field outcomes.
 *
 * Security: `with sharing` + WITH_USER_MODE (via `as user` DML).
 */
global with sharing class CardstackUpdateRecordAction {

    @InvocableMethod(
        label='Cardstack Update Record'
        description='Write field changes to a CRM record. Requires the confirmToken from Preview Update for the exact user-confirmed changes. Returns per-field outcomes.'
    )
    global static List<UpdateRecordResponse> updateRecord(List<UpdateRecordRequest> requests) {
        List<UpdateRecordResponse> responses = new List<UpdateRecordResponse>();
        for (UpdateRecordRequest req : requests) {
            responses.add(doUpdate(req));
        }
        return responses;
    }

    private static UpdateRecordResponse doUpdate(UpdateRecordRequest req) {
        if (String.isBlank(req.recordId)) {
            throw new CardstackException('recordId is required.');
        }
        if (req.changes == null || req.changes.isEmpty()) {
            throw new CardstackException('At least one field change is required.');
        }

        String objectName = objectNameForId(req.recordId);
        Schema.DescribeSObjectResult d =
            Schema.getGlobalDescribe().get(objectName).getDescribe();
        Map<String, Schema.SObjectField> fields = d.fields.getMap();

        CardstackPolicyService.Policy policy=CardstackPolicyService.resolve(objectName);
        CardstackPolicyService.validateChanges(policy,req.changes);
        String subject=CardstackConfirmToken.updateSubject(objectName,req.recordId,req.changes,policy.revision);
        Cardstack_Confirmation__c confirmation=CardstackConfirmToken.locked(req.confirmToken,subject);
        if (confirmation.Receipt__c!=null) return (UpdateRecordResponse)JSON.deserialize(confirmation.Receipt__c,UpdateRecordResponse.class);
        String recordId=req.recordId;
        Set<String> reviewFields=new Set<String>{'Id','SystemModstamp'};
        for (CardstackPreviewUpdateAction.PatchEntry entry:req.changes) reviewFields.add(entry.fieldApiName.trim());
        for (CardstackPolicyService.FieldPolicy field:policy.fields.values()) if (field.required) reviewFields.add(field.apiName);
        List<SObject> reviewed=Database.query('SELECT '+String.join(new List<String>(reviewFields),',')+' FROM '+objectName+' WHERE Id=:recordId WITH USER_MODE LIMIT 1 FOR UPDATE');
        if (reviewed.isEmpty()) throw new CardstackException('Record not found.');
        CardstackConfirmToken.assertFresh(confirmation,CardstackConfirmToken.recordVersion(reviewed[0],req.changes));
        CardstackPolicyService.validateResult(policy,reviewed[0],req.changes);
        Boolean repConfirmed=true;

        SObject rec = Schema.getGlobalDescribe().get(objectName).newSObject();
        rec.put('Id', req.recordId);
        List<FieldOutcome> outcomes = new List<FieldOutcome>();
        for (CardstackPreviewUpdateAction.PatchEntry p : req.changes) {
            String f = p.fieldApiName.trim();
            FieldOutcome o = new FieldOutcome();
            o.fieldApi = f;
            if (!fields.containsKey(f)) {
                o.success = false;
                o.message = 'Unknown field: ' + f;
                outcomes.add(o);
                continue;
            }
            if (!fields.get(f).getDescribe().isUpdateable()) {
                o.success = false;
                o.message = 'Field is not writable: ' + f;
                outcomes.add(o);
                continue;
            }
            try {
                Object coerced = coerceValue(fields.get(f).getDescribe(), p.newValue);
                rec.put(f, coerced);
                o.success = true;
                o.message = 'Updated';
            } catch (Exception e) {
                o.success = false;
                o.message = 'Failed: ' + e.getMessage();
            }
            outcomes.add(o);
        }

        // Only write fields that passed validation.
        SObject toWrite = Schema.getGlobalDescribe().get(objectName).newSObject();
        toWrite.put('Id', req.recordId);
        Boolean anyWritable = false;
        for (Integer i = 0; i < req.changes.size(); i++) {
            if (outcomes[i].success) {
                String f = req.changes[i].fieldApiName.trim();
                toWrite.put(f, rec.get(f));
                anyWritable = true;
            }
        }
        if (!anyWritable) {
            throw new CardstackException('No writable fields — nothing was written.');
        }
        // Capture before-values for the audit trail before writing.
        Map<String, String> beforeVals = new Map<String, String>();
        try {
            List<String> changedFields = new List<String>();
            for (Integer i = 0; i < req.changes.size(); i++) {
                if (outcomes[i].success) {
                    changedFields.add(req.changes[i].fieldApiName.trim());
                }
            }
            if (!changedFields.isEmpty()) {
                String soql = 'SELECT ' + String.join(changedFields, ', ')
                    + ' FROM ' + objectName + ' WHERE Id = :recordId WITH USER_MODE LIMIT 1';
                // Bind recordId via local var for the dynamic query.

                List<SObject> existing = Database.query(soql);
                if (!existing.isEmpty()) {
                    for (String f : changedFields) {
                        Object v = existing[0].get(f);
                        beforeVals.put(f, v == null ? null : String.valueOf(v));
                    }
                }
            }
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'Cardstack audit before-values failed: ' + e.getMessage());
        }

        try {
            update as user toWrite;
        } catch (DmlException de) {
            // Structured DML failure — never let it escape the invocable.
            return dmlFailureResponse(
                req, objectName, outcomes, repConfirmed, de, toWrite
            );
        }

        // Structured audit log with before/after for the UI diff renderer.
        try {
            Map<String, Object> afterVals = new Map<String, Object>();
            for (Integer i = 0; i < req.changes.size(); i++) {
                if (outcomes[i].success) {
                    String f = req.changes[i].fieldApiName.trim();
                    afterVals.put(f, req.changes[i].newValue);
                }
            }
            Map<String, Object> detail = new Map<String, Object>{
                'objectName' => objectName,
                'before' => beforeVals,
                'after' => afterVals,
                'confirmedBy' => repConfirmed ? 'rep' : 'model'
            };
            CardstackAuditService.logAction(
                'UPDATE', 'CardstackUpdateRecordAction', req.recordId,
                JSON.serialize(detail)
            );
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'Cardstack audit write failed: ' + e.getMessage());
        }

        UpdateRecordResponse res = new UpdateRecordResponse();
        res.objectName = objectName;
        res.recordId = req.recordId;
        res.outcomes = outcomes;
        res.confirmedBy = repConfirmed ? 'rep' : 'model';
        res.dmlFailed = false;
        res.showSuccess = true;
        Integer okCount = 0;
        for (FieldOutcome o : outcomes) {
            if (o.success) {
                okCount++;
            }
        }
        res.summary = 'Updated ' + okCount + ' field(s) on ' + req.recordId
            + '. Logged as ' + (repConfirmed ? 'rep-confirmed' : 'model-initiated') + '.';
        CardstackConfirmToken.complete(confirmation,res);
        return res;
    }

    /**
     * Build a structured failure response when the DML write is blocked by
     * validation rules, duplicates, required fields, or triggers.
     * Marks the affected field outcomes as failed and audit-logs the failure.
     */
    @TestVisible
    private static UpdateRecordResponse dmlFailureResponse(
        UpdateRecordRequest req, String objectName, List<FieldOutcome> outcomes,
        Boolean repConfirmed, DmlException de, SObject attempted
    ) {
        List<CardstackDmlError.DmlErrorDetail> errors =
            CardstackDmlError.parse(de, objectName);

        // Reflect the failure onto per-field outcomes where fields match.
        for (CardstackDmlError.DmlErrorDetail e : errors) {
            if (String.isBlank(e.fieldApi)) {
                continue;
            }
            for (String f : e.fieldApi.split(',')) {
                String fa = f.trim();
                for (FieldOutcome o : outcomes) {
                    if (o.fieldApi == fa && o.success) {
                        o.success = false;
                        o.message = e.message;
                    }
                }
            }
        }

        // Duplicate candidates for the card's "looks like a duplicate of X".
        List<CardstackDmlError.DuplicateCandidate> dups =
            new List<CardstackDmlError.DuplicateCandidate>();
        if (CardstackDmlError.hasDuplicate(errors)) {
            Map<String, Object> vals = new Map<String, Object>();
            try {
                for (String k : attempted.getPopulatedFieldsAsMap().keySet()) {
                    vals.put(k, attempted.get(k));
                }
            } catch (Exception ex) {}
            dups = CardstackDmlError.findCandidates(objectName, vals);
        }

        // Audit-log the blocked write (best effort, never throws).
        try {
            CardstackAuditService.logAction(
                'UPDATE_BLOCKED', 'CardstackUpdateRecordAction', req.recordId,
                JSON.serialize(new Map<String, Object>{
                    'objectName' => objectName,
                    'errors' => errors,
                    'confirmedBy' => repConfirmed ? 'rep' : 'model'
                })
            );
        } catch (Exception ex) {
            System.debug(LoggingLevel.WARN,
                'Cardstack audit blocked-write failed: ' + ex.getMessage());
        }

        UpdateRecordResponse res = new UpdateRecordResponse();
        res.objectName = objectName;
        res.recordId = req.recordId;
        res.outcomes = outcomes;
        res.confirmedBy = repConfirmed ? 'rep' : 'model';
        res.dmlFailed = true;
        res.showSuccess = false;
        res.dmlErrors = errors;
        res.possibleDuplicates = dups;
        Integer n = errors.size();
        res.dmlErrorSummary = 'Couldn\'t save — ' + n
            + (n == 1 ? ' problem: ' : ' problems: ')
            + errors[0].message;
        res.summary = res.dmlErrorSummary
            + ' Nothing was written. Reply with corrected values to retry.';
        return res;
    }

    private static String objectNameForId(String recordId) {
        String prefix = recordId.substring(0, 3);
        for (Schema.SObjectType t : Schema.getGlobalDescribe().values()) {
            Schema.DescribeSObjectResult d = t.getDescribe();
            if (prefix.equals(d.getKeyPrefix())) {
                return d.getName();
            }
        }
        throw new CardstackException('Cannot resolve object for id: ' + recordId);
    }

    private static Object coerceValue(Schema.DescribeFieldResult fdr, String raw) {
        if (raw == null) {
            return null;
        }
        Schema.DisplayType dt = fdr.getType();
        if (dt == Schema.DisplayType.Boolean) {
            return Boolean.valueOf(raw);
        }
        if (dt == Schema.DisplayType.Integer) {
            return Integer.valueOf(raw);
        }
        if (dt == Schema.DisplayType.Double || dt == Schema.DisplayType.Currency
            || dt == Schema.DisplayType.Percent) {
            return Decimal.valueOf(raw);
        }
        if (dt == Schema.DisplayType.Date) {
            return Date.valueOf(raw);
        }
        if (dt == Schema.DisplayType.DateTime) {
            return Datetime.valueOf(raw);
        }
        return raw;
    }

    global class UpdateRecordRequest {
        @InvocableVariable(label='Record ID' description='Id of the record to update.' required=true)
        public String recordId;

        @InvocableVariable(label='Changes' description='Field changes as field-api-name → new-value pairs.' required=true)
        public List<CardstackPreviewUpdateAction.PatchEntry> changes;

        @InvocableVariable(label='Confirm Token' description='Required token from Preview Update for these exact user-confirmed changes. Do not invent one.' required=true)
        public String confirmToken;
    }

    global class UpdateRecordResponse {
        @InvocableVariable(label='Object API Name')
        public String objectName;

        @InvocableVariable(label='Record ID')
        public String recordId;

        @InvocableVariable(label='Field Outcomes')
        public List<FieldOutcome> outcomes;

        @InvocableVariable(label='Confirmed By')
        public String confirmedBy;

        @InvocableVariable(label='DML Failed')
        public Boolean dmlFailed;

        @InvocableVariable(label='Show Success')
        public Boolean showSuccess;

        @InvocableVariable(label='DML Error Summary')
        public String dmlErrorSummary;

        @InvocableVariable(label='DML Errors')
        public List<CardstackDmlError.DmlErrorDetail> dmlErrors;

        @InvocableVariable(label='Possible Duplicates')
        public List<CardstackDmlError.DuplicateCandidate> possibleDuplicates;

        @InvocableVariable(label='Summary')
        public String summary;
    }

    global class FieldOutcome {
        @InvocableVariable public String fieldApi;
        @InvocableVariable public Boolean success;
        @InvocableVariable public String message;
    }

    public class CardstackException extends Exception {}
}
