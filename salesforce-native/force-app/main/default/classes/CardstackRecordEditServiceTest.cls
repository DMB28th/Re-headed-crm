@IsTest private class CardstackRecordEditServiceTest {
 @TestSetup static void setup() {
  PermissionSet ps=[SELECT Id FROM PermissionSet WHERE Name='Cardstack_Admin' LIMIT 1];
  if ([SELECT count() FROM PermissionSetAssignment WHERE AssigneeId=:UserInfo.getUserId() AND PermissionSetId=:ps.Id]==0) insert new PermissionSetAssignment(AssigneeId=UserInfo.getUserId(),PermissionSetId=ps.Id);
  System.runAs(new User(Id=UserInfo.getUserId())) { insert new Cardstack_Config__c(Name='layout:Account:default',Is_Active__c=true,Value__c='{ "permissions":{"writeEnabled":true},"fields":[{"api":"Description","editable":true},{"api":"NumberOfEmployees","editable":true},{"api":"Name","readOnly":true}]}'); }
 }
 @IsTest static void retainedAnswersReviewConfirmAndReplay() { System.runAs(new User(Id=UserInfo.getUserId())) {
  Account a=new Account(Name='Native steps',Description='old',NumberOfEmployees=5);insert a;
  CardstackRecordEditService.View v=CardstackRecordEditService.start(a.Id);
  System.assertEquals('Description',v.fieldApi,'First published supported editable field');
  v=CardstackRecordEditService.advance(v.key,v.revision,'answer','café "quoted"',null);
  System.assertEquals('NumberOfEmployees',v.fieldApi);
  v=CardstackRecordEditService.advance(v.key,v.revision,'answer','0',null);System.assertEquals('Review',v.status);
  System.assertEquals('old',[SELECT Description FROM Account WHERE Id=:a.Id].Description);
  String key=v.key;Integer rev=v.revision;String grant=v.confirmToken;
  v=CardstackRecordEditService.advance(key,rev,'confirm',null,grant);System.assertEquals('Completed',v.status);
  Account saved=[SELECT Description,NumberOfEmployees FROM Account WHERE Id=:a.Id];System.assertEquals('café "quoted"',saved.Description);System.assertEquals(0,saved.NumberOfEmployees);
  Integer audits=[SELECT count() FROM Cardstack_Audit_Log__c WHERE Record_Id__c=:a.Id];
  System.assertEquals('Completed',CardstackRecordEditService.advance(key,rev,'confirm',null,grant).status);
  System.assertEquals(audits,[SELECT count() FROM Cardstack_Audit_Log__c WHERE Record_Id__c=:a.Id]);
 } }
 @IsTest static void invalidNumberBackAndCancelNeverSave() { System.runAs(new User(Id=UserInfo.getUserId())) {
  Account a=new Account(Name='Cancel steps',Description='old',NumberOfEmployees=5);insert a;
  CardstackRecordEditService.View v=CardstackRecordEditService.start(a.Id);
  v=CardstackRecordEditService.advance(v.key,v.revision,'answer','new',null);Integer before=v.revision;
  v=CardstackRecordEditService.advance(v.key,v.revision,'answer','0.5',null);System.assertNotEquals(null,v.error);System.assertEquals(before,v.revision);
  v=CardstackRecordEditService.advance(v.key,v.revision,'back',null,null);System.assertEquals('new',v.value);
  v=CardstackRecordEditService.advance(v.key,v.revision,'cancel',null,null);System.assertEquals('Cancelled',v.status);
  System.assertEquals('old',[SELECT Description FROM Account WHERE Id=:a.Id].Description);
  Boolean denied=false;try { CardstackRecordEditService.advance(v.key,v.revision,'answer','tamper',null); } catch(Exception e) { denied=true; } System.assert(denied);
 } }
 @IsTest static void staleRevisionAndRecordCannotOverwrite() { System.runAs(new User(Id=UserInfo.getUserId())) {
  Account a=new Account(Name='Freshness',Description='old',NumberOfEmployees=5);insert a;
  CardstackRecordEditService.View v=CardstackRecordEditService.start(a.Id);Integer oldRev=v.revision;
  v=CardstackRecordEditService.advance(v.key,v.revision,'answer','new',null);
  Boolean denied=false;try { CardstackRecordEditService.advance(v.key,oldRev,'answer','7',null); } catch(Exception e) { denied=true; }System.assert(denied);
  a.Description='concurrent';update a;denied=false;
  try { CardstackRecordEditService.advance(v.key,v.revision,'answer','0',null); }catch(Exception e){denied=true;}System.assert(denied);
  System.assertEquals('concurrent',[SELECT Description FROM Account WHERE Id=:a.Id].Description);
 } }
 @IsTest static void resumedReviewGetsFreshConfirmation() {System.runAs(new User(Id=UserInfo.getUserId())) {
  Account a=new Account(Name='Resume',Description='old',NumberOfEmployees=5);insert a;
  CardstackRecordEditService.View v=CardstackRecordEditService.start(a.Id);
  v=CardstackRecordEditService.advance(v.key,v.revision,'answer','new',null);
  v=CardstackRecordEditService.advance(v.key,v.revision,'answer','0',null);String oldGrant=v.confirmToken;String oldReference=v.reviewReference;
  v=CardstackRecordEditService.advance(v.key,v.revision,'resume',null,null);
  System.assertNotEquals(null,v.confirmToken,'Resume must return a usable review without storing raw keys');System.assertNotEquals(oldGrant,v.confirmToken);System.assertNotEquals(oldReference,v.reviewReference);
  Boolean denied=false;try {CardstackRecordEditService.advance(v.key,v.revision,'confirm',null,oldGrant);}catch(Exception e){denied=true;}System.assert(denied);
  v=CardstackRecordEditService.advance(v.key,v.revision,'confirm',null,v.confirmToken);System.assertEquals('Completed',v.status);
 } }
 @IsTest static void cancellingReviewInvalidatesLegacyWriteGrant() {System.runAs(new User(Id=UserInfo.getUserId())) {
  Account a=new Account(Name='Cancel review',Description='old',NumberOfEmployees=5);insert a;
  CardstackRecordEditService.View v=CardstackRecordEditService.start(a.Id);
  v=CardstackRecordEditService.advance(v.key,v.revision,'answer','new',null);v=CardstackRecordEditService.advance(v.key,v.revision,'skip',null,null);String grant=v.confirmToken;
  v=CardstackRecordEditService.advance(v.key,v.revision,'cancel',null,null);
  CardstackUpdateRecordAction.UpdateRecordRequest req=new CardstackUpdateRecordAction.UpdateRecordRequest();req.recordId=a.Id;req.confirmToken=grant;
  CardstackPreviewUpdateAction.PatchEntry patch=new CardstackPreviewUpdateAction.PatchEntry();patch.fieldApiName='Description';patch.newValue='new';req.changes=new List<CardstackPreviewUpdateAction.PatchEntry>{patch};
  Boolean denied=false;try{CardstackUpdateRecordAction.updateRecord(new List<CardstackUpdateRecordAction.UpdateRecordRequest>{req});}catch(Exception e){denied=true;}System.assert(denied);
  System.assertEquals('old',[SELECT Description FROM Account WHERE Id=:a.Id].Description);
 } }
 @IsTest static void lostResponseCanResumeLatestState() {System.runAs(new User(Id=UserInfo.getUserId())) {
  Account a=new Account(Name='Lost response',Description='old',NumberOfEmployees=5);insert a;
  CardstackRecordEditService.View original=CardstackRecordEditService.start(a.Id);
  CardstackRecordEditService.advance(original.key,original.revision,'answer','new',null);
  CardstackRecordEditService.View resumed=CardstackRecordEditService.advance(original.key,original.revision,'resume',null,null);
  System.assertEquals('NumberOfEmployees',resumed.fieldApi);System.assertEquals(original.revision+1,resumed.revision);
 } }
 @IsTest static void unchangedAnswersFinishWithoutWrite() {System.runAs(new User(Id=UserInfo.getUserId())) {
  Account a=new Account(Name='Unchanged',Description='old',NumberOfEmployees=5);insert a;
  CardstackRecordEditService.View v=CardstackRecordEditService.start(a.Id);v=CardstackRecordEditService.advance(v.key,v.revision,'answer','old',null);
  v=CardstackRecordEditService.advance(v.key,v.revision,'answer','5',null);System.assertEquals('Cancelled',v.status);System.assertEquals(null,v.confirmToken);
  System.assertEquals(0,[SELECT count() FROM Cardstack_Audit_Log__c WHERE Record_Id__c=:a.Id]);
 } }
 @IsTest static void editableNameUsesUniqueProjection() {System.runAs(new User(Id=UserInfo.getUserId())) {
  Cardstack_Config__c cfg=[SELECT Id,Value__c FROM Cardstack_Config__c WHERE Name='layout:Account:default'];cfg.Value__c=cfg.Value__c.replace('"api":"Name","readOnly":true','"api":"Name","editable":true');update cfg;
  Account a=new Account(Name='Editable name');insert a;
  System.assertEquals('Editing',CardstackRecordEditService.start(a.Id).status);
 } }
 @IsTest static void partialChangeWithUnchangedAnswerStillConfirms() {System.runAs(new User(Id=UserInfo.getUserId())) {
  Account a=new Account(Name='Partial change',Description='old',NumberOfEmployees=5);insert a;
  CardstackRecordEditService.View v=CardstackRecordEditService.start(a.Id);v=CardstackRecordEditService.advance(v.key,v.revision,'answer','new',null);
  v=CardstackRecordEditService.advance(v.key,v.revision,'answer','5',null);v=CardstackRecordEditService.advance(v.key,v.revision,'confirm',null,v.confirmToken);
  System.assertEquals('Completed',v.status);System.assertEquals('new',[SELECT Description FROM Account WHERE Id=:a.Id].Description);
 } }
 @IsTest static void completedInteractionCannotReturnToEditing() {System.runAs(new User(Id=UserInfo.getUserId())) {
  Account a=new Account(Name='Immutable completed',Description='old',NumberOfEmployees=5);insert a;
  CardstackRecordEditService.View v=CardstackRecordEditService.start(a.Id);v=CardstackRecordEditService.advance(v.key,v.revision,'answer','new',null);
  v=CardstackRecordEditService.advance(v.key,v.revision,'answer','0',null);v=CardstackRecordEditService.advance(v.key,v.revision,'confirm',null,v.confirmToken);
  Boolean denied=false;try{CardstackRecordEditService.advance(v.key,v.revision,'back',null,null);}catch(Exception e){denied=true;}System.assert(denied);
 } }
 @IsTest static void expiredAndChangedPolicyRejectAnswers() {System.runAs(new User(Id=UserInfo.getUserId())) {
  Account a=new Account(Name='Expiry policy',Description='old');insert a;
  CardstackRecordEditService.View v=CardstackRecordEditService.start(a.Id);
  Cardstack_Interaction__c row=[SELECT Id,Expires_At__c FROM Cardstack_Interaction__c WITH SYSTEM_MODE LIMIT 1];row.Expires_At__c=Datetime.now().addSeconds(-1);update as system row;
  Boolean denied=false;try{CardstackRecordEditService.advance(v.key,v.revision,'answer','new',null);}catch(Exception e){denied=true;}System.assert(denied);
  v=CardstackRecordEditService.start(a.Id);
  Cardstack_Config__c config=[SELECT Id,Value__c FROM Cardstack_Config__c LIMIT 1];config.Value__c=config.Value__c.replace('"writeEnabled":true','"writeEnabled":false');update config;
  denied=false;try{CardstackRecordEditService.advance(v.key,v.revision,'answer','new',null);}catch(Exception e){denied=true;}System.assert(denied);
  System.assertEquals('old',[SELECT Description FROM Account WHERE Id=:a.Id].Description);
 } }
 @IsTest static void wrongActorAndMissingConfirmationRejectWrite() {System.runAs(new User(Id=UserInfo.getUserId())) {
  Account a=new Account(Name='Actor binding',Description='old');insert a;
  CardstackRecordEditService.View v=CardstackRecordEditService.start(a.Id);
  Cardstack_Interaction__c row=[SELECT Id,Actor_Id__c FROM Cardstack_Interaction__c WITH SYSTEM_MODE LIMIT 1];row.Actor_Id__c='005000000000001';update as system row;
  Boolean denied=false;try{CardstackRecordEditService.advance(v.key,v.revision,'answer','new',null);}catch(Exception e){denied=true;}System.assert(denied);
  v=CardstackRecordEditService.start(a.Id);v=CardstackRecordEditService.advance(v.key,v.revision,'answer','new',null);v=CardstackRecordEditService.advance(v.key,v.revision,'skip',null,null);
  denied=false;try{CardstackRecordEditService.advance(v.key,v.revision,'confirm',null,null);}catch(Exception e){denied=true;}System.assert(denied);
  System.assertEquals('old',[SELECT Description FROM Account WHERE Id=:a.Id].Description);
 } }
 @IsTest static void requiredClearAndUnsupportedObjectReject() {System.runAs(new User(Id=UserInfo.getUserId())) {
  Cardstack_Config__c config=[SELECT Id,Value__c FROM Cardstack_Config__c LIMIT 1];config.Value__c=config.Value__c.replace('"api":"Description","editable":true','"api":"Description","editable":true,"required":true');update config;
  Account a=new Account(Name='Required',Description='old');insert a;
  CardstackRecordEditService.View v=CardstackRecordEditService.start(a.Id);System.assertEquals(true,v.required);System.assertEquals(false,v.canClear);
  CardstackRecordEditService.View rejected=CardstackRecordEditService.advance(v.key,v.revision,'clear',null,null);System.assertNotEquals(null,rejected.error);System.assertEquals(v.revision,rejected.revision);
  Contact c=new Contact(LastName='Unsupported');insert c;Boolean denied=false;try{CardstackRecordEditService.start(c.Id);}catch(Exception e){denied=true;}System.assert(denied);
 } }
 @IsTest static void invocablePreservesInputAndRejectsMultipleOperations() {System.runAs(new User(Id=UserInfo.getUserId())) {
  Account a=new Account(Name='Invocable',Description='old');insert a;
  CardstackRecordEditAction.Request req=new CardstackRecordEditAction.Request();req.recordId=a.Id;req.operation='start';
  CardstackRecordEditAction.Response r=CardstackRecordEditAction.edit(new List<CardstackRecordEditAction.Request>{req})[0];System.assertEquals(true,r.showEditing);
  req=new CardstackRecordEditAction.Request();req.operation='answer';req.interactionKey=r.interactionKey;req.expectedRevision=r.revision;req.answerValue='  café "exact"  ';
  r=CardstackRecordEditAction.edit(new List<CardstackRecordEditAction.Request>{req})[0];System.assertEquals('Employees',r.fieldLabel);
  req.operation='back';req.expectedRevision=r.revision;r=CardstackRecordEditAction.edit(new List<CardstackRecordEditAction.Request>{req})[0];System.assertEquals('  café "exact"  ',r.fieldValue);
  Boolean denied=false;try{CardstackRecordEditAction.edit(new List<CardstackRecordEditAction.Request>{req,req});}catch(Exception e){denied=true;}System.assert(denied);
 } }
 @IsTest static void invocableRejectsWrongReviewReference() {System.runAs(new User(Id=UserInfo.getUserId())) {
  Account a=new Account(Name='Review identity',Description='old');insert a;
  CardstackRecordEditService.View v=CardstackRecordEditService.start(a.Id);v=CardstackRecordEditService.advance(v.key,v.revision,'answer','new',null);v=CardstackRecordEditService.advance(v.key,v.revision,'skip',null,null);
  Map<String,Object> args=new Map<String,Object>{'operation'=>'confirm','interactionKey'=>v.key,'expectedRevision'=>v.revision,'confirmToken'=>v.confirmToken,'reviewReference'=>'another-review'};
  CardstackRecordEditAction.Request req=(CardstackRecordEditAction.Request)JSON.deserialize(JSON.serialize(args),CardstackRecordEditAction.Request.class);
  Boolean denied=false;try{CardstackRecordEditAction.edit(new List<CardstackRecordEditAction.Request>{req});}catch(Exception e){denied=true;}System.assert(denied,'A confirm button must identify its own review, even if the assistant supplies a current token');System.assertEquals('old',[SELECT Description FROM Account WHERE Id=:a.Id].Description);
 } }
 @IsTest static void reviewReferencesCannotCrossSessionsAndCurrentReviewSaves() {System.runAs(new User(Id=UserInfo.getUserId())) {
  Account a=new Account(Name='Two reviews',Description='old');insert a;
  CardstackRecordEditService.View first=CardstackRecordEditService.start(a.Id);first=CardstackRecordEditService.advance(first.key,first.revision,'answer','first',null);first=CardstackRecordEditService.advance(first.key,first.revision,'skip',null,null);
  CardstackRecordEditService.View second=CardstackRecordEditService.start(a.Id);second=CardstackRecordEditService.advance(second.key,second.revision,'answer','second',null);second=CardstackRecordEditService.advance(second.key,second.revision,'skip',null,null);
  CardstackRecordEditAction.Request req=new CardstackRecordEditAction.Request();req.operation='confirm';req.interactionKey=second.key;req.expectedRevision=second.revision;req.confirmToken=second.confirmToken;req.reviewReference=first.reviewReference;
  Boolean denied=false;try{CardstackRecordEditAction.edit(new List<CardstackRecordEditAction.Request>{req});}catch(Exception e){denied=true;}System.assert(denied);System.assertEquals('old',[SELECT Description FROM Account WHERE Id=:a.Id].Description);
  req.reviewReference=second.reviewReference;CardstackRecordEditAction.Response receipt=CardstackRecordEditAction.edit(new List<CardstackRecordEditAction.Request>{req})[0];System.assertEquals('Completed',receipt.status);System.assertEquals(true,receipt.showDone);System.assertEquals('',receipt.fieldValue);System.assertEquals('',receipt.fieldLabel);System.assertEquals('',receipt.error);System.assertEquals('second',[SELECT Description FROM Account WHERE Id=:a.Id].Description);
 } }
}
