/**
 * Tests for CardstackStudioController: staging round-trip, audit search,
 * and org introspection entry points used by the Studio LWC app.
 */
@IsTest
private class CardstackStudioControllerTest {

    @IsTest
    static void draftRoundTripThroughController() {
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

    @IsTest
    static void saveDraftRejectsInvalidJson() {
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

    @IsTest
    static void auditSearchThroughController() {
        CardstackAuditService.logAction('SEARCH', 'CardstackSearchAction', null, 'q=oil');
        Test.startTest();
        List<Cardstack_Audit_Log__c> rows =
            CardstackStudioController.searchAudit('SEARCH', null, 50, null, null, null);
        List<String> tools = CardstackStudioController.listAuditTools();
        Test.stopTest();
        System.assertEquals(1, rows.size());
        System.assert(tools.contains('CardstackSearchAction'));
    }

    @IsTest
    static void getCrmObjectsReturnsList() {
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

    @IsTest
    static void getConnectionInfoReportsOrg() {
        Test.startTest();
        Map<String, Object> info = CardstackStudioController.getConnectionInfo();
        Test.stopTest();
        System.assertEquals('connected', info.get('status'));
        System.assertNotEquals(null, info.get('orgId'));
        System.assertNotEquals(null, info.get('mcpServers'));
    }

    @IsTest
    static void getDashboardDataReturnsShape() {
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

    @IsTest
    static void getChecklistStateReturnsFiveItems() {
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

    @IsTest
    static void setSetupFlagRoundTrip() {
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
