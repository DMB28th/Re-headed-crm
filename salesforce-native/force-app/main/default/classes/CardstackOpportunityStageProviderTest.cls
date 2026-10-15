/** RED specifications for provider behavior, independent of ConnectApi availability. */
@IsTest(SeeAllData=false)
private with sharing class CardstackOpportunityStageProviderTest {
    @IsTest static void stageValuesUseRecordTypeApiValues() {
        CardstackOpportunityEditTypes.StageContext fixture = CardstackOpportunityEditTestData.stages();
        CardstackOpportunityStageProvider.source = new FixtureSource(fixture);
        Test.startTest();
        CardstackOpportunityEditTypes.StageContext result = CardstackOpportunityStageProvider.resolve('Opportunity', fixture.recordTypeId);
        Test.stopTest();
        Assert.areEqual(new Set<String>{'Qualification_API', 'Negotiation_API'}, values(result), 'Provider must retain exact API values');
        Assert.areEqual(fixture.recordTypeId, result.recordTypeId, 'Options must bind the requested platform record type');
        Assert.areEqual('Qualification affichée', result.choices[0].label, 'Translated labels remain separate display data');
        Assert.isNotNull(result.fingerprint, 'Options must have a canonical context fingerprint');
    }

    @IsTest static void fixtureOptionSetsRemainDistinct() {
        CardstackOpportunityEditTypes.StageContext first = CardstackOpportunityEditTestData.stages();
        CardstackOpportunityEditTypes.StageContext second = CardstackOpportunityEditTestData.stages();
        second.choices = new List<CardstackOpportunityEditTypes.Choice>{CardstackOpportunityEditTestData.choice('Closed', 'Closed_API')};
        Test.startTest();
        CardstackOpportunityStageProvider.source = new FixtureSource(first);
        CardstackOpportunityEditTypes.StageContext left = CardstackOpportunityStageProvider.resolve('Opportunity', first.recordTypeId);
        CardstackOpportunityStageProvider.source = new FixtureSource(second);
        CardstackOpportunityEditTypes.StageContext right = CardstackOpportunityStageProvider.resolve('Opportunity', second.recordTypeId);
        Test.stopTest();
        Assert.areEqual(new Set<String>{'Qualification_API', 'Negotiation_API'}, values(left), 'First fixture keeps its exact set');
        Assert.areEqual(new Set<String>{'Closed_API'}, values(right), 'Second fixture cannot reuse cached choices');
        Assert.areNotEqual(left.fingerprint, right.fingerprint, 'Option drift must change the fingerprint');
    }

    @IsTest static void choiceOrderAndLabelsDoNotChangeFingerprint() {
        CardstackOpportunityEditTypes.StageContext first = CardstackOpportunityEditTestData.stages();
        CardstackOpportunityEditTypes.StageContext second = CardstackOpportunityEditTestData.stages();
        second.choices = new List<CardstackOpportunityEditTypes.Choice>{
            CardstackOpportunityEditTestData.choice('Other translation', 'Negotiation_API'),
            CardstackOpportunityEditTestData.choice('Another label', 'Qualification_API')};
        Test.startTest();
        CardstackOpportunityStageProvider.source = new FixtureSource(first);
        CardstackOpportunityEditTypes.StageContext left = CardstackOpportunityStageProvider.resolve('Opportunity', first.recordTypeId);
        CardstackOpportunityStageProvider.source = new FixtureSource(second);
        CardstackOpportunityEditTypes.StageContext right = CardstackOpportunityStageProvider.resolve('Opportunity', second.recordTypeId);
        Test.stopTest();
        Assert.isNotNull(left.fingerprint, 'Fingerprint must bind actual context');
        Assert.areEqual(left.fingerprint, right.fingerprint, 'Sorted API values must ignore label translation and order');
    }

    @IsTest static void actualRecordTypeContextIsPreserved() {
        CardstackOpportunityEditTypes.StageContext fixture = CardstackOpportunityEditTestData.stages();
        Schema.DescribeSObjectResult objectDescribe = Opportunity.SObjectType.getDescribe();
        if (objectDescribe.fields.getMap().containsKey('RecordTypeId')) {
            for (Schema.RecordTypeInfo info : objectDescribe.getRecordTypeInfos()) {
                if (!info.isMaster() && info.isAvailable()) {
                    fixture.recordTypeId = CardstackConnectionTypes.normalizeId(String.valueOf(info.getRecordTypeId()));
                    break;
                }
            }
        }
        CardstackOpportunityStageProvider.source = new FixtureSource(fixture);
        Test.startTest();
        CardstackOpportunityEditTypes.StageContext result = CardstackOpportunityStageProvider.resolve('Opportunity', fixture.recordTypeId);
        Test.stopTest();
        Assert.areEqual(fixture.recordTypeId, result.recordTypeId, 'Provider must preserve requested context rather than default it');
        Assert.areEqual(18, result.recordTypeId.length(), 'Provider context must use a full checksum18 identity');
    }

    @IsTest static void missingContextFailsClosed() {
        CardstackOpportunityStageProvider.source = new FixtureSource(null);
        reject('Opportunity', CardstackOpportunityEditTestData.masterId(), 'STAGE_CONTEXT_UNAVAILABLE');
    }
    @IsTest static void missingRecordTypeFailsClosed() { reject('Opportunity', null, 'STAGE_CONTEXT_UNAVAILABLE'); }
    @IsTest static void wrongObjectFailsClosed() { reject('Account', CardstackOpportunityEditTestData.masterId(), 'UNSUPPORTED_OBJECT'); }

    @IsTest static void sourceExceptionFailsClosed() {
        CardstackOpportunityStageProvider.source = new ThrowingSource();
        reject('Opportunity', CardstackOpportunityEditTestData.masterId(), 'STAGE_CONTEXT_UNAVAILABLE');
    }
    @IsTest static void duplicateStageApiValuesRejected() {
        CardstackOpportunityEditTypes.StageContext fixture = CardstackOpportunityEditTestData.stages();
        fixture.choices.add(CardstackOpportunityEditTestData.choice('Different display label', 'Qualification_API'));
        rejectChoices(fixture);
    }
    @IsTest static void missingStageApiValueRejected() {
        CardstackOpportunityEditTypes.StageContext fixture = CardstackOpportunityEditTestData.stages();
        fixture.choices[0].value = null;
        rejectChoices(fixture);
    }
    @IsTest static void nullStageChoiceRejected() {
        CardstackOpportunityEditTypes.StageContext fixture = CardstackOpportunityEditTestData.stages();
        fixture.choices.add(null);
        rejectChoices(fixture);
    }

    @IsTest static void nativeCollectionMapsOnlyStageName() {
        ConnectApi.PicklistValuesCollection collection = nativeCollection();
        ConnectApi.PicklistValues unrelated = new ConnectApi.PicklistValues();
        unrelated.values = new List<ConnectApi.PicklistValue>{nativeChoice('Unrelated', 'Unrelated_API')};
        collection.picklistFieldValues.put('OtherField', unrelated);
        String contextId = CardstackOpportunityEditTestData.masterId();
        Test.startTest();
        CardstackOpportunityEditTypes.StageContext result = CardstackOpportunityStageProvider.mapNativeStageValues(collection, contextId);
        Test.stopTest();
        Assert.isNotNull(result, 'Native StageName collection must map into a real context');
        Assert.areEqual(contextId, result.recordTypeId, 'Mapper must retain full supplied platform context');
        Assert.areEqual(2, result.choices.size(), 'Only the two StageName values belong in the result');
        Assert.areEqual(new Set<String>{'Qualification_API', 'Negotiation_API'}, values(result), 'Other field options must be excluded');
        Assert.areEqual('Qualifié <retour>', result.choices[0].label, 'Native Unicode/plain-text labels must remain literal JSON');
        Assert.areEqual('Qualification_API', result.choices[0].value, 'Display labels must never replace API values');
    }
    @IsTest static void nativeCollectionAcceptsEmptyControllers() {
        ConnectApi.PicklistValuesCollection collection = nativeCollection();
        collection.picklistFieldValues.get('StageName').controllerValues = new Map<String, Integer>();
        Test.startTest();
        CardstackOpportunityEditTypes.StageContext result = CardstackOpportunityStageProvider.mapNativeStageValues(
            collection, CardstackOpportunityEditTestData.masterId());
        Test.stopTest();
        Assert.isNotNull(result, 'An independent Stage field with empty controller map must remain available');
        Assert.areEqual(new Set<String>{'Qualification_API', 'Negotiation_API'}, values(result), 'Independent Stage choices must remain exact');
    }
    @IsTest static void nullNativeCollectionUnavailable() { assertNativeUnavailable(null); }
    @IsTest static void missingNativeFieldMapUnavailable() {
        ConnectApi.PicklistValuesCollection collection = nativeCollection();
        collection.picklistFieldValues = null;
        assertNativeUnavailable(collection);
    }
    @IsTest static void missingNativeStageFieldUnavailable() {
        ConnectApi.PicklistValuesCollection collection = nativeCollection();
        collection.picklistFieldValues.remove('StageName');
        assertNativeUnavailable(collection);
    }
    @IsTest static void nullNativeStageFieldUnavailable() {
        ConnectApi.PicklistValuesCollection collection = nativeCollection();
        collection.picklistFieldValues.put('StageName', null);
        assertNativeUnavailable(collection);
    }
    @IsTest static void nullNativeStageValuesUnavailable() {
        ConnectApi.PicklistValuesCollection collection = nativeCollection();
        collection.picklistFieldValues.get('StageName').values = null;
        assertNativeUnavailable(collection);
    }
    @IsTest static void nativeStageControllersUnavailable() {
        ConnectApi.PicklistValuesCollection collection = nativeCollection();
        collection.picklistFieldValues.get('StageName').controllerValues = new Map<String, Integer>{'Controlling_API' => 0};
        assertNativeUnavailable(collection);
    }
    @IsTest static void nullNativeStageItemUnavailable() {
        ConnectApi.PicklistValuesCollection collection = nativeCollection();
        collection.picklistFieldValues.get('StageName').values.add(null);
        assertNativeUnavailable(collection);
    }

    private static void rejectChoices(CardstackOpportunityEditTypes.StageContext fixture) {
        CardstackOpportunityStageProvider.source = new FixtureSource(fixture);
        reject('Opportunity', fixture.recordTypeId, 'STAGE_CONTEXT_UNAVAILABLE');
    }
    private static ConnectApi.PicklistValuesCollection nativeCollection() {
        ConnectApi.PicklistValues stages = new ConnectApi.PicklistValues();
        stages.values = new List<ConnectApi.PicklistValue>{nativeChoice('Qualifié <retour>', 'Qualification_API'),
            nativeChoice('Négociation affichée', 'Negotiation_API')};
        ConnectApi.PicklistValuesCollection collection = new ConnectApi.PicklistValuesCollection();
        collection.picklistFieldValues = new Map<String, ConnectApi.PicklistValues>{'StageName' => stages};
        return collection;
    }
    private static ConnectApi.PicklistValue nativeChoice(String label, String value) {
        ConnectApi.PicklistValue result = new ConnectApi.PicklistValue();
        result.label = label;
        result.value = value;
        return result;
    }
    private static void assertNativeUnavailable(ConnectApi.PicklistValuesCollection collection) {
        Test.startTest();
        CardstackOpportunityEditTypes.StageContext result = CardstackOpportunityStageProvider.mapNativeStageValues(
            collection, CardstackOpportunityEditTestData.masterId());
        Test.stopTest();
        Assert.isNull(result, 'Malformed/missing native Stage collection must remain unavailable');
    }

    private static Set<String> values(CardstackOpportunityEditTypes.StageContext context) {
        Set<String> result = new Set<String>();
        for (CardstackOpportunityEditTypes.Choice choice : context.choices) { result.add(choice.value); }
        return result;
    }
    private static void reject(String objectApi, String recordTypeId, String code) {
        Test.startTest();
        try {
            CardstackOpportunityStageProvider.resolve(objectApi, recordTypeId);
            Assert.fail('Expected closed Stage capability: ' + code);
        } catch (CardstackOpportunityStageProvider.StageUnavailableException error) {
            Assert.areEqual(code, error.getMessage(), 'Provider must return a bounded capability reason');
        }
        Test.stopTest();
    }
    private with sharing class FixtureSource implements CardstackOpportunityStageProvider.OptionsSource {
        private CardstackOpportunityEditTypes.StageContext fixture;
        private FixtureSource(CardstackOpportunityEditTypes.StageContext fixture) { this.fixture = fixture; }
        public CardstackOpportunityEditTypes.StageContext fetch(String objectApi, String recordTypeId) {
            if (fixture == null || objectApi != 'Opportunity' || recordTypeId != fixture.recordTypeId) { return null; }
            return fixture;
        }
    }
    private with sharing class ThrowingSource implements CardstackOpportunityStageProvider.OptionsSource {
        public CardstackOpportunityEditTypes.StageContext fetch(String objectApi, String recordTypeId) {
            throw new FixtureException('Synthetic source detail must not enter the public denial');
        }
    }
    private class FixtureException extends Exception {}
}
