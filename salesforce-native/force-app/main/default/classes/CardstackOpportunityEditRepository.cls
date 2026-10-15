/** Actor-gated private store. Setup, interaction and confirmation locks have one order. */
public without sharing class CardstackOpportunityEditRepository {
    private static final String KIND = 'opportunity-edit-v1';
    // Test-only faults fail required persistence; production never bypasses a write.
    @TestVisible private static Boolean failComplete = false;
    @TestVisible private static Integer completionAttempts = 0;
    /** Private row ownership never becomes a renderer or tool capability. */
    public with sharing class LockedInteraction {
        private Cardstack_Interaction__c row;
        private String identityDigest;
        private Integer acceptedRevision;
        private Id acceptedConfirmationId;
        private String acceptedStatus;
        private Integer acceptedReviewRevision;
        private String acceptedPatchBinding;
        private String acceptedGrantBinding;
        private Cardstack_Connection_Setup__c setup;
        public CardstackOpportunityEditTypes.StoredState state;
    }
    /**
     * @param state Server-constructed tagged state with the original absolute expiry.
     * @return Random 256-bit opaque key; only SHA-256 is persisted.
     */
    public static String create(CardstackOpportunityEditTypes.StoredState state) {
        CardstackConnectionAccess.requireUser();
        serializeState(state);
        requireOwner(state, state == null ? null : state.client);
        if (state.expiresAt == null || state.expiresAt <= Datetime.now()
            || state.expiresAt > Datetime.now().addMinutes(15) || state.revision != 1 || state.status != 'Editing'
            || state.confirmationId != null || state.receipt != null) { throw new RepositoryException('INVALID_STATE'); }
        // Native DateTime fields persist whole seconds. Floor once before persisted JSON,
        // row or subject binding; restoration still requires the exact accepted deadline.
        Datetime deadline = state.expiresAt;
        state.expiresAt = Datetime.newInstanceGmt(deadline.yearGmt(), deadline.monthGmt(), deadline.dayGmt(),
            deadline.hourGmt(), deadline.minuteGmt(), deadline.secondGmt());
        if (state.expiresAt <= Datetime.now()) { throw new RepositoryException('INVALID_STATE'); }
        String serialized = serializeState(state);
        Cardstack_Connection_Setup__c setup = lockSetup(state.client);
        requireSetup(setup, state);
        CardstackOpportunityEditTypes.RecordContext current = requireNativeRights(state);
        if (state.initialRecord.freshness == null || !state.initialRecord.freshness.equals(current.freshness)) {
            throw new RepositoryException('CONTEXT_CHANGED');
        }
        String key = EncodingUtil.convertToHex(Crypto.generateAesKey(256));
        try {
            insert as system new Cardstack_Interaction__c(Key_Hash__c=hash(key), Actor_Id__c=state.actorId,
                Expires_At__c=state.expiresAt, State__c=serialized);
        } catch (DmlException error) { throw new RepositoryException('STATE_UNAVAILABLE', error); }
        return key;
    }
    /**
     * @param client Named client, locked before the owned interaction.
     * @param key Host-mediated private handle.
     * @return Owned tagged state; CRM rights are revalidated before any view/write.
     */
    public static LockedInteraction lockOwned(String client, String key) {
        CardstackConnectionAccess.requireUser(); CardstackConnectionTypes.requireClient(client);
        if (key == null || !Pattern.matches('[0-9a-f]{64}', key)) { throw new RepositoryException('INVALID_INTERACTION'); }
        Cardstack_Connection_Setup__c setup = lockSetup(client);
        String keyHash = hash(key), actor = currentActor();
        List<Cardstack_Interaction__c> rows = [SELECT Id, Actor_Id__c, Expires_At__c, State__c
            FROM Cardstack_Interaction__c WHERE Key_Hash__c=:keyHash AND Actor_Id__c=:actor WITH SYSTEM_MODE LIMIT 1 FOR UPDATE];
        if (rows.isEmpty()) { throw new RepositoryException('INVALID_INTERACTION'); }
        CardstackOpportunityEditTypes.StoredState state = restore(rows[0].State__c);
        requireOwner(state, client); requireSetup(setup, state);
        if (state.expiresAt == null || (state.status != 'Completed' && rows[0].Expires_At__c != state.expiresAt)) {
            throw new RepositoryException('INVALID_STATE');
        }
        LockedInteraction result = new LockedInteraction(); result.row = rows[0]; result.setup = setup;
        result.state = state; result.identityDigest = identity(state); result.acceptedRevision = state.revision;
        result.acceptedConfirmationId = state.confirmationId; result.acceptedStatus = state.status;
        result.acceptedReviewRevision = state.reviewRevision == null ? 0 : state.reviewRevision;
        result.acceptedPatchBinding = patchBinding(state.patch); return result;
    }
    /**
     * @param interaction Owned locked interaction.
     * @param state Next accepted state; identity and original deadline cannot change.
     */
    public static void save(LockedInteraction interaction, CardstackOpportunityEditTypes.StoredState state) {
        requireLocked(interaction, state); requireNativeRights(state);
        String serialized = serializeState(state);
        if (state.revision == null || state.revision != interaction.acceptedRevision + 1
            || state.confirmationId != interaction.acceptedConfirmationId) { throw new RepositoryException('INVALID_STATE'); }
        interaction.row.State__c = serialized;
        try { update as system interaction.row; }
        catch (DmlException error) { throw new RepositoryException('STATE_UNAVAILABLE', error); }
        interaction.acceptedRevision = state.revision; interaction.state = state;
        interaction.acceptedStatus = state.status; interaction.acceptedReviewRevision = state.reviewRevision == null ? 0 : state.reviewRevision;
        interaction.acceptedPatchBinding = patchBinding(state.patch);
    }
    /**
     * @param interaction Validated owned lock; no caller-supplied row or grant identity.
     * @param state Current revalidated review with pinned canonical values.
     * @param subject Deterministic binding independently recomputed here.
     * @return Ephemeral raw grant; only its SHA-256 and private row ID are persisted.
     */
    public static String issueReviewGrant(LockedInteraction interaction, CardstackOpportunityEditTypes.StoredState state, String subject) {
        requireLocked(interaction, state); requireNativeRights(state);
        if (state.status != 'Review' || state.patch == null || state.patch.entries.isEmpty()
            || state.revision != interaction.acceptedRevision + 1 || state.reviewRevision == null
            || state.reviewRevision != interaction.acceptedReviewRevision + 1
            || !new Set<String>{'Editing', 'Review'}.contains(interaction.acceptedStatus)
            || (interaction.acceptedStatus == 'Review' && !interaction.acceptedPatchBinding.equals(patchBinding(state.patch)))
            || state.confirmationId != null || interaction.acceptedConfirmationId != null
            || subject == null || !subject.equals(CardstackOpportunityEditTypes.reviewSubject(state))) {
            throw new RepositoryException('INVALID_REVIEW_CONTEXT');
        }
        requirePublishedReview(state);
        Datetime expires = Datetime.now().addMinutes(15);
        if (state.expiresAt < expires) { expires = state.expiresAt; }
        if (interaction.row.Expires_At__c < expires) { expires = interaction.row.Expires_At__c; }
        if (expires <= Datetime.now()) { throw new RepositoryException('EXPIRED'); }
        String key = EncodingUtil.convertToHex(Crypto.generateAesKey(256));
        Cardstack_Confirmation__c row = new Cardstack_Confirmation__c(Key_Hash__c=hash(key), Subject_Hash__c=hash(subject),
            Actor_Id__c=currentActor(), Record_Id__c=state.recordId,
            Record_Version__c=hash(state.initialRecord.freshness), Expires_At__c=expires);
        try { insert as system row; }
        catch (DmlException error) { throw new RepositoryException('STATE_UNAVAILABLE', error); }
        state.confirmationId = row.Id; interaction.acceptedConfirmationId = row.Id; return key;
    }
    /**
     * @param interaction Validated owned interaction, locked before confirmation.
     * @param state Next accepted state; invalidation cannot grant CRM authority.
     */
    public static void invalidateReviewGrant(LockedInteraction interaction, CardstackOpportunityEditTypes.StoredState state) {
        requireLocked(interaction, state); requireNativeRights(state);
        Id confirmationId = interaction.acceptedConfirmationId;
        if (state.confirmationId != confirmationId) { throw new RepositoryException('INVALID_STATE'); }
        if (confirmationId == null) { return; }
        String actor = currentActor();
        List<Cardstack_Confirmation__c> rows = [SELECT Id, Actor_Id__c, Record_Id__c, Expires_At__c
            FROM Cardstack_Confirmation__c WHERE Id=:confirmationId AND Actor_Id__c=:actor WITH SYSTEM_MODE LIMIT 1 FOR UPDATE];
        if (rows.size() != 1 || !state.recordId.equals(rows[0].Record_Id__c)) { throw new RepositoryException('INVALID_REVIEW_CONTEXT'); }
        rows[0].Expires_At__c = Datetime.now().addSeconds(-1);
        try { update as system rows[0]; }
        catch (DmlException error) { throw new RepositoryException('STATE_UNAVAILABLE', error); }
        state.confirmationId = null; interaction.acceptedConfirmationId = null;
    }
    /**
     * @param interaction Actor-owned private interaction locked before confirmation.
     * @param rawGrant Ephemeral grant; only its hash is compared or retained.
     * @return Exact owned private row, locked before the Opportunity.
     */
    public static Cardstack_Confirmation__c lockGrant(LockedInteraction interaction, String rawGrant) {
        CardstackOpportunityEditTypes.StoredState state = interaction == null ? null : interaction.state;
        requireLocked(interaction, state);
        if (state.confirmationId == null || state.confirmationId != interaction.acceptedConfirmationId
            || state.revision != interaction.acceptedRevision || state.reviewRevision != interaction.acceptedReviewRevision
            || (state.status != 'Review' && (state.status != 'Completed' || state.receipt == null || state.receipt.status != 'saved'))
            || rawGrant == null || !Pattern.matches('[0-9a-f]{64}', rawGrant)) { throw new RepositoryException('INVALID_REVIEW_CONTEXT'); }
        Id confirmationId = interaction.acceptedConfirmationId; String actor = currentActor();
        List<Cardstack_Confirmation__c> rows = [SELECT Id, Key_Hash__c, Subject_Hash__c, Actor_Id__c,
            Record_Id__c, Record_Version__c, Expires_At__c, Receipt__c FROM Cardstack_Confirmation__c
            WHERE Id=:confirmationId AND Actor_Id__c=:actor WITH SYSTEM_MODE LIMIT 1 FOR UPDATE];
        if (rows.size() != 1 || !hash(rawGrant).equals(rows[0].Key_Hash__c)
            || !state.recordId.equals(rows[0].Record_Id__c)
            || !hash(state.initialRecord.freshness).equals(rows[0].Record_Version__c)) {
            throw new RepositoryException('INVALID_REVIEW_CONTEXT');
        }
        Cardstack_Confirmation__c grant = rows[0];
        if (state.status == 'Completed') {
            requireGrantSubject(state, grant, state.revision-1);
            if (grant.Receipt__c == null || !grant.Receipt__c.equals(JSON.serialize(state.receipt))
                || !JSON.serialize(state.diff).equals(JSON.serialize(state.receipt.diff))) { throw new RepositoryException('INVALID_REVIEW_CONTEXT'); }
        } else {
            if (grant.Receipt__c != null || grant.Expires_At__c == null || grant.Expires_At__c > state.expiresAt) {
                throw new RepositoryException('INVALID_REVIEW_CONTEXT');
            }
            if (grant.Expires_At__c <= Datetime.now() || state.expiresAt <= Datetime.now()) { throw new RepositoryException('EXPIRED'); }
        }
        interaction.acceptedGrantBinding = grantBinding(grant); return grant;
    }
    /** Read-only completed recovery checks the actor-owned consumed grant without needing its raw key. */
    public static void requireCompletedReceipt(LockedInteraction interaction) {
        CardstackOpportunityEditTypes.StoredState state=interaction==null?null:interaction.state; requireLocked(interaction,state);
        if(state.status!='Completed' || state.receipt==null) throw new RepositoryException('INVALID_REVIEW_CONTEXT');
        if(state.receipt.status=='noChanges') {
            if(state.confirmationId!=null || state.patch==null || state.patch.entries==null || !state.patch.entries.isEmpty() || !state.diff.isEmpty() || state.receipt.diff==null || !state.receipt.diff.isEmpty()) throw new RepositoryException('INVALID_REVIEW_CONTEXT');
            return;
        }
        if(state.receipt.status!='saved' || state.confirmationId==null || state.confirmationId!=interaction.acceptedConfirmationId) throw new RepositoryException('INVALID_REVIEW_CONTEXT');
        Id confirmationId=state.confirmationId; String actor=currentActor();
        List<Cardstack_Confirmation__c> rows=[SELECT Id,Subject_Hash__c,Record_Id__c,Record_Version__c,Receipt__c FROM Cardstack_Confirmation__c WHERE Id=:confirmationId AND Actor_Id__c=:actor WITH SYSTEM_MODE LIMIT 1 FOR UPDATE];
        if(rows.size()!=1 || !state.recordId.equals(rows[0].Record_Id__c) || !hash(state.initialRecord.freshness).equals(rows[0].Record_Version__c) || rows[0].Receipt__c==null || !rows[0].Receipt__c.equals(JSON.serialize(state.receipt)) || !JSON.serialize(state.diff).equals(JSON.serialize(state.receipt.diff))) throw new RepositoryException('INVALID_REVIEW_CONTEXT');
        requireGrantSubject(state,rows[0],state.revision-1);
    }
    /**
     * @param interaction Owned locked interaction; completion will preserve identity.
     * @param grant Owned locked private grant, never a caller-selected target.
     * @param receipt Server-owned immutable saved outcome.
     */
    public static void complete(LockedInteraction interaction, Cardstack_Confirmation__c grant, CardstackOpportunityEditTypes.Receipt receipt) {
        complete(interaction,grant,receipt,null,null);
    }
    /** Complete with the exact capability/read verified under the native record lock before DML. */
    public static void complete(LockedInteraction interaction,Cardstack_Confirmation__c grant,CardstackOpportunityEditTypes.Receipt receipt,
        CardstackRecordScreenCapability.Definition capability,CardstackOpportunityEditTypes.RecordContext current) {
        CardstackOpportunityEditTypes.StoredState state = interaction == null ? null : interaction.state;
        requireLocked(interaction, state);
        if(CardstackRecordScreenCapability.isNative(state)) {
            if(capability==null) throw new RepositoryException('INVALID_STATE');
            CardstackRecordScreenCapability.validateVerifiedContext(state,capability,current);
            if(!state.initialRecord.freshness.equals(current.freshness)) throw new RepositoryException('CONTEXT_CHANGED');
        } else {
            if(capability!=null) throw new RepositoryException('INVALID_STATE');
            requireNativeRights(state);
        }
        if (interaction.acceptedStatus != 'Review' || state.status != 'Review' || state.revision != interaction.acceptedRevision
            || state.reviewRevision != interaction.acceptedReviewRevision || state.confirmationId != interaction.acceptedConfirmationId
            || grant == null || grant.Id != interaction.acceptedConfirmationId || interaction.acceptedGrantBinding == null
            || !interaction.acceptedGrantBinding.equals(grantBinding(grant))
            || !interaction.acceptedPatchBinding.equals(patchBinding(state.patch))
            || receipt == null || receipt.status != 'saved' || String.isBlank(receipt.reference)
            || receipt.actorDisplayName != UserInfo.getName() || String.isBlank(receipt.completedAt)
            || !JSON.serialize(state.diff).equals(JSON.serialize(receipt.diff))) { throw new RepositoryException('INVALID_REVIEW_CONTEXT'); }
        requireGrantSubject(state, grant, state.revision);
        if (grant.Receipt__c != null || grant.Expires_At__c <= Datetime.now() || state.expiresAt <= Datetime.now()) {
            throw new RepositoryException('EXPIRED');
        }
        if (Test.isRunningTest()) {
            completionAttempts++;
            if (failComplete) { throw new RepositoryException('STATE_UNAVAILABLE'); }
        }
        state.status = 'Completed'; state.receipt = receipt; state.revision++;
        interaction.row.State__c = serializeState(state); grant.Receipt__c = JSON.serialize(receipt);
        try { update as system grant; update as system interaction.row; }
        catch (DmlException error) { throw new RepositoryException('STATE_UNAVAILABLE', error); }
        interaction.acceptedStatus = state.status; interaction.acceptedRevision = state.revision;
        interaction.acceptedGrantBinding = grantBinding(grant);
    }
    private static void requireGrantSubject(CardstackOpportunityEditTypes.StoredState state, Cardstack_Confirmation__c grant, Integer revision) {
        if (grant.Subject_Hash__c == null || !hash(CardstackOpportunityEditTypes.reviewSubject(state, revision)).equals(grant.Subject_Hash__c)) {
            throw new RepositoryException('INVALID_REVIEW_CONTEXT');
        }
    }
    private static String grantBinding(Cardstack_Confirmation__c grant) {
        return CardstackOpportunityEditTypes.digest(new List<Object>{grant.Id, grant.Key_Hash__c, grant.Subject_Hash__c,
            grant.Actor_Id__c, grant.Record_Id__c, grant.Record_Version__c, grant.Expires_At__c, grant.Receipt__c});
    }
    private static void requirePublishedReview(CardstackOpportunityEditTypes.StoredState state) {
        if(CardstackRecordScreenCapability.isFlow(state)){CardstackFlowPublication.invalidateOperations();CardstackFlowService.validateReviewState(state);}
        if (CardstackRecordScreenCapability.isNative(state)) {
            CardstackRecordScreenCapability.Definition definition=CardstackRecordScreenCapability.resolveDefinition(state);
            CardstackRecordScreenCapability.validateCapabilityContext(state,definition);
            CardstackOpportunityEditTypes.RecordContext current=CardstackRecordScreenCapability.readContext((Id)state.recordId,definition,false);
            if (!state.initialRecord.freshness.equals(current.freshness)) throw new RepositoryException('CONTEXT_CHANGED');
            CardstackOpportunityEditTypes.CanonicalPatch canonical=CardstackRecordScreenCapability.canonicalize(state.initialRecord,definition,state.answers);
            if (!patchBinding(state.patch).equals(patchBinding(canonical)) || !JSON.serialize(state.diff).equals(JSON.serialize(canonical.diff))) throw new RepositoryException('INVALID_REVIEW_CONTEXT');
            return;
        }
        CardstackPolicyService.Policy policy = CardstackPolicyService.resolve('Opportunity');
        CardstackRecordActionService.Definition action = CardstackRecordActionService.resolve('Opportunity', state.actionName);
        String actionDigest = CardstackOpportunityEditTypes.digest(new List<Object>{'opportunity-action/v1', JSON.serialize(action)});
        if (!state.policyDigest.equals(policy.revision) || !state.actionDigest.equals(actionDigest)) {
            throw new RepositoryException('CONTEXT_CHANGED');
        }
        Set<String> fields = new Set<String>(state.initialRecord.record.getPopulatedFieldsAsMap().keySet());
        CardstackOpportunityEditTypes.RecordContext current = CardstackOpportunitySelector.read((Id)state.recordId, fields, false);
        CardstackOpportunityEditTypes.StageContext stages = CardstackOpportunityStageProvider.resolve('Opportunity',
            CardstackOpportunityEditTypes.getRecordTypeContext(current.record));
        if (!state.initialRecord.freshness.equals(current.freshness) || !state.currencyCode.equals(current.currencyCode)
            || !state.initialStages.fingerprint.equals(stages.fingerprint)) { throw new RepositoryException('CONTEXT_CHANGED'); }
        CardstackOpportunityEditTypes.CanonicalPatch canonical = CardstackOpportunityEditDomain.canonicalize(
            state.initialRecord, stages, CardstackOpportunityEditTypes.restrictPolicy(policy), state.answers);
        if (!patchBinding(state.patch).equals(patchBinding(canonical))
            || !JSON.serialize(state.diff).equals(JSON.serialize(canonical.diff))) { throw new RepositoryException('INVALID_REVIEW_CONTEXT'); }
    }
    private static void requireLocked(LockedInteraction interaction, CardstackOpportunityEditTypes.StoredState state) {
        CardstackConnectionAccess.requireUser();
        if (interaction == null || interaction.row == null || interaction.identityDigest == null || state == null) {
            throw new RepositoryException('INVALID_INTERACTION');
        }
        requireOwner(state, state.client); requireSetup(interaction.setup, state);
        if (!currentActor().equals(interaction.row.Actor_Id__c) || !interaction.identityDigest.equals(identity(state))) {
            throw new RepositoryException('INVALID_STATE');
        }
    }
    private static CardstackOpportunityEditTypes.RecordContext requireNativeRights(CardstackOpportunityEditTypes.StoredState state) {
        if (state.initialRecord == null || state.initialRecord.record == null) { throw new RepositoryException('INVALID_STATE'); }
        if (CardstackRecordScreenCapability.isNative(state)) {
            if (state.initialRecord.record.getSObjectType()!=CardstackRecordScreenCapability.recordType((Id)state.recordId) || state.initialRecord.record.Id==null
                || !state.recordId.equals(CardstackConnectionTypes.normalizeId(String.valueOf(state.initialRecord.record.Id)))) throw new RepositoryException('INVALID_STATE');
            CardstackRecordScreenCapability.Definition definition=CardstackRecordScreenCapability.resolveDefinition(state);
            CardstackRecordScreenCapability.validateCapabilityContext(state,definition);
            return CardstackRecordScreenCapability.readContext((Id)state.recordId,definition,false);
        }
        if (state.initialRecord.record.Id == null || !state.recordId.equals(CardstackConnectionTypes.normalizeId(String.valueOf(state.initialRecord.record.Id)))
            || state.currencyCode == null || !state.currencyCode.equals(state.initialRecord.currencyCode)) { throw new RepositoryException('INVALID_STATE'); }
        for (String field : new List<String>{'StageName', 'CloseDate', 'Amount'}) {
            Schema.DescribeFieldResult describe = Opportunity.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED).fields.getMap().get(field).getDescribe();
            if (!describe.isAccessible() || !describe.isUpdateable()) { throw new RepositoryException('FIELD_NOT_EDITABLE'); }
        }
        if (!Opportunity.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED).isUpdateable()) { throw new RepositoryException('FIELD_NOT_EDITABLE'); }
        return CardstackOpportunitySelector.read((Id)state.recordId,
            new Set<String>(state.initialRecord.record.getPopulatedFieldsAsMap().keySet()), false);
    }
    private static Cardstack_Connection_Setup__c lockSetup(String client) {
        CardstackConnectionTypes.requireClient(client);
        List<Cardstack_Connection_Setup__c> rows = [SELECT Id, Client__c, Revision__c, Configuration__c, Configuration_Digest__c
            FROM Cardstack_Connection_Setup__c WHERE Client__c=:client WITH SYSTEM_MODE LIMIT 1 FOR UPDATE];
        if (rows.isEmpty()) { throw new RepositoryException('SETUP_UNAVAILABLE'); }
        return rows[0];
    }
    private static void requireSetup(Cardstack_Connection_Setup__c setup, CardstackOpportunityEditTypes.StoredState state) {
        if (setup == null || !state.client.equals(setup.Client__c) || setup.Revision__c == null) {
            throw new RepositoryException('SETUP_UNAVAILABLE');
        }
        Map<String,Object> configuration;
        try { configuration = (Map<String,Object>)JSON.deserializeUntyped(setup.Configuration__c); }
        catch (JSONException error) { throw new RepositoryException('SETUP_UNAVAILABLE', error); }
        if (configuration == null || configuration.get('enabledIntent') != true
            || !state.client.equals((String)configuration.get('client'))) { throw new RepositoryException('EDIT_DISABLED'); }
        if (state.setupDigest == null || !state.setupDigest.equals(setup.Configuration_Digest__c)
            || state.setupRevision != setup.Revision__c.intValue()) { throw new RepositoryException('CONTEXT_CHANGED'); }
    }
    private static void requireOwner(CardstackOpportunityEditTypes.StoredState state, String client) {
        requireKind(state);
        if (state.actorId == null || !state.actorId.equals(currentActor()) || state.orgId == null
            || !state.orgId.equals(CardstackConnectionTypes.normalizeId(UserInfo.getOrganizationId()))
            || state.client == null || !state.client.equals(client)) { throw new RepositoryException('INVALID_INTERACTION'); }
        CardstackConnectionTypes.requireClient(client);
        try {
            if (state.recordId == null || !state.recordId.equals(CardstackConnectionTypes.normalizeId(state.recordId))
                || ((Id)state.recordId).getSObjectType() != (CardstackRecordScreenCapability.isNative(state) ? CardstackRecordScreenCapability.canonicalType(state.objectApiName) : Opportunity.SObjectType)) { throw new RepositoryException('INVALID_STATE'); }
        } catch (TypeException error) { throw new RepositoryException('INVALID_STATE', error); }
    }
    private static String identity(CardstackOpportunityEditTypes.StoredState state) {
        if (CardstackRecordScreenCapability.isNative(state)) {
            if(CardstackRecordScreenCapability.isFlow(state))return CardstackOpportunityEditTypes.digest(new List<Object>{state.schemaVersion,state.kind,state.objectApiName,state.capabilityVersion,state.orderedFields,state.capabilityFingerprint,state.capabilityMetadataFingerprint,state.actorId,state.orgId,state.client,state.recordId,state.recordName,state.actionName,state.actionDigest,state.processVersion,state.policyDigest,state.setupDigest,state.setupRevision,state.expiresAt,JSON.serialize(state.initialRecord),state.flowApiName,state.flowPublicationRevision,state.flowPlanHash,state.flowSourceHash,state.flowCompilerVersion,state.flowSchemaVersion});
            if(state.schemaVersion==4) return CardstackOpportunityEditTypes.digest(new List<Object>{state.schemaVersion,state.kind,state.objectApiName,
                state.capabilityVersion,state.orderedFields,state.capabilityFingerprint,state.capabilityMetadataFingerprint,state.actorId,state.orgId,state.client,
                state.recordId,state.recordName,state.actionName,state.actionDigest,state.processVersion,state.policyDigest,
                state.setupDigest,state.setupRevision,state.expiresAt,JSON.serialize(state.initialRecord)});
            return CardstackOpportunityEditTypes.digest(new List<Object>{state.schemaVersion,state.kind,state.objectApiName,
                state.capabilityVersion,state.orderedFields,state.capabilityFingerprint,state.actorId,state.orgId,state.client,
                state.recordId,state.recordName,state.actionName,state.actionDigest,state.processVersion,state.policyDigest,
                state.setupDigest,state.setupRevision,state.expiresAt,JSON.serialize(state.initialRecord)});
        }
        return CardstackOpportunityEditTypes.digest(new List<Object>{state.schemaVersion, state.kind, state.actorId, state.orgId,
            state.client, state.recordId, state.recordName, state.actionName, state.actionDigest, state.processVersion,
            state.policyDigest, state.setupDigest, state.setupRevision, state.expiresAt,
            JSON.serialize(state.initialRecord), JSON.serialize(state.initialStages), state.currencyCode});
    }
    private static String patchBinding(CardstackOpportunityEditTypes.CanonicalPatch patch) {
        if (patch == null) { return ''; }
        return CardstackOpportunityEditTypes.digest(new List<Object>{patch.digest, JSON.serialize(patch.entries), JSON.serialize(patch.diff)});
    }
    private static void requireKind(CardstackOpportunityEditTypes.StoredState state) {
        if (CardstackRecordScreenCapability.isNative(state)) {
            if ((state.schemaVersion==2 && (!'Contact'.equals(state.objectApiName) || !CardstackRecordScreenCapability.VERSION.equals(state.capabilityVersion) || !'record-edit/v1'.equals(state.processVersion)))
                || (state.schemaVersion==3 && (!CardstackRecordScreenCapability.LEGACY_CURRENT_VERSION.equals(state.capabilityVersion) || !'record-edit/v2'.equals(state.processVersion) || String.isBlank(state.objectApiName)))
                || (state.schemaVersion==5 && (!'screen-flow/v1'.equals(state.processVersion) || String.isBlank(state.flowApiName) || String.isBlank(state.flowPublicationRevision) || String.isBlank(state.flowPlanHash) || state.flowSchemaVersion!=CardstackFlowPlan.SCHEMA || state.flowCompilerVersion!=CardstackFlowPlan.COMPILER || String.isBlank(state.flowStateJson)))
                || (state.schemaVersion==4 && (!CardstackRecordScreenCapability.CURRENT_VERSION.equals(state.capabilityVersion) || !'record-edit/v3'.equals(state.processVersion) || String.isBlank(state.objectApiName) || String.isBlank(state.capabilityMetadataFingerprint))) || state.orderedFields==null || state.orderedFields.isEmpty()
                || state.orderedFields.size()>20 || String.isBlank(state.capabilityFingerprint)) throw new RepositoryException('INVALID_STATE_KIND');
            return;
        }
        if (state == null || state.kind == null || !state.kind.equals(KIND) || state.schemaVersion != 1
            || state.processVersion == null || !state.processVersion.equals('opportunity-edit/v1')) {
            throw new RepositoryException('INVALID_STATE_KIND');
        }
    }
    private static String serializeState(CardstackOpportunityEditTypes.StoredState state) {
        String serialized = JSON.serialize(state);
        if (Blob.valueOf(serialized).size() > 32768) { throw new RepositoryException('STATE_TOO_LARGE'); }
        requireKind(state); requireStateShape(state); return serialized;
    }
    /** Remove Object-valued members before typed restoration; only the Domain rederives executable values. */
    private static CardstackOpportunityEditTypes.StoredState restore(String serialized) {
        if (serialized == null || Blob.valueOf(serialized).size() > 32768) { throw new RepositoryException('STATE_TOO_LARGE'); }
        try {
            Map<String,Object> body = (Map<String,Object>)JSON.deserializeUntyped(serialized);
            if (body == null || !((body.get('kind') == KIND && body.get('schemaVersion') == 1) || (body.get('kind')=='screen-flow-v1' && body.get('schemaVersion')==5) || (body.get('kind') == 'record-edit-v1' && (body.get('schemaVersion') == 2 || body.get('schemaVersion') == 3 || body.get('schemaVersion') == 4)))) { throw new RepositoryException('INVALID_STATE_KIND'); }
            Object initial = body.remove('initialRecord'), patch = body.remove('patch');
            CardstackOpportunityEditTypes.StoredState state = (CardstackOpportunityEditTypes.StoredState)JSON.deserializeStrict(JSON.serialize(body), CardstackOpportunityEditTypes.StoredState.class);
            if (initial != null) {
                Map<String,Object> context = (Map<String,Object>)initial;
                requireKeys(context, new Set<String>{'record', 'currencyCode', 'freshness'});
                state.initialRecord = new CardstackOpportunityEditTypes.RecordContext();
                state.initialRecord.currencyCode = (String)context.get('currencyCode'); state.initialRecord.freshness = (String)context.get('freshness');
                // The registered canonical type chooses restoration, never JSON attributes.type.
                if (CardstackRecordScreenCapability.isNative(state)) state.initialRecord.record=CardstackRecordScreenCapability.restoreRecord(state,(Map<String,Object>)context.get('record'));
                else state.initialRecord.record = (Opportunity)JSON.deserializeStrict(JSON.serialize(context.get('record')), Opportunity.class);
            }
            if (patch != null) {
                Map<String,Object> canonical = (Map<String,Object>)patch;
                requireKeys(canonical, new Set<String>{'entries', 'typedValues', 'diff', 'digest'});
                state.patch = new CardstackOpportunityEditTypes.CanonicalPatch();
                state.patch.entries = (List<CardstackPreviewUpdateAction.PatchEntry>)JSON.deserializeStrict(JSON.serialize(canonical.get('entries')), List<CardstackPreviewUpdateAction.PatchEntry>.class);
                state.patch.diff = (List<CardstackOpportunityEditTypes.DiffRow>)JSON.deserializeStrict(JSON.serialize(canonical.get('diff')), List<CardstackOpportunityEditTypes.DiffRow>.class);
                state.patch.digest = (String)canonical.get('digest');
            }
            requireKind(state); requireStateShape(state); return state;
        } catch (JSONException error) { throw new RepositoryException('INVALID_STATE', error); }
        catch (TypeException error) { throw new RepositoryException('INVALID_STATE', error); }
    }
    private static void requireKeys(Map<String,Object> values, Set<String> allowed) {
        if (values == null) { throw new RepositoryException('INVALID_STATE'); }
        for (String key : values.keySet()) { if (!allowed.contains(key)) { throw new RepositoryException('INVALID_STATE'); } }
    }
    private static void requireStateShape(CardstackOpportunityEditTypes.StoredState state) {
        if (state.status == null || !new Set<String>{'Editing', 'Review', 'Completed', 'Cancelled', 'Expired', 'Conflict'}.contains(state.status)
            || state.revision == null || state.revision < 1 || state.expiresAt == null || state.answers == null || state.diff == null
            || state.initialRecord == null || state.initialRecord.record == null || String.isBlank(state.initialRecord.freshness)
            || (!CardstackRecordScreenCapability.isNative(state) && (state.initialStages == null || String.isBlank(state.initialStages.fingerprint) || state.currencyCode == null))) {
            throw new RepositoryException('INVALID_STATE');
        }
        if(CardstackRecordScreenCapability.isFlow(state)){CardstackFlowTypes.EngineState engine=CardstackFlowTypes.decode(state.flowStateJson);if(engine.planHash!=state.flowPlanHash || (engine.status!='Cancelled' && !state.recordId.equals((String)engine.currentRecord.get('Id'))) || (state.status=='Review' && engine.status!='Review') || (state.status=='Editing' && engine.status!='Editing'))throw new RepositoryException('INVALID_FLOW_STATE');}
        if (state.status == 'Review' && (state.confirmationId == null || state.reviewRevision == null || state.reviewRevision < 1
            || state.patch == null || state.patch.entries == null || state.patch.entries.isEmpty() || String.isBlank(state.patch.digest))) {
            throw new RepositoryException('INVALID_STATE');
        }
        if (state.status == 'Completed' && (state.receipt == null || String.isBlank(state.receipt.reference)
            || !new Set<String>{'saved', 'noChanges'}.contains(state.receipt.status))) { throw new RepositoryException('INVALID_STATE'); }
        if (state.status == 'Cancelled' && (!state.answers.isEmpty() || state.patch != null || state.confirmationId != null
            || !state.diff.isEmpty())) { throw new RepositoryException('INVALID_STATE'); }
    }
    private static String currentActor() { return CardstackConnectionTypes.normalizeId(UserInfo.getUserId()); }
    private static String hash(String value) { return EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256', Blob.valueOf(value))); }
    /** Bounded private repository denial. */
    public class RepositoryException extends Exception {}
}
