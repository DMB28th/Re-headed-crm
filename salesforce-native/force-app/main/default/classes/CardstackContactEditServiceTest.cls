/** Contact lifecycle exercises the existing store/writer; all native fixtures roll back. */
@IsTest private with sharing class CardstackContactEditServiceTest {
 @TestSetup static void permissions() { CardstackOpportunityEditTestData.grantCurrentActorPackageRead(); CardstackRecordEditTestData.grantCurrentActorContactAccess(); }
 @IsTest static void shouldSaveTextClearAndBooleanAndReplayOnce() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Contact record=CardstackRecordEditTestData.fixture(); CardstackOpportunityEditTypes.Envelope opened=CardstackRecordEditTestData.open(record);
   Assert.areEqual('Editing',opened.view.status,'Contact capability starts.'); Assert.areEqual('Contact',opened.view.objectApiName,'Canonical identity.');
   CardstackOpportunityEditTypes.Envelope review=CardstackRecordEditTestData.review(opened); Assert.areEqual('Review',review.view.status,'Review exists before Confirm.'); Assert.areEqual(3,review.view.fields.size(),'Review carries checked field membership.'); Assert.areEqual(1,review.view.layout.get('version'),'Checked layout version.');
   Assert.areEqual('Original',CardstackRecordEditTestData.current(record.Id).LastName,'Review does no CRM write.');
   Test.startTest(); CardstackOpportunityEditTypes.Envelope completed=CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(review,'confirm'));
   Assert.areEqual('Completed',completed.view.status,'Shared writer completes Contact.'); Contact after=CardstackRecordEditTestData.current(record.Id);
   Assert.areEqual('Reviewed',after.LastName,'Exact reviewed text.'); Assert.isNull(after.Description,'Explicit clear.'); Assert.areEqual(true,after.HasOptedOutOfEmail,'Native Boolean.');
   Integer rows=Limits.getDmlRows(); CardstackOpportunityEditTypes.Envelope replay=CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(review,'confirm'));
   Assert.areEqual(JSON.serialize(completed.view.receipt),JSON.serialize(replay.view.receipt),'Immutable original completion replay.'); Assert.areEqual(rows,Limits.getDmlRows(),'Replay writes nothing.');
   Assert.areEqual(1,[SELECT count() FROM Cardstack_Audit_Log__c WITH SYSTEM_MODE],'Mandatory audit once.'); Assert.areEqual(3,completed.view.fields.size(),'Completion descriptors remain checked.'); Test.stopTest();
  }
 }
 @IsTest static void shouldRollbackCrmWhenRequiredAuditFails() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Contact record=CardstackRecordEditTestData.fixture(); CardstackOpportunityEditTypes.Envelope review=CardstackRecordEditTestData.review(CardstackRecordEditTestData.open(record)); String before=CardstackRecordEditTestData.interaction().State__c;
   CardstackOpportunityWriteAudit.failAppend=true; Test.startTest(); CardstackRecordEditTestData.denied(CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(review,'confirm')),'SAVE_UNAVAILABLE'); Test.stopTest();
   Assert.areEqual('Original',CardstackRecordEditTestData.current(record.Id).LastName,'CRM rolled back.'); Assert.areEqual(before,CardstackRecordEditTestData.interaction().State__c,'Private completion rolled back.'); Assert.areEqual(0,[SELECT count() FROM Cardstack_Audit_Log__c WITH SYSTEM_MODE],'No partial audit.');
  }
 }
 @IsTest static void shouldRollbackCrmAndAuditWhenReceiptFails() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Contact record=CardstackRecordEditTestData.fixture(); CardstackOpportunityEditTypes.Envelope review=CardstackRecordEditTestData.review(CardstackRecordEditTestData.open(record)); CardstackOpportunityEditRepository.failComplete=true;
   Test.startTest(); CardstackRecordEditTestData.denied(CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(review,'confirm')),'SAVE_UNAVAILABLE'); Test.stopTest(); Assert.areEqual('Original',CardstackRecordEditTestData.current(record.Id).LastName,'Receipt required for save.'); Assert.areEqual(0,[SELECT count() FROM Cardstack_Audit_Log__c WITH SYSTEM_MODE],'Audit transaction rolled back.');
  }
 }
 @IsTest static void shouldRejectOpportunityFamilyForContactKey() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Contact record=CardstackRecordEditTestData.fixture(); CardstackOpportunityEditTypes.Envelope review=CardstackRecordEditTestData.review(CardstackRecordEditTestData.open(record));
   Test.startTest(); CardstackRecordEditTestData.denied(CardstackOpportunityEditService.transitionFromMcp('claude',CardstackRecordEditTestData.request(review,'confirm')),'INVALID_INTERACTION'); Test.stopTest(); Assert.areEqual('Original',CardstackRecordEditTestData.current(record.Id).LastName,'Cross-family Confirm cannot write.');
  }
 }
 @IsTest static void shouldInvalidateReviewOnFieldOrderDrift() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Contact record=CardstackRecordEditTestData.fixture(); CardstackOpportunityEditTypes.Envelope review=CardstackRecordEditTestData.review(CardstackRecordEditTestData.open(record));
   Cardstack_Config__c config=[SELECT Id,Value__c FROM Cardstack_Config__c WITH SYSTEM_MODE LIMIT 1];
   Map<String,Object> body=(Map<String,Object>)JSON.deserializeUntyped(CardstackRecordEditTestData.layout()); Map<String,Object> action=(Map<String,Object>)((List<Object>)body.get('actions'))[0]; List<Object> mappings=(List<Object>)action.get('mappings'); Object first=mappings[0]; mappings[0]=mappings[1]; mappings[1]=first; config.Value__c=JSON.serialize(body); update as system config;
   Test.startTest(); CardstackRecordEditTestData.denied(CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(review,'confirm')),'CONTEXT_CHANGED'); Test.stopTest(); Assert.areEqual('Original',CardstackRecordEditTestData.current(record.Id).LastName,'Order drift cannot write.');
  }
 }
 @IsTest static void shouldRejectFreshnessDriftBeforeDml() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Contact record=CardstackRecordEditTestData.fixture(); CardstackOpportunityEditTypes.Envelope review=CardstackRecordEditTestData.review(CardstackRecordEditTestData.open(record)); record.Description='Concurrent'; update record;
   Test.startTest(); CardstackRecordEditTestData.denied(CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(review,'confirm')),'CONTEXT_CHANGED'); Test.stopTest(); Assert.areEqual('Original',CardstackRecordEditTestData.current(record.Id).LastName,'Freshness drift prevents save.');
  }
 }
 @IsTest static void shouldCancelWithoutWrite() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Contact record=CardstackRecordEditTestData.fixture(); CardstackOpportunityEditTypes.Envelope review=CardstackRecordEditTestData.review(CardstackRecordEditTestData.open(record));
   Test.startTest(); CardstackOpportunityEditTypes.Envelope cancelled=CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(review,'cancel')); CardstackRecordEditTestData.denied(CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(review,'confirm')),'STALE_REVISION'); Test.stopTest(); Assert.areEqual('Cancelled',cancelled.view.status,'Cancellation persists.'); Assert.areEqual('Original',CardstackRecordEditTestData.current(record.Id).LastName,'Cancelled patch cannot save.');
  }
 }
 @IsTest static void shouldHideStateWhenUserAuthorizationRevoked() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Contact record=CardstackRecordEditTestData.fixture(); CardstackOpportunityEditTypes.Envelope opened=CardstackRecordEditTestData.open(record); CardstackConnectionAccess.userOverride=false;
   Test.startTest(); CardstackOpportunityEditTypes.Envelope denied=CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(opened,'resume')); Test.stopTest(); CardstackRecordEditTestData.denied(denied,'NOT_AUTHORIZED'); Assert.isNull(denied.view.recordId,'Revoked access hides identity.'); Assert.areEqual(0,denied.view.fields.size(),'Revoked access hides fields.');
  }
 }
 @IsTest static void shouldRejectUnpublishedAction() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Contact record=CardstackRecordEditTestData.fixture(); Test.startTest(); CardstackRecordEditTestData.denied(CardstackOpportunityEditService.startRecord('claude',record.Id,'draft_only'),'ACTION_NOT_PUBLISHED'); Test.stopTest(); Assert.areEqual(0,[SELECT count() FROM Cardstack_Interaction__c WITH SYSTEM_MODE],'Draft cannot create state.');
  }
 }
 @IsTest static void shouldNeverTrustPersistedTypedValues() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Contact record=CardstackRecordEditTestData.fixture(); CardstackOpportunityEditTypes.Envelope review=CardstackRecordEditTestData.review(CardstackRecordEditTestData.open(record)); Cardstack_Interaction__c row=CardstackRecordEditTestData.interaction(); Map<String,Object> stored=(Map<String,Object>)JSON.deserializeUntyped(row.State__c); ((Map<String,Object>)stored.get('patch')).put('typedValues',new Map<String,Object>{'LastName'=>'Injected','HasOptedOutOfEmail'=>false}); row.State__c=JSON.serialize(stored); update as system row;
   Test.startTest(); CardstackOpportunityEditTypes.Envelope completed=CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(review,'confirm')); Test.stopTest(); Assert.areEqual('Completed',completed.view.status,'Non-authoritative persisted typedValues ignored.'); Assert.areEqual('Reviewed',CardstackRecordEditTestData.current(record.Id).LastName,'Answers freshly derive values.'); Assert.areEqual(true,CardstackRecordEditTestData.current(record.Id).HasOptedOutOfEmail,'Boolean freshly derived.');
  }
 }
 @IsTest static void shouldRejectExpiredReview() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Contact record=CardstackRecordEditTestData.fixture(); CardstackOpportunityEditTypes.Envelope review=CardstackRecordEditTestData.review(CardstackRecordEditTestData.open(record));
   String originalState=CardstackRecordEditTestData.interaction().State__c;
   String grantHash=EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256',Blob.valueOf(review.reviewGrant)));
   Cardstack_Confirmation__c grant=[SELECT Id,Expires_At__c FROM Cardstack_Confirmation__c WHERE Key_Hash__c=:grantHash WITH SYSTEM_MODE LIMIT 1];
   // Expire only the grant. The immutable review subject and interaction deadline stay pinned.
   grant.Expires_At__c=Datetime.now().addSeconds(-5); update as system grant;
   Test.startTest(); CardstackRecordEditTestData.denied(CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(review,'confirm')),'EXPIRED'); Test.stopTest(); Assert.areEqual('Original',CardstackRecordEditTestData.current(record.Id).LastName,'Expired grant cannot write.'); Assert.areEqual(originalState,CardstackRecordEditTestData.interaction().State__c,'Expiry does not alter pinned review state.');
  }
 }
 @IsTest static void shouldRejectWrongPinnedClient() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Contact record=CardstackRecordEditTestData.fixture(); CardstackOpportunityEditTypes.Envelope opened=CardstackRecordEditTestData.open(record);
   insert as system new Cardstack_Connection_Setup__c(Client__c='chatgpt',Revision__c=1,Configuration_Digest__c='other-setup',Configuration__c='{"client":"chatgpt","enabledIntent":true}');
   Test.startTest(); CardstackRecordEditTestData.denied(CardstackOpportunityEditService.transitionRecordFromMcp('chatgpt',CardstackRecordEditTestData.request(opened,'resume')),'INVALID_INTERACTION'); Test.stopTest();
  }
 }
 @IsTest static void shouldRejectPersistedCapabilitySubstitution() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Contact record=CardstackRecordEditTestData.fixture(); CardstackOpportunityEditTypes.Envelope review=CardstackRecordEditTestData.review(CardstackRecordEditTestData.open(record)); Cardstack_Interaction__c row=CardstackRecordEditTestData.interaction(); Map<String,Object> stored=(Map<String,Object>)JSON.deserializeUntyped(row.State__c); stored.put('capabilityVersion','opportunity-edit/v1'); row.State__c=JSON.serialize(stored); update as system row;
   Test.startTest(); CardstackRecordEditTestData.denied(CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(review,'confirm')),'INVALID_STATE_KIND'); Test.stopTest(); Assert.areEqual('Original',CardstackRecordEditTestData.current(record.Id).LastName,'Wrong capability cannot write.');
  }
 }
 @IsTest static void shouldResumeAndConfirmLegacySchemaTwoContact() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Contact record=CardstackRecordEditTestData.fixture(); CardstackOpportunityEditTypes.Envelope opened=CardstackRecordEditTestData.open(record);
   CardstackRecordScreenCapability.Definition legacy=CardstackRecordScreenCapability.resolveDefinition('edit_contact');
   CardstackOpportunityEditTypes.RecordContext original=CardstackRecordScreenCapability.readContext(record.Id,legacy,false);
   Cardstack_Interaction__c row=CardstackRecordEditTestData.interaction(); Map<String,Object> state=(Map<String,Object>)JSON.deserializeUntyped(row.State__c);
   state.put('schemaVersion',2); state.put('processVersion','record-edit/v1'); state.put('capabilityVersion','contact-current/v1'); state.put('capabilityFingerprint',legacy.fingerprint);
   state.put('initialRecord',JSON.deserializeUntyped(JSON.serialize(original))); state.put('currencyCode',null); row.State__c=JSON.serialize(state); update as system row;
   CardstackOpportunityEditTypes.Envelope resumed=CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(opened,'resume'));
   Assert.areEqual('Editing',resumed.view.status,'Legacy explicit interpretation remains supported.');
   CardstackOpportunityEditTypes.Envelope reviewed=CardstackRecordEditTestData.review(resumed);
   Test.startTest(); CardstackOpportunityEditTypes.Envelope completed=CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(reviewed,'confirm')); Test.stopTest();
   Assert.areEqual('Completed',completed.view.status,'Legacy review uses the same writer.');
   Assert.areEqual('Reviewed',CardstackRecordEditTestData.current(record.Id).LastName,'Legacy Contact values save exactly.');
  }
 }
 // Independent pinned shapes from base 7110134; never use the new FieldView,
 // legacyDescriptors(), fingerprint builder or reviewSubject() to mint this fixture.
 private with sharing class BaseDescriptor {
  public String fieldApi; public String label; public String value; public String dataType;
  public Boolean required; public Boolean canClear; public List<CardstackOpportunityEditTypes.Choice> choices=new List<CardstackOpportunityEditTypes.Choice>(); public String currencyCode;
 }
 private with sharing class BaseMapping { public String fieldApi; public String source; public String sourceField; public String value; }
 private with sharing class BaseAction { public String name; public String label; public String type; public String flowApiName; public Boolean enabled; public List<BaseMapping> mappings; }
 private static String baseHash(String value) { return EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256',Blob.valueOf(value))); }
 private static BaseAction baseAction() {
  BaseAction result=new BaseAction(); result.name='edit_contact'; result.label='Edit Contact'; result.type='record-edit'; result.enabled=true; result.mappings=new List<BaseMapping>();
  for(String field:new List<String>{'LastName','Description','HasOptedOutOfEmail'}) { BaseMapping mapping=new BaseMapping(); mapping.fieldApi=field; mapping.source='current'; result.mappings.add(mapping); }
  return result;
 }
 private static String baseFingerprint(String policyDigest) {
  List<String> fields=new List<String>{'LastName','Description','HasOptedOutOfEmail'}; List<BaseDescriptor> descriptors=new List<BaseDescriptor>();
  for(String field:fields) {
   Schema.DescribeFieldResult shape=Contact.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED).fields.getMap().get(field).getDescribe(); BaseDescriptor descriptor=new BaseDescriptor();
   descriptor.fieldApi=field; descriptor.label=shape.getLabel(); descriptor.dataType=String.valueOf(shape.getType()); descriptor.required=!shape.isNillable() || field.equals('LastName'); descriptor.canClear=shape.isNillable() && shape.getType()!=Schema.DisplayType.Boolean && !descriptor.required; descriptors.add(descriptor);
  }
  Map<String,Object> layout=new Map<String,Object>{'version'=>1,'sections'=>new List<Object>{new Map<String,Object>{'id'=>'details','label'=>'Details','columns'=>2,'fields'=>fields}}};
  return baseHash(JSON.serialize(new List<Object>{'contact-current/v1',JSON.serialize(baseAction()),policyDigest,JSON.serialize(descriptors),JSON.serialize(layout)}));
 }
 @IsTest static void shouldConfirmAlreadyReviewedBaseSchemaTwoGrantAndReplayCompletedReceipt() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Contact record=CardstackRecordEditTestData.fixture(); CardstackOpportunityEditTypes.Envelope opened=CardstackRecordEditTestData.open(record);
   Cardstack_Interaction__c row=CardstackRecordEditTestData.interaction(); Map<String,Object> state=(Map<String,Object>)JSON.deserializeUntyped(row.State__c);
   String policyDigest=baseHash(CardstackRecordEditTestData.layout()),fingerprint=baseFingerprint(policyDigest);
   Assert.areEqual(fingerprint,CardstackRecordScreenCapability.resolveDefinition('edit_contact').fingerprint,'Pinned base descriptor shape independently determines legacy fingerprint.');
   Contact original=[SELECT Id,Name,LastName,Description,HasOptedOutOfEmail,SystemModstamp FROM Contact WHERE Id=:record.Id WITH USER_MODE];
   List<Object> freshnessParts=new List<Object>{'contact-current/v1',fingerprint};
   for(String field:new List<String>{'Description','HasOptedOutOfEmail','Id','LastName','Name','SystemModstamp'}) freshnessParts.add(new List<Object>{field,original.get(field)});
   String freshness=baseHash(JSON.serialize(freshnessParts)),after='Historical reviewed';
   List<Object> entries=new List<Object>{new Map<String,Object>{'fieldApiName'=>'Description','newValue'=>after}};
   List<Object> diff=new List<Object>{new Map<String,Object>{'fieldApi'=>'Description','label'=>Contact.Description.getDescribe().getLabel(),'beforeValue'=>'Before','afterValue'=>after}};
   String patchDigest=baseHash(JSON.serialize(new List<Object>{'contact-current/v1',fingerprint,new List<Object>{'Description',after}}));
   state.put('schemaVersion',2); state.put('processVersion','record-edit/v1'); state.put('capabilityVersion','contact-current/v1'); state.put('capabilityFingerprint',fingerprint); state.put('policyDigest',policyDigest); state.put('actionDigest',baseHash(JSON.serialize(new List<Object>{'record-action/v1',JSON.serialize(baseAction())})));
   state.put('initialRecord',new Map<String,Object>{'record'=>original,'currencyCode'=>null,'freshness'=>freshness}); state.put('currencyCode',null); state.put('revision',2); state.put('reviewRevision',1); state.put('status','Review');
   state.put('answers',new List<Object>{new Map<String,Object>{'fieldApi'=>'Description','operation'=>'set','value'=>after}}); state.put('diff',diff); state.put('patch',new Map<String,Object>{'digest'=>patchDigest,'entries'=>entries,'diff'=>diff,'typedValues'=>new Map<String,Object>()});
   String subject=JSON.serialize(new List<Object>{'record-review/v1','Contact','contact-current/v1',state.get('orderedFields'),fingerprint,state.get('actorId'),state.get('orgId'),state.get('client'),state.get('recordId'),'record-edit/v1','edit_contact',state.get('actionDigest'),policyDigest,state.get('setupDigest'),state.get('setupRevision'),2,1,state.get('expiresAt'),patchDigest,new List<Object>{new List<Object>{'Description',after}},freshness});
   String grantKey=EncodingUtil.convertToHex(Crypto.generateAesKey(256));
   Cardstack_Confirmation__c grant=new Cardstack_Confirmation__c(Key_Hash__c=baseHash(grantKey),Subject_Hash__c=baseHash(subject),Actor_Id__c=(String)state.get('actorId'),Record_Id__c=(String)state.get('recordId'),Record_Version__c=baseHash(freshness),Expires_At__c=row.Expires_At__c); insert as system grant;
   state.put('confirmationId',grant.Id); row.State__c=JSON.serialize(state); update as system row;
   Test.startTest(); CardstackOpportunityEditRepository.LockedInteraction restored=CardstackOpportunityEditRepository.lockOwned('claude',opened.interactionKey);
   Assert.areEqual(fingerprint,CardstackRecordScreenCapability.resolveDefinition(restored.state).fingerprint,'Restored historical fingerprint and freshness are independently validated before confirm.');
   Assert.areEqual(original.Name,restored.state.initialRecord.record.get('Name'),'Historical readonly compound Name is retained.');
   Assert.areEqual(original.SystemModstamp,restored.state.initialRecord.record.get('SystemModstamp'),'Historical native timestamp remains exact.');
   Assert.areEqual(freshness,restored.state.initialRecord.freshness,'Historical grant retains its original freshness.');
   CardstackOpportunityEditTypes.TransitionRequest request=new CardstackOpportunityEditTypes.TransitionRequest(); request.interactionKey=opened.interactionKey; request.operation='confirm'; request.expectedRevision=2; request.reviewRevision=1; request.reviewGrant=grantKey;
   CardstackOpportunityEditTypes.Envelope completed=CardstackRecordEditTestData.transition(request); Assert.areEqual('Completed',completed.view.status,'Already-reviewed base subject/grant is accepted.'); Integer rows=Limits.getDmlRows(); CardstackOpportunityEditTypes.Envelope replay=CardstackRecordEditTestData.transition(request); Assert.areEqual(rows,Limits.getDmlRows(),'Historical completed replay writes no additional rows.'); Test.stopTest();
   Assert.areEqual(JSON.serialize(completed.view.receipt),JSON.serialize(replay.view.receipt),'Historical completion receipt is immutable.'); Assert.areEqual(after,CardstackRecordEditTestData.current(record.Id).Description,'Only the historical reviewed value is saved.');
  }
 }
}
