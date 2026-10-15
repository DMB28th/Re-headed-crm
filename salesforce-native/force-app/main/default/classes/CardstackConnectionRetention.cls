/**
 * Admin-authorized system deletion only of expired private checks older than 30
 * days. No private object CRUD is granted. Scheduling requires an explicit admin
 * choice; neither installation nor request handling schedules or invokes cleanup.
 */
public without sharing class CardstackConnectionRetention implements Schedulable {
    @TestVisible private static Datetime nowOverride;
    /** Executes a single bounded purge as the scheduling Salesforce actor.
     * @param context Platform schedule context (unused).
     */
    public void execute(SchedulableContext context) {
        CardstackConnectionAccess.requireAdmin(); purgeBatch(200);
    }
    /** Deletes at most 200 old expired checks, never CRM records.
     * @param requestedLimit Requested maximum, clamped to 200; null defaults to 200.
     * @return Number of checks deleted in this transaction.
     */
    public static Integer purgeBatch(Integer requestedLimit) {
        CardstackConnectionAccess.requireAdmin();
        Integer boundedLimit = requestedLimit == null ? 200 : Math.min(200, requestedLimit);
        if(boundedLimit <= 0) { return 0; }
        Datetime nowValue = Test.isRunningTest() && nowOverride != null ? nowOverride : Datetime.now();
        Datetime cutoff = nowValue.addDays(-30);
        List<Cardstack_Connection_Check__c> rows = [SELECT Id FROM Cardstack_Connection_Check__c
            WHERE CreatedDate < :cutoff AND Expires_At__c <= :nowValue WITH SYSTEM_MODE
            ORDER BY CreatedDate, Id LIMIT :boundedLimit];
        if(rows.isEmpty()) { return 0; }
        try { Database.delete(rows, AccessLevel.SYSTEM_MODE); }
        catch(DmlException e) { throw new CardstackConnectionTypes.ConnectionException('RETENTION_FAILED'); }
        return rows.size();
    }
}
