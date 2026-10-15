/** Required server-owned audit behavior, independent of the best-effort logger. */
@IsTest(SeeAllData=false)
private with sharing class CardstackOpportunityWriteAuditTest {
    @IsTest static void requiredAuditRecordsValidatedActorAndReviewedDiff() {
        CardstackConnectionAccess.userOverride = true;
        Opportunity record = CardstackOpportunityEditTestData.insertOpportunity();
        CardstackOpportunityEditTypes.Receipt receipt = receipt(); String failure;
        Test.startTest();
        try { CardstackOpportunityWriteAudit.appendRequired(record.Id, receipt); }
        catch (CardstackOpportunityWriteAudit.AuditException error) { failure = error.getMessage(); }
        Assert.isNull(failure, 'Valid required audit must persist instead of swallowing or rejecting');
        Cardstack_Audit_Log__c row = [SELECT Action__c, Tool_Name__c, User__c, Record_Id__c, Timestamp__c, Details__c
            FROM Cardstack_Audit_Log__c WITH SYSTEM_MODE LIMIT 1];
        Assert.areEqual('UPDATE', row.Action__c, 'Audit action identifies one confirmed update');
        Assert.areEqual('crm_opportunity_edit_confirm', row.Tool_Name__c, 'Audit identifies the governed Confirm tool');
        Assert.areEqual(UserInfo.getUserId(), row.User__c, 'Actor is derived from the connected user');
        Assert.areEqual(CardstackConnectionTypes.normalizeId(String.valueOf(record.Id)), row.Record_Id__c, 'Audit binds normalized Opportunity identity');
        Assert.isNotNull(row.Timestamp__c, 'Required audit records server time');
        Map<String,Object> details = (Map<String,Object>)JSON.deserializeUntyped(row.Details__c);
        Assert.areEqual('opportunity-write-audit/v1', details.get('contractVersion'), 'Required audit details are versioned');
        CardstackOpportunityEditTypes.Receipt stored = (CardstackOpportunityEditTypes.Receipt)JSON.deserializeStrict(
            JSON.serialize(details.get('receipt')), CardstackOpportunityEditTypes.Receipt.class);
        Assert.areEqual(JSON.serialize(receipt), JSON.serialize(stored), 'Audit stores exact reviewed receipt and diff');
        Assert.areEqual(1, [SELECT count() FROM Cardstack_Audit_Log__c WITH SYSTEM_MODE], 'Exactly one required audit exists'); Test.stopTest();
    }
    @IsTest static void requiredAuditFailurePropagates() {
        CardstackConnectionAccess.userOverride = true; Opportunity record = CardstackOpportunityEditTestData.insertOpportunity();
        CardstackOpportunityWriteAudit.failAppend = true;
        Test.startTest();
        try { CardstackOpportunityWriteAudit.appendRequired(record.Id, receipt()); Assert.fail('Required audit failure must propagate'); }
        catch (CardstackOpportunityWriteAudit.AuditException error) { Assert.areEqual('AUDIT_UNAVAILABLE', error.getMessage(), 'Required audit failure is bounded and cannot claim success'); }
        Assert.areEqual(1, CardstackOpportunityWriteAudit.appendAttempts, 'Required insert boundary was actually attempted');
        Assert.areEqual(0, [SELECT count() FROM Cardstack_Audit_Log__c WITH SYSTEM_MODE], 'Fault persists no audit'); Test.stopTest();
    }
    @IsTest static void requiredAuditNeedsNamedUser() {
        Opportunity record = CardstackOpportunityEditTestData.insertOpportunity(); CardstackConnectionAccess.userOverride = false;
        Test.startTest();
        try { CardstackOpportunityWriteAudit.appendRequired(record.Id, receipt()); Assert.fail('Required audit must enforce named application access'); }
        catch (CardstackConnectionTypes.ConnectionException error) { Assert.areEqual('NOT_AUTHORIZED', error.getMessage(), 'System insert never expands runtime permission'); }
        Assert.areEqual(0, [SELECT count() FROM Cardstack_Audit_Log__c WITH SYSTEM_MODE], 'Denied user persists no audit'); Test.stopTest();
    }
    @IsTest static void requiredAuditRejectsNonOpportunityTarget() {
        CardstackConnectionAccess.userOverride = true; Account record = CardstackOpportunityEditTestData.insertAccount();
        Test.startTest(); rejects(record.Id, receipt(), 'INVALID_AUDIT_CONTEXT'); Test.stopTest();
    }
    @IsTest static void requiredAuditRejectsNoChangesReceipt() {
        CardstackConnectionAccess.userOverride = true; Opportunity record = CardstackOpportunityEditTestData.insertOpportunity();
        CardstackOpportunityEditTypes.Receipt noChange = receipt(); noChange.status = 'noChanges';
        Test.startTest(); rejects(record.Id, noChange, 'INVALID_AUDIT_CONTEXT'); Test.stopTest();
    }
    @IsTest static void requiredAuditRejectsEmptyReviewedDiff() {
        CardstackConnectionAccess.userOverride = true; Opportunity record = CardstackOpportunityEditTestData.insertOpportunity();
        CardstackOpportunityEditTypes.Receipt empty = receipt(); empty.diff.clear();
        Test.startTest(); rejects(record.Id, empty, 'INVALID_AUDIT_CONTEXT'); Test.stopTest();
    }
    @IsTest static void requiredAuditRejectsUnknownReviewedField() {
        CardstackConnectionAccess.userOverride = true; Opportunity record = CardstackOpportunityEditTestData.insertOpportunity();
        CardstackOpportunityEditTypes.Receipt invalid = receipt(); invalid.diff[0].fieldApi = 'Name';
        Test.startTest(); rejects(record.Id, invalid, 'INVALID_AUDIT_CONTEXT'); Test.stopTest();
    }
    private static void rejects(Id target, CardstackOpportunityEditTypes.Receipt receipt, String code) {
        try { CardstackOpportunityWriteAudit.appendRequired(target, receipt); Assert.fail('Invalid required audit context must reject'); }
        catch (CardstackOpportunityWriteAudit.AuditException error) { Assert.areEqual(code, error.getMessage(), 'Invalid context must not reach a server-owned insert'); }
        Assert.areEqual(0, [SELECT count() FROM Cardstack_Audit_Log__c WITH SYSTEM_MODE], 'Invalid audit persists no rows');
    }
    private static CardstackOpportunityEditTypes.Receipt receipt() {
        CardstackOpportunityEditTypes.Receipt result = new CardstackOpportunityEditTypes.Receipt();
        result.reference = 'receipt-'+EncodingUtil.convertToHex(Crypto.generateAesKey(128)); result.status = 'saved';
        result.actorDisplayName = UserInfo.getName(); result.completedAt = Datetime.now().formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\'');
        CardstackOpportunityEditTypes.DiffRow diff = new CardstackOpportunityEditTypes.DiffRow();
        diff.fieldApi = 'Amount'; diff.label = 'Amount'; diff.beforeValue = '10000'; diff.afterValue = '12000'; result.diff.add(diff); return result;
    }
}
