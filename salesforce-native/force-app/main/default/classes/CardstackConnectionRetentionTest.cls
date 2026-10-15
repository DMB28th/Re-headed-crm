/** Retention is explicit, bounded, admin-only and confined to private checks. */
@IsTest private with sharing class CardstackConnectionRetentionTest {
    private static List<Cardstack_Connection_Check__c> checks(Integer count) {
        List<Cardstack_Connection_Check__c> rows=new List<Cardstack_Connection_Check__c>();
        for(Integer i=0;i<count;i++) rows.add(new Cardstack_Connection_Check__c(Attempt_Hash__c=EncodingUtil.convertToHex(Crypto.generateAesKey(256)),
            Challenge_Hash__c='0'.repeat(64),Actor__c=UserInfo.getUserId(),Client__c='claude',Revision__c=1,Expires_At__c=Datetime.now().addMinutes(-1),State__c='{}'));
        Database.insert(rows,AccessLevel.SYSTEM_MODE); return rows;
    }
    @IsTest static void retentionDeletesOnlyChecksOlderThanThirtyDays() {
        CardstackConnectionAccess.adminOverride=true; List<Cardstack_Connection_Check__c> rows=checks(3);
        Datetime nowValue=Datetime.now(); CardstackConnectionRetention.nowOverride=nowValue;
        Test.setCreatedDate(rows[0].Id,nowValue.addDays(-31)); Test.setCreatedDate(rows[1].Id,nowValue.addDays(-30));
        Test.startTest(); Assert.areEqual(1,CardstackConnectionRetention.purgeBatch(200),'Strictly older than 30 days'); Test.stopTest();
        Set<Id> remaining=new Map<Id,Cardstack_Connection_Check__c>([SELECT Id FROM Cardstack_Connection_Check__c]).keySet();
        Assert.areEqual(new Set<Id>{rows[1].Id,rows[2].Id},remaining,'Boundary and new check retained');
    }
    @IsTest static void max200PerBatch() {
        CardstackConnectionAccess.adminOverride=true; List<Cardstack_Connection_Check__c> rows=checks(251);
        for(Cardstack_Connection_Check__c row:rows) Test.setCreatedDate(row.Id,Datetime.now().addDays(-31));
        Test.startTest(); Assert.areEqual(200,CardstackConnectionRetention.purgeBatch(251),'Batch capped at 200'); Test.stopTest();
        Assert.areEqual(51,[SELECT count() FROM Cardstack_Connection_Check__c],'Remainder awaits explicit later run');
    }
    @IsTest static void activeCheckRetained() {
        CardstackConnectionAccess.adminOverride=true; List<Cardstack_Connection_Check__c> rows=checks(1);
        Test.setCreatedDate(rows[0].Id,Datetime.now().addDays(-31)); rows[0].Expires_At__c=Datetime.now().addMinutes(10); Database.update(rows,AccessLevel.SYSTEM_MODE);
        Test.startTest(); Assert.areEqual(0,CardstackConnectionRetention.purgeBatch(200),'Active attempt retained'); Test.stopTest();
    }
    @IsTest static void explicitScheduleEntryUsesBoundedPurge() {
        CardstackConnectionAccess.adminOverride=true;
        Integer scheduledBefore=[SELECT count() FROM CronTrigger WITH SYSTEM_MODE];
        Test.startTest(); new CardstackConnectionRetention().execute(null);
        Assert.areEqual(0,Limits.getDmlRows(),'Empty store is a no-op'); Test.stopTest();
        Assert.areEqual(scheduledBefore,[SELECT count() FROM CronTrigger WITH SYSTEM_MODE],'No schedule created relative to the existing job baseline');
    }
    @IsTest static void nonAdminDenied() {
        CardstackConnectionAccess.adminOverride=false; Test.startTest();
        try { CardstackConnectionRetention.purgeBatch(200); Assert.fail('Admin required'); }
        catch(CardstackConnectionTypes.ConnectionException e) { Assert.areEqual('NOT_AUTHORIZED',e.getMessage(),'Permission first'); }
        Assert.areEqual(0,Limits.getQueries(),'No unauthorized lookup'); Test.stopTest();
    }
    @IsTest static void zeroLimitDeletesNothing() {
        CardstackConnectionAccess.adminOverride=true; Test.startTest();
        Assert.areEqual(0,CardstackConnectionRetention.purgeBatch(0),'Zero is bounded no-op'); Test.stopTest();
    }
    @IsTest static void noCrmMutation() {
        CardstackConnectionAccess.adminOverride=true; List<Cardstack_Connection_Check__c> rows=checks(1);
        Test.setCreatedDate(rows[0].Id,Datetime.now().addDays(-31)); Test.startTest();
        Assert.areEqual(1,CardstackConnectionRetention.purgeBatch(1),'One private deletion'); Assert.areEqual(1,Limits.getDmlRows(),'Only check deletion'); Test.stopTest();
        Assert.areEqual(0,[SELECT count() FROM Account],'No Account mutation'); Assert.areEqual(0,[SELECT count() FROM Contact],'No Contact mutation');
        Assert.areEqual(0,[SELECT count() FROM Opportunity],'No Opportunity mutation');
    }
}
