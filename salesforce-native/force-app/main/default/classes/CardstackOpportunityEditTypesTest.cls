/** Consumer contract: literal FieldChange values survive transport before parsing. */
@IsTest(SeeAllData=false)
private with sharing class CardstackOpportunityEditTypesTest {
    @IsTest static void decimalLiteralSurvivesTransportToDomain() {
        CardstackOpportunityEditTypes.FieldChange answer = (CardstackOpportunityEditTypes.FieldChange)
            JSON.deserialize('{"fieldApi":"Amount","operation":"set","value":"12500.25"}',
                CardstackOpportunityEditTypes.FieldChange.class);
        Test.startTest();
        CardstackOpportunityEditTypes.CanonicalPatch patch = CardstackOpportunityEditDomain.canonicalize(
            CardstackOpportunityEditTestData.current(), CardstackOpportunityEditTestData.stages(),
            CardstackOpportunityEditTestData.policy(), new List<CardstackOpportunityEditTypes.FieldChange>{answer});
        Test.stopTest();
        Assert.areEqual(Decimal.valueOf('12500.25'), patch.typedValues.get('Amount'), 'Transport must preserve exact decimal text');
    }

    @IsTest static void nullRecordContextFailsClosed() { rejectRecord(null); }
    @IsTest static void wrongObjectRecordContextFailsClosed() { rejectRecord(new Account(Name='Foreign context')); }
    @IsTest static void nullRecordTypeContextFailsClosed() { rejectRecordType(null); }
    @IsTest static void foreignIdentityCannotBecomeRecordTypeContext() {
        rejectRecordType(String.valueOf(UserInfo.getUserId()));
    }
    @IsTest static void nullDigestPartsFailsClosed() {
        Test.startTest();
        try {
            CardstackOpportunityEditTypes.digest(null);
            Assert.fail('Expected null canonical parts to be denied');
        } catch (CardstackOpportunityEditTypes.ContextException error) {
            Assert.areEqual('INVALID_DIGEST_CONTEXT', error.getMessage(), 'Null parts must return a bounded digest denial');
        }
        Test.stopTest();
    }

    private static void rejectRecord(SObject record) {
        Test.startTest();
        try {
            CardstackOpportunityEditTypes.getRecordTypeContext(record);
            Assert.fail('Expected missing or foreign record context to be denied');
        } catch (CardstackOpportunityEditTypes.ContextException error) {
            Assert.areEqual('RECORD_CONTEXT_UNAVAILABLE', error.getMessage(), 'Record denial must contain no private identity');
        }
        Test.stopTest();
    }
    private static void rejectRecordType(String identity) {
        Test.startTest();
        try {
            CardstackOpportunityEditTypes.requireRecordTypeContext(identity);
            Assert.fail('Expected missing or foreign record type to be denied');
        } catch (CardstackOpportunityEditTypes.ContextException error) {
            Assert.areEqual('RECORD_CONTEXT_UNAVAILABLE', error.getMessage(), 'Context denial must contain no private identity');
        }
        Test.stopTest();
    }
}
