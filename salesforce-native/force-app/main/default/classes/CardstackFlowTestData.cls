/** Independently authored synthetic metadata; not evidence of native acquisition. */
@IsTest
public with sharing class CardstackFlowTestData {
    public static Map<String,Object> metadata() {
        return new Map<String,Object>{'apiVersion'=>67.0,'processType'=>'Flow','status'=>'Active','label'=>'Synthetic details',
            'start'=>new Map<String,Object>{'connector'=>link('ChooseDetails')},
            'variables'=>new List<Object>{new Map<String,Object>{'name'=>'recordId','dataType'=>'String','isCollection'=>false,'isInput'=>true,'isOutput'=>false}},
            'screens'=>new List<Object>{
                new Map<String,Object>{'name'=>'ChooseDetails','label'=>'Choose details','allowBack'=>true,'allowFinish'=>false,'allowPause'=>false,'connector'=>link('PhoneDetails'),'fields'=>new List<Object>{input('ChangePhone','Boolean',null),input('ProposedName','String',ref('currentRecord.Name'))}},
                new Map<String,Object>{'name'=>'PhoneDetails','label'=>'Phone details','allowBack'=>true,'allowFinish'=>false,'allowPause'=>false,'connector'=>link('SaveDetails'),'fields'=>new List<Object>{new Map<String,Object>{'name'=>'Details','fieldType'=>'RegionContainer','fieldText'=>'Details','regionContainerType'=>'SectionWithHeader','fields'=>new List<Object>{phone()}}}}
            },
            'recordUpdates'=>new List<Object>{new Map<String,Object>{'name'=>'SaveDetails','object'=>'Account','filterLogic'=>'and','filters'=>new List<Object>{new Map<String,Object>{'field'=>'Id','operator'=>'EqualTo','value'=>ref('recordId')}},'inputAssignments'=>new List<Object>{new Map<String,Object>{'field'=>'Name','value'=>ref('ProposedName')},new Map<String,Object>{'field'=>'Phone','value'=>ref('ProposedPhone')}}}}
        };
    }
    public static Map<String,Object> phone() {
        Map<String,Object> f=input('ProposedPhone','String',ref('currentRecord.Phone'));
        f.put('visibilityRule',new Map<String,Object>{'conditionLogic'=>'and','conditions'=>new List<Object>{new Map<String,Object>{'leftValueReference'=>'ChangePhone','operator'=>'EqualTo','rightValue'=>new Map<String,Object>{'booleanValue'=>true}}}});
        return f;
    }
    public static Map<String,Object> input(String name,String type, Object defaultValue) {
        Map<String,Object> result=new Map<String,Object>{'name'=>name,'fieldType'=>'InputField','dataType'=>type,'fieldText'=>name,'isRequired'=>true};
        if(defaultValue!=null) result.put('defaultValue',defaultValue);
        return result;
    }
    public static Map<String,Object> link(String target) { return new Map<String,Object>{'targetReference'=>target}; }
    public static Map<String,Object> ref(String value) { return new Map<String,Object>{'elementReference'=>value}; }
    public static CardstackFlowPlan.Plan plan() {
        CardstackFlowCompiler.Result result=CardstackFlowCompiler.compile(JSON.serialize(metadata()),identity());
        Assert.areEqual('SUPPORTED',result.report.verdict,JSON.serialize(result.report)); return result.plan;
    }
    public static CardstackFlowPlan.Identity identity() {
        CardstackFlowPlan.Identity i=new CardstackFlowPlan.Identity();
        i.definitionId18=CardstackConnectionTypes.normalizeId('300000000000001');
        i.versionId18=CardstackConnectionTypes.normalizeId('301000000000001');
        i.versionNumber=1;i.apiName='SyntheticDetails';i.apiVersion='67.0';i.namespace=''; return i;
    }
    public static CardstackFlowTypes.TrustedContext context() {
        CardstackFlowTypes.TrustedContext c=new CardstackFlowTypes.TrustedContext();
        c.currentRecord=new Map<String,Object>{'Name'=>'Original','Phone'=>'123','Id'=>CardstackConnectionTypes.normalizeId('001000000000001')};return c;
    }
    public static CardstackFlowTypes.Answer answer(String name,Object value) {
        CardstackFlowTypes.Answer a=new CardstackFlowTypes.Answer();a.inputId=name;a.operation='set';a.value=value;return a;
    }
}
