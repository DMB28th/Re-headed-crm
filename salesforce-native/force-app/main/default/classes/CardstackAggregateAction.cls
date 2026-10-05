/**
 * Cardstack native port of `crm_aggregate`.
 *
 * Server-side count — and sum of a numeric field — across matching records,
 * optionally grouped by a field. Uses dynamic SOQL with GROUP BY so totals
 * are exact even when a row listing would paginate.
 *
 * Security: `with sharing` + WITH USER_MODE on all SOQL.
 */
global with sharing class CardstackAggregateAction {

    private static final Integer MAX_GROUPS = 20;

    @InvocableMethod(
        label='Cardstack Aggregate'
        description='Count records — and sum a numeric field — across all matching records, optionally grouped by a field. Use for "total pipeline", "deals by stage", "count by owner". Totals are exact.'
    )
    global static List<AggregateResponse> aggregate(List<AggregateRequest> requests) {
        List<AggregateResponse> responses = new List<AggregateResponse>();
        for (AggregateRequest req : requests) {
            responses.add(doAggregate(req));
        }
        return responses;
    }

    private static AggregateResponse doAggregate(AggregateRequest req) {
        String objectName = String.isBlank(req.objectName) ? 'Opportunity' : req.objectName.trim();
        Schema.SObjectType t = Schema.getGlobalDescribe().get(objectName);
        if (t == null) {
            throw new CardstackException('Unknown object: ' + objectName);
        }
        Schema.DescribeSObjectResult d = t.getDescribe();
        if (!d.isAccessible()) {
            throw new CardstackException('Object not accessible: ' + objectName);
        }

        // Validate group-by and sum fields against the describe.
        Map<String, Schema.SObjectField> fields = d.fields.getMap();
        String groupBy = String.isBlank(req.groupBy) ? null : req.groupBy.trim();
        if (groupBy != null && !fields.containsKey(groupBy)) {
            throw new CardstackException('Unknown field for group-by: ' + groupBy);
        }
        String sumField = String.isBlank(req.sumField) ? defaultSumField(d) : req.sumField.trim();
        if (sumField != null && !fields.containsKey(sumField)) {
            throw new CardstackException('Unknown field for sum: ' + sumField);
        }

        String soql = buildAggregateSoql(objectName, groupBy, sumField, req, fields);
        List<AggregateRow> rows = new List<AggregateRow>();
        for (AggregateResult ar : Database.query(soql)) {
            AggregateRow r = new AggregateRow();
            r.groupLabel = groupBy == null
                ? 'all'
                : (ar.get('g') == null ? '(none)' : String.valueOf(ar.get('g')));
            r.recordCount = (Integer) ar.get('c');
            if (sumField != null) {
                Object s = ar.get('s');
                r.sumValue = s == null ? '—' : formatSum(s);
            }
            rows.add(r);
            if (rows.size() >= MAX_GROUPS) {
                break;
            }
        }

        AggregateResponse res = new AggregateResponse();
        res.objectName = objectName;
        res.groupBy = groupBy;
        res.sumField = sumField;
        res.buckets = rows;
        res.bucketCount = rows.size();
        res.summary = buildSummary(d.getLabelPlural(), groupBy, rows);
        return res;
    }

    private static String defaultSumField(Schema.DescribeSObjectResult d) {
        // Prefer Amount on Opportunity-like objects.
        if (d.fields.getMap().containsKey('Amount')) {
            return 'Amount';
        }
        return null;
    }

    private static String buildAggregateSoql(
        String objectName, String groupBy, String sumField,
        AggregateRequest req, Map<String, Schema.SObjectField> fields
    ) {
        List<String> selectParts = new List<String>();
        if (groupBy != null) {
            selectParts.add(groupBy + ' g');
        }
        selectParts.add('COUNT(Id) c');
        if (sumField != null) {
            selectParts.add('SUM(' + sumField + ') s');
        }
        String soql = 'SELECT ' + String.join(selectParts, ', ') + ' FROM ' + objectName;

        List<String> whereParts = new List<String>();
        // Open-only filter for Opportunity/Task-like objects.
        if (req.openOnly == true) {
            if (fields.containsKey('IsClosed')) {
                whereParts.add('IsClosed = false');
            } else if (fields.containsKey('Status')) {
                whereParts.add('Status != \'Completed\'');
            }
        }
        if (!String.isBlank(req.stage) && fields.containsKey('StageName')) {
            whereParts.add('StageName = \'' + String.escapeSingleQuotes(req.stage.trim()) + '\'');
        }
        if (req.minAmount != null && sumField != null) {
            whereParts.add(sumField + ' >= ' + req.minAmount);
        }
        if (req.maxAmount != null && sumField != null) {
            whereParts.add(sumField + ' <= ' + req.maxAmount);
        }
        if (!whereParts.isEmpty()) {
            soql += ' WHERE ' + String.join(whereParts, ' AND ');
        }
        soql += ' WITH USER_MODE';
        if (groupBy != null) {
            soql += ' GROUP BY ' + groupBy + ' ORDER BY COUNT(Id) DESC LIMIT ' + MAX_GROUPS;
        }
        // Note: no LIMIT on non-grouped aggregate — SOQL forbids it.
        return soql;
    }

    private static String formatSum(Object s) {
        if (s instanceof Decimal) {
            return '$' + ((Decimal) s).format();
        }
        return String.valueOf(s);
    }

    private static String buildSummary(String labelPlural, String groupBy, List<AggregateRow> rows) {
        if (rows.isEmpty()) {
            return labelPlural + ': no matching records';
        }
        List<String> parts = new List<String>();
        for (AggregateRow r : rows) {
            String p = r.groupLabel + ': ' + r.recordCount;
            if (r.sumValue != null) {
                p += ' · sum ' + r.sumValue;
            }
            parts.add(p);
        }
        return labelPlural + (groupBy != null ? ' by ' + groupBy : '') + ' — ' + String.join(parts, '; ');
    }

    global class AggregateRequest {
        @InvocableVariable(label='Object API Name' description='Object API name; defaults to Opportunity.')
        public String objectName;

        @InvocableVariable(label='Group By Field' description='Field API name to group by, e.g. StageName.')
        public String groupBy;

        @InvocableVariable(label='Sum Field' description='Numeric field API name to sum; defaults to Amount.')
        public String sumField;

        @InvocableVariable(label='Stage' description='Filter to a StageName value.')
        public String stage;

        @InvocableVariable(label='Open Only' description='Exclude closed/won/lost records.')
        public Boolean openOnly;

        @InvocableVariable(label='Min Amount' description='Minimum amount bound.')
        public Decimal minAmount;

        @InvocableVariable(label='Max Amount' description='Maximum amount bound.')
        public Decimal maxAmount;
    }

    global class AggregateResponse {
        @InvocableVariable(label='Object API Name')
        public String objectName;

        @InvocableVariable(label='Group By')
        public String groupBy;

        @InvocableVariable(label='Sum Field')
        public String sumField;

        @InvocableVariable(label='Buckets')
        public List<AggregateRow> buckets;

        @InvocableVariable(label='Bucket Count')
        public Integer bucketCount;

        @InvocableVariable(label='Summary')
        public String summary;
    }

    global class AggregateRow {
        @InvocableVariable public String groupLabel;
        @InvocableVariable public Integer recordCount;
        @InvocableVariable public String sumValue;
    }

    public class CardstackException extends Exception {}
}
