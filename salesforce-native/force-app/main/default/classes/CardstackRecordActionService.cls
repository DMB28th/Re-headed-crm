/** Published actions only; configuration narrows connected-user CRM access. */
public with sharing class CardstackRecordActionService {
 public class Mapping {public String fieldApi;public String source;public String sourceField;public String value;}
 public class Definition {public String name;public String label;public String type;public String flowApiName;public Boolean enabled;public List<Mapping> mappings;}
 public static Definition resolve(String objectName,String actionName){
  if(String.isBlank(actionName)||!Pattern.matches('[a-zA-Z0-9_-]{1,80}',actionName))throw new ActionException('Invalid published action identifier.');
  Definition match;Integer count=0;
  for(Definition d:definitions(objectName))if(d!=null && d.name==actionName){match=d;count++;}
  if(count!=1 || match.enabled!=true)throw new ActionException('Action is not published or enabled. Refresh the record card.');
  if(String.isBlank(match.label))match.label=match.name;
  if(match.type=='record-edit'){
   if(objectName!='Account')throw new ActionException('Guided record edits currently support Account.');
   CardstackPolicyService.Policy p=CardstackPolicyService.resolve(objectName);
   if(!p.editEnabled)throw new ActionException('Chat edits are disabled in the published layout.');
   if(match.mappings==null || match.mappings.isEmpty() || match.mappings.size()>20)throw new ActionException('Configure one to twenty editable inputs.');
   Set<String> targets=new Set<String>();
   for(Mapping m:match.mappings){
    CardstackPolicyService.FieldPolicy f=m==null?null:p.fields.get(m.fieldApi);
    if(f==null || f.readOnly || !new Set<String>{'STRING','TEXTAREA','INTEGER'}.contains(f.dataType) || targets.contains(m.fieldApi))throw new ActionException('Action input is duplicated, unsupported, or not editable.');
    targets.add(m.fieldApi);
    if(!new Set<String>{'current','field','constant','answer'}.contains(m.source))throw new ActionException('Unknown input mapping source.');
    if(m.source=='field' && !p.fields.containsKey(m.sourceField))throw new ActionException('Mapped source must be exposed and readable in the published layout.');
    if(m.source=='constant' && m.value==null)throw new ActionException('Enter a constant value; use empty text explicitly when intended.');
   }
  }else if(match.type=='flow'){
   if(String.isBlank(match.flowApiName)||!Pattern.matches('[a-zA-Z][a-zA-Z0-9_]{0,79}',match.flowApiName))throw new ActionException('Choose a published Salesforce launch card.');
   Boolean published=false;String raw=CardstackConfigService.getConfig('flows');
   if(!String.isBlank(raw))for(Object entry:(List<Object>)JSON.deserializeUntyped(raw)){
    Map<String,Object> f=(Map<String,Object>)entry;Object api=f.get('apiName')==null?f.get('flowApiName'):f.get('apiName');if(api==match.flowApiName)published=true;
   }
   if(!published)throw new ActionException('The selected flow launch card is not published.');
   String api=match.flowApiName;
   List<FlowDefinitionView> flows=[SELECT ApiName,ProcessType,TriggerType FROM FlowDefinitionView WHERE ApiName=:api AND IsActive=true WITH USER_MODE LIMIT 1];
   if(flows.isEmpty()||!new Set<String>{'Flow','AutoLaunchedFlow'}.contains(flows[0].ProcessType)||(flows[0].TriggerType!=null&&flows[0].TriggerType!='None'))throw new ActionException('The selected Salesforce flow is not launchable.');
  }else throw new ActionException('This action type is not executable in this beta.');
  return match;
 }
 public static List<Definition> available(String objectName){
  List<Definition> result=new List<Definition>();List<Definition> configured;
  try{configured=definitions(objectName);}catch(Exception e){return result;}
  for(Integer i=0;i<Math.min(20,configured.size());i++){Definition d=configured[i];{try{if(d!=null)result.add(resolve(objectName,d.name));}catch(Exception e){/* Unavailable actions must not become executable buttons. */}}}
  return result;
 }
 private static List<Definition> definitions(String objectName){
  String raw=CardstackConfigService.getConfig('layout:'+objectName+':default');if(String.isBlank(raw))return new List<Definition>();
  Map<String,Object> cfg=(Map<String,Object>)JSON.deserializeUntyped(raw);Object actions=cfg.get('actions');
  if(actions==null)return new List<Definition>();return (List<Definition>)JSON.deserialize(JSON.serialize(actions),List<Definition>.class);
 }
 public class ActionException extends Exception{}
}
