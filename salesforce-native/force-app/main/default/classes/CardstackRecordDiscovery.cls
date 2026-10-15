/** Read-only configured native record discovery. Candidates never carry write authority. */
public with sharing class CardstackRecordDiscovery {
 public static final Integer MAX_RESULTS=10;
 private static final Integer MAX_OBJECTS=12;
 public class DiscoveryException extends Exception {}
 public with sharing class ContextValue { public String fieldApi; public String label; public String value; }
 public with sharing class Candidate {
  public String recordId; public String objectApiName; public String objectLabel; public String recordName;
  public List<ContextValue> context=new List<ContextValue>();
 }
 public with sharing class Result {
  public String contractVersion='record-discovery/v1'; public String status;
  public Boolean hasMore=false; public Boolean needsSelection=false;
  public Boolean searchIndexMayLag=false; public List<String> searchedObjects=new List<String>();
  public List<String> unavailableObjects=new List<String>();
  public List<Candidate> candidates=new List<Candidate>();
 }
 private with sharing class Scope {
  public Schema.SObjectType objectType; public String objectApi; public String nameField;
  public List<String> contextFields=new List<String>();
  public List<String> projection() { List<String> fields=new List<String>{'Id',nameField}; fields.addAll(contextFields); return fields; }
 }
 /**
  * Search only active published default layouts, narrowed by a canonical optional object.
  * Exact IDs use one USER_MODE read. Names use one USER_MODE SOSL, with bounded per-object
  * results and a literal name filter. Index lag is explicit and a candidate is not a grant.
  */
 public static Result search(String query,String objectApiName,Integer maxResults) {
  CardstackConnectionAccess.requireUser();
  if(String.isBlank(query) || query.length()>160 || (maxResults!=null && (maxResults<1 || maxResults>MAX_RESULTS))) throw new DiscoveryException('INVALID_ARGUMENTS');
  String term=query.trim(); Integer bound=maxResults==null?5:maxResults;
  if(objectApiName!=null && (String.isBlank(objectApiName) || !Pattern.matches('[A-Za-z][A-Za-z0-9_]{0,79}',objectApiName))) throw new DiscoveryException('INVALID_ARGUMENTS');
  Id exactId;
  if(looksLikeId(term)) {
   try { exactId=Id.valueOf(CardstackConnectionTypes.normalizeId(term)); }
   catch(Exception error) { throw new DiscoveryException('INVALID_ARGUMENTS'); }
  }
  // Configuration reads are bounded independently of the CRM search. No draft read.
  List<Cardstack_Config__c> configs=[SELECT Name,Value__c FROM Cardstack_Config__c
   WHERE Is_Active__c=true AND Name LIKE 'layout:%:default' WITH USER_MODE ORDER BY Name LIMIT 101];
  if(configs.size()>100) throw new DiscoveryException('SCOPE_TOO_LARGE');
  Result result=new Result(); List<Scope> scopes=new List<Scope>(); Set<String> seen=new Set<String>();
  String exactObject=exactId==null?null:exactId.getSObjectType().getDescribe().getName();
  for(Cardstack_Config__c config:configs) {
   if(!Pattern.matches('layout:[A-Za-z][A-Za-z0-9_]{0,79}:default',config.Name)) continue;
   String api=config.Name.substring(7,config.Name.length()-8);
   if(objectApiName!=null && !objectApiName.equals(api)) continue;
   if(exactObject!=null && !exactObject.equals(api)) continue;
   if(seen.contains(api)) throw new DiscoveryException('SCOPE_UNAVAILABLE'); seen.add(api);
   Scope selected;
   try { selected=scope(api,config.Value__c,exactId!=null); }
   catch(Exception error) { result.unavailableObjects.add(api); continue; }
   scopes.add(selected); result.searchedObjects.add(api);
  }
  if(scopes.isEmpty()) throw new DiscoveryException('SCOPE_UNAVAILABLE');
  if(scopes.size()>MAX_OBJECTS) throw new DiscoveryException('SCOPE_TOO_LARGE');
  if(exactId!=null) {
   Scope selected=scopes[0];
   List<SObject> rows=Database.queryWithBinds('SELECT '+String.join(selected.projection(),',')+' FROM '+selected.objectApi+' WHERE Id = :recordId LIMIT 1',new Map<String,Object>{'recordId'=>exactId},AccessLevel.USER_MODE);
   for(SObject row:rows) result.candidates.add(candidate(selected,row));
  } else {
   result.searchIndexMayLag=true;
   // Bind values cannot alter RETURNING identifiers or broaden the literal filter.
   String namePattern='%'+term.replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%';
   String searchTerm=term+'*'; Integer nativeBound=bound+1; List<String> returns=new List<String>();
   for(Scope selected:scopes) returns.add(selected.objectApi+'('+String.join(selected.projection(),',')+' WHERE '+selected.nameField+' LIKE :namePattern ORDER BY '+selected.nameField+',Id LIMIT :nativeBound)');
   List<List<SObject>> batches=Search.query('FIND :searchTerm IN NAME FIELDS RETURNING '+String.join(returns,',')+' WITH USER_MODE');
   for(Integer index=0;index<batches.size();index++) {
    Scope selected=scopes[index];
    for(SObject row:batches[index]) {
     // Fixed-search fixtures and future providers cannot inject another identity.
     if(row.getSObjectType()!=selected.objectType) throw new DiscoveryException('SEARCH_UNAVAILABLE');
     if(result.candidates.size()<bound) result.candidates.add(candidate(selected,row)); else result.hasMore=true;
    }
   }
  }
  result.status=result.candidates.isEmpty()?'Empty':'Matches';
  result.needsSelection=result.hasMore || result.candidates.size()>1 || !result.unavailableObjects.isEmpty();
  return result;
 }
 private static Boolean looksLikeId(String term) {
  if(!Pattern.matches('[A-Za-z0-9]{15}([A-Za-z0-9]{3})?',term)) return false;
  String prefix=term.substring(0,3);
  for(Schema.SObjectType objectType:Schema.getGlobalDescribe().values()) if(prefix.equals(objectType.getDescribe().getKeyPrefix())) return true;
  return false;
 }
 private static Scope scope(String api,String raw,Boolean exactId) {
  if(String.isBlank(raw)) throw new DiscoveryException('SCOPE_UNAVAILABLE');
  Schema.SObjectType objectType=CardstackRecordScreenCapability.canonicalType(api);
  Schema.DescribeSObjectResult nativeObject=objectType.getDescribe();
  if(!exactId && !nativeObject.isSearchable()) throw new DiscoveryException('SEARCH_UNSUPPORTED');
  Map<String,Object> layout=(Map<String,Object>)JSON.deserializeUntyped(raw);
  Set<String> denied=new Set<String>();
  if(layout.get('permissions') instanceof Map<String,Object>) {
   Object blocked=((Map<String,Object>)layout.get('permissions')).get('fieldDenylist');
   if(blocked instanceof List<Object>) for(Object field:(List<Object>)blocked) if(field instanceof String) denied.add(((String)field).trim().toLowerCase());
  }
  Scope selected=new Scope(); selected.objectType=objectType; selected.objectApi=api;
  for(Schema.SObjectField field:nativeObject.fields.getMap().values()) {
   Schema.DescribeFieldResult shape=field.getDescribe();
   if(shape.isNameField()) { selected.nameField=shape.getName(); if(!shape.isAccessible() || denied.contains(shape.getName().toLowerCase()) || (!exactId && !shape.isFilterable())) throw new DiscoveryException('SCOPE_UNAVAILABLE'); break; }
  }
  if(selected.nameField==null) throw new DiscoveryException('SEARCH_UNSUPPORTED');
  CardstackPolicyService.Policy policy=CardstackPolicyService.resolveCandidate(api,raw);
  List<String> configured=new List<String>(policy.fields.keySet()); configured.sort();
  for(String field:configured) {
   if(field.equals(selected.nameField) || denied.contains(field.toLowerCase())) continue;
   Schema.DescribeFieldResult shape=nativeObject.fields.getMap().get(field).getDescribe();
   // No long/freeform text, relationship traversal, unconfigured field, or identifier context.
   if(!new Set<Schema.DisplayType>{Schema.DisplayType.String,Schema.DisplayType.Email,Schema.DisplayType.Phone,Schema.DisplayType.Picklist,Schema.DisplayType.Integer,Schema.DisplayType.Date,Schema.DisplayType.Boolean}.contains(shape.getType())) continue;
   if(!shape.isAccessible() || (shape.getType()==Schema.DisplayType.String && shape.getLength()>255)) continue;
   selected.contextFields.add(field); if(selected.contextFields.size()==2) break;
  }
  return selected;
 }
 private static Candidate candidate(Scope selected,SObject row) {
  Candidate result=new Candidate(); result.recordId=CardstackConnectionTypes.normalizeId(String.valueOf(row.Id));
  result.objectApiName=selected.objectApi; result.objectLabel=selected.objectType.getDescribe().getLabel();
  Object name=row.get(selected.nameField); result.recordName=name==null?selected.objectType.getDescribe().getLabel():String.valueOf(name);
  if(result.recordName.length()>255) result.recordName=result.recordName.substring(0,255);
  for(String field:selected.contextFields) {
   ContextValue value=new ContextValue(); value.fieldApi=field; value.label=selected.objectType.getDescribe().fields.getMap().get(field).getDescribe().getLabel();
   Object nativeValue=row.get(field); value.value=nativeValue==null?null:String.valueOf(nativeValue);
   if(value.value!=null && value.value.length()>255) value.value=value.value.substring(0,255);
   result.context.add(value);
  }
  return result;
 }
}
