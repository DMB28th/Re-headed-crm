/** Checks the retained Home invocable schema after retirement. */
@IsTest
private class CardstackHomeActionTest {
    @IsTest
    static void cachedHomeReturnsRetirementWithoutQueries() {
        insert new Task(Subject = 'Private follow-up', Status = 'Not Started', OwnerId = UserInfo.getUserId());
        insert new Opportunity(Name = 'Private pipeline', StageName = 'Prospecting', CloseDate = Date.today().addDays(30), Amount = 42000);
        Test.startTest();
        Integer beforeQueries = Limits.getQueries();
        List<CardstackHomeAction.HomeResponse> result = CardstackHomeAction.home(
            new List<CardstackHomeAction.HomeRequest>{new CardstackHomeAction.HomeRequest()});
        Assert.areEqual(beforeQueries, Limits.getQueries(), 'Cached Home calls must not query CRM data.');
        Test.stopTest();
        Assert.areEqual(1, result.size(), 'Preserve one result per input.');
        Assert.areEqual(0, result[0].tasks.size(), 'No CRM task rows remain.');
        Assert.areEqual(0, result[0].recent.size(), 'No CRM recent rows remain.');
        Assert.areEqual(0, result[0].openTaskCount, 'No CRM task count remains.');
        Assert.areEqual(0, result[0].openOpportunityCount, 'No CRM pipeline count remains.');
        Assert.areEqual('', result[0].openPipelineTotal, 'No CRM pipeline amount remains.');
        Assert.areEqual('', result[0].userName, 'No user identity is exposed.');
        Assert.areEqual('Home Card has been retired. Request a record or list instead.', result[0].summary, 'Explain retirement.');
    }

    @IsTest
    static void cachedHomePreservesBulkResponseCardinality() {
        List<CardstackHomeAction.HomeRequest> requests = new List<CardstackHomeAction.HomeRequest>();
        for (Integer index = 0; index < 251; index++) requests.add(new CardstackHomeAction.HomeRequest());
        Test.startTest();
        List<CardstackHomeAction.HomeResponse> result = CardstackHomeAction.home(requests);
        Assert.areEqual(0, Limits.getQueries(), 'Bulk cached Home calls must not query.');
        Test.stopTest();
        Assert.areEqual(requests.size(), result.size(), 'Every cached request receives a retirement result.');
        for (CardstackHomeAction.HomeResponse response : result) {
            Assert.areEqual(0, response.tasks.size(), 'Bulk result has no tasks.');
            Assert.areEqual(0, response.recent.size(), 'Bulk result has no CRM rows.');
        }
    }
}
