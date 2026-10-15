/** Strict app-only Flow tools. Private authority is returned exclusively through cardstack/flowEdit metadata. */
public with sharing class CardstackFlowMcpAdapter {
    public class AdapterException extends Exception {}
    private static final String START='cardstack_record_flow_start',TRANSITION='cardstack_record_flow_transition';
    private static final List<String> OPS=new List<String>{'next','answer','back','cancel','resume','confirm'};
    /** Closed app-only tools; acquiring or publishing metadata is never a runtime tool. */
    public static List<Object> toolDefinitions() {
        Map<String,Object> answers=schema(new Map<String,Object>{'inputId'=>scalar('string'),'operation'=>new Map<String,Object>{'type'=>'string','enum'=>new List<String>{'set','clear'}},'value'=>new Map<String,Object>{'type'=>new List<String>{'string','boolean'}}},new List<String>{'inputId','operation'});
        List<Object> answerBranches=new List<Object>{schema(new Map<String,Object>{'inputId'=>scalar('string'),'operation'=>new Map<String,Object>{'const'=>'set'},'value'=>new Map<String,Object>{'type'=>new List<String>{'string','boolean'}}},new List<String>{'inputId','operation','value'}),schema(new Map<String,Object>{'inputId'=>scalar('string'),'operation'=>new Map<String,Object>{'const'=>'clear'}},new List<String>{'inputId','operation'})};answers.put('oneOf',answerBranches);
        List<Object> branches=new List<Object>();Map<String,Object> all=new Map<String,Object>{'interactionKey'=>scalar('string'),'operation'=>new Map<String,Object>{'type'=>'string','enum'=>OPS},'expectedRevision'=>scalar('integer'),'answers'=>new Map<String,Object>{'type'=>'array','maxItems'=>20,'items'=>answers},'reviewRevision'=>scalar('integer'),'reviewGrant'=>scalar('string')};
        for(String operation:OPS){Map<String,Object> properties=new Map<String,Object>{'interactionKey'=>scalar('string'),'operation'=>new Map<String,Object>{'const'=>operation},'expectedRevision'=>scalar('integer')};List<String> required=new List<String>{'interactionKey','operation','expectedRevision'};if(operation=='next'||operation=='answer')properties.put('answers',all.get('answers'));if(operation=='confirm'){properties.put('reviewRevision',scalar('integer'));properties.put('reviewGrant',scalar('string'));required.add('reviewRevision');required.add('reviewGrant');}branches.add(schema(properties,required));}
        Map<String,Object> transitionSchema=schema(all,new List<String>{'interactionKey','operation','expectedRevision'});transitionSchema.put('oneOf',branches);
        return new List<Object>{tool(START,schema(new Map<String,Object>{'recordId'=>scalar('string'),'actionName'=>scalar('string')},new List<String>{'recordId','actionName'})),tool(TRANSITION,transitionSchema)};
    }
    public static List<Object> tools(){return toolDefinitions();}
    /** Dispatcher convenience without permissive fallback tool names. */
    public static Map<String,Object> call(String client,String name,Map<String,Object> args){if(name==START)return start(client,args);if(name==TRANSITION)return transition(client,args);return rejected('INVALID_REQUEST');}
    /** Strict checked start; record identity and action alone are supplied by the app. */
    public static Map<String,Object> start(String client,Map<String,Object> args) {
        try {ingress(client,args);keys(args,new Set<String>{'recordId','actionName'},new Set<String>{'recordId','actionName'});String action=stringValue(args.get('actionName'));if(!Pattern.matches('[A-Za-z0-9_-]{1,80}',action))throw invalid();Id record=Id.valueOf(CardstackConnectionTypes.normalizeId(stringValue(args.get('recordId'))));return output(CardstackFlowService.start(client,record,action));}
        catch(Exception e){return rejected('INVALID_REQUEST');}
    }
    /** Unknown keys, value types and operation-specific arguments fail before private state reads. */
    public static Map<String,Object> transition(String client,Map<String,Object> args) {
        Boolean confirm=false;
        try {
            ingress(client,args);String operation=stringValue(args.get('operation'));if(!OPS.contains(operation))throw invalid();confirm=operation=='confirm';Set<String> allowed=new Set<String>{'interactionKey','operation','expectedRevision'},required=new Set<String>(allowed);
            if(operation=='next'||operation=='answer')allowed.add('answers');if(confirm){allowed.add('reviewRevision');allowed.add('reviewGrant');required.add('reviewRevision');required.add('reviewGrant');}keys(args,allowed,required);
            CardstackFlowService.TransitionRequest request=new CardstackFlowService.TransitionRequest();request.operation=operation;request.interactionKey=stringValue(args.get('interactionKey'));request.expectedRevision=revision(args.get('expectedRevision'));
            if(args.containsKey('answers')){if(!(args.get('answers') instanceof List<Object>) || ((List<Object>)args.get('answers')).size()>20)throw invalid();request.answers=CardstackFlowTypes.decodeAnswers(JSON.serialize(args.get('answers')));}
            if(confirm){request.reviewRevision=revision(args.get('reviewRevision'));request.reviewGrant=stringValue(args.get('reviewGrant'));}
            return output(CardstackFlowService.transition(client,request));
        }catch(Exception e){return rejected(confirm?'OUTCOME_UNAVAILABLE':'INVALID_REQUEST');}
    }
    /** Advertises only exact published plans that pass connected-user native/policy intersection. */
    public static List<Map<String,Object>> availableActions(Id recordId) {
        CardstackConnectionAccess.requireUser();String objectApi=CardstackRecordScreenCapability.recordType(recordId).getDescribe().getName();return availableActions(recordId,CardstackRecordActionService.available(objectApi));
    }
    /** Same card assembly may reuse its freshly validated action list. This projection grants no execution authority. */
    public static List<Map<String,Object>> availableActions(Id recordId,List<CardstackRecordActionService.Definition> validatedActions) {
        CardstackConnectionAccess.requireUser();CardstackRecordScreenCapability.recordType(recordId);List<Map<String,Object>> result=new List<Map<String,Object>>();if(validatedActions==null)return result;
        for(CardstackRecordActionService.Definition action:validatedActions)if(action!=null && 'screen-flow'.equals(action.type))result.add(new Map<String,Object>{'name'=>action.name,'label'=>action.label,'type'=>'screen-flow','flowApiName'=>action.flowApiName});return result;
    }
    /** Flow-only cards reuse the same native capability read, without requiring a fictitious record-edit action. */
    public static Map<String,Object> cardSnapshot(Id recordId) {
        CardstackConnectionAccess.requireUser();String objectApi=CardstackRecordScreenCapability.recordType(recordId).getDescribe().getName();
        for(CardstackRecordActionService.Definition action:CardstackRecordActionService.available(objectApi))if(action.type=='screen-flow') {
            CardstackFlowPlan.Plan plan=CardstackFlowPlan.decode(CardstackFlowPublication.load(action.flowApiName).planJson);CardstackRecordScreenCapability.Definition capability=CardstackRecordScreenCapability.flowDefinition(objectApi,action,CardstackPolicyService.resolve(objectApi),plan);CardstackOpportunityEditTypes.RecordContext current=CardstackRecordScreenCapability.readContext(recordId,capability,false);
            List<CardstackOpportunityEditTypes.FieldView> fields=CardstackRecordScreenCapability.describeFields(capability,current);
            return new Map<String,Object>{'contractVersion'=>'record-card/v1','objectApiName'=>objectApi,'layout'=>capability.layout,'recordId'=>CardstackConnectionTypes.normalizeId(String.valueOf(recordId)),'recordName'=>CardstackRecordScreenCapability.recordName(capability,current.record),'fields'=>fields,'actions'=>availableActions(recordId)};
        }
        throw new AdapterException('RECORD_UNAVAILABLE');
    }
    private static Map<String,Object> output(CardstackOpportunityEditTypes.Envelope envelope) {
        CardstackOpportunityEditTypes.View view=envelope==null?null:envelope.view;if(view==null || view.contractVersion!='screen-flow/v1' || view.fields==null || view.errors==null || view.diff==null)throw new AdapterException('OUTCOME_UNAVAILABLE');
        if(view.recordId!=null && (view.recordId.length()!=18 || CardstackConnectionTypes.normalizeId(view.recordId)!=view.recordId))throw new AdapterException('OUTCOME_UNAVAILABLE');
        if(view.status=='Editing' && (view.screen==null || view.screen.inputs==null || view.screen.inputs.size()>20))throw new AdapterException('OUTCOME_UNAVAILABLE');
        if(view.status=='Review' && (String.isBlank(envelope.reviewGrant) || view.reviewRevision==null || view.diff.isEmpty()))throw new AdapterException('OUTCOME_UNAVAILABLE');
        Map<String,Object> publicView=new Map<String,Object>{'contractVersion'=>view.contractVersion,'objectApiName'=>view.objectApiName,'status'=>view.status,'recordId'=>view.recordId,'recordName'=>view.recordName,'revision'=>view.revision,'reviewRevision'=>view.reviewRevision,'expiresAt'=>view.expiresAt,'fields'=>view.fields,'diff'=>view.diff,'errors'=>view.errors,'receipt'=>view.receipt,'screen'=>view.screen};
        Map<String,Object> result=new Map<String,Object>{'structuredContent'=>publicView,'content'=>new List<Object>{new Map<String,Object>{'type'=>'text','text'=>view.status=='Completed'?'The reviewed Flow outcome is complete. Refresh to read current values.':'Continue the configured Flow in the app.'}}};
        if(envelope.interactionKey!=null)result.put('_meta',new Map<String,Object>{'cardstack/flowEdit'=>new Map<String,Object>{'interactionKey'=>envelope.interactionKey,'reviewGrant'=>envelope.reviewGrant}});
        if(view.status=='Rejected'||view.status=='Conflict')result.put('isError',true);return result;
    }
    private static void ingress(String client,Map<String,Object> args){CardstackConnectionAccess.requireUser();CardstackConnectionTypes.requireClient(client);if(args==null || Blob.valueOf(JSON.serialize(args)).size()>16384)throw invalid();}
    private static void keys(Map<String,Object> args,Set<String> allowed,Set<String> required){if(!allowed.containsAll(args.keySet()) || !args.keySet().containsAll(required))throw invalid();}
    private static String stringValue(Object value){if(!(value instanceof String))throw invalid();return (String)value;}
    private static Integer revision(Object value){if(!(value instanceof Integer) && !(value instanceof Long) && !(value instanceof Decimal))throw invalid();Decimal parsed=Decimal.valueOf(String.valueOf(value));if(parsed<1 || parsed>2147483647 || parsed!=parsed.setScale(0))throw invalid();return parsed.intValue();}
    private static Map<String,Object> schema(Map<String,Object> properties,List<String> required){return new Map<String,Object>{'type'=>'object','additionalProperties'=>false,'properties'=>properties,'required'=>required};}
    private static Map<String,Object> scalar(String type){return new Map<String,Object>{'type'=>type};}
    private static Map<String,Object> tool(String name,Map<String,Object> input){return new Map<String,Object>{'name'=>name,'description'=>'Navigate the server-owned published Screen Flow from the app.','inputSchema'=>input,'_meta'=>new Map<String,Object>{'ui'=>new Map<String,Object>{'visibility'=>new List<String>{'app'}},'openai/widgetAccessible'=>true},'annotations'=>new Map<String,Object>{'readOnlyHint'=>false,'destructiveHint'=>false,'openWorldHint'=>false}};}
    private static Map<String,Object> rejected(String code){return new Map<String,Object>{'isError'=>true,'content'=>new List<Object>{new Map<String,Object>{'type'=>'text','text'=>'The Flow outcome is unavailable. Resume before retrying a save.'}},'structuredContent'=>new Map<String,Object>{'contractVersion'=>'screen-flow/v1','status'=>'Rejected','errors'=>new List<Object>{new Map<String,Object>{'code'=>code,'message'=>'The Flow request could not be completed.'}}}};}
    private static AdapterException invalid(){return new AdapterException('INVALID_REQUEST');}
}
