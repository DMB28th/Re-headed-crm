/** Pure navigation tests: no fixture DML, record access or external dependencies. */
@IsTest
private with sharing class CardstackFlowEngineTest {
    @IsTest static void falseIsPresentAndHiddenDoesNotContribute() {
        CardstackFlowPlan.Plan p=CardstackFlowTestData.plan();Test.startTest();Integer q=Limits.getQueries(),d=Limits.getDmlStatements();
        CardstackFlowTypes.EngineState s=CardstackFlowEngine.begin(p,CardstackFlowTestData.context());
        s=CardstackFlowEngine.apply(p,s,new List<CardstackFlowTypes.Answer>{CardstackFlowTestData.answer('ChangePhone',false)},'next').state;
        Assert.areEqual('PhoneDetails',s.node,'Required false is present');Assert.areEqual(0,CardstackFlowEngine.project(p,s).inputs.size(),'Hidden required phone omitted');
        s=CardstackFlowEngine.apply(p,s,new List<CardstackFlowTypes.Answer>(),'next').state;
        Assert.areEqual(1,CardstackFlowEngine.terminal(p,s).size(),'Hidden default never contributes');Assert.areEqual(q,Limits.getQueries(),'Pure queries');Assert.areEqual(d,Limits.getDmlStatements(),'Pure DML');Test.stopTest();
    }
    @IsTest static void backDropsDownstreamValues() {
        CardstackFlowPlan.Plan p=CardstackFlowTestData.plan();Test.startTest();CardstackFlowTypes.EngineState s=CardstackFlowEngine.begin(p,CardstackFlowTestData.context());
        s=CardstackFlowEngine.apply(p,s,new List<CardstackFlowTypes.Answer>{CardstackFlowTestData.answer('ChangePhone',true)},'next').state;
        s=CardstackFlowEngine.apply(p,s,new List<CardstackFlowTypes.Answer>{CardstackFlowTestData.answer('ProposedPhone','456')},'next').state;
        s=CardstackFlowEngine.apply(p,s,null,'back').state;s=CardstackFlowEngine.apply(p,s,null,'back').state;
        s=CardstackFlowEngine.apply(p,s,new List<CardstackFlowTypes.Answer>{CardstackFlowTestData.answer('ChangePhone',false)},'next').state;
        s=CardstackFlowEngine.apply(p,s,null,'next').state;Assert.areEqual(1,CardstackFlowEngine.terminal(p,s).size(),'Downstream old phone dropped');Test.stopTest();
    }
    @IsTest static void hiddenAnswerRejectedWithoutMutation() {
        CardstackFlowPlan.Plan p=CardstackFlowTestData.plan();CardstackFlowTypes.EngineState s=CardstackFlowEngine.begin(p,CardstackFlowTestData.context());s=CardstackFlowEngine.apply(p,s,new List<CardstackFlowTypes.Answer>{CardstackFlowTestData.answer('ChangePhone',false)},'next').state;
        String before=JSON.serialize(s);Test.startTest();try {CardstackFlowEngine.apply(p,s,new List<CardstackFlowTypes.Answer>{CardstackFlowTestData.answer('ProposedPhone','Injected')},'next');Assert.fail('Hidden input denied');}catch(CardstackFlowEngine.FlowException e){Assert.areEqual('HIDDEN_ANSWER',e.getMessage(),'Safe failure');}Test.stopTest();Assert.areEqual(before,JSON.serialize(s),'Caller state unchanged');
    }
    @IsTest static void cancelClearsResources() {
        CardstackFlowPlan.Plan p=CardstackFlowTestData.plan();Test.startTest();CardstackFlowTypes.EngineState s=CardstackFlowEngine.begin(p,CardstackFlowTestData.context());s=CardstackFlowEngine.apply(p,s,null,'cancel').state;Test.stopTest();Assert.areEqual('Cancelled',s.status,'Cancelled');Assert.areEqual(0,s.resources.size(),'Draft destroyed');
    }
    @IsTest static void validationRecoveryIgnoresUserBackPermission() {
        CardstackFlowPlan.Plan p=CardstackFlowTestData.plan();p.nodes[1].allowBack=false;
        Test.startTest();CardstackFlowTypes.EngineState s=CardstackFlowEngine.begin(p,CardstackFlowTestData.context());s=CardstackFlowEngine.apply(p,s,new List<CardstackFlowTypes.Answer>{CardstackFlowTestData.answer('ChangePhone',true)},'next').state;s=CardstackFlowEngine.apply(p,s,new List<CardstackFlowTypes.Answer>{CardstackFlowTestData.answer('ProposedPhone','456')},'next').state;
        CardstackFlowTypes.EngineState recovered=CardstackFlowEngine.recoverForValidation(p,s);Test.stopTest();Assert.areEqual('Editing',recovered.status,'Backend recovery is not user Back');Assert.areEqual('PhoneDetails',recovered.node,'Return to accepted terminal screen');Assert.areEqual('456',recovered.resources.get('ProposedPhone').value,'Exact accepted answer retained');
    }
    @IsTest static void visibilityTamperingDenied() {
        CardstackFlowPlan.Plan p=CardstackFlowTestData.plan();CardstackFlowTypes.EngineState s=CardstackFlowEngine.begin(p,CardstackFlowTestData.context());s=CardstackFlowEngine.apply(p,s,new List<CardstackFlowTypes.Answer>{CardstackFlowTestData.answer('ChangePhone',false)},'next').state;s.visibleInputIds.add('ProposedPhone');
        Test.startTest();try{CardstackFlowEngine.project(p,s);Assert.fail('Corrupt projection denied');}catch(CardstackFlowEngine.FlowException e){Assert.areEqual('VISIBILITY_STATE_TAMPER',e.getMessage(),'Stored IDs carry no visibility authority');}Test.stopTest();
    }
    @IsTest static void contextCheckpointTamperingDenied() {
        CardstackFlowPlan.Plan p=CardstackFlowTestData.plan();CardstackFlowTypes.EngineState s=CardstackFlowEngine.begin(p,CardstackFlowTestData.context());s.checkpoints[0].entry.get('recordId').value='Other';
        Test.startTest();try{CardstackFlowEngine.project(p,s);Assert.fail('Corrupt checkpoint denied');}catch(CardstackFlowEngine.FlowException e){Assert.areEqual('CONTEXT_TAMPER',e.getMessage(),'Checkpoint context immutable');}Test.stopTest();
    }
    @IsTest static void strictStateCodecPreservesFalseAndEmptyText() {
        CardstackFlowPlan.Plan p=CardstackFlowTestData.plan();CardstackFlowTypes.EngineState s=CardstackFlowEngine.begin(p,CardstackFlowTestData.context());s=CardstackFlowEngine.apply(p,s,new List<CardstackFlowTypes.Answer>{CardstackFlowTestData.answer('ChangePhone',false),CardstackFlowTestData.answer('ProposedName','')},'answer').state;
        Test.startTest();CardstackFlowTypes.EngineState restored=CardstackFlowTypes.decode(JSON.serialize(s));Test.stopTest();Assert.areEqual(false,restored.resources.get('ChangePhone').value,'False survives strict codec');Assert.areEqual('',restored.resources.get('ProposedName').value,'Empty text present');
    }
    @IsTest static void compiledPlanCodecRoundTripsLiteralBoolean() {
        CardstackFlowPlan.Plan p=CardstackFlowTestData.plan();Test.startTest();CardstackFlowPlan.Plan decoded=CardstackFlowPlan.decode(JSON.serialize(p));Test.stopTest();Assert.areEqual(CardstackFlowPlan.hash(p),CardstackFlowPlan.hash(decoded),'Literal tagged booleans survive strict compiled codec');
    }
    @IsTest static void hiddenPresencePropagatesThroughSet() {
        Map<String,Object> metadata=CardstackFlowTestData.metadata();((List<Object>)metadata.get('variables')).add(new Map<String,Object>{'name'=>'ComputedPhone','dataType'=>'String','isCollection'=>false,'isInput'=>false,'isOutput'=>false});
        ((Map<String,Object>)((List<Object>)metadata.get('screens'))[1]).put('connector',CardstackFlowTestData.link('CopyPhone'));metadata.put('assignments',new List<Object>{new Map<String,Object>{'name'=>'CopyPhone','connector'=>CardstackFlowTestData.link('SaveDetails'),'assignmentItems'=>new List<Object>{new Map<String,Object>{'assignToReference'=>'ComputedPhone','operator'=>'Assign','value'=>CardstackFlowTestData.ref('ProposedPhone')}}}});
        Map<String,Object> terminal=(Map<String,Object>)((List<Object>)metadata.get('recordUpdates'))[0];((Map<String,Object>)((List<Object>)terminal.get('inputAssignments'))[1]).put('value',CardstackFlowTestData.ref('ComputedPhone'));
        CardstackFlowCompiler.Result compiled=CardstackFlowCompiler.compile(JSON.serialize(metadata),CardstackFlowTestData.identity());Assert.areEqual('SUPPORTED',compiled.report.verdict,JSON.serialize(compiled.report));
        Test.startTest();CardstackFlowTypes.EngineState state=CardstackFlowEngine.begin(compiled.plan,CardstackFlowTestData.context());state=CardstackFlowEngine.apply(compiled.plan,state,new List<CardstackFlowTypes.Answer>{CardstackFlowTestData.answer('ChangePhone',false)},'next').state;state=CardstackFlowEngine.apply(compiled.plan,state,null,'next').state;Test.stopTest();Assert.areEqual('HIDDEN',state.resources.get('ComputedPhone').presence,'SET propagates source provenance');Assert.areEqual(1,CardstackFlowEngine.terminal(compiled.plan,state).size(),'Hidden derived field never contributes null write');
    }
    @IsTest static void explicitClearContributesNull() {
        CardstackFlowPlan.Plan plan=CardstackFlowTestData.plan();plan.nodes[1].inputs[0].required=false;
        Test.startTest();CardstackFlowTypes.EngineState state=CardstackFlowEngine.begin(plan,CardstackFlowTestData.context());state=CardstackFlowEngine.apply(plan,state,new List<CardstackFlowTypes.Answer>{CardstackFlowTestData.answer('ChangePhone',true)},'next').state;CardstackFlowTypes.Answer clear=new CardstackFlowTypes.Answer();clear.inputId='ProposedPhone';clear.operation='clear';state=CardstackFlowEngine.apply(plan,state,new List<CardstackFlowTypes.Answer>{clear},'next').state;List<CardstackOpportunityEditTypes.FieldChange> proposal=CardstackFlowEngine.terminal(plan,state);Test.stopTest();Assert.areEqual('clear',proposal[1].operation,'Explicit clear is a proposal, unlike hidden absence');Assert.isNull(proposal[1].value,'Null is exact');
    }
    @IsTest static void decimalScaleRejectsRounding() {
        Test.startTest();try{CardstackFlowEngine.coerce('Decimal','1.234',2,new List<String>());Assert.fail('Never round submitted decimal');}catch(CardstackFlowEngine.FlowException e){Assert.areEqual('NUMBER_SCALE',e.getMessage(),'Scale enforced exactly');}Test.stopTest();
    }
    @IsTest static void dateRejectsInvalidCalendar() {
        Test.startTest();try{CardstackFlowEngine.coerce('Date','2026-13-01',0,new List<String>());Assert.fail('Invalid calendar rejected');}catch(CardstackFlowEngine.FlowException e){Assert.areEqual('DATE_FORMAT',e.getMessage(),'Calendar enforced');}Test.stopTest();
    }
    @IsTest static void staticChoiceRejectsUnknownValue() {
        Test.startTest();try{CardstackFlowEngine.coerce('String','Other',0,new List<String>{'Allowed'});Assert.fail('Exact membership');}catch(CardstackFlowEngine.FlowException e){Assert.areEqual('CHOICE_VALUE',e.getMessage(),'No display-label guessing');}Test.stopTest();
    }
}
