/** Test-only synthetic fixtures; IDs come from platform Describe or inserted data. */
@IsTest(SeeAllData=false)
public with sharing class CardstackOpportunityEditTestData {
    /** Package validation actors need published-config Read/FLS before fixture DML. */
    public static void grantCurrentActorPackageRead() {
        Id actorId = Id.valueOf(CardstackConnectionTypes.normalizeId(UserInfo.getUserId()));
        PermissionSet userPermission = [SELECT Id FROM PermissionSet
            WHERE Name='Cardstack_User' AND IsOwnedByProfile=false WITH SYSTEM_MODE LIMIT 1];
        if ([SELECT count() FROM PermissionSetAssignment
            WHERE AssigneeId=:actorId AND PermissionSetId=:userPermission.Id WITH SYSTEM_MODE] == 0) {
            insert new PermissionSetAssignment(AssigneeId=actorId, PermissionSetId=userPermission.Id);
        }
    }
    public static CardstackOpportunityEditTypes.RecordContext current() {
        CardstackOpportunityEditTypes.RecordContext result = new CardstackOpportunityEditTypes.RecordContext();
        result.record = new Opportunity(Name='Example renewal', StageName='Qualification_API',
            CloseDate=Date.newInstance(2026, 11, 30), Amount=Decimal.valueOf('10000'));
        if (Opportunity.SObjectType.getDescribe().fields.getMap().containsKey('CurrencyIsoCode')) {
            result.record.put('CurrencyIsoCode', 'USD');
            result.currencyCode = 'USD';
        } else {
            result.currencyCode = UserInfo.getDefaultCurrency();
        }
        result.freshness = 'synthetic-freshness';
        return result;
    }
    public static CardstackOpportunityEditTypes.Policy policy() {
        CardstackOpportunityEditTypes.Policy result = new CardstackOpportunityEditTypes.Policy();
        result.editableFields = new Set<String>{'StageName', 'CloseDate', 'Amount'};
        result.requiredFields = new Set<String>{'StageName', 'CloseDate'};
        result.clearableFields = new Set<String>{'Amount'};
        return result;
    }
    public static CardstackOpportunityEditTypes.FieldChange change(String field, String operation, String value) {
        CardstackOpportunityEditTypes.FieldChange result = new CardstackOpportunityEditTypes.FieldChange();
        result.fieldApi = field;
        result.operation = operation;
        result.value = value;
        return result;
    }
    public static CardstackOpportunityEditTypes.StageContext stages() {
        CardstackOpportunityEditTypes.StageContext result = new CardstackOpportunityEditTypes.StageContext();
        result.recordTypeId = masterId();
        result.choices.add(choice('Qualification affichée', 'Qualification_API'));
        result.choices.add(choice('Negotiation affichée', 'Negotiation_API'));
        result.fingerprint = 'synthetic-stage-context';
        return result;
    }
    public static CardstackOpportunityEditTypes.Choice choice(String label, String value) {
        CardstackOpportunityEditTypes.Choice result = new CardstackOpportunityEditTypes.Choice();
        result.label = label;
        result.value = value;
        return result;
    }
    public static String masterId() {
        for (Schema.RecordTypeInfo info : Opportunity.SObjectType.getDescribe().getRecordTypeInfos()) {
            if (info.isMaster()) {
                return CardstackConnectionTypes.normalizeId(String.valueOf(info.getRecordTypeId()));
            }
        }
        Assert.fail('Opportunity master context must be available from platform Describe');
        return null;
    }
    public static Account insertAccount() {
        Account record = new Account(Name='Cardstack unrelated RED fixture');
        Database.insert(record, AccessLevel.USER_MODE);
        return record;
    }
    public static Opportunity insertOpportunity() {
        String stage;
        for (Schema.PicklistEntry entry : Opportunity.StageName.getDescribe().getPicklistValues()) {
            if (entry.isActive()) {
                stage = entry.getValue();
                break;
            }
        }
        Opportunity record = new Opportunity(Name='Cardstack RED fixture', StageName=stage,
            CloseDate=Date.newInstance(2026, 11, 30), Amount=Decimal.valueOf('10000'));
        Database.insert(record, AccessLevel.USER_MODE);
        return record;
    }
}
