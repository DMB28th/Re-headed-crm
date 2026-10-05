/**
 * Cardstack native port of `crm_lookup_search`.
 *
 * Typeahead for reference-field lookup editors: given a target object and
 * name text, returns the top matches with id + name. Used when the model
 * needs to resolve a lookup value (e.g. which Account for a new Opportunity).
 *
 * Security: `with sharing` + WITH_USER_MODE on all SOQL.
 */
global with sharing class CardstackLookupSearchAction {

    private static final Integer DEFAULT_LIMIT = 5;
    private static final Integer MAX_LIMIT = 10;

    @InvocableMethod(
        label='Cardstack Lookup Search'
        description='Typeahead search for a reference-field lookup: find records of a target object by name. Use when resolving a lookup value, e.g. which Account a record belongs to.'
    )
    global static List<LookupSearchResponse> lookupSearch(List<LookupSearchRequest> requests) {
        List<LookupSearchResponse> responses = new List<LookupSearchResponse>();
        for (LookupSearchRequest req : requests) {
            responses.add(doLookupSearch(req));
        }
        return responses;
    }

    private static LookupSearchResponse doLookupSearch(LookupSearchRequest req) {
        if (String.isBlank(req.objectName)) {
            throw new CardstackException('objectName is required (e.g. Account, User).');
        }
        if (String.isBlank(req.query)) {
            throw new CardstackException('query is required.');
        }
        String objectName = req.objectName.trim();
        Schema.SObjectType t = Schema.getGlobalDescribe().get(objectName);
        if (t == null || !t.getDescribe().isAccessible()) {
            throw new CardstackException('Object not available: ' + objectName);
        }

        Integer lim = DEFAULT_LIMIT;
        if (req.maxRows != null && req.maxRows > 0) {
            lim = Math.min(req.maxRows, MAX_LIMIT);
        }

        String likeTerm = '%' + req.query.trim() + '%';
        List<SObject> rows = Database.query(
            'SELECT Id, Name FROM ' + objectName
            + ' WHERE Name LIKE :likeTerm WITH USER_MODE ORDER BY Name LIMIT :lim'
        );

        LookupSearchResponse res = new LookupSearchResponse();
        res.objectName = objectName;
        res.matches = new List<LookupMatch>();
        for (SObject r : rows) {
            LookupMatch m = new LookupMatch();
            m.recordId = (String) r.get('Id');
            m.name = String.valueOf(r.get('Name'));
            m.recordUrl = URL.getOrgDomainUrl().toExternalForm() + '/' + m.recordId;
            m.cells = new List<String>{ m.name };
            res.matches.add(m);
        }
        res.columns = new List<TableColumn>{ column('Name', 'name') };
        res.count = res.matches.size();
        res.summary = res.count == 0
            ? 'No ' + objectName + ' matches for "' + req.query + '".'
            : res.count + ' ' + objectName + ' match(es) for "' + req.query + '"';
        return res;
    }

    global class LookupSearchRequest {
        @InvocableVariable(label='Object API Name' description='TARGET object API name (e.g. Account, User).' required=true)
        public String objectName;

        @InvocableVariable(label='Query' description='Name text to match.' required=true)
        public String query;

        @InvocableVariable(label='Limit' description='Max matches; defaults to 5, capped at 10.')
        public Integer maxRows;
    }

    global class LookupSearchResponse {
        @InvocableVariable(label='Object API Name')
        public String objectName;

        @InvocableVariable(label='Matches')
        public List<LookupMatch> matches;

        @InvocableVariable(label='Columns' description='Table columns for rendering.')
        public List<TableColumn> columns;

        @InvocableVariable(label='Count')
        public Integer count;

        @InvocableVariable(label='Summary')
        public String summary;
    }

    global class TableColumn {
        @InvocableVariable public String label;
        @InvocableVariable public String apiName;
    }

    private static TableColumn column(String label, String apiName) {
        TableColumn c = new TableColumn();
        c.label = label;
        c.apiName = apiName;
        return c;
    }

    global class LookupMatch {
        @InvocableVariable public String recordId;
        @InvocableVariable public String name;
        @InvocableVariable public String recordUrl;
        @InvocableVariable public List<String> cells;
    }

    public class CardstackException extends Exception {}
}
