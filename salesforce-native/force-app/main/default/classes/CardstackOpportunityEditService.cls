/** Fixed Opportunity edit/review process. Confirmed CRM writes belong to Task 3. */
public with sharing class CardstackOpportunityEditService {
    private static final List<String> FIELDS = new List<String>{'StageName', 'CloseDate', 'Amount'};
    private with sharing class Context {
        private CardstackPolicyService.Policy published;
        private CardstackOpportunityEditTypes.Policy policy;
        private CardstackRecordActionService.Definition action;
        private CardstackOpportunityEditTypes.RecordContext current;
        private CardstackOpportunityEditTypes.StageContext stages;
        private Boolean changed;
        private CardstackRecordScreenCapability.Definition capability;
    }
    /**
     * @param client Named connected client.
     * @param recordId Opportunity identity bound by the server, not action mappings.
     * @param actionName Published fixed record-edit action.
     * @return Authorized Editing view and ephemeral private handle, or bounded denial.
     */
    public static CardstackOpportunityEditTypes.Envelope start(String client, Id recordId, String actionName) {
        try {
            CardstackConnectionAccess.requireUser(); CardstackConnectionTypes.requireClient(client);
            CardstackRecordActionService.Definition action = CardstackRecordActionService.resolve('Opportunity', actionName);
            CardstackPolicyService.Policy published = CardstackPolicyService.resolve('Opportunity');
            CardstackOpportunityActionPolicy.validate('Opportunity', action, published);
            CardstackOpportunityEditTypes.Policy policy = CardstackOpportunityEditTypes.restrictPolicy(published);
            CardstackConnectionTypes.SetupSnapshot setup = CardstackConnectionSetupRepository.readUser(client);
            if (setup.setupView.enabledIntent != true || !setup.isCurrentOrg()) { throw new EditException('EDIT_DISABLED'); }
            CardstackOpportunityEditTypes.RecordContext current = CardstackOpportunitySelector.read(recordId, policy.requiredFields, false);
            CardstackOpportunityEditTypes.StageContext stages = CardstackOpportunityStageProvider.resolve('Opportunity',
                CardstackOpportunityEditTypes.getRecordTypeContext(current.record));
            CardstackOpportunityEditDomain.canonicalize(current, stages, policy, new List<CardstackOpportunityEditTypes.FieldChange>());
            CardstackOpportunityEditTypes.StoredState state = new CardstackOpportunityEditTypes.StoredState();
            state.kind = 'opportunity-edit-v1'; state.schemaVersion = 1; state.processVersion = 'opportunity-edit/v1';
            state.actorId = CardstackConnectionTypes.normalizeId(UserInfo.getUserId());
            state.orgId = CardstackConnectionTypes.normalizeId(UserInfo.getOrganizationId()); state.client = client;
            state.recordId = CardstackConnectionTypes.normalizeId(String.valueOf(recordId)); state.recordName = (String)current.record.get('Name');
            state.actionName = action.name; state.actionDigest = actionDigest(action); state.policyDigest = published.revision;
            state.setupDigest = setup.configurationDigest; state.setupRevision = setup.setupView.revision;
            state.initialRecord = current; state.initialStages = stages; state.currencyCode = current.currencyCode;
            state.expiresAt = Datetime.now().addMinutes(15); state.revision = 1; state.reviewRevision = 0; state.status = 'Editing';
            String key = CardstackOpportunityEditRepository.create(state);
            Context context = new Context(); context.current = current; context.stages = stages; context.policy = policy;
            return envelope(state, key, null, context, null);
        } catch (CardstackConnectionTypes.ConnectionException error) { return reject(connectionCode(error)); }
        catch (CardstackRecordActionService.ActionException error) { return reject('ACTION_NOT_PUBLISHED'); }
        catch (CardstackOpportunityActionPolicy.PolicyException error) { return reject(error.getMessage()); }
        catch (CardstackPolicyService.PolicyException error) { return reject('FIELD_NOT_EDITABLE'); }
        catch (CardstackOpportunitySelector.ReadException error) { return reject('RECORD_UNAVAILABLE'); }
        catch (CardstackOpportunityStageProvider.StageUnavailableException error) { return reject('STAGE_CONTEXT_UNAVAILABLE'); }
        catch (CardstackOpportunityEditDomain.ValidationException error) { return reject(error.getMessage()); }
        catch (CardstackOpportunityEditTypes.ContextException error) { return reject('INVALID_STATE'); }
        catch (CardstackOpportunityEditRepository.RepositoryException error) { return repositoryDenial(error); }
        catch (EditException error) { return reject(error.getMessage()); }
    }
    /** Starts a record-derived published generic capability through the shared lifecycle/store. */
    public static CardstackOpportunityEditTypes.Envelope startRecord(String client, Id recordId, String actionName) {
        try {
            CardstackConnectionAccess.requireUser(); CardstackConnectionTypes.requireClient(client);
            CardstackRecordScreenCapability.Definition capability = CardstackRecordScreenCapability.resolveDefinition(recordId,actionName);
            CardstackConnectionTypes.SetupSnapshot setup = CardstackConnectionSetupRepository.readUser(client);
            if (setup.setupView.enabledIntent != true || !setup.isCurrentOrg()) { throw new EditException('EDIT_DISABLED'); }
            CardstackOpportunityEditTypes.RecordContext current = CardstackRecordScreenCapability.readContext(recordId, capability, false);
            CardstackRecordScreenCapability.canonicalize(current, capability, new List<CardstackOpportunityEditTypes.FieldChange>());
            CardstackOpportunityEditTypes.StoredState state = new CardstackOpportunityEditTypes.StoredState();
            state.kind='record-edit-v1'; state.schemaVersion=4; state.processVersion='record-edit/v3';
            state.objectApiName=capability.objectApiName; state.capabilityVersion=capability.capabilityVersion;
            state.orderedFields=capability.fields; state.capabilityFingerprint=capability.fingerprint; state.capabilityMetadataFingerprint=CardstackRecordScreenCapability.metadataDigest(capability);
            state.actorId=CardstackConnectionTypes.normalizeId(UserInfo.getUserId());
            state.orgId=CardstackConnectionTypes.normalizeId(UserInfo.getOrganizationId()); state.client=client;
            state.recordId=CardstackConnectionTypes.normalizeId(String.valueOf(recordId)); state.recordName=CardstackRecordScreenCapability.recordName(capability,current.record);
            state.actionName=capability.action.name; state.actionDigest=CardstackOpportunityEditTypes.digest(new List<Object>{'record-action/v1',JSON.serialize(capability.action)}); state.policyDigest=capability.published.revision;
            state.setupDigest=setup.configurationDigest; state.setupRevision=setup.setupView.revision; state.initialRecord=current; state.currencyCode=current.currencyCode;
            state.expiresAt=Datetime.now().addMinutes(15); state.revision=1; state.reviewRevision=0; state.status='Editing';
            String key=CardstackOpportunityEditRepository.create(state); Context context=new Context();
            context.capability=capability; context.current=current; context.policy=capability.policy;
            return envelope(state,key,null,context,null);
        } catch (CardstackConnectionTypes.ConnectionException error) { return reject(connectionCode(error)); }
        catch (CardstackRecordActionService.ActionException error) { return reject('ACTION_NOT_PUBLISHED'); }
        catch (CardstackOpportunityActionPolicy.PolicyException error) { return reject(error.getMessage()); }
        catch (CardstackPolicyService.PolicyException error) { return reject('FIELD_NOT_EDITABLE'); }
        catch (CardstackOpportunitySelector.ReadException error) { return reject('RECORD_UNAVAILABLE'); }
        catch (CardstackNativePicklistProvider.PicklistUnavailableException error) { return reject('PICKLIST_CONTEXT_UNAVAILABLE'); }
        catch (CardstackOpportunityEditDomain.ValidationException error) { return reject(error.getMessage()); }
        catch (CardstackOpportunityEditRepository.RepositoryException error) { return repositoryDenial(error); }
        catch (EditException error) { return reject(error.getMessage()); }
    }
    /**
     * @param client Named client pinned to the private interaction.
     * @param request One declared transition; raw wire strict parsing belongs to Task 4.
     * @return Latest authorized view; Confirm delegates to the atomic governed writer.
     */
    public static CardstackOpportunityEditTypes.Envelope transition(String client, CardstackOpportunityEditTypes.TransitionRequest request) {
        try { validateRequestSize(request); }
        catch (EditException error) { return reject(error.getMessage()); }
        return transitionCore(client, request, false);
    }
    /**
     * Strict MCP ingress also checks its original decoded argument map. This entry
     * independently bounds the compact typed projection, omitting absent null keys.
     * @param client Named client pinned to private state.
     * @param request Already strictly parsed values; this method accepts no budget flag.
     * @return The same governed transition, authorization and completion recovery.
     */
    public static CardstackOpportunityEditTypes.Envelope transitionFromMcp(String client, CardstackOpportunityEditTypes.TransitionRequest request) {
        if (request == null) { return reject('INVALID_REQUEST'); }
        if (Blob.valueOf(JSON.serialize(request, true)).size() > 16384) { return reject('REQUEST_TOO_LARGE'); }
        return transitionCore(client, request, false);
    }
    /** Strict generic adapter entry: the family is trusted code, never request data. */
    public static CardstackOpportunityEditTypes.Envelope transitionRecordFromMcp(String client, CardstackOpportunityEditTypes.TransitionRequest request) {
        if(request==null || Blob.valueOf(JSON.serialize(request,true)).size()>16384) return reject('INVALID_REQUEST');
        return transitionCore(client,request,true);
    }
    private static CardstackOpportunityEditTypes.Envelope transitionCore(String client, CardstackOpportunityEditTypes.TransitionRequest request, Boolean genericRoute) {
        Savepoint mutation = null;
        try {
            if (request.operation == 'confirm') { return genericRoute ? CardstackOpportunityWriteService.confirmRecord(client, request) : CardstackOpportunityWriteService.confirm(client, request); }
            validateOperation(request);
            CardstackConnectionAccess.requireUser(); CardstackConnectionTypes.requireClient(client);
            CardstackOpportunityEditRepository.LockedInteraction locked = CardstackOpportunityEditRepository.lockOwned(client, request.interactionKey);
            CardstackOpportunityEditTypes.StoredState state = locked.state;
            if (genericRoute != CardstackRecordScreenCapability.isGeneric(state)) return reject('INVALID_INTERACTION');
            Context context = currentContext(state);
            if (request.operation != 'resume' && (request.expectedRevision == null || request.expectedRevision != state.revision)) {
                return reject('STALE_REVISION');
            }
            if (state.status == 'Completed') {
                CardstackOpportunityEditRepository.requireCompletedReceipt(locked);
                if (context.changed) { return conflict(); }
                if (request.operation != 'resume') { return reject('PROCESS_COMPLETED'); }
                return envelope(state, request.interactionKey, null, context, null);
            }
            if (state.status == 'Cancelled' || state.status == 'Expired' || state.status == 'Conflict') {
                if (context.changed) { return conflict(); }
                return envelope(state, request.interactionKey, null, context, null);
            }
            if (state.expiresAt <= Datetime.now()) {
                mutation = Database.setSavepoint();
                return terminate(locked, state, request.interactionKey, context, 'Expired');
            }
            if (context.changed) {
                mutation = Database.setSavepoint();
                return terminate(locked, state, request.interactionKey, context, 'Conflict');
            }
            if (request.operation == 'resume' && state.status == 'Editing') {
                return envelope(state, request.interactionKey, null, context, null);
            }
            if (request.operation == 'review') {
                if (state.status != 'Editing') { return reject('REVIEW_REQUIRED_BACK'); }
                CardstackOpportunityEditTypes.CanonicalPatch patch;
                try { patch = canonicalize(context, context.current, request.changes); }
                catch (CardstackOpportunityEditDomain.ValidationException error) {
                    return envelope(state, request.interactionKey, null, context, fieldError(error.getMessage(), request.changes));
                }
                mutation = Database.setSavepoint();
                state.answers = canonicalAnswers(patch); state.patch = patch; state.diff = patch.diff; state.revision++;
                if (patch.entries.isEmpty()) {
                    state.status = 'Completed'; state.receipt = noChangesReceipt();
                    CardstackOpportunityEditRepository.save(locked, state);
                    return envelope(state, request.interactionKey, null, context, null);
                }
                state.status = 'Review'; state.reviewRevision++;
                String grant = CardstackOpportunityEditRepository.issueReviewGrant(locked, state, CardstackOpportunityEditTypes.reviewSubject(state));
                CardstackOpportunityEditRepository.save(locked, state);
                return envelope(state, request.interactionKey, grant, context, null);
            }
            if (request.operation == 'resume' && state.status == 'Review') {
                CardstackOpportunityEditTypes.CanonicalPatch canonical = canonicalize(context, state.initialRecord, state.answers);
                if (!samePatch(state, canonical)) {
                    mutation = Database.setSavepoint();
                    return terminate(locked, state, request.interactionKey, context, 'Conflict');
                }
                mutation = Database.setSavepoint();
                CardstackOpportunityEditRepository.invalidateReviewGrant(locked, state);
                state.patch = canonical; state.diff = canonical.diff; state.revision++; state.reviewRevision++;
                String grant = CardstackOpportunityEditRepository.issueReviewGrant(locked, state, CardstackOpportunityEditTypes.reviewSubject(state));
                CardstackOpportunityEditRepository.save(locked, state);
                return envelope(state, request.interactionKey, grant, context, null);
            }
            if (request.operation == 'back') {
                if (state.status != 'Review') { return reject('REVIEW_REQUIRED'); }
                mutation = Database.setSavepoint(); CardstackOpportunityEditRepository.invalidateReviewGrant(locked, state);
                state.status = 'Editing'; state.patch = null; state.diff.clear(); state.revision++;
                CardstackOpportunityEditRepository.save(locked, state);
                return envelope(state, request.interactionKey, null, context, null);
            }
            if (request.operation == 'cancel') {
                mutation = Database.setSavepoint();
                CardstackOpportunityEditRepository.invalidateReviewGrant(locked, state);
                state.answers.clear(); state.patch = null; state.diff.clear(); state.status = 'Cancelled'; state.revision++;
                CardstackOpportunityEditRepository.save(locked, state);
                return envelope(state, request.interactionKey, null, context, null);
            }
            return reject('INVALID_OPERATION');
        } catch (CardstackConnectionTypes.ConnectionException error) { rollback(mutation); return reject(connectionCode(error)); }
        catch (CardstackRecordActionService.ActionException error) { rollback(mutation); return reject('ACTION_NOT_PUBLISHED'); }
        catch (CardstackOpportunityActionPolicy.PolicyException error) { rollback(mutation); return reject(error.getMessage()); }
        catch (CardstackPolicyService.PolicyException error) { rollback(mutation); return reject('FIELD_NOT_EDITABLE'); }
        catch (CardstackOpportunitySelector.ReadException error) { rollback(mutation); return reject('RECORD_UNAVAILABLE'); }
        catch (CardstackNativePicklistProvider.PicklistUnavailableException error) { rollback(mutation); return conflict(); }
        catch (CardstackOpportunityStageProvider.StageUnavailableException error) { rollback(mutation); return conflict(); }
        catch (CardstackOpportunityEditDomain.ValidationException error) { rollback(mutation); return conflict(); }
        catch (CardstackOpportunityEditTypes.ContextException error) { rollback(mutation); return reject('INVALID_STATE'); }
        catch (CardstackOpportunityEditRepository.RepositoryException error) { rollback(mutation); return repositoryDenial(error); }
        catch (EditException error) { rollback(mutation); return reject(error.getMessage()); }
        finally { if (mutation != null) { Database.releaseSavepoint(mutation); } }
    }
    /** Typed canonical budget only; no claim to original decoded wire bytes. */
    @TestVisible private static void validateRequestSize(CardstackOpportunityEditTypes.TransitionRequest request) {
        if (request == null) { throw new EditException('INVALID_REQUEST'); }
        if (Blob.valueOf(JSON.serialize(request)).size() > 16384) { throw new EditException('REQUEST_TOO_LARGE'); }
    }
    private static void validateOperation(CardstackOpportunityEditTypes.TransitionRequest request) {
        Boolean known = false;
        for (String operation : new List<String>{'review', 'back', 'cancel', 'resume'}) {
            if (operation.equals(request.operation)) { known = true; }
        }
        if (!known) { throw new EditException(request.operation == 'confirm' ? 'CONFIRM_NOT_IMPLEMENTED' : 'INVALID_OPERATION'); }
        if (request.reviewGrant != null || request.reviewRevision != null
            || (request.operation != 'review' && request.changes != null)
            || (request.operation == 'review' && request.changes == null)) { throw new EditException('INVALID_REQUEST'); }
    }
    private static Context currentContext(CardstackOpportunityEditTypes.StoredState state) {
        Context result = new Context();
        if (CardstackRecordScreenCapability.isGeneric(state)) {
            result.capability=CardstackRecordScreenCapability.resolveDefinition(state);
            CardstackRecordScreenCapability.validateCapabilityContext(state,result.capability);
            result.policy=result.capability.policy; result.current=CardstackRecordScreenCapability.readContext((Id)state.recordId,result.capability,false);
            result.changed=!state.initialRecord.freshness.equals(result.current.freshness);
            if (new Set<String>{'Completed','Cancelled','Expired','Conflict'}.contains(state.status)) result.changed=false;
            return result;
        }
        result.action = CardstackRecordActionService.resolve('Opportunity', state.actionName);
        result.published = CardstackPolicyService.resolve('Opportunity');
        CardstackOpportunityActionPolicy.validate('Opportunity', result.action, result.published);
        result.policy = CardstackOpportunityEditTypes.restrictPolicy(result.published);
        result.current = CardstackOpportunitySelector.read((Id)state.recordId, result.policy.requiredFields, false);
        result.changed = state.policyDigest == null || !state.policyDigest.equals(result.published.revision)
            || state.actionDigest == null || !state.actionDigest.equals(actionDigest(result.action));
        if (new Set<String>{'Completed', 'Cancelled', 'Expired', 'Conflict'}.contains(state.status)) { return result; }
        if (state.initialRecord == null || state.initialStages == null || state.currencyCode == null) { throw new EditException('INVALID_STATE'); }
        result.stages = CardstackOpportunityStageProvider.resolve('Opportunity',
            CardstackOpportunityEditTypes.getRecordTypeContext(result.current.record));
        result.changed = result.changed || !state.initialRecord.freshness.equals(result.current.freshness)
            || !state.initialStages.fingerprint.equals(result.stages.fingerprint) || !state.currencyCode.equals(result.current.currencyCode);
        return result;
    }
    private static CardstackOpportunityEditTypes.Envelope terminate(CardstackOpportunityEditRepository.LockedInteraction locked,
        CardstackOpportunityEditTypes.StoredState state, String key, Context context, String status) {
        CardstackOpportunityEditRepository.invalidateReviewGrant(locked, state);
        state.status = status; state.revision++;
        CardstackOpportunityEditRepository.save(locked, state);
        return envelope(state, key, null, context, null);
    }
    private static CardstackOpportunityEditTypes.CanonicalPatch canonicalize(Context context,
        CardstackOpportunityEditTypes.RecordContext current,List<CardstackOpportunityEditTypes.FieldChange> changes) {
        return context.capability == null ? CardstackOpportunityEditDomain.canonicalize(current,context.stages,context.policy,changes)
            : CardstackRecordScreenCapability.canonicalize(current,context.capability,changes);
    }
    private static Boolean samePatch(CardstackOpportunityEditTypes.StoredState state, CardstackOpportunityEditTypes.CanonicalPatch canonical) {
        return state.patch != null && state.patch.digest != null && state.patch.digest.equals(canonical.digest)
            && JSON.serialize(state.patch.entries).equals(JSON.serialize(canonical.entries))
            && JSON.serialize(state.patch.diff).equals(JSON.serialize(canonical.diff))
            && JSON.serialize(state.diff).equals(JSON.serialize(canonical.diff));
    }
    private static List<CardstackOpportunityEditTypes.FieldChange> canonicalAnswers(CardstackOpportunityEditTypes.CanonicalPatch patch) {
        List<CardstackOpportunityEditTypes.FieldChange> result = new List<CardstackOpportunityEditTypes.FieldChange>();
        for (CardstackPreviewUpdateAction.PatchEntry entry : patch.entries) {
            CardstackOpportunityEditTypes.FieldChange answer = new CardstackOpportunityEditTypes.FieldChange();
            answer.fieldApi = entry.fieldApiName; answer.operation = entry.newValue == null ? 'clear' : 'set';
            answer.value = entry.newValue; result.add(answer);
        }
        return result;
    }
    private static CardstackOpportunityEditTypes.Receipt noChangesReceipt() {
        CardstackOpportunityEditTypes.Receipt receipt = new CardstackOpportunityEditTypes.Receipt();
        receipt.reference = 'receipt-'+EncodingUtil.convertToHex(Crypto.generateAesKey(128));
        receipt.actorDisplayName = UserInfo.getName(); receipt.completedAt = timestamp(Datetime.now()); receipt.status = 'noChanges'; return receipt;
    }
    /**
     * Presentation only, after the writer validates actor, rights and locked context.
     * @param locked Validated actor-owned private interaction.
     * @param key Ephemeral private interaction handle.
     * @param current Previously authorized record read; no provider call after DML.
     * @param stages Previously validated Stage choices; absent for completion retrieval.
     * @param policy Previously validated restrictive policy.
     * @param error Bounded known-DML feedback, or null.
     * @return Existing presentation contract; no authority is minted here.
     */
    public static CardstackOpportunityEditTypes.Envelope presentConfirmedState(CardstackOpportunityEditRepository.LockedInteraction locked,
        String key, CardstackOpportunityEditTypes.RecordContext current, CardstackOpportunityEditTypes.StageContext stages,
        CardstackOpportunityEditTypes.Policy policy, CardstackOpportunityEditTypes.FieldError error) {
        return presentConfirmedState(locked,key,current,stages,policy,error,null);
    }
    /** Present the carried verified generic capability; no provider resolution after native DML. */
    public static CardstackOpportunityEditTypes.Envelope presentConfirmedState(CardstackOpportunityEditRepository.LockedInteraction locked,
        String key,CardstackOpportunityEditTypes.RecordContext current,CardstackOpportunityEditTypes.StageContext stages,
        CardstackOpportunityEditTypes.Policy policy,CardstackOpportunityEditTypes.FieldError error,CardstackRecordScreenCapability.Definition capability) {
        CardstackConnectionAccess.requireUser();
        if (locked == null || locked.state == null || current == null || policy == null
            || (locked.state.status == 'Editing' && stages == null && !CardstackRecordScreenCapability.isGeneric(locked.state))) { throw new EditException('INVALID_STATE'); }
        Context context = new Context(); context.current = current; context.stages = stages; context.policy = policy;
        if (CardstackRecordScreenCapability.isGeneric(locked.state)) {
            if(capability==null) throw new EditException('INVALID_STATE');
            CardstackRecordScreenCapability.validateVerifiedContext(locked.state,capability,current); context.capability=capability;
        } else if(capability!=null) throw new EditException('INVALID_STATE');
        return envelope(locked.state, key, null, context, error);
    }
    private static CardstackOpportunityEditTypes.Envelope envelope(CardstackOpportunityEditTypes.StoredState state, String key,
        String grant, Context context, CardstackOpportunityEditTypes.FieldError error) {
        CardstackOpportunityEditTypes.Envelope result = new CardstackOpportunityEditTypes.Envelope();
        result.interactionKey = key; result.reviewGrant = grant; result.view = new CardstackOpportunityEditTypes.View();
        result.view.contractVersion = 'opportunity-edit/v1'; result.view.status = state.status;
        result.view.recordId = state.recordId; result.view.recordName = state.recordName;
        result.view.revision = state.revision; result.view.reviewRevision = state.reviewRevision; result.view.expiresAt = timestamp(state.expiresAt);
        if (error != null) { result.view.errors.add(error); }
        if (CardstackRecordScreenCapability.isGeneric(state)) {
            result.view.contractVersion='record-edit/v1'; result.view.objectApiName=state.objectApiName; result.view.layout=context.capability.layout;
            if (state.status != 'Rejected') {
                result.view.fields=CardstackRecordScreenCapability.describeFields(context.capability,context.current);
                if(state.status=='Completed') for(CardstackOpportunityEditTypes.FieldView field:result.view.fields) field.choices=new List<CardstackOpportunityEditTypes.Choice>();
                if (state.status == 'Editing') for (CardstackOpportunityEditTypes.FieldView field:result.view.fields) {
                    for (CardstackOpportunityEditTypes.FieldChange answer:state.answers) if (field.fieldApi.equals(answer.fieldApi)) field.value=answer.value;
                }
            }
            if (state.status == 'Completed') result.view.receipt=state.receipt;
            if (state.status == 'Review') result.view.diff=state.diff;
            return result;
        }
        if (state.status == 'Completed') { result.view.receipt = state.receipt; return result; }
        if (state.status == 'Review') { result.view.diff = state.diff; return result; }
        if (state.status != 'Editing') { return result; }
        Map<String,CardstackOpportunityEditTypes.FieldChange> answers = new Map<String,CardstackOpportunityEditTypes.FieldChange>();
        for (CardstackOpportunityEditTypes.FieldChange answer : state.answers) { answers.put(answer.fieldApi, answer); }
        for (String field : FIELDS) {
            Schema.DescribeFieldResult describe = Opportunity.SObjectType.getDescribe().fields.getMap().get(field).getDescribe();
            CardstackOpportunityEditTypes.FieldView input = new CardstackOpportunityEditTypes.FieldView();
            input.fieldApi = field; input.label = describe.getLabel(); input.dataType = String.valueOf(describe.getType());
            input.required = context.policy.requiredFields.contains(field) || !describe.isNillable();
            input.canClear = field == 'Amount' && context.policy.clearableFields.contains(field);
            Object current = context.current.record.get(field);
            input.value = displayValue(field, current);
            if (answers.containsKey(field)) { input.value = answers.get(field).value; }
            if (field == 'StageName') { input.choices = context.stages.choices; }
            if (field == 'Amount') { input.currencyCode = context.current.currencyCode; }
            result.view.fields.add(input);
        }
        return result;
    }
    /** Display formatting only; submitted decimal/date grammar belongs to the Domain. */
    private static String displayValue(String field, Object value) {
        if (value == null) { return null; }
        if (field == 'CloseDate') {
            Date calendar = (Date)value; String year = String.valueOf(calendar.year());
            while (year.length() < 4) { year = '0' + year; }
            return year + '-' + (calendar.month() < 10 ? '0' : '') + String.valueOf(calendar.month())
                + '-' + (calendar.day() < 10 ? '0' : '') + String.valueOf(calendar.day());
        }
        if (field == 'Amount') {
            Decimal amount = (Decimal)value; if (amount == 0) { return '0'; }
            String literal = amount.toPlainString();
            return literal.contains('.') ? literal.replaceFirst('0+$', '').replaceFirst('\\.$', '') : literal;
        }
        return String.valueOf(value);
    }
    private static CardstackOpportunityEditTypes.FieldError fieldError(String code, List<CardstackOpportunityEditTypes.FieldChange> changes) {
        CardstackOpportunityEditTypes.FieldError error = new CardstackOpportunityEditTypes.FieldError();
        error.code = code; error.message = 'Review the entered field values.';
        if (changes != null && changes.size() == 1 && changes[0] != null && FIELDS.contains(changes[0].fieldApi)) { error.fieldApi = changes[0].fieldApi; }
        return error;
    }
    private static String actionDigest(CardstackRecordActionService.Definition action) {
        return CardstackOpportunityEditTypes.digest(new List<Object>{'opportunity-action/v1', JSON.serialize(action)});
    }
    private static String timestamp(Datetime value) { return value.formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\''); }
    private static void rollback(Savepoint mutation) { if (mutation != null) { Database.rollback(mutation); } }
    private static String connectionCode(CardstackConnectionTypes.ConnectionException error) {
        return error.getMessage() == 'NOT_AUTHORIZED' ? 'NOT_AUTHORIZED' : 'INVALID_CLIENT';
    }
    private static CardstackOpportunityEditTypes.Envelope repositoryDenial(CardstackOpportunityEditRepository.RepositoryException error) {
        if (error.getMessage() == 'CONTEXT_CHANGED') { return conflict(); }
        return reject(error.getMessage());
    }
    private static CardstackOpportunityEditTypes.Envelope conflict() {
        CardstackOpportunityEditTypes.Envelope result = reject('CONTEXT_CHANGED'); result.view.status = 'Conflict'; return result;
    }
    private static CardstackOpportunityEditTypes.Envelope reject(String code) {
        CardstackOpportunityEditTypes.Envelope result = new CardstackOpportunityEditTypes.Envelope();
        result.view = new CardstackOpportunityEditTypes.View(); result.view.contractVersion = 'opportunity-edit/v1'; result.view.status = 'Rejected';
        CardstackOpportunityEditTypes.FieldError error = new CardstackOpportunityEditTypes.FieldError();
        error.code = code; error.message = 'Opportunity editing is unavailable for this request.';
        result.view.errors.add(error); return result;
    }
    /** Bounded edit-process failure. */
    public class EditException extends Exception {}
}
