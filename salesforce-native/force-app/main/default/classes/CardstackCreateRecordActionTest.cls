@IsTest
private class CardstackCreateRecordActionTest {

    private static CardstackPreviewUpdateAction.PatchEntry field(String name, String value) {
        CardstackPreviewUpdateAction.PatchEntry p =
            new CardstackPreviewUpdateAction.PatchEntry();
        p.fieldApiName = name;
        p.newValue = value;
        return p;
    }

    @IsTest
    static void createsTaskWithFields() {
        CardstackCreateRecordAction.CreateRecordRequest req =
            new CardstackCreateRecordAction.CreateRecordRequest();
        req.objectName = 'Task';
        req.fields = new List<CardstackPreviewUpdateAction.PatchEntry>{
            field('Subject', 'Created by Cardstack Test'),
            field('Status', 'Not Started')
        };

        List<CardstackCreateRecordAction.CreateRecordResponse> resps =
            CardstackCreateRecordAction.createRecord(
                new List<CardstackCreateRecordAction.CreateRecordRequest>{ req });

        CardstackCreateRecordAction.CreateRecordResponse res = resps[0];
        System.assertEquals('Task', res.objectName);
        System.assertNotEquals(null, res.recordId);
        System.assert(res.recordUrl.endsWith('/' + res.recordId));
        System.assert(res.summary.contains('Created Task'), 'summary: ' + res.summary);

        Task after = [SELECT Subject FROM Task WHERE Id = :res.recordId WITH USER_MODE];
        System.assertEquals('Created by Cardstack Test', after.Subject);
    }

    @IsTest
    static void createsAccountWithDefaults() {
        CardstackCreateRecordAction.CreateRecordRequest req =
            new CardstackCreateRecordAction.CreateRecordRequest();
        req.objectName = 'Account';
        req.fields = new List<CardstackPreviewUpdateAction.PatchEntry>{
            field('Name', 'CreateRec NewCo')
        };

        List<CardstackCreateRecordAction.CreateRecordResponse> resps =
            CardstackCreateRecordAction.createRecord(
                new List<CardstackCreateRecordAction.CreateRecordRequest>{ req });

        System.assertNotEquals(null, resps[0].recordId);
        Account after = [SELECT Name FROM Account WHERE Id = :resps[0].recordId WITH USER_MODE];
        System.assertEquals('CreateRec NewCo', after.Name);
    }

    @IsTest
    static void readOnlyFieldRejected() {
        CardstackCreateRecordAction.CreateRecordRequest req =
            new CardstackCreateRecordAction.CreateRecordRequest();
        req.objectName = 'Task';
        req.fields = new List<CardstackPreviewUpdateAction.PatchEntry>{
            field('Subject', 'Bad Field Test'),
            field('CreatedDate', '2024-01-01')
        };

        try {
            CardstackCreateRecordAction.createRecord(
                new List<CardstackCreateRecordAction.CreateRecordRequest>{ req });
            System.assert(false, 'expected exception for read-only field');
        } catch (CardstackCreateRecordAction.CardstackException e) {
            System.assert(e.getMessage().contains('not writable'), e.getMessage());
        }
    }

    @IsTest
    static void unknownFieldRejected() {
        CardstackCreateRecordAction.CreateRecordRequest req =
            new CardstackCreateRecordAction.CreateRecordRequest();
        req.objectName = 'Task';
        req.fields = new List<CardstackPreviewUpdateAction.PatchEntry>{
            field('NoSuchField__c', 'x')
        };

        try {
            CardstackCreateRecordAction.createRecord(
                new List<CardstackCreateRecordAction.CreateRecordRequest>{ req });
            System.assert(false, 'expected exception');
        } catch (CardstackCreateRecordAction.CardstackException e) {
            System.assert(e.getMessage().contains('Unknown field'), e.getMessage());
        }
    }

    @IsTest
    static void dmlFailureReturnsStructuredErrorNotException() {
        CardstackCreateRecordAction.CreateRecordRequest req =
            new CardstackCreateRecordAction.CreateRecordRequest();
        req.objectName = 'Account';
        req.fields = new List<CardstackPreviewUpdateAction.PatchEntry>{
            field('Name', 'x'.repeat(300))
        };

        // Must NOT throw — returns structured failure.
        List<CardstackCreateRecordAction.CreateRecordResponse> resps =
            CardstackCreateRecordAction.createRecord(
                new List<CardstackCreateRecordAction.CreateRecordRequest>{ req });

        CardstackCreateRecordAction.CreateRecordResponse res = resps[0];
        System.assertEquals(true, res.dmlFailed);
        System.assertEquals(false, res.showSuccess);
        System.assertEquals(null, res.recordId, 'no record created');
        System.assert(!res.dmlErrors.isEmpty());
        System.assertEquals('VALIDATION', res.dmlErrors[0].errorType);
        System.assert(res.summary.contains('Nothing was created'),
            'summary: ' + res.summary);
    }
}
