@IsTest
private class CardstackCompleteTaskActionTest {

    @IsTest
    static void completeWithValidTokenMarksRepConfirmed() {
        Task t = new Task(Subject = 'Complete Me', Status = 'Not Started');
        insert t;

        // Mint via preview, then complete with the token.
        CardstackPreviewCompleteTaskAction.PreviewCompleteTaskRequest preq =
            new CardstackPreviewCompleteTaskAction.PreviewCompleteTaskRequest();
        preq.taskId = t.Id;
        String token = CardstackPreviewCompleteTaskAction.preview(
            new List<CardstackPreviewCompleteTaskAction.PreviewCompleteTaskRequest>{ preq }
        )[0].confirmToken;

        CardstackCompleteTaskAction.CompleteTaskRequest req =
            new CardstackCompleteTaskAction.CompleteTaskRequest();
        req.taskId = t.Id;
        req.confirmToken = token;

        List<CardstackCompleteTaskAction.CompleteTaskResponse> resps =
            CardstackCompleteTaskAction.completeTask(
                new List<CardstackCompleteTaskAction.CompleteTaskRequest>{ req });

        CardstackCompleteTaskAction.CompleteTaskResponse res = resps[0];
        System.assertEquals('Completed', res.status);
        System.assertEquals('rep', res.confirmedBy, 'token → rep-confirmed');
        System.assert(res.summary.contains('rep-confirmed'), 'summary: ' + res.summary);

        Task after = [SELECT Status FROM Task WHERE Id = :t.Id WITH USER_MODE];
        System.assertEquals('Completed', after.Status);
    }

    @IsTest
    static void completeWithoutTokenMarksModelInitiated() {
        Task t = new Task(Subject = 'Complete Model', Status = 'Not Started');
        insert t;

        CardstackCompleteTaskAction.CompleteTaskRequest req =
            new CardstackCompleteTaskAction.CompleteTaskRequest();
        req.taskId = t.Id;

        List<CardstackCompleteTaskAction.CompleteTaskResponse> resps =
            CardstackCompleteTaskAction.completeTask(
                new List<CardstackCompleteTaskAction.CompleteTaskRequest>{ req });

        System.assertEquals('model', resps[0].confirmedBy);
        Task after = [SELECT Status FROM Task WHERE Id = :t.Id WITH USER_MODE];
        System.assertEquals('Completed', after.Status);
    }

    @IsTest
    static void badTokenAborts() {
        Task t = new Task(Subject = 'Complete Bad Token', Status = 'Not Started');
        insert t;

        CardstackCompleteTaskAction.CompleteTaskRequest req =
            new CardstackCompleteTaskAction.CompleteTaskRequest();
        req.taskId = t.Id;
        req.confirmToken = 'forged-token';

        try {
            CardstackCompleteTaskAction.completeTask(
                new List<CardstackCompleteTaskAction.CompleteTaskRequest>{ req });
            System.assert(false, 'expected exception for bad token');
        } catch (CardstackConfirmToken.CardstackException e) {
            System.assert(true, 'aborted: ' + e.getMessage());
        }

        Task after = [SELECT Status FROM Task WHERE Id = :t.Id WITH USER_MODE];
        System.assertEquals('Not Started', after.Status, 'bad token → nothing written');
    }

    @IsTest
    static void doubleCompleteThrows() {
        Task t = new Task(Subject = 'Complete Twice', Status = 'Completed');
        insert t;

        CardstackCompleteTaskAction.CompleteTaskRequest req =
            new CardstackCompleteTaskAction.CompleteTaskRequest();
        req.taskId = t.Id;

        try {
            CardstackCompleteTaskAction.completeTask(
                new List<CardstackCompleteTaskAction.CompleteTaskRequest>{ req });
            System.assert(false, 'expected exception');
        } catch (CardstackCompleteTaskAction.CardstackException e) {
            System.assert(e.getMessage().contains('already completed'), e.getMessage());
        }
    }

    @IsTest
    static void dmlFailureReturnsStructuredErrorNotException() {
        Task t = new Task(Subject = 'Complete DmlFail', Status = 'Not Started');
        insert t;
        t.Status = 'Completed';

        CardstackCompleteTaskAction.CompleteTaskRequest req =
            new CardstackCompleteTaskAction.CompleteTaskRequest();
        req.taskId = t.Id;

        // Real DmlException (synthetic ones throw uncatchable UnexpectedException
        // on accessor calls). Trigger via overlong Account name.
        DmlException realDe = null;
        try {
            insert new Account(Name = 'x'.repeat(300));
        } catch (DmlException de) {
            realDe = de;
        }
        System.assertNotEquals(null, realDe, 'expected real DML failure');

        CardstackCompleteTaskAction.CompleteTaskResponse res =
            CardstackCompleteTaskAction.dmlFailureResponse(req, realDe, t, 'Not Started');

        System.assertEquals(true, res.dmlFailed);
        System.assertEquals(false, res.showSuccess);
        System.assertEquals('Not Started', res.status, 'status rolled back in response');
        System.assert(!res.dmlErrors.isEmpty());
        System.assert(res.summary.contains('Couldn\'t complete'),
            'summary: ' + res.summary);

        // Task untouched in the database.
        Task after = [SELECT Status FROM Task WHERE Id = :t.Id WITH USER_MODE];
        System.assertEquals('Not Started', after.Status);
    }

    @IsTest
    static void successResponseHasDmlFlags() {
        Task t = new Task(Subject = 'Complete Flags', Status = 'Not Started');
        insert t;

        CardstackCompleteTaskAction.CompleteTaskRequest req =
            new CardstackCompleteTaskAction.CompleteTaskRequest();
        req.taskId = t.Id;

        CardstackCompleteTaskAction.CompleteTaskResponse res =
            CardstackCompleteTaskAction.completeTask(
                new List<CardstackCompleteTaskAction.CompleteTaskRequest>{ req })[0];

        System.assertEquals(false, res.dmlFailed);
        System.assertEquals(true, res.showSuccess);
    }
}
