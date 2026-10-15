/** Durable bounded Flow lifecycle. Only the existing shared writer performs confirmed CRM updates. */
public with sharing class CardstackFlowService {
    public class ServiceException extends Exception {}
    /** Request-scoped native capability variants; record reads are never cached. */
    public with sharing class OperationScope {
        private OperationScope previous;private CardstackFlowPublication.OperationScope publicationScope;
        private String actorId18,orgId18,client;
        private Map<String,CardstackRecordScreenCapability.Definition> capabilities=new Map<String,CardstackRecordScreenCapability.Definition>();
    }
    private static OperationScope activeScope;
    /** Opens a fresh operation even when multiple API calls are executed inside one Apex transaction/test. */
    public static OperationScope openOperation(String client) {
        OperationScope scope=new OperationScope();scope.previous=activeScope;scope.client=client;scope.actorId18=CardstackConnectionTypes.normalizeId(UserInfo.getUserId());scope.orgId18=CardstackConnectionTypes.normalizeId(UserInfo.getOrganizationId());scope.publicationScope=CardstackFlowPublication.openOperation(client);activeScope=scope;return scope;
    }
    /** Cleanup restores a nested parent only by exact token, never by a caller-supplied cache key. */
    public static void closeOperation(OperationScope scope) {
        if(scope==null)return;if(activeScope!=scope)throw new ServiceException('INVALID_OPERATION_SCOPE');scope.capabilities.clear();CardstackFlowPublication.closeOperation(scope.publicationScope);activeScope=scope.previous;
    }
    /** Publication mutations invalidate capability frames together with publication/policy snapshots. */
    public static void invalidateOperationCapabilities() {OperationScope scope=activeScope;while(scope!=null){scope.capabilities.clear();scope=scope.previous;}}
    private static String capabilityKey(CardstackOpportunityEditTypes.StoredState state) {
        if(activeScope==null)return null;CardstackConnectionAccess.requireUser();
        if(!activeScope.actorId18.equals(CardstackConnectionTypes.normalizeId(UserInfo.getUserId())) || !activeScope.orgId18.equals(CardstackConnectionTypes.normalizeId(UserInfo.getOrganizationId())) || !activeScope.actorId18.equals(state.actorId) || !activeScope.orgId18.equals(state.orgId) || !activeScope.client.equals(state.client))throw new ServiceException('INVALID_OPERATION_SCOPE');
        return CardstackOpportunityEditTypes.digest(new List<Object>{state.actorId,state.orgId,state.client,state.objectApiName,state.recordId,state.actionName,state.actionDigest,state.flowApiName,state.flowPublicationRevision,state.flowPlanHash,state.policyDigest,state.capabilityVersion,state.status=='Completed'});
    }
    private static void rememberCapability(CardstackOpportunityEditTypes.StoredState state,CardstackRecordScreenCapability.Definition capability) {String key=capabilityKey(state);if(key!=null)activeScope.capabilities.put(key,capability);}
    public with sharing class TransitionRequest {
        public String interactionKey,operation,reviewGrant;public Integer expectedRevision,reviewRevision;public List<CardstackFlowTypes.Answer> answers;
    }
    /** Starts only a published verified plan whose real native fields intersect the current action and policy. */
    public static CardstackOpportunityEditTypes.Envelope start(String client,Id recordId,String actionName) {
        OperationScope scope;
        try {
            CardstackConnectionAccess.requireUser();CardstackConnectionTypes.requireClient(client);scope=openOperation(client);
            String objectApi=CardstackRecordScreenCapability.recordType(recordId).getDescribe().getName();
            CardstackRecordActionService.Definition action=CardstackRecordActionService.resolve(objectApi,actionName);
            if(action.type!='screen-flow')throw new ServiceException('INVALID_FLOW_ACTION');
            CardstackFlowPublication.Published publication=CardstackFlowPublication.load(action.flowApiName);CardstackFlowPlan.Plan plan=CardstackFlowPlan.decode(publication.planJson);
            CardstackPolicyService.Policy policy=CardstackFlowPublication.policyForOperation(objectApi);if(publication.policyRevision!=policy.revision)throw new ServiceException('CONTEXT_CHANGED');
            CardstackRecordScreenCapability.Definition capability=CardstackRecordScreenCapability.flowDefinition(objectApi,action,policy,plan);
            CardstackOpportunityEditTypes.RecordContext current=CardstackRecordScreenCapability.readContext(recordId,capability,false);
            CardstackConnectionTypes.SetupSnapshot setup=CardstackConnectionSetupRepository.readUser(client);if(setup.setupView.enabledIntent!=true || !setup.isCurrentOrg())throw new ServiceException('EDIT_DISABLED');
            CardstackOpportunityEditTypes.StoredState state=new CardstackOpportunityEditTypes.StoredState();state.schemaVersion=5;state.kind='screen-flow-v1';state.processVersion='screen-flow/v1';
            state.flowApiName=action.flowApiName;state.flowPublicationRevision=publication.revision;state.flowPlanHash=publication.planHash;state.flowSourceHash=plan.identity.sourceHash;state.flowCompilerVersion=plan.compilerVersion;state.flowSchemaVersion=plan.schemaVersion;
            state.objectApiName=objectApi;state.capabilityVersion=capability.capabilityVersion;state.orderedFields=capability.fields;state.capabilityFingerprint=capability.fingerprint;state.capabilityMetadataFingerprint=CardstackRecordScreenCapability.metadataDigest(capability);
            state.actorId=CardstackConnectionTypes.normalizeId(UserInfo.getUserId());state.orgId=CardstackConnectionTypes.normalizeId(UserInfo.getOrganizationId());state.client=client;state.recordId=CardstackConnectionTypes.normalizeId(String.valueOf(recordId));state.recordName=CardstackRecordScreenCapability.recordName(capability,current.record);
            state.actionName=action.name;state.actionDigest=CardstackOpportunityEditTypes.digest(new List<Object>{'flow-action/v1',JSON.serialize(capability.action)});state.policyDigest=policy.revision;
            state.setupDigest=setup.configurationDigest;state.setupRevision=setup.setupView.revision;state.initialRecord=current;state.currencyCode=current.currencyCode;state.expiresAt=Datetime.now().addMinutes(15);state.revision=1;state.reviewRevision=0;state.status='Editing';
            CardstackFlowTypes.TrustedContext context=new CardstackFlowTypes.TrustedContext();context.currentRecord.put('Id',state.recordId);
            for(String field:plan.readSet){Object value=current.record.get(field);context.currentRecord.put(field,value==null?null:value instanceof Boolean?value:String.valueOf(value));}
            state.flowStateJson=JSON.serialize(CardstackFlowEngine.begin(plan,context));rememberCapability(state,capability);String key=CardstackOpportunityEditRepository.create(state);return envelope(state,key,null,capability,current,null);
        }catch(Exception e){return denial(code(e));}finally{closeOperation(scope);}
    }
    /** Validates wire operation ownership, rechecks drift/rights, then persists one cloned transition. */
    public static CardstackOpportunityEditTypes.Envelope transition(String client,TransitionRequest request) {
        Savepoint attempt;OperationScope scope;
        try {
            validateRequest(request);CardstackConnectionAccess.requireUser();CardstackConnectionTypes.requireClient(client);scope=openOperation(client);
            if(request.operation=='confirm') {
                CardstackOpportunityEditTypes.TransitionRequest confirm=new CardstackOpportunityEditTypes.TransitionRequest();confirm.interactionKey=request.interactionKey;confirm.operation='confirm';confirm.expectedRevision=request.expectedRevision;confirm.reviewRevision=request.reviewRevision;confirm.reviewGrant=request.reviewGrant;
                return CardstackOpportunityWriteService.confirmFlow(client,confirm);
            }
            CardstackOpportunityEditRepository.LockedInteraction locked=CardstackOpportunityEditRepository.lockOwned(client,request.interactionKey);CardstackOpportunityEditTypes.StoredState state=locked.state;
            if(!CardstackRecordScreenCapability.isFlow(state))throw new ServiceException('INVALID_INTERACTION');
            CardstackRecordScreenCapability.Definition capability=resolveCapability(state);CardstackOpportunityEditTypes.RecordContext current=CardstackRecordScreenCapability.readContext((Id)state.recordId,capability,false);
            if(request.expectedRevision!=state.revision)throw new ServiceException('STALE_REVISION');
            if(state.status=='Completed'){CardstackOpportunityEditRepository.requireCompletedReceipt(locked);if(request.operation!='resume')throw new ServiceException('PROCESS_COMPLETED');return envelope(state,request.interactionKey,null,capability,current,null);}
            if(new Set<String>{'Cancelled','Expired','Conflict'}.contains(state.status))return envelope(state,request.interactionKey,null,capability,current,null);
            if(state.expiresAt<=Datetime.now() || current.freshness!=state.initialRecord.freshness){attempt=Database.setSavepoint();terminate(locked,state,state.expiresAt<=Datetime.now()?'Expired':'Conflict');return envelope(state,request.interactionKey,null,capability,current,null);}
            CardstackFlowPlan.Plan plan=plan(state);
            if(request.operation=='resume' && state.status=='Editing')return envelope(state,request.interactionKey,null,capability,current,null);
            attempt=Database.setSavepoint();CardstackOpportunityEditRepository.invalidateReviewGrant(locked,state);String grant;
            if(request.operation=='resume' && state.status=='Review') {
                validateReviewState(state);state.revision++;state.reviewRevision++;
            }else {
                CardstackFlowTypes.EngineResult next=CardstackFlowEngine.apply(plan,CardstackFlowTypes.decode(state.flowStateJson),request.answers,request.operation);
                state.flowStateJson=JSON.serialize(next.state);state.status=next.state.status;state.revision++;state.patch=null;state.diff.clear();state.answers.clear();state.receipt=null;
                if(next.terminalProposal) {
                    state.answers=CardstackFlowEngine.terminal(plan,next.state);state.patch=CardstackRecordScreenCapability.canonicalize(current,capability,state.answers);state.diff=state.patch.diff;
                    if(state.patch.entries.isEmpty()){state.status='Completed';state.receipt=noChanges();}
                    else {state.status='Review';state.reviewRevision++;}
                }
            }
            if(state.status=='Review')grant=CardstackOpportunityEditRepository.issueReviewGrant(locked,state,CardstackOpportunityEditTypes.reviewSubject(state));
            CardstackOpportunityEditRepository.save(locked,state);return envelope(state,request.interactionKey,grant,capability,current,null);
        }catch(Exception e){if(attempt!=null)Database.rollback(attempt);return denial(code(e));}
        finally{if(attempt!=null)Database.releaseSavepoint(attempt);closeOperation(scope);}
    }
    /** Loads exact immutable publication; native active-source changes never transparently replace it. */
    public static CardstackFlowPlan.Plan plan(CardstackOpportunityEditTypes.StoredState state) {
        if(!CardstackRecordScreenCapability.isFlow(state))throw new ServiceException('INVALID_STATE');CardstackFlowPublication.Published published=CardstackFlowPublication.load(state.flowApiName);
        if(published.revision!=state.flowPublicationRevision || published.planHash!=state.flowPlanHash || published.policyRevision!=state.policyDigest)throw new ServiceException('CONTEXT_CHANGED');CardstackFlowPlan.Plan plan=CardstackFlowPlan.decode(published.planJson);
        if(plan.identity.sourceHash!=state.flowSourceHash || plan.schemaVersion!=state.flowSchemaVersion || plan.compilerVersion!=state.flowCompilerVersion)throw new ServiceException('CONTEXT_CHANGED');return plan;
    }
    /** Reconstructs current authorized terminal capability; never uses browser field mappings. */
    public static CardstackRecordScreenCapability.Definition resolveCapability(CardstackOpportunityEditTypes.StoredState state) {
        CardstackFlowPlan.Plan plan=plan(state);String key=capabilityKey(state);
        if(key!=null && activeScope.capabilities.containsKey(key)){CardstackRecordScreenCapability.Definition cached=activeScope.capabilities.get(key);CardstackRecordScreenCapability.validateCapabilityContext(state,cached);return cached;}
        CardstackRecordActionService.Definition action=CardstackRecordActionService.resolve(state.objectApiName,state.actionName);
        CardstackRecordScreenCapability.Definition capability=CardstackRecordScreenCapability.flowDefinition(state.objectApiName,action,CardstackFlowPublication.policyForOperation(state.objectApiName),plan);
        if(state.status=='Completed')CardstackRecordScreenCapability.markFlowCompleted(capability);
        else for(String field:capability.fields)if(capability.objectType.getDescribe().fields.getMap().get(field).getDescribe().getType()==Schema.DisplayType.Picklist){CardstackRecordScreenCapability.readContext((Id)state.recordId,capability,false);break;}
        CardstackRecordScreenCapability.validateCapabilityContext(state,capability);rememberCapability(state,capability);return capability;
    }
    /** Ensures persisted reviewed answers are exactly the pure terminal proposal before grant or save. */
    public static void validateReviewState(CardstackOpportunityEditTypes.StoredState state) {
        List<CardstackOpportunityEditTypes.FieldChange> proposal=CardstackFlowEngine.terminal(plan(state),CardstackFlowTypes.decode(state.flowStateJson));
        if(JSON.serialize(proposal)!=JSON.serialize(state.answers))throw new ServiceException('INVALID_REVIEW_CONTEXT');
    }
    /** Shared writer presentation seam keeps Flow family in review/receipt rather than coercing it to record-edit. */
    public static CardstackOpportunityEditTypes.Envelope envelope(CardstackOpportunityEditTypes.StoredState state,String key,String grant,CardstackRecordScreenCapability.Definition capability,CardstackOpportunityEditTypes.RecordContext current,CardstackOpportunityEditTypes.FieldError error) {
        CardstackOpportunityEditTypes.Envelope result=new CardstackOpportunityEditTypes.Envelope();result.interactionKey=key;result.reviewGrant=grant;result.view=new CardstackOpportunityEditTypes.View();
        result.view.contractVersion='screen-flow/v1';result.view.objectApiName=state.objectApiName;result.view.recordId=state.recordId;result.view.recordName=state.recordName;result.view.status=state.status;result.view.revision=state.revision;result.view.reviewRevision=state.reviewRevision;result.view.expiresAt=state.expiresAt.formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\'');result.view.diff=state.diff;result.view.receipt=state.receipt;
        result.view.fields=CardstackRecordScreenCapability.describeFields(capability,current);
        if(state.status=='Editing' || state.status=='Review'){result.view.screen=CardstackFlowEngine.project(plan(state),CardstackFlowTypes.decode(state.flowStateJson));result.view.screen.revision=state.revision;}
        if(error!=null)result.view.errors.add(error);return result;
    }
    private static void terminate(CardstackOpportunityEditRepository.LockedInteraction locked,CardstackOpportunityEditTypes.StoredState state,String status) {
        CardstackOpportunityEditRepository.invalidateReviewGrant(locked,state);CardstackFlowTypes.EngineResult cancelled=CardstackFlowEngine.apply(plan(state),CardstackFlowTypes.decode(state.flowStateJson),null,'cancel');state.flowStateJson=JSON.serialize(cancelled.state);state.status=status;state.answers.clear();state.patch=null;state.diff.clear();state.receipt=null;state.revision++;CardstackOpportunityEditRepository.save(locked,state);
    }
    private static void validateRequest(TransitionRequest r) {
        if(r==null || Blob.valueOf(JSON.serialize(r)).size()>16384 || r.expectedRevision==null || r.expectedRevision<1 || String.isBlank(r.interactionKey) || !new Set<String>{'next','answer','back','cancel','resume','confirm'}.contains(r.operation))throw new ServiceException('INVALID_REQUEST');
        if(r.operation!='next' && r.operation!='answer' && r.answers!=null)throw new ServiceException('UNEXPECTED_ANSWERS');
        if(r.operation=='confirm'){if(r.reviewRevision==null || r.reviewGrant==null)throw new ServiceException('INVALID_CONFIRM');}else if(r.reviewRevision!=null || r.reviewGrant!=null)throw new ServiceException('UNEXPECTED_GRANT');
    }
    private static CardstackOpportunityEditTypes.Receipt noChanges() {CardstackOpportunityEditTypes.Receipt r=new CardstackOpportunityEditTypes.Receipt();r.reference='receipt-'+EncodingUtil.convertToHex(Crypto.generateAesKey(128));r.status='noChanges';r.actorDisplayName=UserInfo.getName();r.completedAt=Datetime.now().formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\'');return r;}
    private static CardstackOpportunityEditTypes.Envelope denial(String code) {CardstackOpportunityEditTypes.Envelope result=new CardstackOpportunityEditTypes.Envelope();result.view=new CardstackOpportunityEditTypes.View();result.view.contractVersion='screen-flow/v1';result.view.status=code=='CONTEXT_CHANGED'?'Conflict':'Rejected';CardstackOpportunityEditTypes.FieldError error=new CardstackOpportunityEditTypes.FieldError();error.code=code;error.message='The Flow request could not be completed.';result.view.errors.add(error);return result;}
    private static String code(Exception e) {String code=e.getMessage();return code!=null && Pattern.matches('[A-Z][A-Z0-9_]{0,79}',code)?code:'FLOW_UNAVAILABLE';}
}
