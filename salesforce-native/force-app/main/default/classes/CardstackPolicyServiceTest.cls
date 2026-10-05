@IsTest
private class CardstackPolicyServiceTest {
    @TestSetup static void permissions() {
        PermissionSet ps = [SELECT Id FROM PermissionSet WHERE Name='Cardstack_Admin' LIMIT 1];
        if ([SELECT count() FROM PermissionSetAssignment WHERE AssigneeId=:UserInfo.getUserId() AND PermissionSetId=:ps.Id]==0) insert new PermissionSetAssignment(AssigneeId=UserInfo.getUserId(), PermissionSetId=ps.Id);
    }
    private static void live(String value) {
        insert new Cardstack_Config__c(Name='layout:Account:default', Is_Active__c=true, Value__c=value);
    }
    @IsTest static void publishedPolicyExcludesDrafts() {
        System.runAs(new User(Id=UserInfo.getUserId())) {

        System.runAs(new User(Id=UserInfo.getUserId())) {
            CardstackConfigService.saveDraft('layout:Account:default', '{"permissions":{"writeEnabled":true},"fields":[{"api":"Description","editable":true}]}');
            System.assertEquals(false, CardstackPolicyService.resolve('Account').editEnabled);
        }

        }
}
    @IsTest static void legacyLayoutDoesNotEnableEditing() {
        System.runAs(new User(Id=UserInfo.getUserId())) {

        live('{"fields":[{"api":"Description","editable":true}]}');
        System.runAs(new User(Id=UserInfo.getUserId())) {
            CardstackPolicyService.Policy p=CardstackPolicyService.resolve('Account');
            System.assertEquals(false,p.editEnabled);
            System.assertEquals(true,p.fields.get('Description').readOnly);
        }

        }
}
    @IsTest static void restrictiveDuplicatesAndDenylistWin() {
        System.runAs(new User(Id=UserInfo.getUserId())) {

        live('{"permissions":{"writeEnabled":true,"fieldDenylist":["NumberOfEmployees"]},"highlights":[{"api":"Description","readOnly":true}],"sections":[{"fields":[{"api":"Description","editable":true,"required":true},{"api":"NumberOfEmployees","editable":true},{"api":"Phone","editable":true}]}]}');
        System.runAs(new User(Id=UserInfo.getUserId())) {
            CardstackPolicyService.Policy p=CardstackPolicyService.resolve('Account');
            System.assertEquals(true,p.editEnabled);
            System.assertEquals(true,p.fields.get('Description').readOnly);
            System.assertEquals(true,p.fields.get('NumberOfEmployees').readOnly);
            System.assertEquals(false,p.fields.get('Phone').readOnly);
            System.assertEquals(true,p.fields.get('Description').required);
        }

        }
}
    @IsTest static void unknownOrNonWritableFieldsCannotBeExposed() {
        System.runAs(new User(Id=UserInfo.getUserId())) {

        live('{"permissions":{"writeEnabled":true},"recordCard":{"sections":[{"fields":[{"name":"Does_Not_Exist__c","editable":true},{"name":"CreatedDate","editable":true},{"name":"Description"}]}]}}');
        System.runAs(new User(Id=UserInfo.getUserId())) {
            CardstackPolicyService.Policy p=CardstackPolicyService.resolve('Account');
            System.assertEquals(false,p.fields.containsKey('Does_Not_Exist__c'));
            System.assertEquals(true,p.fields.get('CreatedDate').readOnly);
            System.assertEquals(true,p.fields.get('Description').readOnly);
            System.assertNotEquals(null,p.revision);
        }

        }
}
}
