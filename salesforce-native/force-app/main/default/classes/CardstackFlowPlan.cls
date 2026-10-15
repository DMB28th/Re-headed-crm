/** Immutable normalized subset. Publication envelopes are deliberately outside this body. */
public with sharing class CardstackFlowPlan {
    public static final String SCHEMA='cardstack-flow-plan/1', COMPILER='cardstack-flow-compiler/1';
    public class PlanException extends Exception {}
    public with sharing class Identity {
        public String definitionId18;public String versionId18;public Integer versionNumber;
        public String namespace;public String apiName;public String apiVersion;public String sourceApiVersion;public String sourceHash;
    }
    public with sharing class Plan {
        public String schemaVersion=SCHEMA,compilerVersion=COMPILER;public Identity identity;
        public String entryNode;public String targetObjectApiName;
        public List<Node> nodes=new List<Node>();public List<Resource> resources=new List<Resource>();
        public List<String> readSet=new List<String>(),writeSet=new List<String>();
    }
    public with sharing class Resource { public String name,type,origin;public Boolean isCollection=false; }
    public with sharing class Operand { public String kind,type,reference;public Object value; }
    public with sharing class Atom { public Operand left,right;public String operator; }
    public with sharing class Predicate { public String logic;public List<Atom> atoms=new List<Atom>(); }
    public with sharing class Binding { public String target;public Operand value; }
    public with sharing class Rule { public Predicate predicate;public String nextNode; }
    public with sharing class Input {
        public String inputId,label,type;public Boolean required=false,allowClear=true;
        public Integer scale=0;public Operand defaultValue;public Predicate visibility;
        public List<String> choices=new List<String>();public String sectionId;
    }
    public with sharing class Section { public String sectionId,label,parentId;public Integer depth,columns=1; }
    public with sharing class Node {
        public String name,kind,label,nextNode;public Boolean allowBack=false;
        public List<Input> inputs=new List<Input>();public List<Section> sections=new List<Section>();public List<String> textBlocks=new List<String>();
        public List<Binding> assignments=new List<Binding>();public List<Rule> rules=new List<Rule>();
    }
    /** Canonical JSON v1: sorted object keys; retained list order; normalized decimal text. */
    public static String canonical(Object value) {
        if(value==null) return 'null';
        if(value instanceof Map<String,Object>) {
            Map<String,Object> values=(Map<String,Object>)value;List<String> keys=new List<String>(values.keySet());keys.sort();List<String> chunks=new List<String>();
            for(String key:keys) chunks.add(JSON.serialize(key)+':'+canonical(values.get(key)));return '{'+String.join(chunks,',')+'}';
        }
        if(value instanceof List<Object>) {List<String> chunks=new List<String>();for(Object item:(List<Object>)value) chunks.add(canonical(item));return '['+String.join(chunks,',')+']';}
        if(value instanceof Decimal) {String n=String.valueOf(value);if(n.contains('.')) {while(n.endsWith('0')) n=n.substring(0,n.length()-1);if(n.endsWith('.')) n=n.substring(0,n.length()-1);}return n=='-0'?'0':n;}
        return JSON.serialize(value);
    }
    /** Hashes the complete JSON-compatible body, including null and empty metadata padding. */
    public static String hash(Object body) {
        Object value=JSON.deserializeUntyped(JSON.serialize(body));
        return EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256',Blob.valueOf(canonical(value))));
    }
    /** Strict compiled-plan codec restores only tagged literal scalars, never arbitrary Object data. */
    public static Plan decode(String rawJson) {
        if(String.isBlank(rawJson) || Blob.valueOf(rawJson).size()>65536)fail('PLAN_BUDGET');
        Map<String,Object> body=(Map<String,Object>)JSON.deserializeUntyped(rawJson);
        Map<String,Object> literals=new Map<String,Object>();stripOperands(body,'$',literals);
        Plan p=(Plan)JSON.deserializeStrict(JSON.serialize(body),Plan.class);
        Integer ni=0;for(Node n:p.nodes) {
            String base='$.nodes['+ni+++']';Integer ii=0;
            for(Input input:n.inputs) {String ip=base+'.inputs['+ii+++']';restoreOperand(input.defaultValue,ip+'.defaultValue',literals);restorePredicate(input.visibility,ip+'.visibility',literals);}
            Integer bi=0;for(Binding b:n.assignments)restoreOperand(b.value,base+'.assignments['+bi+++'].value',literals);
            Integer ri=0;for(Rule r:n.rules)restorePredicate(r.predicate,base+'.rules['+ri+++'].predicate',literals);
        }
        validate(p);return p;
    }
    private static void stripOperands(Object raw,String path,Map<String,Object> values) {
        if(raw instanceof Map<String,Object>) {
            Map<String,Object> m=(Map<String,Object>)raw;
            if(m.containsKey('kind') && m.containsKey('type') && m.containsKey('reference')) {
                Object value=m.remove('value');if(value!=null && !(value instanceof String) && !(value instanceof Boolean))fail('OPERAND_SCALAR');values.put(path,value);
            }
            for(String key:m.keySet())stripOperands(m.get(key),path+'.'+key,values);
        }else if(raw instanceof List<Object>){Integer index=0;for(Object item:(List<Object>)raw)stripOperands(item,path+'['+index+++']',values);}
    }
    private static void restoreOperand(Operand o,String path,Map<String,Object> values) {if(o!=null){if(!values.containsKey(path))fail('OPERAND_SHAPE');o.value=values.get(path);}}
    private static void restorePredicate(Predicate p,String path,Map<String,Object> values) {if(p==null)return;Integer index=0;for(Atom a:p.atoms){String ap=path+'.atoms['+index+++']';restoreOperand(a.left,ap+'.left',values);restoreOperand(a.right,ap+'.right',values);}}
    /** Validates integrity before pure traversal; acquisition authorization remains outside this class. */
    public static void validate(Plan plan) {
        if(plan==null || plan.schemaVersion!=SCHEMA || plan.compilerVersion!=COMPILER || plan.identity==null || plan.nodes==null || plan.resources==null) fail('PLAN_VERSION');
        if(Blob.valueOf(JSON.serialize(plan)).size()>65536 || plan.nodes.size()>32 || plan.resources.size()>40 || plan.nodes.isEmpty()) fail('PLAN_BUDGET');
        Set<String> names=new Set<String>();Map<String,Resource> resources=new Map<String,Resource>();
        for(Resource r:plan.resources) {
            if(r==null || String.isBlank(r.name) || resources.containsKey(r.name) || r.isCollection!=false || !new Set<String>{'String','Boolean','Integer','Decimal','Date'}.contains(r.type) || !new Set<String>{'INPUT','CONTEXT','COMPUTED'}.contains(r.origin)) fail('RESOURCE');resources.put(r.name,r);
        }
        Map<String,Node> graph=new Map<String,Node>();Integer screens=0,terminals=0;Set<String> owned=new Set<String>();
        for(Node n:plan.nodes) {
            if(n==null || String.isBlank(n.name) || names.contains(n.name) || resources.containsKey(n.name)) fail('DUPLICATE_NAME');names.add(n.name);graph.put(n.name,n);
            if(n.kind=='SCREEN') {
                screens++;Set<String> sections=new Set<String>();for(Section section:n.sections){if(section==null || String.isBlank(section.sectionId) || sections.contains(section.sectionId) || resources.containsKey(section.sectionId) || section.depth<1 || section.depth>4 || section.columns<1 || section.columns>2)fail('SECTION_SHAPE');sections.add(section.sectionId);}
                if(n.inputs.size()>20) fail('INPUT_BUDGET');
                for(Input i:n.inputs) {Resource r=resources.get(i.inputId);if(r==null || r.origin!='INPUT' || r.type!=i.type || owned.contains(i.inputId)) fail('INPUT_OWNERSHIP');owned.add(i.inputId);}
            } else if(n.kind=='UPDATE') {terminals++;if(n.nextNode!=null || n.assignments.isEmpty() || n.assignments.size()>20) fail('TERMINAL');}
            else if(n.kind!='SET' && n.kind!='DECISION') fail('NODE_KIND');
        }
        if(screens<1 || screens>8 || terminals!=1 || !graph.containsKey(plan.entryNode)) fail('GRAPH_SHAPE');
        for(Node n:plan.nodes) {
            for(String next:edges(n)) if(!graph.containsKey(next)) fail('DANGLING_CONNECTOR');
            Set<String> path=new Set<String>();walk(n.name,graph,path,new Set<String>());
        }
        Set<String> reached=new Set<String>();reach(plan.entryNode,graph,reached);
        if(reached.size()!=graph.size()) fail('UNREACHABLE_NODE');
    }
    private static void reach(String name,Map<String,Node> graph,Set<String> seen) {if(seen.contains(name))return;seen.add(name);for(String next:edges(graph.get(name)))reach(next,graph,seen);}
    private static void walk(String name,Map<String,Node> graph,Set<String> path,Set<String> done) {
        if(path.contains(name))fail('GRAPH_CYCLE');if(done.contains(name))return;path.add(name);Node n=graph.get(name);
        List<String> next=edges(n);if(n.kind!='UPDATE' && next.isEmpty())fail('NONTERMINAL_END');
        if(n.kind=='DECISION' && String.isBlank(n.nextNode))fail('DECISION_DEFAULT');
        for(String target:next)walk(target,graph,path,done);path.remove(name);done.add(name);
    }
    /** Ordered outgoing graph edges used by validation and defensive traversal. */
    public static List<String> edges(Node n) {List<String> result=new List<String>();if(n.nextNode!=null)result.add(n.nextNode);for(Rule r:n.rules)if(r.nextNode!=null)result.add(r.nextNode);return result;}
    private static void fail(String code) {throw new PlanException(code);}
}
