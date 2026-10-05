@IsTest
private class CardstackSearchActionTest {

    @IsTest
    static void searchByTermReturnsMatchingAccounts() {
        Account a1 = new Account(Name = 'Spike Acme Corp', Industry = 'Technology', AnnualRevenue = 5000000);
        Account a2 = new Account(Name = 'Spike Globex', Industry = 'Manufacturing', AnnualRevenue = 200000000);
        Account other = new Account(Name = 'Unrelated Industries');
        insert new List<Account>{ a1, a2, other };

        CardstackSearchAction.SearchRequest req = new CardstackSearchAction.SearchRequest();
        req.searchTerm = 'Spike';
        req.maxResults = 10;

        List<CardstackSearchAction.SearchResponse> resps =
            CardstackSearchAction.search(new List<CardstackSearchAction.SearchRequest>{ req });

        System.assertEquals(1, resps.size(), 'one response per request');
        CardstackSearchAction.SearchResponse res = resps[0];
        System.assertEquals(2, res.count, 'only the two Spike accounts match');
        System.assertEquals(2, res.results.size());

        // Ordered by revenue desc: Globex first.
        System.assertEquals('Spike Globex', res.results[0].name);
        System.assertEquals(true, res.results[0].isTopAccount, '200M >= 100M threshold');
        System.assertEquals(false, res.results[1].isTopAccount);
        System.assert(res.results[0].recordUrl.startsWith('http'), 'absolute URL built in Apex');
        System.assertEquals('Manufacturing', res.results[0].industry);
        System.assert(res.summary.contains('2 accounts'), 'human summary string: ' + res.summary);
    }

    @IsTest
    static void blankTermReturnsTopByRevenueAndCapsLimit() {
        List<Account> accts = new List<Account>();
        for (Integer i = 0; i < 15; i++) {
            accts.add(new Account(Name = 'Cap Test ' + i, AnnualRevenue = i * 1000));
        }
        insert accts;

        CardstackSearchAction.SearchRequest req = new CardstackSearchAction.SearchRequest();
        req.maxResults = 999; // over the cap

        List<CardstackSearchAction.SearchResponse> resps =
            CardstackSearchAction.search(new List<CardstackSearchAction.SearchRequest>{ req });

        CardstackSearchAction.SearchResponse res = resps[0];
        System.assertEquals(10, res.count, 'capped at MAX_LIMIT, never caller-chosen');
        System.assert(res.summary.contains('by revenue'), 'blank term summary: ' + res.summary);
    }

    @IsTest
    static void noMatchesReturnsEmptyListWithSummary() {
        CardstackSearchAction.SearchRequest req = new CardstackSearchAction.SearchRequest();
        req.searchTerm = 'Zzz No Such Account';

        List<CardstackSearchAction.SearchResponse> resps =
            CardstackSearchAction.search(new List<CardstackSearchAction.SearchRequest>{ req });

        CardstackSearchAction.SearchResponse res = resps[0];
        System.assertEquals(0, res.count);
        System.assert(res.results.isEmpty());
        System.assertEquals('No accounts found.', res.summary);
    }
}
