/** Pure bounded interpreter. All state is supplied by trusted service/repository code; no SOQL/DML. */
public with sharing class CardstackFlowEngine {
    public class FlowException extends Exception {}
    /** Begins with a trusted authorized scalar snapshot. Caller persists result under existing lifecycle locks. */
    public static CardstackFlowTypes.EngineState begin(CardstackFlowPlan.Plan plan,CardstackFlowTypes.TrustedContext context) {
        CardstackFlowPlan.validate(plan);if(context==null || context.currentRecord==null)fail('CONTEXT_REQUIRED');
        CardstackFlowTypes.EngineState s=new CardstackFlowTypes.EngineState();s.planHash=CardstackFlowPlan.hash(plan);
        s.currentRecord=(Map<String,Object>)JSON.deserializeUntyped(JSON.serialize(context.currentRecord));
        if(s.currentRecord.get('Id')==null)fail('CONTEXT_REQUIRED');
        s.currentRecord.put('Id',CardstackConnectionTypes.normalizeId(String.valueOf(s.currentRecord.get('Id'))));
        for(String field:plan.readSet)if(!s.currentRecord.containsKey(field))fail('CONTEXT_READ_MISSING');
        for(CardstackFlowPlan.Resource r:plan.resources) {
            CardstackFlowTypes.Value v=new CardstackFlowTypes.Value();if(r.origin=='CONTEXT'){if(r.name!='recordId')fail('CONTEXT_RESOURCE');v.presence='VALUE';v.value=s.currentRecord.get('Id');}s.resources.put(r.name,v);
        }
        s.node=plan.entryNode;walk(plan,s);budget(s);return s;
    }
    /** Executes one atomic navigation on a clone. Exceptions never mutate caller state. */
    public static CardstackFlowTypes.EngineResult apply(CardstackFlowPlan.Plan plan,CardstackFlowTypes.EngineState original,List<CardstackFlowTypes.Answer> answers,String operation) {
        valid(plan,original);if(Blob.valueOf(JSON.serialize(answers)).size()>16384)fail('ARGUMENT_BUDGET');
        CardstackFlowTypes.EngineState s=CardstackFlowTypes.decode(JSON.serialize(original));
        if(!new Set<String>{'next','answer','back','cancel','resume'}.contains(operation))fail('OPERATION');
        if(operation!='next' && operation!='answer' && answers!=null && !answers.isEmpty())fail('UNEXPECTED_ANSWERS');
        if(operation=='resume')return result(plan,s);
        if(s.status=='Cancelled')fail('CANCELLED');
        if(operation=='cancel') {s.status='Cancelled';s.resources.clear();s.currentRecord.clear();s.checkpoints.clear();s.visibleInputIds.clear();s.node=null;}
        else if(operation=='back')back(plan,s);
        else {
            if(s.status!='Editing')fail('NOT_EDITING');CardstackFlowPlan.Node n=node(plan,s.node);accept(plan,s,n,answers,operation=='next');
            if(operation=='next'){checkpoint(s).accepted=cloneValues(s.resources);s.node=n.nextNode;walk(plan,s);}
        }
        s.revision++;budget(s);return result(plan,s);
    }
    /** Backend validation recovery restores the last accepted screen independently of user Back permission. */
    public static CardstackFlowTypes.EngineState recoverForValidation(CardstackFlowPlan.Plan plan,CardstackFlowTypes.EngineState original) {
        valid(plan,original);if(original.status!='Review' || original.checkpoints.isEmpty())fail('NOT_TERMINAL');
        CardstackFlowTypes.EngineState s=CardstackFlowTypes.decode(JSON.serialize(original));restoreCheckpoint(plan,s,checkpoint(s));s.revision++;budget(s);return s;
    }
    /** Projects only authorized visible inputs; the graph/context/conditions remain private. */
    public static CardstackFlowTypes.ScreenProjection project(CardstackFlowPlan.Plan plan,CardstackFlowTypes.EngineState s) {
        valid(plan,s);CardstackFlowTypes.ScreenProjection view=new CardstackFlowTypes.ScreenProjection();view.revision=s.revision;view.canCancel=s.status=='Editing'||s.status=='Review';
        if(s.status=='Review'){view.label='Review changes';view.canBack=!s.checkpoints.isEmpty() && node(plan,checkpoint(s).node).allowBack;return view;}
        if(s.status!='Editing')return view;CardstackFlowPlan.Node n=node(plan,s.node);view.label=n.label;view.sections=n.sections;view.plainTextBlocks=n.textBlocks;view.canNext=true;view.canBack=n.allowBack && s.checkpoints.size()>1;
        for(CardstackFlowPlan.Input i:n.inputs)if(i.visibility!=null)view.needsAnswerRefresh=true;
        for(CardstackFlowPlan.Input i:n.inputs)if(s.visibleInputIds.contains(i.inputId)) {
            CardstackFlowTypes.InputView v=new CardstackFlowTypes.InputView();v.inputId=i.inputId;v.label=i.label;v.type=i.type;v.required=i.required;v.allowClear=i.allowClear;v.scale=i.scale;v.choices=i.choices;v.sectionId=i.sectionId;v.value=effective(s.resources.get(i.inputId));view.inputs.add(v);
        }
        return view;
    }
    /** Produces a nonexecutable current-record patch proposal; canonical writer/policy checks remain mandatory. */
    public static List<CardstackOpportunityEditTypes.FieldChange> terminal(CardstackFlowPlan.Plan plan,CardstackFlowTypes.EngineState s) {
        valid(plan,s);if(s.status!='Review')fail('NOT_TERMINAL');CardstackFlowPlan.Node n=node(plan,s.node);if(n.kind!='UPDATE')fail('NOT_TERMINAL');
        List<CardstackOpportunityEditTypes.FieldChange> patch=new List<CardstackOpportunityEditTypes.FieldChange>();
        for(CardstackFlowPlan.Binding b:n.assignments) {
            CardstackFlowTypes.Value v=resolve(b.value,s);if(v.presence=='HIDDEN'||v.presence=='ABSENT')continue;
            CardstackOpportunityEditTypes.FieldChange change=new CardstackOpportunityEditTypes.FieldChange();change.fieldApi=b.target;change.operation=v.presence=='CLEAR'?'clear':'set';change.value=v.value==null?null:String.valueOf(v.value);patch.add(change);
        }
        return patch;
    }
    private static CardstackFlowTypes.EngineResult result(CardstackFlowPlan.Plan p,CardstackFlowTypes.EngineState s) {CardstackFlowTypes.EngineResult r=new CardstackFlowTypes.EngineResult();r.state=s;r.screen=project(p,s);r.terminalProposal=s.status=='Review';return r;}
    private static void walk(CardstackFlowPlan.Plan p,CardstackFlowTypes.EngineState s) {
        Set<String> seen=new Set<String>();Integer steps=0;
        while(true) {
            if(++steps>32 || seen.contains(s.node))fail('STEP_BUDGET');seen.add(s.node);CardstackFlowPlan.Node n=node(p,s.node);
            if(n.kind=='SCREEN'){enter(p,s,n);return;}
            if(n.kind=='UPDATE'){s.status='Review';s.visibleInputIds.clear();return;}
            if(n.kind=='SET') {
                for(CardstackFlowPlan.Binding b:n.assignments) {CardstackFlowPlan.Resource r=resource(p,b.target);if(r.origin!='COMPUTED')fail('ASSIGNMENT_TARGET');s.resources.put(b.target,resolve(b.value,s));}s.node=n.nextNode;
            }else if(n.kind=='DECISION') {
                s.node=n.nextNode;for(CardstackFlowPlan.Rule rule:n.rules)if(test(rule.predicate,s)){s.node=rule.nextNode;break;}
            }else fail('NODE_KIND');
        }
    }
    private static void enter(CardstackFlowPlan.Plan p,CardstackFlowTypes.EngineState s,CardstackFlowPlan.Node n) {
        CardstackFlowTypes.Checkpoint c=new CardstackFlowTypes.Checkpoint();c.node=n.name;c.entry=cloneValues(s.resources);s.checkpoints.add(c);
        for(CardstackFlowPlan.Input i:n.inputs) {
            CardstackFlowTypes.Value v=s.resources.get(i.inputId);
            if(v.presence=='ABSENT' && i.defaultValue!=null) {v=resolve(i.defaultValue,s);if(v.presence=='VALUE')v.value=coerce(i.type,v.value,i.scale,i.choices);s.resources.put(i.inputId,v);}
        }
        visibility(s,n);c.accepted=cloneValues(s.resources);
    }
    private static void accept(CardstackFlowPlan.Plan p,CardstackFlowTypes.EngineState s,CardstackFlowPlan.Node n,List<CardstackFlowTypes.Answer> answers,Boolean requireAll) {
        Map<String,CardstackFlowPlan.Input> inputs=new Map<String,CardstackFlowPlan.Input>();for(CardstackFlowPlan.Input i:n.inputs)inputs.put(i.inputId,i);
        Set<String> submitted=new Set<String>();
        if(answers!=null)for(CardstackFlowTypes.Answer a:answers) {
            if(a==null || !inputs.containsKey(a.inputId) || submitted.contains(a.inputId))fail('ANSWER_OWNERSHIP');submitted.add(a.inputId);CardstackFlowPlan.Input i=inputs.get(a.inputId);CardstackFlowTypes.Value v=new CardstackFlowTypes.Value();
            if(a.operation=='clear') {if(a.value!=null || i.allowClear!=true)fail('CLEAR_DENIED');v.presence='CLEAR';}
            else if(a.operation=='set') {if(a.value==null)fail('NULL_SET');v.presence='VALUE';v.value=coerce(i.type,a.value,i.scale,i.choices);}
            else fail('ANSWER_OPERATION');s.resources.put(a.inputId,v);
        }
        visibility(s,n);for(String id:submitted)if(!s.visibleInputIds.contains(id))fail('HIDDEN_ANSWER');
        if(requireAll)for(CardstackFlowPlan.Input i:n.inputs)if(i.required && s.visibleInputIds.contains(i.inputId)) {
            CardstackFlowTypes.Value v=s.resources.get(i.inputId);if(v.presence!='VALUE' || (i.type=='String' && String.isBlank((String)v.value)))fail('REQUIRED_INPUT');
        }
        checkpoint(s).accepted=cloneValues(s.resources);
    }
    private static void visibility(CardstackFlowTypes.EngineState s,CardstackFlowPlan.Node n) {
        s.visibleInputIds.clear();for(CardstackFlowPlan.Input i:n.inputs) {
            if(i.visibility==null || test(i.visibility,s))s.visibleInputIds.add(i.inputId);
            else {CardstackFlowTypes.Value v=new CardstackFlowTypes.Value();v.presence='HIDDEN';s.resources.put(i.inputId,v);}
        }
    }
    private static void back(CardstackFlowPlan.Plan p,CardstackFlowTypes.EngineState s) {
        if(s.checkpoints.isEmpty())fail('BACK_DENIED');CardstackFlowTypes.Checkpoint current=checkpoint(s);
        if(s.status=='Review') {if(!node(p,current.node).allowBack)fail('BACK_DENIED');}
        else {
            if(s.status!='Editing' || !node(p,s.node).allowBack || s.checkpoints.size()<2)fail('BACK_DENIED');s.checkpoints.remove(s.checkpoints.size()-1);current=checkpoint(s);
        }
        restoreCheckpoint(p,s,current);
    }
    private static void restoreCheckpoint(CardstackFlowPlan.Plan p,CardstackFlowTypes.EngineState s,CardstackFlowTypes.Checkpoint current) {
        s.resources=cloneValues(current.entry);CardstackFlowPlan.Node n=node(p,current.node);
        for(CardstackFlowPlan.Input i:n.inputs)if(current.accepted.containsKey(i.inputId))s.resources.put(i.inputId,cloneValue(current.accepted.get(i.inputId)));
        s.node=current.node;s.status='Editing';visibility(s,n);
    }
    private static CardstackFlowTypes.Value resolve(CardstackFlowPlan.Operand o,CardstackFlowTypes.EngineState s) {
        if(o==null)fail('OPERAND');if(o.kind=='resource'){if(!s.resources.containsKey(o.reference))fail('RESOURCE_REFERENCE');return cloneValue(s.resources.get(o.reference));}
        CardstackFlowTypes.Value v=new CardstackFlowTypes.Value();v.presence='VALUE';
        if(o.kind=='literal')v.value=o.value;
        else if(o.kind=='currentRecordField'){if(!s.currentRecord.containsKey(o.reference))fail('CONTEXT_READ_MISSING');v.value=s.currentRecord.get(o.reference);}
        else fail('OPERAND_KIND');if(v.value==null)v.presence='CLEAR';return v;
    }
    private static Boolean test(CardstackFlowPlan.Predicate p,CardstackFlowTypes.EngineState s) {
        if(p==null || p.atoms==null || p.atoms.isEmpty() || p.atoms.size()>8 || (p.logic!='ALL' && p.logic!='ANY'))fail('PREDICATE');
        Boolean matched=p.logic=='ALL';for(CardstackFlowPlan.Atom a:p.atoms) {
            Object left=effective(resolve(a.left,s)),right=effective(resolve(a.right,s));Boolean value=false;
            if(a.operator=='IS_NULL'){if(!(right instanceof Boolean))fail('PREDICATE_TYPE');value=(left==null)==(Boolean)right;}
            else if(a.operator=='EQ'||a.operator=='NE') {value=equalValues(a.left.type,left,right);if(a.operator=='NE')value=!value;}
            else if(left!=null && right!=null) {Integer comparison=compare(a.left.type,left,right);if(a.operator=='GT')value=comparison>0;else if(a.operator=='GTE')value=comparison>=0;else if(a.operator=='LT')value=comparison<0;else if(a.operator=='LTE')value=comparison<=0;else fail('PREDICATE_OPERATOR');}
            if(p.logic=='ALL' && !value)return false;if(p.logic=='ANY' && value)return true;
        }return matched;
    }
    private static Boolean equalValues(String type,Object a,Object b) {
        if(a==null || b==null)return a==null && b==null;
        if(type=='Integer'||type=='Decimal')return Decimal.valueOf(String.valueOf(a))==Decimal.valueOf(String.valueOf(b));
        if(type=='Boolean'){if(!(a instanceof Boolean)||!(b instanceof Boolean))fail('PREDICATE_TYPE');return (Boolean)a==(Boolean)b;}
        return String.valueOf(a).equals(String.valueOf(b));
    }
    private static Integer compare(String type,Object a,Object b) {
        if(type=='Integer'||type=='Decimal'){Decimal left=Decimal.valueOf(String.valueOf(a)),right=Decimal.valueOf(String.valueOf(b));return left<right?-1:left>right?1:0;}
        if(type=='Date'){Date left=Date.valueOf(String.valueOf(a)),right=Date.valueOf(String.valueOf(b));return left<right?-1:left>right?1:0;}fail('PREDICATE_TYPE');return 0;
    }
    /** Exact scalar wire coercion. Decimal and Integer remain strings, preserving precision and zero. */
    public static Object coerce(String type,Object raw,Integer scale,List<String> choices) {
        if(raw==null)fail('NULL_SET');if(type=='Boolean'){if(!(raw instanceof Boolean))fail('BOOLEAN_REQUIRED');return raw;}
        if(!(raw instanceof String) || ((String)raw).length()>4096)fail('STRING_OR_BUDGET');String value=(String)raw;
        if(type=='Integer'||type=='Decimal') {
            if(!Pattern.matches(type=='Integer'?'-?(0|[1-9][0-9]*)':'-?(0|[1-9][0-9]*)(\\.[0-9]+)?',value))fail('NUMBER_FORMAT');
            Integer point=value.indexOf('.');if(point>=0 && value.length()-point-1>scale)fail('NUMBER_SCALE');if(value.replace('-','').replace('.','').length()>28)fail('NUMBER_PRECISION');
        }else if(type=='Date') {
            if(!Pattern.matches('[0-9]{4}-[0-9]{2}-[0-9]{2}',value))fail('DATE_FORMAT');try{Date dateValue=Date.valueOf(value);if(String.valueOf(dateValue)!=value)fail('DATE_FORMAT');}catch(TypeException e){throw new FlowException('DATE_FORMAT',e);}
        }else if(type!='String')fail('SCALAR_TYPE');
        if(choices!=null && !choices.isEmpty() && !choices.contains(value))fail('CHOICE_VALUE');return value;
    }
    private static void valid(CardstackFlowPlan.Plan p,CardstackFlowTypes.EngineState s) {
        CardstackFlowPlan.validate(p);if(s==null || s.schemaVersion!='screen-flow-state/1' || s.planHash!=CardstackFlowPlan.hash(p) || s.resources==null || s.checkpoints==null || s.visibleInputIds==null || s.currentRecord==null || s.revision==null || s.revision<1 || !new Set<String>{'Editing','Review','Cancelled'}.contains(s.status))fail('INVALID_STATE');budget(s);
        if(s.status!='Cancelled') {
            if(s.resources.size()!=p.resources.size())fail('INVALID_RESOURCES');for(CardstackFlowPlan.Resource r:p.resources) {
                CardstackFlowTypes.Value v=s.resources.get(r.name);if(v==null || !new Set<String>{'VALUE','CLEAR','ABSENT','HIDDEN'}.contains(v.presence) || (v.presence!='VALUE' && v.value!=null))fail('INVALID_RESOURCES');
                if(r.origin=='CONTEXT' && (v.presence!='VALUE' || v.value!=s.currentRecord.get('Id')))fail('CONTEXT_TAMPER');
            }
            validateValues(p,s.resources,s.currentRecord);
            Set<String> visited=new Set<String>();for(CardstackFlowTypes.Checkpoint c:s.checkpoints){if(c==null || visited.contains(c.node) || node(p,c.node).kind!='SCREEN')fail('INVALID_CHECKPOINT');visited.add(c.node);validateValues(p,c.entry,s.currentRecord);validateValues(p,c.accepted,s.currentRecord);}
            CardstackFlowPlan.Node n=node(p,s.node);if((s.status=='Editing' && n.kind!='SCREEN') || (s.status=='Review' && n.kind!='UPDATE'))fail('INVALID_CURSOR');
            if(s.status=='Editing') {if(s.checkpoints.isEmpty() || checkpoint(s).node!=s.node)fail('INVALID_CHECKPOINT');CardstackFlowTypes.EngineState projected=CardstackFlowTypes.decode(JSON.serialize(s));visibility(projected,n);if(JSON.serialize(projected.visibleInputIds)!=JSON.serialize(s.visibleInputIds) || CardstackFlowPlan.hash(projected.resources)!=CardstackFlowPlan.hash(s.resources))fail('VISIBILITY_STATE_TAMPER');}
            else if(!s.visibleInputIds.isEmpty())fail('VISIBILITY_STATE_TAMPER');
        }
    }
    private static void validateValues(CardstackFlowPlan.Plan p,Map<String,CardstackFlowTypes.Value> values,Map<String,Object> record) {
        if(values==null || values.size()!=p.resources.size())fail('INVALID_RESOURCES');
        for(CardstackFlowPlan.Resource r:p.resources) {
            CardstackFlowTypes.Value v=values.get(r.name);if(v==null || !new Set<String>{'VALUE','CLEAR','ABSENT','HIDDEN'}.contains(v.presence) || (v.presence!='VALUE' && v.value!=null))fail('INVALID_RESOURCES');
            if(r.origin=='CONTEXT' && (v.presence!='VALUE' || v.value!=record.get('Id')))fail('CONTEXT_TAMPER');
            if(v.presence=='VALUE'){Integer scale=18;List<String> choices=new List<String>();for(CardstackFlowPlan.Node n:p.nodes)for(CardstackFlowPlan.Input i:n.inputs)if(i.inputId==r.name){scale=i.scale;choices=i.choices;}coerce(r.type,v.value,scale,choices);}
        }
    }
    private static CardstackFlowPlan.Node node(CardstackFlowPlan.Plan p,String name) {for(CardstackFlowPlan.Node n:p.nodes)if(n.name==name)return n;fail('INVALID_CURSOR');return null;}
    private static CardstackFlowPlan.Resource resource(CardstackFlowPlan.Plan p,String name) {for(CardstackFlowPlan.Resource r:p.resources)if(r.name==name)return r;fail('RESOURCE_REFERENCE');return null;}
    private static CardstackFlowTypes.Checkpoint checkpoint(CardstackFlowTypes.EngineState s) {if(s.checkpoints.isEmpty())fail('INVALID_CHECKPOINT');return s.checkpoints[s.checkpoints.size()-1];}
    private static Object effective(CardstackFlowTypes.Value v) {return v.presence=='VALUE'?v.value:null;}
    private static Map<String,CardstackFlowTypes.Value> cloneValues(Map<String,CardstackFlowTypes.Value> values) {return CardstackFlowTypes.decodeValues(JSON.deserializeUntyped(JSON.serialize(values)));}
    private static CardstackFlowTypes.Value cloneValue(CardstackFlowTypes.Value value) {CardstackFlowTypes.Value result=new CardstackFlowTypes.Value();result.presence=value.presence;result.value=value.value;return result;}
    private static void budget(CardstackFlowTypes.EngineState s) {if(s.checkpoints.size()>8 || Blob.valueOf(JSON.serialize(s)).size()>32768)fail('STATE_BUDGET');}
    private static void fail(String code) {throw new FlowException(code);}
}
