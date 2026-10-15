/** Strict generic protocol ingress and discovery; no client/UI proof is inferred. */
@IsTest private with sharing class CardstackRecordMcpAdapterTest {
 @TestSetup static void permissions() { CardstackOpportunityEditTestData.grantCurrentActorPackageRead(); CardstackRecordEditTestData.grantCurrentActorContactAccess(); CardstackRecordEditTestData.grantCurrentActorLeadAccess(); }
 @IsTest static void shouldExposeOnlyOpenToModel() {
  CardstackConnectionAccess.userOverride=true; CardstackRecordMcpAdapter.resourceOverrideEnabled=true; CardstackRecordMcpAdapter.resourceOverride=Blob.valueOf('abc');
  Test.startTest(); List<Object> tools=CardstackRecordMcpAdapter.tools(); Test.stopTest(); Assert.areEqual(4,tools.size(),'Closed generic tool family.');
  for(Integer index=0;index<tools.size();index++) {
   Map<String,Object> tool=(Map<String,Object>)tools[index],meta=(Map<String,Object>)tool.get('_meta'); Map<String,Object> ui=(Map<String,Object>)meta.get('ui');
   Assert.areEqual(index==0?new List<String>{'model','app'}:new List<String>{'app'},ui.get('visibility'),'Only Open is model visible; private helpers remain app-only.');
   if(index==0) {
    Assert.areEqual('ui://cardstack/record-edit-v1-sha256-ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad.html',ui.get('resourceUri'),'Open renders the current content-addressed native UI.');
    Assert.areEqual(ui.get('resourceUri'),meta.get('openai/outputTemplate'),'Open retains the matching compatibility render template.');
   } else {
    Assert.isFalse(ui.containsKey('resourceUri'),'Private helpers update the existing UI without advertising widget rendering.');
    Assert.isFalse(meta.containsKey('openai/outputTemplate'),'Private helpers cannot advertise a compatibility render template.');
   }
   Assert.areEqual(true,meta.get('openai/widgetAccessible'),'Open and private helpers remain callable from the app.');
  }
 }
 private static void invalid(Map<String,Object> args) {
  CardstackConnectionAccess.userOverride=true; Test.startTest(); Map<String,Object> result=CardstackRecordMcpAdapter.call('claude','cardstack_record_edit_transition',args); Test.stopTest();
  Assert.areEqual(true,result.get('isError'),'Strict malformed ingress rejected.'); Assert.isNull(result.get('_meta'),'Rejected ingress has no handle.'); Assert.areEqual(0,[SELECT count() FROM Cardstack_Interaction__c WITH SYSTEM_MODE],'Ingress rejects before private state.');
 }
 @IsTest static void shouldRejectConfirmReplacementObject() { invalid(new Map<String,Object>{'interactionKey'=>'x','operation'=>'confirm','expectedRevision'=>1,'reviewRevision'=>1,'reviewGrant'=>'x','objectApiName'=>'Opportunity'}); }
 @IsTest static void shouldRejectConfirmReplacementPatch() { invalid(new Map<String,Object>{'interactionKey'=>'x','operation'=>'confirm','expectedRevision'=>1,'reviewRevision'=>1,'reviewGrant'=>'x','changes'=>new List<Object>()}); }
 @IsTest static void shouldRejectBooleanWireValueInsteadOfLiteral() { invalid(new Map<String,Object>{'interactionKey'=>'x','operation'=>'review','expectedRevision'=>1,'changes'=>new List<Object>{new Map<String,Object>{'fieldApi'=>'HasOptedOutOfEmail','operation'=>'set','value'=>true}}}); }
 @IsTest static void shouldRejectClearValueKey() { invalid(new Map<String,Object>{'interactionKey'=>'x','operation'=>'review','expectedRevision'=>1,'changes'=>new List<Object>{new Map<String,Object>{'fieldApi'=>'Description','operation'=>'clear','value'=>null}}}); }
 @IsTest static void shouldRejectInjectedIdentifier() { invalid(new Map<String,Object>{'interactionKey'=>'x','operation'=>'review','expectedRevision'=>1,'changes'=>new List<Object>{new Map<String,Object>{'fieldApi'=>'Name FROM Contact','operation'=>'set','value'=>'x'}}}); }
 @IsTest static void shouldSeparatePrivateMetadataAndRetainDescriptors() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Contact record=CardstackRecordEditTestData.fixture(); Test.startTest(); Map<String,Object> result=CardstackRecordMcpAdapter.call('claude','cardstack_record_edit_start',new Map<String,Object>{'recordId'=>CardstackConnectionTypes.normalizeId(String.valueOf(record.Id)),'actionName'=>'edit_contact'}); Test.stopTest();
   Map<String,Object> view=(Map<String,Object>)result.get('structuredContent'), meta=(Map<String,Object>)result.get('_meta'); Assert.areEqual('record-edit/v1',view.get('contractVersion'),'Generic version.'); Assert.areEqual('Contact',view.get('objectApiName'),'Contact fixed object.'); Assert.isTrue(meta.containsKey('cardstack/recordEdit'),'Generic envelope.'); Assert.isFalse(meta.containsKey('cardstack/opportunityEdit'),'Families cannot share metadata.'); String key=(String)((Map<String,Object>)meta.get('cardstack/recordEdit')).get('interactionKey'); Assert.isFalse(JSON.serialize(view).contains(key),'Private key not public.');
  }
 }
 @IsTest static void shouldServeOnlyRegisteredGenericResource() {
  CardstackConnectionAccess.userOverride=true; CardstackRecordMcpAdapter.resourceOverrideEnabled=true; CardstackRecordMcpAdapter.resourceOverride=Blob.valueOf('<!doctype html><p>synthetic</p>'); Test.startTest(); Assert.isNotNull(CardstackRecordMcpAdapter.readResource('ui://cardstack/record-edit-v1.html'),'Registered generic resource.'); Assert.isNull(CardstackRecordMcpAdapter.readResource('ui://cardstack/opportunity-edit-v1.html'),'Cross-family URI rejected.'); Test.stopTest();
 }
 private static Map<String,Object> publicResult(Map<String,Object> result,String status) {
  Assert.areNotEqual(true,result.get('isError'),'Valid generic route must succeed.');
  Map<String,Object> view=(Map<String,Object>)result.get('structuredContent');
  if(status!=null) Assert.areEqual(status,view.get('status'),'Generic lifecycle status.');
  if(result.get('_meta')!=null) {
   Map<String,Object> privateMeta=(Map<String,Object>)((Map<String,Object>)result.get('_meta')).get('cardstack/recordEdit');
   Assert.isNotNull(privateMeta,'Only generic authority family is present.');
   Assert.isFalse(JSON.serialize(view).contains((String)privateMeta.get('interactionKey')),'Handle remains private.');
   if(privateMeta.get('reviewGrant')!=null) Assert.isFalse(JSON.serialize(view).contains((String)privateMeta.get('reviewGrant')),'Grant remains private.');
  }
  return view;
 }
 private static Map<String,Object> adapterTransition(Map<String,Object> previous,String operation,List<Object> changes) {
  Map<String,Object> view=(Map<String,Object>)previous.get('structuredContent');
  Map<String,Object> privateMeta=(Map<String,Object>)((Map<String,Object>)previous.get('_meta')).get('cardstack/recordEdit');
  Map<String,Object> args=new Map<String,Object>{'interactionKey'=>privateMeta.get('interactionKey'),'operation'=>operation};
  if(operation!='resume') args.put('expectedRevision',view.get('revision'));
  if(operation=='review') args.put('changes',changes);
  if(operation=='confirm') { args.put('reviewRevision',view.get('reviewRevision')); args.put('reviewGrant',privateMeta.get('reviewGrant')); }
  return CardstackRecordMcpAdapter.call('claude','cardstack_record_edit_transition',args);
 }
 @IsTest static void shouldCompleteGenericAdapterJourneyAndRefreshExactNativeValues() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Contact record=CardstackRecordEditTestData.fixture(); record.HasOptedOutOfEmail=true; update record;
   Map<String,Object> identity=new Map<String,Object>{'recordId'=>CardstackConnectionTypes.normalizeId(String.valueOf(record.Id))};
   List<Object> changes=new List<Object>{new Map<String,Object>{'fieldApi'=>'LastName','operation'=>'set','value'=>'Adapter exact'},new Map<String,Object>{'fieldApi'=>'Description','operation'=>'clear'},new Map<String,Object>{'fieldApi'=>'HasOptedOutOfEmail','operation'=>'set','value'=>'false'}};
   Map<String,Object> card=CardstackRecordMcpAdapter.call('claude','cardstack_record_open',identity);
   Assert.areEqual('record-card/v1',publicResult(card,null).get('contractVersion'),'Open serializes generic card.');
   Map<String,Object> started=CardstackRecordMcpAdapter.call('claude','cardstack_record_edit_start',new Map<String,Object>{'recordId'=>identity.get('recordId'),'actionName'=>'edit_contact'}); publicResult(started,'Editing');
   Map<String,Object> reviewed=adapterTransition(started,'review',changes); publicResult(reviewed,'Review');
   Assert.areEqual('Original',CardstackRecordEditTestData.current(record.Id).LastName,'Review cannot write.');
   Map<String,Object> back=adapterTransition(reviewed,'back',null); publicResult(back,'Editing');
   Map<String,Object> resumed=adapterTransition(back,'resume',null); publicResult(resumed,'Editing');
   Map<String,Object> rereviewed=adapterTransition(resumed,'review',changes); publicResult(rereviewed,'Review');
   // Each MCP call is a separate native request in production. Reset limits at the Confirm request boundary.
   Test.startTest();
   Map<String,Object> completed=adapterTransition(rereviewed,'confirm',null); Map<String,Object> completedView=publicResult(completed,'Completed');
   Map<String,Object> receipt=(Map<String,Object>)completedView.get('receipt'); Assert.areEqual('saved',receipt.get('status'),'Immutable receipt records save.');
   Assert.areEqual(3,((List<Object>)receipt.get('diff')).size(),'All three reviewed changes retained.');
   Map<String,Object> replay=adapterTransition(completed,'resume',null); Assert.areEqual(JSON.serialize(receipt),JSON.serialize(publicResult(replay,'Completed').get('receipt')),'Resume replays same receipt.');
   Map<String,Object> refreshed=publicResult(CardstackRecordMcpAdapter.call('claude','cardstack_record_refresh',identity),null);
   Map<String,Object> values=new Map<String,Object>(); for(CardstackOpportunityEditTypes.FieldView field:(List<CardstackOpportunityEditTypes.FieldView>)refreshed.get('fields')) { values.put(field.fieldApi,field.value); }
   Contact current=CardstackRecordEditTestData.current(record.Id);
   Test.stopTest();
   Assert.areEqual('Adapter exact',current.LastName,'Exact text survives generic protocol.'); Assert.isNull(current.Description,'Optional text is cleared natively.'); Assert.isFalse(current.HasOptedOutOfEmail,'False is a native Boolean.');
   Assert.areEqual(current.LastName,values.get('LastName'),'Refresh reads saved text.'); Assert.isNull(values.get('Description'),'Refresh reads clear.'); Assert.areEqual('false',values.get('HasOptedOutOfEmail'),'Refresh emits canonical false.');
  }
 }

 @IsTest static void shouldStartAndReviewExpandedFieldsThroughAdapter() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Lead record=leadFixture(); AdapterOptions source=new AdapterOptions('Exact_API'); CardstackNativePicklistProvider.source=source;
   Test.startTest();
   Map<String,Object> started=leadStart(record.Id); Map<String,Object> view=publicResult(started,'Editing');
   Map<String,Object> fields=new Map<String,Object>(); for(Object field:(List<Object>)view.get('fields')) { Map<String,Object> descriptor=(Map<String,Object>)field; fields.put((String)descriptor.get('fieldApi'),descriptor); }
   Assert.areEqual('EMAIL',((Map<String,Object>)fields.get('Email')).get('dataType'),'Email descriptor survives adapter validation.');
   Assert.areEqual('PHONE',((Map<String,Object>)fields.get('Phone')).get('dataType'),'Phone descriptor survives adapter validation.');
   Assert.areEqual('URL',((Map<String,Object>)fields.get('Website')).get('dataType'),'URL descriptor survives adapter validation.');
   Map<String,Object> rating=(Map<String,Object>)fields.get('Rating'); Assert.isNull(rating.get('value'),'Starting an existing null record does not apply a default.');
   Assert.areEqual('Exact_API',((Map<String,Object>)((List<Object>)rating.get('choices'))[0]).get('value'),'Native API value survives with its distinct display label.');
   Map<String,Object> reviewed=adapterTransition(started,'review',expandedChanges('Exact_API')); Map<String,Object> reviewedView=publicResult(reviewed,'Review');
   Assert.areEqual(4,((List<Object>)reviewedView.get('diff')).size(),'All expanded types reach exact server review.');
   Map<String,String> exact=new Map<String,String>{'Rating'=>'Exact_API','Email'=>'exact@example.com','Phone'=>'+1 (555) 010-1000','Website'=>'https://example.com/exact'};
   for(Object row:(List<Object>)reviewedView.get('diff')) { Map<String,Object> change=(Map<String,Object>)row; Assert.areEqual(exact.get((String)change.get('fieldApi')),change.get('afterValue'),'Review preserves each exact expanded literal.'); }
   Assert.isNotNull(((Map<String,Object>)((Map<String,Object>)reviewed.get('_meta')).get('cardstack/recordEdit')).get('reviewGrant'),'Review authority remains private.');
   Test.stopTest();
   Lead current=[SELECT Rating,Email,Phone,Website FROM Lead WHERE Id=:record.Id WITH USER_MODE];
   Assert.isNull(current.Rating,'Review cannot save a choice.'); Assert.isNull(current.Email,'Review cannot save typed strings.');
   Assert.areEqual(0,[SELECT count() FROM Cardstack_Audit_Log__c WITH SYSTEM_MODE],'Review creates no write audit.');
  }
 }
 @IsTest static void shouldRecoverExpandedAdapterReceiptWithoutOptions() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Lead record=leadFixture(); String activeRating;
   for(Schema.PicklistEntry entry:Lead.Rating.getDescribe().getPicklistValues()) if(entry.isActive()) { activeRating=entry.getValue(); break; }
   Assert.isNotNull(activeRating,'DML fixture needs a native active API value.'); AdapterOptions source=new AdapterOptions(activeRating); CardstackNativePicklistProvider.source=source;
   Map<String,Object> started=leadStart(record.Id); publicResult(started,'Editing');
   Map<String,Object> reviewed=adapterTransition(started,'review',expandedChanges(activeRating)); publicResult(reviewed,'Review');
   Test.startTest(); Map<String,Object> completed=adapterTransition(reviewed,'confirm',null); Map<String,Object> view=publicResult(completed,'Completed');
   Map<String,Object> receipt=(Map<String,Object>)view.get('receipt'); Assert.areEqual(4,((List<Object>)receipt.get('diff')).size(),'Receipt preserves picklist and all typed strings.');
   for(Object field:(List<Object>)view.get('fields')) Assert.areEqual(0,((List<Object>)((Map<String,Object>)field).get('choices')).size(),'Completed outcome exports no selectable authority.');
   Integer calls=source.calls,rows=Limits.getDmlRows(); source.unavailable=true;
   Map<String,Object> resumed=publicResult(adapterTransition(completed,'resume',null),'Completed');
   Map<String,Object> replayed=publicResult(adapterTransition(reviewed,'confirm',null),'Completed'); Integer rowsAfter=Limits.getDmlRows();
   Assert.areEqual(JSON.serialize(receipt),JSON.serialize(resumed.get('receipt')),'Completed Resume preserves exact historical receipt.');
   Assert.areEqual(JSON.serialize(receipt),JSON.serialize(replayed.get('receipt')),'Consumed Confirm preserves the same receipt.');
   Assert.areEqual(calls,source.calls,'Receipt recovery never invokes unavailable provider.'); Assert.areEqual(rows,rowsAfter,'Resume and Confirm replay add no CRM, audit, receipt or private-state mutation.');
   Lead current=[SELECT Rating,Email,Phone,Website FROM Lead WHERE Id=:record.Id WITH USER_MODE]; Test.stopTest();
   Assert.areEqual(activeRating,current.Rating,'Native exact API value saved.'); Assert.areEqual('exact@example.com',current.Email,'Native email saved.');
   Assert.areEqual('+1 (555) 010-1000',current.Phone,'Native phone literal saved.'); Assert.areEqual('https://example.com/exact',current.Website,'Native URL literal saved.');
   Assert.areEqual(1,[SELECT count() FROM Cardstack_Audit_Log__c WITH SYSTEM_MODE],'Single save has one immutable audit.');
  }
 }
 @IsTest static void shouldRejectMalformedExpandedDescriptors() {
  CardstackOpportunityEditTypes.Envelope envelope=outputFixture('Editing'); CardstackOpportunityEditTypes.FieldView field=envelope.view.fields[0];
  field.choices.add(choice('Other label','Allowed_API')); deniedOutput(envelope);
  field.choices=new List<CardstackOpportunityEditTypes.Choice>{choice('Label','x'.repeat(257))}; deniedOutput(envelope);
  field.choices=new List<CardstackOpportunityEditTypes.Choice>{choice('x'.repeat(257),'Allowed_API')}; deniedOutput(envelope);
  field.choices=new List<CardstackOpportunityEditTypes.Choice>{null}; deniedOutput(envelope);
  field.choices=new List<CardstackOpportunityEditTypes.Choice>(); for(Integer index=0;index<501;index++) field.choices.add(choice('Label',String.valueOf(index))); deniedOutput(envelope);
  field.choices=new List<CardstackOpportunityEditTypes.Choice>{choice('Label','Allowed_API')}; field.length=null; deniedOutput(envelope);
  field.length=255; field.value='x'.repeat(256); deniedOutput(envelope);
  field.value=null; field.dataType='EMAIL'; deniedOutput(envelope);
  field.choices.clear(); field.length=131072; field.value='x'.repeat(4097); deniedOutput(envelope);
  field.value=null; field.length=131073; deniedOutput(envelope); field.length=0; deniedOutput(envelope);
  field.length=80; field.label='x'.repeat(257); deniedOutput(envelope);
  field.label='Email'; field.dataType='REFERENCE'; deniedOutput(envelope);
 }
 @IsTest static void shouldRejectUnofferedReviewLiteralAndBoundHistoricalReceipt() {
  CardstackOpportunityEditTypes.Envelope envelope=outputFixture('Review'); envelope.view.reviewRevision=1; envelope.reviewGrant='a'.repeat(64);
  envelope.view.diff.add(diff('Rating','Before_API','Not_offered_API')); deniedOutput(envelope);
  envelope.view.diff[0].afterValue='allowed_api'; deniedOutput(envelope);
  envelope.view.diff[0].afterValue='Before_API'; CardstackRecordMcpAdapter.checkView(envelope);
  envelope.view.status='Completed'; envelope.view.diff.clear(); envelope.reviewGrant=null; envelope.view.fields[0].choices.clear();
  envelope.view.receipt=new CardstackOpportunityEditTypes.Receipt(); envelope.view.receipt.reference='receipt-'+ 'b'.repeat(32); envelope.view.receipt.actorDisplayName='Fixture'; envelope.view.receipt.completedAt='2026-10-13T12:00:00Z'; envelope.view.receipt.status='saved';
  envelope.view.receipt.diff.add(diff('Rating','Before_API','Historical_API')); CardstackRecordMcpAdapter.checkView(envelope);
  envelope.view.receipt.diff[0].afterValue='x'.repeat(256); deniedOutput(envelope);
  envelope.view.receipt.diff[0].afterValue='Historical_API'; envelope.view.fields[0].choices.add(choice('Label','Allowed_API')); deniedOutput(envelope);
 }
 private static void deniedOutput(CardstackOpportunityEditTypes.Envelope envelope) {
  try { CardstackRecordMcpAdapter.checkView(envelope); Assert.fail('Malformed native output must fail closed.'); }
  catch(CardstackRecordMcpAdapter.AdapterException error) { Assert.areEqual('OUTCOME_UNAVAILABLE',error.getMessage(),'Only bounded public error is exported.'); }
 }
 private static CardstackOpportunityEditTypes.Envelope outputFixture(String status) {
  Lead record=new Lead(LastName='Output fixture',Company='Output fixture'); insert as system record;
  CardstackOpportunityEditTypes.Envelope envelope=new CardstackOpportunityEditTypes.Envelope(); envelope.view=new CardstackOpportunityEditTypes.View();
  envelope.view.contractVersion='record-edit/v1'; envelope.view.objectApiName='Lead'; envelope.view.recordId=CardstackConnectionTypes.normalizeId(String.valueOf(record.Id)); envelope.view.recordName='Fixture'; envelope.view.revision=1; envelope.view.status=status; envelope.view.expiresAt='2026-10-13T12:00:00Z';
  CardstackOpportunityEditTypes.FieldView field=new CardstackOpportunityEditTypes.FieldView(); field.fieldApi='Rating'; field.label='Rating'; field.dataType='PICKLIST'; field.length=255; field.required=false; field.canClear=true; field.choices.add(choice('Distinct label','Allowed_API')); envelope.view.fields.add(field); return envelope;
 }
 private static CardstackOpportunityEditTypes.Choice choice(String label,String value) {
  CardstackOpportunityEditTypes.Choice item=new CardstackOpportunityEditTypes.Choice(); item.label=label; item.value=value; return item;
 }
 private static CardstackOpportunityEditTypes.DiffRow diff(String field,String beforeValue,String afterValue) {
  CardstackOpportunityEditTypes.DiffRow row=new CardstackOpportunityEditTypes.DiffRow(); row.fieldApi=field; row.label=field; row.beforeValue=beforeValue; row.afterValue=afterValue; return row;
 }
 private static Map<String,Object> leadStart(Id recordId) {
  return CardstackRecordMcpAdapter.call('claude','cardstack_record_edit_start',new Map<String,Object>{'recordId'=>CardstackConnectionTypes.normalizeId(String.valueOf(recordId)),'actionName'=>'lead_details'});
 }
 private static List<Object> expandedChanges(String rating) {
  return new List<Object>{new Map<String,Object>{'fieldApi'=>'Rating','operation'=>'set','value'=>rating},new Map<String,Object>{'fieldApi'=>'Email','operation'=>'set','value'=>'exact@example.com'},new Map<String,Object>{'fieldApi'=>'Phone','operation'=>'set','value'=>'+1 (555) 010-1000'},new Map<String,Object>{'fieldApi'=>'Website','operation'=>'set','value'=>'https://example.com/exact'}};
 }
 private static Lead leadFixture() {
  CardstackConnectionAccess.userOverride=true; List<Object> fields=new List<Object>(),mappings=new List<Object>();
  for(String name:new List<String>{'LastName','Company','Rating','Email','Phone','Website'}) { fields.add(new Map<String,Object>{'api'=>name,'editable'=>true}); mappings.add(new Map<String,Object>{'fieldApi'=>name,'source'=>'current'}); }
  insert as system new Cardstack_Config__c(Name='layout:Lead:default',Is_Active__c=true,Value__c=JSON.serialize(new Map<String,Object>{'permissions'=>new Map<String,Object>{'writeEnabled'=>true},'fields'=>fields,'actions'=>new List<Object>{new Map<String,Object>{'name'=>'lead_details','label'=>'Lead details','enabled'=>true,'type'=>'record-edit','mappings'=>mappings}}}));
  insert as system new Cardstack_Connection_Setup__c(Client__c='claude',Revision__c=1,Configuration_Digest__c='fixture-setup',Configuration__c='{"client":"claude","enabledIntent":true,"publicClientId":"fixture-public-client","callbacks":["https://claude.ai/api/mcp/auth_callback"],"sitePrefix":"/cardstack","packageVersion":"0.1.0.8","transportVersion":"cardstack/v1","uiVersion":"mcp-apps/v1","permissionPolicyRevision":"1"}');
  Lead record=new Lead(LastName='Fixture',Company='Fixture'); insert as system record; return record;
 }
 private with sharing class AdapterOptions implements CardstackNativePicklistProvider.OptionsSource {
  private String apiValue; private Boolean unavailable=false; private Integer calls=0;
  private AdapterOptions(String value) { apiValue=value; }
  public ConnectApi.PicklistValuesCollection fetch(String objectApi,String recordTypeId) {
   calls++; if(unavailable) throw new CardstackNativePicklistProvider.PicklistUnavailableException('PICKLIST_CONTEXT_UNAVAILABLE');
   ConnectApi.PicklistValue item=new ConnectApi.PicklistValue(); item.label='Distinct native label'; item.value=apiValue;
   ConnectApi.PicklistValues options=new ConnectApi.PicklistValues(); options.values=new List<ConnectApi.PicklistValue>{item};
   ConnectApi.PicklistValuesCollection raw=new ConnectApi.PicklistValuesCollection(); raw.picklistFieldValues=new Map<String,ConnectApi.PicklistValues>{'Rating'=>options}; return raw;
  }
 }

}
