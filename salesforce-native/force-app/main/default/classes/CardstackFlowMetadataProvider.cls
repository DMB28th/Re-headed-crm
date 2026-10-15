/** Dedicated admin-only exact-version Tooling lane. Ordinary runtime never calls this provider. */
public with sharing class CardstackFlowMetadataProvider {
    public class AcquisitionException extends Exception {}
    private static final String BASE='callout:CardstackFlowMetadataQa';
    public with sharing class Acquired {
        public CardstackFlowPlan.Identity identity;public String rawMetadata;
        public String actorId18,orgId18;public Datetime acquiredAt;
    }
    /** Checks the explicit Studio admin permission before any metadata connection access. */
    public static void requireStudioAdmin() {
        if(UserInfo.getUserType()=='Guest' || !FeatureManagement.checkPermission('Cardstack_Manage_Studio'))throw new AcquisitionException('NOT_AUTHORIZED');
    }
    /** Pins active definition/version identity and re-reads its pointer after retrieval. */
    public static Acquired acquire(String definitionId18) {
        requireStudioAdmin();String selected=id18(definitionId18);
        Map<String,Object> actor=get('/services/oauth2/userinfo');
        if(!id18((String)actor.get('user_id')).equals(CardstackConnectionTypes.normalizeId(UserInfo.getUserId())) || !id18((String)actor.get('organization_id')).equals(CardstackConnectionTypes.normalizeId(UserInfo.getOrganizationId())))throw new AcquisitionException('ACQUISITION_ACTOR_OR_ORG');
        Map<String,Object> definition=definition(selected);String active=id18((String)definition.get('ActiveVersionId'));
        Map<String,Object> version=oneQuery('SELECT Id, DefinitionId, VersionNumber, Status, ProcessType, Metadata FROM Flow WHERE Id = \''+active+'\'');
        if(!id18((String)version.get('Id')).equals(active) || !id18((String)version.get('DefinitionId')).equals(selected) || version.get('Status')!='Active' || version.get('ProcessType')!='Flow')throw new AcquisitionException('ACQUISITION_IDENTITY');
        if(!(version.get('Metadata') instanceof Map<String,Object>))throw new AcquisitionException('METADATA_UNAVAILABLE');
        Map<String,Object> after=definition(selected);if(!id18((String)after.get('ActiveVersionId')).equals(active))throw new AcquisitionException('SOURCE_ACTIVE_VERSION_CHANGED');
        Acquired result=new Acquired();result.identity=new CardstackFlowPlan.Identity();result.identity.definitionId18=selected;result.identity.versionId18=active;
        result.identity.versionNumber=Decimal.valueOf(String.valueOf(version.get('VersionNumber'))).intValue();result.identity.apiName=(String)definition.get('DeveloperName');result.identity.namespace=(String)definition.get('NamespacePrefix');result.identity.apiVersion='67.0';
        result.rawMetadata=JSON.serialize(version.get('Metadata'));result.identity.sourceHash=CardstackFlowPlan.hash(version.get('Metadata'));
        result.actorId18=CardstackConnectionTypes.normalizeId(UserInfo.getUserId());result.orgId18=CardstackConnectionTypes.normalizeId(UserInfo.getOrganizationId());result.acquiredAt=Datetime.now();return result;
    }
    private static Map<String,Object> definition(String selected) {Map<String,Object> row=oneQuery('SELECT Id, DeveloperName, NamespacePrefix, ActiveVersionId FROM FlowDefinition WHERE Id = \''+selected+'\'');if(!id18((String)row.get('Id')).equals(selected))throw new AcquisitionException('ACQUISITION_IDENTITY');if(row.get('ActiveVersionId')==null)throw new AcquisitionException('NO_ACTIVE_VERSION');return row;}
    private static Map<String,Object> oneQuery(String query) {
        Map<String,Object> result=get('/services/data/v67.0/tooling/query?q='+EncodingUtil.urlEncode(query,'UTF-8'));
        if(result.get('done')!=true || result.get('totalSize')!=1 || !(result.get('records') instanceof List<Object>))throw new AcquisitionException('METADATA_ROW_COUNT');List<Object> rows=(List<Object>)result.get('records');if(rows.size()!=1 || !(rows[0] instanceof Map<String,Object>))throw new AcquisitionException('METADATA_ROW_COUNT');return (Map<String,Object>)rows[0];
    }
    private static Map<String,Object> get(String path) {
        HttpRequest request=new HttpRequest();request.setEndpoint(BASE+path);request.setMethod('GET');request.setTimeout(20000);request.setHeader('Accept','application/json');
        HttpResponse response;
        try {response=new Http().send(request);}catch(CalloutException e){throw new AcquisitionException('ACQUISITION_CONNECTION_UNAVAILABLE',e);}
        if(response.getStatusCode()==401 || response.getStatusCode()==403)throw new AcquisitionException('METADATA_ACCESS_DENIED');
        if(response.getStatusCode()!=200 || Blob.valueOf(response.getBody()).size()>262144)throw new AcquisitionException('METADATA_UNAVAILABLE');
        try {Object body=JSON.deserializeUntyped(response.getBody());if(!(body instanceof Map<String,Object>))throw new AcquisitionException('METADATA_INVALID_RESPONSE');return (Map<String,Object>)body;}catch(JSONException e){throw new AcquisitionException('METADATA_INVALID_RESPONSE',e);}
    }
    private static String id18(String value) {
        if(value==null)throw new AcquisitionException('ACQUISITION_IDENTITY');try {return CardstackConnectionTypes.normalizeId(value);}catch(CardstackConnectionTypes.ConnectionException e){throw new AcquisitionException('ACQUISITION_IDENTITY',e);}
    }
}
