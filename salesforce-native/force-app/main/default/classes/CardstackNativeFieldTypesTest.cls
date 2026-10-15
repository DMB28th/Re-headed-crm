/** Expanded native codec/lifecycle source tests; native execution is an explicit separate gate. */
@IsTest(SeeAllData=false) private with sharing class CardstackNativeFieldTypesTest {
 @TestSetup static void permissions() {
  CardstackOpportunityEditTestData.grantCurrentActorPackageRead(); CardstackRecordEditTestData.grantCurrentActorLeadAccess(); CardstackRecordEditTestData.grantCurrentActorAccountAccess(); CardstackRecordEditTestData.grantCurrentActorAdmin();
 }
 @IsTest static void shouldKeepRetiredCurrentWithoutDefaultOrReselectingIt() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Lead record=fixture('Retired_API'); CardstackNativePicklistProvider.source=new FixtureSource();
   Test.startTest();
   CardstackRecordScreenCapability.Definition definition=CardstackRecordScreenCapability.resolveDefinition(record.Id,'lead_details');
   CardstackOpportunityEditTypes.RecordContext current=CardstackRecordScreenCapability.readContext(record.Id,definition,false);
   Assert.areEqual('Retired_API',CardstackRecordScreenCapability.describeFields(definition,current)[2].value,'Opening retains the retired exact current value.');
   Assert.areEqual(0,CardstackRecordScreenCapability.canonicalize(current,definition,new List<CardstackOpportunityEditTypes.FieldChange>()).entries.size(),'Omission retains the record.');
   Assert.areEqual(0,CardstackRecordScreenCapability.canonicalize(current,definition,new List<CardstackOpportunityEditTypes.FieldChange>{CardstackRecordEditTestData.change('Rating','set','Retired_API')}).entries.size(),'Same exact retired value is unchanged only.');
   rejectValue(current,definition,'Rating','retired_api','INVALID_PICKLIST'); Test.stopTest();
  }
 }
 @IsTest static void shouldRetainNullPicklistAndAllowExplicitClear() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Lead record=fixture(null); CardstackNativePicklistProvider.source=new FixtureSource();
   Test.startTest();
   CardstackRecordScreenCapability.Definition definition=CardstackRecordScreenCapability.resolveDefinition(record.Id,'lead_details');
   CardstackOpportunityEditTypes.RecordContext current=CardstackRecordScreenCapability.readContext(record.Id,definition,false);
   Assert.isNull(CardstackRecordScreenCapability.describeFields(definition,current)[2].value,'Native options never default an existing null record.');
   current.record.put('Rating','Retired_API');
   Assert.isNull(CardstackRecordScreenCapability.canonicalize(current,definition,new List<CardstackOpportunityEditTypes.FieldChange>{CardstackRecordEditTestData.change('Rating','clear',null)}).entries[0].newValue,'Clear remains explicit native null.'); Test.stopTest();
  }
 }
 @IsTest static void shouldBoundExactTypedStrings() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Lead record=fixture(null); CardstackNativePicklistProvider.source=new FixtureSource();
   Test.startTest(); CardstackRecordScreenCapability.Definition definition=CardstackRecordScreenCapability.resolveDefinition(record.Id,'lead_details');
   CardstackOpportunityEditTypes.RecordContext current=CardstackRecordScreenCapability.readContext(record.Id,definition,false);
   for(String field:new List<String>{'Email','Phone','Website'}) {
    String literal='  Exact <x>  ';
    CardstackOpportunityEditTypes.CanonicalPatch patch=CardstackRecordScreenCapability.canonicalize(current,definition,new List<CardstackOpportunityEditTypes.FieldChange>{CardstackRecordEditTestData.change(field,'set',literal)});
    Assert.areEqual(literal,patch.entries[0].newValue,'Typed strings preserve whitespace and exact text.');
    rejectValue(current,definition,field,'x'.repeat(Lead.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED).fields.getMap().get(field).getDescribe().getLength()+1),'TEXT_TOO_LONG');
   } Test.stopTest();
  }
 }
 @IsTest static void shouldRefetchOptionsAfterLockedRead() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Lead record=fixture(null); CardstackNativePicklistProvider.source=new FixtureSource();
   CardstackRecordScreenCapability.Definition definition=CardstackRecordScreenCapability.resolveDefinition(record.Id,'lead_details');
   String original=definition.fingerprint; CardstackNativePicklistProvider.source=new ChangedSource();
   Test.startTest(); CardstackRecordScreenCapability.readContext(record.Id,definition,true); Test.stopTest();
   Assert.areNotEqual(original,definition.fingerprint,'Locked read must refetch rather than trust resolution-time choices.');
  }
 }
 @IsTest static void shouldRejectMetadataDriftAfterReview() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Lead record=fixture(null); CardstackNativePicklistProvider.source=new FixtureSource();
   CardstackOpportunityEditTypes.Envelope opened=CardstackOpportunityEditService.startRecord('claude',record.Id,'lead_details');
   CardstackOpportunityEditTypes.TransitionRequest review=CardstackRecordEditTestData.request(opened,'review'); review.changes=new List<CardstackOpportunityEditTypes.FieldChange>{CardstackRecordEditTestData.change('Rating','set','Hot_API')};
   CardstackOpportunityEditTypes.Envelope reviewed=CardstackRecordEditTestData.transition(review); Assert.areEqual('Review',reviewed.view.status,'Valid native API choice must review.');
   CardstackNativePicklistProvider.source=new ChangedSource();
   Test.startTest(); CardstackRecordEditTestData.denied(CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(reviewed,'confirm')),'CONTEXT_CHANGED'); Test.stopTest();
   Assert.isNull([SELECT Rating FROM Lead WHERE Id=:record.Id WITH USER_MODE].Rating,'Stale native metadata cannot write.');
   Assert.areEqual(0,[SELECT count() FROM Cardstack_Audit_Log__c WITH SYSTEM_MODE],'Stale authority creates no audit.');
  }
 }
 @IsTest static void shouldPreserveSchema3ScalarInterpretation() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Account record=CardstackRecordEditTestData.accountFixture();
   CardstackRecordScreenCapability.Definition definition=CardstackRecordScreenCapability.resolveHistoricalDefinition(record.Id,'configured');
   CardstackOpportunityEditTypes.RecordContext current=CardstackRecordScreenCapability.readContext(record.Id,definition,false);
   CardstackOpportunityEditTypes.StoredState state=new CardstackOpportunityEditTypes.StoredState();
   state.kind='record-edit-v1'; state.schemaVersion=3; state.processVersion='record-edit/v2'; state.capabilityVersion='record-current/v2'; state.recordId=CardstackConnectionTypes.normalizeId(String.valueOf(record.Id)); state.objectApiName='Account'; state.actionName='configured'; state.actionDigest=CardstackOpportunityEditTypes.digest(new List<Object>{'record-action/v1',JSON.serialize(definition.action)}); state.policyDigest=definition.published.revision; state.orderedFields=definition.fields; state.capabilityFingerprint=definition.fingerprint; state.initialRecord=current; state.currencyCode=current.currencyCode;
   Test.startTest(); CardstackRecordScreenCapability.Definition restored=CardstackRecordScreenCapability.resolveDefinition(state); Test.stopTest();
   Assert.areEqual('record-current/v2',restored.capabilityVersion,'Historical grants retain their exact scalar-only engine.');
   Assert.areEqual(definition.fingerprint,restored.fingerprint,'Old capability digest remains stable.');
   Assert.isFalse(current.record.getPopulatedFieldsAsMap().containsKey('RecordTypeId'),'Schema3 does not acquire new context projection.');
  }
 }
 @IsTest static void shouldResumeConfirmAndReplayHistoricalSchema3() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Account record=CardstackRecordEditTestData.accountFixture(); CardstackOpportunityEditTypes.Envelope opened=CardstackOpportunityEditService.startRecord('claude',record.Id,'configured');
   CardstackRecordScreenCapability.Definition legacy=CardstackRecordScreenCapability.resolveHistoricalDefinition(record.Id,'configured');
   CardstackOpportunityEditTypes.RecordContext original=CardstackRecordScreenCapability.readContext(record.Id,legacy,false);
   Cardstack_Interaction__c row=CardstackRecordEditTestData.interaction(); Map<String,Object> state=(Map<String,Object>)JSON.deserializeUntyped(row.State__c);
   state.put('schemaVersion',3); state.put('processVersion','record-edit/v2'); state.put('capabilityVersion','record-current/v2'); state.put('capabilityFingerprint',legacy.fingerprint); state.put('initialRecord',JSON.deserializeUntyped(JSON.serialize(original))); row.State__c=JSON.serialize(state); update as system row;
   CardstackOpportunityEditTypes.Envelope resumed=CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(opened,'resume')); Assert.areEqual('Editing',resumed.view.status,'Historical tagged state restores through the existing repository.');
   CardstackOpportunityEditTypes.TransitionRequest review=CardstackRecordEditTestData.request(resumed,'review'); review.changes=new List<CardstackOpportunityEditTypes.FieldChange>{CardstackRecordEditTestData.change('Name','set','Historical saved')};
   CardstackOpportunityEditTypes.Envelope reviewed=CardstackRecordEditTestData.transition(review);
   Test.startTest(); CardstackOpportunityEditTypes.Envelope completed=CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(reviewed,'confirm'));
   Integer rows=Limits.getDmlRows(); CardstackOpportunityEditTypes.Envelope replay=CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(reviewed,'confirm')); Integer rowsAfterReplay=Limits.getDmlRows(); Test.stopTest();
   Assert.areEqual('Completed',completed.view.status,'Historical v2 review grants still save.');
   Assert.areEqual(rows,rowsAfterReplay,'Historical completed replay causes no mutation.');
   Assert.areEqual(JSON.serialize(completed.view.receipt),JSON.serialize(replay.view.receipt),'Exact old receipt replays.');
   Assert.areEqual('Historical saved',[SELECT Name FROM Account WHERE Id=:record.Id WITH USER_MODE].Name,'Historical write remains native.');
  }
 }
 @IsTest static void shouldRejectExpandedFieldsInHistoricalSchema3() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Lead record=fixture(null);
   Test.startTest();
   try { CardstackRecordScreenCapability.resolveHistoricalDefinition(record.Id,'lead_details'); Assert.fail('Old pending states cannot acquire picklists or typed strings.'); }
   catch(CardstackOpportunityActionPolicy.PolicyException error) { Assert.areEqual('UNSUPPORTED_FIELD_TYPE',error.getMessage(),'Old scalar engine is still closed.'); }
   Test.stopTest();
  }
 }
 @IsTest static void shouldRejectDirectGenericStageStartAndKeepSpecializedStart() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   fixture(null);
   insert as system new Cardstack_Config__c(Name='layout:Opportunity:default',Is_Active__c=true,Value__c='{"permissions":{"writeEnabled":true},"fields":[{"api":"StageName","editable":true},{"api":"CloseDate","editable":true},{"api":"Amount","editable":true}],"actions":[{"name":"edit_opportunity","label":"Edit Opportunity","enabled":true,"type":"record-edit","mappings":[{"fieldApi":"StageName","source":"current"},{"fieldApi":"CloseDate","source":"current"},{"fieldApi":"Amount","source":"current"}]}]}');
   Opportunity record=CardstackOpportunityEditTestData.insertOpportunity(); CardstackOpportunityStageProvider.source=new SpecializedStageSource(record.StageName);
   Test.startTest();
   CardstackOpportunityEditTypes.Envelope denied=CardstackOpportunityEditService.startRecord('claude',record.Id,'edit_opportunity');
   CardstackRecordEditTestData.denied(denied,'SPECIALIZED_STAGE_ACTION');
   Assert.isNull(denied.interactionKey,'Direct generic START cannot mint a second Stage capability.');
   Assert.areEqual(0,[SELECT count() FROM Cardstack_Interaction__c WITH SYSTEM_MODE],'Generic Stage denial precedes durable authority.');
   CardstackOpportunityEditTypes.Envelope specialized=CardstackOpportunityEditService.start('claude',record.Id,'edit_opportunity'); Test.stopTest();
   Assert.areEqual('Editing',specialized.view.status,'The existing fixed Stage preset remains available.');
   Assert.areEqual('opportunity-edit/v1',specialized.view.contractVersion,'Stage keeps its original provider and interpretation.');
  }
 }
 @IsTest static void shouldDescribeStageAsSpecializedInGenericEligibility() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Test.startTest(); Map<String,Object> result=CardstackRecordScreenCapability.describeEligibility('Opportunity'); Test.stopTest();
   Map<String,Object> stage;
   for(Map<String,Object> field:(List<Map<String,Object>>)result.get('fields')) if('StageName'.equals(field.get('fieldApi'))) stage=field;
   Assert.isNotNull(stage,'Static catalog retains the native Stage field and its reason.');
   Assert.areEqual(false,stage.get('eligible'),'Stage cannot be selected for a generic action.');
   Assert.areEqual('SPECIALIZED_STAGE_ACTION',stage.get('exclusionReason'),'The generic catalog explains the existing specialized boundary.');
  }
 }
 @IsTest static void shouldCompletePicklistSaveWithoutPostWriteProviderAndReplayOnce() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Lead record=fixture(null); String selectableRating;
   for(Schema.PicklistEntry item:Lead.Rating.getDescribe().getPicklistValues()) if(item.isActive()) { selectableRating=item.getValue(); break; }
   Assert.isNotNull(selectableRating,'Native active Rating fixture is needed only to create a valid DML test.');
   PostWriteUnavailableSource boundary=new PostWriteUnavailableSource(record.Id,selectableRating); CardstackNativePicklistProvider.source=boundary;
   CardstackOpportunityEditTypes.Envelope opened=CardstackOpportunityEditService.startRecord('claude',record.Id,'lead_details');
   CardstackOpportunityEditTypes.TransitionRequest review=CardstackRecordEditTestData.request(opened,'review'); review.changes=new List<CardstackOpportunityEditTypes.FieldChange>{CardstackRecordEditTestData.change('Company','set','Saved before provider failure'),CardstackRecordEditTestData.change('Rating','set',selectableRating)};
   CardstackOpportunityEditTypes.Envelope reviewed=CardstackRecordEditTestData.transition(review); Assert.areEqual('Review',reviewed.view.status,'Expanded picklist form reaches a valid reviewed write.');
   Test.startTest(); CardstackOpportunityEditTypes.Envelope completed=CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(reviewed,'confirm'));
   Assert.areEqual('Completed',completed.view.status,'Provider availability after native DML cannot undo a valid save.');
   Assert.areEqual(0,boundary.postWriteCalls,'Completion and presentation do not fetch options after CRM DML.');
   Assert.areEqual('Saved before provider failure',[SELECT Company FROM Lead WHERE Id=:record.Id WITH USER_MODE].Company,'Native save survives provider failure after the locked check.');
   Assert.areEqual(1,[SELECT count() FROM Cardstack_Audit_Log__c WITH SYSTEM_MODE],'The required audit persists once.');
   Assert.isNotNull(completed.view.receipt,'The durable original receipt is returned.');
   Assert.areEqual(selectableRating,[SELECT Rating FROM Lead WHERE Id=:record.Id WITH USER_MODE].Rating,'The freshly scoped exact picklist API value saves.');
   Integer rows=Limits.getDmlRows(); String storedBefore=CardstackRecordEditTestData.interaction().State__c;
   CardstackOpportunityEditTypes.Envelope resumed=CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(completed,'resume'));
   Assert.areEqual('Completed',resumed.view.status,'Completed Resume survives unavailable editable choices.');
   Assert.areEqual(JSON.serialize(completed.view.receipt),JSON.serialize(resumed.view.receipt),'Resume returns the identical durable receipt.');
   for(CardstackOpportunityEditTypes.FieldView field:resumed.view.fields) if(field.dataType=='PICKLIST') Assert.areEqual(0,field.choices.size(),'Terminal outcome carries no current selectable choices.');
   CardstackOpportunityEditTypes.Envelope replay=CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(reviewed,'confirm')); Integer rowsAfterRecovery=Limits.getDmlRows(); Test.stopTest();
   Assert.areEqual(rows,rowsAfterRecovery,'Completed Resume and consumed Confirm do not add any DML.');
   Assert.areEqual(0,boundary.postWriteCalls,'Neither completed recovery path invokes the unavailable provider.');
   Assert.areEqual(storedBefore,CardstackRecordEditTestData.interaction().State__c,'Recovery preserves exact stored receipt/state bytes.');
   Assert.areEqual(JSON.serialize(completed.view.receipt),JSON.serialize(replay.view.receipt),'Freshly readable completed state replays its exact original receipt.');
   Assert.areEqual('Completed',((Map<String,Object>)JSON.deserializeUntyped(CardstackRecordEditTestData.interaction().State__c)).get('status'),'Private state retains durable completion.');
  }
 }
 @IsTest static void shouldRejectTerminalCapabilityForNewCanonicalizationOrLockedRead() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   CardstackOpportunityEditTypes.Envelope completed=completeSimpleFixture();
   CardstackOpportunityEditTypes.StoredState state=CardstackOpportunityEditRepository.lockOwned('claude',completed.interactionKey).state;
   Test.startTest();
   CardstackRecordScreenCapability.Definition terminal=CardstackRecordScreenCapability.resolveDefinition(state);
   CardstackOpportunityEditTypes.RecordContext current=CardstackRecordScreenCapability.readContext((Id)state.recordId,terminal,false);
   try { CardstackRecordScreenCapability.canonicalize(current,terminal,new List<CardstackOpportunityEditTypes.FieldChange>{CardstackRecordEditTestData.change('Company','set','Another write')}); Assert.fail('Terminal metadata cannot authorize another patch.'); }
   catch(CardstackOpportunityEditDomain.ValidationException error) { Assert.areEqual('TERMINAL_CAPABILITY',error.getMessage(),'Terminal definitions categorically reject canonicalization.'); }
   try { CardstackRecordScreenCapability.readContext((Id)state.recordId,terminal,true); Assert.fail('Terminal metadata cannot enter the locked write path.'); }
   catch(CardstackOpportunitySelector.ReadException error) { Assert.areEqual('TERMINAL_CAPABILITY',error.getMessage(),'Terminal definitions categorically reject a write lock.'); }
   Test.stopTest();
  }
 }
 @IsTest static void shouldRejectCompletedStaticMetadataDigestTampering() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   CardstackOpportunityEditTypes.Envelope completed=completeSimpleFixture();
   CardstackOpportunityEditTypes.StoredState state=CardstackOpportunityEditRepository.lockOwned('claude',completed.interactionKey).state;
   state.capabilityMetadataFingerprint='f'.repeat(64);
   Test.startTest();
   try { CardstackRecordScreenCapability.resolveDefinition(state); Assert.fail('Unavailable choices cannot bypass static metadata binding.'); }
   catch(CardstackOpportunityEditRepository.RepositoryException error) { Assert.areEqual('CONTEXT_CHANGED',error.getMessage(),'Static metadata digest must independently match native metadata.'); }
   Test.stopTest();
  }
 }
 @IsTest static void shouldRejectTamperedCompletedReceiptOnResumeWithoutProvider() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   CardstackOpportunityEditTypes.Envelope completed=completeSimpleFixture();
   Cardstack_Interaction__c row=CardstackRecordEditTestData.interaction(); Map<String,Object> body=(Map<String,Object>)JSON.deserializeUntyped(row.State__c);
   ((Map<String,Object>)body.get('receipt')).put('reference','receipt-'+ 'f'.repeat(32)); row.State__c=JSON.serialize(body); update as system row;
   CardstackNativePicklistProvider.source=new UnavailableSource();
   Test.startTest(); CardstackRecordEditTestData.denied(CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(completed,'resume')),'INVALID_REVIEW_CONTEXT'); Test.stopTest();
  }
 }
 @IsTest static void shouldRejectWrongConsumedGrantWithoutOptions() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   CardstackOpportunityEditTypes.Envelope completed=completeSimpleFixture(); UnavailableSource unavailable=new UnavailableSource(); CardstackNativePicklistProvider.source=unavailable;
   CardstackOpportunityEditTypes.TransitionRequest request=CardstackRecordEditTestData.request(completed,'confirm'); request.expectedRevision--; request.reviewGrant='d'.repeat(64);
   Test.startTest(); Integer rows=Limits.getDmlRows(); CardstackRecordEditTestData.denied(CardstackRecordEditTestData.transition(request),'INVALID_REVIEW_CONTEXT'); Integer rowsAfterDenial=Limits.getDmlRows(); Test.stopTest();
   Assert.areEqual(rows,rowsAfterDenial,'Wrong consumed grant adds no mutation.'); Assert.areEqual(0,unavailable.calls,'Invalid raw grant is rejected before any provider resolution.');
  }
 }
 @IsTest static void shouldRejectChangedCompletedPolicyWithoutOptions() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   CardstackOpportunityEditTypes.Envelope completed=completeSimpleFixture(); UnavailableSource unavailable=new UnavailableSource(); CardstackNativePicklistProvider.source=unavailable;
   Cardstack_Config__c config=[SELECT Id,Value__c FROM Cardstack_Config__c WHERE Name='layout:Lead:default' WITH SYSTEM_MODE LIMIT 1]; config.Value__c=config.Value__c.replace('Lead details','Changed Lead details'); update as system config;
   Test.startTest(); Integer rows=Limits.getDmlRows(); CardstackRecordEditTestData.denied(CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(completed,'resume')),'CONTEXT_CHANGED'); Integer rowsAfterDenial=Limits.getDmlRows(); Test.stopTest();
   Assert.areEqual(rows,rowsAfterDenial,'Changed published policy does not allow new terminal authority.'); Assert.areEqual(0,unavailable.calls,'Native policy rejection is independent of options availability.');
  }
 }
 private static CardstackOpportunityEditTypes.Envelope completeSimpleFixture() {
  Lead record=fixture(null); CardstackNativePicklistProvider.source=new FixtureSource();
  CardstackOpportunityEditTypes.Envelope opened=CardstackOpportunityEditService.startRecord('claude',record.Id,'lead_details');
  CardstackOpportunityEditTypes.TransitionRequest request=CardstackRecordEditTestData.request(opened,'review'); request.changes=new List<CardstackOpportunityEditTypes.FieldChange>{CardstackRecordEditTestData.change('Company','set','Completed fixture')};
  CardstackOpportunityEditTypes.Envelope reviewed=CardstackRecordEditTestData.transition(request);
  CardstackOpportunityEditTypes.Envelope completed=CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(reviewed,'confirm'));
  Assert.areEqual('Completed',completed.view.status,'Isolated completed fixture must have a real saved receipt.'); return completed;
 }
 private with sharing class UnavailableSource implements CardstackNativePicklistProvider.OptionsSource {
  private Integer calls=0;
  public ConnectApi.PicklistValuesCollection fetch(String objectApi,String recordTypeId) { calls++; throw new ProviderFixtureException('Synthetic unavailable options'); }
 }
 private with sharing class SpecializedStageSource implements CardstackOpportunityStageProvider.OptionsSource {
  private String stage;
  private SpecializedStageSource(String stage) { this.stage=stage; }
  public CardstackOpportunityEditTypes.StageContext fetch(String objectApi,String recordTypeId) {
   CardstackOpportunityEditTypes.StageContext result=new CardstackOpportunityEditTypes.StageContext(); result.recordTypeId=recordTypeId;
   result.choices.add(CardstackOpportunityEditTestData.choice('Current Stage fixture',stage)); return result;
  }
 }
 private with sharing class PostWriteUnavailableSource implements CardstackNativePicklistProvider.OptionsSource {
  private Id recordId; private String selectableRating; private Integer postWriteCalls=0;
  private PostWriteUnavailableSource(Id recordId,String selectableRating) { this.recordId=recordId; this.selectableRating=selectableRating; }
  public ConnectApi.PicklistValuesCollection fetch(String objectApi,String recordTypeId) {
   Lead current=[SELECT Company FROM Lead WHERE Id=:recordId WITH USER_MODE];
   if(current.Company=='Saved before provider failure') { postWriteCalls++; throw new ProviderFixtureException('Synthetic post-write unavailable boundary'); }
   return options(selectableRating);
  }
 }
 private class ProviderFixtureException extends Exception {}
 private static Lead fixture(String rating) {
  CardstackConnectionAccess.userOverride=true;
  List<Object> fields=new List<Object>(),mappings=new List<Object>();
  for(String name:new List<String>{'LastName','Company','Rating','LeadSource','Email','Phone','Website'}) { fields.add(new Map<String,Object>{'api'=>name,'editable'=>true}); mappings.add(new Map<String,Object>{'fieldApi'=>name,'source'=>'current'}); }
  insert as system new Cardstack_Config__c(Name='layout:Lead:default',Is_Active__c=true,Value__c=JSON.serialize(new Map<String,Object>{'permissions'=>new Map<String,Object>{'writeEnabled'=>true},'fields'=>fields,'actions'=>new List<Object>{new Map<String,Object>{'name'=>'lead_details','label'=>'Lead details','enabled'=>true,'type'=>'record-edit','mappings'=>mappings}}}));
  insert as system new Cardstack_Connection_Setup__c(Client__c='claude',Revision__c=1,Configuration_Digest__c='fixture-setup',Configuration__c='{"client":"claude","enabledIntent":true,"publicClientId":"fixture-public-client","callbacks":["https://claude.ai/api/mcp/auth_callback"],"sitePrefix":"/cardstack","packageVersion":"0.1.0.8","transportVersion":"cardstack/v1","uiVersion":"mcp-apps/v1","permissionPolicyRevision":"1"}');
  Lead record=new Lead(LastName='Fixture',Company='Fixture',Rating=rating); insert as system record; return record;
 }
 private static void rejectValue(CardstackOpportunityEditTypes.RecordContext current,CardstackRecordScreenCapability.Definition definition,String field,String value,String code) {
  try { CardstackRecordScreenCapability.canonicalize(current,definition,new List<CardstackOpportunityEditTypes.FieldChange>{CardstackRecordEditTestData.change(field,'set',value)}); Assert.fail('Native invalid literal must deny.'); }
  catch(CardstackOpportunityEditDomain.ValidationException error) { Assert.areEqual(code,error.getMessage(),'Bounded native validation.'); }
 }
 private with sharing class FixtureSource implements CardstackNativePicklistProvider.OptionsSource {
  public ConnectApi.PicklistValuesCollection fetch(String objectApi,String recordTypeId) { return options('Hot_API'); }
 }
 private with sharing class ChangedSource implements CardstackNativePicklistProvider.OptionsSource {
  public ConnectApi.PicklistValuesCollection fetch(String objectApi,String recordTypeId) { return options('Cold_API'); }
 }
 private static ConnectApi.PicklistValuesCollection options(String ratingValue) {
  ConnectApi.PicklistValue rating=new ConnectApi.PicklistValue(); rating.label='Rating display'; rating.value=ratingValue;
  ConnectApi.PicklistValue source=new ConnectApi.PicklistValue(); source.label='Source display'; source.value='Web_API';
  ConnectApi.PicklistValues ratingOptions=new ConnectApi.PicklistValues(); ratingOptions.values=new List<ConnectApi.PicklistValue>{rating};
  ConnectApi.PicklistValues sourceOptions=new ConnectApi.PicklistValues(); sourceOptions.values=new List<ConnectApi.PicklistValue>{source};
  ConnectApi.PicklistValuesCollection raw=new ConnectApi.PicklistValuesCollection(); raw.picklistFieldValues=new Map<String,ConnectApi.PicklistValues>{'Rating'=>ratingOptions,'LeadSource'=>sourceOptions}; return raw;
 }
}
