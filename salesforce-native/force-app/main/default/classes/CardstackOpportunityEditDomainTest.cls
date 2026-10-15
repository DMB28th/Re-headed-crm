/** Behavioral RED specifications for the exact three-field Opportunity patch. */
@IsTest(SeeAllData=false)
private with sharing class CardstackOpportunityEditDomainTest {
    @IsTest static void decimalZeroAndPrecisionStayExact() {
        Test.startTest();
        CardstackOpportunityEditTypes.CanonicalPatch patch = canonicalize('Amount', 'set', '12500.25');
        Test.stopTest();
        Assert.areEqual(1, patch.entries.size(), 'Exact amount must produce one patch entry');
        Assert.areEqual('12500.25', patch.entries[0].newValue, 'Canonical decimal must remain exact');
        Assert.areEqual(Decimal.valueOf('12500.25'), patch.typedValues.get('Amount'), 'Amount must be an Apex Decimal');
        Assert.areEqual('Amount', patch.diff[0].fieldApi, 'Review must identify the exact changed field');
        Assert.areEqual('10000', patch.diff[0].beforeValue, 'Review must show the current amount');
        Assert.areEqual('12500.25', patch.diff[0].afterValue, 'Review must show the proposed exact amount');
    }

    @IsTest static void zeroRemainsDecimal() {
        Test.startTest();
        CardstackOpportunityEditTypes.CanonicalPatch patch = canonicalize('Amount', 'set', '0.00');
        Test.stopTest();
        Assert.areEqual(1, patch.entries.size(), 'Zero must remain an explicit change');
        Assert.areEqual(Decimal.valueOf('0'), patch.typedValues.get('Amount'), 'Zero must not become null');
        Assert.areEqual('0', patch.entries[0].newValue, 'Equivalent zero strings have one canonical representation');
    }

    @IsTest static void equivalentZeroCreatesNoChange() {
        CardstackOpportunityEditTypes.RecordContext current = CardstackOpportunityEditTestData.current();
        current.record.put('Amount', Decimal.valueOf('0'));
        Test.startTest();
        CardstackOpportunityEditTypes.CanonicalPatch patch = CardstackOpportunityEditDomain.canonicalize(
            current, CardstackOpportunityEditTestData.stages(), CardstackOpportunityEditTestData.policy(),
            changes('Amount', 'set', '0.00'));
        Test.stopTest();
        Assert.areEqual(0, patch.entries.size(), '0 and 0.00 compare as the same decimal');
        Assert.areEqual(0, patch.typedValues.size(), 'No-op must not create a typed update');
        Assert.areEqual(0, patch.diff.size(), 'No-op must not create a confirmation diff');
    }

    @IsTest static void negativeAmountIsNotSilentlyDenied() {
        Test.startTest();
        CardstackOpportunityEditTypes.CanonicalPatch patch = canonicalize('Amount', 'set', '-25.50');
        Test.stopTest();
        Assert.areEqual(Decimal.valueOf('-25.50'), patch.typedValues.get('Amount'), 'Signed plain decimal remains permitted');
    }

    @IsTest static void calendarDateHasNoTimezone() {
        Test.startTest();
        CardstackOpportunityEditTypes.CanonicalPatch patch = canonicalize('CloseDate', 'set', '2026-12-15');
        Test.stopTest();
        Assert.areEqual(1, patch.entries.size(), 'Calendar date must produce exactly one change');
        Assert.areEqual(Date.newInstance(2026, 12, 15), patch.typedValues.get('CloseDate'), 'Date must remain a calendar Date');
        Assert.areEqual('2026-12-15', patch.entries[0].newValue, 'Date must contain no time or timezone');
    }

    @IsTest static void impossibleCalendarDateRejected() { reject(changes('CloseDate', 'set', '2026-02-30'), 'INVALID_DATE'); }
    @IsTest static void ambiguousCalendarDateRejected() { reject(changes('CloseDate', 'set', '12/15/2026'), 'INVALID_DATE'); }
    @IsTest static void blankCalendarDateRejected() { reject(changes('CloseDate', 'set', ''), 'INVALID_DATE'); }
    @IsTest static void timestampRejectedAsCalendarDate() { reject(changes('CloseDate', 'set', '2026-12-15T00:00:00Z'), 'INVALID_DATE'); }
    @IsTest static void exponentAmountRejected() { reject(changes('Amount', 'set', '1e3'), 'INVALID_AMOUNT'); }
    @IsTest static void blankAmountRejected() { reject(changes('Amount', 'set', ''), 'INVALID_AMOUNT'); }
    @IsTest static void groupedAmountRejected() { reject(changes('Amount', 'set', '12,500.25'), 'INVALID_AMOUNT'); }
    @IsTest static void symbolAmountRejected() { reject(changes('Amount', 'set', '$25.50'), 'INVALID_AMOUNT'); }
    @IsTest static void nonFiniteAmountRejected() { reject(changes('Amount', 'set', 'NaN'), 'INVALID_AMOUNT'); }
    @IsTest static void whitespaceAmountRejected() { reject(changes('Amount', 'set', ' 25.50 '), 'INVALID_AMOUNT'); }

    @IsTest static void excessScaleRejectedWithoutRounding() {
        Integer scale = Opportunity.Amount.getDescribe().getScale();
        String literal = '1.' + '0'.repeat(scale) + '1';
        reject(changes('Amount', 'set', literal), 'AMOUNT_SCALE');
    }

    @IsTest static void excessPrecisionRejectedWithoutTruncation() {
        Schema.DescribeFieldResult amount = Opportunity.Amount.getDescribe();
        String literal = '9'.repeat(amount.getPrecision() - amount.getScale() + 1);
        reject(changes('Amount', 'set', literal), 'AMOUNT_PRECISION');
    }

    @IsTest static void optionalClearProducesExplicitNull() {
        Test.startTest();
        CardstackOpportunityEditTypes.CanonicalPatch patch = canonicalize('Amount', 'clear', null);
        Test.stopTest();
        Assert.areEqual(1, patch.entries.size(), 'Explicit clear creates one update');
        Assert.areEqual('Amount', patch.entries[0].fieldApiName, 'Clear targets only Amount');
        Assert.isNull(patch.entries[0].newValue, 'Clear is represented as null');
        Assert.isTrue(patch.typedValues.containsKey('Amount'), 'Explicit null must be distinguishable from omission');
        Assert.isNull(patch.typedValues.get('Amount'), 'Typed clear must remain null');
    }

    @IsTest static void omittedFieldsNeverCreateEntries() {
        Test.startTest();
        CardstackOpportunityEditTypes.CanonicalPatch patch = canonicalize('CloseDate', 'set', '2026-12-15');
        Test.stopTest();
        Assert.areEqual(1, patch.entries.size(), 'Only the supplied field creates an entry');
        Assert.areEqual(new Set<String>{'CloseDate'}, patch.typedValues.keySet(), 'Omitted Stage and Amount remain unchanged');
    }

    @IsTest static void inactiveCurrentStageCanOnlyBeKept() {
        CardstackOpportunityEditTypes.RecordContext current = CardstackOpportunityEditTestData.current();
        current.record.put('StageName', 'Retired stage');
        Test.startTest();
        CardstackOpportunityEditTypes.CanonicalPatch patch = CardstackOpportunityEditDomain.canonicalize(
            current, CardstackOpportunityEditTestData.stages(), CardstackOpportunityEditTestData.policy(),
            changes('StageName', 'set', 'Retired stage'));
        Test.stopTest();
        Assert.areEqual(0, patch.entries.size(), 'An inactive current Stage can remain unchanged');
        Assert.areEqual(0, patch.diff.size(), 'Keeping current inactive Stage must not invite confirmation');
    }

    @IsTest static void inactiveStageCannotBeSelectedAsNewValue() { reject(changes('StageName', 'set', 'Retired stage'), 'INVALID_STAGE'); }
    @IsTest static void stageLabelCannotReplaceApiValue() { reject(changes('StageName', 'set', 'Negotiation affichée'), 'INVALID_STAGE'); }

    @IsTest static void exactStageApiValueIsPreserved() {
        Test.startTest();
        CardstackOpportunityEditTypes.CanonicalPatch patch = canonicalize('StageName', 'set', 'Negotiation_API');
        Test.stopTest();
        Assert.areEqual('Negotiation_API', patch.typedValues.get('StageName'), 'Translated label must never be stored as API value');
    }

    @IsTest static void duplicateAndUnknownFieldsRejected() {
        List<CardstackOpportunityEditTypes.FieldChange> input = changes('Amount', 'set', '25');
        input.add(CardstackOpportunityEditTestData.change('Amount', 'set', '30'));
        reject(input, 'DUPLICATE_FIELD');
    }
    @IsTest static void unknownFieldRejected() { reject(changes('Name', 'set', 'Changed'), 'UNKNOWN_FIELD'); }
    @IsTest static void unknownOperationRejected() { reject(changes('Amount', 'increment', '5'), 'INVALID_OPERATION'); }
    @IsTest static void stageCannotBeCleared() { reject(changes('StageName', 'clear', null), 'CLEAR_NOT_ALLOWED'); }
    @IsTest static void closeDateCannotBeCleared() { reject(changes('CloseDate', 'clear', null), 'CLEAR_NOT_ALLOWED'); }
    @IsTest static void clearCannotCarryValue() { reject(changes('Amount', 'clear', '25'), 'INVALID_OPERATION'); }
    @IsTest static void setCannotOmitValue() { reject(changes('Amount', 'set', null), 'INVALID_OPERATION'); }

    @IsTest static void requiredAmountCannotBeCleared() {
        CardstackOpportunityEditTypes.Policy policy = CardstackOpportunityEditTestData.policy();
        policy.requiredFields.add('Amount');
        rejectWithPolicy(changes('Amount', 'clear', null), policy, 'CLEAR_NOT_ALLOWED');
    }

    @IsTest static void omittedRequiredNullRejectedWhenAnotherFieldChanges() {
        CardstackOpportunityEditTypes.RecordContext current = CardstackOpportunityEditTestData.current();
        current.record.put('Amount', null);
        CardstackOpportunityEditTypes.Policy policy = CardstackOpportunityEditTestData.policy();
        policy.requiredFields.add('Amount');
        rejectRequiredResult(current, policy, changes('CloseDate', 'set', '2026-12-15'));
    }

    @IsTest static void omittedRequiredNullRejectedWhenNoFieldsChange() {
        CardstackOpportunityEditTypes.RecordContext current = CardstackOpportunityEditTestData.current();
        current.record.put('Amount', null);
        CardstackOpportunityEditTypes.Policy policy = CardstackOpportunityEditTestData.policy();
        policy.requiredFields.add('Amount');
        rejectRequiredResult(current, policy, new List<CardstackOpportunityEditTypes.FieldChange>());
    }

    @IsTest static void readOnlyFieldCannotChange() {
        CardstackOpportunityEditTypes.Policy policy = CardstackOpportunityEditTestData.policy();
        policy.editableFields.remove('Amount');
        rejectWithPolicy(changes('Amount', 'set', '25'), policy, 'FIELD_NOT_EDITABLE');
    }

    @IsTest static void missingCurrencyFailsClosed() {
        CardstackOpportunityEditTypes.RecordContext current = CardstackOpportunityEditTestData.current();
        current.currencyCode = null;
        rejectContext(current, CardstackOpportunityEditTestData.stages(), 'MISSING_CURRENCY');
    }

    @IsTest static void missingContextFailsClosed() {
        rejectContext(CardstackOpportunityEditTestData.current(), null, 'MISSING_STAGE_CONTEXT');
    }

    @IsTest static void missingStageRecordTypeContextFailsClosed() {
        CardstackOpportunityEditTypes.StageContext stages = CardstackOpportunityEditTestData.stages();
        stages.recordTypeId = null;
        rejectContext(CardstackOpportunityEditTestData.current(), stages, 'MISSING_STAGE_CONTEXT');
    }

    @IsTest static void digestDoesNotDependOnInputOrder() {
        List<CardstackOpportunityEditTypes.FieldChange> first = changes('Amount', 'set', '25.00');
        first.add(CardstackOpportunityEditTestData.change('CloseDate', 'set', '2026-12-15'));
        List<CardstackOpportunityEditTypes.FieldChange> second = changes('CloseDate', 'set', '2026-12-15');
        second.add(CardstackOpportunityEditTestData.change('Amount', 'set', '25'));
        List<CardstackOpportunityEditTypes.FieldChange> different = changes('Amount', 'set', '26');
        different.add(CardstackOpportunityEditTestData.change('CloseDate', 'set', '2026-12-15'));
        Test.startTest();
        CardstackOpportunityEditTypes.CanonicalPatch left = applyChanges(first);
        CardstackOpportunityEditTypes.CanonicalPatch right = applyChanges(second);
        CardstackOpportunityEditTypes.CanonicalPatch changed = applyChanges(different);
        Test.stopTest();
        Assert.isNotNull(left.digest, 'Canonical patch must have a digest');
        Assert.areEqual(left.digest, right.digest, 'Sorted typed equality must bind the same exact patch');
        Assert.isNotNull(changed.digest, 'Different literal values must also have a digest');
        Assert.areNotEqual(left.digest, changed.digest, 'Changing literal Amount from 25 to 26 must change the patch digest');
    }

    @IsTest static void canonicalizationDoesNotPerformDml() {
        Integer beforeDml = Limits.getDmlStatements();
        Test.startTest();
        CardstackOpportunityEditTypes.CanonicalPatch patch = canonicalize('Amount', 'set', '12500.25');
        Integer afterDml = Limits.getDmlStatements();
        Test.stopTest();
        Assert.areEqual(0, afterDml, 'Review domain must not attempt trial CRM DML');
        Assert.areEqual(0, beforeDml, 'Fixture must be entirely in memory');
        Assert.areEqual(1, patch.entries.size(), 'Read-only validation must still produce the reviewed patch');
    }

    private static CardstackOpportunityEditTypes.CanonicalPatch canonicalize(String field, String operation, String value) {
        return applyChanges(changes(field, operation, value));
    }
    private static CardstackOpportunityEditTypes.CanonicalPatch applyChanges(List<CardstackOpportunityEditTypes.FieldChange> input) {
        return CardstackOpportunityEditDomain.canonicalize(CardstackOpportunityEditTestData.current(),
            CardstackOpportunityEditTestData.stages(), CardstackOpportunityEditTestData.policy(), input);
    }
    private static List<CardstackOpportunityEditTypes.FieldChange> changes(String field, String operation, String value) {
        return new List<CardstackOpportunityEditTypes.FieldChange>{CardstackOpportunityEditTestData.change(field, operation, value)};
    }
    private static void reject(List<CardstackOpportunityEditTypes.FieldChange> input, String code) {
        rejectWithPolicy(input, CardstackOpportunityEditTestData.policy(), code);
    }
    private static void rejectWithPolicy(List<CardstackOpportunityEditTypes.FieldChange> input,
        CardstackOpportunityEditTypes.Policy policy, String code) {
        Test.startTest();
        try {
            CardstackOpportunityEditDomain.canonicalize(CardstackOpportunityEditTestData.current(),
                CardstackOpportunityEditTestData.stages(), policy, input);
            Assert.fail('Expected rejection: ' + code);
        } catch (CardstackOpportunityEditDomain.ValidationException error) {
            Assert.areEqual(code, error.getMessage(), 'Validation must return the bounded reason');
        }
        Test.stopTest();
    }
    private static void rejectContext(CardstackOpportunityEditTypes.RecordContext current,
        CardstackOpportunityEditTypes.StageContext stages, String code) {
        Test.startTest();
        try {
            CardstackOpportunityEditDomain.canonicalize(current, stages, CardstackOpportunityEditTestData.policy(),
                changes('Amount', 'set', '25'));
            Assert.fail('Expected rejection: ' + code);
        } catch (CardstackOpportunityEditDomain.ValidationException error) {
            Assert.areEqual(code, error.getMessage(), 'Unavailable context must be denied');
        }
        Test.stopTest();
    }
    private static void rejectRequiredResult(CardstackOpportunityEditTypes.RecordContext current,
        CardstackOpportunityEditTypes.Policy policy, List<CardstackOpportunityEditTypes.FieldChange> input) {
        Test.startTest();
        try {
            CardstackOpportunityEditDomain.canonicalize(current, CardstackOpportunityEditTestData.stages(), policy, input);
            Assert.fail('Expected rejection: FIELD_REQUIRED for omitted current null Amount');
        } catch (CardstackOpportunityEditDomain.ValidationException error) {
            Assert.areEqual('FIELD_REQUIRED', error.getMessage(), 'Required result must be checked even when Amount is omitted');
        }
        Test.stopTest();
    }
}
