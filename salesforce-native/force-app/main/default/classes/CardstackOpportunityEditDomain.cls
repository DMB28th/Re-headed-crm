/** Exact three-field Opportunity review domain; no queries, DML or persistence. */
public with sharing class CardstackOpportunityEditDomain {
    private static final List<String> FIELDS = new List<String>{'Amount', 'CloseDate', 'StageName'};
    /**
     * @param current Authorized current record context.
     * @param stages Fresh record-type-scoped native Stage context.
     * @param policy Restrictive published field policy.
     * @param changes Literal proposed set/clear operations; omitted fields are unchanged.
     * @return Sorted exact typed patch/diff, excluding equivalent current values.
     * @throws ValidationException For unavailable context, denied fields or invalid literals.
     */
    public static CardstackOpportunityEditTypes.CanonicalPatch canonicalize(
        CardstackOpportunityEditTypes.RecordContext current, CardstackOpportunityEditTypes.StageContext stages,
        CardstackOpportunityEditTypes.Policy policy, List<CardstackOpportunityEditTypes.FieldChange> changes) {
        requireContext(current, stages, policy);
        if (changes == null) { throw new ValidationException('INVALID_CHANGES'); }
        Map<String, CardstackOpportunityEditTypes.FieldChange> byField = indexChanges(changes);
        CardstackOpportunityEditTypes.CanonicalPatch result = new CardstackOpportunityEditTypes.CanonicalPatch();
        List<Object> digestParts = new List<Object>{'opportunity-patch/v1'};
        for (String field : FIELDS) {
            if (!byField.containsKey(field)) { continue; }
            Schema.DescribeFieldResult describe = Opportunity.SObjectType.getDescribe().fields.getMap().get(field).getDescribe();
            if (!policy.editableFields.contains(field) || !describe.isAccessible() || !describe.isUpdateable()) {
                throw new ValidationException('FIELD_NOT_EDITABLE');
            }
            Object before = readValue(current.record, field);
            Object after = parseChange(byField.get(field), before, describe, stages, policy);
            String beforeValue = displayValue(field, before);
            String afterValue = displayValue(field, after);
            if (beforeValue == null ? afterValue == null : beforeValue.equals(afterValue)) { continue; }
            appendChange(result, field, describe.getLabel(), beforeValue, afterValue, after);
            digestParts.add(new List<Object>{field, afterValue});
        }
        validateRequiredResult(current.record, policy, result.typedValues);
        result.digest = CardstackOpportunityEditTypes.digest(digestParts);
        return result;
    }

    private static void validateRequiredResult(SObject record, CardstackOpportunityEditTypes.Policy policy,
        Map<String, Object> proposedValues) {
        Map<String, Schema.SObjectField> schemaFields = Opportunity.SObjectType.getDescribe().fields.getMap();
        Set<String> required = new Set<String>(policy.requiredFields);
        for (String field : FIELDS) {
            if (!schemaFields.get(field).getDescribe().isNillable()) { required.add(field); }
        }
        for (String field : required) {
            Schema.SObjectField schemaField = schemaFields.get(field);
            if (schemaField == null || !schemaField.getDescribe().getName().equals(field)) {
                throw new ValidationException('INVALID_POLICY');
            }
            if (!schemaField.getDescribe().isAccessible()) { throw new ValidationException('FIELD_NOT_EDITABLE'); }
            Object value = proposedValues.containsKey(field) ? proposedValues.get(field) : readValue(record, field);
            if (value == null || (value instanceof String && String.isBlank((String)value))) {
                throw new ValidationException('FIELD_REQUIRED');
            }
        }
    }

    private static void requireContext(CardstackOpportunityEditTypes.RecordContext current,
        CardstackOpportunityEditTypes.StageContext stages, CardstackOpportunityEditTypes.Policy policy) {
        if (current == null || current.record == null || current.record.getSObjectType() != Opportunity.SObjectType) {
            throw new ValidationException('MISSING_RECORD_CONTEXT');
        }
        Schema.DescribeSObjectResult describe = Opportunity.SObjectType.getDescribe();
        if (UserInfo.getUserType().equals('Guest') || !describe.isAccessible() || !describe.isUpdateable()) {
            throw new ValidationException('FIELD_NOT_EDITABLE');
        }
        if (policy == null || policy.editableFields == null || policy.requiredFields == null || policy.clearableFields == null) {
            throw new ValidationException('INVALID_POLICY');
        }
        if (current.currencyCode == null || !Pattern.matches('[A-Z]{3}', current.currencyCode)) {
            throw new ValidationException('MISSING_CURRENCY');
        }
        String nativeCurrency = describe.fields.getMap().containsKey('CurrencyIsoCode')
            ? (String)readValue(current.record, 'CurrencyIsoCode') : UserInfo.getDefaultCurrency();
        if (nativeCurrency == null || !current.currencyCode.equals(nativeCurrency)) {
            throw new ValidationException('MISSING_CURRENCY');
        }
        if (stages == null || String.isBlank(stages.recordTypeId) || String.isBlank(stages.fingerprint)
            || stages.choices == null || stages.choices.isEmpty()) { throw new ValidationException('MISSING_STAGE_CONTEXT'); }
        try {
            String actualContext = CardstackOpportunityEditTypes.getRecordTypeContext(current.record);
            String stageContext = CardstackOpportunityEditTypes.requireRecordTypeContext(stages.recordTypeId);
            if (!actualContext.equals(stageContext)) { throw new ValidationException('MISSING_STAGE_CONTEXT'); }
        } catch (CardstackOpportunityEditTypes.ContextException error) {
            throw new ValidationException('MISSING_STAGE_CONTEXT', error);
        }
        for (CardstackOpportunityEditTypes.Choice choice : stages.choices) {
            if (choice == null || String.isBlank(choice.value)) { throw new ValidationException('MISSING_STAGE_CONTEXT'); }
        }
    }

    private static Map<String, CardstackOpportunityEditTypes.FieldChange> indexChanges(
        List<CardstackOpportunityEditTypes.FieldChange> changes) {
        Map<String, CardstackOpportunityEditTypes.FieldChange> result = new Map<String, CardstackOpportunityEditTypes.FieldChange>();
        for (CardstackOpportunityEditTypes.FieldChange change : changes) {
            Boolean known = false;
            if (change != null && change.fieldApi != null) {
                for (String field : FIELDS) { if (field.equals(change.fieldApi)) { known = true; break; } }
            }
            if (!known) { throw new ValidationException('UNKNOWN_FIELD'); }
            if (result.containsKey(change.fieldApi)) { throw new ValidationException('DUPLICATE_FIELD'); }
            result.put(change.fieldApi, change);
        }
        return result;
    }

    private static Object parseChange(CardstackOpportunityEditTypes.FieldChange change, Object before,
        Schema.DescribeFieldResult describe, CardstackOpportunityEditTypes.StageContext stages,
        CardstackOpportunityEditTypes.Policy policy) {
        if (change.operation != null && change.operation.equals('clear')) {
            if (change.value != null) { throw new ValidationException('INVALID_OPERATION'); }
            if (!change.fieldApi.equals('Amount') || !describe.isNillable() || policy.requiredFields.contains(change.fieldApi)
                || !policy.clearableFields.contains(change.fieldApi)) { throw new ValidationException('CLEAR_NOT_ALLOWED'); }
            return null;
        }
        if (change.operation == null || !change.operation.equals('set') || change.value == null) {
            throw new ValidationException('INVALID_OPERATION');
        }
        if (change.fieldApi.equals('Amount')) { return parseAmount(change.value, describe); }
        if (change.fieldApi.equals('CloseDate')) { return parseDate(change.value); }
        if (String.isBlank(change.value) || change.value.length() > describe.getLength()) {
            throw new ValidationException('INVALID_STAGE');
        }
        // A retired current API value may be kept; it cannot be selected as a new value.
        if (before != null && change.value.equals((String)before)) { return before; }
        for (CardstackOpportunityEditTypes.Choice choice : stages.choices) {
            if (change.value.equals(choice.value)) { return choice.value; }
        }
        throw new ValidationException('INVALID_STAGE');
    }

    private static Date parseDate(String literal) {
        if (!Pattern.matches('[0-9]{4}-[0-9]{2}-[0-9]{2}', literal)) { throw new ValidationException('INVALID_DATE'); }
        try {
            Date parsed = Date.newInstance(Integer.valueOf(literal.substring(0, 4)), Integer.valueOf(literal.substring(5, 7)),
                Integer.valueOf(literal.substring(8, 10)));
            if (!literal.equals(calendarString(parsed))) { throw new ValidationException('INVALID_DATE'); }
            return parsed;
        } catch (TypeException error) {
            throw new ValidationException('INVALID_DATE', error);
        }
    }

    private static Decimal parseAmount(String literal, Schema.DescribeFieldResult describe) {
        if (!Pattern.matches('-?[0-9]+(\\.[0-9]+)?', literal)) { throw new ValidationException('INVALID_AMOUNT'); }
        Boolean negative = literal.startsWith('-');
        String unsigned = negative ? literal.substring(1) : literal;
        Integer dot = unsigned.indexOf('.');
        String whole = dot < 0 ? unsigned : unsigned.substring(0, dot);
        String fraction = dot < 0 ? '' : unsigned.substring(dot + 1);
        if (fraction.length() > describe.getScale()) { throw new ValidationException('AMOUNT_SCALE'); }
        String significantWhole = whole.replaceFirst('^0+', '');
        if (significantWhole.length() > describe.getPrecision() - describe.getScale()) {
            throw new ValidationException('AMOUNT_PRECISION');
        }
        String normalized = (negative ? '-' : '') + (significantWhole == '' ? '0' : significantWhole)
            + (fraction == '' ? '' : '.' + fraction);
        try {
            return Decimal.valueOf(normalized);
        } catch (TypeException error) {
            throw new ValidationException('INVALID_AMOUNT', error);
        }
    }

    private static String displayValue(String field, Object value) {
        if (value == null) { return null; }
        if (field.equals('CloseDate')) { return calendarString((Date)value); }
        if (!field.equals('Amount')) { return String.valueOf(value); }
        Decimal amount = (Decimal)value;
        if (amount == 0) { return '0'; }
        String plain = amount.toPlainString();
        if (plain.contains('.')) { plain = plain.replaceFirst('0+$', '').replaceFirst('\\.$', ''); }
        return plain;
    }

    private static String calendarString(Date value) {
        String year = String.valueOf(value.year());
        while (year.length() < 4) { year = '0' + year; }
        return year + '-' + (value.month() < 10 ? '0' : '') + String.valueOf(value.month())
            + '-' + (value.day() < 10 ? '0' : '') + String.valueOf(value.day());
    }

    private static Object readValue(SObject record, String field) {
        try {
            return record.get(field);
        } catch (SObjectException error) {
            throw new ValidationException('MISSING_RECORD_CONTEXT', error);
        }
    }

    private static void appendChange(CardstackOpportunityEditTypes.CanonicalPatch result, String field, String label,
        String beforeValue, String afterValue, Object after) {
        CardstackPreviewUpdateAction.PatchEntry entry = new CardstackPreviewUpdateAction.PatchEntry();
        entry.fieldApiName = field;
        entry.newValue = afterValue;
        result.entries.add(entry);
        result.typedValues.put(field, after);
        CardstackOpportunityEditTypes.DiffRow row = new CardstackOpportunityEditTypes.DiffRow();
        row.fieldApi = field;
        // Preserve literal JSON text; future DOM rendering must use textContent.
        row.label = label;
        row.beforeValue = beforeValue;
        row.afterValue = afterValue;
        result.diff.add(row);
    }
    /** Bounded domain validation failure. */
    public class ValidationException extends Exception {}
}
