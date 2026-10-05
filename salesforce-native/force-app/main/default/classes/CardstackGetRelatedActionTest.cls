@IsTest
private class CardstackGetRelatedActionTest {

    @IsTest
    static void opportunitiesForAccount() {
        Account a = new Account(Name = 'Rel Acme');
        insert a;
        insert new List<Opportunity>{
            new Opportunity(Name = 'Rel Opp 1', AccountId = a.Id, StageName = 'Prospecting',
                CloseDate = Date.today().addDays(30), Amount = 15000),
            new Opportunity(Name = 'Rel Opp 2', AccountId = a.Id, StageName = 'Qualification',
                CloseDate = Date.today().addDays(60), Amount = 25000)
        };

        CardstackGetRelatedAction.GetRelatedRequest req =
            new CardstackGetRelatedAction.GetRelatedRequest();
        req.parentId = a.Id;
        req.relationship = 'Opportunities';

        List<CardstackGetRelatedAction.GetRelatedResponse> resps =
            CardstackGetRelatedAction.getRelated(
                new List<CardstackGetRelatedAction.GetRelatedRequest>{ req });

        CardstackGetRelatedAction.GetRelatedResponse res = resps[0];
        System.assertEquals(a.Id, res.parentId);
        System.assertEquals('Opportunity', res.childObject);
        System.assertEquals(2, res.count);
        System.assertEquals(2, res.rows.size());
        System.assert(res.rows[0].recordUrl.endsWith('/' + res.rows[0].recordId));
        System.assert(res.summary.contains('Opportunities'), 'summary: ' + res.summary);
    }

    @IsTest
    static void limitIsRespectedAndCapped() {
        Account a = new Account(Name = 'Rel Cap Acme');
        insert a;
        List<Contact> contacts = new List<Contact>();
        for (Integer i = 0; i < 5; i++) {
            contacts.add(new Contact(LastName = 'RelCap ' + i, AccountId = a.Id));
        }
        insert contacts;

        CardstackGetRelatedAction.GetRelatedRequest req =
            new CardstackGetRelatedAction.GetRelatedRequest();
        req.parentId = a.Id;
        req.relationship = 'Contacts';
        req.maxRows = 2;

        List<CardstackGetRelatedAction.GetRelatedResponse> resps =
            CardstackGetRelatedAction.getRelated(
                new List<CardstackGetRelatedAction.GetRelatedRequest>{ req });

        System.assertEquals(2, resps[0].count, 'limit applied');
    }

    @IsTest
    static void unknownRelationshipThrows() {
        Account a = new Account(Name = 'Rel Bad Acme');
        insert a;

        CardstackGetRelatedAction.GetRelatedRequest req =
            new CardstackGetRelatedAction.GetRelatedRequest();
        req.parentId = a.Id;
        req.relationship = 'NoSuchRelationship';

        try {
            CardstackGetRelatedAction.getRelated(
                new List<CardstackGetRelatedAction.GetRelatedRequest>{ req });
            System.assert(false, 'expected exception');
        } catch (CardstackGetRelatedAction.CardstackException e) {
            System.assert(e.getMessage().contains('not found on Account'), e.getMessage());
        }
    }

    @IsTest
    static void missingParentIdThrows() {
        CardstackGetRelatedAction.GetRelatedRequest req =
            new CardstackGetRelatedAction.GetRelatedRequest();
        req.relationship = 'Opportunities';

        try {
            CardstackGetRelatedAction.getRelated(
                new List<CardstackGetRelatedAction.GetRelatedRequest>{ req });
            System.assert(false, 'expected exception');
        } catch (CardstackGetRelatedAction.CardstackException e) {
            System.assert(e.getMessage().contains('parentId is required'), e.getMessage());
        }
    }
}
