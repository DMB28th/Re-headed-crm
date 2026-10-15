/** RED specifications for user-mode, single-record reads; no persistent fixture data. */
@IsTest(SeeAllData=false)
private with sharing class CardstackOpportunitySelectorTest {
    @TestSetup static void setupData() { CardstackOpportunityEditTestData.insertOpportunity(); }

    @IsTest static void readsExactRequiredValuesAndFreshness() {
        Boolean hasRecordTypeField = Opportunity.SObjectType.getDescribe().fields.getMap().containsKey('RecordTypeId');
        Opportunity fixture = [SELECT Id, StageName, CloseDate, Amount FROM Opportunity WITH USER_MODE LIMIT 1];
        if (hasRecordTypeField) {
            List<SObject> contexts = Database.queryWithBinds('SELECT RecordTypeId FROM Opportunity WHERE Id = :recordId',
                new Map<String, Object>{'recordId' => fixture.Id}, AccessLevel.USER_MODE);
            fixture.put('RecordTypeId', contexts[0].get('RecordTypeId'));
        }
        Test.startTest();
        CardstackOpportunityEditTypes.RecordContext result = CardstackOpportunitySelector.read(fixture.Id,
            new Set<String>{'StageName', 'CloseDate', 'Amount'}, false);
        Test.stopTest();
        Assert.isNotNull(result.record, 'Selector must return the authorized record');
        Assert.areEqual(fixture.Id, result.record.Id, 'Selector must bind the exact requested record');
        Assert.areEqual(fixture.StageName, result.record.get('StageName'), 'Stage API value must remain exact');
        Assert.areEqual(fixture.CloseDate, result.record.get('CloseDate'), 'Date must remain typed');
        Assert.areEqual(fixture.Amount, result.record.get('Amount'), 'Decimal must remain typed');
        if (hasRecordTypeField) {
            Assert.areEqual(fixture.get('RecordTypeId'), result.record.get('RecordTypeId'), 'Actual record type must be read when available');
        } else {
            Assert.isFalse(result.record.getPopulatedFieldsAsMap().containsKey('RecordTypeId'),
                'Master-only schema must not require an unavailable RecordTypeId column');
        }
        Assert.isNotNull(result.freshness, 'Record values and SystemModstamp need a freshness binding');
    }

    @IsTest static void lockedReadPreservesRecordValues() {
        Opportunity fixture = [SELECT Id, Amount FROM Opportunity WITH USER_MODE LIMIT 1];
        Test.startTest();
        CardstackOpportunityEditTypes.RecordContext result = CardstackOpportunitySelector.read(fixture.Id, new Set<String>{'Amount'}, true);
        Integer selectorDml = Limits.getDmlStatements();
        Assert.areEqual(0, selectorDml, 'Read must not perform CRM DML');
        Test.stopTest();
        Assert.isNotNull(result.record, 'Locked freshness read must return the record');
        Assert.areEqual(fixture.Amount, result.record.get('Amount'), 'Locking must not modify the value');
    }

    @IsTest static void currencyContextUsesRecordCurrencyWhenAvailable() {
        Opportunity fixture = [SELECT Id FROM Opportunity WITH USER_MODE LIMIT 1];
        Boolean multicurrency = Opportunity.SObjectType.getDescribe().fields.getMap().containsKey('CurrencyIsoCode');
        String expected;
        if (multicurrency) {
            Map<String, Object> binds = new Map<String, Object>{'recordId' => fixture.Id};
            List<SObject> records = Database.queryWithBinds('SELECT CurrencyIsoCode FROM Opportunity WHERE Id = :recordId',
                binds, AccessLevel.USER_MODE);
            expected = (String)records[0].get('CurrencyIsoCode');
        }
        Test.startTest();
        CardstackOpportunityEditTypes.RecordContext result = CardstackOpportunitySelector.read(fixture.Id, new Set<String>{'Amount'}, false);
        Test.stopTest();
        Assert.isNotNull(result.currencyCode, 'Editing requires a verified currency context in either org mode');
        if (multicurrency) {
            Assert.areEqual(expected, result.currencyCode, 'Multicurrency uses record currency, not user/default currency');
        } else {
            Assert.isTrue(Pattern.matches('[A-Z]{3}', result.currencyCode), 'Single-currency context needs an ISO currency code');
        }
    }

    @IsTest static void missingIdentityRejected() { reject(null, new Set<String>{'Amount'}, 'INVALID_RECORD'); }

    @IsTest static void unknownRequiredFieldRejected() {
        Opportunity fixture = [SELECT Id FROM Opportunity WITH USER_MODE LIMIT 1];
        reject(fixture.Id, new Set<String>{'UnrecognizedField'}, 'UNKNOWN_FIELD');
    }

    @IsTest static void nonOpportunityIdentityRejected() {
        Account fixture = CardstackOpportunityEditTestData.insertAccount();
        reject(fixture.Id, new Set<String>{'Name'}, 'UNSUPPORTED_OBJECT');
    }

    private static void reject(Id recordId, Set<String> fields, String code) {
        Test.startTest();
        try {
            CardstackOpportunitySelector.read(recordId, fields, false);
            Assert.fail('Expected selector rejection: ' + code);
        } catch (CardstackOpportunitySelector.ReadException error) {
            Assert.areEqual(code, error.getMessage(), 'Selector must return a bounded rejection reason');
        }
        Test.stopTest();
    }
}
