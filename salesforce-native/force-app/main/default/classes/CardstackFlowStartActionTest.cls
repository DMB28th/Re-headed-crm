@IsTest
private class CardstackFlowStartActionTest {
    @TestSetup static void grantConfigPermissions() {
        PermissionSet ps=[SELECT Id FROM PermissionSet WHERE Name='Cardstack_Admin' LIMIT 1];
        if ([SELECT count() FROM PermissionSetAssignment WHERE AssigneeId=:UserInfo.getUserId() AND PermissionSetId=:ps.Id]==0) insert new PermissionSetAssignment(AssigneeId=UserInfo.getUserId(),PermissionSetId=ps.Id);
    }


    @IsTest
    static void unknownFlowThrows() {
        System.runAs(new User(Id=UserInfo.getUserId())) {

        Account a = new Account(Name = 'Flow Acme');
        insert a;

        CardstackFlowStartAction.FlowStartRequest req =
            new CardstackFlowStartAction.FlowStartRequest();
        req.recordId = a.Id;
        req.flowApiName = 'No_Such_Flow_Xyz';

        try {
            CardstackFlowStartAction.startFlow(
                new List<CardstackFlowStartAction.FlowStartRequest>{ req });
            System.assert(false, 'expected exception for unknown flow');
        } catch (CardstackFlowStartAction.CardstackException e) {
            System.assert(e.getMessage().contains('Flow not found'), e.getMessage());
        }

        }
}

    @IsTest
    static void missingRecordIdThrows() {
        System.runAs(new User(Id=UserInfo.getUserId())) {

        CardstackFlowStartAction.FlowStartRequest req =
            new CardstackFlowStartAction.FlowStartRequest();
        req.flowApiName = 'Some_Flow';

        try {
            CardstackFlowStartAction.startFlow(
                new List<CardstackFlowStartAction.FlowStartRequest>{ req });
            System.assert(false, 'expected exception');
        } catch (CardstackFlowStartAction.CardstackException e) {
            System.assert(e.getMessage().contains('recordId is required'), e.getMessage());
        }

        }
}

    @IsTest
    static void missingFlowApiNameThrows() {
        System.runAs(new User(Id=UserInfo.getUserId())) {

        Account a = new Account(Name = 'Flow Missing Name');
        insert a;

        CardstackFlowStartAction.FlowStartRequest req =
            new CardstackFlowStartAction.FlowStartRequest();
        req.recordId = a.Id;

        try {
            CardstackFlowStartAction.startFlow(
                new List<CardstackFlowStartAction.FlowStartRequest>{ req });
            System.assert(false, 'expected exception');
        } catch (CardstackFlowStartAction.CardstackException e) {
            System.assert(e.getMessage().contains('flowApiName is required'), e.getMessage());
        }

        }
}

    @IsTest
    static void guidedCardFieldsPresent() {
        System.runAs(new User(Id=UserInfo.getUserId())) {

        // Verify the guided conversational card fields exist on the response.
        CardstackFlowStartAction.FlowStartResponse res =
            new CardstackFlowStartAction.FlowStartResponse();
        res.status = 'Waiting on you';
        res.statusVariant = 'warning';
        res.currentStep = 1;
        res.totalSteps = null;
        res.stepLabel = 'Started';
        res.stepText = 'Step 1';
        res.nextPrompt = 'Reply in chat with the values.';
        res.isQuickAction = false;
        res.hasAnswers = false;
        res.actionSessionId = 'test-session';
        res.suggestedReplies = new List<CardstackFlowStartAction.SuggestedReply>();

        System.assertEquals('Waiting on you', res.status);
        System.assertEquals('warning', res.statusVariant);
        System.assertEquals(1, res.currentStep);
        System.assertEquals(null, res.totalSteps);
        System.assertEquals('Step 1', res.stepText);
        System.assertEquals(false, res.isQuickAction);
        System.assertEquals(false, res.hasAnswers);
        System.assertNotEquals(null, res.suggestedReplies);

        }
}
    @IsTest
    static void publishedLaunchLabelOverridesDefinitionAndDraftDoesNot() {
        System.runAs(new User(Id=UserInfo.getUserId())) {

        Cardstack_Config__c cfg = new Cardstack_Config__c(Name = 'flows', Is_Active__c = true,
            Value__c = '[{"apiName":"Review","label":"Approval review"}]');
        insert cfg;
        CardstackConfigService.saveDraft('flows', '[{"apiName":"Review","label":"Unpublished name"}]');
        System.assertEquals('Approval review', CardstackFlowStartAction.launchLabel('Review', 'Salesforce name'));
        System.assertEquals('Other flow', CardstackFlowStartAction.launchLabel('Other', 'Other flow'));

        }
}
    @IsTest
    static void invalidLaunchConfigurationFallsBackToSalesforceName() {
        System.runAs(new User(Id=UserInfo.getUserId())) {

        Cardstack_Config__c cfg = new Cardstack_Config__c(Name = 'flows', Is_Active__c = true, Value__c = '{bad');
        insert cfg;
        System.assertEquals('Salesforce name', CardstackFlowStartAction.launchLabel('Review', 'Salesforce name'));
        cfg.Value__c = '[{"flowApiName":"Review","label":"Legacy card"}]'; update cfg;
        System.assertEquals('Legacy card', CardstackFlowStartAction.launchLabel('Review', 'Salesforce name'));

        }
}
}
