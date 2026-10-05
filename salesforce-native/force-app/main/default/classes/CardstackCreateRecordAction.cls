/**
 * Cardstack native port of `crm_create_record`.
 *
 * Creates a new CRM record. Denylisted and read-only fields are not accepted.
 * Creation has no confirmation diff to mint a token against, so the write is
 * recorded as model-initiated.
 *
 * Security: `with sharing` + WITH_USER_MODE (via `as user` DML).
 */
global with sharing class CardstackCreateRecordAction {

    @InvocableMethod(
        label='Cardstack Create Record'
        description='Create a new CRM record. Read-only fields are not accepted. Returns the new record id and a link.'
    )
    global static List<CreateRecordResponse> createRecord(List<CreateRecordRequest> requests) {
        List<CreateRecordResponse> responses = new List<CreateRecordResponse>();
        for (CreateRecordRequest req : requests) {
            responses.add(doCreate(req));
        }
        return responses;
    }

    private static CreateRecordResponse doCreate(CreateRecordRequest req) {
        String objectName = String.isBlank(req.objectName) ? 'Task' : req.objectName.trim();
        Schema.SObjectType t = Schema.getGlobalDescribe().get(objectName);
        if (t == null || !t.getDescribe().isCreateable()) {
            throw new CardstackException('Object not createable: ' + objectName);
        }
        if (req.fields == null || req.fields.isEmpty()) {
            throw new CardstackException('At least one field value is required.');
        }
        Map<String, Schema.SObjectField> fieldMap = t.getDescribe().fields.getMap();

        SObject rec = t.newSObject();
        for (CardstackPreviewUpdateAction.PatchEntry p : req.fields) {
            String f = p.fieldApiName.trim();
            if (!fieldMap.containsKey(f)) {
                throw new CardstackException('Unknown field: ' + f);
            }
            Schema.DescribeFieldResult fdr = fieldMap.get(f).getDescribe();
            if (!fdr.isCreateable()) {
                throw new CardstackException('Field is not writable: ' + f);
            }
            rec.put(f, coerceValue(fdr, p.newValue));
        }

        try {
            insert as user rec;
        } catch (DmlException de) {
            // Structured DML failure — never let it escape the invocable.
            return dmlFailureResponse(req, objectName, de, rec);
        }

        // Structured audit log for the UI diff renderer.
        try {
            Map<String, Object> fieldVals = new Map<String, Object>();
            for (CardstackPreviewUpdateAction.PatchEntry p : req.fields) {
                fieldVals.put(p.fieldApiName.trim(), p.newValue);
            }
            Map<String, Object> detail = new Map<String, Object>{
                'objectName' => objectName,
                'fields' => fieldVals
            };
            CardstackAuditService.logAction(
                'CREATE', 'CardstackCreateRecordAction', (String) rec.get('Id'),
                JSON.serialize(detail)
            );
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'Cardstack audit write failed: ' + e.getMessage());
        }

        CreateRecordResponse res = new CreateRecordResponse();
        res.objectName = objectName;
        res.recordId = (String) rec.get('Id');
        res.recordUrl = URL.getOrgDomainUrl().toExternalForm() + '/' + res.recordId;
        res.dmlFailed = false;
        res.showSuccess = true;
        res.summary = 'Created ' + objectName + ' (id ' + res.recordId + '). Logged as model-initiated.';
        return res;
    }

    /**
     * Build a structured failure response when the insert is blocked by
     * validation rules, duplicates, required fields, or triggers.
     */
    @TestVisible
    private static CreateRecordResponse dmlFailureResponse(
        CreateRecordRequest req, String objectName, DmlException de, SObject attempted
    ) {
        List<CardstackDmlError.DmlErrorDetail> errors =
            CardstackDmlError.parse(de, objectName);

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

        try {
            CardstackAuditService.logAction(
                'CREATE_BLOCKED', 'CardstackCreateRecordAction', null,
                JSON.serialize(new Map<String, Object>{
                    'objectName' => objectName,
                    'errors' => errors
                })
            );
        } catch (Exception ex) {
            System.debug(LoggingLevel.WARN,
                'Cardstack audit blocked-create failed: ' + ex.getMessage());
        }

        CreateRecordResponse res = new CreateRecordResponse();
        res.objectName = objectName;
        res.dmlFailed = true;
        res.showSuccess = false;
        res.dmlErrors = errors;
        res.possibleDuplicates = dups;
        Integer n = errors.size();
        res.dmlErrorSummary = 'Couldn\'t save — ' + n
            + (n == 1 ? ' problem: ' : ' problems: ')
            + errors[0].message;
        res.summary = res.dmlErrorSummary
            + ' Nothing was created. Reply with corrected values to retry.';
        return res;
    }

    private static Object coerceValue(Schema.DescribeFieldResult fdr, String raw) {
        if (raw == null || raw == 'null') {
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

    global class CreateRecordRequest {
        @InvocableVariable(label='Object API Name' description='Object API name; defaults to Task.')
        public String objectName;

        @InvocableVariable(label='Fields' description='Field values as field-api-name → value pairs.' required=true)
        public List<CardstackPreviewUpdateAction.PatchEntry> fields;
    }

    global class CreateRecordResponse {
        @InvocableVariable(label='Object API Name')
        public String objectName;

        @InvocableVariable(label='Record ID')
        public String recordId;

        @InvocableVariable(label='Record URL')
        public String recordUrl;

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

    public class CardstackException extends Exception {}
}
