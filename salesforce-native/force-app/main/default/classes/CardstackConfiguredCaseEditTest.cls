/** Case exercises auto-number identity and published configuration through the existing shared adapter. */
@IsTest private with sharing class CardstackConfiguredCaseEditTest {
 @TestSetup static void permissions() { CardstackConfiguredCaseTestData.grantActor(); }
 private static Map<String,Object> view(Map<String,Object> result,String expectedStatus) {
  Assert.areNotEqual(true,result.get('isError'),'Configured Case uses the existing generic protocol.');
  Map<String,Object> body=(Map<String,Object>)result.get('structuredContent');
  Assert.areEqual('Case',body.get('objectApiName'),'Record identity chooses native Case.');
  if(expectedStatus!=null) Assert.areEqual(expectedStatus,body.get('status'),'Expected shared lifecycle state.');
  return body;
 }
 private static Map<String,Object> open(Case record) {
  return CardstackRecordMcpAdapter.call('claude','cardstack_record_edit_start',new Map<String,Object>{'recordId'=>CardstackConnectionTypes.normalizeId(String.valueOf(record.Id)),'actionName'=>CardstackConfiguredCaseTestData.ACTION});
 }
 private static Map<String,Object> transition(Map<String,Object> previous,String operation,List<Object> changes) {
  Map<String,Object> body=(Map<String,Object>)previous.get('structuredContent');
  Map<String,Object> authority=(Map<String,Object>)((Map<String,Object>)previous.get('_meta')).get('cardstack/recordEdit');
  Map<String,Object> args=new Map<String,Object>{'interactionKey'=>authority.get('interactionKey'),'operation'=>operation};
  if(operation!='resume') args.put('expectedRevision',body.get('revision'));
  if(operation=='review') args.put('changes',changes);
  if(operation=='confirm') { args.put('reviewRevision',body.get('reviewRevision')); args.put('reviewGrant',authority.get('reviewGrant')); }
  return CardstackRecordMcpAdapter.call('claude','cardstack_record_edit_transition',args);
 }
 private static List<Object> changes() {
  return new List<Object>{
   new Map<String,Object>{'fieldApi'=>'Subject','operation'=>'set','value'=>'Reviewed request'},
   new Map<String,Object>{'fieldApi'=>'Description','operation'=>'clear'},
   new Map<String,Object>{'fieldApi'=>'SuppliedEmail','operation'=>'set','value'=>'after@example.com'},
   new Map<String,Object>{'fieldApi'=>'SuppliedPhone','operation'=>'set','value'=>'+1 (555) 010-2000'}
  };
 }
 @IsTest static void shouldSaveReplayAndRefreshCaseUsingSharedAdapter() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Case record=CardstackConfiguredCaseTestData.fixture(); Map<String,Object> started=open(record);
   Assert.areEqual(record.CaseNumber,view(started,'Editing').get('recordName'),'Native auto-number identity needs no Name field.');
   Map<String,Object> resumed=transition(started,'resume',null); view(resumed,'Editing');
   Map<String,Object> reviewed=transition(resumed,'review',changes()); Map<String,Object> review=view(reviewed,'Review');
   Assert.areEqual(4,((List<Object>)review.get('diff')).size(),'Four exact configured changes reach server review.');
   Assert.areEqual('Configured request',CardstackConfiguredCaseTestData.current(record.Id).Subject,'Review has no CRM effect.');
   Test.startTest();
   Map<String,Object> completed=transition(reviewed,'confirm',null); Map<String,Object> receipt=(Map<String,Object>)view(completed,'Completed').get('receipt');
   Integer rows=Limits.getDmlRows();
   Map<String,Object> replay=transition(reviewed,'confirm',null); Assert.areEqual(rows,Limits.getDmlRows(),'Consumed Confirm adds no mutation.');
   Assert.areEqual(JSON.serialize(receipt),JSON.serialize(view(replay,'Completed').get('receipt')),'Replay retains the original receipt.');
   Map<String,Object> refreshed=view(CardstackRecordMcpAdapter.call('claude','cardstack_record_refresh',new Map<String,Object>{'recordId'=>CardstackConnectionTypes.normalizeId(String.valueOf(record.Id))}),null);
   Test.stopTest();
   Case current=CardstackConfiguredCaseTestData.current(record.Id);
   Assert.areEqual('Reviewed request',current.Subject,'Exact Subject saved.'); Assert.isNull(current.Description,'Explicit clear saved natively.');
   Assert.areEqual('after@example.com',current.SuppliedEmail,'Native Email crosses public adapter and writer.'); Assert.areEqual('+1 (555) 010-2000',current.SuppliedPhone,'Native STRING phone preserves the exact literal.');
   Assert.areEqual(record.OwnerId,current.OwnerId,'Required unmapped reference remains unchanged.'); Assert.areEqual(record.CaseNumber,refreshed.get('recordName'),'Fresh header keeps native auto-number identity.');
   Assert.areEqual(1,CardstackConfiguredCaseTestData.saveAudits(),'One CRM save audit, separate from publication audit.');
  }
 }
 @IsTest static void shouldResolveNativeDescriptorsAndConfiguredSections() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Case record=CardstackConfiguredCaseTestData.fixture();
   Test.startTest();
   CardstackRecordScreenCapability.Definition definition=CardstackRecordScreenCapability.resolveDefinition(record.Id,CardstackConfiguredCaseTestData.ACTION);
   CardstackOpportunityEditTypes.StoredState restored=CardstackOpportunityEditRepository.lockOwned('claude',(String)((Map<String,Object>)((Map<String,Object>)open(record).get('_meta')).get('cardstack/recordEdit')).get('interactionKey')).state;
   Test.stopTest();
   Assert.areEqual('CaseNumber',definition.nameField,'Native metadata selects the display-name field.');
   Assert.areEqual(CardstackConfiguredCaseTestData.INPUTS,definition.fields,'Published mapping order owns descriptors and review order.');
   Assert.isTrue(definition.requiredReadableProjection.contains('OwnerId'),'Required reference participates only in readable freshness projection.');
   Assert.areEqual(record.OwnerId,restored.initialRecord.record.get('OwnerId'),'Persisted reference restores as native identity.');
   Assert.areEqual(record.CaseNumber,restored.initialRecord.record.get('CaseNumber'),'Readonly auto-number restores without a Name assumption.');
   Assert.areEqual('EMAIL',definition.descriptors[0].dataType,'Native Email codec is selected.'); Assert.areEqual('STRING',definition.descriptors[3].dataType,'SuppliedPhone retains its actual native STRING type.');
   List<Object> sections=(List<Object>)definition.layout.get('sections');
   Assert.areEqual(new List<String>{'Subject','Description'},((Map<String,Object>)sections[0]).get('fields'),'Published request grouping differs from action order.');
   Assert.areEqual(new List<String>{'SuppliedPhone','SuppliedEmail'},((Map<String,Object>)sections[1]).get('fields'),'Published reply grouping survives projection.');
  }
 }
 @IsTest static void shouldRejectPublishedRequiredSubjectClear() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Case record=CardstackConfiguredCaseTestData.fixture();
   CardstackRecordScreenCapability.Definition definition=CardstackRecordScreenCapability.resolveDefinition(record.Id,CardstackConfiguredCaseTestData.ACTION);
   CardstackOpportunityEditTypes.RecordContext current=CardstackRecordScreenCapability.readContext(record.Id,definition,false);
   Test.startTest();
   try { CardstackRecordScreenCapability.canonicalize(current,definition,new List<CardstackOpportunityEditTypes.FieldChange>{CardstackRecordEditTestData.change('Subject','clear',null)}); Assert.fail('Published required field cannot clear.'); }
   catch(CardstackOpportunityEditDomain.ValidationException error) { Assert.areEqual('CLEAR_NOT_ALLOWED',error.getMessage(),'Published restriction narrows native nullable Subject.'); }
   Test.stopTest(); Assert.areEqual(0,CardstackConfiguredCaseTestData.saveAudits(),'Validation cannot write.');
  }
 }
 @IsTest static void shouldIgnoreDraftThenRejectNewPublicationDuringReview() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Case record=CardstackConfiguredCaseTestData.fixture(); Map<String,Object> started=open(record);
   Id draft=CardstackConfigService.saveDraft('layout:Case:default',CardstackConfiguredCaseTestData.layout('Changed case task'));
   Map<String,Object> reviewed=transition(started,'review',changes()); view(reviewed,'Review');
   CardstackConfigService.publishDraft(draft);
   Test.startTest(); Map<String,Object> denied=transition(reviewed,'confirm',null); Test.stopTest();
   Assert.areEqual(true,denied.get('isError'),'New publication revokes the reviewed context.');
   Assert.areEqual('Configured request',CardstackConfiguredCaseTestData.current(record.Id).Subject,'Pinned old review cannot write after policy publication.');
   Assert.areEqual(0,CardstackConfiguredCaseTestData.saveAudits(),'Publication drift creates no CRM write audit.');
  }
 }
 private static void rejectMapping(String field) {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Test.startTest();
    CardstackRecordActionService.Definition action=new CardstackRecordActionService.Definition(); action.type='record-edit';
    CardstackRecordActionService.Mapping mapping=new CardstackRecordActionService.Mapping(); mapping.fieldApi=field; mapping.source='current'; action.mappings=new List<CardstackRecordActionService.Mapping>{mapping};
    try { CardstackRecordScreenCapability.validateShape('Case',action); Assert.fail('Unsupported native edit mapping must fail closed.'); }
    catch(CardstackOpportunityActionPolicy.PolicyException error) { Assert.areEqual('UNSUPPORTED_FIELD_TYPE',error.getMessage(),'Readonly identity and reference need supported write providers.'); }
   Test.stopTest();
  }
 }
 @IsTest static void shouldRejectCaseAutoNumberMapping() { rejectMapping('CaseNumber'); }
 @IsTest static void shouldRejectCaseReferenceMapping() { rejectMapping('OwnerId'); }
}
