@IsTest
private class CardstackListViewsActionTest {
    private class FixtureViews implements CardstackListCatalog.MetadataProvider {
        public List<ListView> nativeViews(String objectApi) {
            return new List<ListView>{(ListView)JSON.deserialize('{"Id":"00B000000000001","Name":"My Opportunities","DeveloperName":"MyOpportunities"}', ListView.class)};
        }
    }
    @TestSetup static void grantPackagePermissions() {
        PermissionSet admin = [SELECT Id FROM PermissionSet WHERE Name='Cardstack_Admin' LIMIT 1];
        if ([SELECT count() FROM PermissionSetAssignment WHERE AssigneeId=:UserInfo.getUserId() AND PermissionSetId=:admin.Id] == 0) {
            insert new PermissionSetAssignment(AssigneeId=UserInfo.getUserId(), PermissionSetId=admin.Id);
        }
    }


    @IsTest
    static void listsViewsForObject() {
        CardstackListViewsAction.ListViewsRequest req =
            new CardstackListViewsAction.ListViewsRequest();
        req.objectName = 'Opportunity';
        CardstackListCatalog.metadataProvider = new FixtureViews();

        List<CardstackListViewsAction.ListViewsResponse> resps =
            CardstackListViewsAction.listViews(
                new List<CardstackListViewsAction.ListViewsRequest>{ req });

        CardstackListViewsAction.ListViewsResponse res = resps[0];
        // Deterministic native metadata; no assumptions about subscriber list views.
        Assert.areEqual(1, res.count, 'The native fixture supplies one readable view.');
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
