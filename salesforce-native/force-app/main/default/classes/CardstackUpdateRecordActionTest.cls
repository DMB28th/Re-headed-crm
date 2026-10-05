@IsTest
private class CardstackUpdateRecordActionTest {
    @TestSetup static void publishedWritePolicy() {
        PermissionSet ps=[SELECT Id FROM PermissionSet WHERE Name='Cardstack_Admin' LIMIT 1];
        if ([SELECT count() FROM PermissionSetAssignment WHERE AssigneeId=:UserInfo.getUserId() AND PermissionSetId=:ps.Id]==0) insert new PermissionSetAssignment(AssigneeId=UserInfo.getUserId(),PermissionSetId=ps.Id);
        System.runAs(new User(Id=UserInfo.getUserId())) {
            insert new Cardstack_Config__c(Name='layout:Account:default',Is_Active__c=true,
                Value__c='{"permissions":{"writeEnabled":true},"fields":[{"api":"Name","editable":true},{"api":"Industry","editable":true},{"api":"Description","editable":true},{"api":"NumberOfEmployees","editable":true}]}');
        }
    }


    private static CardstackPreviewUpdateAction.PatchEntry patch(String field, String value) {
        CardstackPreviewUpdateAction.PatchEntry p =
            new CardstackPreviewUpdateAction.PatchEntry();
        p.fieldApiName = field;
        p.newValue = value;
        return p;
    }

    @IsTest
    static void updateWithValidTokenAppliesChanges() {
        System.runAs(new User(Id=UserInfo.getUserId())) {

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
        Integer audits=[SELECT count() FROM Cardstack_Audit_Log__c WHERE Record_Id__c=:a.Id];
        CardstackUpdateRecordAction.UpdateRecordResponse replay=CardstackUpdateRecordAction.updateRecord(new List<CardstackUpdateRecordAction.UpdateRecordRequest>{req})[0];
        System.assertEquals(res.summary,replay.summary);
        System.assertEquals(audits,[SELECT count() FROM Cardstack_Audit_Log__c WHERE Record_Id__c=:a.Id]);

        }
}

    @IsTest static void missingConfirmationCannotWrite() {
        System.runAs(new User(Id=UserInfo.getUserId())) {

        Account a=new Account(Name='No confirmation',Industry='Technology'); insert a;
        CardstackUpdateRecordAction.UpdateRecordRequest req=new CardstackUpdateRecordAction.UpdateRecordRequest();
        req.recordId=a.Id; req.changes=new List<CardstackPreviewUpdateAction.PatchEntry>{patch('Industry','Finance')};
        Boolean rejected=false;
        try { CardstackUpdateRecordAction.updateRecord(new List<CardstackUpdateRecordAction.UpdateRecordRequest>{req}); }
        catch(Exception e) { rejected=true; }
        System.assert(rejected,'No confirmation must reject');
        System.assertEquals('Technology',[SELECT Industry FROM Account WHERE Id=:a.Id].Industry);

        }
}
    @IsTest static void changedValueCannotReuseReview() {
        System.runAs(new User(Id=UserInfo.getUserId())) {

        Account a=new Account(Name='Exact review',Industry='Technology'); insert a;
        CardstackPreviewUpdateAction.PreviewUpdateRequest preq=new CardstackPreviewUpdateAction.PreviewUpdateRequest();
        preq.recordId=a.Id; preq.changes=new List<CardstackPreviewUpdateAction.PatchEntry>{patch('Industry','Healthcare')};
        String token=CardstackPreviewUpdateAction.preview(new List<CardstackPreviewUpdateAction.PreviewUpdateRequest>{preq})[0].confirmToken;
        CardstackUpdateRecordAction.UpdateRecordRequest req=new CardstackUpdateRecordAction.UpdateRecordRequest();
        req.recordId=a.Id; req.changes=new List<CardstackPreviewUpdateAction.PatchEntry>{patch('Industry','Finance')}; req.confirmToken=token;
        Boolean rejected=false;
        try { CardstackUpdateRecordAction.updateRecord(new List<CardstackUpdateRecordAction.UpdateRecordRequest>{req}); }
        catch(Exception e) { rejected=true; }
        System.assert(rejected,'Changed values need a new preview');
        System.assertEquals('Technology',[SELECT Industry FROM Account WHERE Id=:a.Id].Industry);

        }
}

    @IsTest
    static void badTokenAbortsBeforeWrite() {
        System.runAs(new User(Id=UserInfo.getUserId())) {

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
}

    @IsTest static void unconfiguredFieldCannotWrite() {
        System.runAs(new User(Id=UserInfo.getUserId())) {

        Account a=new Account(Name='Denied field'); insert a;
        CardstackPreviewUpdateAction.PreviewUpdateRequest req=new CardstackPreviewUpdateAction.PreviewUpdateRequest();
        req.recordId=a.Id; req.changes=new List<CardstackPreviewUpdateAction.PatchEntry>{patch('Phone','555')};
        Boolean rejected=false;
        try { CardstackPreviewUpdateAction.preview(new List<CardstackPreviewUpdateAction.PreviewUpdateRequest>{req}); }
        catch (CardstackPolicyService.PolicyException e) { rejected=true; }
        System.assert(rejected);

        }
}

    @IsTest
    static void dmlFailureReturnsStructuredErrorNotException() {
        System.runAs(new User(Id=UserInfo.getUserId())) {

        Account a = new Account(Name = 'UpdRec DmlFail');
        insert a;

        // 300-char name exceeds 255 limit -> DML failure on write.
        CardstackUpdateRecordAction.UpdateRecordRequest req =
            new CardstackUpdateRecordAction.UpdateRecordRequest();
        req.recordId = a.Id;
        req.changes = new List<CardstackPreviewUpdateAction.PatchEntry>{
            patch('Name', 'x'.repeat(300))
        };

        CardstackPreviewUpdateAction.PreviewUpdateRequest preq=new CardstackPreviewUpdateAction.PreviewUpdateRequest();
        preq.recordId=req.recordId; preq.changes=req.changes;
        req.confirmToken=CardstackPreviewUpdateAction.preview(new List<CardstackPreviewUpdateAction.PreviewUpdateRequest>{preq})[0].confirmToken;
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
}

    @IsTest
    static void previewTrialPredictsDmlFailure() {
        System.runAs(new User(Id=UserInfo.getUserId())) {

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
}

    @IsTest
    static void previewTrialCleanWhenValid() {
        System.runAs(new User(Id=UserInfo.getUserId())) {

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
    @IsTest static void staleRecordAndChangedPolicyCannotWrite() {
        System.runAs(new User(Id=UserInfo.getUserId())) {

        Account a=new Account(Name='Stale review',Description='Before'); insert a;
        CardstackPreviewUpdateAction.PreviewUpdateRequest preq=new CardstackPreviewUpdateAction.PreviewUpdateRequest(); preq.recordId=a.Id;
        preq.changes=new List<CardstackPreviewUpdateAction.PatchEntry>{patch('Description','Reviewed')};
        String token=CardstackPreviewUpdateAction.preview(new List<CardstackPreviewUpdateAction.PreviewUpdateRequest>{preq})[0].confirmToken;
        a.Description='Someone else'; update a;
        CardstackUpdateRecordAction.UpdateRecordRequest req=new CardstackUpdateRecordAction.UpdateRecordRequest(); req.recordId=a.Id; req.changes=preq.changes; req.confirmToken=token;
        Boolean rejected=false;
        try {CardstackUpdateRecordAction.updateRecord(new List<CardstackUpdateRecordAction.UpdateRecordRequest>{req});} catch(CardstackConfirmToken.CardstackException e){rejected=true;}
        System.assert(rejected,'Stale record cannot be overwritten');
        System.assertEquals('Someone else',[SELECT Description FROM Account WHERE Id=:a.Id].Description);
        req.confirmToken=CardstackPreviewUpdateAction.preview(new List<CardstackPreviewUpdateAction.PreviewUpdateRequest>{preq})[0].confirmToken;
        Cardstack_Config__c cfg=[SELECT Id,Value__c FROM Cardstack_Config__c WHERE Name='layout:Account:default' LIMIT 1];
        cfg.Value__c=cfg.Value__c.replace('"writeEnabled":true','"writeEnabled":false'); update cfg;
        rejected=false;
        try {CardstackUpdateRecordAction.updateRecord(new List<CardstackUpdateRecordAction.UpdateRecordRequest>{req});} catch(CardstackPolicyService.PolicyException e){rejected=true;}
        System.assert(rejected,'Changed published policy prevents write');

        }
}
    @IsTest static void blankAndZeroAreIntentionalChanges() {
        System.runAs(new User(Id=UserInfo.getUserId())) {

        Account a=new Account(Name='Exact blanks',Description='Before',NumberOfEmployees=5); insert a;
        CardstackPreviewUpdateAction.PreviewUpdateRequest preq=new CardstackPreviewUpdateAction.PreviewUpdateRequest(); preq.recordId=a.Id;
        preq.changes=new List<CardstackPreviewUpdateAction.PatchEntry>{patch('Description',''),patch('NumberOfEmployees','0')};
        String token=CardstackPreviewUpdateAction.preview(new List<CardstackPreviewUpdateAction.PreviewUpdateRequest>{preq})[0].confirmToken;
        CardstackUpdateRecordAction.UpdateRecordRequest req=new CardstackUpdateRecordAction.UpdateRecordRequest();req.recordId=a.Id;req.changes=preq.changes;req.confirmToken=token;
        CardstackUpdateRecordAction.updateRecord(new List<CardstackUpdateRecordAction.UpdateRecordRequest>{req});
        Account after=[SELECT Description,NumberOfEmployees FROM Account WHERE Id=:a.Id];
        System.assertEquals(null,after.Description);System.assertEquals(0,after.NumberOfEmployees);

        }
}
    @IsTest static void requiredTextCannotBeClearedByNull() {
        System.runAs(new User(Id=UserInfo.getUserId())) {

        Cardstack_Config__c cfg=[SELECT Id,Value__c FROM Cardstack_Config__c WHERE Name='layout:Account:default' LIMIT 1];
        cfg.Value__c=cfg.Value__c.replace('"api":"Description","editable":true','"api":"Description","editable":true,"required":true');update cfg;
        Account a=new Account(Name='Required text',Description='Before');insert a;
        CardstackPreviewUpdateAction.PreviewUpdateRequest preq=new CardstackPreviewUpdateAction.PreviewUpdateRequest();preq.recordId=a.Id;
        preq.changes=new List<CardstackPreviewUpdateAction.PatchEntry>{patch('Description','null')};
        String token=CardstackPreviewUpdateAction.preview(new List<CardstackPreviewUpdateAction.PreviewUpdateRequest>{preq})[0].confirmToken;
        CardstackUpdateRecordAction.UpdateRecordRequest req=new CardstackUpdateRecordAction.UpdateRecordRequest();req.recordId=a.Id;req.changes=preq.changes;req.confirmToken=token;
        CardstackUpdateRecordAction.updateRecord(new List<CardstackUpdateRecordAction.UpdateRecordRequest>{req});
        System.assertEquals('null',[SELECT Description FROM Account WHERE Id=:a.Id].Description,'Literal text remains text');
        preq.changes=new List<CardstackPreviewUpdateAction.PatchEntry>{patch('Description',null)};
        Boolean rejected=false;
        try {CardstackPreviewUpdateAction.preview(new List<CardstackPreviewUpdateAction.PreviewUpdateRequest>{preq});} catch(CardstackPolicyService.PolicyException e){rejected=true;}
        System.assert(rejected,'Actual null is rejected for a required field');

        }
}
}
