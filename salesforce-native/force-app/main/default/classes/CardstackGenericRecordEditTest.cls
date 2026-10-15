/** Generic Account contracts exercise the shared engine. Native execution is a separate gate. */
@IsTest private with sharing class CardstackGenericRecordEditTest {
 @TestSetup static void permissions() {
  CardstackOpportunityEditTestData.grantCurrentActorPackageRead();
  CardstackRecordEditTestData.grantCurrentActorAccountAccess();
  CardstackRecordEditTestData.grantCurrentActorAdmin();
 }
 private static CardstackOpportunityEditTypes.Envelope open(Account record) { return CardstackOpportunityEditService.startRecord('claude',record.Id,'configured'); }
 private static CardstackOpportunityEditTypes.Envelope review(CardstackOpportunityEditTypes.Envelope opened) {
  CardstackOpportunityEditTypes.TransitionRequest request=CardstackRecordEditTestData.request(opened,'review');
  request.changes=new List<CardstackOpportunityEditTypes.FieldChange>{CardstackRecordEditTestData.change('NumberOfEmployees','set','0'),CardstackRecordEditTestData.change('Name','set','Reviewed account'),CardstackRecordEditTestData.change('Description','clear',null)};
  return CardstackRecordEditTestData.transition(request);
 }
 @IsTest static void shouldSaveConfigurationOnlyAccountAndReplayOnce() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Account record=CardstackRecordEditTestData.accountFixture();
   CardstackOpportunityEditTypes.Envelope opened=open(record);
   Assert.areEqual('Account',opened.view.objectApiName,'Object comes from native record identity.');
   Assert.areEqual('NumberOfEmployees',opened.view.fields[0].fieldApi,'Mapping order owns inputs.');
   Assert.areEqual('INTEGER',opened.view.fields[0].dataType,'Native descriptor supports integer.');
   Assert.areEqual('Configured details',((Map<String,Object>)((List<Object>)opened.view.layout.get('sections'))[0]).get('label'),'Published layout survives projection.');
   CardstackOpportunityEditTypes.Envelope reviewed=review(opened);
   Assert.areEqual('Review',reviewed.view.status,'Shared review precedes write.');
   Test.startTest();
   CardstackOpportunityEditTypes.Envelope completed=CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(reviewed,'confirm'));
   Integer rows=Limits.getDmlRows();
   CardstackOpportunityEditTypes.Envelope replay=CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(reviewed,'confirm'));
   Assert.areEqual(rows,Limits.getDmlRows(),'Consumed replay adds no rows.');
   Test.stopTest();
   Account saved=[SELECT Name,Description,NumberOfEmployees FROM Account WHERE Id=:record.Id WITH USER_MODE];
   Assert.areEqual('Completed',completed.view.status,'One shared writer completes.');
   Assert.areEqual('Reviewed account',saved.Name,'Native Name is editable by configuration.');
   Assert.areEqual(0,saved.NumberOfEmployees,'Integer zero stays typed.'); Assert.isNull(saved.Description,'Explicit clear is native null.');
   Assert.areEqual(JSON.serialize(completed.view.receipt),JSON.serialize(replay.view.receipt),'Original receipt replays.');
   Assert.areEqual(1,[SELECT count() FROM Cardstack_Audit_Log__c WITH SYSTEM_MODE],'Required generic audit once.');
  }
 }
 @IsTest static void shouldRollbackGenericAccountWhenAuditFails() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Account record=CardstackRecordEditTestData.accountFixture(); CardstackOpportunityEditTypes.Envelope reviewed=review(open(record));
   String before=CardstackRecordEditTestData.interaction().State__c; CardstackOpportunityWriteAudit.failAppend=true;
   Test.startTest(); CardstackRecordEditTestData.denied(CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(reviewed,'confirm')),'SAVE_UNAVAILABLE'); Test.stopTest();
   Assert.areEqual('Configured account',[SELECT Name FROM Account WHERE Id=:record.Id WITH USER_MODE].Name,'CRM rolls back with required audit.');
   Assert.areEqual(before,CardstackRecordEditTestData.interaction().State__c,'Review remains unconsumed.');
   Assert.areEqual(0,[SELECT count() FROM Cardstack_Audit_Log__c WITH SYSTEM_MODE],'Audit rollback leaves no partial row.');
  }
 }
 @IsTest static void shouldRejectForgedSnapshotType() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Account record=CardstackRecordEditTestData.accountFixture(); CardstackOpportunityEditTypes.Envelope opened=open(record);
   Cardstack_Interaction__c row=CardstackRecordEditTestData.interaction(); Map<String,Object> state=(Map<String,Object>)JSON.deserializeUntyped(row.State__c);
   Map<String,Object> snapshot=(Map<String,Object>)((Map<String,Object>)state.get('initialRecord')).get('record');
   snapshot.put('attributes',new Map<String,Object>{'type'=>'Contact'}); row.State__c=JSON.serialize(state); update as system row;
   Test.startTest(); CardstackRecordEditTestData.denied(CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(opened,'resume')),'INVALID_STATE'); Test.stopTest();
   Assert.areEqual(0,[SELECT count() FROM Cardstack_Audit_Log__c WITH SYSTEM_MODE],'Forged type never writes.');
  }
 }
 @IsTest static void shouldRejectIntegerFractionsExponentsAndBounds() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Account record=CardstackRecordEditTestData.accountFixture(); CardstackRecordScreenCapability.Definition definition=CardstackRecordScreenCapability.resolveDefinition(record.Id,'configured');
   CardstackOpportunityEditTypes.RecordContext current=CardstackRecordScreenCapability.readContext(record.Id,definition,false);
   Test.startTest();
   for(String literal:new List<String>{'0.5','1e3','2147483648','-2147483649','99999999999999999999'}) {
    try { CardstackRecordScreenCapability.canonicalize(current,definition,new List<CardstackOpportunityEditTypes.FieldChange>{CardstackRecordEditTestData.change('NumberOfEmployees','set',literal)}); Assert.fail('Native integer bounds must reject.'); }
    catch(CardstackOpportunityEditDomain.ValidationException error) { Assert.isTrue(new Set<String>{'INVALID_INTEGER','NUMBER_PRECISION','INTEGER_RANGE'}.contains(error.getMessage()),'Typed bounded integer denial.'); }
   }
   Test.stopTest();
  }
 }
 @IsTest static void shouldAcceptSignedIntegerEndpointsWithNativeTypedValues() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Account record=CardstackRecordEditTestData.accountFixture(); CardstackRecordScreenCapability.Definition definition=CardstackRecordScreenCapability.resolveDefinition(record.Id,'configured');
   CardstackOpportunityEditTypes.RecordContext current=CardstackRecordScreenCapability.readContext(record.Id,definition,false);
   Test.startTest();
   for(String literal:new List<String>{'2147483647','-2147483648','0'}) {
    CardstackOpportunityEditTypes.CanonicalPatch patch=CardstackRecordScreenCapability.canonicalize(current,definition,new List<CardstackOpportunityEditTypes.FieldChange>{CardstackRecordEditTestData.change('NumberOfEmployees','set',literal)});
    Assert.areEqual(literal,patch.entries[0].newValue,'Signed int32 endpoints retain their exact scalar value.');
    Assert.isTrue(patch.typedValues.get('NumberOfEmployees') instanceof Integer,'INTEGER answers remain native Integer values.');
   }
   Test.stopTest();
  }
 }
 @IsTest static void shouldQualifyPublicIntegerWithoutChangingRawNativeMetadata() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Account record=CardstackRecordEditTestData.accountFixture(); CardstackRecordScreenCapability.Definition definition=CardstackRecordScreenCapability.resolveDefinition(record.Id,'configured');
   CardstackOpportunityEditTypes.RecordContext current=CardstackRecordScreenCapability.readContext(record.Id,definition,false);
   Integer nativePrecision=Account.NumberOfEmployees.getDescribe().getPrecision();
   String before=JSON.serialize(definition.descriptors),fingerprint=definition.fingerprint;
   Test.startTest(); List<CardstackOpportunityEditTypes.FieldView> fields=CardstackRecordScreenCapability.describeFields(definition,current);
   Map<String,Object> eligibility=CardstackRecordScreenCapability.describeEligibility('Account'); Test.stopTest();
   Integer expectedPrecision=nativePrecision;
   if(nativePrecision==0) expectedPrecision=10;
   Assert.areEqual(expectedPrecision,fields[0].precision,'Unspecified native INTEGER precision is qualified for the signed-int32 codec.');
   Assert.areEqual(nativePrecision,definition.descriptors[0].precision,'Fingerprinted descriptors preserve raw native precision.');
   Assert.areEqual(before,JSON.serialize(definition.descriptors),'Public projection cannot mutate native descriptor membership or bounds.');
   Assert.areEqual(fingerprint,definition.fingerprint,'Public codec projection cannot rewrite the pinned fingerprint.');
   for(Map<String,Object> field:(List<Map<String,Object>>)eligibility.get('fields')) if('NumberOfEmployees'.equals(field.get('fieldApi'))) Assert.areEqual(nativePrecision,field.get('precision'),'Studio eligibility keeps the raw native metadata.');
  }
 }
 @IsTest static void shouldRestorePersistedAccountIntegerValueAndFreshness() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Account record=CardstackRecordEditTestData.accountFixture(); CardstackOpportunityEditTypes.Envelope opened=open(record);
   Assert.areEqual('Editing',opened.view.status,'Nonzero Account integer starts through the shared engine.');
   Map<String,Object> stored=(Map<String,Object>)JSON.deserializeUntyped(CardstackRecordEditTestData.interaction().State__c);
   String originalFreshness=(String)((Map<String,Object>)stored.get('initialRecord')).get('freshness');
   Test.startTest(); CardstackOpportunityEditRepository.LockedInteraction restored=CardstackOpportunityEditRepository.lockOwned('claude',opened.interactionKey);
   CardstackRecordScreenCapability.Definition definition=CardstackRecordScreenCapability.resolveDefinition(restored.state);
   CardstackOpportunityEditTypes.RecordContext current=CardstackRecordScreenCapability.readContext(record.Id,definition,false);
   Test.stopTest();
   Object count=restored.state.initialRecord.record.get('NumberOfEmployees');
   Assert.isTrue(count instanceof Integer,'Persisted INTEGER restores into native Integer identity.');
   Assert.areEqual(5,count,'Restoration retains the original nonzero native value.');
   Assert.areEqual(originalFreshness,restored.state.initialRecord.freshness,'Restoration preserves the original freshness binding.');
   Assert.areEqual(current.freshness,restored.state.initialRecord.freshness,'Restored typed snapshot and current USER_MODE read retain matching freshness.');
  }
 }
 @IsTest static void shouldDescribeNativeEligibilityWithoutPublishedExecution() {
  Test.startTest(); Map<String,Object> descriptor=CardstackRecordScreenCapability.describeEligibility('Account'); Test.stopTest();
  Assert.areEqual('record-edit-eligibility/v1',descriptor.get('contractVersion'),'Versioned native catalog.');
  Assert.areEqual('Account',descriptor.get('objectApiName'),'Canonical object.');
  Map<String,Object> employees; for(Map<String,Object> field:(List<Map<String,Object>>)descriptor.get('fields')) if('NumberOfEmployees'.equals(field.get('fieldApi'))) employees=field;
  Assert.areEqual(true,employees.get('eligible'),'Integer is a native candidate.');
  Assert.isFalse(descriptor.containsKey('editEnabled'),'Metadata description grants no execution rights.');
 }
 @IsTest static void shouldRejectSetupGovernanceAndNoncanonicalObjects() {
  Test.startTest();
  for(String objectApi:new List<String>{'User','Group','Profile','PermissionSet','Cardstack_Config__c','account'}) {
   Map<String,Object> descriptor=CardstackRecordScreenCapability.describeEligibility(objectApi);
   Assert.areEqual(false,descriptor.get('eligible'),'Explicit native catalog denies unsupported identities.');
  }
  Test.stopTest();
 }
 @IsTest static void shouldRejectOmittedRequiredFinalRecordAndRequiredClear() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Account record=CardstackRecordEditTestData.accountFixture(); CardstackRecordScreenCapability.Definition definition=CardstackRecordScreenCapability.resolveDefinition(record.Id,'configured');
   CardstackOpportunityEditTypes.RecordContext current=CardstackRecordScreenCapability.readContext(record.Id,definition,false);
   Test.startTest();
   try { CardstackRecordScreenCapability.canonicalize(current,definition,new List<CardstackOpportunityEditTypes.FieldChange>{CardstackRecordEditTestData.change('Name','clear',null)}); Assert.fail('Required native Name cannot clear.'); }
   catch(CardstackOpportunityEditDomain.ValidationException error) { Assert.areEqual('CLEAR_NOT_ALLOWED',error.getMessage(),'Native required constraint applies.'); }
   current.record.put('Name',' ');
   try { CardstackRecordScreenCapability.canonicalize(current,definition,new List<CardstackOpportunityEditTypes.FieldChange>()); Assert.fail('Omission cannot bypass final-record required fields.'); }
   catch(CardstackOpportunityEditDomain.ValidationException error) { Assert.areEqual('FIELD_REQUIRED',error.getMessage(),'Final record is checked, including kept fields.'); }
   Test.stopTest();
  }
 }
 @IsTest static void shouldRejectCopiedFreshnessWithForgedSnapshotValue() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Account record=CardstackRecordEditTestData.accountFixture(); CardstackOpportunityEditTypes.Envelope opened=open(record);
   Cardstack_Interaction__c row=CardstackRecordEditTestData.interaction(); Map<String,Object> state=(Map<String,Object>)JSON.deserializeUntyped(row.State__c);
   ((Map<String,Object>)((Map<String,Object>)state.get('initialRecord')).get('record')).put('Name','Forged baseline'); row.State__c=JSON.serialize(state); update as system row;
   Test.startTest(); CardstackRecordEditTestData.denied(CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(opened,'resume')),'INVALID_STATE'); Test.stopTest();
   Assert.areEqual(0,[SELECT count() FROM Cardstack_Audit_Log__c WITH SYSTEM_MODE],'Freshness is recomputed from the actual retained projection.');
  }
 }
 @IsTest static void shouldRejectPublishedReadOnlyDriftBeforeWrite() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Account record=CardstackRecordEditTestData.accountFixture(); CardstackOpportunityEditTypes.Envelope reviewed=review(open(record));
   Cardstack_Config__c row=[SELECT Id,Value__c FROM Cardstack_Config__c WHERE Name='layout:Account:default' WITH SYSTEM_MODE LIMIT 1];
   row.Value__c=row.Value__c.replace('"api":"NumberOfEmployees","editable":true','"api":"NumberOfEmployees","editable":false'); update as system row;
   Test.startTest(); CardstackRecordEditTestData.denied(CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(reviewed,'confirm')),'FIELD_NOT_EDITABLE'); Test.stopTest();
   Assert.areEqual('Configured account',[SELECT Name FROM Account WHERE Id=:record.Id WITH USER_MODE].Name,'Published policy only narrows rights.');
  }
 }
 @IsTest static void shouldCanonicalizeExactNativeCurrencyWithoutRounding() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Account record=CardstackRecordEditTestData.accountFixture(); CardstackRecordScreenCapability.Definition base=CardstackRecordScreenCapability.resolveDefinition(record.Id,'configured');
   CardstackRecordActionService.Mapping mapping=new CardstackRecordActionService.Mapping(); mapping.fieldApi='AnnualRevenue'; mapping.source='current'; base.action.mappings.add(mapping);
   CardstackPolicyService.FieldPolicy field=new CardstackPolicyService.FieldPolicy(); field.apiName='AnnualRevenue'; field.readOnly=false; base.published.fields.put(field.apiName,field);
   CardstackRecordScreenCapability.Definition definition=CardstackRecordScreenCapability.definition(base.action,base.published);
   CardstackOpportunityEditTypes.RecordContext current=CardstackRecordScreenCapability.readContext(record.Id,definition,false);
   Test.startTest();
   CardstackOpportunityEditTypes.CanonicalPatch patch=CardstackRecordScreenCapability.canonicalize(current,definition,new List<CardstackOpportunityEditTypes.FieldChange>{CardstackRecordEditTestData.change('AnnualRevenue','set','9007199254740993')});
   try { CardstackRecordScreenCapability.canonicalize(current,definition,new List<CardstackOpportunityEditTypes.FieldChange>{CardstackRecordEditTestData.change('AnnualRevenue','set','1.'+'1'.repeat(Account.AnnualRevenue.getDescribe().getScale()+1))}); Assert.fail('Nonzero excess scale cannot round.'); }
   catch(CardstackOpportunityEditDomain.ValidationException error) { Assert.areEqual('NUMBER_SCALE',error.getMessage(),'Native scale is authoritative.'); }
   Test.stopTest();
   Assert.areEqual(Decimal.valueOf('9007199254740993'),patch.typedValues.get('AnnualRevenue'),'No JavaScript Number participates in currency.');
   Assert.areEqual('9007199254740993',patch.entries[0].newValue,'Exact currency wire string.');
   Assert.isNotNull(current.currencyCode,'Native record/default currency is freshness-bound.');
  }
 }
 private static void currencyJourney(String before,String beforeDisplay,String after) {
  Opportunity record=CardstackRecordEditTestData.genericOpportunityFixture(before);
  CardstackOpportunityEditTypes.Envelope opened=CardstackOpportunityEditService.startRecord('claude',record.Id,'generic_forecast');
  Assert.areEqual('Editing',opened.view.status,'Non-null queried native currency starts.');
  CardstackOpportunityEditTypes.Envelope restored=CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(opened,'resume'));
  Assert.areEqual('Editing',restored.view.status,'Persisted native decimal identity restores without copied freshness.');
  CardstackOpportunityEditTypes.TransitionRequest request=CardstackRecordEditTestData.request(restored,'review');
  request.changes=new List<CardstackOpportunityEditTypes.FieldChange>{CardstackRecordEditTestData.change('Amount','set',after)};
  CardstackOpportunityEditTypes.Envelope reviewed=CardstackRecordEditTestData.transition(request);
  Assert.areEqual('Review',reviewed.view.status,'Exact fractional currency reaches native review.');
  Assert.areEqual(beforeDisplay,reviewed.view.diff[0].beforeValue,'Canonical review display preserves the native value.');
  Test.startTest();
  CardstackOpportunityEditTypes.Envelope completed=CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(reviewed,'confirm'));
  Assert.areEqual('Completed',completed.view.status,'Restored currency review confirms.');
  Integer rows=Limits.getDmlRows();
  CardstackOpportunityEditTypes.Envelope replay=CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(reviewed,'confirm'));
  Assert.areEqual(rows,Limits.getDmlRows(),'Consumed currency replay writes nothing.'); Test.stopTest();
  Assert.areEqual(JSON.serialize(completed.view.receipt),JSON.serialize(replay.view.receipt),'Currency completion replays the exact original receipt.');
  Assert.areEqual(Decimal.valueOf(after),[SELECT Amount FROM Opportunity WHERE Id=:record.Id WITH USER_MODE].Amount,'Exact fractional native read-back.');
  Assert.areEqual(1,[SELECT count() FROM Cardstack_Audit_Log__c WHERE Tool_Name__c='cardstack_record_edit_transition' WITH SYSTEM_MODE],'One required CRM audit, independent of publication audit.');
 }
 @IsTest static void shouldPersistRestoreAndReplayCurrencyTenPointZeroZero() {
  System.runAs(new User(Id=UserInfo.getUserId())) { currencyJourney('10.00','10','10.50'); }
 }
 @IsTest static void shouldPersistRestoreAndReplayCurrencyOnePointTwoZero() {
  System.runAs(new User(Id=UserInfo.getUserId())) { currencyJourney('1.20','1.2','1.25'); }
 }
 @IsTest static void shouldPersistRestoreAndReplayCurrencyZeroPointZeroZero() {
  System.runAs(new User(Id=UserInfo.getUserId())) { currencyJourney('0.00','0','0.50'); }
 }
 @IsTest static void shouldPersistRestoreAndReplayExactFractionalCurrency() {
  System.runAs(new User(Id=UserInfo.getUserId())) { currencyJourney('123.45','123.45','678.91'); }
 }
 @IsTest static void shouldRejectForgedCurrencySnapshotWithCopiedFreshness() {
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Opportunity record=CardstackRecordEditTestData.genericOpportunityFixture('1.20');
   CardstackOpportunityEditTypes.Envelope opened=CardstackOpportunityEditService.startRecord('claude',record.Id,'generic_forecast');
   Cardstack_Interaction__c row=CardstackRecordEditTestData.interaction(); Map<String,Object> state=(Map<String,Object>)JSON.deserializeUntyped(row.State__c);
   ((Map<String,Object>)((Map<String,Object>)state.get('initialRecord')).get('record')).put('Amount',Decimal.valueOf('1.21')); row.State__c=JSON.serialize(state); update as system row;
   Test.startTest(); CardstackRecordEditTestData.denied(CardstackRecordEditTestData.transition(CardstackRecordEditTestData.request(opened,'resume')),'INVALID_STATE'); Test.stopTest();
   Assert.areEqual(Decimal.valueOf('1.20'),[SELECT Amount FROM Opportunity WHERE Id=:record.Id WITH USER_MODE].Amount,'Changed snapshot plus copied hash cannot write.');
  }
 }
}
