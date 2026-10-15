/** Isolated named users for actual custom-permission tests. No org-specific identities. */
@IsTest public with sharing class CardstackConnectionTestFactory {
    public class PrerequisiteException extends Exception {}
    public static User namedUser() {
        List<Profile> profiles = [SELECT Id FROM Profile WHERE Name = 'Minimum Access - Salesforce' AND UserLicense.Name = 'Salesforce' LIMIT 1];
        if(profiles.isEmpty()) throw new PrerequisiteException('PROFILE_PREREQUISITE');
        String uniqueName = EncodingUtil.convertToHex(Crypto.generateAesKey(128)) + '@example.invalid';
        User actor = new User(Username=uniqueName, Email=uniqueName, LastName='Connection Test', Alias='csconn', ProfileId=profiles[0].Id, TimeZoneSidKey='America/New_York', LocaleSidKey='en_US', EmailEncodingKey='UTF-8', LanguageLocaleKey='en_US');
        insert actor; return actor;
    }
    /** Trace fixture prerequisites before testing native FeatureManagement semantics. */
    public static void assign(User actor, String permissionSetName) {
        Set<String> expectedNames = new Set<String>{'Cardstack_Use_Connections'};
        if(permissionSetName == 'Cardstack_Admin') expectedNames.add('Cardstack_Manage_Connections');
        List<CustomPermission> definitions = [
            SELECT Id FROM CustomPermission
            WHERE DeveloperName IN :expectedNames AND NamespacePrefix = null
        ];
        if(definitions.size() != expectedNames.size()) {
            throw new PrerequisiteException('CUSTOM_PERMISSION_METADATA_PREREQUISITE');
        }
        Set<Id> definitionIds = new Map<Id,CustomPermission>(definitions).keySet();
        List<PermissionSet> permissionSets = [
            SELECT Id FROM PermissionSet WHERE Name = :permissionSetName LIMIT 1
        ];
        if(permissionSets.isEmpty()) {
            throw new PrerequisiteException('PERMISSION_SET_METADATA_PREREQUISITE');
        }
        Id permissionId = permissionSets[0].Id;
        Integer grants = [
            SELECT count() FROM SetupEntityAccess
            WHERE ParentId = :permissionId AND SetupEntityId IN :definitionIds
        ];
        if(grants != definitionIds.size()) {
            throw new PrerequisiteException('PERMISSION_SET_GRANT_PREREQUISITE');
        }
        insert new PermissionSetAssignment(AssigneeId=actor.Id, PermissionSetId=permissionId);
        Integer assignments = [
            SELECT count() FROM PermissionSetAssignment
            WHERE AssigneeId = :actor.Id AND PermissionSetId = :permissionId
        ];
        if(assignments != 1) {
            throw new PrerequisiteException('PERMISSION_ASSIGNMENT_PREREQUISITE');
        }
    }
}
