@IsTest
private class CardstackCompleteTaskActionTest {
    @TestSetup static void publishedTaskPolicy() {
        PermissionSet ps=[SELECT Id FROM PermissionSet WHERE Name='Cardstack_Admin' LIMIT 1];
        if ([SELECT count() FROM PermissionSetAssignment WHERE AssigneeId=:UserInfo.getUserId() AND PermissionSetId=:ps.Id]==0) insert new PermissionSetAssignment(AssigneeId=UserInfo.getUserId(),PermissionSetId=ps.Id);
        System.runAs(new User(Id=UserInfo.getUserId())) {
            insert new Cardstack_Config__c(Name='layout:Task:default',Is_Active__c=true,Value__c='{"permissions":{"writeEnabled":true},"fields":[{"api":"Status","editable":true}]}');
        }
    }


    @IsTest
    static void completeWithValidTokenMarksRepConfirmed() {
        System.runAs(new User(Id=UserInfo.getUserId())) {

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
}

    @IsTest static void completeWithoutTokenIsDenied() {
        System.runAs(new User(Id=UserInfo.getUserId())) {

        Task t=new Task(Subject='Unconfirmed',Status='Not Started'); insert t;
        CardstackCompleteTaskAction.CompleteTaskRequest req=new CardstackCompleteTaskAction.CompleteTaskRequest(); req.taskId=t.Id;
        Boolean rejected=false;
        try { CardstackCompleteTaskAction.completeTask(new List<CardstackCompleteTaskAction.CompleteTaskRequest>{req}); }
        catch (CardstackConfirmToken.CardstackException e) {rejected=true;}
        System.assert(rejected);
        System.assertEquals('Not Started',[SELECT Status FROM Task WHERE Id=:t.Id].Status);

        }
}

    @IsTest
    static void badTokenAborts() {
        System.runAs(new User(Id=UserInfo.getUserId())) {

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
}

    @IsTest
    static void doubleCompleteThrows() {
        System.runAs(new User(Id=UserInfo.getUserId())) {

        Task t = new Task(Subject = 'Complete Twice', Status = 'Completed');
        insert t;

        CardstackCompleteTaskAction.CompleteTaskRequest req =
            new CardstackCompleteTaskAction.CompleteTaskRequest();
        req.taskId = t.Id;
        req.confirmToken=CardstackConfirmToken.mint('complete:'+t.Id+':'+CardstackPolicyService.resolve('Task').revision).token;

        try {
            CardstackCompleteTaskAction.completeTask(
                new List<CardstackCompleteTaskAction.CompleteTaskRequest>{ req });
            System.assert(false, 'expected exception');
        } catch (CardstackCompleteTaskAction.CardstackException e) {
            System.assert(e.getMessage().contains('already completed'), e.getMessage());
        }

        }
}

    @IsTest
    static void dmlFailureReturnsStructuredErrorNotException() {
        System.runAs(new User(Id=UserInfo.getUserId())) {

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
}

    @IsTest
    static void successResponseHasDmlFlags() {
        System.runAs(new User(Id=UserInfo.getUserId())) {

        Task t = new Task(Subject = 'Complete Flags', Status = 'Not Started');
        insert t;

        CardstackCompleteTaskAction.CompleteTaskRequest req =
            new CardstackCompleteTaskAction.CompleteTaskRequest();
        req.taskId = t.Id;
        CardstackPreviewCompleteTaskAction.PreviewCompleteTaskRequest preq=new CardstackPreviewCompleteTaskAction.PreviewCompleteTaskRequest(); preq.taskId=t.Id;
        req.confirmToken=CardstackPreviewCompleteTaskAction.preview(new List<CardstackPreviewCompleteTaskAction.PreviewCompleteTaskRequest>{preq})[0].confirmToken;


        CardstackCompleteTaskAction.CompleteTaskResponse res =
            CardstackCompleteTaskAction.completeTask(
                new List<CardstackCompleteTaskAction.CompleteTaskRequest>{ req })[0];

        System.assertEquals(false, res.dmlFailed);
        System.assertEquals(true, res.showSuccess);

        }
}
}
