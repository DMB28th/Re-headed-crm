/** Compiles a strictly bounded native API-67 Metadata shape; performs no acquisition or CRM effects. */
public with sharing class CardstackFlowCompiler {
    public class CompileException extends Exception {}
    public with sharing class Result {public CardstackFlowPlan.Plan plan;public CardstackFlowCompatibilityReport report;public String sourceHash,planHash;}
    private CardstackFlowPlan.Plan plan=new CardstackFlowPlan.Plan();
    private Map<String,CardstackFlowPlan.Resource> resources=new Map<String,CardstackFlowPlan.Resource>();
    private Map<String,Object> choices=new Map<String,Object>();
    private CardstackFlowCompatibilityReport report;
    private String path='$';
    /** trustedIdentity must come from the authorized exact-version acquisition lane, never imported JSON. */
    public static Result compile(String rawMetadata,CardstackFlowPlan.Identity trustedIdentity) {
        Result result=new Result();result.report=new CardstackFlowCompatibilityReport();
        if(String.isBlank(rawMetadata) || Blob.valueOf(rawMetadata).size()>131072){result.report.block('SOURCE_BUDGET','$',null);return result;}
        CardstackFlowCompiler c=new CardstackFlowCompiler();c.report=result.report;
        try {
            c.identity(trustedIdentity);Map<String,Object> metadata=obj(JSON.deserializeUntyped(rawMetadata));
            result.sourceHash=CardstackFlowPlan.hash(metadata);c.plan.identity=(CardstackFlowPlan.Identity)JSON.deserializeStrict(JSON.serialize(trustedIdentity),CardstackFlowPlan.Identity.class);
            if(trustedIdentity.sourceHash!=null && trustedIdentity.sourceHash!=result.sourceHash)throw new CompileException('SOURCE_HASH_MISMATCH');
            c.plan.identity.sourceHash=result.sourceHash;result.report.sourceHash=result.sourceHash;result.report.identity=c.plan.identity;
            c.build(metadata);CardstackFlowPlan.validate(c.plan);c.references();
            if(Blob.valueOf(JSON.serialize(c.plan)).size()>65536)throw new CompileException('PLAN_BUDGET');
            result.plan=c.plan;result.planHash=CardstackFlowPlan.hash(c.plan);result.report.verdict='SUPPORTED';
        }catch(JSONException e){result.report.block('INVALID_METADATA',c.path,null);}
        catch(CompileException e){if(e.getMessage().startsWith('ACQUISITION_') || e.getMessage()=='SOURCE_HASH_MISMATCH')result.report.verdict='ACQUISITION_FAILED';result.report.block(e.getMessage(),c.path,null);}
        catch(CardstackFlowPlan.PlanException e){result.report.block(e.getMessage(),c.path,null);}
        catch(CardstackFlowEngine.FlowException e){result.report.block(e.getMessage(),c.path,null);}
        catch(TypeException e){result.report.block('INVALID_METADATA_TYPE',c.path,null);}
        catch(StringException e){result.report.block('INVALID_METADATA_TYPE',c.path,null);}
        return result;
    }
    private void identity(CardstackFlowPlan.Identity i) {
        if(i==null || i.apiVersion!='67.0' || i.versionNumber==null || i.versionNumber<1 || !identifier(i.apiName))throw new CompileException('ACQUISITION_IDENTITY');
        try {
            if(i.definitionId18==null || i.versionId18==null || i.definitionId18.length()!=18 || i.versionId18.length()!=18 || CardstackConnectionTypes.normalizeId(i.definitionId18)!=i.definitionId18 || CardstackConnectionTypes.normalizeId(i.versionId18)!=i.versionId18)throw new CompileException('ACQUISITION_IDENTITY');
        }catch(CardstackConnectionTypes.ConnectionException e){throw new CompileException('ACQUISITION_IDENTITY',e);}
    }
    private void build(Map<String,Object> m) {
        check(m,'apiVersion processType status label description interviewLabel start variables screens assignments decisions recordUpdates choices areMetricsLoggedToDataCloud','');
        if(m.get('areMetricsLoggedToDataCloud')!=null && m.get('areMetricsLoggedToDataCloud')!=false)throw new CompileException('METRICS_MODE_UNSUPPORTED');
        if(str(m.get('processType'))!='Flow' || str(m.get('status'))!='Active' || Decimal.valueOf(String.valueOf(m.get('apiVersion')))!=67)throw new CompileException('UNSUPPORTED_SOURCE_API_OR_MODE');
        plan.identity.sourceApiVersion='67.0';
        path='$.start';Map<String,Object> start=obj(m.get('start'));check(start,'connector','locationX locationY');plan.entryNode=connector(start.get('connector'));
        for(Object raw:arr(m.get('variables')))variable(obj(raw));
        for(Object raw:arr(m.get('choices'))) {
            Map<String,Object> c=obj(raw);check(c,'name dataType value choiceText','');String name=name(c);if(choices.containsKey(name))throw new CompileException('DUPLICATE_CHOICE');choices.put(name,c);
        }
        for(Object raw:arr(m.get('screens')))collectInputs(arr(obj(raw).get('fields')),0);
        Integer index=0;
        for(Object raw:arr(m.get('screens'))) {path='$.screens['+index+++']';screen(obj(raw));}
        index=0;for(Object raw:arr(m.get('assignments'))) {path='$.assignments['+index+++']';assignment(obj(raw));}
        index=0;for(Object raw:arr(m.get('decisions'))) {path='$.decisions['+index+++']';decision(obj(raw));}
        index=0;for(Object raw:arr(m.get('recordUpdates'))) {path='$.recordUpdates['+index+++']';updateNode(obj(raw));}
        plan.readSet.sort();plan.writeSet.sort();
    }
    private void variable(Map<String,Object> v) {
        path='$.variables';check(v,'name dataType isCollection isInput isOutput','description');String name=name(v),type=scalar(str(v.get('dataType')),0);
        booleans(v,new List<String>{'isCollection','isInput','isOutput'});if(v.get('isCollection')!=false || v.get('isOutput')==true)throw new CompileException('UNSUPPORTED_VARIABLE');
        CardstackFlowPlan.Resource r=new CardstackFlowPlan.Resource();r.name=name;r.type=type;
        if(name=='recordId') {if(type!='String' || v.get('isInput')!=true)throw new CompileException('CONTEXT_VARIABLE');r.origin='CONTEXT';}
        else {if(v.get('isInput')==true)throw new CompileException('UNSUPPORTED_EXTERNAL_INPUT');r.origin='COMPUTED';}
        addResource(r);
    }
    private void collectInputs(List<Object> fields,Integer depth) {
        if(depth>4)throw new CompileException('REGION_DEPTH');
        for(Object raw:fields) {
            Map<String,Object> f=obj(raw);String kind=str(f.get('fieldType'));
            if(kind=='RegionContainer' || kind=='Region')collectInputs(arr(f.get('fields')),depth+1);
            else if(kind!='DisplayText') {
                CardstackFlowPlan.Resource r=new CardstackFlowPlan.Resource();r.name=name(f);r.type=scalar(str(f.get('dataType')),integer(f.get('scale'),0));r.origin='INPUT';addResource(r);
            }
        }
    }
    private void addResource(CardstackFlowPlan.Resource r) {
        if(r.name=='currentRecord' || resources.containsKey(r.name) || resources.size()>=40)throw new CompileException('RESOURCE_DUPLICATE_OR_BUDGET');resources.put(r.name,r);plan.resources.add(r);
    }
    private void screen(Map<String,Object> s) {
        check(s,'name label connector fields allowBack allowFinish allowPause','description locationX locationY showFooter showHeader');
        booleans(s,new List<String>{'allowPause','allowBack','allowFinish'});if(s.get('allowPause')==true)throw new CompileException('PAUSE_UNSUPPORTED');CardstackFlowPlan.Node n=node(s,'SCREEN');n.nextNode=connector(s.get('connector'));n.allowBack=s.get('allowBack')==true;
        fields(n,arr(s.get('fields')),null,0);plan.nodes.add(n);
    }
    private void fields(CardstackFlowPlan.Node n,List<Object> fieldList,String parent,Integer depth) {
        Integer index=0;
        for(Object raw:fieldList) {
            String before=path;path+='.fields['+index+++']';Map<String,Object> f=obj(raw);String kind=str(f.get('fieldType'));
            if(kind=='RegionContainer' || kind=='Region') {
                check(f,kind=='Region'?'name fieldType fields fieldText styleProperties regionContainerType inputParameters isRequired':'name fieldType fields fieldText styleProperties regionContainerType isRequired','');style(f.get('styleProperties'));
                if(f.get('isRequired')!=null && (!(f.get('isRequired') instanceof Boolean) || (Boolean)f.get('isRequired')))throw new CompileException('REGION_REQUIRED_UNSUPPORTED');
                if(kind=='RegionContainer'){if(!'SectionWithHeader'.equals(str(f.get('regionContainerType')))){path+='.regionContainerType';throw new CompileException('REGION_CONTAINER_TYPE_UNSUPPORTED');}if(String.isBlank(str(f.get('fieldText'))) || str(f.get('fieldText')).contains('<') || str(f.get('fieldText')).contains('{!'))throw new CompileException('REGION_HEADER_UNSUPPORTED');}
                else {if(f.get('regionContainerType')!=null)throw new CompileException('REGION_CONTAINER_TYPE_UNSUPPORTED');regionWidth(f.get('inputParameters'));}
                if(depth>=4)throw new CompileException('REGION_DEPTH');
                CardstackFlowPlan.Section s=new CardstackFlowPlan.Section();s.sectionId=name(f);s.label=label(f.get('fieldText'),s.sectionId);s.parentId=parent;s.depth=depth+1;n.sections.add(s);fields(n,arr(f.get('fields')),s.sectionId,depth+1);
            }else if(kind=='DisplayText') {
                check(f,'name fieldType fieldText styleProperties','');style(f.get('styleProperties'));String text=label(f.get('fieldText'),'');if(text.contains('<') || text.contains('{!'))throw new CompileException('RICH_TEXT_UNSUPPORTED');n.textBlocks.add(text);
            }else {
                check(f,'name fieldType dataType fieldText isRequired defaultValue scale choiceReferences visibilityRule styleProperties','');style(f.get('styleProperties'));
                booleans(f,new List<String>{'isRequired'});if(!new Set<String>{'InputField','LargeTextArea','DropdownBox','RadioButtons'}.contains(kind))throw new CompileException('SCREEN_COMPONENT_UNSUPPORTED');
                CardstackFlowPlan.Input i=new CardstackFlowPlan.Input();i.inputId=name(f);i.label=label(f.get('fieldText'),i.inputId);i.type=resources.get(i.inputId).type;i.required=f.get('isRequired')==true;i.scale=integer(f.get('scale'),0);i.sectionId=parent;
                if(i.scale<0 || i.scale>18)throw new CompileException('DECIMAL_SCALE');
                if(f.get('defaultValue')!=null)i.defaultValue=operand(obj(f.get('defaultValue')),i.type);
                if(f.get('visibilityRule')!=null)i.visibility=predicate(obj(f.get('visibilityRule')));
                for(Object choiceName:arr(f.get('choiceReferences'))) {
                    Map<String,Object> c=(Map<String,Object>)choices.get(str(choiceName));if(c==null || scalar(str(c.get('dataType')),0)!=i.type)throw new CompileException('CHOICE_REFERENCE');CardstackFlowPlan.Operand o=operand(obj(c.get('value')),i.type);
                    if(o.kind!='literal' || !(o.value instanceof String) || i.choices.contains((String)o.value) || i.choices.size()>=100)throw new CompileException('CHOICE_VALUE');i.choices.add((String)o.value);
                }
                if((kind=='DropdownBox' || kind=='RadioButtons') && i.choices.isEmpty())throw new CompileException('DYNAMIC_CHOICE_UNSUPPORTED');n.inputs.add(i);
            }
            path=before;
        }
    }
    private void assignment(Map<String,Object> a) {
        check(a,'name label connector assignmentItems','description locationX locationY');CardstackFlowPlan.Node n=node(a,'SET');n.nextNode=connector(a.get('connector'));
        for(Object raw:arr(a.get('assignmentItems'))) {
            Map<String,Object> item=obj(raw);check(item,'assignToReference operator value','');String target=str(item.get('assignToReference'));CardstackFlowPlan.Resource r=resources.get(target);
            if(r==null || r.origin!='COMPUTED' || str(item.get('operator'))!='Assign')throw new CompileException('ASSIGNMENT_TARGET_OR_OPERATOR');n.assignments.add(binding(target,obj(item.get('value')),r.type));
        }
        if(n.assignments.isEmpty())throw new CompileException('EMPTY_ASSIGNMENT');plan.nodes.add(n);
    }
    private void decision(Map<String,Object> d) {
        check(d,'name label defaultConnector defaultConnectorLabel rules','description locationX locationY');CardstackFlowPlan.Node n=node(d,'DECISION');n.nextNode=connector(d.get('defaultConnector'));
        for(Object raw:arr(d.get('rules'))) {
            Map<String,Object> r=obj(raw);check(r,'name label conditionLogic conditions connector','');CardstackFlowPlan.Rule rule=new CardstackFlowPlan.Rule();rule.predicate=predicate(new Map<String,Object>{'conditionLogic'=>r.get('conditionLogic'),'conditions'=>r.get('conditions')});rule.nextNode=connector(r.get('connector'));n.rules.add(rule);
        }
        if(n.rules.isEmpty() || n.rules.size()>8)throw new CompileException('DECISION_RULE_BUDGET');plan.nodes.add(n);
    }
    private void updateNode(Map<String,Object> u) {
        check(u,'name label object filters filterLogic inputAssignments','description locationX locationY');
        String target=str(u.get('object'));if(!identifier(target))throw new CompileException('UPDATE_OBJECT');
        List<Object> filters=arr(u.get('filters'));if(filters.size()!=1 || !new Set<String>{'and','AND'}.contains(str(u.get('filterLogic'))))throw new CompileException('UPDATE_TARGET');
        Map<String,Object> f=obj(filters[0]);check(f,'field operator value','');Map<String,Object> value=obj(f.get('value'));check(value,'elementReference','');
        if(str(f.get('field'))!='Id' || str(f.get('operator'))!='EqualTo' || str(value.get('elementReference'))!='recordId' || !resources.containsKey('recordId'))throw new CompileException('UPDATE_TARGET');
        CardstackFlowPlan.Node n=node(u,'UPDATE');plan.targetObjectApiName=target;
        for(Object raw:arr(u.get('inputAssignments'))) {
            Map<String,Object> a=obj(raw);check(a,'field value','');String field=str(a.get('field'));if(!identifier(field) || field=='Id' || plan.writeSet.contains(field))throw new CompileException('UPDATE_FIELD');
            CardstackFlowPlan.Operand o=operand(obj(a.get('value')),null);CardstackFlowPlan.Binding b=new CardstackFlowPlan.Binding();b.target=field;b.value=o;n.assignments.add(b);plan.writeSet.add(field);
        }
        plan.nodes.add(n);
    }
    private CardstackFlowPlan.Predicate predicate(Map<String,Object> raw) {
        check(raw,'conditionLogic conditions','');String logic=str(raw.get('conditionLogic'));if(!new Set<String>{'and','or','AND','OR'}.contains(logic))throw new CompileException('CONDITION_LOGIC');
        CardstackFlowPlan.Predicate p=new CardstackFlowPlan.Predicate();p.logic=logic.toLowerCase()=='and'?'ALL':'ANY';
        for(Object item:arr(raw.get('conditions'))) {
            Map<String,Object> a=obj(item);check(a,'leftValueReference operator rightValue','');CardstackFlowPlan.Atom atom=new CardstackFlowPlan.Atom();atom.left=operand(new Map<String,Object>{'elementReference'=>a.get('leftValueReference')},null);
            Map<String,String> operators=new Map<String,String>{'EqualTo'=>'EQ','NotEqualTo'=>'NE','IsNull'=>'IS_NULL','GreaterThan'=>'GT','GreaterThanOrEqualTo'=>'GTE','LessThan'=>'LT','LessThanOrEqualTo'=>'LTE'};atom.operator=operators.get(str(a.get('operator')));if(atom.operator==null)throw new CompileException('PREDICATE_OPERATOR');
            atom.right=operand(obj(a.get('rightValue')),atom.operator=='IS_NULL'?'Boolean':atom.left.type);
            if(atom.operator!='EQ' && atom.operator!='NE' && atom.operator!='IS_NULL' && !new Set<String>{'Integer','Decimal','Date'}.contains(atom.left.type))throw new CompileException('PREDICATE_TYPE');p.atoms.add(atom);
        }
        if(p.atoms.isEmpty() || p.atoms.size()>8)throw new CompileException('PREDICATE_BUDGET');return p;
    }
    private CardstackFlowPlan.Operand operand(Map<String,Object> value,String expected) {
        check(value,'elementReference stringValue booleanValue numberValue dateValue','');List<String> populated=new List<String>();for(String key:value.keySet())if(value.get(key)!=null)populated.add(key);
        if(populated.size()!=1)throw new CompileException('OPERAND_SHAPE');String key=populated[0];CardstackFlowPlan.Operand o=new CardstackFlowPlan.Operand();
        if(key=='elementReference') {
            String ref=str(value.get(key));o.reference=ref;
            if(ref.startsWith('currentRecord.')) {String field=ref.substring(14);if(!identifier(field) || field=='Id' || expected==null)throw new CompileException('CURRENT_RECORD_READ');o.kind='currentRecordField';o.reference=field;o.type=expected;if(!plan.readSet.contains(field))plan.readSet.add(field);}
            else {CardstackFlowPlan.Resource r=resources.get(ref);if(r==null || r.origin=='CONTEXT')throw new CompileException('RESOURCE_REFERENCE');o.kind='resource';o.type=r.type;}
        }else {
            o.kind='literal';o.type=key=='booleanValue'?'Boolean':key=='numberValue'?(expected=='Integer'?'Integer':'Decimal'):key=='dateValue'?'Date':'String';o.value=value.get(key);
            if(o.type=='Integer' || o.type=='Decimal'){if(!(o.value instanceof Decimal) && !(o.value instanceof Integer) && !(o.value instanceof Long))throw new CompileException('EXPECTED_NATIVE_NUMBER');o.value=CardstackFlowPlan.canonical(o.value);}
            CardstackFlowEngine.coerce(o.type,o.value,18,new List<String>());
        }
        if(expected!=null && o.type!=expected)throw new CompileException('OPERAND_TYPE');return o;
    }
    private CardstackFlowPlan.Binding binding(String target,Map<String,Object> raw,String type) {CardstackFlowPlan.Binding b=new CardstackFlowPlan.Binding();b.target=target;b.value=operand(raw,type);return b;}
    private void references() {
        dominance();
        for(CardstackFlowPlan.Node n:plan.nodes)if(n.kind=='SCREEN') {
            Set<String> screenInputs=new Set<String>();for(CardstackFlowPlan.Input i:n.inputs)screenInputs.add(i.inputId);
            Set<String> seen=new Set<String>();
            for(CardstackFlowPlan.Input i:n.inputs) {
                if(i.defaultValue!=null && i.defaultValue.kind=='resource' && screenInputs.contains(i.defaultValue.reference))throw new CompileException('SAME_SCREEN_DEFAULT');
                if(i.visibility!=null)for(CardstackFlowPlan.Atom a:i.visibility.atoms) {
                    checkVisibilityOperand(a.left,screenInputs,seen);checkVisibilityOperand(a.right,screenInputs,seen);
                }
                seen.add(i.inputId);
            }

        }
    }
    private void dominance() {
        Map<String,Set<String>> available=new Map<String,Set<String>>();Set<String> complete=new Set<String>();
        while(complete.size()<plan.nodes.size()) {
            Boolean progress=false;
            for(CardstackFlowPlan.Node n:plan.nodes)if(!complete.contains(n.name)) {
                Set<String> before=new Set<String>();Boolean ready=true,first=true;
                for(CardstackFlowPlan.Node prior:plan.nodes)if(CardstackFlowPlan.edges(prior).contains(n.name)) {
                    if(!complete.contains(prior.name)){ready=false;break;}
                    if(first){before.addAll(available.get(prior.name));first=false;}else before.retainAll(available.get(prior.name));
                }
                if(!ready)continue;
                if(n.kind=='SCREEN')for(CardstackFlowPlan.Input i:n.inputs){availableOperand(i.defaultValue,before);if(i.visibility!=null)for(CardstackFlowPlan.Atom a:i.visibility.atoms){availableOperand(a.left,before);availableOperand(a.right,before);}before.add(i.inputId);}
                if(n.kind=='SET'||n.kind=='UPDATE')for(CardstackFlowPlan.Binding b:n.assignments){availableOperand(b.value,before);if(n.kind=='SET')before.add(b.target);}
                if(n.kind=='DECISION')for(CardstackFlowPlan.Rule r:n.rules)for(CardstackFlowPlan.Atom a:r.predicate.atoms){availableOperand(a.left,before);availableOperand(a.right,before);}
                available.put(n.name,before);complete.add(n.name);progress=true;
            }
            if(!progress)throw new CompileException('GRAPH_CYCLE');
        }
    }
    private void availableOperand(CardstackFlowPlan.Operand operand,Set<String> available) {if(operand!=null && operand.kind=='resource' && !available.contains(operand.reference))throw new CompileException('RESOURCE_NOT_DOMINATING');}
    private void regionWidth(Object raw) {
        List<Object> parameters=arr(raw);String originalPath=path;path+='.inputParameters';
        if(parameters.size()!=1)throw new CompileException('REGION_WIDTH_UNSUPPORTED');Map<String,Object> parameter=obj(parameters[0]);check(parameter,'name value','');
        if(!'width'.equals(str(parameter.get('name'))))throw new CompileException('REGION_WIDTH_UNSUPPORTED');Map<String,Object> value=obj(parameter.get('value'));check(value,'stringValue','');
        if(!'12'.equals(str(value.get('stringValue'))))throw new CompileException('REGION_WIDTH_UNSUPPORTED');path=originalPath;
    }
    private void style(Object raw) {
        if(raw==null)return;Map<String,Object> style=obj(raw);check(style,'verticalAlignment width styleSettings','');if(populated(style.get('styleSettings')))throw new CompileException('STYLE_UNSUPPORTED');
        if(style.get('verticalAlignment')!=null){Map<String,Object> value=obj(style.get('verticalAlignment'));check(value,'stringValue','');if(str(value.get('stringValue'))!='top')throw new CompileException('STYLE_ALIGNMENT_UNSUPPORTED');}
        if(style.get('width')!=null){Map<String,Object> value=obj(style.get('width'));check(value,'stringValue','');if(str(value.get('stringValue'))!='12')throw new CompileException('STYLE_WIDTH_UNSUPPORTED');}
        notice('PRESENTATION_STYLE_NORMALIZED',path+'.styleProperties');
    }
    private void notice(String code,String issuePath){CardstackFlowCompatibilityReport.Issue issue=new CardstackFlowCompatibilityReport.Issue();issue.code=code;issue.path=issuePath;issue.reason=code;issue.blocksStart=false;report.notices.add(issue);}
    private static void booleans(Map<String,Object> raw,List<String> fields) {for(String field:fields)if(raw.get(field)!=null && !(raw.get(field) instanceof Boolean))throw new CompileException('EXPECTED_BOOLEAN');}
    private void checkVisibilityOperand(CardstackFlowPlan.Operand o,Set<String> screenInputs,Set<String> seen) {
        if(o.kind=='resource' && (resources.get(o.reference).origin=='COMPUTED' || (screenInputs.contains(o.reference) && !seen.contains(o.reference))))throw new CompileException('VISIBILITY_DEPENDENCY');
    }
    private CardstackFlowPlan.Node node(Map<String,Object> source,String kind) {CardstackFlowPlan.Node n=new CardstackFlowPlan.Node();n.name=name(source);n.kind=kind;n.label=label(source.get('label'),n.name);return n;}
    private String connector(Object raw) {if(raw==null)throw new CompileException('CONNECTOR_REQUIRED');Map<String,Object> c=obj(raw);check(c,'targetReference','');String target=str(c.get('targetReference'));if(!identifier(target))throw new CompileException('CONNECTOR_REQUIRED');return target;}
    private static String scalar(String raw,Integer scale) {if(raw=='Number' || raw=='Currency')return scale==0?'Integer':'Decimal';if(new Set<String>{'String','Boolean','Date','Integer','Decimal'}.contains(raw))return raw;throw new CompileException('SCALAR_UNSUPPORTED');}
    private String name(Map<String,Object> raw) {String name=str(raw.get('name'));if(!identifier(name))throw new CompileException('INVALID_NAME');return name;}
    private static Boolean identifier(String raw) {return raw!=null && Pattern.matches('[A-Za-z][A-Za-z0-9_]{0,79}',raw);}
    private static String label(Object raw,String fallback) {String value=raw==null?fallback:str(raw);if(value.length()>256)throw new CompileException('LABEL_BUDGET');return value;}
    private void check(Map<String,Object> raw,String semantics,String cosmetic) {
        Set<String> allowed=new Set<String>(semantics.split(' '));allowed.addAll(cosmetic.split(' '));
        for(String cosmeticKey:cosmetic.split(' '))if(raw.containsKey(cosmeticKey) && populated(raw.get(cosmeticKey)))notice('PRESENTATION_PROPERTY_NORMALIZED',path+'.'+cosmeticKey);
        for(String key:raw.keySet())if(!allowed.contains(key) && populated(raw.get(key))) {path+='.'+key;throw new CompileException('UNSUPPORTED_PROPERTY');}
    }
    private static Boolean populated(Object raw) {if(raw==null)return false;if(raw instanceof List<Object>)return !((List<Object>)raw).isEmpty();if(raw instanceof Map<String,Object>)return !((Map<String,Object>)raw).isEmpty();return true;}
    private static Map<String,Object> obj(Object raw) {if(!(raw instanceof Map<String,Object>))throw new CompileException('EXPECTED_OBJECT');return (Map<String,Object>)raw;}
    private static List<Object> arr(Object raw) {if(raw==null)return new List<Object>();if(!(raw instanceof List<Object>))throw new CompileException('EXPECTED_ARRAY');return (List<Object>)raw;}
    private static String str(Object raw) {if(raw==null)return null;if(!(raw instanceof String))throw new CompileException('EXPECTED_STRING');return (String)raw;}
    private static Integer integer(Object raw,Integer fallback) {if(raw==null)return fallback;Decimal d=Decimal.valueOf(String.valueOf(raw));if(d!=d.setScale(0))throw new CompileException('EXPECTED_INTEGER');return d.intValue();}
}
