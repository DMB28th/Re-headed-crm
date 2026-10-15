/** Authorized single-Opportunity reads, optional lock, currency and exact freshness. */
public with sharing class CardstackOpportunitySelector {
    private static final Set<String> BASE_FIELDS = new Set<String>{'Id', 'Name', 'StageName', 'CloseDate', 'Amount', 'SystemModstamp'};
    /**
     * @param recordId Intended Opportunity identity.
     * @param requiredFields Published/required field projection.
     * @param lockRecord Whether the future user-mode freshness read requires locking.
     * @return User-mode typed record and currency/freshness context.
     * @throws ReadException When identity, fields, rights or context are unavailable.
     */
    public static CardstackOpportunityEditTypes.RecordContext read(Id recordId, Set<String> requiredFields, Boolean lockRecord) {
        requireIdentity(recordId);
        if (requiredFields == null || lockRecord == null) { throw new ReadException('INVALID_READ_REQUEST'); }
        Schema.DescribeSObjectResult describe = Opportunity.SObjectType.getDescribe();
        if (UserInfo.getUserType().equals('Guest') || !describe.isAccessible()) { throw new ReadException('RECORD_UNAVAILABLE'); }
        Map<String, Schema.SObjectField> schemaFields = describe.fields.getMap();
        Set<String> fields = new Set<String>(BASE_FIELDS);
        fields.addAll(requiredFields);
        if (schemaFields.containsKey('RecordTypeId')) { fields.add('RecordTypeId'); }
        Boolean multicurrency = schemaFields.containsKey('CurrencyIsoCode');
        if (multicurrency) { fields.add('CurrencyIsoCode'); }
        List<String> orderedFields = requireFields(fields, schemaFields);
        SObject record = queryRecord(recordId, orderedFields, lockRecord);
        CardstackOpportunityEditTypes.RecordContext result = new CardstackOpportunityEditTypes.RecordContext();
        result.record = record;
        result.currencyCode = multicurrency ? (String)record.get('CurrencyIsoCode') : UserInfo.getDefaultCurrency();
        if (result.currencyCode == null || !Pattern.matches('[A-Z]{3}', result.currencyCode)) {
            throw new ReadException('MISSING_CURRENCY');
        }
        try {
            String typeContext = CardstackOpportunityEditTypes.getRecordTypeContext(record);
            List<Object> parts = new List<Object>{'opportunity-read/v1', typeContext, result.currencyCode};
            for (String field : orderedFields) { parts.add(new List<Object>{field, record.get(field)}); }
            result.freshness = CardstackOpportunityEditTypes.digest(parts);
        } catch (CardstackOpportunityEditTypes.ContextException error) {
            throw new ReadException('RECORD_UNAVAILABLE', error);
        }
        return result;
    }

    private static void requireIdentity(Id recordId) {
        if (recordId == null) { throw new ReadException('INVALID_RECORD'); }
        try {
            CardstackConnectionTypes.normalizeId(String.valueOf(recordId));
        } catch (CardstackConnectionTypes.ConnectionException error) {
            throw new ReadException('INVALID_RECORD', error);
        }
        if (recordId.getSObjectType() != Opportunity.SObjectType) { throw new ReadException('UNSUPPORTED_OBJECT'); }
    }

    private static List<String> requireFields(Set<String> fields, Map<String, Schema.SObjectField> schemaFields) {
        List<String> result = new List<String>();
        for (String field : fields) {
            Schema.SObjectField schemaField = schemaFields.get(field);
            if (schemaField == null || !schemaField.getDescribe().getName().equals(field)) { throw new ReadException('UNKNOWN_FIELD'); }
            if (!schemaField.getDescribe().isAccessible()) { throw new ReadException('RECORD_UNAVAILABLE'); }
            result.add(field);
        }
        result.sort();
        return result;
    }

    private static SObject queryRecord(Id recordId, List<String> fields, Boolean lockRecord) {
        String soql = 'SELECT ' + String.join(fields, ',') + ' FROM Opportunity WHERE Id = :recordId LIMIT 1';
        if (lockRecord) { soql += ' FOR UPDATE'; }
        try {
            List<SObject> records = Database.queryWithBinds(soql, new Map<String, Object>{'recordId' => recordId}, AccessLevel.USER_MODE);
            if (records.isEmpty()) { throw new ReadException('RECORD_UNAVAILABLE'); }
            return records[0];
        } catch (QueryException error) {
            throw new ReadException('RECORD_UNAVAILABLE', error);
        }
    }
    /** Bounded selector rejection. */
    public class ReadException extends Exception {}
}
