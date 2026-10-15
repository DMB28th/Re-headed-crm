/** Shared native lifecycle tests; synthetic metadata provenance is explicitly confined to backend fixture setup. */
@IsTest
private with sharing class CardstackFlowServiceTest {
    @TestSetup static void permissions(){CardstackFlowServiceTestData.grantActor();}
    @IsTest static void navigationHasNoCrmEffectAndConfirmReplays() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Case record=CardstackFlowServiceTestData.fixture();Test.startTest();Integer queryStart=Limits.getQueries();CardstackOpportunityEditTypes.Envelope review=CardstackFlowServiceTestData.review(record);
            Assert.areEqual('Configured request',CardstackConfiguredCaseTestData.current(record.Id).Subject,'Navigation/review have no CRM effect');
            CardstackFlowService.TransitionRequest confirm=CardstackFlowServiceTestData.request(review,'confirm');CardstackOpportunityEditTypes.Envelope saved=CardstackFlowService.transition('claude',confirm);
            Assert.areEqual('Completed',saved.view.status,JSON.serialize(saved.view.errors));Assert.areEqual('screen-flow/v1',saved.view.contractVersion,'Distinct Flow receipt');Integer attempts=CardstackOpportunityWriteService.crmUpdateAttempts;
            CardstackOpportunityEditTypes.Envelope replay=CardstackFlowService.transition('claude',confirm);Assert.areEqual('Completed',replay.view.status,JSON.serialize(replay.view.errors));Assert.areEqual(attempts,CardstackOpportunityWriteService.crmUpdateAttempts,'Replay never attempts another write');Assert.areEqual(JSON.serialize(saved.view.receipt),JSON.serialize(replay.view.receipt),'Durable exact receipt');Assert.isTrue(Limits.getQueries()-queryStart<=80,'The complete fresh-operation sequence must fit an 80-query budget');Test.stopTest();
            Assert.areEqual('Exact reviewed Subject',CardstackConfiguredCaseTestData.current(record.Id).Subject,'Independent native read-back');Assert.areEqual(1,attempts,'One shared writer call');
        }
    }
    @IsTest static void requiredCompletionFailureRollsBackCrmSave() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Case record=CardstackFlowServiceTestData.fixture();CardstackOpportunityEditTypes.Envelope review=CardstackFlowServiceTestData.review(record);CardstackOpportunityEditRepository.failComplete=true;
            Test.startTest();CardstackOpportunityEditTypes.Envelope denied=CardstackFlowService.transition('claude',CardstackFlowServiceTestData.request(review,'confirm'));Test.stopTest();
            Assert.areEqual('Rejected',denied.view.status,'Required completion failure denies save');Assert.areEqual('Configured request',CardstackConfiguredCaseTestData.current(record.Id).Subject,'CRM transaction rolled back');
        }
    }
    @IsTest static void backInvalidatesGrantAndDropsLaterAnswer() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Case record=CardstackFlowServiceTestData.fixture();CardstackOpportunityEditTypes.Envelope review=CardstackFlowServiceTestData.review(record);
            Test.startTest();CardstackOpportunityEditTypes.Envelope back=CardstackFlowService.transition('claude',CardstackFlowServiceTestData.request(review,'back'));Assert.areEqual('Editing',back.view.status,JSON.serialize(back.view.errors));Assert.isNull(back.reviewGrant,'Grant revoked');
            CardstackOpportunityEditTypes.Envelope denied=CardstackFlowService.transition('claude',CardstackFlowServiceTestData.request(review,'confirm'));Test.stopTest();Assert.areEqual('Rejected',denied.view.status,'Old revision/grant cannot save');Assert.areEqual('Configured request',CardstackConfiguredCaseTestData.current(record.Id).Subject,'No CRM effect');
        }
    }
    @IsTest static void recordRouteCannotConsumeFlowGrant() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Case record=CardstackFlowServiceTestData.fixture();CardstackOpportunityEditTypes.Envelope review=CardstackFlowServiceTestData.review(record);
            CardstackOpportunityEditTypes.TransitionRequest r=new CardstackOpportunityEditTypes.TransitionRequest();r.interactionKey=review.interactionKey;r.operation='confirm';r.expectedRevision=review.view.revision;r.reviewRevision=review.view.reviewRevision;r.reviewGrant=review.reviewGrant;
            Test.startTest();CardstackOpportunityEditTypes.Envelope denied=CardstackOpportunityWriteService.confirmRecord('claude',r);Test.stopTest();Assert.areEqual('Rejected',denied.view.status,'Cross-family route denied');Assert.areEqual('Configured request',CardstackConfiguredCaseTestData.current(record.Id).Subject,'No CRM effect');
        }
    }
    @IsTest static void flowPlanCannotBeImportedThroughGenericAuthoring() {
        Test.startTest();try{CardstackFlowPublication.validateCandidate('flow-plan:Unverified:default','{}');Assert.fail('Untrusted import denied');}catch(CardstackFlowPublication.PublicationException e){Assert.areEqual('NATIVE_ACQUISITION_REQUIRED',e.getMessage(),'Actual source route required');}Test.stopTest();
    }
    @IsTest static void dmlFailureRecoversWithoutUserBackPermission() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Case record=CardstackFlowServiceTestData.fixture(false);CardstackOpportunityEditTypes.Envelope review=CardstackFlowServiceTestData.review(record);CardstackOpportunityWriteService.failCrmUpdate=true;
            Test.startTest();CardstackOpportunityEditTypes.Envelope recovered=CardstackFlowService.transition('claude',CardstackFlowServiceTestData.request(review,'confirm'));Test.stopTest();
            Assert.areEqual('Editing',recovered.view.status,JSON.serialize(recovered.view.errors));Assert.isNull(recovered.reviewGrant,'Old grant invalidated');Assert.areEqual('Case description',recovered.view.screen.label,'Current accepted screen restored');Assert.areEqual('Exact reviewed description',recovered.view.screen.inputs[0].value,'Correction preserves accepted answer');Assert.areEqual('Configured request',CardstackConfiguredCaseTestData.current(record.Id).Subject,'Failed CRM save rolled back');
        }
    }
    @IsTest static void oversizedPublicationFailsBeforeDml() {
        Test.startTest();Integer rows=Limits.getDmlRows();try{CardstackFlowPublication.storageBudget('x'.repeat(120001));Assert.fail('Oversized publication denied');}catch(CardstackFlowPublication.PublicationException e){Assert.areEqual('PUBLICATION_BUDGET',e.getMessage(),'No truncation');}Assert.areEqual(rows,Limits.getDmlRows(),'Budget check inserts nothing');Test.stopTest();
    }
    @IsTest static void publicationRejectsTerminalNativeTypeMismatch() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Case record=CardstackFlowServiceTestData.fixture();CardstackFlowPlan.Plan plan=CardstackFlowPlan.decode(CardstackFlowPublication.load(CardstackFlowServiceTestData.API).planJson);plan.nodes[2].assignments[0].value.type='Boolean';
            Test.startTest();try{CardstackFlowPublication.validateCompiled(plan,CardstackPolicyService.resolve('Case'));Assert.fail('Native String cannot accept Boolean plan');}catch(CardstackFlowPublication.PublicationException e){Assert.areEqual('TERMINAL_TYPE_MISMATCH',e.getMessage(),'Compiler scalar/native codec intersection');}Test.stopTest();
        }
    }
    @IsTest static void publicationRejectsReadOnlyTerminalField() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Case record=CardstackFlowServiceTestData.fixture();CardstackFlowPlan.Plan plan=CardstackFlowPlan.decode(CardstackFlowPublication.load(CardstackFlowServiceTestData.API).planJson);CardstackPolicyService.Policy policy=CardstackPolicyService.resolve('Case');policy.fields.get('Subject').readOnly=true;
            Test.startTest();try{CardstackFlowPublication.validateCompiled(plan,policy);Assert.fail('Published policy must restrict compiled target');}catch(CardstackOpportunityActionPolicy.PolicyException e){Assert.areEqual('FIELD_NOT_EDITABLE',e.getMessage(),'Read-only policy cannot publish terminal capability');}Test.stopTest();
        }
    }
    @IsTest static void publicationFingerprintIncludesReadOnlyDefaultSourceMetadata() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Case record=CardstackFlowServiceTestData.fixture();Map<String,Object> raw=CardstackFlowServiceTestData.metadata();Map<String,Object> screen=(Map<String,Object>)((List<Object>)raw.get('screens'))[0];((Map<String,Object>)((List<Object>)screen.get('fields'))[0]).put('defaultValue',CardstackFlowTestData.ref('currentRecord.SuppliedEmail'));
            CardstackFlowPlan.Plan plan=CardstackFlowCompiler.compile(JSON.serialize(raw),CardstackFlowTestData.identity()).plan;CardstackPolicyService.Policy policy=CardstackPolicyService.resolve('Case');policy.fields.get('SuppliedEmail').readOnly=true;
            Test.startTest();String original=CardstackFlowPublication.validateCompiled(plan,policy);CardstackRecordScreenCapability.flowReadLengthOverride.put('SuppliedEmail',101);String changed=CardstackFlowPublication.validateCompiled(plan,policy);Test.stopTest();Assert.areNotEqual(original,changed,'Readonly source length drift changes schema binding even with identical policy');
        }
    }
    @IsTest static void reviewedLayoutRebindPreservesPlanAndAllowsNewStart() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Case record=CardstackFlowServiceTestData.fixture();CardstackFlowPublication.Published before=CardstackFlowPublication.load(CardstackFlowServiceTestData.API);CardstackOpportunityEditTypes.Envelope oldReview=CardstackFlowServiceTestData.review(record);
            Map<String,Object> candidate=(Map<String,Object>)JSON.deserializeUntyped(CardstackConfigService.getConfig('layout:Case:default'));((Map<String,Object>)((List<Object>)candidate.get('actions'))[1]).put('label','New Flow label');Id draft=CardstackConfigService.saveDraft('layout:Case:default',JSON.serialize(candidate));
            Test.startTest();CardstackConfigService.publishDraft(draft);CardstackFlowPublication.Published after=CardstackFlowPublication.load(CardstackFlowServiceTestData.API);CardstackOpportunityEditTypes.Envelope started=CardstackFlowService.start('claude',record.Id,CardstackFlowServiceTestData.ACTION);CardstackOpportunityEditTypes.Envelope denied=CardstackFlowService.transition('claude',CardstackFlowServiceTestData.request(oldReview,'confirm'));Test.stopTest();
            Assert.areEqual(before.planHash,after.planHash,'Rebind does not change immutable plan/source');Assert.areNotEqual(before.revision,after.revision,'New publication revision');Assert.areEqual('Editing',started.view.status,JSON.serialize(started.view.errors));Assert.areEqual('Conflict',denied.view.status,'Old reviewed policy invalidated');
        }
    }
    @IsTest static void rebindFailureRollsBackLayoutAndDraftPublication() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Case record=CardstackFlowServiceTestData.fixture();String before=CardstackConfigService.getConfig('layout:Case:default');Map<String,Object> candidate=(Map<String,Object>)JSON.deserializeUntyped(before);((Map<String,Object>)((List<Object>)candidate.get('actions'))[1]).put('label','Failed rebind label');Id draft=CardstackConfigService.saveDraft('layout:Case:default',JSON.serialize(candidate));CardstackFlowPublication.failRebind=true;
            Test.startTest();try{CardstackConfigService.publishDraft(draft);Assert.fail('Atomic publication must fail');}catch(CardstackFlowPublication.PublicationException e){Assert.areEqual('PUBLICATION_UNAVAILABLE',e.getMessage(),'Required plan rebind failure');}Test.stopTest();Assert.areEqual(before,CardstackConfigService.getConfig('layout:Case:default'),'Layout rolled back');Assert.areEqual('Draft',[SELECT Status__c FROM Cardstack_Config_Draft__c WHERE Id=:draft WITH USER_MODE].Status__c,'Draft remains unpublished');
        }
    }
    @IsTest static void retainedActionPresentationAndExtensionsDoNotBreakPublication() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Case record=CardstackFlowServiceTestData.fixture();Map<String,Object> layout=(Map<String,Object>)JSON.deserializeUntyped(CardstackConfigService.getConfig('layout:Case:default'));List<Object> actions=(List<Object>)layout.get('actions');
            for(Object raw:actions){Map<String,Object> action=(Map<String,Object>)raw;action.put('description','Serialized Studio action description');action.put('retainedExtension',new Map<String,Object>{'cosmetic'=>'kept'});}
            actions.add(new Map<String,Object>{'name'=>'native_handoff','label'=>'Native Salesforce handoff','description'=>'Retained native Flow action','type'=>'flow','enabled'=>false,'flowApiName'=>'UnusedNativeFlow','retainedExtension'=>'kept'});
            Test.startTest();Id draft=CardstackConfigService.saveDraft('layout:Case:default',JSON.serialize(layout));CardstackConfigService.publishDraft(draft);Test.stopTest();
            Map<String,Object> saved=(Map<String,Object>)JSON.deserializeUntyped(CardstackConfigService.getConfig('layout:Case:default'));Assert.areEqual(3,((List<Object>)saved.get('actions')).size(),'All original action families retained');Assert.areEqual('Serialized Studio action description',((Map<String,Object>)((List<Object>)saved.get('actions'))[1]).get('description'),'Flow description survives intact');
        }
    }
    @IsTest static void ordinaryStudioActionsSkipFlowStrictParsing() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Case record=CardstackConfiguredCaseTestData.fixture();Map<String,Object> layout=(Map<String,Object>)JSON.deserializeUntyped(CardstackConfigService.getConfig('layout:Case:default'));Map<String,Object> action=(Map<String,Object>)((List<Object>)layout.get('actions'))[0];action.put('description','Actual ObjectConfig serialized description');action.put('retainedExtension',new Map<String,Object>{'old'=>'metadata'});
            Test.startTest();Id draft=CardstackConfigService.saveDraft('layout:Case:default',JSON.serialize(layout));CardstackConfigService.publishDraft(draft);Test.stopTest();Assert.isTrue(CardstackConfigService.getConfig('layout:Case:default').contains('retainedExtension'),'Ordinary record-edit action extension preserved');
        }
    }
    @IsTest static void screenFlowCannotCarryForgedExecutionReference() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Case record=CardstackFlowServiceTestData.fixture();Map<String,Object> layout=(Map<String,Object>)JSON.deserializeUntyped(CardstackConfigService.getConfig('layout:Case:default'));((Map<String,Object>)((List<Object>)layout.get('actions'))[1]).put('recordId',CardstackConnectionTypes.normalizeId(String.valueOf(record.Id)));
            Test.startTest();try{CardstackConfigService.saveDraft('layout:Case:default',JSON.serialize(layout));Assert.fail('Flow target injection denied at authoring');}catch(CardstackFlowPublication.PublicationException e){Assert.areEqual('INVALID_FLOW_ACTION',e.getMessage(),'Only trusted runtime context selects target');}Test.stopTest();
        }
    }
    @IsTest static void screenFlowDuplicateCaseFoldedRecordActionIsRejected() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Case record=CardstackFlowServiceTestData.fixture();Map<String,Object> layout=(Map<String,Object>)JSON.deserializeUntyped(CardstackConfigService.getConfig('layout:Case:default'));List<Object> actions=(List<Object>)layout.get('actions');((Map<String,Object>)actions[1]).put('name',CardstackConfiguredCaseTestData.ACTION.toUpperCase());
            for(Object raw:actions)((Map<String,Object>)raw).put('description','Serialized ObjectConfig description');
            Test.startTest();try{CardstackConfigService.saveDraft('layout:Case:default',JSON.serialize(layout));Assert.fail('Cross-family case-folded collision denied');}catch(CardstackFlowPublication.PublicationException e){Assert.areEqual('DUPLICATE_FLOW_ACTION',e.getMessage(),'Runtime action equality cannot become ambiguous');}Test.stopTest();
        }
    }
    @IsTest static void duplicateScreenFlowActionsAreRejected() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Case record=CardstackFlowServiceTestData.fixture();Map<String,Object> layout=(Map<String,Object>)JSON.deserializeUntyped(CardstackConfigService.getConfig('layout:Case:default'));List<Object> actions=(List<Object>)layout.get('actions');Map<String,Object> duplicate=(Map<String,Object>)JSON.deserializeUntyped(JSON.serialize(actions[1]));duplicate.put('description','Duplicate serialized description');actions.add(duplicate);
            Test.startTest();try{CardstackConfigService.saveDraft('layout:Case:default',JSON.serialize(layout));Assert.fail('Same-family collision denied');}catch(CardstackFlowPublication.PublicationException e){Assert.areEqual('DUPLICATE_FLOW_ACTION',e.getMessage(),'One configured action identity required');}Test.stopTest();
        }
    }
    @IsTest static void mixedCaseFlowTagCannotBypassCrossFamilyCollisionValidation() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Case record=CardstackFlowServiceTestData.fixture();Map<String,Object> layout=(Map<String,Object>)JSON.deserializeUntyped(CardstackConfigService.getConfig('layout:Case:default'));List<Object> actions=(List<Object>)layout.get('actions');Map<String,Object> flow=(Map<String,Object>)actions[1];flow.put('type','SCREEN-FLOW');flow.put('name',CardstackConfiguredCaseTestData.ACTION.toUpperCase());flow.put('description','Serialized action description');
            Test.startTest();try{CardstackConfigService.saveDraft('layout:Case:default',JSON.serialize(layout));Assert.fail('Mixed-case Flow tag must not bypass validation');}catch(CardstackFlowPublication.PublicationException e){Assert.areEqual('INVALID_FLOW_ACTION',e.getMessage(),'Noncanonical Flow tag rejected before duplicate bypass');}Test.stopTest();
        }
    }
    @IsTest static void runtimeRejectsNoncanonicalFlowTagFromStoredConfiguration() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Case record=CardstackFlowServiceTestData.fixture();Cardstack_Config__c stored=[SELECT Id,Value__c FROM Cardstack_Config__c WHERE Name='layout:Case:default' WITH SYSTEM_MODE LIMIT 1];Map<String,Object> layout=(Map<String,Object>)JSON.deserializeUntyped(stored.Value__c);((Map<String,Object>)((List<Object>)layout.get('actions'))[1]).put('type','Screen-Flow');stored.Value__c=JSON.serialize(layout);update as system stored;
            Test.startTest();try{CardstackRecordActionService.resolve('Case',CardstackFlowServiceTestData.ACTION);Assert.fail('Stored noncanonical Flow tag cannot execute');}catch(CardstackRecordActionService.ActionException e){Assert.areEqual('Noncanonical Screen Flow action type.',e.getMessage(),'Runtime guard precedes publication or grant resolution');}Test.stopTest();
        }
    }
    @IsTest static void singleTerminalTransitionUsesBoundedFreshContextQueries() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Case record=CardstackFlowServiceTestData.fixture();CardstackOpportunityEditTypes.Envelope first=CardstackFlowService.start('claude',record.Id,CardstackFlowServiceTestData.ACTION);Assert.areEqual('Editing',first.view.status,JSON.serialize(first.view.errors));CardstackOpportunityEditTypes.Envelope second=CardstackFlowServiceTestData.next(first,'ProposedSubject','Budgeted Subject');Assert.areEqual('Editing',second.view.status,JSON.serialize(second.view.errors));
            Test.startTest();Integer before=Limits.getQueries();CardstackOpportunityEditTypes.Envelope review=CardstackFlowServiceTestData.next(second,'ProposedDescription','Budgeted description');Integer used=Limits.getQueries()-before;Test.stopTest();
            Assert.areEqual('Review',review.view.status,JSON.serialize(review.view.errors));Assert.isTrue(used<=25,'One real terminal transition must stay within its 25-query context budget; observed '+used);Assert.areEqual('Configured request',CardstackConfiguredCaseTestData.current(record.Id).Subject,'Budget reuse does not perform CRM writes');
        }
    }
    @IsTest static void laterOperationRereadsRecordFreshness() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Case record=CardstackFlowServiceTestData.fixture();CardstackOpportunityEditTypes.Envelope first=CardstackFlowService.start('claude',record.Id,CardstackFlowServiceTestData.ACTION);CardstackOpportunityEditTypes.Envelope second=CardstackFlowServiceTestData.next(first,'ProposedSubject','Draft Subject');record.Subject='External actor change';update as user record;
            Test.startTest();CardstackOpportunityEditTypes.Envelope denied=CardstackFlowServiceTestData.next(second,'ProposedDescription','Draft description');Test.stopTest();Assert.areEqual('Conflict',denied.view.status,'A new operation cannot reuse an earlier record read');Assert.areEqual('External actor change',CardstackConfiguredCaseTestData.current(record.Id).Subject,'Unconfirmed draft cannot overwrite fresh change');
        }
    }
    @IsTest static void publicationMutationInvalidatesOpenOperationFrame() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Case record=CardstackFlowServiceTestData.fixture();CardstackOpportunityEditTypes.Envelope started=CardstackFlowService.start('claude',record.Id,CardstackFlowServiceTestData.ACTION);CardstackOpportunityEditTypes.StoredState old=CardstackOpportunityEditRepository.lockOwned('claude',started.interactionKey).state;
            Test.startTest();CardstackFlowService.OperationScope scope=CardstackFlowService.openOperation('claude');
            try {
                CardstackFlowService.resolveCapability(old);Integer before=Limits.getQueries();CardstackFlowService.resolveCapability(old);Assert.areEqual(before,Limits.getQueries(),'Repeated metadata checks reuse only this validated operation frame');
                Map<String,Object> layout=(Map<String,Object>)JSON.deserializeUntyped(CardstackConfigService.getConfig('layout:Case:default'));((Map<String,Object>)((List<Object>)layout.get('actions'))[1]).put('label','Mutation invalidates cached publication');Id draft=CardstackConfigService.saveDraft('layout:Case:default',JSON.serialize(layout));CardstackConfigService.publishDraft(draft);
                try{CardstackFlowService.resolveCapability(old);Assert.fail('Old cached publication must be invalidated');}catch(CardstackFlowService.ServiceException e){Assert.areEqual('CONTEXT_CHANGED',e.getMessage(),'Published revision drift fails closed inside the same frame');}
            }finally{CardstackFlowService.closeOperation(scope);}Test.stopTest();
        }
    }
    @IsTest static void confirmRereadsLockedRecordAfterEarlierNavigation() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Case record=CardstackFlowServiceTestData.fixture();CardstackOpportunityEditTypes.Envelope review=CardstackFlowServiceTestData.review(record);record.Description='External change before Confirm';update as user record;
            Test.startTest();CardstackOpportunityEditTypes.Envelope denied=CardstackFlowService.transition('claude',CardstackFlowServiceTestData.request(review,'confirm'));Test.stopTest();Assert.areEqual('Conflict',denied.view.status,'Confirm must use its newly locked record read');Case current=CardstackConfiguredCaseTestData.current(record.Id);Assert.areEqual('Configured request',current.Subject,'Reviewed draft cannot overwrite a stale record');Assert.areEqual('External change before Confirm',current.Description,'Current external value preserved');
        }
    }
    @IsTest static void reusedPublicationStillRevalidatesNativeSchema() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Case record=CardstackFlowServiceTestData.fixture();Test.startTest();CardstackFlowService.OperationScope scope=CardstackFlowService.openOperation('claude');
            try {CardstackFlowPublication.load(CardstackFlowServiceTestData.API);CardstackRecordScreenCapability.flowReadLengthOverride.put('Description',101);try{CardstackFlowPublication.load(CardstackFlowServiceTestData.API);Assert.fail('Cached publication cannot bypass native schema drift');}catch(CardstackFlowPublication.PublicationException e){Assert.areEqual('CONTEXT_CHANGED',e.getMessage(),'Schema checks are retained on scoped reuse');}}
            finally{CardstackRecordScreenCapability.flowReadLengthOverride.clear();CardstackFlowService.closeOperation(scope);}Test.stopTest();
        }
    }
    @IsTest static void publicationArrivingAfterRecordLockIsRejectedBeforeCrmDml() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Case record=CardstackFlowServiceTestData.fixture();CardstackOpportunityEditTypes.Envelope review=CardstackFlowServiceTestData.review(record);CardstackOpportunityWriteService.advanceFlowPublicationBeforeFinalCheck=true;
            Test.startTest();Integer attempts=CardstackOpportunityWriteService.crmUpdateAttempts;CardstackOpportunityEditTypes.Envelope denied=CardstackFlowService.transition('claude',CardstackFlowServiceTestData.request(review,'confirm'));Test.stopTest();Assert.areEqual('Conflict',denied.view.status,'Final fresh authority must see post-lock publication');Assert.areEqual(attempts,CardstackOpportunityWriteService.crmUpdateAttempts,'No CRM DML is attempted after publication drift');Assert.areEqual('Configured request',CardstackConfiguredCaseTestData.current(record.Id).Subject,'Native record remains unchanged');
        }
    }
    @IsTest static void cardFlowAdvertisementReusesAlreadyValidatedActionsWithoutQueries() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Case record=CardstackFlowServiceTestData.fixture();List<CardstackRecordActionService.Definition> validated=CardstackRecordActionService.available('Case');
            Test.startTest();Integer before=Limits.getQueries();List<Map<String,Object>> actions=CardstackFlowMcpAdapter.availableActions(record.Id,validated);Assert.areEqual(before,Limits.getQueries(),'The same card projection must not resolve all native actions a second time');Test.stopTest();Assert.areEqual(1,actions.size(),'Verified Flow action retained');Assert.areEqual(CardstackFlowServiceTestData.ACTION,actions[0].get('name'),'Exact published action identity');
        }
    }
}
