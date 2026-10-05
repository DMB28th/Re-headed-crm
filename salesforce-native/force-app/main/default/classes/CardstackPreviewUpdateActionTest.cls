@IsTest
private class CardstackPreviewUpdateActionTest {
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
    static void previewComputesDiffAndMintsToken() {
        System.runAs(new User(Id=UserInfo.getUserId())) {

        Account a = new Account(Name = 'Upd Acme', Industry = 'Technology');
        insert a;

        CardstackPreviewUpdateAction.PreviewUpdateRequest req =
            new CardstackPreviewUpdateAction.PreviewUpdateRequest();
        req.recordId = a.Id;
        req.changes = new List<CardstackPreviewUpdateAction.PatchEntry>{
            patch('Industry', 'Healthcare'),
            patch('Name', 'Upd Acme') // no-op — excluded from diff
        };

        List<CardstackPreviewUpdateAction.PreviewUpdateResponse> resps =
            CardstackPreviewUpdateAction.preview(
                new List<CardstackPreviewUpdateAction.PreviewUpdateRequest>{ req });

        CardstackPreviewUpdateAction.PreviewUpdateResponse res = resps[0];
        System.assertEquals('Account', res.objectName);
        System.assertEquals(a.Id, res.recordId);
        System.assertEquals(1, res.changes.size(), 'only the real change is in the diff');
        System.assertEquals('Industry', res.changes[0].fieldApi);
        System.assertEquals('Technology', res.changes[0].beforeValue);
        System.assertEquals('Healthcare', res.changes[0].afterValue);
        System.assertNotEquals(null, res.confirmToken);
        System.assert(res.summary.contains('nothing written yet'), 'summary: ' + res.summary);

        Account after = [SELECT Industry FROM Account WHERE Id = :a.Id WITH USER_MODE];
        System.assertEquals('Technology', after.Industry, 'preview writes nothing');

        }
}

    @IsTest
    static void noOpPatchThrows() {
        System.runAs(new User(Id=UserInfo.getUserId())) {

        Account a = new Account(Name = 'Upd Noop', Industry = 'Technology');
        insert a;

        CardstackPreviewUpdateAction.PreviewUpdateRequest req =
            new CardstackPreviewUpdateAction.PreviewUpdateRequest();
        req.recordId = a.Id;
        req.changes = new List<CardstackPreviewUpdateAction.PatchEntry>{
            patch('Industry', 'Technology')
        };

        try {
            CardstackPreviewUpdateAction.preview(
                new List<CardstackPreviewUpdateAction.PreviewUpdateRequest>{ req });
            System.assert(false, 'expected exception for no-op');
        } catch (CardstackPreviewUpdateAction.CardstackException e) {
            System.assert(e.getMessage().contains('Nothing to change'), e.getMessage());
        }

        }
}

    @IsTest
    static void unknownFieldThrows() {
        System.runAs(new User(Id=UserInfo.getUserId())) {

        Account a = new Account(Name = 'Upd Bad Field');
        insert a;

        CardstackPreviewUpdateAction.PreviewUpdateRequest req =
            new CardstackPreviewUpdateAction.PreviewUpdateRequest();
        req.recordId = a.Id;
        req.changes = new List<CardstackPreviewUpdateAction.PatchEntry>{
            patch('NoSuchField__c', 'x')
        };

        try {
            CardstackPreviewUpdateAction.preview(
                new List<CardstackPreviewUpdateAction.PreviewUpdateRequest>{ req });
            System.assert(false, 'expected exception');
        } catch (CardstackPreviewUpdateAction.CardstackException e) {
            System.assert(e.getMessage().contains('Unknown field'), e.getMessage());
        }

        }
}

    @IsTest
    static void readOnlyFieldThrows() {
        System.runAs(new User(Id=UserInfo.getUserId())) {

        Account a = new Account(Name = 'Upd ReadOnly');
        insert a;

        CardstackPreviewUpdateAction.PreviewUpdateRequest req =
            new CardstackPreviewUpdateAction.PreviewUpdateRequest();
        req.recordId = a.Id;
        req.changes = new List<CardstackPreviewUpdateAction.PatchEntry>{
            patch('CreatedDate', '2024-01-01')
        };

        try {
            CardstackPreviewUpdateAction.preview(
                new List<CardstackPreviewUpdateAction.PreviewUpdateRequest>{ req });
            System.assert(false, 'expected exception for read-only field');
        } catch (CardstackPreviewUpdateAction.CardstackException e) {
            System.assert(e.getMessage().contains('not writable'), e.getMessage());
        }

        }
}
}
