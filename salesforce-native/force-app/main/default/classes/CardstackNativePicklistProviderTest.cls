/** Native response fixtures are source tests, not proof of non-Master org behavior. */
@IsTest(SeeAllData=false) private with sharing class CardstackNativePicklistProviderTest {
 @TestSetup static void permissions() { CardstackRecordEditTestData.grantCurrentActorLeadAccess(); }
 @IsTest static void shouldKeepDisjointFieldsAndTypeContexts() {
  ConnectApi.PicklistValuesCollection raw=collection();
  Test.startTest();
  CardstackNativePicklistProvider.Context first=CardstackNativePicklistProvider.mapNativeValues(raw,Lead.SObjectType,'012000000000001AAA',new List<String>{'Rating','LeadSource'});
  raw.picklistFieldValues.get('Rating').values=new List<ConnectApi.PicklistValue>{item('Second type','Cold_API')};
  CardstackNativePicklistProvider.Context second=CardstackNativePicklistProvider.mapNativeValues(raw,Lead.SObjectType,'012000000000002AAA',new List<String>{'Rating','LeadSource'});
  Test.stopTest();
  Assert.areEqual('Hot_API',first.fields.get('Rating')[0].value,'Rating API values are independent of LeadSource.');
  Assert.areEqual('Web_API',first.fields.get('LeadSource')[0].value,'Field option sets cannot bleed together.');
  Assert.areEqual('Hot affiché <x>',first.fields.get('Rating')[0].label,'Display labels are exact literal text.');
  Assert.areNotEqual(first.fingerprint,second.fingerprint,'Type and option drift changes authority.');
 }
 @IsTest static void shouldRejectMissingRequestedField() { ConnectApi.PicklistValuesCollection raw=collection(); raw.picklistFieldValues.remove('Rating'); rejectMap(raw); }
 @IsTest static void shouldRejectNullCollection() { rejectMap(null); }
 @IsTest static void shouldRejectNullValues() { ConnectApi.PicklistValuesCollection raw=collection(); raw.picklistFieldValues.get('Rating').values=null; rejectMap(raw); }
 @IsTest static void shouldRejectDuplicateApiValues() { ConnectApi.PicklistValuesCollection raw=collection(); raw.picklistFieldValues.get('Rating').values.add(item('Other label','Hot_API')); rejectMap(raw); }
 @IsTest static void shouldRejectControllerMapping() { ConnectApi.PicklistValuesCollection raw=collection(); raw.picklistFieldValues.get('Rating').controllerValues=new Map<String,Integer>{'Controller'=>0}; rejectMap(raw); }
 @IsTest static void shouldRejectDependentValue() {
  // ConnectApi output DTOs cannot be JSON-deserialized. Exercise the actual
  // serialized dependency codec without assuming a native validFor element type.
  rejectDependencySignal(((Map<String,Object>)JSON.deserializeUntyped('{"validFor":[0]}')).get('validFor'));
 }
 @IsTest static void shouldRejectNullChoice() { ConnectApi.PicklistValuesCollection raw=collection(); raw.picklistFieldValues.get('Rating').values.add(null); rejectMap(raw); }
 @IsTest static void shouldRejectMoreThan500Choices() {
  ConnectApi.PicklistValuesCollection raw=collection(); raw.picklistFieldValues.get('Rating').values.clear();
  for(Integer i=0;i<501;i++) raw.picklistFieldValues.get('Rating').values.add(item('Label','API_'+i)); rejectMap(raw);
 }
 @IsTest static void shouldRejectMalformedLabel() { ConnectApi.PicklistValuesCollection raw=collection(); raw.picklistFieldValues.get('Rating').values[0].label=null; rejectMap(raw); }
 @IsTest static void shouldRejectEmptyApiValue() { ConnectApi.PicklistValuesCollection raw=collection(); raw.picklistFieldValues.get('Rating').values[0].value=''; rejectMap(raw); }
 @IsTest static void shouldRefetchAndBindActualMasterContext() {
  CardstackNativePicklistProvider.source=new FixtureSource(); String master=masterId();
  Test.startTest();
  CardstackNativePicklistProvider.Context first=CardstackNativePicklistProvider.resolve(Lead.SObjectType,master,new List<String>{'Rating'});
  CardstackNativePicklistProvider.source=new ChangedSource();
  CardstackNativePicklistProvider.Context second=CardstackNativePicklistProvider.resolve(Lead.SObjectType,master,new List<String>{'Rating'});
  Test.stopTest();
  Assert.areEqual(master,first.recordTypeId,'Authorized supplied context survives; actor default is never selected.');
  Assert.areNotEqual(first.fingerprint,second.fingerprint,'Every call must obtain fresh choices.');
 }
 @IsTest static void shouldRejectRecordTypeOutsideObjectMembership() {
  Test.startTest();
  try { CardstackNativePicklistProvider.resolve(Lead.SObjectType,'012000000000001AAA',new List<String>{'Rating'}); Assert.fail('Unregistered type must fail before the fixture boundary.'); }
  catch(CardstackNativePicklistProvider.PicklistUnavailableException error) { Assert.areEqual('PICKLIST_CONTEXT_UNAVAILABLE',error.getMessage(),'Full native membership is mandatory.'); }
  Test.stopTest();
 }
 @IsTest static void shouldUseMasterOnlyForAbsentActualType() {
  Lead record=new Lead(LastName='Fixture',Company='Fixture');
  Test.startTest(); String actual=CardstackNativePicklistProvider.actualRecordType(record); Test.stopTest();
  Assert.areEqual(masterId(),actual,'Absent actual type uses native Master, never actor default.');
 }
 @IsTest static void shouldRejectProviderFailure() {
  CardstackNativePicklistProvider.source=new MissingSource();
  Test.startTest();
  try { CardstackNativePicklistProvider.resolve(Lead.SObjectType,masterId(),new List<String>{'Rating'}); Assert.fail('Missing native collection must deny.'); }
  catch(CardstackNativePicklistProvider.PicklistUnavailableException error) { Assert.areEqual('PICKLIST_CONTEXT_UNAVAILABLE',error.getMessage(),'Provider absence is bounded.'); }
  Test.stopTest();
 }
 @IsTest static void shouldRejectMalformedDependencySignal() { rejectDependencySignal('malformed'); }
 private static void rejectDependencySignal(Object signal) {
  Test.startTest();
  try { CardstackNativePicklistProvider.requireIndependentValue(signal); Assert.fail('Nonempty or malformed serialized dependency signal must reject.'); }
  catch(CardstackNativePicklistProvider.PicklistUnavailableException error) { Assert.areEqual('PICKLIST_CONTEXT_UNAVAILABLE',error.getMessage(),'Dependency codec retains its bounded closed failure.'); }
  Test.stopTest();
 }
 private static String masterId() {
  for(Schema.RecordTypeInfo info:Lead.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED).getRecordTypeInfos()) if(info.isMaster()) return CardstackConnectionTypes.normalizeId(String.valueOf(info.getRecordTypeId()));
  Assert.fail('Native Master required by fixture.'); return null;
 }
 private static void rejectMap(ConnectApi.PicklistValuesCollection raw) {
  Test.startTest();
  try { CardstackNativePicklistProvider.mapNativeValues(raw,Lead.SObjectType,masterId(),new List<String>{'Rating','LeadSource'}); Assert.fail('Malformed response cannot grant options.'); }
  catch(CardstackNativePicklistProvider.PicklistUnavailableException error) { Assert.areEqual('PICKLIST_CONTEXT_UNAVAILABLE',error.getMessage(),'Bounded closed failure.'); }
  Test.stopTest();
 }
 private static ConnectApi.PicklistValue item(String label,String value) { ConnectApi.PicklistValue result=new ConnectApi.PicklistValue(); result.label=label; result.value=value; return result; }
 private static ConnectApi.PicklistValuesCollection collection() {
  ConnectApi.PicklistValues rating=new ConnectApi.PicklistValues(); rating.values=new List<ConnectApi.PicklistValue>{item('Hot affiché <x>','Hot_API')};
  ConnectApi.PicklistValues leadSource=new ConnectApi.PicklistValues(); leadSource.values=new List<ConnectApi.PicklistValue>{item('Web','Web_API')};
  ConnectApi.PicklistValuesCollection raw=new ConnectApi.PicklistValuesCollection(); raw.picklistFieldValues=new Map<String,ConnectApi.PicklistValues>{'Rating'=>rating,'LeadSource'=>leadSource}; return raw;
 }
 private with sharing class FixtureSource implements CardstackNativePicklistProvider.OptionsSource {
  public ConnectApi.PicklistValuesCollection fetch(String objectApi,String recordTypeId) { return collection(); }
 }
 private with sharing class ChangedSource implements CardstackNativePicklistProvider.OptionsSource {
  public ConnectApi.PicklistValuesCollection fetch(String objectApi,String recordTypeId) { ConnectApi.PicklistValuesCollection raw=collection(); raw.picklistFieldValues.get('Rating').values=new List<ConnectApi.PicklistValue>{item('Cold','Cold_API')}; return raw; }
 }
 private with sharing class MissingSource implements CardstackNativePicklistProvider.OptionsSource {
  public ConnectApi.PicklistValuesCollection fetch(String objectApi,String recordTypeId) { return null; }
 }
}
