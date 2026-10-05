@IsTest
private class CardstackAggregateActionTest {

    @IsTest
    static void groupByStageReturnsBucketsWithSums() {
        insert new List<Opportunity>{
            new Opportunity(Name = 'Agg A', StageName = 'Prospecting', CloseDate = Date.today().addDays(30), Amount = 10000),
            new Opportunity(Name = 'Agg B', StageName = 'Prospecting', CloseDate = Date.today().addDays(30), Amount = 20000),
            new Opportunity(Name = 'Agg C', StageName = 'Qualification', CloseDate = Date.today().addDays(30), Amount = 5000)
        };

        CardstackAggregateAction.AggregateRequest req =
            new CardstackAggregateAction.AggregateRequest();
        req.objectName = 'Opportunity';
        req.groupBy = 'StageName';

        List<CardstackAggregateAction.AggregateResponse> resps =
            CardstackAggregateAction.aggregate(
                new List<CardstackAggregateAction.AggregateRequest>{ req });

        CardstackAggregateAction.AggregateResponse res = resps[0];
        System.assertEquals('Opportunity', res.objectName);
        System.assertEquals('StageName', res.groupBy);
        System.assertEquals('Amount', res.sumField, 'Amount is the default sum field');
        System.assertEquals(2, res.bucketCount, 'two stages');

        Map<String, CardstackAggregateAction.AggregateRow> byGroup =
            new Map<String, CardstackAggregateAction.AggregateRow>();
        for (CardstackAggregateAction.AggregateRow r : res.buckets) {
            byGroup.put(r.groupLabel, r);
        }
        System.assertEquals(2, byGroup.get('Prospecting').recordCount);
        System.assert(byGroup.get('Prospecting').sumValue.contains('30,000'),
            'sum formatted: ' + byGroup.get('Prospecting').sumValue);
        System.assertEquals(1, byGroup.get('Qualification').recordCount);
        System.assert(res.summary.contains('Opportunities'), 'summary: ' + res.summary);
    }

    @IsTest
    static void noGroupByReturnsSingleAllBucket() {
        insert new Opportunity(Name = 'Agg Solo', StageName = 'Prospecting',
            CloseDate = Date.today().addDays(30), Amount = 7000);

        CardstackAggregateAction.AggregateRequest req =
            new CardstackAggregateAction.AggregateRequest();
        req.objectName = 'Opportunity';

        List<CardstackAggregateAction.AggregateResponse> resps =
            CardstackAggregateAction.aggregate(
                new List<CardstackAggregateAction.AggregateRequest>{ req });

        CardstackAggregateAction.AggregateResponse res = resps[0];
        System.assertEquals(1, res.bucketCount);
        System.assertEquals('all', res.buckets[0].groupLabel);
        System.assertEquals(1, res.buckets[0].recordCount);
    }

    @IsTest
    static void unknownObjectThrows() {
        CardstackAggregateAction.AggregateRequest req =
            new CardstackAggregateAction.AggregateRequest();
        req.objectName = 'NoSuchObject__c';

        try {
            CardstackAggregateAction.aggregate(
                new List<CardstackAggregateAction.AggregateRequest>{ req });
            System.assert(false, 'expected exception for unknown object');
        } catch (CardstackAggregateAction.CardstackException e) {
            System.assert(e.getMessage().contains('Unknown object'), e.getMessage());
        }
    }

    @IsTest
    static void unknownGroupByFieldThrows() {
        CardstackAggregateAction.AggregateRequest req =
            new CardstackAggregateAction.AggregateRequest();
        req.objectName = 'Opportunity';
        req.groupBy = 'NoSuchField__c';

        try {
            CardstackAggregateAction.aggregate(
                new List<CardstackAggregateAction.AggregateRequest>{ req });
            System.assert(false, 'expected exception for unknown group-by field');
        } catch (CardstackAggregateAction.CardstackException e) {
            System.assert(e.getMessage().contains('Unknown field'), e.getMessage());
        }
    }
}
