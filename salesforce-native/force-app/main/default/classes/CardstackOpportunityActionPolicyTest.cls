/** Behavioral RED: published fixed preset cannot widen Salesforce rights. */
@IsTest(SeeAllData=false)
private with sharing class CardstackOpportunityActionPolicyTest {
    @TestSetup static void permissions() {
        CardstackOpportunityEditTestData.grantCurrentActorPackageRead();
        CardstackRecordEditTestData.grantCurrentActorAdmin();
    }
    @IsTest static void fixedPresetAcceptsOrderedCurrentMappings() {
        String failure;
        Test.startTest();
        try { CardstackOpportunityActionPolicy.validate('Opportunity', action(), policy()); }
        catch (CardstackOpportunityActionPolicy.PolicyException error) { failure = error.getMessage(); }
        Test.stopTest();
        Assert.isNull(failure, 'Valid published Stage/CloseDate/Amount preset must be accepted');
    }
    @IsTest static void fixedPresetRejectsMappingsOrExtraFields() {
        CardstackRecordActionService.Definition definition = action();
        definition.mappings.add(mapping('Name', 'current'));
        rejects(definition, policy(), 'INVALID_PRESET');
    }
    @IsTest static void fixedPresetRejectsConstantSource() {
        CardstackRecordActionService.Definition definition = action();
        definition.mappings[0].source = 'constant';
        definition.mappings[0].value = 'Qualification';
        rejects(definition, policy(), 'INVALID_PRESET');
    }
    @IsTest static void fixedPresetRejectsWrongOrder() {
        CardstackRecordActionService.Definition definition = action();
        definition.mappings[0].fieldApi = 'Amount';
        definition.mappings[2].fieldApi = 'StageName';
        rejects(definition, policy(), 'INVALID_PRESET');
    }
    @IsTest static void fixedPresetRejectsUnusedMappingPayload() {
        CardstackRecordActionService.Definition definition = action();
        definition.mappings[0].sourceField = 'Name';
        rejects(definition, policy(), 'INVALID_PRESET');
    }
    @IsTest static void disabledPublishedPolicyCannotAuthorizePreset() {
        CardstackPolicyService.Policy published = policy();
        published.editEnabled = false;
        rejects(action(), published, 'EDIT_DISABLED');
    }
    @IsTest static void readOnlyFieldCannotAuthorizePreset() {
        CardstackPolicyService.Policy published = policy();
        published.fields.get('Amount').readOnly = true;
        rejects(action(), published, 'FIELD_NOT_EDITABLE');
    }
    private static void rejects(CardstackRecordActionService.Definition definition,
        CardstackPolicyService.Policy published, String code) {
        Test.startTest();
        try {
            CardstackOpportunityActionPolicy.validate('Opportunity', definition, published);
            Assert.fail('Invalid preset must fail closed');
        } catch (CardstackOpportunityActionPolicy.PolicyException error) {
            Assert.areEqual(code, error.getMessage(), 'Unrelated scaffold denial cannot satisfy policy behavior');
        }
        Test.stopTest();
    }
    private static CardstackRecordActionService.Definition action() {
        CardstackRecordActionService.Definition result = new CardstackRecordActionService.Definition();
        result.name = 'edit_opportunity'; result.label = 'Edit Opportunity';
        result.type = 'record-edit'; result.enabled = true;
        result.mappings = new List<CardstackRecordActionService.Mapping>{
            mapping('StageName', 'current'), mapping('CloseDate', 'current'), mapping('Amount', 'current')};
        return result;
    }
    private static CardstackRecordActionService.Mapping mapping(String field, String source) {
        CardstackRecordActionService.Mapping result = new CardstackRecordActionService.Mapping();
        result.fieldApi = field; result.source = source; return result;
    }
    private static CardstackPolicyService.Policy policy() {
        CardstackPolicyService.Policy result = new CardstackPolicyService.Policy();
        result.objectApiName = 'Opportunity'; result.editEnabled = true; result.revision = 'published-fixture';
        for (String field : new List<String>{'StageName', 'CloseDate', 'Amount'}) {
            CardstackPolicyService.FieldPolicy entry = new CardstackPolicyService.FieldPolicy();
            entry.apiName = field; entry.readOnly = false;
            entry.dataType = String.valueOf(Opportunity.SObjectType.getDescribe().fields.getMap().get(field).getDescribe().getType());
            entry.required = field != 'Amount'; result.fields.put(field, entry);
        }
        return result;
    }
    @IsTest static void shouldStagePublishAndResolveGenericOpportunityThroughNormalConfigPath() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Opportunity record=CardstackOpportunityEditTestData.insertOpportunity();
            String raw=CardstackRecordEditTestData.genericOpportunityLayout();
            Test.startTest();
            Id draft=CardstackConfigService.saveDraft('layout:Opportunity:default',raw);
            Assert.isNull(CardstackConfigService.getConfig('layout:Opportunity:default'),'Draft remains unavailable to runtime.');
            CardstackConfigService.publishDraft(draft);
            CardstackRecordScreenCapability.Definition resolved=CardstackRecordScreenCapability.resolveDefinition(record.Id,'generic_forecast');
            Test.stopTest();
            Assert.areEqual(new List<String>{'Name','CloseDate','Amount'},resolved.fields,'Published generic mapping order remains metadata-driven.');
            Assert.areEqual(CardstackRecordScreenCapability.CURRENT_VERSION,resolved.capabilityVersion,'Normal publication reaches the shared engine.');
        }
    }
    @IsTest static void shouldRejectMalformedStageCandidateAtNormalStaging() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            String raw=CardstackRecordEditTestData.genericOpportunityLayout().replace('"fieldApi":"CloseDate"','"fieldApi":"StageName"');
            Test.startTest();
            try { CardstackConfigService.saveDraft('layout:Opportunity:default',raw); Assert.fail('Stage presence requires the exact fixed preset.'); }
            catch(CardstackOpportunityActionPolicy.PolicyException error) { Assert.areEqual('INVALID_PRESET',error.getMessage(),'Malformed Stage cannot route to generic authoring.'); }
            Test.stopTest();
            Assert.areEqual(0,[SELECT count() FROM Cardstack_Config_Draft__c WITH SYSTEM_MODE],'Malformed Stage is rejected before insertion.');
        }
    }
    @IsTest static void shouldRecheckMalformedStageCandidateAtNormalPublication() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            String raw=CardstackRecordEditTestData.genericOpportunityLayout();
            Id draftId=CardstackConfigService.saveDraft('layout:Opportunity:default',raw);
            update as system new Cardstack_Config_Draft__c(Id=draftId,Draft_Value__c=raw.replace('"fieldApi":"CloseDate"','"fieldApi":"StageName"'));
            Test.startTest();
            try { CardstackConfigService.publishDraft(draftId); Assert.fail('Publication must recheck actual persisted Stage shape.'); }
            catch(CardstackOpportunityActionPolicy.PolicyException error) { Assert.areEqual('INVALID_PRESET',error.getMessage(),'Malformed Stage publication remains strict.'); }
            Test.stopTest();
            Assert.isNull(CardstackConfigService.getConfig('layout:Opportunity:default'),'Malformed Stage is never published.');
        }
    }
}
