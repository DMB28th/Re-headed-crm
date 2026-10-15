/**
 * Isolated native Studio permission grants for Apex tests only.
 * This qualifies the actual CustomPermission gate, independently of a staged
 * update to an installed permission set. It does not attest deployed Admin grants.
 */
@IsTest public with sharing class CardstackStudioTestFactory {
    private static final String STUDIO_PERMISSION = 'Cardstack_Manage_Studio';

    /**
     * @description Grant the real unnamespaced Studio permission within test rollback.
     * @param actor Persisted test actor; existing Admin assignment supplies Config CRUD.
     */
    public static void grantManageStudio(User actor) {
        Assert.isNotNull(actor, 'A persisted native actor is required for the Studio fixture.');
        Assert.isNotNull(actor.Id, 'The Studio fixture cannot assign an unpersisted actor.');
        List<CustomPermission> definitions = [
            SELECT Id, DeveloperName, NamespacePrefix FROM CustomPermission
            WHERE DeveloperName = :STUDIO_PERMISSION AND NamespacePrefix = null
            WITH SYSTEM_MODE
        ];
        Assert.areEqual(1, definitions.size(), 'NATIVE_STUDIO_PERMISSION_METADATA_PREREQUISITE: the actual Studio definition must be visible during native validation.');
        CustomPermission definition = definitions[0];
        Assert.isTrue(STUDIO_PERMISSION.equals(definition.DeveloperName), 'Require the exact canonical Studio definition.');
        Assert.isNull(definition.NamespacePrefix, 'The fixture grants the actual unnamespaced definition.');

        PermissionSet fixture = new PermissionSet(
            Name = 'CardstackStudioFixture_' + EncodingUtil.convertToHex(Crypto.generateAesKey(128)),
            Label = 'Cardstack Studio native test fixture'
        );
        insert as system fixture;
        insert as system new SetupEntityAccess(ParentId = fixture.Id, SetupEntityId = definition.Id);
        insert as system new PermissionSetAssignment(AssigneeId = actor.Id, PermissionSetId = fixture.Id);
        Assert.areEqual(1, [
            SELECT count() FROM SetupEntityAccess
            WHERE ParentId = :fixture.Id AND SetupEntityId = :definition.Id
                AND SetupEntityType = 'CustomPermission' WITH SYSTEM_MODE
        ], 'The temporary permission set must grant exactly the actual Studio permission.');
        Assert.areEqual(1, [
            SELECT count() FROM PermissionSetAssignment
            WHERE PermissionSetId = :fixture.Id AND AssigneeId = :actor.Id WITH SYSTEM_MODE
        ], 'The intended actor must receive exactly the temporary Studio permission set.');
    }
}
