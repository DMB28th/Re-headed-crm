/** Behavioral RED: real private state persistence, actor gate and UTF-8 bound. */
@IsTest(SeeAllData=false)
private with sharing class CardstackOpportunityEditRepositoryTest {
    @TestSetup static void grantPackageReadPermissions() {
        CardstackOpportunityEditTestData.grantCurrentActorPackageRead();
    }
    @IsTest static void ownedStateRoundTripsWithoutRawKey() {
        CardstackOpportunityEditTypes.StoredState expected = state();
        String key; String failure;
        Test.startTest();
        try { key = CardstackOpportunityEditRepository.create(expected); }
        catch (CardstackOpportunityEditRepository.RepositoryException error) { failure = error.getMessage(); }
        Assert.isNull(failure, 'A valid tagged state must persist rather than return a scaffold denial');
        Assert.isTrue(key != null && Pattern.matches('[0-9a-f]{64}', key), 'Opaque handle must be random 64-hex');
        CardstackOpportunityEditRepository.LockedInteraction locked = CardstackOpportunityEditRepository.lockOwned('claude', key);
        Assert.areEqual('Editing', locked.state.status, 'Actor can retrieve accepted durable state');
        Assert.areEqual(expected.expiresAt, locked.state.expiresAt, 'Original expiry must round-trip exactly');
        List<Cardstack_Interaction__c> rows = [SELECT Key_Hash__c, State__c FROM Cardstack_Interaction__c WITH SYSTEM_MODE];
        Assert.areEqual(1, rows.size(), 'One interaction is persisted');
        Assert.areEqual(hash(key), rows[0].Key_Hash__c, 'Only the SHA-256 handle hash is stored');
        Assert.isFalse(rows[0].State__c.contains(key), 'Raw handle must never enter state');
        Test.stopTest();
    }
    @IsTest static void savedRevisionIsDurable() {
        CardstackOpportunityEditTypes.StoredState original = state();
        Test.startTest();
        String key = createAccepted(original);
        CardstackOpportunityEditRepository.LockedInteraction locked = CardstackOpportunityEditRepository.lockOwned('claude', key);
        locked.state.revision = 2;
        CardstackOpportunityEditRepository.save(locked, locked.state);
        Assert.areEqual(2, CardstackOpportunityEditRepository.lockOwned('claude', key).state.revision,
            'Latest accepted revision must survive another repository read');
        Test.stopTest();
    }
    @IsTest static void metadataDeadlineExactlyMatchesTaggedState() {
        CardstackOpportunityEditTypes.StoredState value = state();
        Datetime future = Datetime.now().addMinutes(10);
        Datetime requested = Datetime.newInstance(Datetime.newInstanceGmt(future.yearGmt(), future.monthGmt(), future.dayGmt(),
            future.hourGmt(), future.minuteGmt(), future.secondGmt()).getTime() + 777L);
        value.expiresAt = requested;
        Test.startTest();
        String key = createAccepted(value); String keyHash = hash(key);
        Cardstack_Interaction__c row = [SELECT Expires_At__c, State__c FROM Cardstack_Interaction__c
            WHERE Key_Hash__c=:keyHash WITH SYSTEM_MODE LIMIT 1];
        Map<String,Object> serialized = (Map<String,Object>)JSON.deserializeUntyped(row.State__c);
        Datetime tagged = (Datetime)JSON.deserialize(JSON.serialize(serialized.get('expiresAt')), Datetime.class);
        Boolean jsonMatchesAccepted = tagged == value.expiresAt;
        Assert.isTrue(jsonMatchesAccepted, 'deadlineJsonMatchesAccepted='+jsonMatchesAccepted
            +';jsonMinusAcceptedMs='+(tagged.getTime()-value.expiresAt.getTime()));
        Boolean rowMatchesTagged = row.Expires_At__c == tagged;
        Assert.isTrue(rowMatchesTagged, 'deadlineRowMatchesTagged='+rowMatchesTagged
            +';rowMinusTaggedMs='+(row.Expires_At__c.getTime()-tagged.getTime())
            +';rowMillisecond='+row.Expires_At__c.timeGmt().millisecond()
            +';taggedMillisecond='+tagged.timeGmt().millisecond());
        Assert.isTrue(tagged <= requested, 'Persisted canonical deadline must never extend requested lifetime');
        Assert.areEqual(0, tagged.timeGmt().millisecond(), 'Accepted deadline is canonical whole UTC seconds');
        Assert.isTrue(CardstackOpportunityEditRepository.lockOwned('claude', key).state.expiresAt == tagged,
            'Exact accepted deadline survives tagged state restoration and owned lock');
        Test.stopTest();
    }
    @IsTest static void stateKindAndSizeRejected() {
        CardstackOpportunityEditTypes.StoredState invalid = state(); invalid.kind = 'record-edit';
        rejects(invalid, 'INVALID_STATE_KIND');
    }
    @IsTest static void stateExactUtf8BoundaryAccepted() {
        CardstackOpportunityEditTypes.StoredState exact = sizedState(32768);
        Test.startTest();
        String key = createAccepted(exact);
        Assert.isNotNull(key, 'Exactly 32 KiB serialized UTF-8 state must be accepted');
        Test.stopTest();
    }
    @IsTest static void stateOverUtf8BoundaryRejected() { rejects(sizedState(32769), 'STATE_TOO_LARGE'); }
    @IsTest static void otherStateKindCannotResume() {
        CardstackConnectionAccess.userOverride = true;
        setup();
        String key = EncodingUtil.convertToHex(Crypto.generateAesKey(256));
        insert as system new Cardstack_Interaction__c(Key_Hash__c=hash(key), Actor_Id__c=UserInfo.getUserId(),
            Expires_At__c=Datetime.now().addMinutes(15), State__c='{"kind":"record-edit","status":"Editing"}');
        Test.startTest();
        try { CardstackOpportunityEditRepository.lockOwned('claude', key); Assert.fail('Legacy state must never replay through the Opportunity process'); }
        catch (CardstackOpportunityEditRepository.RepositoryException error) {
            Assert.areEqual('INVALID_STATE_KIND', error.getMessage(), 'Owned actor alone does not authorize another state kind');
        }
        Test.stopTest();
    }
    @IsTest static void wrongClientCannotLockState() {
        CardstackOpportunityEditTypes.StoredState original = state();
        Test.startTest(); String key = createAccepted(original);
        try { CardstackOpportunityEditRepository.lockOwned('chatgpt', key); Assert.fail('Named client must remain bound to original interaction'); }
        catch (CardstackOpportunityEditRepository.RepositoryException error) {
            Assert.areEqual('INVALID_INTERACTION', error.getMessage(), 'Cross-client handle replay must fail closed');
        }
        Test.stopTest();
    }
    @IsTest static void missingUserPermissionCannotCreateState() {
        CardstackOpportunityEditTypes.StoredState value = state();
        CardstackConnectionAccess.userOverride = false;
        Test.startTest();
        try {
            CardstackOpportunityEditRepository.create(value);
            Assert.fail('Application permission is required even for private state');
        } catch (CardstackConnectionTypes.ConnectionException error) {
            Assert.areEqual('NOT_AUTHORIZED', error.getMessage(), 'Permission denial must remain bounded');
        }
        Assert.areEqual(0, [SELECT count() FROM Cardstack_Interaction__c WITH SYSTEM_MODE], 'Denied caller persists no state');
        Test.stopTest();
    }
    @IsTest static void lockGrantBindsExactOwnedConfirmation() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        ReviewFixture review = reviewFixture(); String failure; Cardstack_Confirmation__c grant;
        Test.startTest();
        try { grant = CardstackOpportunityEditRepository.lockGrant(review.locked, review.grant); }
        catch (CardstackOpportunityEditRepository.RepositoryException error) { failure = error.getMessage(); }
        Assert.isNull(failure, 'Accepted owned review must lock the exact private confirmation');
        Assert.areEqual(review.locked.state.confirmationId, grant.Id, 'Private confirmation identity binds authority');
        Assert.areEqual(hash(review.grant), grant.Key_Hash__c, 'Exact grant hash must match');
        Assert.areEqual(review.locked.state.recordId, grant.Record_Id__c, 'Locked target matches original interaction');
        Assert.areEqual(hash(CardstackOpportunityEditTypes.reviewSubject(review.locked.state)), grant.Subject_Hash__c, 'Full reviewed subject is retained'); Test.stopTest();
        }
    }
    @IsTest static void lockGrantRejectsAlteredGrant() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        ReviewFixture review = reviewFixture();
        Test.startTest();
        try { CardstackOpportunityEditRepository.lockGrant(review.locked, EncodingUtil.convertToHex(Crypto.generateAesKey(256))); Assert.fail('Altered grant must not lock authority'); }
        catch (CardstackOpportunityEditRepository.RepositoryException error) { Assert.areEqual('INVALID_REVIEW_CONTEXT', error.getMessage(), 'Unrelated scaffold denial cannot satisfy binding'); }
        Cardstack_Confirmation__c original = [SELECT Receipt__c FROM Cardstack_Confirmation__c WHERE Id=:review.locked.state.confirmationId WITH SYSTEM_MODE LIMIT 1];
        Assert.isNull(original.Receipt__c, 'Invalid grant stores no outcome'); Test.stopTest();
        }
    }
    @IsTest static void completionPersistsBothPrivateReceipts() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        ReviewFixture review = reviewFixture(); Cardstack_Confirmation__c grant; String failure;
        try { grant = CardstackOpportunityEditRepository.lockGrant(review.locked, review.grant); }
        catch (CardstackOpportunityEditRepository.RepositoryException error) { failure = error.getMessage(); }
        Assert.isNull(failure, 'Completion prerequisite exact grant lock is available');
        CardstackOpportunityEditTypes.Receipt receipt = new CardstackOpportunityEditTypes.Receipt();
        receipt.reference = 'receipt-'+EncodingUtil.convertToHex(Crypto.generateAesKey(128)); receipt.status = 'saved';
        receipt.actorDisplayName = UserInfo.getName(); receipt.completedAt = Datetime.now().formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\'');
        receipt.diff = review.locked.state.diff; Integer revisionBefore = review.locked.state.revision;
        Test.startTest(); Integer rowsBefore = Limits.getDmlRows();
        CardstackOpportunityEditRepository.complete(review.locked, grant, receipt);
        Assert.areEqual(2, Limits.getDmlRows()-rowsBefore, 'Private persistence owns only confirmation and interaction updates');
        CardstackOpportunityEditTypes.StoredState stored = CardstackOpportunityEditRepository.lockOwned('claude', review.key).state;
        Cardstack_Confirmation__c persisted = [SELECT Receipt__c FROM Cardstack_Confirmation__c WHERE Id=:grant.Id WITH SYSTEM_MODE LIMIT 1];
        Assert.areEqual('Completed', stored.status, 'Private interaction completion is durable');
        Assert.areEqual(revisionBefore+1, stored.revision, 'Completion increments revision exactly once');
        Assert.areEqual(JSON.serialize(receipt), JSON.serialize(stored.receipt), 'Interaction stores original receipt');
        Assert.areEqual(JSON.serialize(receipt), persisted.Receipt__c, 'Confirmation stores the identical receipt');
        Assert.areEqual(Decimal.valueOf('10000'), [SELECT Amount FROM Opportunity WHERE Id=:review.recordId WITH USER_MODE LIMIT 1].Amount, 'Repository never executes CRM writes'); Test.stopTest();
        }
    }
    private with sharing class ReviewFixture {
        private CardstackOpportunityEditRepository.LockedInteraction locked;
        private String key;
        private String grant;
        private Id recordId;
    }
    private static ReviewFixture reviewFixture() {
        CardstackOpportunityEditTypes.StoredState value = state();
        insert as system new Cardstack_Config__c(Name='layout:Opportunity:default', Is_Active__c=true,
            Value__c='{"permissions":{"writeEnabled":true},"fields":[{"api":"StageName","editable":true},{"api":"CloseDate","editable":true},{"api":"Amount","editable":true}],"actions":[{"name":"edit_opportunity","label":"Edit Opportunity","enabled":true,"type":"record-edit","mappings":[{"fieldApi":"StageName","source":"current"},{"fieldApi":"CloseDate","source":"current"},{"fieldApi":"Amount","source":"current"}]}]}');
        CardstackOpportunityStageProvider.source = new ReviewStages((String)value.initialRecord.record.get('StageName'));
        value.initialStages = CardstackOpportunityStageProvider.resolve('Opportunity', CardstackOpportunityEditTypes.getRecordTypeContext(value.initialRecord.record));
        CardstackPolicyService.Policy policy = CardstackPolicyService.resolve('Opportunity');
        value.policyDigest = policy.revision; value.actionDigest = CardstackOpportunityEditTypes.digest(new List<Object>{
            'opportunity-action/v1', JSON.serialize(CardstackRecordActionService.resolve('Opportunity', value.actionName))});
        ReviewFixture result = new ReviewFixture(); result.recordId = (Id)value.recordId; result.key = createAccepted(value);
        result.locked = CardstackOpportunityEditRepository.lockOwned('claude', result.key); value = result.locked.state;
        value.answers.add(CardstackOpportunityEditTestData.change('Amount', 'set', '12000'));
        value.patch = CardstackOpportunityEditDomain.canonicalize(value.initialRecord, value.initialStages,
            CardstackOpportunityEditTypes.restrictPolicy(policy), value.answers);
        value.diff = value.patch.diff; value.revision++; value.reviewRevision = 1; value.status = 'Review';
        result.grant = CardstackOpportunityEditRepository.issueReviewGrant(result.locked, value, CardstackOpportunityEditTypes.reviewSubject(value));
        CardstackOpportunityEditRepository.save(result.locked, value); return result;
    }
    private with sharing class ReviewStages implements CardstackOpportunityStageProvider.OptionsSource {
        private String stage;
        private ReviewStages(String stage) { this.stage = stage; }
        public CardstackOpportunityEditTypes.StageContext fetch(String objectApi, String recordTypeId) {
            CardstackOpportunityEditTypes.StageContext result = new CardstackOpportunityEditTypes.StageContext(); result.recordTypeId = recordTypeId;
            result.choices.add(CardstackOpportunityEditTestData.choice('Fixture Stage', stage)); return result;
        }
    }
    private static String createAccepted(CardstackOpportunityEditTypes.StoredState value) {
        String key; String failure;
        try { key = CardstackOpportunityEditRepository.create(value); }
        catch (CardstackOpportunityEditRepository.RepositoryException error) { failure = error.getMessage(); }
        Assert.isNull(failure, 'Valid tagged bounded state must be accepted');
        Assert.isNotNull(key, 'Valid state needs a resumable private handle'); return key;
    }
    private static void rejects(CardstackOpportunityEditTypes.StoredState value, String code) {
        Test.startTest();
        try { CardstackOpportunityEditRepository.create(value); Assert.fail('Invalid private state must be rejected'); }
        catch (CardstackOpportunityEditRepository.RepositoryException error) {
            Assert.areEqual(code, error.getMessage(), 'Kind/byte-budget denial must be specific');
        }
        Assert.areEqual(0, [SELECT count() FROM Cardstack_Interaction__c WITH SYSTEM_MODE], 'Invalid state persists no rows');
        Test.stopTest();
    }
    private static CardstackOpportunityEditTypes.StoredState sizedState(Integer targetBytes) {
        CardstackOpportunityEditTypes.StoredState value = state();
        value.answers = new List<CardstackOpportunityEditTypes.FieldChange>{CardstackOpportunityEditTestData.change('Amount', 'set', '')};
        Integer remaining = targetBytes - Blob.valueOf(JSON.serialize(value)).size();
        value.answers[0].value = 'é'.repeat(remaining / 2) + (Math.mod(remaining, 2) == 0 ? '' : 'x');
        Assert.areEqual(targetBytes, Blob.valueOf(JSON.serialize(value)).size(), 'Fixture measures serialized UTF-8 bytes');
        return value;
    }
    private static CardstackOpportunityEditTypes.StoredState state() {
        CardstackConnectionAccess.userOverride = true;
        setup();
        Opportunity record = CardstackOpportunityEditTestData.insertOpportunity();
        CardstackOpportunityEditTypes.StoredState result = new CardstackOpportunityEditTypes.StoredState();
        result.schemaVersion = 1; result.kind = 'opportunity-edit-v1'; result.status = 'Editing'; result.revision = 1;
        result.actorId = CardstackConnectionTypes.normalizeId(UserInfo.getUserId());
        result.orgId = CardstackConnectionTypes.normalizeId(UserInfo.getOrganizationId());
        result.client = 'claude'; result.recordId = CardstackConnectionTypes.normalizeId(String.valueOf(record.Id));
        result.actionName = 'edit_opportunity'; result.actionDigest = 'fixture-action';
        result.processVersion = 'opportunity-edit/v1'; result.policyDigest = 'fixture-policy'; result.setupDigest = 'fixture-setup';
        result.setupRevision = 1; result.expiresAt = Datetime.now().addMinutes(15);
        result.initialRecord = CardstackOpportunitySelector.read(record.Id, new Set<String>(), false);
        result.currencyCode = result.initialRecord.currencyCode;
        result.initialStages = new CardstackOpportunityEditTypes.StageContext();
        result.initialStages.recordTypeId = CardstackOpportunityEditTypes.getRecordTypeContext(result.initialRecord.record);
        result.initialStages.choices.add(CardstackOpportunityEditTestData.choice('Current fixture Stage', record.StageName));
        result.initialStages.fingerprint = 'fixture-stage';
        return result;
    }
    private static void setup() {
        if ([SELECT count() FROM Cardstack_Connection_Setup__c WITH SYSTEM_MODE] != 0) { return; }
        insert as system new List<Cardstack_Connection_Setup__c>{
            new Cardstack_Connection_Setup__c(Client__c='claude', Revision__c=1, Configuration_Digest__c='fixture-setup',
                Configuration__c='{"client":"claude","enabledIntent":true}'),
            new Cardstack_Connection_Setup__c(Client__c='chatgpt', Revision__c=1, Configuration_Digest__c='fixture-setup',
                Configuration__c='{"client":"chatgpt","enabledIntent":true}')};
    }
    private static String hash(String key) {
        return EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256', Blob.valueOf(key)));
    }
}
