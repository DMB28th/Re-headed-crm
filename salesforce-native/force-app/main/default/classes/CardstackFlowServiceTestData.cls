/** Trusted backend-only synthetic publication fixture. No native acquisition or origin claim outside test context. */
@IsTest
public with sharing class CardstackFlowServiceTestData {
    public static final String API='SyntheticCaseDetails',ACTION='case_flow';
    public static void grantActor(){CardstackConfiguredCaseTestData.grantActor();}
    public static Case fixture() {return fixture(true);}
    public static Case fixture(Boolean allowBack) {
        Case record=CardstackConfiguredCaseTestData.fixture();
        Map<String,Object> layout=(Map<String,Object>)JSON.deserializeUntyped(CardstackConfiguredCaseTestData.layout('Case details'));
        List<Object> actions=(List<Object>)layout.get('actions');actions.add(new Map<String,Object>{'name'=>ACTION,'label'=>'Case Flow','enabled'=>true,'type'=>'screen-flow','flowApiName'=>API});
        // Test fixture directly creates native configuration. No runtime/admin route can accept its self-declared origin.
        Cardstack_Config__c config=[SELECT Id,Value__c FROM Cardstack_Config__c WHERE Name='layout:Case:default' WITH SYSTEM_MODE LIMIT 1];config.Value__c=JSON.serialize(layout);update as system config;
        CardstackFlowPlan.Identity identity=CardstackFlowTestData.identity();identity.apiName=API;
        CardstackFlowCompiler.Result compiled=CardstackFlowCompiler.compile(JSON.serialize(metadata(allowBack)),identity);Assert.areEqual('SUPPORTED',compiled.report.verdict,JSON.serialize(compiled.report));
        CardstackFlowPublication.Published p=new CardstackFlowPublication.Published();p.revision='synthetic-test-revision';p.planHash=compiled.planHash;p.policyRevision=CardstackPolicyService.resolve('Case').revision;p.planJson=JSON.serialize(compiled.plan);compiled.report.policyRevision=p.policyRevision;compiled.report.schemaCapabilityFingerprint=CardstackFlowPublication.validateCompiled(compiled.plan,CardstackPolicyService.resolve('Case'));p.reportJson=JSON.serialize(compiled.report);p.compatibilityReportHash=CardstackFlowPlan.hash(compiled.report);p.acquiredAt=Datetime.now();p.acquiredActorId18=CardstackConnectionTypes.normalizeId(UserInfo.getUserId());p.acquiredOrgId18=CardstackConnectionTypes.normalizeId(UserInfo.getOrganizationId());
        insert as system new Cardstack_Config__c(Name=CardstackFlowPublication.key(API),Value__c=JSON.serialize(p),Is_Active__c=true);return record;
    }
    public static Map<String,Object> metadata() {return metadata(true);}
    public static Map<String,Object> metadata(Boolean allowBack) {
        return new Map<String,Object>{'apiVersion'=>67.0,'processType'=>'Flow','status'=>'Active','label'=>'Synthetic Case details','start'=>new Map<String,Object>{'connector'=>CardstackFlowTestData.link('ChooseSubject')},'variables'=>new List<Object>{new Map<String,Object>{'name'=>'recordId','dataType'=>'String','isCollection'=>false,'isInput'=>true,'isOutput'=>false}},'screens'=>new List<Object>{
            new Map<String,Object>{'name'=>'ChooseSubject','label'=>'Case subject','allowBack'=>true,'allowPause'=>false,'connector'=>CardstackFlowTestData.link('ChooseDescription'),'fields'=>new List<Object>{CardstackFlowTestData.input('ProposedSubject','String',null)}},
            new Map<String,Object>{'name'=>'ChooseDescription','label'=>'Case description','allowBack'=>allowBack,'allowPause'=>false,'connector'=>CardstackFlowTestData.link('SaveCurrentCase'),'fields'=>new List<Object>{new Map<String,Object>{'name'=>'Details','fieldType'=>'RegionContainer','fieldText'=>'Details','regionContainerType'=>'SectionWithHeader','fields'=>new List<Object>{description()}}}}},
            'recordUpdates'=>new List<Object>{new Map<String,Object>{'name'=>'SaveCurrentCase','object'=>'Case','filterLogic'=>'and','filters'=>new List<Object>{new Map<String,Object>{'field'=>'Id','operator'=>'EqualTo','value'=>CardstackFlowTestData.ref('recordId')}},'inputAssignments'=>new List<Object>{new Map<String,Object>{'field'=>'Subject','value'=>CardstackFlowTestData.ref('ProposedSubject')},new Map<String,Object>{'field'=>'Description','value'=>CardstackFlowTestData.ref('ProposedDescription')}}}}};
    }
    private static Map<String,Object> description(){Map<String,Object> f=CardstackFlowTestData.input('ProposedDescription','String',null);f.put('isRequired',false);return f;}
    public static CardstackFlowService.TransitionRequest request(CardstackOpportunityEditTypes.Envelope previous,String operation) {
        CardstackFlowService.TransitionRequest r=new CardstackFlowService.TransitionRequest();r.operation=operation;r.interactionKey=previous.interactionKey;r.expectedRevision=previous.view.revision;
        if(operation=='confirm'){r.reviewRevision=previous.view.reviewRevision;r.reviewGrant=previous.reviewGrant;}return r;
    }
    public static CardstackOpportunityEditTypes.Envelope next(CardstackOpportunityEditTypes.Envelope previous,String input,Object value) {
        CardstackFlowService.TransitionRequest r=request(previous,'next');r.answers=new List<CardstackFlowTypes.Answer>{CardstackFlowTestData.answer(input,value)};return CardstackFlowService.transition('claude',r);
    }
    public static CardstackOpportunityEditTypes.Envelope review(Case record) {
        CardstackOpportunityEditTypes.Envelope first=CardstackFlowService.start('claude',record.Id,ACTION);Assert.areEqual('Editing',first.view.status,JSON.serialize(first.view.errors));
        CardstackOpportunityEditTypes.Envelope second=next(first,'ProposedSubject','Exact reviewed Subject');Assert.areEqual('Editing',second.view.status,JSON.serialize(second.view.errors));
        CardstackOpportunityEditTypes.Envelope review=next(second,'ProposedDescription','Exact reviewed description');Assert.areEqual('Review',review.view.status,JSON.serialize(review.view.errors));return review;
    }
}
