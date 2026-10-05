@IsTest
private class CardstackLookupSearchActionTest {

    @IsTest
    static void findsMatchingAccounts() {
        insert new List<Account>{
            new Account(Name = 'Lookup Stark Industries'),
            new Account(Name = 'Lookup Wayne Enterprises'),
            new Account(Name = 'Unrelated LookupTest')
        };

        CardstackLookupSearchAction.LookupSearchRequest req =
            new CardstackLookupSearchAction.LookupSearchRequest();
        req.objectName = 'Account';
        req.query = 'Lookup';

        List<CardstackLookupSearchAction.LookupSearchResponse> resps =
            CardstackLookupSearchAction.lookupSearch(
                new List<CardstackLookupSearchAction.LookupSearchRequest>{ req });

        CardstackLookupSearchAction.LookupSearchResponse res = resps[0];
        System.assertEquals(3, res.count, 'all three match "Lookup"');
        for (CardstackLookupSearchAction.LookupMatch m : res.matches) {
            System.assertNotEquals(null, m.recordId);
            System.assertNotEquals(null, m.name);
        }
    }

    @IsTest
    static void noMatchesReturnsEmpty() {
        CardstackLookupSearchAction.LookupSearchRequest req =
            new CardstackLookupSearchAction.LookupSearchRequest();
        req.objectName = 'Account';
        req.query = 'Zzz No Such Lookup Qqq';

        List<CardstackLookupSearchAction.LookupSearchResponse> resps =
            CardstackLookupSearchAction.lookupSearch(
                new List<CardstackLookupSearchAction.LookupSearchRequest>{ req });

        CardstackLookupSearchAction.LookupSearchResponse res = resps[0];
        System.assertEquals(0, res.count);
        System.assert(res.matches.isEmpty());
        System.assert(res.summary.contains('No Account matches'), 'summary: ' + res.summary);
    }

    @IsTest
    static void limitIsCapped() {
        List<Account> accts = new List<Account>();
        for (Integer i = 0; i < 15; i++) {
            accts.add(new Account(Name = 'LookupCap ' + i));
        }
        insert accts;

        CardstackLookupSearchAction.LookupSearchRequest req =
            new CardstackLookupSearchAction.LookupSearchRequest();
        req.objectName = 'Account';
        req.query = 'LookupCap';
        req.maxRows = 999;

        List<CardstackLookupSearchAction.LookupSearchResponse> resps =
            CardstackLookupSearchAction.lookupSearch(
                new List<CardstackLookupSearchAction.LookupSearchRequest>{ req });

        System.assertEquals(10, resps[0].count, 'capped at MAX_LIMIT');
    }

    @IsTest
    static void missingQueryThrows() {
        CardstackLookupSearchAction.LookupSearchRequest req =
            new CardstackLookupSearchAction.LookupSearchRequest();
        req.objectName = 'Account';

        try {
            CardstackLookupSearchAction.lookupSearch(
                new List<CardstackLookupSearchAction.LookupSearchRequest>{ req });
            System.assert(false, 'expected exception');
        } catch (CardstackLookupSearchAction.CardstackException e) {
            System.assert(e.getMessage().contains('query is required'), e.getMessage());
        }
    }
}
