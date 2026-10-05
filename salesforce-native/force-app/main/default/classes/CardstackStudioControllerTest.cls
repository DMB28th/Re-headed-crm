/**
 * Tests for CardstackStudioController: staging round-trip, audit search,
 * and org introspection entry points used by the Studio LWC app.
 */
@IsTest
private class CardstackStudioControllerTest {
    // Package validation users need the same explicit permissions as installed admins.
    @TestSetup
    static void grantPackagePermissions() {
        PermissionSet admin = [SELECT Id FROM PermissionSet WHERE Name = 'Cardstack_Admin' LIMIT 1];
        if ([SELECT count() FROM PermissionSetAssignment WHERE AssigneeId = :UserInfo.getUserId() AND PermissionSetId = :admin.Id] == 0) {
            insert new PermissionSetAssignment(AssigneeId = UserInfo.getUserId(), PermissionSetId = admin.Id);
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
}
