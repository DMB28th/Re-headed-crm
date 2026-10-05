@IsTest
private class CardstackUpdateRecordActionTest {

    private static CardstackPreviewUpdateAction.PatchEntry patch(String field, String value) {
        CardstackPreviewUpdateAction.PatchEntry p =
            new CardstackPreviewUpdateAction.PatchEntry();
        p.fieldApiName = field;
        p.newValue = value;
        return p;
    }

    @IsTest
    static void updateWithValidTokenAppliesChanges() {
        Account a = new Account(Name = 'UpdRec Acme', Industry = 'Technology');
        insert a;

        // Mint token via preview.
        CardstackPreviewUpdateAction.PreviewUpdateRequest preq =
            new CardstackPreviewUpdateAction.PreviewUpdateRequest();
        preq.recordId = a.Id;
        preq.changes = new List<CardstackPreviewUpdateAction.PatchEntry>{
            patch('Industry', 'Healthcare')
        };
        String token = CardstackPreviewUpdateAction.preview(
            new List<CardstackPreviewUpdateAction.PreviewUpdateRequest>{ preq }
        )[0].confirmToken;

        CardstackUpdateRecordAction.UpdateRecordRequest req =
            new CardstackUpdateRecordAction.UpdateRecordRequest();
        req.recordId = a.Id;
        req.changes = new List<CardstackPreviewUpdateAction.PatchEntry>{
            patch('Industry', 'Healthcare')
        };
        req.confirmToken = token;

        List<CardstackUpdateRecordAction.UpdateRecordResponse> resps =
            CardstackUpdateRecordAction.updateRecord(
                new List<CardstackUpdateRecordAction.UpdateRecordRequest>{ req });

        CardstackUpdateRecordAction.UpdateRecordResponse res = resps[0];
        System.assertEquals('rep', res.confirmedBy);
        System.assertEquals(true, res.outcomes[0].success);

        Account after = [SELECT Industry FROM Account WHERE Id = :a.Id WITH USER_MODE];
        System.assertEquals('Healthcare', after.Industry);
    }

    @IsTest
    static void updateWithoutTokenIsModelInitiated() {
        Account a = new Account(Name = 'UpdRec Model', Industry = 'Technology');
        insert a;

        CardstackUpdateRecordAction.UpdateRecordRequest req =
            new CardstackUpdateRecordAction.UpdateRecordRequest();
        req.recordId = a.Id;
        req.changes = new List<CardstackPreviewUpdateAction.PatchEntry>{
            patch('Industry', 'Finance')
        };

        List<CardstackUpdateRecordAction.UpdateRecordResponse> resps =
            CardstackUpdateRecordAction.updateRecord(
                new List<CardstackUpdateRecordAction.UpdateRecordRequest>{ req });

        System.assertEquals('model', resps[0].confirmedBy);
        Account after = [SELECT Industry FROM Account WHERE Id = :a.Id WITH USER_MODE];
        System.assertEquals('Finance', after.Industry);
    }

    @IsTest
    static void badTokenAbortsBeforeWrite() {
        Account a = new Account(Name = 'UpdRec BadToken', Industry = 'Technology');
        insert a;

        CardstackUpdateRecordAction.UpdateRecordRequest req =
            new CardstackUpdateRecordAction.UpdateRecordRequest();
        req.recordId = a.Id;
        req.changes = new List<CardstackPreviewUpdateAction.PatchEntry>{
            patch('Industry', 'Healthcare')
        };
        req.confirmToken = 'forged-token';

        try {
            CardstackUpdateRecordAction.updateRecord(
                new List<CardstackUpdateRecordAction.UpdateRecordRequest>{ req });
            System.assert(false, 'expected exception for bad token');
        } catch (CardstackConfirmToken.CardstackException e) {
            System.assert(true, 'aborted: ' + e.getMessage());
        }

        Account after = [SELECT Industry FROM Account WHERE Id = :a.Id WITH USER_MODE];
        System.assertEquals('Technology', after.Industry, 'bad token → nothing written');
    }

    @IsTest
    static void invalidFieldReportedPerField() {
        Account a = new Account(Name = 'UpdRec Partial', Industry = 'Technology');
        insert a;

        CardstackUpdateRecordAction.UpdateRecordRequest req =
            new CardstackUpdateRecordAction.UpdateRecordRequest();
        req.recordId = a.Id;
        req.changes = new List<CardstackPreviewUpdateAction.PatchEntry>{
            patch('Industry', 'Healthcare'),
            patch('NoSuchField__c', 'x')
        };

        List<CardstackUpdateRecordAction.UpdateRecordResponse> resps =
            CardstackUpdateRecordAction.updateRecord(
                new List<CardstackUpdateRecordAction.UpdateRecordRequest>{ req });

        CardstackUpdateRecordAction.UpdateRecordResponse res = resps[0];
        System.assertEquals(true, res.outcomes[0].success, 'valid field applied');
        System.assertEquals(false, res.outcomes[1].success, 'invalid field reported');

        Account after = [SELECT Industry FROM Account WHERE Id = :a.Id WITH USER_MODE];
        System.assertEquals('Healthcare', after.Industry, 'valid field still written');
    }

    @IsTest
    static void dmlFailureReturnsStructuredErrorNotException() {
        Account a = new Account(Name = 'UpdRec DmlFail');
        insert a;

        // 300-char name exceeds 255 limit -> DML failure on write.
        CardstackUpdateRecordAction.UpdateRecordRequest req =
            new CardstackUpdateRecordAction.UpdateRecordRequest();
        req.recordId = a.Id;
        req.changes = new List<CardstackPreviewUpdateAction.PatchEntry>{
            patch('Name', 'x'.repeat(300))
        };

        // Must NOT throw — returns structured failure.
        List<CardstackUpdateRecordAction.UpdateRecordResponse> resps =
            CardstackUpdateRecordAction.updateRecord(
                new List<CardstackUpdateRecordAction.UpdateRecordRequest>{ req });

        CardstackUpdateRecordAction.UpdateRecordResponse res = resps[0];
        System.assertEquals(true, res.dmlFailed);
        System.assertEquals(false, res.showSuccess);
        System.assert(!res.dmlErrors.isEmpty());
        System.assertEquals('VALIDATION', res.dmlErrors[0].errorType);
        System.assert(res.dmlErrorSummary.contains('Couldn\'t save'),
            'summary: ' + res.dmlErrorSummary);
        System.assertEquals(false, res.outcomes[0].success,
            'failed field marked in outcomes');

        // Record unchanged.
        Account after = [SELECT Name FROM Account WHERE Id = :a.Id WITH USER_MODE];
        System.assertEquals('UpdRec DmlFail', after.Name);
    }

    @IsTest
    static void previewTrialPredictsDmlFailure() {
        Account a = new Account(Name = 'UpdRec Preview');
        insert a;

        CardstackPreviewUpdateAction.PreviewUpdateRequest preq =
            new CardstackPreviewUpdateAction.PreviewUpdateRequest();
        preq.recordId = a.Id;
        preq.changes = new List<CardstackPreviewUpdateAction.PatchEntry>{
            patch('Name', 'x'.repeat(300))
        };

        List<CardstackPreviewUpdateAction.PreviewUpdateResponse> resps =
            CardstackPreviewUpdateAction.preview(
                new List<CardstackPreviewUpdateAction.PreviewUpdateRequest>{ preq });

        CardstackPreviewUpdateAction.PreviewUpdateResponse res = resps[0];
        System.assertEquals(true, res.hasPredictedErrors);
        System.assert(!res.predictedErrors.isEmpty());
        System.assertEquals('VALIDATION', res.predictedErrors[0].errorType);
        System.assert(res.summary.contains('will fail'),
            'summary: ' + res.summary);
        // Token still minted — preview informs, doesn't block.
        System.assert(!String.isBlank(res.confirmToken));

        // Trial rolled back — record unchanged.
        Account after = [SELECT Name FROM Account WHERE Id = :a.Id WITH USER_MODE];
        System.assertEquals('UpdRec Preview', after.Name);
    }

    @IsTest
    static void previewTrialCleanWhenValid() {
        Account a = new Account(Name = 'UpdRec PreviewOk', Industry = 'Technology');
        insert a;

        CardstackPreviewUpdateAction.PreviewUpdateRequest preq =
            new CardstackPreviewUpdateAction.PreviewUpdateRequest();
        preq.recordId = a.Id;
        preq.changes = new List<CardstackPreviewUpdateAction.PatchEntry>{
            patch('Industry', 'Healthcare')
        };

        CardstackPreviewUpdateAction.PreviewUpdateResponse res =
            CardstackPreviewUpdateAction.preview(
                new List<CardstackPreviewUpdateAction.PreviewUpdateRequest>{ preq })[0];

        System.assertEquals(false, res.hasPredictedErrors);
        System.assert(res.predictedErrors.isEmpty());

        Account after = [SELECT Industry FROM Account WHERE Id = :a.Id WITH USER_MODE];
        System.assertEquals('Technology', after.Industry, 'trial rolled back');
    }
}
