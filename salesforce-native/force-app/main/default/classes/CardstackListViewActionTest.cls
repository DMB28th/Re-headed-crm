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
    private class PolicyViews implements CardstackListCatalog.MetadataProvider {
        public List<ListView> nativeViews(String objectApi) {
            return new List<ListView>{
                (ListView)JSON.deserialize('{"Id":"00B000000000001","Name":"Approved View","DeveloperName":"Approved_View"}', ListView.class),
                (ListView)JSON.deserialize('{"Id":"00B000000000002","Name":"Hidden View","DeveloperName":"Hidden_View"}', ListView.class)
            };
        }
    }
    private static String listPolicy(Boolean adHoc) {
        return '{"version":1,"allowAdHoc":'+String.valueOf(adHoc)+',"views":[{"viewId":"00B000000000001","enabled":true}],"customLists":[]}';
    }
    private static CardstackListViewAction.ListViewResponse requestPolicyView(String name, Boolean saveAs) {
        CardstackListViewAction.ListViewRequest request = new CardstackListViewAction.ListViewRequest();
        request.objectName = 'Opportunity'; request.viewName = name;
        request.saveViewAs = saveAs ? 'Denied save' : null;
        return CardstackListViewAction.listView(new List<CardstackListViewAction.ListViewRequest>{request})[0];
    }
    private static void assertDenied(CardstackListViewAction.ListViewResponse result) {
        Assert.areEqual(0, result.count, 'Denied calls return zero CRM rows.');
        Assert.areEqual(0, result.rows.size(), 'Denied calls contain no row payload.');
        Assert.isTrue(result.summary.contains('not available in chat'), 'Denial is renderable.');
        Assert.areEqual(0, [SELECT count() FROM Cardstack_Config__c WHERE Name='listview:Opportunity:deniedsave'], 'Denied calls cannot save filters.');
    }
    @IsTest static void draftCannotRestrictRuntime() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            insert new Opportunity(Name='Legacy row', StageName='Prospecting', CloseDate=Date.today());
            CardstackConfigService.saveDraft('exposures:Opportunity', listPolicy(false));
            Test.startTest();
            CardstackListViewAction.ListViewResponse result=requestPolicyView('Unknown legacy name', false);
            Test.stopTest();
            Assert.areEqual(1, result.count, 'Only published exposure policy governs execution.');
        }
    }
    @IsTest static void publishedPolicyFiltersDiscoveryAndDirectExecution() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            CardstackListCatalog.metadataProvider=new PolicyViews();
            insert new Opportunity(Name='Approved row', StageName='Prospecting', CloseDate=Date.today());
            CardstackConfigService.publishDraft(CardstackConfigService.saveDraft('exposures:Opportunity', listPolicy(false)));
            CardstackListViewsAction.ListViewsRequest request=new CardstackListViewsAction.ListViewsRequest(); request.objectName='Opportunity';
            Test.startTest();
            CardstackListViewsAction.ListViewsResponse discovery=CardstackListViewsAction.listViews(new List<CardstackListViewsAction.ListViewsRequest>{request})[0];
            CardstackListViewAction.ListViewResponse allowed=requestPolicyView('Approved_View', false);
            CardstackListViewAction.ListViewResponse hidden=requestPolicyView('Hidden_View', true);
            Test.stopTest();
            Assert.areEqual(1, discovery.count, 'Discovery returns the allowed view only.');
            Assert.areEqual('Approved View', discovery.views[0].name, 'Hidden metadata is excluded.');
            Assert.areEqual(1, allowed.count, 'Allowed native view retains beta fallback.');
            Assert.areEqual('Beta filtered list for "Approved View"; Salesforce saved-view filters, columns, and sort are not reproduced.', allowed.fallbackNote, 'Exact existing fallback note survives.');
            assertDenied(hidden);
        }
    }
    @IsTest static void hiddenNamesCannotReturnThroughFuzzyOrIdResolution() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            CardstackListCatalog.metadataProvider=new PolicyViews();
            CardstackConfigService.publishDraft(CardstackConfigService.saveDraft('exposures:Opportunity', listPolicy(false)));
            Test.startTest();
            assertDenied(requestPolicyView('Hidden', true));
            assertDenied(requestPolicyView('00B000000000002', true));
            assertDenied(requestPolicyView(CardstackConnectionTypes.normalizeId('00B000000000002'), true));
            Test.stopTest();
        }
    }
    @IsTest static void unknownNameDeniedEvenWhenAdHocAllowed() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            CardstackListCatalog.metadataProvider=new PolicyViews();
            insert new Opportunity(Name='Ad hoc row', StageName='Prospecting', CloseDate=Date.today());
            CardstackConfigService.publishDraft(CardstackConfigService.saveDraft('exposures:Opportunity', listPolicy(true)));
            Test.startTest();
            assertDenied(requestPolicyView('Unknown named view', true));
            Assert.areEqual(1, requestPolicyView(null, false).count, 'Explicit ad hoc permission allows unnamed filters.');
            Test.stopTest();
        }
    }
    @IsTest static void collisionRequiresUnambiguousAllowedTarget() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            CardstackListCatalog.metadataProvider=new PolicyViews();
            insert new Opportunity(Name='Saved only', StageName='Prospecting', CloseDate=Date.today());
            insert new Cardstack_Config__c(Name='listview:Opportunity:approvedview',Is_Active__c=true,Value__c='{"displayName":"Approved View","query":"Saved only"}');
            String policy=listPolicy(false).replace('"customLists":[]','"customLists":[{"key":"listview:Opportunity:approvedview","enabled":true}]');
            CardstackConfigService.publishDraft(CardstackConfigService.saveDraft('exposures:Opportunity', policy));
            Test.startTest();
            assertDenied(requestPolicyView('Approved View', true));
            Assert.areEqual(1, requestPolicyView('00B000000000001', false).count, 'Canonical native ID disambiguates.');
            CardstackListViewAction.ListViewResponse saved=requestPolicyView('listview:Opportunity:approvedview', false);
            Test.stopTest();
            Assert.areEqual(1, saved.count, 'Full saved key uses the stored filters.');
            Assert.isTrue(saved.viewName.contains('(saved view)'), 'Saved execution stays distinct from Salesforce fallback.');
        }
    }
    @IsTest static void corruptUnknownOrUnreadableConfiguredPolicyDenies() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Cardstack_Config__c config=new Cardstack_Config__c(Name='exposures:Opportunity',Is_Active__c=true,Value__c='{'); insert config;
            Test.startTest();
            assertDenied(requestPolicyView(null, true));
            config.Value__c='{"version":2}'; update config;
            assertDenied(requestPolicyView(null, true));
            Test.stopTest();
        }
    }
    @IsTest static void connectedUserStillNeedsNativeAccess() {
        User actor=CardstackConnectionTestFactory.namedUser();
        CardstackConnectionTestFactory.assign(actor, 'Cardstack_User');
        System.runAs(actor) {
            Test.startTest();
            CardstackListViewAction.ListViewResponse result=requestPolicyView('Approved View', false);
            Test.stopTest();
            Assert.areEqual(0, result.count, 'Native object access remains required.');
            Assert.areEqual(0, result.rows.size(), 'No data flows through admin policy.');
        }
    }

    private class UnreadableViews implements CardstackListCatalog.MetadataProvider {
        public List<ListView> nativeViews(String objectApi) { throw new CardstackListExposurePolicy.PolicyException('Native metadata unreadable.'); }
    }
    private class NoVisibleViews implements CardstackListCatalog.MetadataProvider {
        public List<ListView> nativeViews(String objectApi) { return new List<ListView>(); }
    }
    @IsTest static void nativeAuthorizationFailureCannotFallThroughToData() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            CardstackConfigService.publishDraft(CardstackConfigService.saveDraft('exposures:Opportunity', listPolicy(false)));
            CardstackListCatalog.metadataProvider=new UnreadableViews();
            insert new Opportunity(Name='Must never return',StageName='Prospecting',CloseDate=Date.today());
            Test.startTest();
            assertDenied(requestPolicyView('00B000000000001', true));
            Test.stopTest();
        }
    }
    @IsTest static void allowedIdentityStillNeedsNativeVisibility() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            CardstackConfigService.publishDraft(CardstackConfigService.saveDraft('exposures:Opportunity', listPolicy(false)));
            CardstackListCatalog.metadataProvider=new NoVisibleViews();
            Test.startTest();
            assertDenied(requestPolicyView('00B000000000001', true));
            Test.stopTest();
        }
    }
    @IsTest static void policyKeepsMyOwnerScopeForCanonicalId() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            CardstackListCatalog.metadataProvider=new MyViews();
            User other=new User(Alias='cspmy',Email='other@example.invalid',Username='cardstack.policy.'+DateTime.now().getTime()+'@example.invalid',LastName='Other',ProfileId=UserInfo.getProfileId(),TimeZoneSidKey='America/New_York',LocaleSidKey='en_US',EmailEncodingKey='UTF-8',LanguageLocaleKey='en_US');
            System.runAs(new User(Id=UserInfo.getUserId())) { insert other; }
            insert new List<Opportunity>{new Opportunity(Name='Owned policy row',StageName='Prospecting',CloseDate=Date.today()),new Opportunity(Name='Other policy row',StageName='Prospecting',CloseDate=Date.today(),OwnerId=other.Id)};
            CardstackConfigService.publishDraft(CardstackConfigService.saveDraft('exposures:Opportunity', listPolicy(false)));
            Test.startTest();
            CardstackListViewAction.ListViewResponse response=requestPolicyView('00B000000000001', false);
            Test.stopTest();
            Assert.areEqual(1, response.count, 'Canonical IDs preserve the current metadata My-owner restriction.');
            Assert.areEqual('Owned policy row', response.rows[0].name, 'Other owner cannot enter fallback results.');
        }
    }
    private class MyViews implements CardstackListCatalog.MetadataProvider {
        public List<ListView> nativeViews(String objectApi) { return new List<ListView>{(ListView)JSON.deserialize('{"Id":"00B000000000001","Name":"My Opportunities","DeveloperName":"MyOpportunities"}',ListView.class)}; }
    }

    @IsTest static void ordinaryChatUserCannotRunExcludedView() {
        User actor=CardstackConnectionTestFactory.namedUser();
        actor.ProfileId=[SELECT Id FROM Profile WHERE Name='Standard User' AND UserLicense.Name='Salesforce' LIMIT 1].Id;
        update actor;
        CardstackConnectionTestFactory.assign(actor, 'Cardstack_User');
        CardstackListCatalog.metadataProvider=new PolicyViews();
        System.runAs(new User(Id=UserInfo.getUserId())) {
            CardstackConfigService.publishDraft(CardstackConfigService.saveDraft('exposures:Opportunity', listPolicy(false)));
        }
        System.runAs(actor) {
            Test.startTest();
            Assert.isTrue(Opportunity.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED).isAccessible(), 'Fixture needs native Opportunity read access.');
            Assert.isFalse(FeatureManagement.checkPermission('Cardstack_Manage_Studio'), 'Chat fixture is an ordinary user.');
            CardstackListExposurePolicy.Policy policy=CardstackListExposurePolicy.loadPublished('Opportunity');
            CardstackListViewAction.ListViewResponse response=requestPolicyView('Hidden_View', true);
            Test.stopTest();
            Assert.areEqual('explicit', policy.mode, 'ReadWrite Config sharing permits the chat actor to read published policy.');
            Assert.isFalse(CardstackListExposurePolicy.isAllowed(policy,'salesforce','00B000000000002'), 'Published policy excludes this view for the ordinary actor.');
            assertDenied(response);
        }
    }

    @IsTest static void recognizedLegacyPublishedPolicyKeepsFilteredFallback() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            insert new Opportunity(Name='Legacy policy row',StageName='Prospecting',CloseDate=Date.today());
            CardstackConfigService.publishDraft(CardstackConfigService.saveDraft('exposures:Opportunity','{"views":[],"customLists":[]}'));
            Test.startTest();
            CardstackListViewAction.ListViewResponse response=requestPolicyView('Unknown legacy name',false);
            Test.stopTest();
            Assert.areEqual(1,response.count,'Recognized legacy values retain the documented beta fallback.');
            Assert.isTrue(response.fallbackNote.contains('Salesforce saved-view filters, columns, and sort are not reproduced.'),'Legacy behavior stays accurately labeled.');
        }
    }

}
