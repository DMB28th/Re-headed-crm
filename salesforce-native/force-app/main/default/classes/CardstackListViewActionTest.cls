@IsTest
private class CardstackListViewActionTest {
    // Package validation users need the same explicit permissions as installed admins.
    @TestSetup
    static void grantPackagePermissions() {
        PermissionSet admin = [SELECT Id FROM PermissionSet WHERE Name = 'Cardstack_Admin' LIMIT 1];
        if ([SELECT count() FROM PermissionSetAssignment WHERE AssigneeId = :UserInfo.getUserId() AND PermissionSetId = :admin.Id] == 0) {
            insert new PermissionSetAssignment(AssigneeId = UserInfo.getUserId(), PermissionSetId = admin.Id);
        }
    }


    @IsTest
    static void openOnlyFiltersClosedOpportunities() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
        insert new List<Opportunity>{
            new Opportunity(Name = 'LV Open', StageName = 'Prospecting',
                CloseDate = Date.today().addDays(30), Amount = 10000),
            new Opportunity(Name = 'LV Won', StageName = 'Closed Won',
                CloseDate = Date.today().addDays(-5), Amount = 50000)
        };

        CardstackListViewAction.ListViewRequest req =
            new CardstackListViewAction.ListViewRequest();
        req.objectName = 'Opportunity';
        req.openOnly = true;
        req.query = 'LV ';

        List<CardstackListViewAction.ListViewResponse> resps =
            CardstackListViewAction.listView(
                new List<CardstackListViewAction.ListViewRequest>{ req });

        CardstackListViewAction.ListViewResponse res = resps[0];
        System.assertEquals(1, res.count, 'closed-won excluded');
        System.assertEquals('LV Open', res.rows[0].name);
        System.assert(res.rows[0].detail.contains('Prospecting'), 'detail: ' + res.rows[0].detail);
        System.assert(res.rows[0].recordUrl.endsWith('/' + res.rows[0].recordId));
        // New: columns + cells populated for table rendering.
        System.assertNotEquals(null, res.columns, 'columns present');
        System.assert(!res.columns.isEmpty(), 'columns non-empty');
        System.assertEquals(res.columns.size(), res.rows[0].cells.size(), 'cells align to columns');
            }
    }

    @IsTest
    static void stageFilterApplies() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
        insert new List<Opportunity>{
            new Opportunity(Name = 'LV Stage A', StageName = 'Qualification',
                CloseDate = Date.today().addDays(30)),
            new Opportunity(Name = 'LV Stage B', StageName = 'Prospecting',
                CloseDate = Date.today().addDays(30))
        };

        CardstackListViewAction.ListViewRequest req =
            new CardstackListViewAction.ListViewRequest();
        req.objectName = 'Opportunity';
        req.stage = 'Qualification';
        req.query = 'LV Stage';

        List<CardstackListViewAction.ListViewResponse> resps =
            CardstackListViewAction.listView(
                new List<CardstackListViewAction.ListViewRequest>{ req });

        System.assertEquals(1, resps[0].count);
        System.assertEquals('LV Stage A', resps[0].rows[0].name);
            }
    }

    @IsTest
    static void unknownViewFallsBackGracefully() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
        CardstackListViewAction.ListViewRequest req =
            new CardstackListViewAction.ListViewRequest();
        req.objectName = 'Account';
        req.viewName = 'No Such View XYZ';

        List<CardstackListViewAction.ListViewResponse> resps =
            CardstackListViewAction.listView(
                new List<CardstackListViewAction.ListViewRequest>{ req });

        // Never throws; falls back to filter-based with a note.
        System.assertEquals('No Such View XYZ', resps[0].viewName);
        System.assertEquals(false, resps[0].usedRealView);
        System.assertNotEquals(null, resps[0].fallbackNote);
        System.assert(resps[0].fallbackNote.contains('No Such View XYZ'), resps[0].fallbackNote);
            }
    }

    @IsTest
    static void unknownObjectReturnsErrorResponse() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
        CardstackListViewAction.ListViewRequest req =
            new CardstackListViewAction.ListViewRequest();
        req.objectName = 'NoSuchObject__c';

        // Invocable never throws — returns a renderable error response.
        List<CardstackListViewAction.ListViewResponse> resps =
            CardstackListViewAction.listView(
                new List<CardstackListViewAction.ListViewRequest>{ req });
        System.assertEquals(0, resps[0].count);
        System.assert(resps[0].summary.contains('not available'), resps[0].summary);
            }
    }

    @IsTest
    static void normalizeStripsNoise() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
        System.assertEquals('myopportunities',
            CardstackListViewAction.normalize('My Opportunities'));
        System.assertEquals('myopportunities',
            CardstackListViewAction.normalize('  my-opportunities!! '));
        System.assertEquals('', CardstackListViewAction.normalize(null));
            }
    }

    @IsTest
    static void matchViewFindsBestCandidate() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
        // ListView Name/DeveloperName aren't writeable in Apex; build via JSON.
        List<ListView> views = new List<ListView>{
            (ListView) JSON.deserialize('{"Name":"My Opportunities","DeveloperName":"MyOpportunities"}', ListView.class),
            (ListView) JSON.deserialize('{"Name":"Recently Viewed","DeveloperName":"RecentlyViewed"}', ListView.class)
        };
        ListView m = CardstackListViewAction.matchView(views, 'my opportunities');
        System.assertNotEquals(null, m);
        System.assertEquals('My Opportunities', m.Name);

        // Partial: "opportunities" matches "My Opportunities".
        m = CardstackListViewAction.matchView(views, 'opportunities');
        System.assertNotEquals(null, m);
        System.assertEquals('My Opportunities', m.Name);

        // No match returns null.
        m = CardstackListViewAction.matchView(views, 'zzz no such view');
        System.assertEquals(null, m);

        // Empty/null inputs.
        System.assertEquals(null, CardstackListViewAction.matchView(null, 'x'));
        System.assertEquals(null, CardstackListViewAction.matchView(views, null));
            }
    }

    @IsTest
    static void namedMyViewReturnsOwnedRecordsWithFallbackNote() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
        insert new Opportunity(Name = 'Owned Beta Deal', StageName = 'Prospecting', CloseDate = Date.today().addDays(30));
        CardstackListViewAction.ListViewRequest req = new CardstackListViewAction.ListViewRequest();
        req.objectName = 'Opportunity';
        req.viewName = 'my opportunities';
        req.openOnly = true;
        CardstackListViewAction.ListViewResponse res = CardstackListViewAction.listView(new List<CardstackListViewAction.ListViewRequest>{req})[0];
        System.assertEquals(1, res.count);
        System.assertEquals(false, res.usedRealView);
        System.assertNotEquals(null, res.fallbackNote);
            }
    }

    @IsTest
    static void myViewNeverBroadensToOtherOwners() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
        User other = new User(Alias = 'csother', Email = 'other@example.invalid',
            Username = 'cardstack.other.' + DateTime.now().getTime() + '@example.invalid',
            LastName = 'Other Owner', ProfileId = UserInfo.getProfileId(),
            TimeZoneSidKey = 'America/Los_Angeles', LocaleSidKey = 'en_US',
            EmailEncodingKey = 'UTF-8', LanguageLocaleKey = 'en_US');
        System.runAs(new User(Id = UserInfo.getUserId())) { insert other; }
        insert new Opportunity(Name = 'Other Owner Deal', StageName = 'Prospecting',
            CloseDate = Date.today().addDays(30), OwnerId = other.Id);
        CardstackListViewAction.ListViewRequest req = new CardstackListViewAction.ListViewRequest();
        req.objectName = 'Opportunity';
        req.viewName = 'my opportunities';
        req.openOnly = true;
        CardstackListViewAction.ListViewResponse res = CardstackListViewAction.listView(new List<CardstackListViewAction.ListViewRequest>{req})[0];
        System.assertEquals(0, res.count, 'An empty My view must stay empty.');
            }
    }

    @IsTest
    static void saveAndLoadCardstackView() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
        CardstackListViewAction.ListViewRequest req =
            new CardstackListViewAction.ListViewRequest();
        req.objectName = 'Opportunity';
        req.stage = 'Prospecting';
        req.saveViewAs = 'Test Saved View';

        // Saving happens as a side effect of the list call.
        CardstackListViewAction.listView(
            new List<CardstackListViewAction.ListViewRequest>{ req });

        List<Cardstack_Config__c> rows = [
            SELECT Value__c FROM Cardstack_Config__c
            WHERE Name = 'listview:Opportunity:testsavedview'
            WITH USER_MODE LIMIT 1
        ];
        System.assertEquals(1, rows.size(), 'view saved');
        System.assert(rows[0].Value__c.contains('Prospecting'), rows[0].Value__c);

        // Recall the saved view by name.
        CardstackListViewAction.ListViewRequest req2 =
            new CardstackListViewAction.ListViewRequest();
        req2.objectName = 'Opportunity';
        req2.viewName = 'Test Saved View';
        List<CardstackListViewAction.ListViewResponse> resps =
            CardstackListViewAction.listView(
                new List<CardstackListViewAction.ListViewRequest>{ req2 });
        System.assert(resps[0].viewName.contains('Test Saved View'), resps[0].viewName);
        System.assert(resps[0].viewName.contains('saved view'), resps[0].viewName);
            }
    }
    @IsTest
    static void myScopeSurvivesResolvedLabelAndSavedRecall() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            User other = new User(Alias = 'cssave', Email = 'other@example.invalid',
                Username = 'cardstack.saved.' + DateTime.now().getTime() + '@example.invalid',
                LastName = 'Saved Other', ProfileId = UserInfo.getProfileId(),
                TimeZoneSidKey = 'America/Los_Angeles', LocaleSidKey = 'en_US',
                EmailEncodingKey = 'UTF-8', LanguageLocaleKey = 'en_US');
            System.runAs(new User(Id = UserInfo.getUserId())) { insert other; }
            insert new List<Opportunity>{
                new Opportunity(Name = 'Owned Pipeline', StageName = 'Prospecting', CloseDate = Date.today().addDays(30)),
                new Opportunity(Name = 'Other Pipeline', StageName = 'Prospecting', CloseDate = Date.today().addDays(30), OwnerId = other.Id)
            };
            CardstackListViewAction.ListViewRequest req = new CardstackListViewAction.ListViewRequest();
            req.objectName = 'Opportunity';
            req.viewName = 'my opportunities';
            req.openOnly = true;
            req.saveViewAs = 'Q4 pipeline';
            Schema.DescribeSObjectResult d = Opportunity.SObjectType.getDescribe();
            System.assertEquals(1, CardstackListViewAction.executeFilterBased('Opportunity', d, req, 25, 'Opportunities').count, 'Resolved label cannot drop requested My scope.');
            System.assertEquals(1, CardstackListViewAction.listView(new List<CardstackListViewAction.ListViewRequest>{req})[0].count);
            Cardstack_Config__c saved = [SELECT Value__c FROM Cardstack_Config__c WHERE Name = 'listview:Opportunity:q4pipeline' LIMIT 1];
            System.assertEquals(true, ((Map<String,Object>) JSON.deserializeUntyped(saved.Value__c)).get('myOnly'));
            req.viewName = 'Q4 pipeline';
            req.saveViewAs = null;
            System.assertEquals(1, CardstackListViewAction.listView(new List<CardstackListViewAction.ListViewRequest>{req})[0].count, 'Saved My scope must survive a neutral display name.');
        }
    }
}
