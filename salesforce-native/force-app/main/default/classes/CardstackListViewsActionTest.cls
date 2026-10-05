@IsTest
private class CardstackListViewsActionTest {

    @IsTest
    static void listsViewsForObject() {
        CardstackListViewsAction.ListViewsRequest req =
            new CardstackListViewsAction.ListViewsRequest();
        req.objectName = 'Opportunity';

        List<CardstackListViewsAction.ListViewsResponse> resps =
            CardstackListViewsAction.listViews(
                new List<CardstackListViewsAction.ListViewsRequest>{ req });

        CardstackListViewsAction.ListViewsResponse res = resps[0];
        // Standard list views exist for Opportunity in any org.
        System.assert(res.count > 0, 'expected list views, got ' + res.count);
        System.assertNotEquals(null, res.columns);
        System.assert(!res.views.isEmpty());
        for (CardstackListViewsAction.ViewSummary v : res.views) {
            System.assertNotEquals(null, v.name);
            System.assertNotEquals(null, v.cells);
            System.assertEquals(1, v.cells.size());
        }
        System.assert(res.summary.contains('list view'), res.summary);
    }

    @IsTest
    static void unknownObjectReturnsEmpty() {
        CardstackListViewsAction.ListViewsRequest req =
            new CardstackListViewsAction.ListViewsRequest();
        req.objectName = 'NoSuchObject__c';

        List<CardstackListViewsAction.ListViewsResponse> resps =
            CardstackListViewsAction.listViews(
                new List<CardstackListViewsAction.ListViewsRequest>{ req });

        System.assertEquals(0, resps[0].count);
        System.assert(resps[0].summary.contains('not available'), resps[0].summary);
    }

    @IsTest
    static void defaultsToOpportunity() {
        CardstackListViewsAction.ListViewsRequest req =
            new CardstackListViewsAction.ListViewsRequest();

        List<CardstackListViewsAction.ListViewsResponse> resps =
            CardstackListViewsAction.listViews(
                new List<CardstackListViewsAction.ListViewsRequest>{ req });

        System.assertEquals('Opportunity', resps[0].objectName);
    }
}
