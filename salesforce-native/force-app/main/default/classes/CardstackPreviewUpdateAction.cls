/**
 * Cardstack native port of `crm_preview_update`.
 *
 * Computes the before/after diff for a proposed update WITHOUT writing, and
 * mints a confirmation token bound to the changed fields. Only fields that
 * actually change belong in the diff — the token is bound to those, so a
 * no-op field can't ride along into the write.
 *
 * Security: `with sharing` + WITH_USER_MODE.
 */
global with sharing class CardstackPreviewUpdateAction {

    @InvocableMethod(
        label='Cardstack Preview Update'
        description='Preview a record update: computes the before/after diff without writing, and mints a confirmation token. Pass the token to Cardstack Update Record to apply.'
    )
    global static List<PreviewUpdateResponse> preview(List<PreviewUpdateRequest> requests) {
        List<PreviewUpdateResponse> responses = new List<PreviewUpdateResponse>();
        for (PreviewUpdateRequest req : requests) {
            responses.add(doPreview(req));
        }
        return responses;
    }

    private static PreviewUpdateResponse doPreview(PreviewUpdateRequest req) {
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

        // Fetch current values for the patched fields (deduplicated).
        Set<String> fieldSet = new Set<String>{ 'Id', 'Name' };
        for (PatchEntry p : req.changes) {
            if (String.isBlank(p.fieldApiName) || !fields.containsKey(p.fieldApiName.trim())) {
                throw new CardstackException('Unknown field: ' + p.fieldApiName);
            }
            if (!fields.get(p.fieldApiName.trim()).getDescribe().isUpdateable()) {
                throw new CardstackException('Field is not writable: ' + p.fieldApiName);
            }
            fieldSet.add(p.fieldApiName.trim());
        }
        List<String> fieldNames = new List<String>(fieldSet);
        String recId = req.recordId;
        List<SObject> rows = Database.query(
            'SELECT ' + String.join(fieldNames, ', ') + ' FROM ' + objectName
            + ' WHERE Id = :recId WITH USER_MODE LIMIT 1'
        );
        if (rows.isEmpty()) {
            throw new CardstackException('Record not found: ' + req.recordId);
        }
        SObject rec = rows[0];

        // Diff: only fields that actually change. Keep coerced values for the trial.
        List<DiffRow> diffs = new List<DiffRow>();
        List<String> changedFields = new List<String>();
        Map<String, Object> coercedByField = new Map<String, Object>();
        for (PatchEntry p : req.changes) {
            String f = p.fieldApiName.trim();
            Object beforeVal = rec.get(f);
            Object afterVal = coerceValue(fields.get(f).getDescribe(), p.newValue);
            if (!valuesEqual(beforeVal, afterVal)) {
                DiffRow dr = new DiffRow();
                dr.fieldApi = f;
                dr.label = fields.get(f).getDescribe().getLabel();
                dr.beforeValue = beforeVal == null ? '—' : String.valueOf(beforeVal);
                dr.afterValue = afterVal == null ? '—' : String.valueOf(afterVal);
                diffs.add(dr);
                changedFields.add(f);
                coercedByField.put(f, afterVal);
            }
        }
        if (diffs.isEmpty()) {
            throw new CardstackException(
                'Nothing to change — every value matches what\'s already in the CRM.');
        }

        // Trial write inside a savepoint: surfaces validation-rule / duplicate /
        // trigger failures BEFORE the user confirms, without committing anything.
        List<CardstackDmlError.DmlErrorDetail> predictedErrors =
            new List<CardstackDmlError.DmlErrorDetail>();
        Savepoint sp = Database.setSavepoint();
        try {
            SObject trial = Schema.getGlobalDescribe().get(objectName).newSObject();
            trial.put('Id', req.recordId);
            for (String f : coercedByField.keySet()) {
                trial.put(f, coercedByField.get(f));
            }
            update as user trial;
        } catch (DmlException de) {
            predictedErrors = CardstackDmlError.parse(de, objectName);
        } catch (Exception e) {
            // Trial infrastructure failure — never fail the preview itself.
            System.debug(LoggingLevel.WARN,
                'Cardstack preview trial failed: ' + e.getMessage());
        } finally {
            Database.rollback(sp);
        }

        // Token bound to the changed fields.
        changedFields.sort();
        String subject = 'update:' + objectName + ':' + req.recordId + ':'
            + String.join(changedFields, ',');
        CardstackConfirmToken.ConfirmToken minted = CardstackConfirmToken.mint(subject);

        PreviewUpdateResponse res = new PreviewUpdateResponse();
        res.objectName = objectName;
        res.recordId = req.recordId;
        res.recordName = String.valueOf(rec.get('Name'));
        res.changes = diffs;
        res.confirmToken = minted.token;
        res.expiresAt = minted.expiresAt;
        res.hasPredictedErrors = !predictedErrors.isEmpty();
        res.predictedErrors = predictedErrors;
        List<String> lines = new List<String>();
        for (DiffRow dr : diffs) {
            lines.add('- ' + dr.label + ': ' + dr.beforeValue + ' → ' + dr.afterValue);
        }
        res.summary = 'Proposed changes to ' + res.recordName
            + ' — nothing written yet:\n' + String.join(lines, '\n');
        if (res.hasPredictedErrors) {
            List<String> errLines = new List<String>();
            for (CardstackDmlError.DmlErrorDetail e : predictedErrors) {
                String lbl = String.isBlank(e.fieldLabel) ? '' : e.fieldLabel + ': ';
                errLines.add('- ' + lbl + e.message);
            }
            res.summary += '\n\n⚠ This will fail if applied:\n'
                + String.join(errLines, '\n');
        }
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

    private static Boolean valuesEqual(Object a, Object b) {
        if (a == null && b == null) {
            return true;
        }
        if (a == null || b == null) {
            return false;
        }
        return String.valueOf(a) == String.valueOf(b);
    }

    global class PreviewUpdateRequest {
        @InvocableVariable(label='Record ID' description='Id of the record to update.' required=true)
        public String recordId;

        @InvocableVariable(label='Changes' description='Field changes as field-api-name → new-value pairs.' required=true)
        public List<PatchEntry> changes;
    }

    global class PatchEntry {
        @InvocableVariable public String fieldApiName;
        @InvocableVariable public String newValue;
    }

    global class PreviewUpdateResponse {
        @InvocableVariable(label='Object API Name')
        public String objectName;

        @InvocableVariable(label='Record ID')
        public String recordId;

        @InvocableVariable(label='Record Name')
        public String recordName;

        @InvocableVariable(label='Changes')
        public List<DiffRow> changes;

        @InvocableVariable(label='Confirm Token')
        public String confirmToken;

        @InvocableVariable(label='Expires At')
        public String expiresAt;

        @InvocableVariable(label='Has Predicted Errors')
        public Boolean hasPredictedErrors;

        @InvocableVariable(label='Predicted Errors')
        public List<CardstackDmlError.DmlErrorDetail> predictedErrors;

        @InvocableVariable(label='Summary')
        public String summary;
    }

    global class DiffRow {
        @InvocableVariable public String fieldApi;
        @InvocableVariable public String label;
        @InvocableVariable public String beforeValue;
        @InvocableVariable public String afterValue;
    }

    public class CardstackException extends Exception {}
}
