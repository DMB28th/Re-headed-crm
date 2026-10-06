@IsTest private class CardstackRecordActionServiceTest {
 @TestSetup static void setup(){
  PermissionSet ps=[SELECT Id FROM PermissionSet WHERE Name='Cardstack_Admin' LIMIT 1];
  if([SELECT count() FROM PermissionSetAssignment WHERE AssigneeId=:UserInfo.getUserId() AND PermissionSetId=:ps.Id]==0)insert new PermissionSetAssignment(AssigneeId=UserInfo.getUserId(),PermissionSetId=ps.Id);
  System.runAs(new User(Id=UserInfo.getUserId())){insert new Cardstack_Config__c(Name='layout:Account:default',Is_Active__c=true,Value__c='{"permissions":{"writeEnabled":true},"fields":[{"api":"Description","editable":true},{"api":"NumberOfEmployees","editable":true},{"api":"Name","readOnly":true}],"actions":[{"name":"review_account","label":"Review Account","enabled":true,"type":"record-edit","mappings":[{"fieldApi":"Description","source":"field","sourceField":"Name"},{"fieldApi":"NumberOfEmployees","source":"constant","value":"0"}]}]}');}
 }
 @IsTest static void publishedMappingsAreResolvedWithoutCoercion(){System.runAs(new User(Id=UserInfo.getUserId())){
  CardstackRecordActionService.Definition d=CardstackRecordActionService.resolve('Account','review_account');
  System.assertNotEquals(null,d);System.assertEquals('Name',d.mappings[0].sourceField);System.assertEquals('0',d.mappings[1].value);
  System.assertEquals(1,CardstackRecordActionService.available('Account').size());
 }}
 @IsTest static void disabledAndMissingActionsAreRejected(){System.runAs(new User(Id=UserInfo.getUserId())){
  Cardstack_Config__c c=[SELECT Id,Value__c FROM Cardstack_Config__c LIMIT 1];c.Value__c=c.Value__c.replace('"enabled":true','"enabled":false');update c;
  for(String name:new List<String>{'review_account','unpublished'}){Boolean denied=false;try{CardstackRecordActionService.resolve('Account',name);}catch(Exception e){denied=true;}System.assert(denied);}
  System.assertEquals(0,CardstackRecordActionService.available('Account').size());
 }}
 @IsTest static void readOnlyTargetAndUnexposedSourceAreRejected(){System.runAs(new User(Id=UserInfo.getUserId())){
  Cardstack_Config__c c=[SELECT Id,Value__c FROM Cardstack_Config__c LIMIT 1];String original=c.Value__c;
  for(String invalid:new List<String>{original.replace('"fieldApi":"Description"','"fieldApi":"Name"'),original.replace('"sourceField":"Name"','"sourceField":"Phone"')}){
   c.Value__c=invalid;update c;Boolean denied=false;try{CardstackRecordActionService.resolve('Account','review_account');}catch(Exception e){denied=true;}System.assert(denied);
  }
 }}
 @IsTest static void mappedEditorDefaultsDoNotWriteUntilConfirmed(){System.runAs(new User(Id=UserInfo.getUserId())){
  Account a=new Account(Name='Mapped café ✓',Description='Original',NumberOfEmployees=42);insert a;
  CardstackRecordEditService.View v=CardstackRecordEditService.start(a.Id,'review_account');
  System.assertEquals('Description',v.fieldApi);System.assertEquals(a.Name,v.value);
  System.assertEquals('Original',[SELECT Description FROM Account WHERE Id=:a.Id].Description);
  v=CardstackRecordEditService.advance(v.key,v.revision,'answer',v.value,null);
  System.assertEquals('NumberOfEmployees',v.fieldApi);System.assertEquals('0',v.value);
  v=CardstackRecordEditService.advance(v.key,v.revision,'answer','0',null);
  System.assertEquals('Review',v.status);System.assertEquals(42,[SELECT NumberOfEmployees FROM Account WHERE Id=:a.Id].NumberOfEmployees);
  v=CardstackRecordEditService.advance(v.key,v.revision,'confirm',null,v.confirmToken,v.reviewReference);
  System.assertEquals('Completed',v.status);Account saved=[SELECT Description,NumberOfEmployees FROM Account WHERE Id=:a.Id];
  System.assertEquals(a.Name,saved.Description);System.assertEquals(0,saved.NumberOfEmployees);
 }}
 @IsTest static void sourceAndActionChangesInvalidateAnOpenProcess(){System.runAs(new User(Id=UserInfo.getUserId())){
  Account a=new Account(Name='Original source',Description='Original');insert a;
  CardstackRecordEditService.View v=CardstackRecordEditService.start(a.Id,'review_account');a.Name='Changed source';update a;
  v=CardstackRecordEditService.advance(v.key,v.revision,'answer','Answer',null);
  Boolean denied=false;try{CardstackRecordEditService.advance(v.key,v.revision,'answer','0',null);}catch(Exception e){denied=true;}System.assert(denied);
  v=CardstackRecordEditService.start(a.Id,'review_account');Cardstack_Config__c c=[SELECT Id,Value__c FROM Cardstack_Config__c LIMIT 1];c.Value__c=c.Value__c.replace('"enabled":true','"enabled":false');update c;
  denied=false;try{CardstackRecordEditService.advance(v.key,v.revision,'answer','Answer',null);}catch(Exception e){denied=true;}System.assert(denied);
 }}
 @IsTest static void cardsExposeOnlyValidatedPublishedActions(){System.runAs(new User(Id=UserInfo.getUserId())){
  Account a=new Account(Name='Card actions');insert a;CardstackGetRecordAction.GetRecordRequest req=new CardstackGetRecordAction.GetRecordRequest();req.objectName='Account';req.recordId=a.Id;
  CardstackGetRecordAction.GetRecordResponse card=CardstackGetRecordAction.getRecord(new List<CardstackGetRecordAction.GetRecordRequest>{req})[0];
  System.assertEquals(true,card.hasActions);System.assertEquals(1,card.actions.size());System.assertEquals(true,card.actions[0].inChat);
  System.assert(card.actions[0].prompt.contains('actionName=review_account'));System.assert(card.actions[0].prompt.contains(String.valueOf(a.Id)));
  Cardstack_Config__c c=[SELECT Id,Value__c FROM Cardstack_Config__c LIMIT 1];c.Value__c=c.Value__c.replace('"enabled":true','"enabled":false');update c;
  card=CardstackGetRecordAction.getRecord(new List<CardstackGetRecordAction.GetRecordRequest>{req})[0];System.assertEquals(false,card.hasActions);
 }}
 @IsTest static void keepCurrentAfterBackDropsTheEarlierAnswer(){System.runAs(new User(Id=UserInfo.getUserId())){
  Account a=new Account(Name='Skip source',Description='Keep original',NumberOfEmployees=42);insert a;
  CardstackRecordEditService.View v=CardstackRecordEditService.start(a.Id,'review_account');
  v=CardstackRecordEditService.advance(v.key,v.revision,'answer','Earlier answer',null);
  v=CardstackRecordEditService.advance(v.key,v.revision,'back',null,null);
  v=CardstackRecordEditService.advance(v.key,v.revision,'skip',null,null);
  v=CardstackRecordEditService.advance(v.key,v.revision,'answer','0',null);
  v=CardstackRecordEditService.advance(v.key,v.revision,'confirm',null,v.confirmToken,v.reviewReference);
  Account saved=[SELECT Description,NumberOfEmployees FROM Account WHERE Id=:a.Id];System.assertEquals('Keep original',saved.Description);System.assertEquals(0,saved.NumberOfEmployees);
 }}
 @IsTest static void oversizedAdvancedCatalogRetainsFirstTwentyButtons(){System.runAs(new User(Id=UserInfo.getUserId())){
  Cardstack_Config__c c=[SELECT Id,Value__c FROM Cardstack_Config__c LIMIT 1];Map<String,Object> config=(Map<String,Object>)JSON.deserializeUntyped(c.Value__c);
  Object base=((List<Object>)config.get('actions'))[0];List<Object> actions=new List<Object>();
  for(Integer i=0;i<21;i++){Map<String,Object> d=(Map<String,Object>)JSON.deserializeUntyped(JSON.serialize(base));d.put('name','action_'+i);actions.add(d);}
  config.put('actions',actions);c.Value__c=JSON.serialize(config);update c;
  System.assertEquals(20,CardstackRecordActionService.available('Account').size());
 }}
}
