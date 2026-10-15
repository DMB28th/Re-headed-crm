/** Verified native acquisition, immutable plan publication, and runtime integrity. No browser metadata authority. */
public with sharing class CardstackFlowPublication {
    public class PublicationException extends Exception {}
    private static Boolean trustedAuthoring=false;
    @TestVisible private static Boolean failRebind=false;
    public with sharing class Published {
        public String contractVersion='cardstack-flow-publication/1';public String origin='NATIVE_EXACT_VERSION';
        public String revision;public String planHash,policyRevision,compatibilityReportHash;
        public String planJson,reportJson;public String acquiredActorId18,acquiredOrgId18;public Datetime acquiredAt;
    }
    /** Per-entrypoint token; its caches cannot survive close or be used by another actor/client. */
    public with sharing class OperationScope {
        private OperationScope previous;private String actorId18,orgId18,client;
        private Map<String,Published> publications=new Map<String,Published>();
        private Map<String,CardstackPolicyService.Policy> policies=new Map<String,CardstackPolicyService.Policy>();
    }
    private static OperationScope activeScope;
    /** Opens a fresh request frame, preserving a parent frame only for explicit nested entrypoints. */
    public static OperationScope openOperation(String client) {
        CardstackConnectionTypes.requireClient(client);OperationScope scope=new OperationScope();scope.previous=activeScope;scope.client=client;scope.actorId18=CardstackConnectionTypes.normalizeId(UserInfo.getUserId());scope.orgId18=CardstackConnectionTypes.normalizeId(UserInfo.getOrganizationId());activeScope=scope;return scope;
    }
    /** Exact scope token cleanup covers denial, replay, rollback and exceptions. */
    public static void closeOperation(OperationScope scope) {
        if(scope==null)return;if(activeScope!=scope)throw new PublicationException('INVALID_OPERATION_SCOPE');scope.publications.clear();scope.policies.clear();activeScope=scope.previous;
    }
    /** Only runtime frames reuse validated immutable policy; authoring/catalog always resolve directly. */
    public static CardstackPolicyService.Policy policyForOperation(String objectApi) {
        requireScopeActor();if(activeScope==null)return CardstackPolicyService.resolve(objectApi);
        if(!activeScope.policies.containsKey(objectApi))activeScope.policies.put(objectApi,CardstackPolicyService.resolve(objectApi));return activeScope.policies.get(objectApi);
    }
    /** Any native config publication invalidates all active/nested validated frames. */
    public static void invalidateOperations() {
        OperationScope scope=activeScope;while(scope!=null){scope.publications.clear();scope.policies.clear();scope=scope.previous;}CardstackFlowService.invalidateOperationCapabilities();
    }
    private static void requireScopeActor() {
        if(activeScope==null)return;CardstackConnectionAccess.requireUser();
        if(!activeScope.actorId18.equals(CardstackConnectionTypes.normalizeId(UserInfo.getUserId())) || !activeScope.orgId18.equals(CardstackConnectionTypes.normalizeId(UserInfo.getOrganizationId())))throw new PublicationException('INVALID_OPERATION_SCOPE');
    }
    /** Acquires exact native metadata before any draft DML; unsupported source never becomes a draft. */
    public static Map<String,Object> prepareDraft(String definitionId18) {
        CardstackFlowMetadataProvider.Acquired acquired;try{acquired=CardstackFlowMetadataProvider.acquire(definitionId18);}catch(CardstackFlowMetadataProvider.AcquisitionException e){CardstackFlowCompatibilityReport report=new CardstackFlowCompatibilityReport();report.verdict='ACQUISITION_FAILED';report.block(e.getMessage(),'$acquisition',null);return new Map<String,Object>{'status'=>'ACQUISITION_FAILED','report'=>report.studioView()};}
        CardstackFlowCompiler.Result compiled=CardstackFlowCompiler.compile(acquired.rawMetadata,acquired.identity);
        if(compiled.report.verdict!='SUPPORTED')return new Map<String,Object>{'status'=>'UNSUPPORTED','report'=>compiled.report.studioView()};
        CardstackPolicyService.Policy policy=CardstackPolicyService.resolve(compiled.plan.targetObjectApiName);
        compiled.report.policyRevision=policy.revision;compiled.report.schemaCapabilityFingerprint=validateCompiled(compiled.plan,policy);Published value=publication(compiled,acquired,policy.revision);String key=key(compiled.plan.identity.apiName);
        trustedAuthoring=true;Id draftId;
        try {String encoded=JSON.serialize(value);storageBudget(encoded);draftId=CardstackConfigService.saveDraft(key,encoded);}finally{trustedAuthoring=false;}
        return new Map<String,Object>{'status'=>'Draft','draftId'=>CardstackConnectionTypes.normalizeId(String.valueOf(draftId)),'key'=>key,'planHash'=>compiled.planHash,'report'=>compiled.report.studioView()};
    }
    /** Native pointer/source refresh happens before publication locks; exact reviewed digests still bind stored candidate. */
    public static void publishReviewed(Id draftId,String expectedLiveDigest,String expectedDraftDigest) {
        CardstackFlowMetadataProvider.requireStudioAdmin();
        List<Cardstack_Config_Draft__c> drafts=[SELECT Id,Config__r.Name,Draft_Value__c FROM Cardstack_Config_Draft__c WHERE Id=:draftId WITH USER_MODE LIMIT 1];
        if(drafts.size()!=1)throw new PublicationException('DRAFT_UNAVAILABLE');Published stored=decode(drafts[0].Draft_Value__c);CardstackFlowPlan.Plan plan=CardstackFlowPlan.decode(stored.planJson);
        if(drafts[0].Config__r.Name!=key(plan.identity.apiName))throw new PublicationException('PUBLICATION_IDENTITY');
        CardstackFlowMetadataProvider.Acquired fresh=CardstackFlowMetadataProvider.acquire(plan.identity.definitionId18);
        if(fresh.identity.versionId18!=plan.identity.versionId18 || fresh.identity.versionNumber!=plan.identity.versionNumber || fresh.identity.sourceHash!=plan.identity.sourceHash || fresh.identity.apiName!=plan.identity.apiName || fresh.identity.namespace!=plan.identity.namespace)throw new PublicationException('SOURCE_ACTIVE_VERSION_CHANGED');
        CardstackPolicyService.Policy policy=CardstackPolicyService.resolve(plan.targetObjectApiName);if(stored.policyRevision!=policy.revision)throw new PublicationException('POLICY_CHANGED');CardstackFlowCompatibilityReport report=(CardstackFlowCompatibilityReport)JSON.deserializeStrict(stored.reportJson,CardstackFlowCompatibilityReport.class);if(report.schemaCapabilityFingerprint!=validateCompiled(plan,policy))throw new PublicationException('SCHEMA_CHANGED');
        trustedAuthoring=true;try{CardstackConfigService.publishReviewedDraft(draftId,expectedLiveDigest,expectedDraftDigest);}finally{trustedAuthoring=false;}
    }
    /** Bounded native admin catalog; no raw plans, version IDs, reports or authority leave this projection. */
    public static Map<String,Object> catalog(String objectApi) {
        CardstackFlowMetadataProvider.requireStudioAdmin();CardstackPolicyService.Policy policy=CardstackPolicyService.resolve(objectApi);CardstackRecordScreenCapability.canonicalType(objectApi);
        String keyPattern='flow-plan:%:default';List<Cardstack_Config__c> rows=[SELECT Name,Value__c FROM Cardstack_Config__c WHERE Is_Active__c=true AND Name LIKE :keyPattern WITH USER_MODE ORDER BY Name LIMIT 13];
        Boolean hasMore=rows.size()>12;List<Object> plans=new List<Object>();Integer count=0;
        for(Cardstack_Config__c row:rows){if(count++>=12)break;try {
            Published p=decode(row.Value__c);CardstackFlowPlan.Plan plan=CardstackFlowPlan.decode(p.planJson);
            if(plan.targetObjectApiName!=objectApi || row.Name!=key(plan.identity.apiName) || p.policyRevision!=policy.revision || p.acquiredOrgId18!=CardstackConnectionTypes.normalizeId(UserInfo.getOrganizationId()))continue;
            CardstackFlowCompatibilityReport report=(CardstackFlowCompatibilityReport)JSON.deserializeStrict(p.reportJson,CardstackFlowCompatibilityReport.class);if(report.schemaCapabilityFingerprint!=validateCompiled(plan,policy))continue;
            plans.add(new Map<String,Object>{'apiName'=>plan.identity.apiName,'label'=>plan.identity.apiName,'targetObjectApiName'=>objectApi,'planHash'=>p.planHash});
        }catch(Exception e){continue; /* Corrupt, stale or unsupported configuration remains unavailable. */}}
        return new Map<String,Object>{'plans'=>plans,'hasMore'=>hasMore};
    }
    /** ConfigService must call this for every flow-plan authoring path; generic imported bodies cannot invoke the native lane. */
    public static void validateCandidate(String key,String raw) {
        if(key!=null && key.startsWith('layout:')){validateLayoutCandidate(key,raw);return;}
        if(key==null || !key.startsWith('flow-plan:'))return;
        if(!trustedAuthoring)throw new PublicationException('NATIVE_ACQUISITION_REQUIRED');Published value=decode(raw);CardstackFlowPlan.Plan plan=CardstackFlowPlan.decode(value.planJson);
        if(key!=key(plan.identity.apiName))throw new PublicationException('PUBLICATION_IDENTITY');
    }
    /** Atomically repins policy for the same immutable verified plans during the existing reviewed layout publication. The single FOR UPDATE query uses platform implicit Id ordering; API 67 rejects explicit ORDER BY. */
    public static void rebindReferencedPlans(String configKey,String rawCandidate) {
        invalidateOperations();
        if(configKey==null || !Pattern.matches('layout:[A-Za-z][A-Za-z0-9_]*:default',configKey))return;
        Map<String,Object> candidate=(Map<String,Object>)JSON.deserializeUntyped(rawCandidate);if(candidate==null || candidate.get('actions')==null)return;
        List<CardstackRecordActionService.Definition> actions=flowActions(candidate.get('actions'));Set<String> names=new Set<String>();
        for(CardstackRecordActionService.Definition action:actions)if(action!=null && action.type=='screen-flow' && action.enabled==true)names.add(key(action.flowApiName));if(names.isEmpty())return;
        CardstackFlowMetadataProvider.requireStudioAdmin();String objectApi=configKey.split(':')[1];CardstackPolicyService.Policy policy=CardstackPolicyService.resolveCandidate(objectApi,rawCandidate);
        List<Cardstack_Config__c> rows=[SELECT Id,Name,Value__c FROM Cardstack_Config__c WHERE Name IN :names AND Is_Active__c=true WITH USER_MODE FOR UPDATE];
        if(rows.size()!=names.size())throw new PublicationException('FLOW_NOT_PUBLISHED');List<Cardstack_Config__c> changes=new List<Cardstack_Config__c>();
        for(Cardstack_Config__c row:rows) {
            Published old=decode(row.Value__c);CardstackFlowPlan.Plan plan=CardstackFlowPlan.decode(old.planJson);
            if(plan.targetObjectApiName!=objectApi || row.Name!=key(plan.identity.apiName) || old.acquiredOrgId18!=CardstackConnectionTypes.normalizeId(UserInfo.getOrganizationId()))throw new PublicationException('PUBLICATION_IDENTITY');
            CardstackFlowCompatibilityReport report=(CardstackFlowCompatibilityReport)JSON.deserializeStrict(old.reportJson,CardstackFlowCompatibilityReport.class);report.policyRevision=policy.revision;report.schemaCapabilityFingerprint=validateCompiled(plan,policy);
            Published next=(Published)JSON.deserializeStrict(JSON.serialize(old),Published.class);next.revision=EncodingUtil.convertToHex(Crypto.generateAesKey(128));next.policyRevision=policy.revision;next.reportJson=JSON.serialize(report);next.compatibilityReportHash=CardstackFlowPlan.hash(report);
            String encoded=JSON.serialize(next);storageBudget(encoded);changes.add(new Cardstack_Config__c(Id=row.Id,Value__c=encoded));
        }
        if(Test.isRunningTest() && failRebind)throw new PublicationException('PUBLICATION_UNAVAILABLE');
        Database.update(changes,AccessLevel.USER_MODE);
    }
    private static List<CardstackRecordActionService.Definition> flowActions(Object raw) {
        if(!(raw instanceof List<Object>))throw new PublicationException('INVALID_LAYOUT_ACTIONS');List<CardstackRecordActionService.Definition> result=new List<CardstackRecordActionService.Definition>();
        Map<String,Integer> nameCounts=new Map<String,Integer>();for(Object item:(List<Object>)raw)if(item instanceof Map<String,Object>){Map<String,Object> action=(Map<String,Object>)item;if(action.get('name') instanceof String){String folded=((String)action.get('name')).toLowerCase();nameCounts.put(folded,(nameCounts.containsKey(folded)?nameCounts.get(folded):0)+1);}}
        Set<String> executionKeys=new Set<String>{'name','label','type','flowApiName','enabled','mappings'};
        Set<String> forbidden=new Set<String>{'recordId','target','targetReference','definitionId','versionId','plan','graph','planHash','sourceHash','publicationRevision','executionMode','source','inputs','fieldApi','connector','terminal'};
        for(Object item:(List<Object>)raw) {
            if(!(item instanceof Map<String,Object>))continue;Map<String,Object> action=(Map<String,Object>)item;
            if(!(action.get('type') instanceof String) || !'screen-flow'.equalsIgnoreCase((String)action.get('type')))continue;
            if(!'screen-flow'.equals((String)action.get('type')))throw new PublicationException('INVALID_FLOW_ACTION');
            if(action.get('name') instanceof String && nameCounts.get(((String)action.get('name')).toLowerCase())!=1)throw new PublicationException('DUPLICATE_FLOW_ACTION');
            for(String key:forbidden)if(action.containsKey(key) && action.get(key)!=null)throw new PublicationException('INVALID_FLOW_ACTION');
            Map<String,Object> projected=new Map<String,Object>();for(String key:executionKeys)if(action.containsKey(key))projected.put(key,action.get(key));
            try{result.add((CardstackRecordActionService.Definition)JSON.deserializeStrict(JSON.serialize(projected),CardstackRecordActionService.Definition.class));}catch(JSONException e){throw new PublicationException('INVALID_FLOW_ACTION',e);}
        }
        return result;
    }
    private static void validateLayoutCandidate(String configKey,String raw) {
        if(!Pattern.matches('layout:[A-Za-z][A-Za-z0-9_]*:default',configKey))return;
        Map<String,Object> layout=(Map<String,Object>)JSON.deserializeUntyped(raw);if(layout==null || layout.get('actions')==null)return;
        List<CardstackRecordActionService.Definition> actions=flowActions(layout.get('actions'));
        String objectApi=configKey.split(':')[1];CardstackPolicyService.Policy candidate;
        for(CardstackRecordActionService.Definition action:actions)if(action!=null && action.type=='screen-flow') {
            CardstackFlowMetadataProvider.requireStudioAdmin();if(candidate==null)candidate=CardstackPolicyService.resolveCandidate(objectApi,raw);
            if(String.isBlank(action.name) || !Pattern.matches('[A-Za-z0-9_-]{1,80}',action.name) || String.isBlank(action.label) || action.label.length()>160 || action.enabled==null || (action.mappings!=null && !action.mappings.isEmpty()))throw new PublicationException('INVALID_FLOW_ACTION');
            String stored=CardstackConfigService.getConfig(key(action.flowApiName));if(stored==null)throw new PublicationException('FLOW_NOT_PUBLISHED');Published p=decode(stored);CardstackFlowPlan.Plan plan=CardstackFlowPlan.decode(p.planJson);
            if(plan.targetObjectApiName!=objectApi || p.acquiredOrgId18!=CardstackConnectionTypes.normalizeId(UserInfo.getOrganizationId()))throw new PublicationException('PUBLICATION_IDENTITY');
            if(action.enabled==true){validateCompiled(plan,candidate);CardstackRecordScreenCapability.flowDefinition(objectApi,action,candidate,plan);}
            else {CardstackRecordActionService.Definition shape=(CardstackRecordActionService.Definition)JSON.deserializeStrict(JSON.serialize(action),CardstackRecordActionService.Definition.class);shape.mappings=new List<CardstackRecordActionService.Mapping>();for(String field:plan.writeSet){CardstackRecordActionService.Mapping mapping=new CardstackRecordActionService.Mapping();mapping.fieldApi=field;mapping.source='current';shape.mappings.add(mapping);}CardstackRecordScreenCapability.validateShape(objectApi,shape);}
        }
    }
    /** Runtime consumes only already published normalized plan; no Tooling, source fetch, or active-version refresh. */
    public static Published load(String apiName) {
        key(apiName);requireScopeActor();Published value;
        if(activeScope!=null && activeScope.publications.containsKey(apiName))value=activeScope.publications.get(apiName);
        else {String raw=CardstackConfigService.getConfig(key(apiName));if(raw==null)throw new PublicationException('FLOW_NOT_PUBLISHED');value=decode(raw);}
        // Reuse eliminates repeated SOQL only: schema/native permission and immutable bindings are rechecked.
        CardstackFlowPlan.Plan plan=CardstackFlowPlan.decode(value.planJson);CardstackPolicyService.Policy policy=policyForOperation(plan.targetObjectApiName);CardstackFlowCompatibilityReport report=(CardstackFlowCompatibilityReport)JSON.deserializeStrict(value.reportJson,CardstackFlowCompatibilityReport.class);if(value.policyRevision!=policy.revision || report.schemaCapabilityFingerprint!=validateCompiled(plan,policy))throw new PublicationException('CONTEXT_CHANGED');if(!plan.identity.apiName.equals(apiName) || !value.acquiredOrgId18.equals(CardstackConnectionTypes.normalizeId(UserInfo.getOrganizationId())))throw new PublicationException('PUBLICATION_IDENTITY');
        if(activeScope!=null)activeScope.publications.put(apiName,value);return value;
    }
    /** Rejects oversized serialized envelopes before any draft insertion; native lengths are independently checked. */
    public static void storageBudget(String raw) {
        if(raw==null || Blob.valueOf(raw).size()>120000 || raw.length()>Cardstack_Config__c.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED).fields.getMap().get('Value__c').getDescribe().getLength() || raw.length()>Cardstack_Config_Draft__c.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED).fields.getMap().get('Draft_Value__c').getDescribe().getLength())throw new PublicationException('PUBLICATION_BUDGET');
    }
    /** Revalidates all hashes/schema versions before using stored compiled authority. */
    public static Published decode(String raw) {
        if(String.isBlank(raw) || Blob.valueOf(raw).size()>120000)throw new PublicationException('PUBLICATION_BUDGET');
        Published value;
        try{value=(Published)JSON.deserializeStrict(raw,Published.class);}catch(JSONException e){throw new PublicationException('PUBLICATION_INVALID',e);}
        if(value.contractVersion!='cardstack-flow-publication/1' || value.origin!='NATIVE_EXACT_VERSION' || String.isBlank(value.revision) || value.acquiredAt==null || String.isBlank(value.acquiredActorId18) || String.isBlank(value.acquiredOrgId18))throw new PublicationException('PUBLICATION_INVALID');
        CardstackFlowPlan.Plan plan=CardstackFlowPlan.decode(value.planJson);CardstackFlowCompatibilityReport report=(CardstackFlowCompatibilityReport)JSON.deserializeStrict(value.reportJson,CardstackFlowCompatibilityReport.class);
        if(value.planHash!=CardstackFlowPlan.hash(plan) || value.compatibilityReportHash!=CardstackFlowPlan.hash(report) || report.verdict!='SUPPORTED' || !report.issues.isEmpty() || report.sourceHash!=plan.identity.sourceHash || CardstackFlowPlan.hash(report.identity)!=CardstackFlowPlan.hash(plan.identity) || report.compilerVersion!=plan.compilerVersion || report.policyRevision!=value.policyRevision || String.isBlank(report.schemaCapabilityFingerprint))throw new PublicationException('PUBLICATION_TAMPER');return value;
    }
    /** Publication-time native/policy codec intersection; runtime rechecks the same capability. */
    public static String validateCompiled(CardstackFlowPlan.Plan plan,CardstackPolicyService.Policy policy) {
        CardstackRecordActionService.Definition action=new CardstackRecordActionService.Definition();action.name='flow-publication-check';action.label='Flow publication';action.type='screen-flow';action.enabled=true;action.flowApiName=plan.identity.apiName;
        CardstackRecordScreenCapability.Definition native=CardstackRecordScreenCapability.flowDefinition(plan.targetObjectApiName,action,policy,plan);
        Map<String,String> types=new Map<String,String>();for(CardstackOpportunityEditTypes.FieldView field:native.descriptors)types.put(field.fieldApi,field.dataType);
        for(CardstackFlowPlan.Node n:plan.nodes)if(n.kind=='UPDATE')for(CardstackFlowPlan.Binding binding:n.assignments) {
            String type=types.get(binding.target);String input=binding.value.type;
            Boolean compatible=input=='String'?new Set<String>{'STRING','TEXTAREA','EMAIL','PHONE','URL','PICKLIST'}.contains(type):input=='Boolean'?type=='BOOLEAN':input=='Integer'?type=='INTEGER':input=='Decimal'?new Set<String>{'DECIMAL','DOUBLE','CURRENCY'}.contains(type):input=='Date'?type=='DATE':false;
            if(!compatible)throw new PublicationException('TERMINAL_TYPE_MISMATCH');
        }
        for(CardstackFlowPlan.Node n:plan.nodes){for(CardstackFlowPlan.Input input:n.inputs){readOperand(input.defaultValue,native.objectType);if(input.visibility!=null)for(CardstackFlowPlan.Atom atom:input.visibility.atoms){readOperand(atom.left,native.objectType);readOperand(atom.right,native.objectType);}}for(CardstackFlowPlan.Binding binding:n.assignments)readOperand(binding.value,native.objectType);for(CardstackFlowPlan.Rule rule:n.rules)for(CardstackFlowPlan.Atom atom:rule.predicate.atoms){readOperand(atom.left,native.objectType);readOperand(atom.right,native.objectType);}}
        return CardstackRecordScreenCapability.metadataDigest(native);
    }
    private static void readOperand(CardstackFlowPlan.Operand operand,Schema.SObjectType objectType) {
        if(operand==null || operand.kind!='currentRecordField')return;Schema.DescribeFieldResult shape=objectType.getDescribe(SObjectDescribeOptions.DEFERRED).fields.getMap().get(operand.reference).getDescribe();
        String nativeType=String.valueOf(shape.getType()).toUpperCase();Boolean compatible=operand.type=='String'?new Set<String>{'STRING','TEXTAREA','EMAIL','PHONE','URL','PICKLIST'}.contains(nativeType):operand.type=='Boolean'?nativeType=='BOOLEAN':operand.type=='Integer'?nativeType=='INTEGER':operand.type=='Decimal'?new Set<String>{'DOUBLE','CURRENCY'}.contains(nativeType):operand.type=='Date'?nativeType=='DATE':false;
        if(!compatible)throw new PublicationException('READ_TYPE_MISMATCH');
    }
    private static Published publication(CardstackFlowCompiler.Result compiled,CardstackFlowMetadataProvider.Acquired a,String policyRevision) {
        Published p=new Published();p.revision=EncodingUtil.convertToHex(Crypto.generateAesKey(128));p.planHash=compiled.planHash;p.policyRevision=policyRevision;p.planJson=JSON.serialize(compiled.plan);p.reportJson=JSON.serialize(compiled.report);p.compatibilityReportHash=CardstackFlowPlan.hash(compiled.report);p.acquiredActorId18=a.actorId18;p.acquiredOrgId18=a.orgId18;p.acquiredAt=a.acquiredAt;return p;
    }
    /** Exact config key; APIs are canonical case-sensitive even though storage Names are not. */
    public static String key(String apiName) {if(apiName==null || !Pattern.matches('[A-Za-z][A-Za-z0-9_]{0,79}',apiName))throw new PublicationException('FLOW_API_NAME');return 'flow-plan:'+apiName+':default';}
}
