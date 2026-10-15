/**
 * Tests for CardstackStudioController: staging round-trip, audit search,
 * and org introspection entry points used by the Studio LWC app.
 */
@IsTest
private with sharing class CardstackStudioControllerTest {
    // Package validation users need the same explicit permissions as installed admins.
    @TestSetup
    static void grantPackagePermissions() {
        PermissionSet admin = [SELECT Id FROM PermissionSet WHERE Name = 'Cardstack_Admin' LIMIT 1];
        if ([SELECT count() FROM PermissionSetAssignment WHERE AssigneeId = :UserInfo.getUserId() AND PermissionSetId = :admin.Id] == 0) {
            insert new PermissionSetAssignment(AssigneeId = UserInfo.getUserId(), PermissionSetId = admin.Id);
        }
        CardstackStudioTestFactory.grantManageStudio(new User(Id = UserInfo.getUserId()));
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Assert.isTrue(FeatureManagement.checkPermission('Cardstack_Manage_Studio'), 'Current actor fixture has the actual native Studio permission before positive controller tests.');
        }
    }


    @IsTest
    static void overviewCountsDefaultSupportedDraftsBeyondReturnedWindow() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            List<Cardstack_Config__c> configs = new List<Cardstack_Config__c>{
                new Cardstack_Config__c(Name='layout:Account:default', Value__c='{}', Is_Active__c=true),
                new Cardstack_Config__c(Name='layout:Contact:default', Is_Active__c=false),
                new Cardstack_Config__c(Name='home', Is_Active__c=false),
                new Cardstack_Config__c(Name='layout:Account:sales', Is_Active__c=false),
                new Cardstack_Config__c(Name='layout:UnavailableObject__c:default', Value__c='{}', Is_Active__c=true)
            };
            insert configs;
            List<Cardstack_Config_Draft__c> drafts = new List<Cardstack_Config_Draft__c>();
            for (Integer i = 0; i < 251; i++) drafts.add(new Cardstack_Config_Draft__c(Config__c=configs[0].Id, Draft_Value__c='{}', Status__c='Draft'));
            drafts.add(new Cardstack_Config_Draft__c(Config__c=configs[1].Id, Draft_Value__c='{}', Status__c='Draft'));
            drafts.add(new Cardstack_Config_Draft__c(Config__c=configs[2].Id, Draft_Value__c='{}', Status__c='Draft'));
            drafts.add(new Cardstack_Config_Draft__c(Config__c=configs[3].Id, Draft_Value__c='{}', Status__c='Draft'));
            insert drafts;
            Test.setCreatedDate(drafts[251].Id, Datetime.now().addDays(-1));
            Test.startTest();
            Map<String,Object> overview = CardstackStudioController.getStudioOverview();
            Test.stopTest();
            Assert.areEqual(252, overview.get('activePendingDraftCount'), 'Count every supported pending draft without the tray limit.');
            Map<String,Map<String,Object>> byObject = new Map<String,Map<String,Object>>();
            for (Map<String,Object> row : (List<Map<String,Object>>) overview.get('objects')) byObject.put((String) row.get('objectApi'), row);
            Assert.areEqual(true, byObject.get('Account').get('hasLive'), 'Account has published policy.');
            Assert.areEqual(true, byObject.get('Account').get('hasDraft'), 'Published and draft states coexist.');
            Assert.areEqual(true, byObject.get('Contact').get('hasDraft'), 'Older object draft survives beyond 200 newer candidates.');
            Assert.areEqual(CardstackConnectionTypes.normalizeId(String.valueOf(drafts[251].Id)), byObject.get('Contact').get('latestDraftId'), 'Route to the exact older pending candidate.');
            Assert.areEqual(false, byObject.get('Contact').get('hasLive'), 'An inactive config is not published.');
            Assert.areEqual('unavailable', byObject.get('UnavailableObject__c').get('metadataStatus'), 'Retain configured objects whose native metadata is unavailable.');
            Assert.areEqual(true, byObject.get('UnavailableObject__c').get('hasLive'), 'Metadata availability does not erase persisted publication state.');
            Assert.isNotNull(overview.get('recentActivity'), 'Overview exposes activity.');
            Assert.isNotNull(overview.get('org'), 'Overview exposes native org identity.');
        }
    }

    @IsTest
    static void draftRoundTripThroughController() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
        Test.startTest();
        String draftId = CardstackStudioController.saveDraft(
            'layout:Account:default', '{"name":"default"}'
        );
        System.assertNotEquals(null, draftId);

        Map<String, Object> info =
            CardstackStudioController.getStagingInfo('layout:Account:default');
        System.assertNotEquals(null, info.get('draft'), 'Draft should be staged.');

        CardstackStudioController.publishDraft(draftId);
        Test.stopTest();

        System.assertEquals(
            '{"name":"default"}',
            CardstackStudioController.getConfigValue('layout:Account:default')
        );
            }
    }

    @IsTest
    static void freshStagingInfoReconcilesSavedCandidateWithoutPublishing() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Test.startTest();
            String draftId = CardstackStudioController.saveDraft('layout:Account:default', '{"name":"default","highlights":[{"api":"Name"}]}');
            Map<String,Object> fresh = CardstackStudioController.getStagingInfoFresh('layout:Account:default');
            Cardstack_Config_Draft__c draft = (Cardstack_Config_Draft__c) fresh.get('draft');
            Assert.areEqual(draftId, CardstackConnectionTypes.normalizeId(String.valueOf(draft.Id)), 'Fresh reconciliation returns the exact persisted candidate.');
            Assert.areEqual('{"name":"default","highlights":[{"api":"Name"}]}', draft.Draft_Value__c, 'Return authoritative saved JSON.');
            Assert.areEqual(null, fresh.get('liveValue'), 'Saving does not publish the draft.');
            Test.stopTest();
        }
    }

    @IsTest
    static void saveDraftRejectsInvalidJson() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
        Test.startTest();
        Boolean threw = false;
        try {
            CardstackStudioController.saveDraft('flows', '{not json');
        } catch (CardstackConfigService.ConfigException e) {
            threw = true;
        }
        Test.stopTest();
        System.assert(threw, 'Invalid JSON must be rejected.');
            }
    }

    @IsTest
    static void auditSearchThroughController() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
        CardstackAuditService.logAction('SEARCH', 'CardstackSearchAction', null, 'q=oil');
        Test.startTest();
        List<Cardstack_Audit_Log__c> rows =
            CardstackStudioController.searchAudit('SEARCH', null, 50, null, null, null);
        List<String> tools = CardstackStudioController.listAuditTools();
        Test.stopTest();
        System.assertEquals(1, rows.size());
        System.assert(tools.contains('CardstackSearchAction'));
            }
    }

    @IsTest
    static void getCrmObjectsReturnsList() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
        Test.startTest();
        List<Map<String, String>> objects = CardstackStudioController.getCrmObjects();
        Test.stopTest();
        System.assertNotEquals(null, objects, 'Object list should not be null.');
        // In a real org, Account/Contact/etc. are included; in test context
        // the describe may be limited, so we only assert the shape.
        for (Map<String, String> o : objects) {
            System.assertNotEquals(null, o.get('api'));
            System.assertNotEquals(null, o.get('label'));
        }
            }
    }

    @IsTest
    static void getConnectionInfoReportsOrg() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
        Test.startTest();
        Map<String, Object> info = CardstackStudioController.getConnectionInfo();
        Test.stopTest();
        System.assertEquals('connected', info.get('status'));
        System.assertNotEquals(null, info.get('orgId'));
        System.assertNotEquals(null, info.get('mcpServers'));
            }
    }

    @IsTest
    static void getDashboardDataReturnsShape() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
        Test.startTest();
        Map<String, Object> data = CardstackStudioController.getDashboardData();
        Test.stopTest();
        System.assertNotEquals(null, data.get('org'), 'Org info should be present.');
        System.assertNotEquals(null, data.get('objectsConfigured'), 'Coverage count should be present.');
        System.assertNotEquals(null, data.get('totalObjects'), 'Total objects should be present.');
        System.assertNotEquals(null, data.get('pendingDraftCount'), 'Draft count should be present.');
        System.assertNotEquals(null, data.get('pendingDrafts'), 'Draft list should be present.');
        System.assertNotEquals(null, data.get('recentActivity'), 'Activity list should be present.');
            }
    }

    @IsTest
    static void getChecklistStateReturnsFiveItems() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
        Test.startTest();
        Map<String, Object> state = CardstackStudioController.getChecklistState();
        Test.stopTest();
        List<Map<String, Object>> items = (List<Map<String, Object>>) state.get('items');
        System.assertEquals(5, items.size(), 'Checklist should have 5 items.');
        System.assertNotEquals(null, state.get('dismissed'), 'Dismissed flag should be present.');
        for (Map<String, Object> item : items) {
            System.assertNotEquals(null, item.get('id'));
            System.assertNotEquals(null, item.get('label'));
            System.assertNotEquals(null, item.get('done'));
        }
            }
    }

    @IsTest
    static void legacyFlagsRemainHistoryOnly() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            CardstackStudioController.setSetupFlag('setup:claudeConnected', true);
            CardstackStudioController.setSetupFlag('setup:mcpServerConfirmed', true);
            CardstackStudioController.setSetupFlag('setup:checklistDismissed', true);
            Test.startTest();
            Map<String,Object> state = CardstackStudioController.getChecklistState();
            Test.stopTest();
            Assert.areEqual(true,state.get('dismissed'),'Legacy dismissal remains history');
            List<Map<String,Object>> items = (List<Map<String,Object>>)state.get('items');
            Assert.isTrue(((String)items[3].get('detail')).contains('history only'),'MCP history explicitly labeled');
            Assert.isTrue(((String)items[4].get('detail')).contains('history only'),'Claude history explicitly labeled');
        }
    }

    @IsTest
    static void setSetupFlagRoundTrip() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
        Test.startTest();
        CardstackStudioController.setSetupFlag('setup:claudeConnected', true);
        Test.stopTest();
        // The flag is saved as a draft and auto-published; verify the config exists.
        List<Cardstack_Config__c> rows = [
            SELECT Value__c FROM Cardstack_Config__c
            WHERE Name = 'setup:claudeConnected' LIMIT 1
        ];
        System.assertEquals(1, rows.size(), 'Flag should be persisted.');
        System.assertEquals('true', rows[0].Value__c);
            }
    }

    @IsTest
    static void nativeFlowReferencesNeverBecomeInventedVersionIds() {
        Assert.isNull(CardstackStudioController.nativeFlowIdentity('BundledFlow-Version-Reference'), 'A native catalog reference is not an executable version Id');
        Assert.isNull(CardstackStudioController.nativeFlowIdentity(null), 'Absent version identity stays unavailable');
        Assert.areEqual('301000000000001AAA',CardstackStudioController.nativeFlowIdentity('301000000000001'), 'Valid native version input normalizes to full checksum18');
    }

    @IsTest
    static void getActiveFlowsReturnsList() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
        Test.startTest();
        List<Map<String, String>> flows = CardstackStudioController.getActiveFlows();
        Test.stopTest();
        System.assertNotEquals(null, flows, 'Should return a list (possibly empty).');
        for (Map<String, String> f : flows) {
            System.assertNotEquals(null, f.get('apiName'), 'Each flow should have an apiName.');
            System.assertNotEquals(null, f.get('label'), 'Each flow should have a label.');
        }
            }
    }

    @IsTest
    static void getFlowInputsHandlesBlankAndUnknown() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
        Test.startTest();
        List<Map<String, Object>> blank = CardstackStudioController.getFlowInputs('');
        List<Map<String, Object>> unknown = CardstackStudioController.getFlowInputs('No_Such_Flow_Xyz');
        Test.stopTest();
        System.assertNotEquals(null, blank, 'Blank input should return empty list.');
        System.assertEquals(0, blank.size(), 'Blank flow name returns no inputs.');
        System.assertNotEquals(null, unknown, 'Unknown flow should return empty list.');
            }
    }

    @IsTest
    static void fieldPickerIncludesStandardAccountNameAndId() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Test.startTest();
            List<Map<String,String>> fields = CardstackStudioController.getObjectFields('Account');
            Test.stopTest();
            Map<String,Map<String,String>> byApi = new Map<String,Map<String,String>>();
            for(Map<String,String> field : fields) {
                Assert.isFalse(byApi.containsKey(field.get('api')), 'Field picker has no duplicate field');
                byApi.put(field.get('api'), field);
            }
            Assert.isTrue(byApi.containsKey('Name'), 'Account name is selectable');
            Assert.isTrue(byApi.containsKey('Id'), 'Account identity is available to the layout editor');
            Assert.areEqual('STRING', byApi.get('Name').get('type').toUpperCase(), 'Name is a text field');
            Assert.areEqual('ID', byApi.get('Id').get('type').toUpperCase(), 'Id keeps its identity type');
            Assert.areEqual(String.valueOf(Account.Name.getDescribe().isNillable()), byApi.get('Name').get('nillable'), 'Public preview constraint follows native Describe.');
            Assert.areEqual(String.valueOf(Account.Name.getDescribe().isUpdateable()), byApi.get('Name').get('updateable'), 'Existing native update permission is preserved.');
            Assert.isFalse(String.isBlank(byApi.get('Name').get('label')), 'Selectable name has a visible label');
        }
    }

    @IsTest
    static void unknownObjectHasNoSelectableFields() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Test.startTest();
            List<Map<String,String>> fields = CardstackStudioController.getObjectFields('Cardstack_No_Such_Object__c');
            Test.stopTest();
            Assert.areEqual(0, fields.size(), 'An unknown object cannot offer fields for a layout');
        }
    }

    @IsTest
    static void flowLaunchCardsDistinguishLiveAndUnpublishedDraft() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            String live = '[]';
            String draftValue = '[{"flowApiName":"Example_Flow","label":"Draft only"}]';
            CardstackStudioController.publishDraft(CardstackStudioController.saveDraft('flows', live));
            String draftId = CardstackStudioController.saveDraft('flows', draftValue);
            Test.startTest();
            Map<String,Object> state = CardstackStudioController.getFlowLaunchCards();
            Test.stopTest();
            Assert.areEqual('flows', state.get('key'), 'Flow editor reads the flows configuration');
            Assert.areEqual(live, state.get('liveValue'), 'Unpublished changes do not replace live flow cards');
            Cardstack_Config_Draft__c draft = (Cardstack_Config_Draft__c)state.get('draft');
            Assert.areEqual((Id)draftId, draft.Id, 'Fresh editor response contains the current draft');
            Assert.areEqual(draftValue, draft.Draft_Value__c, 'Unsaved publication content is available for editing');
            Assert.areEqual('Draft', draft.Status__c, 'Editor draft remains unpublished');
        }
    }

    @IsTest
    static void controllerRollbackPreservesLiveAndFiltersDraftStatuses() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            String live = '{"version":1,"allowAdHoc":false,"views":[],"customLists":[]}';
            CardstackStudioController.publishDraft(CardstackStudioController.saveDraft('exposures:Contact', live));
            String abandoned = CardstackStudioController.saveDraft('exposures:Contact', '{"version":1,"allowAdHoc":true,"views":[],"customLists":[]}');
            Test.startTest();
            CardstackStudioController.rollbackDraft(abandoned);
            List<Cardstack_Config_Draft__c> open = CardstackStudioController.getDrafts('Draft');
            List<Cardstack_Config_Draft__c> rolledBack = CardstackStudioController.getDrafts('Rolled Back');
            List<Cardstack_Config_Draft__c> allDrafts = CardstackStudioController.getDrafts(null);
            Test.stopTest();
            Assert.areEqual(live, CardstackStudioController.getConfigValue('exposures:Contact'), 'Rollback preserves published content');
            Assert.areEqual(0, open.size(), 'Rolled-back draft is removed from pending work');
            Assert.areEqual(1, rolledBack.size(), 'Status filtering identifies exactly the abandoned draft');
            Assert.areEqual((Id)abandoned, rolledBack[0].Id, 'Rollback targets the selected draft');
            Assert.areEqual(2, allDrafts.size(), 'History retains both published and rolled-back versions');
        }
    }

    @IsTest
    static void listConfigKeysReportsPublishedAndDraftOnlyState() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            CardstackStudioController.publishDraft(CardstackStudioController.saveDraft('layout:Account:default', '{"name":"Live"}'));
            CardstackStudioController.saveDraft('layout:Contact:default', '{"name":"Unpublished"}');
            Test.startTest();
            List<Map<String,String>> keys = CardstackStudioController.listConfigKeys();
            Test.stopTest();
            Assert.areEqual(2, keys.size(), 'Picker lists both configuration records');
            Assert.areEqual('layout:Account:default', keys[0].get('key'), 'Published key is sorted first');
            Assert.areEqual('true', keys[0].get('active'), 'Published configuration is active');
            Assert.areEqual('layout:Contact:default', keys[1].get('key'), 'Draft-only key is retained');
            Assert.areEqual('false', keys[1].get('active'), 'Draft-only configuration is not active');
            Assert.areEqual(new Set<String>{'key','description','active'}, keys[0].keySet(), 'Picker returns metadata without configuration content');
        }
    }

    @IsTest
    static void auditDateStringsFilterTimestampRange() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            CardstackAuditService.logAction('SEARCH', 'CardstackSearchAction', null, 'synthetic date-filter fixture');
            String fromDate = String.valueOf(Date.today().addDays(-1));
            String toDate = String.valueOf(Date.today().addDays(1));
            String olderToDate = String.valueOf(Date.today().addDays(-2));
            Test.startTest();
            List<Cardstack_Audit_Log__c> included = CardstackStudioController.searchAudit('SEARCH', 'CardstackSearchAction', 50, fromDate, toDate, null);
            List<Cardstack_Audit_Log__c> excluded = CardstackStudioController.searchAudit('SEARCH', 'CardstackSearchAction', 50, null, olderToDate, null);
            Test.stopTest();
            Assert.areEqual(1, included.size(), 'ISO date strings include the current audit event');
            Assert.areEqual('SEARCH', included[0].Action__c, 'The matched event has the requested action');
            Assert.areEqual(0, excluded.size(), 'Earlier upper date excludes the current audit event');
        }
    }

    @IsTest
    static void invalidAuditDatesRetainOtherFilters() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            CardstackAuditService.logAction('SEARCH', 'CardstackSearchAction', null, 'synthetic search fixture');
            CardstackAuditService.logAction('CREATE', 'CardstackCreateAction', null, 'synthetic create fixture');
            Test.startTest();
            List<Cardstack_Audit_Log__c> rows = CardstackStudioController.searchAudit('SEARCH', 'CardstackSearchAction', 50, 'not-a-date', 'also-invalid', null);
            Test.stopTest();
            Assert.areEqual(1, rows.size(), 'Invalid dates do not discard the valid term and tool filters');
            Assert.areEqual('SEARCH', rows[0].Action__c, 'Unrelated create event remains excluded');
            Assert.areEqual('CardstackSearchAction', rows[0].Tool_Name__c, 'Tool filter remains effective');
        }
    }

    @IsTest
    static void auditUserPickerDeduplicatesActorAndSupportsFiltering() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            CardstackAuditService.logAction('SEARCH', 'CardstackSearchAction', null, 'first synthetic event');
            CardstackAuditService.logAction('SEARCH', 'CardstackSearchAction', null, 'second synthetic event');
            Test.startTest();
            List<Map<String,String>> users = CardstackStudioController.listAuditUsers();
            List<Cardstack_Audit_Log__c> rows = CardstackStudioController.searchAudit(null, null, 50, null, null, String.valueOf(UserInfo.getUserId()));
            Test.stopTest();
            Assert.areEqual(1, users.size(), 'Two events by one actor produce one picker entry');
            Assert.areEqual(String.valueOf(UserInfo.getUserId()), users[0].get('id'), 'Picker retains the full actor identifier');
            Assert.isFalse(String.isBlank(users[0].get('name')), 'Actor picker has a readable label');
            Assert.areEqual(2, rows.size(), 'Selected actor filter returns both matching events');
        }
    }

    @IsTest
    static void dashboardCountsDistinctObjectsAndListsPendingWork() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            CardstackStudioController.publishDraft(CardstackStudioController.saveDraft('layout:Account:default', '{"name":"Default"}'));
            // Seed retained subscriber history directly; authoring it is now rejected.
            List<Cardstack_Config__c> retained = new List<Cardstack_Config__c>{
                new Cardstack_Config__c(Name = 'layout:Account:executive', Value__c = '{"name":"Executive"}', Is_Active__c = true),
                new Cardstack_Config__c(Name = 'homecard', Value__c = '{"title":"Retained Home"}', Is_Active__c = true)
            };
            insert retained;
            insert new List<Cardstack_Config_Draft__c>{
                new Cardstack_Config_Draft__c(Config__c = retained[0].Id, Draft_Value__c = '{"name":"Retained audience"}', Status__c = 'Draft'),
                new Cardstack_Config_Draft__c(Config__c = retained[1].Id, Draft_Value__c = '{"title":"Retained draft"}', Status__c = 'Draft')
            };
            String pendingId = CardstackStudioController.saveDraft('layout:Contact:default', '{"name":"Pending"}');
            Test.startTest();
            Map<String,Object> data = CardstackStudioController.getDashboardData();
            Test.stopTest();
            Assert.areEqual(1, data.get('layoutsPublished'), 'Only supported default layouts count as active');
            Assert.areEqual(1, data.get('objectsConfigured'), 'Retained audience history does not alter configured object coverage');
            Assert.areEqual(1, data.get('pendingDraftCount'), 'Contact draft is still pending');
            List<Map<String,Object>> drafts = (List<Map<String,Object>>)data.get('pendingDrafts');
            Assert.areEqual(1, drafts.size(), 'One pending-work summary is visible');
            Assert.areEqual((Id)pendingId, drafts[0].get('id'), 'Pending summary points to the correct draft');
            Assert.areEqual('layout:Contact:default', drafts[0].get('key'), 'Pending summary names the configured surface');
            List<Map<String,Object>> recent = (List<Map<String,Object>>)data.get('recentActivity');
            Assert.areEqual(1, recent.size(), 'Only the supported publication contributes an audit event');
            Assert.areEqual(3, CardstackStudioController.getDrafts('Draft').size(), 'Draft view retains unsupported candidates for inspection and discard');
            Assert.areEqual(1, CardstackConfigService.countSupportedDrafts(), 'Only the supported Contact candidate counts as active work');
            Assert.areEqual(4, CardstackStudioController.getDrafts(null).size(), 'All draft and published history remains readable');
            Assert.areEqual(4, CardstackStudioController.listConfigKeys().size(), 'All configuration keys remain inspectable');
            Assert.areEqual(18, pendingId.length(), 'Studio returns checksum18 draft identity');
            Assert.areEqual(pendingId, CardstackConnectionTypes.normalizeId(pendingId), 'Returned draft identity has a valid checksum');
            for(Map<String,Object> event : recent) {
                Assert.areEqual('CONFIG_PUBLISH', event.get('action'), 'Dashboard reports the real publication action');
                Assert.areEqual('cardstackStudio', event.get('tool'), 'Dashboard identifies the Studio source');
            }
        }
    }

    @IsTest
    static void blankSetupFlagDoesNotCreateConfigurationOrDraft() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Test.startTest();
            CardstackStudioController.setSetupFlag('  ', true);
            Test.stopTest();
            Assert.areEqual(0, CardstackStudioController.listConfigKeys().size(), 'Blank flag does not create a configuration');
            Assert.areEqual(0, CardstackStudioController.getDrafts(null).size(), 'Blank flag does not stage a draft');
        }
    }


    @IsTest
    static void opportunityPresetDraftDoesNotAuthorizeUntilPublished() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            String raw = opportunityLayout(true);
            Test.startTest();
            String draftId = CardstackStudioController.saveDraft('layout:Opportunity:default', raw);
            Assert.isNull(CardstackConfigService.getConfig('layout:Opportunity:default'), 'Draft is not live');
            Assert.areEqual(0, CardstackRecordActionService.available('Opportunity').size(), 'Draft cannot launch');
            CardstackStudioController.publishDraft(draftId);
            Assert.areEqual(raw, CardstackConfigService.getConfig('layout:Opportunity:default'), 'Publication preserves exact metadata');
            CardstackRecordActionService.Definition action = CardstackRecordActionService.resolve('Opportunity', 'forecast');
            Assert.areEqual('Update forecast', action.label, 'Custom label survives publication');
            Assert.areEqual('StageName', action.mappings[0].fieldApi, 'Stage starts the ordered preset');
            Assert.areEqual('CloseDate', action.mappings[1].fieldApi, 'Date remains second');
            Assert.areEqual('Amount', action.mappings[2].fieldApi, 'Amount remains third');
            Test.stopTest();
        }
    }

    @IsTest
    static void opportunityConstantsAndExtraFieldsCannotBeStagedDirectly() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Test.startTest();
            assertOpportunityRejected(opportunityLayout(true).replace('"source":"current"', '"source":"constant","value":"0"'));
            assertOpportunityRejected(opportunityLayout(true).replace('"fieldApi":"Amount"', '"fieldApi":"Name"'));
            assertOpportunityRejected(opportunityLayout(true).replace('"fieldApi":"Amount","source":"current"', '"fieldApi":"Amount","source":"current","sourceField":"Name"'));
            assertOpportunityRejected(opportunityLayout(true).replace('"fieldApi":"Amount","source":"current"}', '"fieldApi":"Amount","source":"current"},{"fieldApi":"Name","source":"current"}'));
            Assert.areEqual(0, [SELECT count() FROM Cardstack_Config_Draft__c], 'Invalid candidates insert no draft');
            Test.stopTest();
        }
    }

    @IsTest
    static void enabledOpportunityPresetRequiresExposureAndEditableFields() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Test.startTest();
            assertOpportunityRejected(opportunityLayout(true).replace('{"api":"Amount","editable":true}', '{"api":"Name","editable":true}'), 'FIELD_NOT_EDITABLE');
            assertOpportunityRejected(opportunityLayout(true).replace('{"api":"Amount","editable":true}', '{"api":"Amount","editable":true,"readOnly":true}'), 'FIELD_NOT_EDITABLE');
            assertOpportunityRejected(opportunityLayout(true).replace('"writeEnabled":true', '"writeEnabled":false'), 'EDIT_DISABLED');
            assertOpportunityRejected(opportunityLayout(true).replace('"writeEnabled":true', '"writeEnabled":true,"fieldDenylist":["Amount"]'), 'FIELD_NOT_EDITABLE');
            Test.stopTest();
        }
    }

    @IsTest
    static void publicationRevalidatesBypassedOrChangedDraft() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Id valid = CardstackConfigService.saveDraft('layout:Opportunity:default', opportunityLayout(true));
            Cardstack_Config_Draft__c changed = new Cardstack_Config_Draft__c(Id=valid,
                Draft_Value__c=opportunityLayout(true).replace('"source":"current"', '"source":"constant","value":"0"'));
            update as user changed;
            Test.startTest();
            try {
                CardstackStudioController.publishDraft(String.valueOf(valid));
                Assert.fail('Changed invalid draft must not publish');
            } catch (CardstackOpportunityActionPolicy.PolicyException expected) {
                Assert.areEqual('INVALID_PRESET', expected.getMessage(), 'Publication checks the actual candidate');
            }
            Assert.isNull(CardstackConfigService.getConfig('layout:Opportunity:default'), 'Invalid publication never reaches live');
            Assert.areEqual('Draft', [SELECT Status__c FROM Cardstack_Config_Draft__c WHERE Id=:valid WITH USER_MODE].Status__c, 'Rejected candidate stays a draft');
            Test.stopTest();
        }
    }

    @IsTest
    static void directPublicationAlsoRejectsMissingExposure() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Id draftId = CardstackConfigService.saveDraft('layout:Opportunity:default', opportunityLayout(true));
            Cardstack_Config_Draft__c changed = new Cardstack_Config_Draft__c(Id=draftId,
                Draft_Value__c=opportunityLayout(true).replace('{"api":"Amount","editable":true}', '{"api":"Name","editable":true}'));
            update as user changed;
            Test.startTest();
            try { CardstackConfigService.publishDraft(draftId); Assert.fail('Direct publication cannot bypass exposure checks'); }
            catch (CardstackOpportunityActionPolicy.PolicyException expected) { Assert.areEqual('FIELD_NOT_EDITABLE', expected.getMessage(), 'Exposure is rechecked'); }
            Assert.isNull(CardstackConfigService.getConfig('layout:Opportunity:default'), 'Missing exposure never publishes');
            Test.stopTest();
        }
    }

    @IsTest
    static void disabledPresetCanReduceRightsButNeverLaunch() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            String raw = opportunityLayout(false).replace('"writeEnabled":true', '"writeEnabled":false')
                .replace('{"api":"Amount","editable":true}', '{"api":"Amount","editable":false,"readOnly":true}');
            Test.startTest();
            Id draftId = CardstackConfigService.saveDraft('layout:Opportunity:default', raw);
            CardstackConfigService.publishDraft(draftId);
            Assert.areEqual(raw, CardstackConfigService.getConfig('layout:Opportunity:default'), 'Disabled preset permits reducing rights');
            Assert.areEqual(0, CardstackRecordActionService.available('Opportunity').size(), 'Disabled published action never launches');
            assertOpportunityRejected(raw.replace('"source":"current"', '"source":"constant","value":"0"'));
            Test.stopTest();
        }
    }

    @IsTest
    static void accountMappingMetadataRemainsUnchangedThroughPublication() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            String raw = '{"custom":{"version":7},"permissions":{"writeEnabled":false},"fields":[{"api":"Description"}],"actions":[{"name":"account_edit","label":"Account edit","type":"record-edit","enabled":false,"mappings":[{"fieldApi":"Description","source":"constant","value":"","metadata":"preserve"}]}]}';
            Test.startTest();
            String draftId = CardstackStudioController.saveDraft('layout:Account:default', raw);
            CardstackStudioController.publishDraft(draftId);
            Assert.areEqual(raw, CardstackStudioController.getConfigValue('layout:Account:default'), 'Account mappings and unknown metadata roundtrip unchanged');
            Test.stopTest();
        }
    }

    @IsTest
    static void lowercaseOpportunityKeyRejectsDirectStagingBeforeAnyInsertion() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            String invalid = opportunityLayout(true).replace('"source":"current"', '"source":"constant","value":"0"');
            Test.startTest();
            assertCaseVariantStagingRejected('layout:opportunity:default', invalid);
            Assert.areEqual(0, [SELECT count() FROM Cardstack_Config__c WITH USER_MODE], 'Invalid lowercase candidate cannot create a parent');
            Assert.areEqual(0, [SELECT count() FROM Cardstack_Config_Draft__c WITH USER_MODE], 'Invalid lowercase candidate cannot create a draft');
            Test.stopTest();
        }
    }

    @IsTest
    static void mixedCaseOpportunityKeyRejectsDirectStagingAgainstCanonicalParent() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            String original = opportunityLayout(false);
            Cardstack_Config__c parent = new Cardstack_Config__c(Name='layout:Opportunity:default', Value__c=original, Is_Active__c=true);
            insert as user parent;
            String invalid = opportunityLayout(true).replace('"fieldApi":"Amount","source":"current"}', '"fieldApi":"Amount","source":"current"},{"fieldApi":"Name","source":"current"}');
            Test.startTest();
            assertCaseVariantStagingRejected('LaYoUt:oPpOrTuNiTy:DeFaUlT', invalid);
            Assert.areEqual(1, [SELECT count() FROM Cardstack_Config__c WITH USER_MODE], 'Case variant cannot create another parent');
            Assert.areEqual(0, [SELECT count() FROM Cardstack_Config_Draft__c WITH USER_MODE], 'Case variant cannot bypass preinsert draft validation');
            Assert.areEqual(original, CardstackConfigService.getConfig('layout:Opportunity:default'), 'Live parent value is unchanged');
            Test.stopTest();
        }
    }

    @IsTest
    static void lowercasePersistedParentRejectsIndependentInvalidPublicationBeforeBothUpdates() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            String invalid = opportunityLayout(true).replace('"source":"current"', '"source":"constant","value":"0"');
            assertSeededCaseVariantPublicationRejected('layout:opportunity:default', invalid, false);
        }
    }

    @IsTest
    static void mixedCasePersistedParentRejectsIndependentInvalidPublicationWithoutChangingLiveValue() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            String invalid = opportunityLayout(true).replace('"fieldApi":"Amount","source":"current"}', '"fieldApi":"Amount","source":"current"},{"fieldApi":"Name","source":"current"}');
            assertSeededCaseVariantPublicationRejected('LAYOUT:OPPORTUNITY:DEFAULT', invalid, true);
        }
    }

    @IsTest
    static void validMixedCaseOpportunityCandidatePublishesWithCanonicalRuntimePolicy() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            String raw = opportunityLayout(true);
            Test.startTest();
            Id draftId = CardstackConfigService.saveDraft('LaYoUt:oPpOrTuNiTy:DeFaUlT', raw);
            CardstackConfigService.publishDraft(draftId);
            Assert.areEqual(raw, CardstackConfigService.getConfig('layout:Opportunity:default'), 'Canonical runtime read resolves the valid case variant');
            CardstackRecordActionService.Definition action = CardstackRecordActionService.resolve('Opportunity', 'forecast');
            Assert.areEqual('StageName', action.mappings[0].fieldApi, 'Case variant never changes canonical Opportunity field identity');
            Assert.areEqual('Update forecast', action.label, 'Exact public action metadata survives');
            Test.stopTest();
        }
    }

    @IsTest
    static void disabledLowercaseOpportunityCandidateCanReducePermissions() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            String raw = opportunityLayout(false).replace('"writeEnabled":true', '"writeEnabled":false')
                .replace('{"api":"Amount","editable":true}', '{"api":"Amount","editable":false,"readOnly":true}');
            Test.startTest();
            Id draftId = CardstackConfigService.saveDraft('layout:opportunity:default', raw);
            CardstackConfigService.publishDraft(draftId);
            Assert.areEqual(raw, CardstackConfigService.getConfig('layout:Opportunity:default'), 'Case normalization preserves disabled permission reduction');
            Assert.areEqual(0, CardstackRecordActionService.available('Opportunity').size(), 'Disabled case-variant action remains unlaunchable');
            Test.stopTest();
        }
    }

    private static String genericAccountNameLayout() {
        return '{"permissions":{"writeEnabled":true},"fields":[{"api":"Name","editable":true}],"actions":[{"name":"edit_name","label":"Edit name","enabled":true,"type":"record-edit","mappings":[{"fieldApi":"Name","source":"current"}]}]}';
    }

    @IsTest
    static void mixedCaseGenericAccountKeyPublishesCanonicalAction() {
        CardstackRecordEditTestData.grantCurrentActorAccountAccess();
        System.runAs(new User(Id=UserInfo.getUserId())) {
            String raw=genericAccountNameLayout();
            Test.startTest();
            Id draft=CardstackConfigService.saveDraft('LaYoUt:aCcOuNt:DeFaUlT',raw);
            CardstackConfigService.publishDraft(draft);
            CardstackRecordActionService.Definition action=CardstackRecordActionService.resolve('Account','edit_name');
            Test.stopTest();
            Assert.areEqual(raw,CardstackConfigService.getConfig('layout:Account:default'),'Equivalent key spelling publishes to the canonical runtime identity.');
            Assert.areEqual('Name',action.mappings[0].fieldApi,'Key aliases never change canonical native field identifiers.');
            Assert.areEqual(1,[SELECT count() FROM Cardstack_Config__c WITH USER_MODE],'Equivalent key spelling creates one parent.');
        }
    }

    @IsTest
    static void uppercaseGenericKeyRejectsNoncanonicalFieldBeforeStaging() {
        CardstackRecordEditTestData.grantCurrentActorAccountAccess();
        System.runAs(new User(Id=UserInfo.getUserId())) {
            String invalid=genericAccountNameLayout().replace('"fieldApi":"Name"','"fieldApi":"name"');
            Test.startTest();
            Integer beforeRows=Limits.getDmlRows();
            try { CardstackConfigService.saveDraft('LAYOUT:ACCOUNT:DEFAULT',invalid); Assert.fail('Uppercase generic key cannot bypass native field validation.'); }
            catch(CardstackOpportunityActionPolicy.PolicyException error) { Assert.areEqual('UNKNOWN_FIELD',error.getMessage(),'Only config-key object identity is canonicalized.'); }
            Assert.areEqual(beforeRows,Limits.getDmlRows(),'Rejected alias staging precedes every insertion.');
            Test.stopTest();
            Assert.areEqual(0,[SELECT count() FROM Cardstack_Config__c WITH USER_MODE],'Rejected alias creates no parent.');
            Assert.areEqual(0,[SELECT count() FROM Cardstack_Config_Draft__c WITH USER_MODE],'Rejected alias creates no draft.');
        }
    }

    @IsTest
    static void mixedCaseGenericParentRejectsNoncanonicalFieldBeforePublication() {
        CardstackRecordEditTestData.grantCurrentActorAccountAccess();
        System.runAs(new User(Id=UserInfo.getUserId())) {
            String original='{}',invalid=genericAccountNameLayout().replace('"fieldApi":"Name"','"fieldApi":"name"');
            Cardstack_Config__c parent=new Cardstack_Config__c(Name='LaYoUt:aCcOuNt:DeFaUlT',Value__c=original,Is_Active__c=true); insert as user parent;
            Cardstack_Config_Draft__c draft=new Cardstack_Config_Draft__c(Config__c=parent.Id,Draft_Value__c=invalid,Status__c='Draft'); insert as user draft;
            Test.startTest();
            Integer beforeRows=Limits.getDmlRows();
            try { CardstackConfigService.publishDraft(draft.Id); Assert.fail('Persisted generic key alias cannot bypass publication validation.'); }
            catch(CardstackOpportunityActionPolicy.PolicyException error) { Assert.areEqual('UNKNOWN_FIELD',error.getMessage(),'Publication retains exact native field identifiers.'); }
            Assert.areEqual(beforeRows,Limits.getDmlRows(),'Rejected publication precedes both updates.');
            Test.stopTest();
            Assert.areEqual(original,[SELECT Value__c FROM Cardstack_Config__c WHERE Id=:parent.Id WITH USER_MODE].Value__c,'Invalid alias publication preserves live policy.');
            Assert.areEqual('Draft',[SELECT Status__c FROM Cardstack_Config_Draft__c WHERE Id=:draft.Id WITH USER_MODE].Status__c,'Invalid alias publication leaves the draft unconsumed.');
        }
    }

    private static void assertCaseVariantStagingRejected(String key, String invalid) {
        Integer beforeRows = Limits.getDmlRows();
        try { CardstackConfigService.saveDraft(key, invalid); Assert.fail('Case-variant Opportunity key must not bypass staging validation'); }
        catch (CardstackOpportunityActionPolicy.PolicyException expected) {
            Assert.areEqual('INVALID_PRESET', expected.getMessage(), 'Shared exact-shape validator handles the equivalent key');
        }
        Assert.areEqual(beforeRows, Limits.getDmlRows(), 'Rejected staging precedes all config and draft insertion');
    }

    private static void assertSeededCaseVariantPublicationRejected(String key, String invalid, Boolean active) {
        String original = opportunityLayout(false);
        Cardstack_Config__c parent = new Cardstack_Config__c(Name=key, Value__c=original, Is_Active__c=active);
        insert as user parent;
        Cardstack_Config_Draft__c draft = new Cardstack_Config_Draft__c(Config__c=parent.Id, Draft_Value__c=invalid, Status__c='Draft');
        insert as user draft;
        // Direct seeding deliberately bypasses saveDraft, isolating publication's own check.
        Test.startTest();
        Integer beforeRows = Limits.getDmlRows();
        try { CardstackConfigService.publishDraft(draft.Id); Assert.fail('Persisted equivalent key must not bypass publication validation'); }
        catch (CardstackOpportunityActionPolicy.PolicyException expected) {
            Assert.areEqual('INVALID_PRESET', expected.getMessage(), 'Actual stored parent spelling is recognized');
        }
        Assert.areEqual(beforeRows, Limits.getDmlRows(), 'Rejection precedes both publication updates');
        Cardstack_Config__c unchangedParent = [SELECT Value__c, Is_Active__c FROM Cardstack_Config__c WHERE Id=:parent.Id WITH USER_MODE];
        Cardstack_Config_Draft__c unchangedDraft = [SELECT Draft_Value__c, Status__c FROM Cardstack_Config_Draft__c WHERE Id=:draft.Id WITH USER_MODE];
        Assert.areEqual(original, unchangedParent.Value__c, 'Persisted previous value remains unchanged');
        Assert.areEqual(active, unchangedParent.Is_Active__c, 'Parent activation state remains unchanged');
        Assert.areEqual('Draft', unchangedDraft.Status__c, 'Candidate remains Draft');
        Assert.areEqual(invalid, unchangedDraft.Draft_Value__c, 'Rejected candidate is not rewritten');
        Assert.areEqual(active ? original : null, CardstackConfigService.getConfig('layout:Opportunity:default'), 'Canonical live value remains unchanged or absent');
        Assert.areEqual(0, [SELECT count() FROM Cardstack_Audit_Log__c WITH USER_MODE], 'Rejected publication emits no success audit');
        Test.stopTest();
    }

    private static String opportunityLayout(Boolean enabled) {
        return '{"custom":{"version":7},"permissions":{"writeEnabled":true},"fields":[{"api":"StageName","editable":true},{"api":"CloseDate","editable":true},{"api":"Amount","editable":true}],"actions":[{"name":"forecast","label":"Update forecast","type":"record-edit","enabled":'+String.valueOf(enabled)+',"mappings":[{"fieldApi":"StageName","source":"current"},{"fieldApi":"CloseDate","source":"current"},{"fieldApi":"Amount","source":"current"}]}]}';
    }
    private static void assertOpportunityRejected(String raw) {
        assertOpportunityRejected(raw, 'INVALID_PRESET');
    }
    private static void assertOpportunityRejected(String raw, String code) {
        try { CardstackConfigService.saveDraft('layout:Opportunity:default', raw); Assert.fail('Invalid Opportunity preset must be rejected'); }
        catch (CardstackOpportunityActionPolicy.PolicyException expected) { Assert.areEqual(code, expected.getMessage(), 'Exact authoring rule rejects the candidate'); }
    }

    @IsTest
    static void defaultAndDraftViewsRetainOlderSupportedCandidatesAndHistory() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Cardstack_Config__c config = new Cardstack_Config__c(Name = 'layout:Contact:default', Is_Active__c = false);
            Cardstack_Config__c retained = new Cardstack_Config__c(Name = 'layout:Account:sales', Value__c = '{}', Is_Active__c = true);
            insert new List<Cardstack_Config__c>{config, retained};
            Cardstack_Config_Draft__c older = new Cardstack_Config_Draft__c(Config__c = config.Id, Draft_Value__c = '{}', Status__c = 'Draft');
            insert older;
            Test.setCreatedDate(older.Id, Datetime.now().addDays(-1));
            List<Cardstack_Config_Draft__c> newer = new List<Cardstack_Config_Draft__c>();
            for (Integer index = 0; index < 251; index++) newer.add(new Cardstack_Config_Draft__c(Config__c = retained.Id, Draft_Value__c = '{}', Status__c = 'Draft'));
            insert newer;
            Test.startTest();
            List<Cardstack_Config_Draft__c> allRows = CardstackStudioController.getDrafts('');
            List<Cardstack_Config_Draft__c> draftRows = CardstackStudioController.getDrafts('Draft');
            Map<String, Object> dashboard = CardstackStudioController.getDashboardData();
            Map<String, Object> checklist = CardstackStudioController.getChecklistState();
            Test.stopTest();
            for (List<Cardstack_Config_Draft__c> view : new List<List<Cardstack_Config_Draft__c>>{allRows, draftRows}) {
                Assert.areEqual(201, view.size(), 'Bounded retained history and the supported active window are both available.');
                Set<Id> identities = new Set<Id>();
                for (Cardstack_Config_Draft__c draft : view) identities.add(draft.Id);
                Assert.isTrue(identities.contains(older.Id), 'Default and Draft views include the older supported candidate.');
            }
            Assert.areEqual(1, dashboard.get('pendingDraftCount'), 'Overview counts supported candidates before history truncation.');
            List<Map<String, Object>> summaries = (List<Map<String, Object>>)dashboard.get('pendingDrafts');
            Assert.areEqual(older.Id, summaries[0].get('id'), 'Overview summarizes the supported draft.');
            List<Map<String, Object>> items = (List<Map<String, Object>>)checklist.get('items');
            for (Map<String, Object> item : items) if (item.get('id') == 'drafts') Assert.areEqual(false, item.get('done'), 'The checklist must not report all published.');
        }
    }

    @IsTest
    static void individualPublishUsesReviewedDigests() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            String id = CardstackStudioController.saveDraft('flows', '[ {"apiName":"Review"} ]');
            Test.startTest();
            Map<String,Object> review = CardstackStudioController.getDraftReview(id);
            Assert.areEqual(id, review.get('draftId'), 'Review binds the normalized 18 character identity');
            Assert.areEqual('[ {"apiName":"Review"} ]', review.get('draftValue'), 'Exact stored candidate is preserved');
            Assert.areEqual(EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256', Blob.valueOf(JSON.serialize(new List<String>{null})))).toLowerCase(), review.get('liveDigest'), 'Null is hashed as a JSON list element');
            CardstackStudioController.publishReviewedDraft(id, (String)review.get('liveDigest'), (String)review.get('draftDigest'));
            Assert.areEqual('Published', CardstackStudioController.getDraftStatus(id), 'Authoritative exact status supports response reconciliation');
            Test.stopTest();
            Assert.areEqual(review.get('draftValue'), CardstackConfigService.getConfig('flows'), 'Reviewed candidate becomes live without rewriting');
        }
    }

    @IsTest
    static void controllerReturnsExplicitStaleReview() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            String id = CardstackStudioController.saveDraft('flows', '[]');
            Map<String,Object> review = CardstackStudioController.getDraftReview(id);
            Test.startTest();
            try { CardstackStudioController.publishReviewedDraft(id, 'changed', (String)review.get('draftDigest')); Assert.fail('Mismatched digest must fail'); }
            catch (AuraHandledException expected) { Assert.areEqual('STALE_REVIEW', expected.getMessage(), 'LWC receives a stable rejection code'); }
            Test.stopTest();
            Assert.areEqual('Draft', CardstackStudioController.getDraftStatus(id), 'Failed draft remains available');
        }
    }
    @IsTest static void fieldCatalogSuppliesBooleanUpdateable() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Test.startTest();
            List<Map<String,Object>> fields=CardstackStudioController.getStudioFieldCatalog('Account');
            Test.stopTest();
            Map<String,Object> nameField;
            for (Map<String,Object> field : fields) {
                Assert.isTrue(field.get('updateable') instanceof Boolean, 'Editor consumes a Boolean, not a string.');
                if (field.get('api') == 'Name') nameField=field;
            }
            Assert.isNotNull(nameField, 'Readable Account Name is cataloged.');
            Assert.areEqual(Account.Name.getDescribe().isUpdateable(), nameField.get('updateable'), 'Editability matches current actor metadata.');
        }
    }

    @IsTest static void recordEditEligibilityIsCanonicalMetadataWithoutQueryOrWrite() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Test.startTest();
            Map<String,Object> descriptor = CardstackStudioController.getRecordEditCapability('Account');
            Assert.areEqual('record-edit-eligibility/v1',descriptor.get('contractVersion'),'Shared native contract.');
            Assert.areEqual('Account',descriptor.get('objectApiName'),'Canonical object.');
            Assert.areEqual(Account.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED).getKeyPrefix(),descriptor.get('nativeKeyPrefix'),'Native prefix.');
            Assert.areEqual(true,descriptor.get('eligible'),'Eligible native fixture.');
            Assert.isFalse(((List<Map<String,Object>>)descriptor.get('fields')).isEmpty(),'Ordered native fields.');
            Assert.areEqual(0,Limits.getQueries(),'Metadata does not read private or CRM data.');
            Assert.areEqual(0,Limits.getDmlStatements(),'Metadata never grants published authority.');
            Test.stopTest();
        }
    }
    @IsTest static void recordEditEligibilityPreservesNativeNoncanonicalDenial() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Test.startTest();
            Map<String,Object> descriptor = CardstackStudioController.getRecordEditCapability('account');
            Assert.areEqual(false,descriptor.get('eligible'),'Case-mismatched input is not canonical.');
            Assert.areEqual('NONCANONICAL_OBJECT',descriptor.get('exclusionReason'),'Native reason is retained.');
            Test.stopTest();
        }
    }
}
