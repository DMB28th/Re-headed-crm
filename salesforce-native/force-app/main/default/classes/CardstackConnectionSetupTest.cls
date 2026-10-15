/** Focused private setup behavior. Org execution requires controller authorization. */
@IsTest private with sharing class CardstackConnectionSetupTest {
    private static CardstackConnectionTypes.SetupInput input(String client, Integer revision) {
        CardstackConnectionAccess.adminOverride = true;
        CardstackConnectionTypes.SetupInput value = new CardstackConnectionTypes.SetupInput();
        value.client = client; value.publicClientId = 'public-client';
        value.callbacks = new List<String>{'https://claude.ai/api/mcp/auth_callback'};
        value.siteId = (Id)CardstackConnectionTypes.normalizeId(Schema.Site.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED).getKeyPrefix() + '0'.repeat(12));
        value.sitePrefix = '/cardstack'; value.enabledIntent = false; value.expectedRevision = revision;
        return value;
    }
    @IsTest static void saveRejectsStaleRevision() {
        CardstackConnectionTypes.SetupInput claude = input('claude', 0);
        Test.startTest();
        Assert.areEqual(1, CardstackConnectionSetup.save(claude).revision, 'Initial revision');
        CardstackConnectionSetup.save(input('chatgpt', 0));
        claude.expectedRevision = 1; claude.publicClientId = 'changed';
        Assert.areEqual(2, CardstackConnectionSetup.save(claude).revision, 'Changed revision');
        claude.publicClientId = 'stale';
        try { CardstackConnectionSetup.save(claude); Assert.fail('Stale save rejected'); }
        catch (CardstackConnectionTypes.ConnectionException e) { Assert.areEqual('STALE_SETUP', e.getMessage(), 'Safe error'); }
        Assert.areEqual(2, CardstackConnectionSetup.get('claude').revision, 'Stored revision unchanged');
        Assert.areEqual('changed', CardstackConnectionSetup.get('claude').publicClientId, 'Stored content unchanged');
        Assert.areEqual(1, CardstackConnectionSetup.get('chatgpt').revision, 'Other client unchanged');
        Test.stopTest();
    }
    @IsTest static void identicalSaveDoesNotIncrementRevision() {
        CardstackConnectionTypes.SetupInput value = input('claude', 0);
        Test.startTest(); CardstackConnectionSetup.save(value); value.expectedRevision = 1;
        Assert.areEqual(1, CardstackConnectionSetup.save(value).revision, 'No-op keeps revision'); Test.stopTest();
    }
    @IsTest static void saveNormalizesCallbacks() {
        CardstackConnectionTypes.SetupInput value = input('claude', 0);
        value.callbacks.add(''); value.callbacks.add(' https://claude.ai/api/mcp/auth_callback ');
        Test.startTest();
        Assert.areEqual(new List<String>{'https://claude.ai/api/mcp/auth_callback'}, CardstackConnectionSetup.save(value).callbacks, 'Duplicate and empty callbacks removed');
        Test.stopTest();
    }
    @IsTest static void ordinaryUserCannotReadSetup() {
        CardstackConnectionAccess.adminOverride = false;
        Test.startTest();
        try { CardstackConnectionSetup.get('claude'); Assert.fail('Admin required'); }
        catch (CardstackConnectionTypes.ConnectionException e) { Assert.areEqual('NOT_AUTHORIZED', e.getMessage(), 'Safe denial'); }
        Test.stopTest();
    }
    @IsTest static void ordinaryUserCannotSaveSetup() {
        CardstackConnectionTypes.SetupInput value = input('claude', 0); CardstackConnectionAccess.adminOverride = false;
        Test.startTest();
        try { CardstackConnectionSetup.save(value); Assert.fail('Admin required'); }
        catch (CardstackConnectionTypes.ConnectionException e) { Assert.areEqual('NOT_AUTHORIZED', e.getMessage(), 'Safe denial'); }
        Test.stopTest();
    }
    @IsTest static void missingUserPermissionFails() {
        CardstackConnectionAccess.userOverride = false;
        Test.startTest();
        try { CardstackConnectionSetup.snapshot('claude'); Assert.fail('User permission required'); }
        catch (CardstackConnectionTypes.ConnectionException e) { Assert.areEqual('NOT_AUTHORIZED', e.getMessage(), 'Safe denial'); }
        Test.stopTest();
    }
    private static void rejects(CardstackConnectionTypes.SetupInput value, String code) {
        Test.startTest();
        try { CardstackConnectionSetup.save(value); Assert.fail('Invalid input rejected'); }
        catch (CardstackConnectionTypes.ConnectionException e) { Assert.areEqual(code, e.getMessage(), 'Safe validation error'); }
        Test.stopTest();
    }
    @IsTest static void unknownClientRejected() { rejects(input('other', 0), 'INVALID_CLIENT'); }
    @IsTest static void clientEnumIsCaseSensitive() { rejects(input('CLAUDE', 0), 'INVALID_CLIENT'); }
    @IsTest static void prefixControlCharacterRejected() { CardstackConnectionTypes.SetupInput v = input('claude', 0); v.sitePrefix = '/cardstack\n'; rejects(v, 'INVALID_SETUP'); }
    @IsTest static void externalDomainPrefixRejected() { CardstackConnectionTypes.SetupInput v = input('claude', 0); v.sitePrefix = 'https://evil.example'; rejects(v, 'INVALID_SETUP'); }
    @IsTest static void controlCharacterRejected() { CardstackConnectionTypes.SetupInput v = input('claude', 0); v.publicClientId = 'id\nsecret'; rejects(v, 'INVALID_SETUP'); }
    @IsTest static void oversizedClientIdRejected() { CardstackConnectionTypes.SetupInput v = input('claude', 0); v.publicClientId = 'x'.repeat(257); rejects(v, 'INVALID_SETUP'); }
    @IsTest static void tooManyCallbacksRejected() { CardstackConnectionTypes.SetupInput v = input('claude', 0); v.callbacks = new List<String>(); for(Integer i=0;i<11;i++) v.callbacks.add('https://example.com/callback/'+i); rejects(v, 'INVALID_SETUP'); }
    @IsTest static void oversizedCallbackRejected() { CardstackConnectionTypes.SetupInput v = input('claude', 0); v.callbacks = new List<String>{'https://example.com/'+ 'x'.repeat(2048)}; rejects(v, 'INVALID_SETUP'); }
    @IsTest static void oversizedPrefixRejected() { CardstackConnectionTypes.SetupInput v = input('claude', 0); v.sitePrefix = '/'+ 'x'.repeat(80); rejects(v, 'INVALID_SETUP'); }
    @IsTest static void unreadableContextDoesNotDiscardConfiguration() {
        CardstackConnectionTypes.SetupInput value = input('claude', 0);
        Test.startTest();
        CardstackConnectionTypes.SetupView saved = CardstackConnectionSetup.save(value);
        CardstackConnectionAccess.userOverride = true;
        Assert.areEqual('/cardstack', CardstackConnectionSetup.snapshot('claude').sitePrefix, 'Selected prefix retained');
        Assert.areEqual(value.siteId, CardstackConnectionSetup.snapshot('claude').siteId, 'Selected Site retained without metadata access');
        Assert.areEqual('public-client', saved.publicClientId, 'Public client retained');
        Assert.areEqual(false, saved.enabledIntent, 'Intent retained');
        Assert.areEqual('Unknown', saved.checks[0].status, 'No context is Unknown');
        Test.stopTest();
    }
    @IsTest static void snapshotDoesNotExportOrgIdentity() {
        CardstackConnectionAccess.userOverride = true;
        Test.startTest();
        CardstackConnectionTypes.SetupSnapshot snapshot = CardstackConnectionSetup.snapshot('claude');
        Assert.isFalse(JSON.serialize(snapshot).contains(String.valueOf(UserInfo.getOrganizationId())), 'Org identity private');
        Assert.isFalse(JSON.serialize(snapshot).contains(String.valueOf(UserInfo.getUserId())), 'Actor identity excluded');
        Test.stopTest();
    }

    @IsTest static void actualPermissionDeniesUnassignedNamedUser() {
        User actor = CardstackConnectionTestFactory.namedUser();
        Test.startTest();
        System.runAs(actor) {
            Assert.isFalse(FeatureManagement.checkPermission('Cardstack_Manage_Connections'), 'No inherited admin grant');
            Assert.isFalse(FeatureManagement.checkPermission('Cardstack_Use_Connections'), 'No inherited user grant');
            try { CardstackConnectionSetup.get('claude'); Assert.fail('Admin gate'); }
            catch(CardstackConnectionTypes.ConnectionException e) { Assert.areEqual('NOT_AUTHORIZED', e.getMessage(), 'Actual permission denial'); }
            try { CardstackConnectionSetup.snapshot('claude'); Assert.fail('User gate'); }
            catch(CardstackConnectionTypes.ConnectionException e) { Assert.areEqual('NOT_AUTHORIZED', e.getMessage(), 'Actual permission denial'); }
            try { CardstackConnectionSetupRepository.readAdmin('claude'); Assert.fail('Repository gate'); }
            catch(CardstackConnectionTypes.ConnectionException e) { Assert.areEqual('NOT_AUTHORIZED', e.getMessage(), 'Direct entry denied'); }
        }
        Test.stopTest();
    }
    @IsTest static void unassignedNamedUserHasNoPrivateObjectCrud() {
        User actor = CardstackConnectionTestFactory.namedUser();
        Test.startTest();
        System.runAs(actor) {
            Schema.DescribeSObjectResult setupObject = Cardstack_Connection_Setup__c.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED);
            Assert.isFalse(setupObject.isAccessible(), 'No private object read without grant');
            Assert.isFalse(setupObject.isCreateable(), 'No private object create without grant');
            Assert.isFalse(setupObject.isUpdateable(), 'No private object edit without grant');
        }
        Test.stopTest();
    }
    /** Diagnostic only: owned test DML grants do not prove deployed named-set authority. */
    @IsTest static void ownedPermissionSetEvaluatesNativeUserGate() {
        User actor = CardstackConnectionTestFactory.namedUser();
        List<CustomPermission> definitions = [
            SELECT Id FROM CustomPermission
            WHERE DeveloperName = 'Cardstack_Use_Connections' AND NamespacePrefix = null
        ];
        if(definitions.size() != 1) {
            throw new CardstackConnectionTestFactory.PrerequisiteException('CUSTOM_PERMISSION_METADATA_PREREQUISITE');
        }
        PermissionSet owned = new PermissionSet(Name='CardstackOwnedDiagnostic', Label='Cardstack Owned Diagnostic');
        insert owned;
        insert new SetupEntityAccess(ParentId=owned.Id, SetupEntityId=definitions[0].Id);
        insert new PermissionSetAssignment(AssigneeId=actor.Id, PermissionSetId=owned.Id);
        Test.startTest();
        System.runAs(actor) {
            String expectedActor = CardstackConnectionTypes.normalizeId(String.valueOf(actor.Id));
            String currentActor = CardstackConnectionTypes.normalizeId(String.valueOf(UserInfo.getUserId()));
            Assert.isTrue(expectedActor.equals(currentActor), 'ACTOR_CONTEXT_PREREQUISITE');
            Assert.isTrue(FeatureManagement.checkPermission('Cardstack_Use_Connections'), 'Owned native user permission');
            Assert.isFalse(FeatureManagement.checkPermission('Cardstack_Manage_Connections'), 'Owned user not admin');
            Assert.areEqual(0, CardstackConnectionSetup.snapshot('claude').setupView.revision, 'Owned native snapshot allowed');
            try { CardstackConnectionSetup.get('claude'); Assert.fail('Owned user cannot read admin setup'); }
            catch(CardstackConnectionTypes.ConnectionException e) {
                Assert.areEqual('NOT_AUTHORIZED', e.getMessage(), 'Owned user admin denial');
            }
        }
        Test.stopTest();
    }
    @IsTest static void actualAdminAssignmentAllowsSetup() {
        User actor = CardstackConnectionTestFactory.namedUser();
        CardstackConnectionTestFactory.assign(actor, 'Cardstack_Admin');
        Test.startTest();
        System.runAs(actor) {
            Assert.isTrue(FeatureManagement.checkPermission('Cardstack_Manage_Connections'), 'Admin custom permission');
            Assert.isTrue(FeatureManagement.checkPermission('Cardstack_Use_Connections'), 'Admin also named user');
            Assert.areEqual(0, CardstackConnectionSetup.get('claude').revision, 'Authorized private read');
            CardstackConnectionTypes.SetupInput value = input('claude', 0);
            CardstackConnectionAccess.adminOverride = null;
            Assert.areEqual(1, CardstackConnectionSetup.save(value).revision, 'Explicit admin can use gated system repository');
        }
        Test.stopTest();
    }
    @IsTest static void actualUserAssignmentAllowsOnlyInternalSnapshot() {
        User actor = CardstackConnectionTestFactory.namedUser();
        CardstackConnectionTestFactory.assign(actor, 'Cardstack_User');
        Test.startTest();
        System.runAs(actor) {
            Assert.isTrue(FeatureManagement.checkPermission('Cardstack_Use_Connections'), 'Named user permission');
            Assert.isFalse(FeatureManagement.checkPermission('Cardstack_Manage_Connections'), 'User not admin');
            Assert.isFalse(Cardstack_Connection_Setup__c.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED).isAccessible(), 'No private object read grant');
            Assert.isFalse(Cardstack_Connection_Setup__c.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED).isCreateable(), 'No private object create grant');
            Assert.isFalse(Cardstack_Connection_Setup__c.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED).isUpdateable(), 'No private object edit grant');
            Assert.areEqual(0, CardstackConnectionSetup.snapshot('claude').setupView.revision, 'Internal snapshot allowed');
            try { CardstackConnectionSetup.get('claude'); Assert.fail('No setup view'); }
            catch(CardstackConnectionTypes.ConnectionException e) { Assert.areEqual('NOT_AUTHORIZED', e.getMessage(), 'User cannot read admin setup'); }
        }
        Test.stopTest();
    }

    @IsTest static void contractDriftIsStaleWithoutInventingMetadataEvidence() {
        CardstackConnectionSetup.save(input('claude', 0));
        Cardstack_Connection_Setup__c row = [SELECT Id, Configuration__c FROM Cardstack_Connection_Setup__c WHERE Client__c = 'claude' WITH SYSTEM_MODE LIMIT 1];
        row.Configuration__c = row.Configuration__c.replace('"packageVersion":"0.1.0.8"', '"packageVersion":"obsolete"');
        Database.update(row, AccessLevel.SYSTEM_MODE);
        Test.startTest();
        CardstackConnectionTypes.SetupView view = CardstackConnectionSetup.get('claude');
        Assert.areEqual('Stale', view.summary, 'Changed contract invalidates current readiness');
        Assert.areEqual('Unknown', view.checks[1].status, 'Unreadable OAuth policy stays Unknown');
        Assert.areEqual('Stale', view.checks[2].status, 'Separate drift evidence');
        Test.stopTest();
    }
}
