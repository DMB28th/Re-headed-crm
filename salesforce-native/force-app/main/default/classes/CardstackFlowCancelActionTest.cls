@IsTest
private class CardstackFlowCancelActionTest {

    @IsTest
    static void cancelWithValidSessionSucceeds() {
        Account a = new Account(Name = 'FlowCancel Acme');
        insert a;
        String flowApiName = 'Test_Flow_Cancel';
        // Mint the same session shape that Flow Start produces.
        String session = CardstackConfirmToken.mint('flow:' + flowApiName + ':' + a.Id).token;

        CardstackFlowCancelAction.FlowCancelRequest req =
            new CardstackFlowCancelAction.FlowCancelRequest();
        req.flowApiName = flowApiName;
        req.actionSessionId = session;
        req.recordId = a.Id;

        List<CardstackFlowCancelAction.FlowCancelResponse> resps =
            CardstackFlowCancelAction.cancelFlow(
                new List<CardstackFlowCancelAction.FlowCancelRequest>{ req });

        CardstackFlowCancelAction.FlowCancelResponse res = resps[0];
        System.assertEquals(true, res.cancelled);
        System.assertEquals(flowApiName, res.flowApiName);
        System.assert(res.summary.contains('cancelled'), 'summary: ' + res.summary);
    }

    @IsTest
    static void forgedSessionRejected() {
        CardstackFlowCancelAction.FlowCancelRequest req =
            new CardstackFlowCancelAction.FlowCancelRequest();
        req.flowApiName = 'Test_Flow_Cancel';
        req.actionSessionId = 'forged-session';

        try {
            CardstackFlowCancelAction.cancelFlow(
                new List<CardstackFlowCancelAction.FlowCancelRequest>{ req });
            System.assert(false, 'expected exception for forged session');
        } catch (CardstackFlowCancelAction.CardstackException e) {
            System.assert(e.getMessage().contains('Invalid session'), e.getMessage());
        }
    }

    @IsTest
    static void missingSessionThrows() {
        CardstackFlowCancelAction.FlowCancelRequest req =
            new CardstackFlowCancelAction.FlowCancelRequest();
        req.flowApiName = 'Test_Flow_Cancel';

        try {
            CardstackFlowCancelAction.cancelFlow(
                new List<CardstackFlowCancelAction.FlowCancelRequest>{ req });
            System.assert(false, 'expected exception');
        } catch (CardstackFlowCancelAction.CardstackException e) {
            System.assert(e.getMessage().contains('actionSessionId is required'), e.getMessage());
        }
    }

    @IsTest
    static void missingFlowNameThrows() {
        CardstackFlowCancelAction.FlowCancelRequest req =
            new CardstackFlowCancelAction.FlowCancelRequest();
        req.actionSessionId = 'dummy';

        try {
            CardstackFlowCancelAction.cancelFlow(
                new List<CardstackFlowCancelAction.FlowCancelRequest>{ req });
            System.assert(false, 'expected exception');
        } catch (CardstackFlowCancelAction.CardstackException e) {
            System.assert(e.getMessage().contains('flowApiName is required'), e.getMessage());
        }
    }
}
