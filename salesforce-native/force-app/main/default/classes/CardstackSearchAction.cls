/**
 * Cardstack HXL spike — native Salesforce port of the `crm_search` golden path.
 *
 * In the Node implementation, `crm_search` runs against a CrmAdapter and returns
 * a results-table payload for the React widget. Here the same responsibility is
 * split the HXL way:
 *
 *   - This class returns PLAIN DATA only (a purpose-built row shape, formatted
 *     in Apex, capped in Apex).
 *   - The UI lives in uiWidgets/cardstackResults (Mosaic JSON).
 *   - lightningTypes/cardstackSearchOutputValues types the payload,
 *     lightningTypes/cardstackSearchResult types the MCP envelope and carries
 *     renderer.json, which binds data properties onto widget attributes.
 *   - mcpServerDefinitions/CardstackSpike publishes the tool + ui:// resource.
 *
 * Security: `with sharing` + WITH_USER_MODE, so the query runs as the asking
 * user with their sharing rules and field-level security enforced.
 */
global with sharing class CardstackSearchAction {

    private static final Integer DEFAULT_LIMIT = 5;
    private static final Integer MAX_LIMIT = 10;
    private static final Decimal TOP_ACCOUNT_THRESHOLD = 100000000;

    @InvocableMethod(
        label='Cardstack Search'
        description='Searches Salesforce Accounts by name and returns a scannable results list with industry, revenue, and a link to each record. Use when the user asks to search, find, or look up accounts or customers by name.'
    )
    global static List<SearchResponse> search(List<SearchRequest> requests) {
        List<SearchResponse> responses = new List<SearchResponse>();
        for (SearchRequest req : requests) {
            responses.add(doSearch(req));
        }
        return responses;
    }

    private static SearchResponse doSearch(SearchRequest req) {
        Integer lim = DEFAULT_LIMIT;
        if (req != null && req.maxResults != null && req.maxResults > 0) {
            lim = Math.min(req.maxResults, MAX_LIMIT);
        }

        String term = (req == null || String.isBlank(req.searchTerm))
            ? null
            : '%' + req.searchTerm.trim() + '%';

        List<Account> rows = term == null
            ? [SELECT Id, Name, Industry, AnnualRevenue
               FROM Account
               WITH USER_MODE
               ORDER BY AnnualRevenue DESC NULLS LAST
               LIMIT :lim]
            : [SELECT Id, Name, Industry, AnnualRevenue
               FROM Account
               WHERE Name LIKE :term
               WITH USER_MODE
               ORDER BY AnnualRevenue DESC NULLS LAST
               LIMIT :lim];

        SearchResponse res = new SearchResponse();
        res.results = new List<SearchResultRow>();
        for (Account a : rows) {
            res.results.add(toRow(a));
        }
        res.count = rows.size();
        res.summary = rows.isEmpty()
            ? 'No accounts found.'
            : String.valueOf(rows.size()) + (rows.size() == 1 ? ' account' : ' accounts')
              + (term == null ? ' by revenue' : ' matching your search');
        return res;
    }

    private static SearchResultRow toRow(Account a) {
        SearchResultRow r = new SearchResultRow();
        r.recordId = a.Id;
        r.name = a.Name;
        // Substitute placeholders server-side: the Mosaic expression language
        // interpolates, it doesn't compute. A blank badge looks broken.
        r.industry = String.isBlank(a.Industry) ? 'Not set' : a.Industry;
        r.annualRevenue = a.AnnualRevenue == null ? 'Not set' : '$' + a.AnnualRevenue.format();
        r.isTopAccount = a.AnnualRevenue != null && a.AnnualRevenue >= TOP_ACCOUNT_THRESHOLD;
        // Claude has no idea what your org domain is — build absolute URLs here.
        r.recordUrl = URL.getOrgDomainUrl().toExternalForm() + '/' + a.Id;
        return r;
    }

    global class SearchRequest {
        @InvocableVariable(
            label='Search Term'
            description='Full or partial Account name. Leave blank for the highest-revenue accounts.')
        public String searchTerm;

        @InvocableVariable(
            label='Max Results'
            description='How many accounts to return. Defaults to 5, capped at 10.')
        public Integer maxResults;
    }

    global class SearchResponse {
        @InvocableVariable(label='Results')
        public List<SearchResultRow> results;

        @InvocableVariable(label='Summary')
        public String summary;

        @InvocableVariable(label='Count')
        public Integer count;
    }

    /**
     * Deliberately narrow row shape. Every field is multiplied by the row
     * count in the payload the host receives — design list rows down,
     * not across.
     */
    global class SearchResultRow {
        @InvocableVariable public String recordId;
        @InvocableVariable public String name;
        @InvocableVariable public String industry;
        @InvocableVariable public String annualRevenue;
        @InvocableVariable public Boolean isTopAccount;
        @InvocableVariable public String recordUrl;
    }
}
