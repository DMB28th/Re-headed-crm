/** Source-only RED contract. Fixtures are rolled back by Apex test execution. */
@IsTest(SeeAllData=false)
private with sharing class CardstackOpportunityEditServiceTest {
    @TestSetup static void grantPackageReadPermissions() {
        CardstackOpportunityEditTestData.grantCurrentActorPackageRead();
    }
    @IsTest static void publishedPresetStartsThreeOrderedInputs() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture();
        Test.startTest();
        CardstackOpportunityEditTypes.Envelope opened = open(record);
        Assert.areEqual('opportunity-edit/v1', opened.view.contractVersion, 'Versioned fixed process is pinned');
        Assert.areEqual(3, opened.view.fields.size(), 'Exactly three inputs must be displayed');
        Assert.areEqual('StageName', opened.view.fields[0].fieldApi, 'Stage appears first');
        Assert.areEqual('CloseDate', opened.view.fields[1].fieldApi, 'Calendar date appears second');
        Assert.areEqual('Amount', opened.view.fields[2].fieldApi, 'Amount appears third');
        Assert.areEqual(CardstackConnectionTypes.normalizeId(String.valueOf(record.Id)), opened.view.recordId, 'Server binds full target identity');
        Assert.isNull(opened.reviewGrant, 'Editing carries no confirmation authority');
        Test.stopTest();
        }
    }
    @IsTest static void draftActionCannotStart() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture();
        Cardstack_Config__c config = [SELECT Id, Value__c FROM Cardstack_Config__c LIMIT 1];
        String unpublished = config.Value__c.replace('edit_opportunity', 'draft_only');
        insert as system new Cardstack_Config_Draft__c(Config__c=config.Id, Draft_Value__c=unpublished, Status__c='Draft');
        Test.startTest();
        CardstackOpportunityEditTypes.Envelope result = CardstackOpportunityEditService.start('claude', record.Id, 'draft_only');
        denied(result, 'ACTION_NOT_PUBLISHED');
        Assert.isNull(result.interactionKey, 'Draft cannot create a launchable interaction');
        Assert.areEqual(0, [SELECT count() FROM Cardstack_Interaction__c WITH SYSTEM_MODE], 'Draft cannot create durable authority');
        Test.stopTest();
        }
    }
    @IsTest static void reviewDoesNoCrmDml() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture();
        CardstackOpportunityEditTypes.Envelope opened = open(record);
        Opportunity before = current(record.Id);
        Test.startTest();
        Integer beforeRows = Limits.getDmlRows();
        CardstackOpportunityEditTypes.Envelope reviewed = review(opened, '12000');
        Integer touchedRows = Limits.getDmlRows() - beforeRows;
        Opportunity after = current(record.Id);
        Assert.areEqual('Review', reviewed.view.status, 'Valid answers must create a durable review');
        Assert.areEqual(2, touchedRows, 'Only one confirmation insert and one interaction update; trial/rollback CRM DML is forbidden');
        Assert.areEqual(before.SystemModstamp, after.SystemModstamp, 'Review must not change target freshness');
        Assert.areEqual(before.StageName, after.StageName, 'Review leaves actual Stage unchanged');
        Assert.areEqual(before.CloseDate, after.CloseDate, 'Review leaves actual date unchanged');
        Assert.areEqual(before.Amount, after.Amount, 'Review leaves actual Amount unchanged');
        Assert.areEqual(1, reviewed.view.diff.size(), 'Only one changed value is reviewed');
        Assert.areEqual('Amount', reviewed.view.diff[0].fieldApi, 'Diff binds the exact submitted field');
        Assert.areEqual('10000', reviewed.view.diff[0].beforeValue, 'Diff uses canonical current decimal');
        Assert.areEqual('12000', reviewed.view.diff[0].afterValue, 'Diff uses canonical reviewed decimal');
        Assert.isNotNull(reviewed.reviewGrant, 'Successful changed review needs private confirmation authority');
        assertNoRawKeys(reviewed);
        Test.stopTest();
        }
    }
    @IsTest static void invalidReviewHasNoGrant() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope opened = open(record);
        Test.startTest();
        CardstackOpportunityEditTypes.Envelope invalid = review(opened, '1e4');
        Assert.areEqual('Editing', invalid.view.status, 'Invalid decimal remains editable');
        Assert.areEqual('INVALID_AMOUNT', invalid.view.errors[0].code, 'Domain grammar denial is preserved safely');
        Assert.isNull(invalid.reviewGrant, 'Rejected answers create no review authority');
        Assert.areEqual(0, [SELECT count() FROM Cardstack_Confirmation__c WITH SYSTEM_MODE], 'Invalid review persists no confirmation');
        Test.stopTest();
        }
    }
    @IsTest static void backAndCancelInvalidateGrant() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope reviewed = review(open(record), '12000');
        assertReview(reviewed);
        Test.startTest();
        CardstackOpportunityEditTypes.Envelope editing = operate(reviewed, 'back');
        Assert.areEqual('Editing', editing.view.status, 'Back returns to editing');
        Assert.isNull(editing.reviewGrant, 'Back cannot carry prior grant');
        Assert.areEqual(0, liveGrants(), 'Back invalidates prior private confirmation');
        CardstackOpportunityEditTypes.Envelope another = review(editing, '13000'); assertReview(another);
        CardstackOpportunityEditTypes.Envelope cancelled = operate(another, 'cancel');
        Assert.areEqual('Cancelled', cancelled.view.status, 'Cancel is terminal');
        Assert.isNull(cancelled.reviewGrant, 'Cancel returns no authority');
        Assert.areEqual(0, liveGrants(), 'Cancel invalidates prior private confirmation');
        CardstackOpportunityEditRepository.LockedInteraction stored = CardstackOpportunityEditRepository.lockOwned('claude', cancelled.interactionKey);
        Assert.isTrue(stored.state.answers == null || stored.state.answers.isEmpty(), 'Cancellation clears private drafts');
        Assert.isNull(stored.state.patch, 'Cancellation clears canonical proposed patch');
        Assert.areEqual(Decimal.valueOf('10000'), current(record.Id).Amount, 'Back/Cancel never save CRM');
        Test.stopTest();
        }
    }
    @IsTest static void absoluteExpiryIsNotExtended() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope opened = open(record);
        Test.startTest();
        CardstackOpportunityEditTypes.Envelope first = operate(opened, 'resume');
        CardstackOpportunityEditTypes.Envelope second = operate(first, 'resume');
        Assert.areEqual(opened.view.expiresAt, first.view.expiresAt, 'Resume preserves initial absolute expiry');
        Assert.areEqual(opened.view.expiresAt, second.view.expiresAt, 'Repeated Resume cannot extend lifetime');
        Assert.areEqual('Editing', second.view.status, 'Resume retrieves latest accepted editing state');
        Test.stopTest();
        }
    }
    @IsTest static void wrongActorCannotResume() {
        User other = otherActor();
        CardstackOpportunityEditTypes.Envelope opened;
        System.runAs(new User(Id=UserInfo.getUserId())) { opened = open(fixture()); }
        CardstackOpportunityEditTypes.Envelope rejected;
        Test.startTest();
        System.runAs(other) { rejected = operate(opened, 'resume'); }
        denied(rejected, 'INVALID_INTERACTION');
        Assert.isNull(rejected.view.recordName, 'Different actor cannot expose CRM name');
        Assert.isTrue(rejected.view.fields == null || rejected.view.fields.isEmpty(), 'Different actor cannot expose inputs');
        Assert.isTrue(rejected.view.diff == null || rejected.view.diff.isEmpty(), 'Different actor cannot expose historical diff');
        Test.stopTest();
    }
    @IsTest static void noOpCompletesWithoutGrant() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope opened = open(record);
        Opportunity before = current(record.Id);
        Integer auditsBefore = [SELECT count() FROM Cardstack_Audit_Log__c WITH SYSTEM_MODE];
        Test.startTest();
        Integer beforeRows = Limits.getDmlRows();
        CardstackOpportunityEditTypes.Envelope result = review(opened, '10000.00');
        Integer touchedRows = Limits.getDmlRows() - beforeRows;
        Opportunity after = current(record.Id);
        Assert.areEqual('Completed', result.view.status, 'Equivalent exact value completes without a save');
        Assert.areEqual('noChanges', result.view.receipt.status, 'No-op receipt distinguishes no CRM effect');
        Assert.isNull(result.reviewGrant, 'No-op never grants confirmation');
        Assert.areEqual(1, touchedRows, 'Only private interaction completion updates; no CRM trial/same-value DML or audit insertion');
        String interactionHash = hash(opened.interactionKey);
        Cardstack_Interaction__c stored = [SELECT State__c FROM Cardstack_Interaction__c WHERE Key_Hash__c=:interactionHash WITH SYSTEM_MODE LIMIT 1];
        Assert.areEqual('Completed', ((Map<String,Object>)JSON.deserializeUntyped(stored.State__c)).get('status'), 'The permitted DML row durably completes the private interaction');
        Assert.areEqual(0, [SELECT count() FROM Cardstack_Confirmation__c WITH SYSTEM_MODE], 'No-op creates no confirmation');
        Assert.areEqual(auditsBefore, [SELECT count() FROM Cardstack_Audit_Log__c WITH SYSTEM_MODE], 'No-op creates no CRM write audit');
        Assert.areEqual(before.SystemModstamp, after.SystemModstamp, 'No-op leaves target freshness unchanged');
        Assert.areEqual(before.StageName, after.StageName, 'No-op leaves actual Stage unchanged');
        Assert.areEqual(before.CloseDate, after.CloseDate, 'No-op leaves actual calendar date unchanged');
        Assert.areEqual(before.Amount, after.Amount, 'No-op leaves actual decimal unchanged');
        Test.stopTest();
        }
    }
    @IsTest static void reviewResumeReissuesSamePatchWithoutExtendingExpiry() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope opened = open(record);
        String interactionHash = hash(opened.interactionKey);
        Cardstack_Interaction__c interaction = [SELECT Id, Expires_At__c, State__c FROM Cardstack_Interaction__c WHERE Key_Hash__c=:interactionHash WITH SYSTEM_MODE LIMIT 1];
        Map<String,Object> stored = (Map<String,Object>)JSON.deserializeUntyped(interaction.State__c);
        interaction.Expires_At__c = wholeSecond(Datetime.now().addMinutes(2)); stored.put('expiresAt', interaction.Expires_At__c);
        interaction.State__c = JSON.serialize(stored); update as system interaction;
        Datetime originalDeadline = [SELECT Expires_At__c FROM Cardstack_Interaction__c WHERE Id=:interaction.Id WITH SYSTEM_MODE LIMIT 1].Expires_At__c;
        CardstackOpportunityEditTypes.Envelope reviewed = review(opened, '12000'); assertReview(reviewed);
        String previousHash = hash(reviewed.reviewGrant);
        Cardstack_Confirmation__c firstGrant = [SELECT Expires_At__c FROM Cardstack_Confirmation__c WHERE Key_Hash__c=:previousHash WITH SYSTEM_MODE LIMIT 1];
        Assert.isTrue(firstGrant.Expires_At__c <= originalDeadline, 'Initial persisted grant must be capped at the shortened original interaction deadline');
        Test.startTest();
        CardstackOpportunityEditTypes.Envelope resumed = operate(reviewed, 'resume'); assertReview(resumed);
        String resumedHash = hash(resumed.reviewGrant);
        Cardstack_Confirmation__c resumedGrant = [SELECT Expires_At__c FROM Cardstack_Confirmation__c WHERE Key_Hash__c=:resumedHash WITH SYSTEM_MODE LIMIT 1];
        Assert.isTrue(resumedGrant.Expires_At__c <= originalDeadline, 'Resumed persisted grant must not extend the original interaction deadline');
        Assert.areEqual(JSON.serialize(reviewed.view.diff), JSON.serialize(resumed.view.diff), 'Resume reissues identical displayed diff');
        Assert.areEqual(reviewed.view.expiresAt, resumed.view.expiresAt, 'Displayed expiry stays unchanged across grant rotation');
        Assert.areEqual(reviewed.view.reviewRevision + 1, resumed.view.reviewRevision, 'Resume requires a fresh explicit Confirm gesture');
        Assert.areNotEqual(reviewed.reviewGrant, resumed.reviewGrant, 'Prior raw grant cannot be recovered/reused');
        Assert.areEqual(1, liveGrants(), 'Exactly one review grant remains active');
        Assert.areEqual(0, [SELECT count() FROM Cardstack_Confirmation__c WHERE Key_Hash__c=:previousHash AND Expires_At__c > :Datetime.now() WITH SYSTEM_MODE], 'Old review authority is invalidated');
        assertNoRawKeys(resumed); Test.stopTest();
        }
    }
    @IsTest static void changedReviewContextReturnsConflictWithoutGrant() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope reviewed = review(open(record), '12000'); assertReview(reviewed);
        record.Amount = Decimal.valueOf('15000'); Database.update(record, AccessLevel.USER_MODE);
        Test.startTest();
        CardstackOpportunityEditTypes.Envelope conflict = operate(reviewed, 'resume');
        Assert.areEqual('Conflict', conflict.view.status, 'Changed target context cannot remint reviewed authority');
        Assert.isNull(conflict.reviewGrant, 'Conflict has no new grant');
        Assert.areEqual(0, liveGrants(), 'Conflict invalidates stale authority'); Test.stopTest();
        }
    }
    @IsTest static void expiredReviewReturnsExpiredWithoutGrant() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope reviewed = review(open(record), '12000'); assertReview(reviewed);
        Cardstack_Interaction__c row = [SELECT Id, Expires_At__c, State__c FROM Cardstack_Interaction__c WITH SYSTEM_MODE LIMIT 1];
        Map<String,Object> stored = (Map<String,Object>)JSON.deserializeUntyped(row.State__c);
        row.Expires_At__c = wholeSecond(Datetime.now().addSeconds(-1)); stored.put('expiresAt', row.Expires_At__c);
        row.State__c = JSON.serialize(stored); update as system row;
        Test.startTest();
        CardstackOpportunityEditTypes.Envelope expired = operate(reviewed, 'resume');
        Assert.areEqual('Expired', expired.view.status, 'Expired review cannot remint authority');
        Assert.isNull(expired.reviewGrant, 'Expired review has no grant'); Test.stopTest();
        }
    }
    @IsTest static void rightsLossHidesReviewFields() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope reviewed = review(open(record), '12000'); assertReview(reviewed);
        CardstackConnectionAccess.userOverride = false;
        Test.startTest();
        CardstackOpportunityEditTypes.Envelope rejected = operate(reviewed, 'resume'); denied(rejected, 'NOT_AUTHORIZED');
        Assert.isNull(rejected.view.recordName, 'Rights loss hides historical record name');
        Assert.isTrue(rejected.view.fields == null || rejected.view.fields.isEmpty(), 'Rights loss hides answers');
        Assert.isTrue(rejected.view.diff == null || rejected.view.diff.isEmpty(), 'Rights loss hides reviewed values');
        Assert.isNull(rejected.view.receipt, 'Rights loss hides receipt'); Test.stopTest();
        }
    }
    @IsTest static void completedNoOpResumeRetrievesReceiptAfterExpiry() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope completed = review(open(record), '10000');
        Assert.areEqual('Completed', completed.view.status, 'Prerequisite no-op completion is real');
        Cardstack_Interaction__c row = [SELECT Id, Expires_At__c FROM Cardstack_Interaction__c WITH SYSTEM_MODE LIMIT 1];
        row.Expires_At__c = Datetime.now().addSeconds(-1); update as system row;
        Test.startTest();
        CardstackOpportunityEditTypes.Envelope resumed = operate(completed, 'resume');
        Assert.areEqual('Completed', resumed.view.status, 'Stored completion remains retrievable after interaction expiry');
        Assert.areEqual(JSON.serialize(completed.view.receipt), JSON.serialize(resumed.view.receipt), 'Completion Resume retrieves original receipt');
        Assert.isNull(resumed.reviewGrant, 'Completion Resume never creates fresh authority'); Test.stopTest();
        }
    }
    @IsTest static void requestExactUtf8BoundaryAccepted() {
        CardstackOpportunityEditTypes.TransitionRequest request = sizedRequest(16384); String failure;
        Test.startTest();
        try { CardstackOpportunityEditService.validateRequestSize(request); }
        catch (CardstackOpportunityEditService.EditException error) { failure = error.getMessage(); }
        Test.stopTest(); Assert.isNull(failure, 'Exactly 16 KiB canonical typed-request UTF-8 is allowed independently of field grammar');
    }
    @IsTest static void confirmRoutesOnlyOwnedReviewedValues() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope reviewed = review(open(record), '12000'); assertReview(reviewed);
        CardstackOpportunityEditTypes.TransitionRequest confirm = request(reviewed, 'confirm');
        confirm.reviewRevision = reviewed.view.reviewRevision; confirm.reviewGrant = reviewed.reviewGrant;
        Test.startTest(); CardstackOpportunityEditTypes.Envelope result = CardstackOpportunityEditService.transition('claude', confirm);
        Assert.areEqual('Completed', result.view.status, 'Service Confirm delegates to the governed atomic writer');
        Assert.areEqual(Decimal.valueOf('12000'), current(record.Id).Amount, 'Consumer route saves only reviewed value');
        Assert.areEqual('saved', result.view.receipt.status, 'Consumer route returns durable saved receipt'); Test.stopTest();
        }
    }
    @IsTest static void confirmCannotReplaceReviewedPatch() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope reviewed = review(open(record), '12000'); assertReview(reviewed);
        CardstackOpportunityEditTypes.TransitionRequest confirm = request(reviewed, 'confirm');
        confirm.reviewRevision = reviewed.view.reviewRevision; confirm.reviewGrant = reviewed.reviewGrant;
        confirm.changes = new List<CardstackOpportunityEditTypes.FieldChange>{CardstackOpportunityEditTestData.change('Amount', 'set', '99999')};
        Test.startTest(); denied(CardstackOpportunityEditService.transition('claude', confirm), 'INVALID_REQUEST');
        Assert.areEqual(Decimal.valueOf('10000'), current(record.Id).Amount, 'Replacement patch can never execute');
        Assert.areEqual(0, [SELECT count() FROM Cardstack_Audit_Log__c WITH SYSTEM_MODE], 'Invalid consumer request creates no save audit'); Test.stopTest();
        }
    }
    @IsTest static void requestOverUtf8BoundaryRejected() {
        CardstackOpportunityEditTypes.TransitionRequest request = sizedRequest(16385);
        Test.startTest();
        try { CardstackOpportunityEditService.validateRequestSize(request); Assert.fail('Over-limit typed request must be rejected'); }
        catch (CardstackOpportunityEditService.EditException error) { Assert.areEqual('REQUEST_TOO_LARGE', error.getMessage(), 'UTF-8 byte budget is distinct from decimal grammar'); }
        Test.stopTest();
    }
    private static CardstackOpportunityEditTypes.TransitionRequest sizedRequest(Integer targetBytes) {
        CardstackOpportunityEditTypes.TransitionRequest value = new CardstackOpportunityEditTypes.TransitionRequest();
        value.operation = 'review'; value.expectedRevision = 1;
        value.changes = new List<CardstackOpportunityEditTypes.FieldChange>{CardstackOpportunityEditTestData.change('Amount', 'set', '')};
        Integer remaining = targetBytes - Blob.valueOf(JSON.serialize(value)).size();
        value.changes[0].value = 'é'.repeat(remaining / 2) + (Math.mod(remaining, 2) == 0 ? '' : 'x');
        Assert.areEqual(targetBytes, Blob.valueOf(JSON.serialize(value)).size(), 'Fixture measures canonical typed JSON UTF-8, not original wire bytes'); return value;
    }
    private static CardstackOpportunityEditTypes.Envelope open(Opportunity record) {
        CardstackOpportunityEditTypes.Envelope result = CardstackOpportunityEditService.start('claude', record.Id, 'edit_opportunity');
        Assert.areEqual('Editing', result.view.status, 'Published accessible Opportunity launch must enter Editing');
        Assert.isNotNull(result.interactionKey, 'Accepted edit must be durably resumable'); return result;
    }
    private static CardstackOpportunityEditTypes.Envelope review(CardstackOpportunityEditTypes.Envelope opened, String amount) {
        CardstackOpportunityEditTypes.TransitionRequest request = request(opened, 'review');
        request.changes = new List<CardstackOpportunityEditTypes.FieldChange>{CardstackOpportunityEditTestData.change('Amount', 'set', amount)};
        return CardstackOpportunityEditService.transition('claude', request);
    }
    private static CardstackOpportunityEditTypes.Envelope operate(CardstackOpportunityEditTypes.Envelope view, String operation) {
        return CardstackOpportunityEditService.transition('claude', request(view, operation));
    }
    private static CardstackOpportunityEditTypes.TransitionRequest request(CardstackOpportunityEditTypes.Envelope result, String operation) {
        CardstackOpportunityEditTypes.TransitionRequest request = new CardstackOpportunityEditTypes.TransitionRequest();
        request.interactionKey = result.interactionKey; request.expectedRevision = operation == 'resume' ? null : result.view.revision;
        request.operation = operation; return request;
    }
    private static void denied(CardstackOpportunityEditTypes.Envelope result, String code) {
        Assert.areEqual('Rejected', result.view.status, 'Rejected request must fail closed');
        Assert.areEqual(code, result.view.errors[0].code, 'Unrelated placeholder cannot satisfy the rejection branch');
        Assert.isNull(result.reviewGrant, 'Denial must carry no confirmation authority');
    }
    private static void assertReview(CardstackOpportunityEditTypes.Envelope result) {
        Assert.areEqual('Review', result.view.status, 'Prerequisite changed review must be accepted');
        Assert.isNotNull(result.reviewGrant, 'Changed review must carry a private actor-bound grant');
    }
    private static Opportunity current(Id recordId) {
        return [SELECT StageName, CloseDate, Amount, SystemModstamp FROM Opportunity WHERE Id=:recordId WITH USER_MODE LIMIT 1];
    }
    private static Integer liveGrants() {
        return [SELECT count() FROM Cardstack_Confirmation__c WHERE Expires_At__c > :Datetime.now() WITH SYSTEM_MODE];
    }
    private static String hash(String key) { return EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256', Blob.valueOf(key))); }
    private static Datetime wholeSecond(Datetime value) {
        return Datetime.newInstanceGmt(value.yearGmt(), value.monthGmt(), value.dayGmt(),
            value.hourGmt(), value.minuteGmt(), value.secondGmt());
    }
    private static void assertNoRawKeys(CardstackOpportunityEditTypes.Envelope envelope) {
        List<Cardstack_Interaction__c> rows = [SELECT State__c FROM Cardstack_Interaction__c WITH SYSTEM_MODE];
        for (Cardstack_Interaction__c row : rows) {
            Assert.isFalse(row.State__c.contains(envelope.interactionKey), 'Raw interaction handle cannot be persisted');
            Assert.isFalse(row.State__c.contains(envelope.reviewGrant), 'Raw review grant cannot be persisted');
        }
    }
    private static Opportunity fixture() {
        CardstackConnectionAccess.userOverride = true;
        insert as system new Cardstack_Config__c(Name='layout:Opportunity:default', Is_Active__c=true,
            Value__c='{"permissions":{"writeEnabled":true},"fields":[{"api":"StageName","editable":true},{"api":"CloseDate","editable":true},{"api":"Amount","editable":true}],"actions":[{"name":"edit_opportunity","label":"Edit Opportunity","enabled":true,"type":"record-edit","mappings":[{"fieldApi":"StageName","source":"current"},{"fieldApi":"CloseDate","source":"current"},{"fieldApi":"Amount","source":"current"}]}]}');
        insert as system new Cardstack_Connection_Setup__c(Client__c='claude', Revision__c=1, Configuration_Digest__c='fixture-setup',
            Configuration__c='{"client":"claude","enabledIntent":true,"publicClientId":"fixture-public-client","callbacks":["https://claude.ai/api/mcp/auth_callback"],"sitePrefix":"/cardstack","packageVersion":"0.1.0.8","transportVersion":"cardstack/v1","uiVersion":"mcp-apps/v1","permissionPolicyRevision":"1"}');
        Opportunity record = CardstackOpportunityEditTestData.insertOpportunity();
        CardstackOpportunityStageProvider.source = new FixtureSource(record.StageName); return record;
    }
    private static User otherActor() {
        User result = new User(Username='task2-'+EncodingUtil.convertToHex(Crypto.generateAesKey(128))+'@example.invalid',
            Email='task2@example.invalid', Alias='task2red', LastName='Task2 other actor',
            TimeZoneSidKey='America/New_York', LocaleSidKey='en_US', EmailEncodingKey='UTF-8',
            LanguageLocaleKey='en_US', ProfileId=UserInfo.getProfileId());
        insert result; return result;
    }
    private with sharing class FixtureSource implements CardstackOpportunityStageProvider.OptionsSource {
        private String stage;
        private FixtureSource(String stage) { this.stage = stage; }
        public CardstackOpportunityEditTypes.StageContext fetch(String objectApi, String recordTypeId) {
            if (objectApi != 'Opportunity') { return null; }
            CardstackOpportunityEditTypes.StageContext result = new CardstackOpportunityEditTypes.StageContext();
            result.recordTypeId = recordTypeId;
            result.choices = new List<CardstackOpportunityEditTypes.Choice>{CardstackOpportunityEditTestData.choice('Current Stage fixture', stage)};
            return result;
        }
    }
}
