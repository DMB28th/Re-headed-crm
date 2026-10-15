/**
 * Shared field/record context, pure digest helpers, and versioned edit DTOs.
 */
public with sharing class CardstackOpportunityEditTypes {
    /**
     * Resolve the actual Opportunity record type, or platform master when absent.
     * @param record Authorized Opportunity read; RecordTypeId must be loaded if present.
     * @return Platform-derived full checksum18 context; never the user's default type.
     * @throws ContextException When context cannot be established.
     */
    public static String getRecordTypeContext(SObject record) {
        if (record == null || record.getSObjectType() != Opportunity.SObjectType) {
            throw new ContextException('RECORD_CONTEXT_UNAVAILABLE');
        }
        Schema.DescribeSObjectResult describe = Opportunity.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED);
        if (describe.fields.getMap().containsKey('RecordTypeId')) {
            try {
                Object actual = record.get('RecordTypeId');
                if (actual != null) { return requireRecordTypeContext(String.valueOf(actual)); }
            } catch (SObjectException error) {
                throw new ContextException('RECORD_CONTEXT_UNAVAILABLE', error);
            }
        }
        for (Schema.RecordTypeInfo info : describe.getRecordTypeInfos()) {
            if (info.isMaster()) { return requireRecordTypeContext(String.valueOf(info.getRecordTypeId())); }
        }
        throw new ContextException('RECORD_CONTEXT_UNAVAILABLE');
    }

    /**
     * @param recordTypeId Platform context identity; 15-character inputs normalize.
     * @return Verified full checksum18 context belonging to Opportunity.
     * @throws ContextException For invalid, mismatched or missing context.
     */
    public static String requireRecordTypeContext(String recordTypeId) {
        try {
            String normalized = CardstackConnectionTypes.normalizeId(recordTypeId);
            Id contextId = Id.valueOf(normalized);
            if (!Opportunity.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED).getRecordTypeInfosById().containsKey(contextId)) {
                throw new ContextException('RECORD_CONTEXT_UNAVAILABLE');
            }
            return normalized;
        } catch (CardstackConnectionTypes.ConnectionException error) {
            throw new ContextException('RECORD_CONTEXT_UNAVAILABLE', error);
        } catch (TypeException error) {
            throw new ContextException('RECORD_CONTEXT_UNAVAILABLE', error);
        }
    }

    /**
     * @param parts Ordered canonical scalar/list parts, with explicit nulls.
     * @return SHA-256 of unambiguous JSON; callers sort their field/value sets.
     */
    public static String digest(List<Object> parts) {
        if (parts == null) { throw new ContextException('INVALID_DIGEST_CONTEXT'); }
        return EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256', Blob.valueOf(JSON.serialize(parts))));
    }

    /** Safe context failure; no identities or CRM values in messages. */
    public class ContextException extends Exception {}

    /** Literal answer; omission, set and clear have distinct meanings. */
    public with sharing class FieldChange {
        public String fieldApi;
        public String operation;
        public String value;
    }
    /** Display label never substitutes for the Stage API value. */
    public with sharing class Choice {
        public String label;
        public String value;
    }
    /** Exact options scoped to a full checksum18 record type context. */
    public with sharing class StageContext {
        public String recordTypeId;
        public List<Choice> choices = new List<Choice>();
        public String fingerprint;
    }
    /** Authorized typed read and currency/freshness binding. */
    public with sharing class RecordContext {
        public SObject record;
        public String currencyCode;
        public String freshness;
    }
    /** Restrictive published policy projection; native Describe adds constraints. */
    public with sharing class Policy {
        public Set<String> editableFields = new Set<String>();
        public Set<String> requiredFields = new Set<String>();
        public Set<String> clearableFields = new Set<String>();
    }
    /** Exact canonical before/proposed values for server review. */
    public with sharing class DiffRow {
        public String fieldApi;
        public String label;
        public String beforeValue;
        public String afterValue;
    }
    /** Typed patch with canonical strings; no persistence or execution authority. */
    public with sharing class CanonicalPatch {
        public List<CardstackPreviewUpdateAction.PatchEntry> entries = new List<CardstackPreviewUpdateAction.PatchEntry>();
        public Map<String, Object> typedValues = new Map<String, Object>();
        public List<DiffRow> diff = new List<DiffRow>();
        public String digest;
    }
    /** One declared host-mediated operation; private keys are never public view fields. */
    public with sharing class TransitionRequest {
        public String interactionKey;
        public Integer expectedRevision;
        public String operation;
        public List<FieldChange> changes;
        public Integer reviewRevision;
        public String reviewGrant;
    }
    /** Public renderer contract; scalar date/decimal values remain strings. */
    public with sharing class View {
        public String contractVersion;
        public String objectApiName;
        public Map<String,Object> layout;
        public CardstackFlowTypes.ScreenProjection screen;
        public String status;
        public String recordId;
        public String recordName;
        public Integer revision;
        public Integer reviewRevision;
        public String expiresAt;
        public List<FieldView> fields = new List<FieldView>();
        public List<DiffRow> diff = new List<DiffRow>();
        public List<FieldError> errors = new List<FieldError>();
        public Receipt receipt;
    }
    /** Fixed authorized input descriptor; choices contain Stage API values. */
    public with sharing class FieldView {
        public String fieldApi;
        public String label;
        public String value;
        public String dataType;
        public Boolean required;
        public Boolean canClear;
        public List<Choice> choices = new List<Choice>();
        public String currencyCode;
        public Integer length;
        public Integer precision;
        public Integer scale;
    }
    /** Bounded public validation reason, without raw private state. */
    public with sharing class FieldError {
        public String fieldApi;
        public String code;
        public String message;
    }
    /** Adapter must export view only; private strings belong exclusively in _meta. */
    public with sharing class Envelope {
        public View view;
        public String interactionKey;
        public String reviewGrant;
    }
    /** Private tagged state. No raw interaction handle or grant is stored here. */
    public with sharing class StoredState {
        public Integer schemaVersion;
        public String flowApiName,flowPublicationRevision,flowPlanHash,flowSourceHash,flowCompilerVersion,flowSchemaVersion,flowStateJson;
        public String objectApiName;
        public String capabilityVersion;
        public List<String> orderedFields;
        public String capabilityFingerprint;
        public String capabilityMetadataFingerprint;
        public String kind;
        public String actorId;
        public String orgId;
        public String client;
        public String recordId;
        public String recordName;
        public String actionName;
        public String actionDigest;
        public String processVersion;
        public String policyDigest;
        public String setupDigest;
        public Integer setupRevision;
        public Datetime expiresAt;
        public RecordContext initialRecord;
        public StageContext initialStages;
        public String currencyCode;
        public List<FieldChange> answers = new List<FieldChange>();
        public CanonicalPatch patch;
        public List<DiffRow> diff = new List<DiffRow>();
        public Integer revision;
        public Integer reviewRevision;
        public Id confirmationId;
        public String status;
        public Receipt receipt;
    }
    /** Completion view retained privately; exported QA/support evidence omits CRM values. */
    public with sharing class Receipt {
        public String reference;
        public String actorDisplayName;
        public String completedAt;
        public List<DiffRow> diff = new List<DiffRow>();
        public String status;
    }
    /**
     * Deterministic review binding shared by orchestration and the private store.
     * @param state Actor-owned pinned state with a revalidated canonical review.
     * @return Ordered subject; raw keys and mutable confirmation identity are excluded.
     */
    public static String reviewSubject(StoredState state) {
        return reviewSubject(state, state == null ? null : state.revision);
    }
    /**
     * @param state Owned pinned state; all other bindings remain unchanged.
     * @param consumedRevision Repository-selected original revision for completed replay.
     * @return Exact original review subject without mutating stored state.
     */
    public static String reviewSubject(StoredState state, Integer consumedRevision) {
        if (state == null || state.patch == null || state.initialRecord == null || (!CardstackRecordScreenCapability.isNative(state) && state.initialStages == null)) {
            throw new ContextException('INVALID_REVIEW_CONTEXT');
        }
        if (consumedRevision == null || consumedRevision < 1) { throw new ContextException('INVALID_REVIEW_CONTEXT'); }
        List<Object> entries = new List<Object>();
        for (CardstackPreviewUpdateAction.PatchEntry entry : state.patch.entries) {
            entries.add(new List<Object>{entry.fieldApiName, entry.newValue});
        }
        if (CardstackRecordScreenCapability.isNative(state)) {
            if(CardstackRecordScreenCapability.isFlow(state))return JSON.serialize(new List<Object>{'screen-flow-review/v1',state.schemaVersion,state.kind,state.objectApiName,state.capabilityVersion,state.orderedFields,state.capabilityFingerprint,state.capabilityMetadataFingerprint,state.actorId,state.orgId,state.client,state.recordId,state.processVersion,state.actionName,state.actionDigest,state.policyDigest,state.setupDigest,state.setupRevision,consumedRevision,state.reviewRevision,state.expiresAt,state.patch.digest,entries,state.initialRecord.freshness,state.currencyCode,state.flowApiName,state.flowPublicationRevision,state.flowPlanHash,state.flowSourceHash,state.flowCompilerVersion,state.flowSchemaVersion,digest(new List<Object>{state.flowStateJson})});
            if(state.schemaVersion==4) return JSON.serialize(new List<Object>{'record-review/v3',state.schemaVersion,state.objectApiName,state.capabilityVersion,
                state.orderedFields,state.capabilityFingerprint,state.capabilityMetadataFingerprint,state.actorId,state.orgId,state.client,state.recordId,state.processVersion,state.actionName,state.actionDigest,state.policyDigest,
                state.setupDigest,state.setupRevision,consumedRevision,state.reviewRevision,state.expiresAt,state.patch.digest,entries,state.initialRecord.freshness,state.currencyCode});
            if(state.schemaVersion==3) return JSON.serialize(new List<Object>{'record-review/v2',state.schemaVersion,state.objectApiName,state.capabilityVersion,
                state.orderedFields,state.capabilityFingerprint,state.actorId,state.orgId,state.client,state.recordId,state.processVersion,state.actionName,state.actionDigest,state.policyDigest,
                state.setupDigest,state.setupRevision,consumedRevision,state.reviewRevision,state.expiresAt,state.patch.digest,entries,state.initialRecord.freshness,state.currencyCode});
            return JSON.serialize(new List<Object>{'record-review/v1', state.objectApiName, state.capabilityVersion,
                state.orderedFields, state.capabilityFingerprint, state.actorId, state.orgId, state.client,
                state.recordId, state.processVersion, state.actionName, state.actionDigest, state.policyDigest,
                state.setupDigest, state.setupRevision, consumedRevision, state.reviewRevision, state.expiresAt,
                state.patch.digest, entries, state.initialRecord.freshness});
        }
        return JSON.serialize(new List<Object>{'opportunity-review/v1', state.actorId, state.orgId, state.client,
            state.recordId, state.processVersion, state.actionName, state.actionDigest, state.policyDigest,
            state.setupDigest, state.setupRevision, consumedRevision, state.reviewRevision, state.expiresAt,
            state.patch.digest, entries, state.initialRecord.freshness, state.initialStages.fingerprint, state.currencyCode});
    }
    /**
     * @param published Current published Opportunity policy; callers validate its action/rights.
     * @return Domain projection that only restricts the fixed native fields.
     */
    public static Policy restrictPolicy(CardstackPolicyService.Policy published) {
        if (published == null || published.objectApiName == null || !published.objectApiName.equals('Opportunity')
            || published.editEnabled != true || published.fields == null) { throw new ContextException('INVALID_POLICY'); }
        Policy result = new Policy();
        Set<String> fixed = new Set<String>{'StageName', 'CloseDate', 'Amount'};
        for (CardstackPolicyService.FieldPolicy field : published.fields.values()) {
            if (field.required) { result.requiredFields.add(field.apiName); }
            if (fixed.contains(field.apiName) && !field.readOnly) { result.editableFields.add(field.apiName); }
        }
        if (result.editableFields.contains('Amount') && !result.requiredFields.contains('Amount')
            && Opportunity.Amount.getDescribe().isNillable()) { result.clearableFields.add('Amount'); }
        return result;
    }
}
