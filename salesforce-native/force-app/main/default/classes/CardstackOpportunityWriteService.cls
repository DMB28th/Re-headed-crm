/** One actor-bound reviewed Opportunity save, required audit and durable receipt. */
public with sharing class CardstackOpportunityWriteService {
    // Test-only failure mutates only the ephemeral DML target and never stored values.
    @TestVisible private static Boolean failCrmUpdate = false;
    @TestVisible private static Integer crmUpdateAttempts = 0;
    @TestVisible private static Boolean advanceFlowPublicationBeforeFinalCheck=false;
    private with sharing class Context {
        private CardstackOpportunityEditTypes.Policy policy;
        private CardstackOpportunityEditTypes.RecordContext current;
        private CardstackOpportunityEditTypes.StageContext stages;
        private CardstackRecordScreenCapability.Definition capability;
    }
    /**
     * @param client Named connected client, bound by the owned private lock.
     * @param request Private interaction/revisions/grant only; no record or patch input.
     * @return Atomic saved outcome, original consumed receipt, or bounded denial.
     */
    public static CardstackOpportunityEditTypes.Envelope confirm(String client, CardstackOpportunityEditTypes.TransitionRequest request) {
        return confirmCore(client,request,'opportunity');
    }
    /** Generic route uses the same writer and binds only the registered state family. */
    public static CardstackOpportunityEditTypes.Envelope confirmRecord(String client,CardstackOpportunityEditTypes.TransitionRequest request) {
        return confirmCore(client,request,'record');
    }
    /** Flow confirms through this exact shared writer, retaining its distinct public/state family. */
    public static CardstackOpportunityEditTypes.Envelope confirmFlow(String client,CardstackOpportunityEditTypes.TransitionRequest request) {
        CardstackFlowService.OperationScope scope=CardstackFlowService.openOperation(client);
        try{CardstackOpportunityEditTypes.Envelope result=confirmCore(client,request,'flow');result.view.contractVersion='screen-flow/v1';return result;}
        finally{CardstackFlowService.closeOperation(scope);}
    }
    private static CardstackOpportunityEditTypes.Envelope confirmCore(String client,CardstackOpportunityEditTypes.TransitionRequest request,String route) {
        Savepoint attempt;
        try {
            validateRequest(request); CardstackConnectionAccess.requireUser(); CardstackConnectionTypes.requireClient(client);
            CardstackOpportunityEditRepository.LockedInteraction locked = CardstackOpportunityEditRepository.lockOwned(client, request.interactionKey);
            CardstackOpportunityEditTypes.StoredState state = locked.state;
            if ((route=='flow')!=CardstackRecordScreenCapability.isFlow(state) || (route=='record')!=CardstackRecordScreenCapability.isGeneric(state)) return reject('INVALID_INTERACTION');
            Boolean completed = state.status == 'Completed';
            if (completed && (state.receipt == null || state.receipt.status != 'saved')) { return reject('INVALID_REVIEW_CONTEXT'); }
            Integer expected = completed ? state.revision-1 : state.revision;
            if (request.expectedRevision != expected) { return reject('STALE_REVISION'); }
            if (state.reviewRevision != request.reviewRevision || (!completed && state.status != 'Review')) { return reject('INVALID_REVIEW_CONTEXT'); }
            Cardstack_Confirmation__c grant = CardstackOpportunityEditRepository.lockGrant(locked, request.reviewGrant);
            Context context = currentContext(state, !completed);
            if (completed) { return present(locked, request.interactionKey, context, null); }
            CardstackOpportunityEditTypes.CanonicalPatch patch = validatedPatch(state, context, grant);
            // All authority/current context checks precede the save attempt. The
            // private grant remains locked through CRM, required audit and receipt.
            attempt = Database.setSavepoint();
            try { updateRecord((Id)state.recordId, patch, context.capability); }
            catch (DmlException error) {
                Database.rollback(attempt);
                return validationFailure(locked, request.interactionKey, context);
            }
            CardstackOpportunityEditTypes.Receipt receipt = savedReceipt(state.diff);
            CardstackOpportunityWriteAudit.appendRequired((Id)state.recordId, receipt, context.capability);
            CardstackOpportunityEditRepository.complete(locked, grant, receipt, context.capability, context.current);
            return present(locked, request.interactionKey, context, null);
        } catch (CardstackFlowService.ServiceException error) { rollback(attempt);return error.getMessage()=='CONTEXT_CHANGED'?conflict():reject('INVALID_STATE'); }
        catch (CardstackFlowPublication.PublicationException error) { rollback(attempt);return error.getMessage()=='CONTEXT_CHANGED'?conflict():reject('INVALID_STATE'); }
        catch (CardstackConnectionTypes.ConnectionException error) {
            rollback(attempt); return reject(error.getMessage() == 'NOT_AUTHORIZED' ? 'NOT_AUTHORIZED' : 'INVALID_CLIENT');
        } catch (CardstackRecordActionService.ActionException error) { rollback(attempt); return reject('ACTION_NOT_PUBLISHED'); }
        catch (CardstackOpportunityActionPolicy.PolicyException error) { rollback(attempt); return reject(error.getMessage()); }
        catch (CardstackPolicyService.PolicyException error) { rollback(attempt); return reject('FIELD_NOT_EDITABLE'); }
        catch (CardstackOpportunitySelector.ReadException error) { rollback(attempt); return reject('RECORD_UNAVAILABLE'); }
        catch (CardstackOpportunityStageProvider.StageUnavailableException error) { rollback(attempt); return conflict(); }
        catch (CardstackNativePicklistProvider.PicklistUnavailableException error) { rollback(attempt); return conflict(); }
        catch (CardstackOpportunityEditDomain.ValidationException error) { rollback(attempt); return conflict(); }
        catch (CardstackOpportunityEditTypes.ContextException error) { rollback(attempt); return reject('INVALID_STATE'); }
        catch (CardstackOpportunityEditRepository.RepositoryException error) {
            rollback(attempt);
            if (attempt != null) { return reject('SAVE_UNAVAILABLE'); }
            return error.getMessage() == 'CONTEXT_CHANGED' ? conflict() : reject(error.getMessage());
        } catch (CardstackOpportunityWriteAudit.AuditException error) { rollback(attempt); return reject('SAVE_UNAVAILABLE'); }
        catch (WriteException error) { rollback(attempt); return error.getMessage() == 'CONTEXT_CHANGED' ? conflict() : reject(error.getMessage()); }
        catch (Exception error) { rollback(attempt); return reject('SAVE_UNAVAILABLE'); }
        finally { if (attempt != null) { Database.releaseSavepoint(attempt); } }
    }
    private static void validateRequest(CardstackOpportunityEditTypes.TransitionRequest request) {
        if (request == null) { throw new WriteException('INVALID_REQUEST'); }
        if (Blob.valueOf(JSON.serialize(request)).size() > 16384) { throw new WriteException('REQUEST_TOO_LARGE'); }
        if (request.operation != 'confirm' || request.changes != null || request.expectedRevision == null
            || request.expectedRevision < 1 || request.reviewRevision == null || request.reviewRevision < 0
            || request.interactionKey == null || request.reviewGrant == null) { throw new WriteException('INVALID_REQUEST'); }
    }
    private static Context currentContext(CardstackOpportunityEditTypes.StoredState state, Boolean lockRecord) {
        if (CardstackRecordScreenCapability.isNative(state)) {
            Context result=new Context(); result.capability=CardstackRecordScreenCapability.resolveDefinition(state);
            CardstackRecordScreenCapability.validateCapabilityContext(state,result.capability);
            result.policy=result.capability.policy;
            result.current=CardstackRecordScreenCapability.readContext((Id)state.recordId,result.capability,lockRecord);
            if(lockRecord && (!state.capabilityFingerprint.equals(result.capability.fingerprint) || !state.initialRecord.freshness.equals(result.current.freshness))) throw new WriteException('CONTEXT_CHANGED');
            return result;
        }
        CardstackRecordActionService.Definition action = CardstackRecordActionService.resolve('Opportunity', state.actionName);
        CardstackPolicyService.Policy published = CardstackPolicyService.resolve('Opportunity');
        CardstackOpportunityActionPolicy.validate('Opportunity', action, published);
        String actionDigest = CardstackOpportunityEditTypes.digest(new List<Object>{'opportunity-action/v1', JSON.serialize(action)});
        if (state.policyDigest == null || !state.policyDigest.equals(published.revision)
            || state.actionDigest == null || !state.actionDigest.equals(actionDigest)) { throw new WriteException('CONTEXT_CHANGED'); }
        Context result = new Context(); result.policy = CardstackOpportunityEditTypes.restrictPolicy(published);
        // Setup -> interaction -> confirmation have already been locked. USER_MODE
        // now locks the actual Opportunity before fresh Stage/currency validation.
        result.current = CardstackOpportunitySelector.read((Id)state.recordId, result.policy.requiredFields, lockRecord);
        if (!lockRecord) { return result; }
        result.stages = CardstackOpportunityStageProvider.resolve('Opportunity', CardstackOpportunityEditTypes.getRecordTypeContext(result.current.record));
        if (state.initialRecord == null || state.initialStages == null
            || !state.initialRecord.freshness.equals(result.current.freshness)
            || !state.initialStages.fingerprint.equals(result.stages.fingerprint)
            || state.currencyCode == null || !state.currencyCode.equals(result.current.currencyCode)) { throw new WriteException('CONTEXT_CHANGED'); }
        return result;
    }
    private static CardstackOpportunityEditTypes.CanonicalPatch validatedPatch(CardstackOpportunityEditTypes.StoredState state,
        Context context, Cardstack_Confirmation__c grant) {
        if(CardstackRecordScreenCapability.isFlow(state)) {
            advanceFlowPublicationForTest(state);
            // Final authority is deliberately fresh AFTER the native FOR UPDATE/provider phase.
            CardstackFlowPublication.invalidateOperations();CardstackFlowService.validateReviewState(state);
            CardstackRecordScreenCapability.Definition fresh=CardstackFlowService.resolveCapability(state);
            if(!fresh.fingerprint.equals(context.capability.fingerprint) || !CardstackRecordScreenCapability.metadataDigest(fresh).equals(CardstackRecordScreenCapability.metadataDigest(context.capability)))throw new WriteException('CONTEXT_CHANGED');
            CardstackRecordScreenCapability.validateVerifiedContext(state,fresh,context.current);
        }
        // Persisted Object-valued maps are never executable. Reconstruct fresh
        // Date/Decimal/API values through the existing pure Domain only.
        CardstackOpportunityEditTypes.CanonicalPatch patch = context.capability == null ? CardstackOpportunityEditDomain.canonicalize(
            context.current, context.stages, context.policy, state.answers) : CardstackRecordScreenCapability.canonicalize(context.current,context.capability,state.answers);
        if (state.patch == null || state.patch.digest == null || !state.patch.digest.equals(patch.digest)
            || patch.entries.isEmpty() || !JSON.serialize(state.patch.entries).equals(JSON.serialize(patch.entries))
            || !JSON.serialize(state.patch.diff).equals(JSON.serialize(patch.diff))
            || !JSON.serialize(state.diff).equals(JSON.serialize(patch.diff))
            || !hash(CardstackOpportunityEditTypes.reviewSubject(state)).equals(grant.Subject_Hash__c)) {
            throw new WriteException('INVALID_REVIEW_CONTEXT');
        }
        return patch;
    }
    // Simulates a publication arriving after record locking but before final authority. Production never runs it.
    private static void advanceFlowPublicationForTest(CardstackOpportunityEditTypes.StoredState state) {
        if(!Test.isRunningTest() || !advanceFlowPublicationBeforeFinalCheck)return;
        String key=CardstackFlowPublication.key(state.flowApiName);
        Cardstack_Config__c row=[SELECT Id,Value__c FROM Cardstack_Config__c WHERE Name=:key AND Is_Active__c=true WITH USER_MODE LIMIT 1];
        CardstackFlowPublication.Published published=CardstackFlowPublication.decode(row.Value__c);published.revision='test-publication-arrived-after-record-lock';row.Value__c=JSON.serialize(published);Database.update(row,AccessLevel.USER_MODE);
    }
    private static void updateRecord(Id recordId, CardstackOpportunityEditTypes.CanonicalPatch patch, CardstackRecordScreenCapability.Definition capability) {
        Schema.SObjectType objectType=capability==null?Opportunity.SObjectType:capability.objectType;
        if(recordId.getSObjectType()!=objectType) throw new WriteException('INVALID_STATE');
        SObject target=objectType.newSObject(recordId);
        for (CardstackPreviewUpdateAction.PatchEntry entry : patch.entries) { target.put(entry.fieldApiName, patch.typedValues.get(entry.fieldApiName)); }
        if (Test.isRunningTest()) {
            crmUpdateAttempts++;
            if (failCrmUpdate) { target.put('Id',null); }
        }
        Database.update(target, AccessLevel.USER_MODE);
    }
    private static CardstackOpportunityEditTypes.Envelope validationFailure(CardstackOpportunityEditRepository.LockedInteraction locked,
        String key, Context context) {
        CardstackOpportunityEditTypes.StoredState state = locked.state;
        CardstackOpportunityEditRepository.invalidateReviewGrant(locked, state);
        if(CardstackRecordScreenCapability.isFlow(state)){state.flowStateJson=JSON.serialize(CardstackFlowEngine.recoverForValidation(CardstackFlowService.plan(state),CardstackFlowTypes.decode(state.flowStateJson)));}
        state.status = 'Editing'; state.patch = null; state.diff.clear(); state.receipt = null; state.revision++;
        CardstackOpportunityEditRepository.save(locked, state);
        CardstackOpportunityEditTypes.FieldError feedback = new CardstackOpportunityEditTypes.FieldError();
        feedback.code = 'SAVE_VALIDATION_FAILED'; feedback.message = 'Review the field values and create a new review.';
        return present(locked, key, context, feedback);
    }
    private static CardstackOpportunityEditTypes.Receipt savedReceipt(List<CardstackOpportunityEditTypes.DiffRow> diff) {
        CardstackOpportunityEditTypes.Receipt receipt = new CardstackOpportunityEditTypes.Receipt();
        receipt.reference = 'receipt-'+EncodingUtil.convertToHex(Crypto.generateAesKey(128)); receipt.status = 'saved';
        receipt.actorDisplayName = UserInfo.getName(); receipt.completedAt = Datetime.now().formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\'');
        receipt.diff = diff; return receipt;
    }
    private static CardstackOpportunityEditTypes.Envelope present(CardstackOpportunityEditRepository.LockedInteraction locked,
        String key, Context context, CardstackOpportunityEditTypes.FieldError error) {
        if(CardstackRecordScreenCapability.isFlow(locked.state))return CardstackFlowService.envelope(locked.state,key,null,context.capability,context.current,error);
        return CardstackOpportunityEditService.presentConfirmedState(locked, key, context.current, context.stages, context.policy, error, context.capability);
    }
    private static String hash(String value) { return EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256', Blob.valueOf(value))); }
    private static void rollback(Savepoint attempt) { if (attempt != null) { Database.rollback(attempt); } }
    private static CardstackOpportunityEditTypes.Envelope conflict() {
        CardstackOpportunityEditTypes.Envelope result = reject('CONTEXT_CHANGED'); result.view.status = 'Conflict'; return result;
    }
    private static CardstackOpportunityEditTypes.Envelope reject(String code) {
        CardstackOpportunityEditTypes.Envelope result = new CardstackOpportunityEditTypes.Envelope();
        result.view = new CardstackOpportunityEditTypes.View(); result.view.contractVersion = 'opportunity-edit/v1'; result.view.status = 'Rejected';
        CardstackOpportunityEditTypes.FieldError error = new CardstackOpportunityEditTypes.FieldError();
        error.code = code; error.message = 'Opportunity saving is unavailable for this request.';
        result.view.errors.add(error); return result;
    }
    /** Bounded confirmed-save failure. */
    public class WriteException extends Exception {}
}
