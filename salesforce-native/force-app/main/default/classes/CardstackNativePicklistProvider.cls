/** API67 native independent picklists, scoped to verified actual record type membership. */
public with sharing class CardstackNativePicklistProvider {
 public static final String VERSION='native-picklist/v1';
 /** One native collection per object/type read; no Describe choices or defaults. */
 public interface OptionsSource { ConnectApi.PicklistValuesCollection fetch(String objectApi,String recordTypeId); }
 @TestVisible private static OptionsSource source;
 /** Private native binding; callers expose only checked literal field choices. */
 public with sharing class Context {
  public String objectApiName; public String recordTypeId; public String fingerprint;
  public Map<String,List<CardstackOpportunityEditTypes.Choice>> fields=new Map<String,List<CardstackOpportunityEditTypes.Choice>>();
 }
 /**
  * @param objectType Canonical native object derived from the authorized record.
  * @param recordTypeId Actual full native context (Master only when actual is absent).
  * @param fields Requested canonical independent picklist inputs.
  * @return Fresh bounded API choices and their context binding.
  */
 public static Context resolve(Schema.SObjectType objectType,String recordTypeId,List<String> fields) {
  if(objectType==null || fields==null || fields.isEmpty() || fields.size()>20) throw new PicklistUnavailableException('PICKLIST_CONTEXT_UNAVAILABLE');
  Schema.DescribeSObjectResult shape=objectType.getDescribe();
  if(UserInfo.getUserType().equals('Guest') || !shape.isAccessible() || !shape.isUpdateable()) throw new PicklistUnavailableException('PICKLIST_CONTEXT_UNAVAILABLE');
  Set<String> seen=new Set<String>();
  for(String field:fields) {
   Schema.SObjectField nativeField=shape.fields.getMap().get(field);
   if(nativeField==null || seen.contains(field)) throw new PicklistUnavailableException('PICKLIST_CONTEXT_UNAVAILABLE');
   Schema.DescribeFieldResult input=nativeField.getDescribe();
   if(!input.getName().equals(field) || input.getType()!=Schema.DisplayType.Picklist || input.isDependentPicklist() || input.getController()!=null || !input.isAccessible() || !input.isUpdateable()) throw new PicklistUnavailableException('PICKLIST_CONTEXT_UNAVAILABLE');
   seen.add(field);
  }
  String contextId=requireRecordType(objectType,recordTypeId);
  OptionsSource boundary=Test.isRunningTest() && source!=null?source:new NativeOptionsSource();
  try { return mapNativeValues(boundary.fetch(shape.getName(),contextId),objectType,contextId,fields); }
  catch(PicklistUnavailableException error) { throw error; }
  catch(Exception error) { throw new PicklistUnavailableException('PICKLIST_CONTEXT_UNAVAILABLE',error); }
 }
 /**
  * @param record Authorized USER_MODE projection, including actual RecordTypeId when native.
  * @return Native full checksum18 context; actor defaults are never consulted.
  */
 public static String actualRecordType(SObject record) {
  if(record==null) throw new PicklistUnavailableException('PICKLIST_CONTEXT_UNAVAILABLE');
  Schema.SObjectType objectType=record.getSObjectType(); Schema.DescribeSObjectResult shape=objectType.getDescribe();
  if(shape.fields.getMap().containsKey('RecordTypeId')) {
   try { Object actual=record.get('RecordTypeId'); if(actual!=null) return requireRecordType(objectType,String.valueOf(actual)); }
   catch(SObjectException error) { throw new PicklistUnavailableException('PICKLIST_CONTEXT_UNAVAILABLE',error); }
  }
  for(Schema.RecordTypeInfo info:shape.getRecordTypeInfos()) if(info.isMaster()) return requireRecordType(objectType,String.valueOf(info.getRecordTypeId()));
  throw new PicklistUnavailableException('PICKLIST_CONTEXT_UNAVAILABLE');
 }
 private static String requireRecordType(Schema.SObjectType objectType,String raw) {
  try {
   String normalized=CardstackConnectionTypes.normalizeId(raw); Id nativeId=Id.valueOf(normalized);
   if(!objectType.getDescribe().getRecordTypeInfosById().containsKey(nativeId)) throw new PicklistUnavailableException('PICKLIST_CONTEXT_UNAVAILABLE');
   return normalized;
  } catch(CardstackConnectionTypes.ConnectionException error) { throw new PicklistUnavailableException('PICKLIST_CONTEXT_UNAVAILABLE',error); }
  catch(TypeException error) { throw new PicklistUnavailableException('PICKLIST_CONTEXT_UNAVAILABLE',error); }
 }
 /** Pure native mapping also used by typed response fixtures; runtime resolution checks membership first. */
 @TestVisible private static Context mapNativeValues(ConnectApi.PicklistValuesCollection collection,Schema.SObjectType objectType,String recordTypeId,List<String> fields) {
  if(collection==null || collection.picklistFieldValues==null) throw new PicklistUnavailableException('PICKLIST_CONTEXT_UNAVAILABLE');
  Context result=new Context(); result.objectApiName=objectType.getDescribe().getName(); result.recordTypeId=recordTypeId;
  Map<String,Schema.SObjectField> nativeFields=objectType.getDescribe().fields.getMap();
  List<Object> bindings=new List<Object>{VERSION,result.objectApiName,recordTypeId};
  for(String field:fields) {
   ConnectApi.PicklistValues nativeOptions=collection.picklistFieldValues.get(field);
   if(nativeOptions==null || nativeOptions.values==null || nativeOptions.values.isEmpty() || nativeOptions.values.size()>500 || (nativeOptions.controllerValues!=null && !nativeOptions.controllerValues.isEmpty())) throw new PicklistUnavailableException('PICKLIST_CONTEXT_UNAVAILABLE');
   Integer maxLength=nativeFields.get(field).getDescribe().getLength();
   List<CardstackOpportunityEditTypes.Choice> choices=new List<CardstackOpportunityEditTypes.Choice>(); Set<String> seen=new Set<String>();
   for(ConnectApi.PicklistValue item:nativeOptions.values) {
    if(item==null || item.value==null || item.value.length()==0 || item.value.length()>Math.min(maxLength,256) || item.label==null || item.label.length()>256 || seen.contains(item.value)) throw new PicklistUnavailableException('PICKLIST_CONTEXT_UNAVAILABLE');
    // Native API67 serialization has validFor:[] for independent fields. Inspect
    // only that documented dependency signal; never infer or apply defaultValue.
    Object validFor=((Map<String,Object>)JSON.deserializeUntyped(JSON.serialize(item))).get('validFor');
    requireIndependentValue(validFor);
    seen.add(item.value); CardstackOpportunityEditTypes.Choice choice=new CardstackOpportunityEditTypes.Choice(); choice.value=item.value; choice.label=item.label; choices.add(choice);
   }
   result.fields.put(field,choices); List<String> sortedValues=new List<String>(seen); sortedValues.sort(); bindings.add(new List<Object>{field,sortedValues});
  }
  result.fingerprint=CardstackOpportunityEditTypes.digest(bindings); return result;
 }
 /** Native serialized dependency codec; no caller-selected choices or typed DTO construction. */
 @TestVisible private static void requireIndependentValue(Object validFor) {
  if(validFor!=null && (!(validFor instanceof List<Object>) || !((List<Object>)validFor).isEmpty())) throw new PicklistUnavailableException('PICKLIST_CONTEXT_UNAVAILABLE');
 }
 private with sharing class NativeOptionsSource implements OptionsSource {
  public ConnectApi.PicklistValuesCollection fetch(String objectApi,String recordTypeId) { return ConnectApi.RecordUi.getPicklistValuesByRecordType(objectApi,recordTypeId); }
 }
 /** Bounded closed provider denial, with no native values or identities. */
 public class PicklistUnavailableException extends Exception {}
}
