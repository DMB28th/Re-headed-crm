/** Strict native metadata compilation risk tests, independent of live metadata. */
@IsTest
private with sharing class CardstackFlowCompilerTest {
    @IsTest static void supportsSyntheticNativeTwoScreens() {
        Test.startTest();CardstackFlowPlan.Plan p=CardstackFlowTestData.plan();Test.stopTest();
        Assert.areEqual(3,p.nodes.size(),'Two screens and one terminal');Assert.areEqual(new List<String>{'Name','Phone'},p.writeSet,'Exact write fields');
    }
    @IsTest static void rejectsUnreachableExecutableProperty() {
        Map<String,Object> m=CardstackFlowTestData.metadata();m.put('actionCalls',new List<Object>{new Map<String,Object>{'name'=>'Unused'}});
        Test.startTest();CardstackFlowCompiler.Result r=CardstackFlowCompiler.compile(JSON.serialize(m),CardstackFlowTestData.identity());Test.stopTest();
        Assert.areEqual('UNSUPPORTED',r.report.verdict,'All source semantics matter');Assert.isNull(r.plan,'No partial plan');
    }
    @IsTest static void rejectsAlternateRecordTarget() {
        Map<String,Object> m=CardstackFlowTestData.metadata();Map<String,Object> metadataUpdate=(Map<String,Object>)((List<Object>)m.get('recordUpdates'))[0];metadataUpdate.put('filters',new List<Object>{new Map<String,Object>{'field'=>'Name','operator'=>'EqualTo','value'=>new Map<String,Object>{'stringValue'=>'Other'}}});
        Test.startTest();CardstackFlowCompiler.Result r=CardstackFlowCompiler.compile(JSON.serialize(m),CardstackFlowTestData.identity());Test.stopTest();Assert.areEqual('UNSUPPORTED',r.report.verdict,'Alternate target fails');
    }
    @IsTest static void rejectsCycle() {
        Map<String,Object> m=CardstackFlowTestData.metadata();((Map<String,Object>)((List<Object>)m.get('screens'))[1]).put('connector',CardstackFlowTestData.link('ChooseDetails'));
        Test.startTest();CardstackFlowCompiler.Result r=CardstackFlowCompiler.compile(JSON.serialize(m),CardstackFlowTestData.identity());Test.stopTest();Assert.areEqual('UNSUPPORTED',r.report.verdict,'Cycles fail');
    }
    @IsTest static void canonicalMapOrderStable() {
        Test.startTest();String a=CardstackFlowPlan.hash(new Map<String,Object>{'z'=>false,'a'=>'é'});String b=CardstackFlowPlan.hash(new Map<String,Object>{'a'=>'é','z'=>false});Test.stopTest();Assert.areEqual(a,b,'Map keys canonical');
    }
    @IsTest static void rejectsNumberedConditionLogic() {
        Map<String,Object> m=CardstackFlowTestData.metadata();Map<String,Object> screen=(Map<String,Object>)((List<Object>)m.get('screens'))[1];Map<String,Object> region=(Map<String,Object>)((List<Object>)screen.get('fields'))[0];Map<String,Object> input=(Map<String,Object>)((List<Object>)region.get('fields'))[0];((Map<String,Object>)input.get('visibilityRule')).put('conditionLogic','1 AND 2');
        Test.startTest();CardstackFlowCompiler.Result r=CardstackFlowCompiler.compile(JSON.serialize(m),CardstackFlowTestData.identity());Test.stopTest();Assert.areEqual('CONDITION_LOGIC',r.report.issues[0].code,'No formula-like condition guessing');
    }
    @IsTest static void rejectsContextShadowing() {
        Map<String,Object> m=CardstackFlowTestData.metadata();Map<String,Object> screen=(Map<String,Object>)((List<Object>)m.get('screens'))[0];((Map<String,Object>)((List<Object>)screen.get('fields'))[0]).put('name','recordId');
        Test.startTest();CardstackFlowCompiler.Result r=CardstackFlowCompiler.compile(JSON.serialize(m),CardstackFlowTestData.identity());Test.stopTest();Assert.areEqual('RESOURCE_DUPLICATE_OR_BUDGET',r.report.issues[0].code,'Input cannot shadow immutable context');
    }
    @IsTest static void rejectsSystemMode() {
        Map<String,Object> m=CardstackFlowTestData.metadata();m.put('runInMode','SystemModeWithoutSharing');
        Test.startTest();CardstackFlowCompiler.Result r=CardstackFlowCompiler.compile(JSON.serialize(m),CardstackFlowTestData.identity());Test.stopTest();Assert.areEqual('UNSUPPORTED_PROPERTY',r.report.issues[0].code,'System-mode semantics cannot expand Cardstack authority');Assert.areEqual('$.runInMode',r.report.issues[0].path,'Stable precise metadata path');
    }
    @IsTest static void nullPaddingIsSupportedButHashBound() {
        Map<String,Object> m=CardstackFlowTestData.metadata();String before=CardstackFlowPlan.hash(m);m.put('loops',null);
        Test.startTest();CardstackFlowCompiler.Result r=CardstackFlowCompiler.compile(JSON.serialize(m),CardstackFlowTestData.identity());Test.stopTest();Assert.areEqual('SUPPORTED',r.report.verdict,'Null native schema padding is nonexecutable');Assert.areNotEqual(before,r.sourceHash,'Complete source hash still includes null padding');
    }
    @IsTest static void literalNumberCanonicalizationIsExplicit() {
        Test.startTest();String a=CardstackFlowPlan.hash(new Map<String,Object>{'number'=>Decimal.valueOf('12.00')}),b=CardstackFlowPlan.hash(new Map<String,Object>{'number'=>12});Test.stopTest();Assert.areEqual(a,b,'Canonical v1 renders equivalent numbers without trailing zeros');
    }
    @IsTest static void rejectsUnsupportedRegionContainerType() {
        Map<String,Object> raw=CardstackFlowTestData.metadata();Map<String,Object> screen=(Map<String,Object>)((List<Object>)raw.get('screens'))[1];((Map<String,Object>)((List<Object>)screen.get('fields'))[0]).put('regionContainerType','Accordion');
        Test.startTest();CardstackFlowCompiler.Result result=CardstackFlowCompiler.compile(JSON.serialize(raw),CardstackFlowTestData.identity());Test.stopTest();Assert.areEqual('UNSUPPORTED',result.report.verdict,'No unsupported section mode');Assert.areEqual('REGION_CONTAINER_TYPE_UNSUPPORTED',result.report.issues[0].code,'Bounded literal header enum only');Assert.areEqual('$.screens[1].fields[0].regionContainerType',result.report.issues[0].path,'Native field path identifies incompatibility');
    }
    private static Map<String,Object> rawRegion(Object width,List<Object> extra) {
        Map<String,Object> raw=CardstackFlowTestData.metadata();Map<String,Object> screen=(Map<String,Object>)((List<Object>)raw.get('screens'))[1];Map<String,Object> container=(Map<String,Object>)((List<Object>)screen.get('fields'))[0];List<Object> children=(List<Object>)container.get('fields');List<Object> parameters=new List<Object>{new Map<String,Object>{'name'=>'width','value'=>width}};if(extra!=null)parameters.addAll(extra);container.put('fields',new List<Object>{new Map<String,Object>{'name'=>'DetailsColumn','fieldType'=>'Region','isRequired'=>false,'fields'=>children,'inputParameters'=>parameters}});return raw;
    }
    @IsTest static void supportsLiteralFullWidthRegionParameter() {
        Map<String,Object> raw=rawRegion(new Map<String,Object>{'stringValue'=>'12'},null);Test.startTest();CardstackFlowCompiler.Result result=CardstackFlowCompiler.compile(JSON.serialize(raw),CardstackFlowTestData.identity());Test.stopTest();Assert.areEqual('SUPPORTED',result.report.verdict,JSON.serialize(result.report));Assert.areEqual(1,result.plan.nodes[1].sections[1].columns,'Literal full-width region normalizes one column');
    }
    @IsTest static void rejectsDynamicRegionWidth() {
        Map<String,Object> raw=rawRegion(CardstackFlowTestData.ref('ChangePhone'),null);Test.startTest();CardstackFlowCompiler.Result result=CardstackFlowCompiler.compile(JSON.serialize(raw),CardstackFlowTestData.identity());Test.stopTest();Assert.areEqual('UNSUPPORTED',result.report.verdict,'Region width cannot evaluate a resource');Assert.areEqual('UNSUPPORTED_PROPERTY',result.report.issues[0].code,'Executable operand is outside literal width adapter');
    }
    @IsTest static void rejectsExtraRegionInputParameter() {
        Map<String,Object> raw=rawRegion(new Map<String,Object>{'stringValue'=>'12'},new List<Object>{new Map<String,Object>{'name'=>'onNavigate','value'=>new Map<String,Object>{'stringValue'=>'run'}}});Test.startTest();CardstackFlowCompiler.Result result=CardstackFlowCompiler.compile(JSON.serialize(raw),CardstackFlowTestData.identity());Test.stopTest();Assert.areEqual('REGION_WIDTH_UNSUPPORTED',result.report.issues[0].code,'No additional component input parameters');
    }
}
