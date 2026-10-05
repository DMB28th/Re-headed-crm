@IsTest
private class CardstackPreviewCompleteTaskActionTest {

    @IsTest
    static void previewMintsTokenForOpenTask() {
        Task t = new Task(Subject = 'Preview Me', Status = 'Not Started',
            ActivityDate = Date.today().addDays(1));
        insert t;

        CardstackPreviewCompleteTaskAction.PreviewCompleteTaskRequest req =
            new CardstackPreviewCompleteTaskAction.PreviewCompleteTaskRequest();
        req.taskId = t.Id;

        List<CardstackPreviewCompleteTaskAction.PreviewCompleteTaskResponse> resps =
            CardstackPreviewCompleteTaskAction.preview(
                new List<CardstackPreviewCompleteTaskAction.PreviewCompleteTaskRequest>{ req });

        CardstackPreviewCompleteTaskAction.PreviewCompleteTaskResponse res = resps[0];
        System.assertEquals(t.Id, res.taskId);
        System.assertEquals('Preview Me', res.subject);
        System.assertNotEquals(null, res.confirmToken, 'token minted');
        System.assertNotEquals(null, res.expiresAt);
        System.assert(res.summary.contains('nothing written yet'), 'summary: ' + res.summary);

        // Task must NOT be completed by preview.
        Task after = [SELECT Status FROM Task WHERE Id = :t.Id WITH USER_MODE];
        System.assertEquals('Not Started', after.Status, 'preview writes nothing');
    }

    @IsTest
    static void previewOfCompletedTaskThrows() {
        Task t = new Task(Subject = 'Already Done', Status = 'Completed');
        insert t;

        CardstackPreviewCompleteTaskAction.PreviewCompleteTaskRequest req =
            new CardstackPreviewCompleteTaskAction.PreviewCompleteTaskRequest();
        req.taskId = t.Id;

        try {
            CardstackPreviewCompleteTaskAction.preview(
                new List<CardstackPreviewCompleteTaskAction.PreviewCompleteTaskRequest>{ req });
            System.assert(false, 'expected exception');
        } catch (CardstackPreviewCompleteTaskAction.CardstackException e) {
            System.assert(e.getMessage().contains('already completed'), e.getMessage());
        }
    }

    @IsTest
    static void previewOfMissingTaskThrows() {
        CardstackPreviewCompleteTaskAction.PreviewCompleteTaskRequest req =
            new CardstackPreviewCompleteTaskAction.PreviewCompleteTaskRequest();
        req.taskId = '00T000000000000EAA';

        try {
            CardstackPreviewCompleteTaskAction.preview(
                new List<CardstackPreviewCompleteTaskAction.PreviewCompleteTaskRequest>{ req });
            System.assert(false, 'expected exception');
        } catch (CardstackPreviewCompleteTaskAction.CardstackException e) {
            System.assert(e.getMessage().contains('not found'), e.getMessage());
        }
    }

    @IsTest
    static void missingTaskIdThrows() {
        CardstackPreviewCompleteTaskAction.PreviewCompleteTaskRequest req =
            new CardstackPreviewCompleteTaskAction.PreviewCompleteTaskRequest();

        try {
            CardstackPreviewCompleteTaskAction.preview(
                new List<CardstackPreviewCompleteTaskAction.PreviewCompleteTaskRequest>{ req });
            System.assert(false, 'expected exception');
        } catch (CardstackPreviewCompleteTaskAction.CardstackException e) {
            System.assert(e.getMessage().contains('taskId is required'), e.getMessage());
        }
    }
}
