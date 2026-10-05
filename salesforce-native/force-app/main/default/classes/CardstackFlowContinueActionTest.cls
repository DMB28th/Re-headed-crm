@IsTest
private class CardstackFlowContinueActionTest {

    @IsTest
    static void missingSessionThrows() {
        Account a = new Account(Name = 'FlowCont Acme');
        insert a;

        CardstackFlowContinueAction.FlowContinueRequest req =
            new CardstackFlowContinueAction.FlowContinueRequest();
        req.recordId = a.Id;
        req.flowApiName = 'Some_Flow';

        try {
            CardstackFlowContinueAction.continueFlow(
                new List<CardstackFlowContinueAction.FlowContinueRequest>{ req });
            System.assert(false, 'expected exception for missing session');
        } catch (CardstackFlowContinueAction.CardstackException e) {
            System.assert(e.getMessage().contains('actionSessionId is required'), e.getMessage());
        }
    }

    @IsTest
    static void forgedSessionRejected() {
        Account a = new Account(Name = 'FlowCont Forged');
        insert a;

        CardstackFlowContinueAction.FlowContinueRequest req =
            new CardstackFlowContinueAction.FlowContinueRequest();
        req.recordId = a.Id;
        req.flowApiName = 'Some_Flow';
        req.actionSessionId = 'forged-session-token';

        try {
            CardstackFlowContinueAction.continueFlow(
                new List<CardstackFlowContinueAction.FlowContinueRequest>{ req });
            System.assert(false, 'expected exception for forged session');
        } catch (Exception e) {
            System.assert(true, 'rejected: ' + e.getMessage());
        }
    }

    @IsTest
    static void missingRecordIdThrows() {
        CardstackFlowContinueAction.FlowContinueRequest req =
            new CardstackFlowContinueAction.FlowContinueRequest();
        req.flowApiName = 'Some_Flow';
        req.actionSessionId = 'dummy';

        try {
            CardstackFlowContinueAction.continueFlow(
                new List<CardstackFlowContinueAction.FlowContinueRequest>{ req });
            System.assert(false, 'expected exception');
        } catch (CardstackFlowContinueAction.CardstackException e) {
            System.assert(e.getMessage().contains('recordId is required'), e.getMessage());
        }
    }

    @IsTest
    static void guidedCardFieldsPresent() {
        CardstackFlowContinueAction.FlowContinueResponse res =
            new CardstackFlowContinueAction.FlowContinueResponse();
        res.status = 'In Progress';
        res.statusVariant = 'info';
        res.currentStep = 2;
        res.stepText = 'Step 2';
        res.nextPrompt = 'Reply with the next values.';
        res.isQuickAction = false;
        res.hasAnswers = true;
        res.actionSessionId = 'test-session';
        res.suggestedReplies = new List<CardstackFlowStartAction.SuggestedReply>();
        res.answers = new List<CardstackFlowContinueAction.AnswerRow>();

        CardstackFlowContinueAction.AnswerRow ar =
            new CardstackFlowContinueAction.AnswerRow();
        ar.inputName = 'Decision';
        ar.value = 'Approve';
        res.answers.add(ar);

        System.assertEquals('In Progress', res.status);
        System.assertEquals(2, res.currentStep);
        System.assertEquals(true, res.hasAnswers);
        System.assertEquals(1, res.answers.size());
        System.assertEquals('Decision', res.answers[0].inputName);
    }
}
