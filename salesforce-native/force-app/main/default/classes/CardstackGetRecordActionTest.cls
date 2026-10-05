@IsTest
private class CardstackGetRecordActionTest {
    // Package validation users need the same explicit permissions as installed admins.
    @TestSetup
    static void grantPackagePermissions() {
        PermissionSet admin = [SELECT Id FROM PermissionSet WHERE Name = 'Cardstack_Admin' LIMIT 1];
        if ([SELECT count() FROM PermissionSetAssignment WHERE AssigneeId = :UserInfo.getUserId() AND PermissionSetId = :admin.Id] == 0) {
            insert new PermissionSetAssignment(AssigneeId = UserInfo.getUserId(), PermissionSetId = admin.Id);
        }
    }


    @IsTest
    static void getByIdReturnsRecordCard() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
        Account a = new Account(Name = 'GetRec Acme', Industry = 'Technology', AnnualRevenue = 9000000);
        insert a;

        CardstackGetRecordAction.GetRecordRequest req =
            new CardstackGetRecordAction.GetRecordRequest();
        req.objectName = 'Account';
        req.recordId = a.Id;

        List<CardstackGetRecordAction.GetRecordResponse> resps =
            CardstackGetRecordAction.getRecord(
                new List<CardstackGetRecordAction.GetRecordRequest>{ req });

        CardstackGetRecordAction.GetRecordResponse res = resps[0];
        System.assertEquals('Account', res.objectName);
        System.assertEquals(a.Id, res.recordId);
        System.assertEquals('GetRec Acme', res.recordName);
        System.assert(res.recordUrl.endsWith('/' + a.Id), 'absolute URL: ' + res.recordUrl);
        System.assert(!res.fields.isEmpty(), 'field rows populated');
        Boolean foundIndustry = false;
        for (CardstackGetRecordAction.FieldRow fr : res.fields) {
            if (fr.fieldApi == 'Industry' && fr.value == 'Technology') {
                foundIndustry = true;
            }
        }
        System.assert(foundIndustry, 'Industry field row present');
            }
    }

    @IsTest
    static void getByQueryResolvesNameWithDisambiguation() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
        insert new List<Account>{
            new Account(Name = 'GetRec QueryOne'),
            new Account(Name = 'GetRec QueryTwo')
        };

        CardstackGetRecordAction.GetRecordRequest req =
            new CardstackGetRecordAction.GetRecordRequest();
        req.objectName = 'Account';
        req.query = 'GetRec Query';

        List<CardstackGetRecordAction.GetRecordResponse> resps =
            CardstackGetRecordAction.getRecord(
                new List<CardstackGetRecordAction.GetRecordRequest>{ req });

        CardstackGetRecordAction.GetRecordResponse res = resps[0];
        System.assertNotEquals(null, res.recordId);
        System.assert(res.summary.contains('matched'), 'disambiguation: ' + res.summary);
            }
    }

    @IsTest
    static void queryWithNoMatchThrows() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
        CardstackGetRecordAction.GetRecordRequest req =
            new CardstackGetRecordAction.GetRecordRequest();
        req.objectName = 'Account';
        req.query = 'Zzz No Such Record Qqq';

        try {
            CardstackGetRecordAction.getRecord(
                new List<CardstackGetRecordAction.GetRecordRequest>{ req });
            System.assert(false, 'expected exception for no match');
        } catch (CardstackGetRecordAction.CardstackException e) {
            System.assert(e.getMessage().contains('No Account record matches'), e.getMessage());
        }
            }
    }

    @IsTest
    static void missingIdAndQueryThrows() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
        CardstackGetRecordAction.GetRecordRequest req =
            new CardstackGetRecordAction.GetRecordRequest();
        req.objectName = 'Account';

        try {
            CardstackGetRecordAction.getRecord(
                new List<CardstackGetRecordAction.GetRecordRequest>{ req });
            System.assert(false, 'expected exception');
        } catch (CardstackGetRecordAction.CardstackException e) {
            System.assert(e.getMessage().contains('Provide recordId or query'), e.getMessage());
        }
            }
    }
    @IsTest
    static void sectionLayoutAlsoReturnsFlatFields() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
        Account a = new Account(Name = 'Flat Sections', Industry = 'Technology', Phone = '555-0100');
        insert a;
        insert new Cardstack_Config__c(Name = 'layout:Account:default', Is_Active__c = true,
            Value__c = '{"highlights":[{"api":"Industry"}],"sections":[{"label":"Contact","fields":[{"api":"Phone"}]}]}');
        CardstackGetRecordAction.GetRecordRequest req = new CardstackGetRecordAction.GetRecordRequest();
        req.objectName = 'Account'; req.recordId = a.Id;
        CardstackGetRecordAction.GetRecordResponse result = CardstackGetRecordAction.getRecord(
            new List<CardstackGetRecordAction.GetRecordRequest>{req})[0];
        System.assertEquals(2, result.fields.size(), 'Flat fallback must include highlights and section fields');
        System.assertEquals('Industry', result.fields[0].fieldApi);
        System.assertEquals('Technology', result.fields[0].value);
        System.assertEquals('Phone', result.fields[1].fieldApi);
        System.assertEquals('555-0100', result.fields[1].value);
        System.assertEquals(1, result.highlights.size());
        System.assertEquals(1, result.sections.size());
            }
    }

    @IsTest
    static void legacySectionsAlsoReturnFlatFields() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
        Account a = new Account(Name = 'Flat Legacy', Phone = '555-0101');
        insert a;
        insert new Cardstack_Config__c(Name = 'layout:Account:default', Is_Active__c = true,
            Value__c = '{"recordCard":{"sections":[{"label":"Contact","fields":[{"api":"Phone"}]}]}}');
        CardstackGetRecordAction.GetRecordRequest req = new CardstackGetRecordAction.GetRecordRequest();
        req.objectName = 'Account'; req.recordId = a.Id;
        CardstackGetRecordAction.GetRecordResponse result = CardstackGetRecordAction.getRecord(
            new List<CardstackGetRecordAction.GetRecordRequest>{req})[0];
        System.assertEquals(1, result.fields.size(), 'Flat fallback must include legacy section fields');
        System.assertEquals('Phone', result.fields[0].fieldApi);
        System.assertEquals('555-0101', result.fields[0].value);
            }
    }
}
