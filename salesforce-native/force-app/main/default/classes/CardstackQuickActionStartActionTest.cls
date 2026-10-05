@IsTest
private class CardstackQuickActionStartActionTest {

    @IsTest
    static void unknownActionThrowsWithAvailableList() {
        Account a = new Account(Name = 'QA Acme');
        insert a;

        CardstackQuickActionStartAction.QuickActionStartRequest req =
            new CardstackQuickActionStartAction.QuickActionStartRequest();
        req.recordId = a.Id;
        req.actionApiName = 'NoSuchQuickAction';

        try {
            CardstackQuickActionStartAction.start(
                new List<CardstackQuickActionStartAction.QuickActionStartRequest>{ req });
            System.assert(false, 'expected exception for unknown action');
        } catch (CardstackQuickActionStartAction.CardstackException e) {
            System.assert(e.getMessage().contains('not available on Account'), e.getMessage());
        }
    }

    @IsTest
    static void missingRecordIdThrows() {
        CardstackQuickActionStartAction.QuickActionStartRequest req =
            new CardstackQuickActionStartAction.QuickActionStartRequest();
        req.actionApiName = 'NewTask';

        try {
            CardstackQuickActionStartAction.start(
                new List<CardstackQuickActionStartAction.QuickActionStartRequest>{ req });
            System.assert(false, 'expected exception');
        } catch (CardstackQuickActionStartAction.CardstackException e) {
            System.assert(e.getMessage().contains('recordId is required'), e.getMessage());
        }
    }

    @IsTest
    static void missingActionNameThrows() {
        Account a = new Account(Name = 'QA Missing Action');
        insert a;

        CardstackQuickActionStartAction.QuickActionStartRequest req =
            new CardstackQuickActionStartAction.QuickActionStartRequest();
        req.recordId = a.Id;

        try {
            CardstackQuickActionStartAction.start(
                new List<CardstackQuickActionStartAction.QuickActionStartRequest>{ req });
            System.assert(false, 'expected exception');
        } catch (CardstackQuickActionStartAction.CardstackException e) {
            System.assert(e.getMessage().contains('actionApiName is required'), e.getMessage());
        }
    }

    @IsTest
    static void unresolvableIdThrows() {
        CardstackQuickActionStartAction.QuickActionStartRequest req =
            new CardstackQuickActionStartAction.QuickActionStartRequest();
        req.recordId = '000000000000000EAA'; // '000' prefix matches no object
        req.actionApiName = 'NewTask';

        try {
            CardstackQuickActionStartAction.start(
                new List<CardstackQuickActionStartAction.QuickActionStartRequest>{ req });
            System.assert(false, 'expected exception');
        } catch (CardstackQuickActionStartAction.CardstackException e) {
            System.assert(e.getMessage().contains('Cannot resolve object'), e.getMessage());
        }
    }

    @IsTest
    static void guidedCardFieldsPresent() {
        CardstackQuickActionStartAction.QuickActionStartResponse res =
            new CardstackQuickActionStartAction.QuickActionStartResponse();
        res.status = 'Waiting on you';
        res.statusVariant = 'warning';
        res.currentStep = 1;
        res.totalSteps = 1;
        res.stepText = 'Step 1 of 1';
        res.nextPrompt = 'Reply with the field values.';
        res.isQuickAction = true;
        res.hasAnswers = false;
        res.actionSessionId = 'test-session';
        res.suggestedReplies = new List<CardstackFlowStartAction.SuggestedReply>();

        System.assertEquals('Waiting on you', res.status);
        System.assertEquals(true, res.isQuickAction);
        System.assertEquals('Step 1 of 1', res.stepText);
        System.assertEquals(1, res.totalSteps);
    }
}
