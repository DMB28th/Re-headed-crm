/** Private interpreter state and minimal public screen descriptors. No record target crosses this seam. */
public with sharing class CardstackFlowTypes {
    public with sharing class TrustedContext { public Map<String,Object> currentRecord=new Map<String,Object>(); }
    public with sharing class Value { public String presence='ABSENT';public Object value; }
    public with sharing class Answer { public String inputId,operation;public Object value; }
    public with sharing class Checkpoint {public String node;public Map<String,Value> entry=new Map<String,Value>();public Map<String,Value> accepted=new Map<String,Value>();}
    public with sharing class EngineState {
        public String schemaVersion='screen-flow-state/1';public String planHash,node,status='Editing';public Integer revision=1;
        public Map<String,Object> currentRecord=new Map<String,Object>();public Map<String,Value> resources=new Map<String,Value>();
        public List<Checkpoint> checkpoints=new List<Checkpoint>();public List<String> visibleInputIds=new List<String>();
    }
    public with sharing class InputView {public String inputId,label,type;public Boolean required,allowClear;public Integer scale;public Object value;public List<String> choices;public String sectionId;}
    public with sharing class ScreenProjection {
        public String contractVersion='screen-flow/v1';public String label;public Integer revision;
        public List<InputView> inputs=new List<InputView>();public List<CardstackFlowPlan.Section> sections=new List<CardstackFlowPlan.Section>();public List<String> plainTextBlocks=new List<String>();
        public Boolean canNext=false,canBack=false,canCancel=false,needsAnswerRefresh=false;
    }
    public with sharing class EngineResult {public EngineState state;public ScreenProjection screen;public Boolean terminalProposal=false;}
    /** Strict private codec; Object-valued members are restored through explicit untyped scalar validation. */
    public static EngineState decode(String rawJson) {
        if(String.isBlank(rawJson) || Blob.valueOf(rawJson).size()>32768)throw new CardstackFlowEngine.FlowException('STATE_BUDGET');
        try {
            Map<String,Object> body=(Map<String,Object>)JSON.deserializeUntyped(rawJson);
            Object rawResources=body.remove('resources'),rawRecord=body.remove('currentRecord'),rawCheckpoints=body.remove('checkpoints');
            EngineState s=(EngineState)JSON.deserializeStrict(JSON.serialize(body),EngineState.class);
            s.resources=decodeValues(rawResources);s.currentRecord=(Map<String,Object>)rawRecord;s.checkpoints=new List<Checkpoint>();
            for(Object raw:(List<Object>)rawCheckpoints) {
                Map<String,Object> c=(Map<String,Object>)raw;keys(c,new Set<String>{'node','entry','accepted'});
                Checkpoint cp=new Checkpoint();cp.node=(String)c.get('node');cp.entry=decodeValues(c.get('entry'));cp.accepted=decodeValues(c.get('accepted'));s.checkpoints.add(cp);
            }
            for(Object value:s.currentRecord.values())scalar(value);return s;
        }catch(JSONException e){throw new CardstackFlowEngine.FlowException('INVALID_STATE',e);}catch(TypeException e){throw new CardstackFlowEngine.FlowException('INVALID_STATE',e);}
    }
    /** Strict wire decoder keeps unknown submitted keys from becoming resource authority. */
    public static List<Answer> decodeAnswers(String rawJson) {
        if(String.isBlank(rawJson) || Blob.valueOf(rawJson).size()>16384)throw new CardstackFlowEngine.FlowException('ARGUMENT_BUDGET');
        try {
            List<Answer> result=new List<Answer>();for(Object raw:(List<Object>)JSON.deserializeUntyped(rawJson)) {
                Map<String,Object> a=(Map<String,Object>)raw;keys(a,new Set<String>{'inputId','operation','value'});Answer v=new Answer();v.inputId=(String)a.get('inputId');v.operation=(String)a.get('operation');v.value=a.get('value');scalar(v.value);result.add(v);
            }return result;
        }catch(JSONException e){throw new CardstackFlowEngine.FlowException('INVALID_ANSWERS',e);}catch(TypeException e){throw new CardstackFlowEngine.FlowException('INVALID_ANSWERS',e);}
    }
    /** Clones and strictly restores presence values without Apex's unsupported Object deserializer. */
    public static Map<String,Value> decodeValues(Object raw) {
        Map<String,Object> values=(Map<String,Object>)raw;if(values==null)throw new CardstackFlowEngine.FlowException('INVALID_RESOURCES');Map<String,Value> result=new Map<String,Value>();
        for(String name:values.keySet()) {Map<String,Object> item=(Map<String,Object>)values.get(name);keys(item,new Set<String>{'presence','value'});Value v=new Value();v.presence=(String)item.get('presence');v.value=item.get('value');scalar(v.value);result.put(name,v);}return result;
    }
    private static void scalar(Object value) {if(value!=null && !(value instanceof String) && !(value instanceof Boolean))throw new CardstackFlowEngine.FlowException('INVALID_SCALAR_STATE');}
    private static void keys(Map<String,Object> values,Set<String> allowed) {if(values==null)throw new CardstackFlowEngine.FlowException('INVALID_SHAPE');for(String name:values.keySet())if(!allowed.contains(name))throw new CardstackFlowEngine.FlowException('UNKNOWN_PROPERTY');}
}
