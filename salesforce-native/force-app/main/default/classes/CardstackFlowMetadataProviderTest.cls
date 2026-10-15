/** Dedicated native acquisition contract tests. Mocked transport never proves connection activation. */
@IsTest
private with sharing class CardstackFlowMetadataProviderTest {
    @TestSetup static void permissions(){CardstackRecordEditTestData.grantCurrentActorAdmin();}
    private class NativeMock implements HttpCalloutMock {
        private Integer calls=0;private Boolean drift=false,denied=false,nullMetadata=false,wrongActor=false;
        public HttpResponse respond(HttpRequest request) {
            Assert.isTrue(request.getEndpoint().startsWith('callout:CardstackFlowMetadataQa/'),'Only fixed dedicated native connection');Assert.areEqual('GET',request.getMethod(),'Read-only acquisition');calls++;HttpResponse response=new HttpResponse();response.setStatusCode(denied?403:200);
            if(denied){response.setBody('[]');return response;}
            CardstackFlowPlan.Identity identity=CardstackFlowTestData.identity();Object body;
            if(calls==1)body=new Map<String,Object>{'user_id'=>wrongActor?CardstackConnectionTypes.normalizeId('005000000000001'):CardstackConnectionTypes.normalizeId(UserInfo.getUserId()),'organization_id'=>CardstackConnectionTypes.normalizeId(UserInfo.getOrganizationId())};
            else {
                Map<String,Object> row=calls==3?new Map<String,Object>{'Id'=>identity.versionId18,'DefinitionId'=>identity.definitionId18,'VersionNumber'=>1,'Status'=>'Active','ProcessType'=>'Flow','Metadata'=>nullMetadata?null:CardstackFlowTestData.metadata()}:new Map<String,Object>{'Id'=>identity.definitionId18,'DeveloperName'=>identity.apiName,'NamespacePrefix'=>'','ActiveVersionId'=>calls==4 && drift?CardstackConnectionTypes.normalizeId('301000000000002'):identity.versionId18};
                body=new Map<String,Object>{'done'=>true,'totalSize'=>1,'records'=>new List<Object>{row}};
            }
            response.setBody(JSON.serialize(body));return response;
        }
    }
    @IsTest static void exactVersionAndStablePointerAcquired() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Test.setMock(HttpCalloutMock.class,new NativeMock());Test.startTest();CardstackFlowMetadataProvider.Acquired result=CardstackFlowMetadataProvider.acquire(CardstackFlowTestData.identity().definitionId18);Test.stopTest();
            Assert.areEqual(CardstackFlowTestData.identity().versionId18,result.identity.versionId18,'Exact active selected version');Assert.areEqual(CardstackFlowPlan.hash(CardstackFlowTestData.metadata()),result.identity.sourceHash,'Full acquired metadata hash');Assert.areEqual('67.0',result.identity.apiVersion,'Supported API');
        }
    }
    @IsTest static void activePointerDriftFailsAcquisition() {NativeMock mock=new NativeMock();mock.drift=true;denied(mock,'SOURCE_ACTIVE_VERSION_CHANGED');}
    @IsTest static void permissionDeniedIsNotEmptyFlow() {NativeMock mock=new NativeMock();mock.denied=true;denied(mock,'METADATA_ACCESS_DENIED');}
    @IsTest static void studioPreparationReturnsPrimitiveFailureReport() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            NativeMock mock=new NativeMock();mock.denied=true;Test.setMock(HttpCalloutMock.class,mock);
            Test.startTest();Map<String,Object> response=CardstackStudioController.prepareInterpretedFlowDraft(CardstackFlowTestData.identity().definitionId18);Test.stopTest();
            Assert.areEqual('ACQUISITION_FAILED',response.get('status'),'Denied acquisition is a bounded explicit outcome.');
            Map<String,Object> report=(Map<String,Object>)response.get('report');
            Assert.areEqual('ACQUISITION_FAILED',report.get('verdict'),'Controller returns a primitive report with a visible verdict.');
            Map<String,Object> issue=(Map<String,Object>)((List<Object>)report.get('issues'))[0];
            Assert.areEqual('METADATA_ACCESS_DENIED',issue.get('code'),'Native error survives the Studio return boundary.');
            Assert.isFalse(response.containsKey('draftId'),'Failure never invents a staged plan.');
        }
    }
    @IsTest static void missingMetadataFailsAcquisition() {NativeMock mock=new NativeMock();mock.nullMetadata=true;denied(mock,'METADATA_UNAVAILABLE');}
    @IsTest static void wrongActorFailsAcquisition() {NativeMock mock=new NativeMock();mock.wrongActor=true;denied(mock,'ACQUISITION_ACTOR_OR_ORG');}
    private static void denied(NativeMock mock,String code) {
        System.runAs(new User(Id=UserInfo.getUserId())) {Test.setMock(HttpCalloutMock.class,mock);Test.startTest();try{CardstackFlowMetadataProvider.acquire(CardstackFlowTestData.identity().definitionId18);Assert.fail('Acquisition must fail closed');}catch(CardstackFlowMetadataProvider.AcquisitionException e){Assert.areEqual(code,e.getMessage(),'Stable acquisition error');}Test.stopTest();}
    }
}
