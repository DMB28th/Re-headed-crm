@IsTest
private class CardstackListObjectsActionTest {

    @IsTest
    static void listsCoreObjectsWithLabels() {
        List<CardstackListObjectsAction.ListObjectsResponse> resps =
            CardstackListObjectsAction.listObjects(
                new List<CardstackListObjectsAction.ListObjectsRequest>{
                    new CardstackListObjectsAction.ListObjectsRequest()
                });

        System.assertEquals(1, resps.size(), 'one response per request');
        CardstackListObjectsAction.ListObjectsResponse res = resps[0];
        System.assert(res.count >= 3, 'at least Account, Opportunity, Contact: ' + res.count);
        Set<String> apis = new Set<String>();
        for (CardstackListObjectsAction.ObjectSummary o : res.objects) {
            apis.add(o.apiName);
            System.assertNotEquals(null, o.label, 'label populated for ' + o.apiName);
            System.assert(o.keyFields.contains('Id'), 'Id in key fields for ' + o.apiName);
            System.assert(o.keyFields.contains('Name'), 'Name in key fields for ' + o.apiName);
        }
        System.assert(apis.contains('Account'), 'Account listed');
        System.assert(res.summary.contains(String.valueOf(res.count)), 'summary: ' + res.summary);
    }

    @IsTest
    static void emptyRequestListReturnsEmpty() {
        List<CardstackListObjectsAction.ListObjectsResponse> resps =
            CardstackListObjectsAction.listObjects(
                new List<CardstackListObjectsAction.ListObjectsRequest>());
        System.assertEquals(0, resps.size(), 'no requests → no responses');
    }

    @IsTest
    static void multipleRequestsGetMultipleResponses() {
        List<CardstackListObjectsAction.ListObjectsRequest> reqs =
            new List<CardstackListObjectsAction.ListObjectsRequest>{
                new CardstackListObjectsAction.ListObjectsRequest(),
                new CardstackListObjectsAction.ListObjectsRequest()
            };
        List<CardstackListObjectsAction.ListObjectsResponse> resps =
            CardstackListObjectsAction.listObjects(reqs);
        System.assertEquals(2, resps.size());
        System.assertEquals(resps[0].count, resps[1].count, 'deterministic across requests');
    }
}
