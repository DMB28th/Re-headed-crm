@IsTest
private class CardstackFlowStartActionTest {

    @IsTest
    static void unknownFlowThrows() {
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

    @IsTest
    static void missingRecordIdThrows() {
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

    @IsTest
    static void missingFlowApiNameThrows() {
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

    @IsTest
    static void guidedCardFieldsPresent() {
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
