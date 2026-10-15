/** Pure Contact capability risk tests; native execution requires installed source. */
@IsTest private class CardstackRecordScreenCapabilityTest {
 @TestSetup static void permissions() { CardstackOpportunityEditTestData.grantCurrentActorPackageRead(); CardstackRecordEditTestData.grantCurrentActorContactAccess(); }
 private static CardstackRecordScreenCapability.Definition definition() {
  CardstackRecordActionService.Definition action = new CardstackRecordActionService.Definition();
  action.name='contact-edit'; action.label='Edit Contact'; action.type='record-edit'; action.enabled=true;
  action.mappings=new List<CardstackRecordActionService.Mapping>();
  CardstackPolicyService.Policy policy=new CardstackPolicyService.Policy();
  policy.objectApiName='Contact'; policy.editEnabled=true; policy.revision='published';
  policy.fields=new Map<String,CardstackPolicyService.FieldPolicy>();
  for(String api:new List<String>{'LastName','Description','HasOptedOutOfEmail'}) {
   CardstackRecordActionService.Mapping m=new CardstackRecordActionService.Mapping(); m.fieldApi=api; m.source='current'; action.mappings.add(m);
   CardstackPolicyService.FieldPolicy f=new CardstackPolicyService.FieldPolicy(); f.apiName=api; f.readOnly=false; f.required=false; policy.fields.put(api,f);
  }
  return CardstackRecordScreenCapability.definition(action,policy);
 }
 private static CardstackOpportunityEditTypes.RecordContext context(String description) {
  CardstackOpportunityEditTypes.RecordContext current=new CardstackOpportunityEditTypes.RecordContext();
  current.record=new Contact(LastName='Original',Description=description,HasOptedOutOfEmail=false,OwnerId=UserInfo.getUserId()); current.freshness='fresh'; return current;
 }
 private static CardstackOpportunityEditTypes.FieldChange change(String field,String operation,String value) {
  CardstackOpportunityEditTypes.FieldChange answer=new CardstackOpportunityEditTypes.FieldChange(); answer.fieldApi=field; answer.operation=operation; answer.value=value; return answer;
 }
 @IsTest static void shouldRetainExactTextAndTypedBoolean() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
  Test.startTest();
  CardstackOpportunityEditTypes.CanonicalPatch patch=CardstackRecordScreenCapability.canonicalize(context('Old'),definition(),new List<CardstackOpportunityEditTypes.FieldChange>{change('Description','set','  exact\ntext  '),change('HasOptedOutOfEmail','set','true')});
  Test.stopTest(); Assert.areEqual('  exact\ntext  ',patch.typedValues.get('Description'),'Text must retain whitespace.'); Assert.areEqual(true,patch.typedValues.get('HasOptedOutOfEmail'),'Boolean must be native typed.');
  }
 }
 @IsTest static void shouldClearOptionalText() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
  Test.startTest(); CardstackOpportunityEditTypes.CanonicalPatch patch=CardstackRecordScreenCapability.canonicalize(context('Old'),definition(),new List<CardstackOpportunityEditTypes.FieldChange>{change('Description','clear',null)}); Test.stopTest();
  Assert.isTrue(patch.typedValues.containsKey('Description'),'Clear must be explicit.'); Assert.isNull(patch.typedValues.get('Description'),'Clear must bind null.');
  }
 }
 @IsTest static void shouldCompleteNoChangesWithoutPatch() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
  Test.startTest(); CardstackOpportunityEditTypes.CanonicalPatch patch=CardstackRecordScreenCapability.canonicalize(context('Old'),definition(),new List<CardstackOpportunityEditTypes.FieldChange>{change('LastName','set','Original')}); Test.stopTest(); Assert.areEqual(0,patch.entries.size(),'Equivalent values cannot authorize a write.');
  }
 }
 private static void denied(String code,CardstackOpportunityEditTypes.RecordContext current,List<CardstackOpportunityEditTypes.FieldChange> answers) {
  Test.startTest(); try { CardstackRecordScreenCapability.canonicalize(current,definition(),answers); Assert.fail('Expected '+code); } catch(CardstackOpportunityEditDomain.ValidationException error) { Assert.areEqual(code,error.getMessage(),'Exact bounded denial.'); } Test.stopTest();
 }
 @IsTest static void shouldRejectUncheckedBoolean() {
  System.runAs(new User(Id=UserInfo.getUserId())) { denied('INVALID_BOOLEAN',context('Old'),new List<CardstackOpportunityEditTypes.FieldChange>{change('HasOptedOutOfEmail','set','TRUE')});
  }
 }
 @IsTest static void shouldRejectFalseLikeBoolean() {
  System.runAs(new User(Id=UserInfo.getUserId())) { denied('INVALID_BOOLEAN',context('Old'),new List<CardstackOpportunityEditTypes.FieldChange>{change('HasOptedOutOfEmail','set','anything')});
  }
 }
 @IsTest static void shouldRejectRequiredClear() {
  System.runAs(new User(Id=UserInfo.getUserId())) { denied('CLEAR_NOT_ALLOWED',context('Old'),new List<CardstackOpportunityEditTypes.FieldChange>{change('LastName','clear',null)});
  }
 }
 @IsTest static void shouldRejectRequiredBlank() {
  System.runAs(new User(Id=UserInfo.getUserId())) { denied('FIELD_REQUIRED',context('Old'),new List<CardstackOpportunityEditTypes.FieldChange>{change('LastName','set',' ')});
  }
 }
 @IsTest static void shouldRejectLongCurrentBeforeReview() {
  System.runAs(new User(Id=UserInfo.getUserId())) { denied('CURRENT_VALUE_UNAVAILABLE',context('x'.repeat(4097)),new List<CardstackOpportunityEditTypes.FieldChange>());
  }
 }
 @IsTest static void shouldRejectLongNewText() {
  System.runAs(new User(Id=UserInfo.getUserId())) { denied('TEXT_TOO_LONG',context('Old'),new List<CardstackOpportunityEditTypes.FieldChange>{change('Description','set','x'.repeat(4097))});
  }
 }
 @IsTest static void shouldRejectInjectedField() {
  System.runAs(new User(Id=UserInfo.getUserId())) { denied('UNKNOWN_FIELD',context('Old'),new List<CardstackOpportunityEditTypes.FieldChange>{change('Name','set','Injected')});
  }
 }
 @IsTest static void shouldRejectDuplicateAnswer() {
  System.runAs(new User(Id=UserInfo.getUserId())) { denied('DUPLICATE_FIELD',context('Old'),new List<CardstackOpportunityEditTypes.FieldChange>{change('Description','set','First'),change('Description','set','Second')});
  }
 }
 @IsTest static void shouldRejectClearWithValue() {
  System.runAs(new User(Id=UserInfo.getUserId())) { denied('INVALID_OPERATION',context('Old'),new List<CardstackOpportunityEditTypes.FieldChange>{change('Description','clear','Injected')});
  }
 }
 private static void invalidShape(String code,String replacement) {
  CardstackRecordScreenCapability.Definition d=definition(); d.action.mappings[0].fieldApi=replacement; Test.startTest();
  try { CardstackRecordScreenCapability.validateShape('Contact',d.action); Assert.fail('Expected '+code); } catch(CardstackOpportunityActionPolicy.PolicyException error) { Assert.areEqual(code,error.getMessage(),'Bounded candidate denial.'); } Test.stopTest();
 }
 @IsTest static void shouldRejectDuplicateConfiguredField() {
  System.runAs(new User(Id=UserInfo.getUserId())) { invalidShape('INVALID_PRESET','Description');
  }
 }
 @IsTest static void shouldRejectUnsupportedConfiguredField() {
  System.runAs(new User(Id=UserInfo.getUserId())) { invalidShape('UNSUPPORTED_FIELD_TYPE','AccountId');
  }
 }
 @IsTest static void shouldRejectNoncanonicalConfiguredField() {
  System.runAs(new User(Id=UserInfo.getUserId())) { invalidShape('UNKNOWN_FIELD','lastname');
  }
 }
 @IsTest static void shouldRejectNonCurrentMapping() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
  CardstackRecordScreenCapability.Definition d=definition(); d.action.mappings[0].source='constant'; Test.startTest(); try { CardstackRecordScreenCapability.validateShape('Contact',d.action); Assert.fail('Expected invalid shape.'); } catch(CardstackOpportunityActionPolicy.PolicyException error) { Assert.areEqual('INVALID_PRESET',error.getMessage(),'Current-only capability.'); } Test.stopTest();
  }
 }
 @IsTest static void shouldRejectOmittedPublishedField() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
  CardstackRecordScreenCapability.Definition d=definition(); d.published.fields.remove('Description'); Test.startTest(); try { CardstackRecordScreenCapability.validate('Contact',d.action,d.published); Assert.fail('Expected missing published field.'); } catch(CardstackOpportunityActionPolicy.PolicyException error) { Assert.areEqual('FIELD_NOT_EDITABLE',error.getMessage(),'Published exposure mandatory.'); } Test.stopTest();
  }
 }
 @IsTest static void shouldValidateStudioDescriptionCandidate() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
  Test.startTest(); CardstackRecordScreenCapability.validateLayout('layout:Contact:default',CardstackRecordEditTestData.layout()); Test.stopTest();
  }
 }
 @IsTest static void shouldProjectPublishedSectionsWithoutDisplayOnlyName() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
  CardstackConnectionAccess.userOverride=true;
  String raw=CardstackRecordEditTestData.layout(); Map<String,Object> body=(Map<String,Object>)JSON.deserializeUntyped(raw);
  body.put('sections',new List<Object>{new Map<String,Object>{'label'=>'Identity','columns'=>1,'fields'=>new List<Object>{new Map<String,Object>{'api'=>'Name'},new Map<String,Object>{'api'=>'LastName','editable'=>true}}},new Map<String,Object>{'label'=>'Preferences','columns'=>2,'fields'=>new List<Object>{new Map<String,Object>{'api'=>'Description','editable'=>true},new Map<String,Object>{'api'=>'HasOptedOutOfEmail','editable'=>true}}}});
  insert as system new Cardstack_Config__c(Name='layout:Contact:default',Is_Active__c=true,Value__c=JSON.serialize(body));
  Test.startTest(); CardstackRecordScreenCapability.Definition d=CardstackRecordScreenCapability.resolveDefinition('edit_contact'); Test.stopTest(); List<Object> sections=(List<Object>)d.layout.get('sections'); Assert.areEqual(2,sections.size(),'Published sections retained.'); Assert.areEqual(new List<String>{'LastName'},((Map<String,Object>)sections[0]).get('fields'),'Display-only Name cannot enter action layout.'); Assert.areEqual('Preferences',((Map<String,Object>)sections[1]).get('label'),'Checked label retained.');
  }
 }
 @IsTest static void shouldRejectUnknownAndDuplicateLayoutReferences() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   CardstackConnectionAccess.userOverride=true;
   for(String field:new List<String>{'Unknown__c','LastName'}) {
    Map<String,Object> body=(Map<String,Object>)JSON.deserializeUntyped(CardstackRecordEditTestData.layout());
    body.put('sections',new List<Object>{new Map<String,Object>{'label'=>'Identity','columns'=>1,'fields'=>new List<Object>{new Map<String,Object>{'api'=>'LastName','editable'=>true},new Map<String,Object>{'api'=>field,'editable'=>true}}},new Map<String,Object>{'label'=>'Preferences','columns'=>2,'fields'=>new List<Object>{new Map<String,Object>{'api'=>'Description','editable'=>true},new Map<String,Object>{'api'=>'HasOptedOutOfEmail','editable'=>true}}}});
    try { CardstackRecordScreenCapability.validateLayout('layout:Contact:default',JSON.serialize(body)); Assert.fail('Malformed layout must fail closed.'); }
    catch(CardstackOpportunityActionPolicy.PolicyException error) { Assert.areEqual('INVALID_LAYOUT',error.getMessage(),'Unknown and duplicate references cannot be silently omitted.'); }
   }
  }
 }
 private static CardstackRecordScreenCapability.Definition dateDefinition() {
  CardstackRecordScreenCapability.Definition base=definition();
  CardstackRecordActionService.Mapping mapping=new CardstackRecordActionService.Mapping(); mapping.fieldApi='Birthdate'; mapping.source='current'; base.action.mappings.add(mapping);
  CardstackPolicyService.FieldPolicy field=new CardstackPolicyService.FieldPolicy(); field.apiName='Birthdate'; field.readOnly=false; base.published.fields.put(field.apiName,field);
  return CardstackRecordScreenCapability.definition(base.action,base.published);
 }
 @IsTest static void shouldCanonicalizeExactNativeCalendarDate() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   CardstackOpportunityEditTypes.RecordContext current=context('Before'); current.record.put('Birthdate',Date.newInstance(2026,1,1));
   Test.startTest(); CardstackOpportunityEditTypes.CanonicalPatch patch=CardstackRecordScreenCapability.canonicalize(current,dateDefinition(),new List<CardstackOpportunityEditTypes.FieldChange>{change('Birthdate','set','2028-02-29')}); Test.stopTest();
   Assert.areEqual(Date.newInstance(2028,2,29),patch.typedValues.get('Birthdate'),'Calendar values are native Date objects.');
   Assert.areEqual('2028-02-29',patch.entries[0].newValue,'Calendar wire values are exact scalar strings.');
  }
 }
 @IsTest static void shouldRejectInvalidNativeLeapDate() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   CardstackOpportunityEditTypes.RecordContext current=context('Before'); current.record.put('Birthdate',Date.newInstance(2026,1,1));
   Test.startTest();
   try { CardstackRecordScreenCapability.canonicalize(current,dateDefinition(),new List<CardstackOpportunityEditTypes.FieldChange>{change('Birthdate','set','2027-02-29')}); Assert.fail('Invalid calendar date cannot round forward.'); }
   catch(CardstackOpportunityEditDomain.ValidationException error) { Assert.areEqual('INVALID_DATE',error.getMessage(),'Exact native date rejection.'); }
   Test.stopTest();
  }
 }

 @IsTest static void shouldRestoreReadonlyContactSnapshotValues() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Contact record=new Contact(LastName='Snapshot',HasOptedOutOfEmail=false); insert record;
   Contact original=[SELECT Id,Name,LastName,Description,HasOptedOutOfEmail,Birthdate,SystemModstamp FROM Contact WHERE Id=:record.Id WITH USER_MODE];
   Map<String,Object> snapshot=(Map<String,Object>)JSON.deserializeUntyped(JSON.serialize(original));
   snapshot.put('Description',null); snapshot.put('Birthdate',null);
   CardstackOpportunityEditTypes.StoredState state=new CardstackOpportunityEditTypes.StoredState();
   state.objectApiName='Contact'; state.recordId=CardstackConnectionTypes.normalizeId(String.valueOf(record.Id));
   Test.startTest(); SObject restored=CardstackRecordScreenCapability.restoreRecord(state,snapshot); Test.stopTest();
   Assert.areEqual(Contact.SObjectType,restored.getSObjectType(),'Only the record-derived native type restores the snapshot.');
   Assert.areEqual(state.recordId,CardstackConnectionTypes.normalizeId(String.valueOf(restored.Id)),'The full snapshot identity is retained.');
   Assert.areEqual(original.Name,restored.get('Name'),'Readonly compound Name remains available for freshness.');
   Assert.areEqual(original.SystemModstamp,restored.get('SystemModstamp'),'Readonly native timestamp remains typed and exact.');
   Assert.isTrue(restored.get('SystemModstamp') instanceof Datetime,'Native snapshot timestamps remain Datetime values.');
   Assert.areEqual(false,restored.get('HasOptedOutOfEmail'),'Native restoration preserves Boolean false.');
   Assert.isNull(restored.get('Description'),'An explicit snapshot null remains null.');
   Assert.isNull(restored.get('Birthdate'),'An explicit Date null remains null.');
  }
 }
 @IsTest static void shouldRejectSnapshotBooleanCoercion() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Contact record=new Contact(LastName='Snapshot',HasOptedOutOfEmail=false); insert record;
   CardstackOpportunityEditTypes.StoredState state=new CardstackOpportunityEditTypes.StoredState();
   state.objectApiName='Contact'; state.recordId=CardstackConnectionTypes.normalizeId(String.valueOf(record.Id));
   Map<String,Object> snapshot=new Map<String,Object>{'Id'=>state.recordId,'HasOptedOutOfEmail'=>'false'};
   Test.startTest();
   try { CardstackRecordScreenCapability.restoreRecord(state,snapshot); Assert.fail('Native JSON coercion cannot replace snapshot scalar validation.'); }
   catch(CardstackOpportunityEditRepository.RepositoryException error) { Assert.areEqual('INVALID_STATE',error.getMessage(),'Snapshot Boolean values must already be native Boolean values.'); }
   Test.stopTest();
  }
 }

}
