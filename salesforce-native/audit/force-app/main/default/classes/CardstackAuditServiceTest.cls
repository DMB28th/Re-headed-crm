/**
 * Tests for CardstackAuditService: logging and searching the audit trail.
 */
@IsTest
private class CardstackAuditServiceTest {

    @IsTest
    static void logActionCreatesRow() {
        Test.startTest();
        CardstackAuditService.logAction('SEARCH', 'CardstackSearchAction', null, 'query=oil');
        Test.stopTest();

        List<Cardstack_Audit_Log__c> rows = [
            SELECT Action__c, Tool_Name__c, User__c, Details__c, Timestamp__c
            FROM Cardstack_Audit_Log__c
        ];
        System.assertEquals(1, rows.size(), 'One audit row should be written.');
        System.assertEquals('SEARCH', rows[0].Action__c);
        System.assertEquals('CardstackSearchAction', rows[0].Tool_Name__c);
        System.assertEquals(UserInfo.getUserId(), rows[0].User__c);
        System.assertEquals('query=oil', rows[0].Details__c);
        System.assertNotEquals(null, rows[0].Timestamp__c);
    }

    @IsTest
    static void logActionWithBlankActionWritesNothing() {
        Test.startTest();
        CardstackAuditService.logAction(null, 'tool', null, 'details');
        CardstackAuditService.logAction('  ', 'tool', null, 'details');
        Test.stopTest();

        System.assertEquals(
            0, [SELECT COUNT() FROM Cardstack_Audit_Log__c],
            'Blank actions must not create rows.'
        );
    }

    @IsTest
    static void searchLogsFiltersByTermAndTool() {
        CardstackAuditService.logAction('SEARCH', 'CardstackSearchAction', null, 'query=oil');
        CardstackAuditService.logAction('CREATE', 'CardstackCreateAction', null, 'new account');
        CardstackAuditService.logAction('SEARCH', 'CardstackSearchAction', null, 'query=gas');

        Test.startTest();
        List<Cardstack_Audit_Log__c> byTool =
            CardstackAuditService.searchLogs(null, 'CardstackCreateAction', 50);
        // Note: Details__c is a Long Text Area and cannot be filtered in SOQL;
        // term search covers Action__c and Record_Id__c.
        List<Cardstack_Audit_Log__c> byTerm =
            CardstackAuditService.searchLogs('SEARCH', null, 50);
        List<Cardstack_Audit_Log__c> all =
            CardstackAuditService.searchLogs(null, null, 50);
        Test.stopTest();

        System.assertEquals(1, byTool.size(), 'Tool filter should match one row.');
        System.assertEquals(2, byTerm.size(), 'Term filter should match two SEARCH rows.');
        System.assertEquals(3, all.size(), 'Unfiltered search should return all rows.');
    }

    @IsTest
    static void searchLogsFiltersByDateRange() {
        CardstackAuditService.logAction('SEARCH', 'CardstackSearchAction', null, 'query=oil');

        Test.startTest();
        Date today = Date.today();
        List<Cardstack_Audit_Log__c> inRange =
            CardstackAuditService.searchLogs(null, null, 50, today.addDays(-1), today.addDays(1), null);
        List<Cardstack_Audit_Log__c> outOfRange =
            CardstackAuditService.searchLogs(null, null, 50, today.addDays(-10), today.addDays(-5), null);
        Test.stopTest();

        System.assertEquals(1, inRange.size(), 'Today\'s row should be in range.');
        System.assertEquals(0, outOfRange.size(), 'Old range should match nothing.');
    }

    @IsTest
    static void searchLogsFiltersByUser() {
        CardstackAuditService.logAction('SEARCH', 'CardstackSearchAction', null, 'query=oil');

        Test.startTest();
        List<Cardstack_Audit_Log__c> byUser =
            CardstackAuditService.searchLogs(null, null, 50, null, null, UserInfo.getUserId());
        List<Cardstack_Audit_Log__c> byOther =
            CardstackAuditService.searchLogs(null, null, 50, null, null, '005000000000000AAA');
        Test.stopTest();

        System.assertEquals(1, byUser.size(), 'Current user filter should match.');
        System.assertEquals(0, byOther.size(), 'Other user filter should match nothing.');
    }

    @IsTest
    static void listUsersReturnsCurrentUser() {
        CardstackAuditService.logAction('SEARCH', 'CardstackSearchAction', null, 'query=oil');

        Test.startTest();
        List<Map<String, String>> users = CardstackAuditService.listUsers();
        Test.stopTest();

        System.assertEquals(1, users.size(), 'One distinct user expected.');
        System.assertEquals(UserInfo.getUserId(), users[0].get('id'));
        System.assertNotEquals(null, users[0].get('name'));
    }
}
