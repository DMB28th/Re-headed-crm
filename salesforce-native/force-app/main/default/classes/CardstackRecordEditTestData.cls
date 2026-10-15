/** Native Contact fixtures used only by isolated tests, never external setup. */
@IsTest public with sharing class CardstackRecordEditTestData {
 /**
  * Isolated test actors need Contact CRUD and only the three milestone inputs.
  * These setup rows live exclusively in native test rollback; installed permission
  * sets and live connected users are never modified by this helper.
  */
 public static void grantCurrentActorContactAccess() {
  PermissionSet contactPermission=new PermissionSet(Name='CardstackContactTestFixture',Label='Cardstack Contact Test Fixture');
  insert as system contactPermission;
  insert as system new ObjectPermissions(ParentId=contactPermission.Id,SobjectType='Contact',
   PermissionsRead=true,PermissionsCreate=true,PermissionsEdit=true,PermissionsDelete=false,
   PermissionsViewAllRecords=false,PermissionsModifyAllRecords=false);
  List<FieldPermissions> inputs=new List<FieldPermissions>();
  for(Schema.SObjectField field:new List<Schema.SObjectField>{Contact.LastName,Contact.Description,Contact.HasOptedOutOfEmail,Contact.Birthdate}) {
   Schema.DescribeFieldResult nativeField=field.getDescribe();
   // Native required fields (LastName) do not accept FieldPermissions rows.
   if(nativeField.isPermissionable()) inputs.add(new FieldPermissions(ParentId=contactPermission.Id,
    SobjectType='Contact',Field='Contact.'+nativeField.getName(),PermissionsRead=true,PermissionsEdit=true));
  }
  insert as system inputs;
  insert as system new PermissionSetAssignment(AssigneeId=UserInfo.getUserId(),PermissionSetId=contactPermission.Id);
 }
 /** Generic fixtures exercise ordinary metadata; grants stay inside test rollback. */
 public static void grantCurrentActorAccountAccess() {
  PermissionSet permission=new PermissionSet(Name='CardstackGenericAccountFixture',Label='Cardstack Generic Account Fixture');
  insert as system permission;
  insert as system new ObjectPermissions(ParentId=permission.Id,SobjectType='Account',PermissionsRead=true,PermissionsCreate=true,PermissionsEdit=true);
  List<FieldPermissions> fields=new List<FieldPermissions>();
  for(Schema.SObjectField field:new List<Schema.SObjectField>{Account.Name,Account.Description,Account.NumberOfEmployees,Account.AnnualRevenue}) {
   Schema.DescribeFieldResult shape=field.getDescribe();
   if(shape.isPermissionable()) fields.add(new FieldPermissions(ParentId=permission.Id,SobjectType='Account',Field='Account.'+shape.getName(),PermissionsRead=true,PermissionsEdit=true));
  }
  insert as system fields;
  insert as system new PermissionSetAssignment(AssigneeId=UserInfo.getUserId(),PermissionSetId=permission.Id);
 }
 /** Lead fixture grants stay exclusively inside native test rollback. */
 public static void grantCurrentActorLeadAccess() {
  PermissionSet permission=new PermissionSet(Name='CardstackGenericLeadFixture',Label='Cardstack Generic Lead Fixture'); insert as system permission;
  insert as system new ObjectPermissions(ParentId=permission.Id,SobjectType='Lead',PermissionsRead=true,PermissionsCreate=true,PermissionsEdit=true);
  List<FieldPermissions> fields=new List<FieldPermissions>();
  for(String name:new List<String>{'LastName','Company','Description','Rating','LeadSource','Email','Phone','Website'}) {
   Schema.DescribeFieldResult shape=Lead.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED).fields.getMap().get(name).getDescribe();
   if(shape.isPermissionable()) fields.add(new FieldPermissions(ParentId=permission.Id,SobjectType='Lead',Field='Lead.'+name,PermissionsRead=true,PermissionsEdit=true));
  }
  insert as system fields; insert as system new PermissionSetAssignment(AssigneeId=UserInfo.getUserId(),PermissionSetId=permission.Id);
 }
 public static Account accountFixture() {
  CardstackConnectionAccess.userOverride=true;
  insert as system new Cardstack_Config__c(Name='layout:Account:default',Is_Active__c=true,Value__c=accountLayout());
  insert as system new Cardstack_Connection_Setup__c(Client__c='claude',Revision__c=1,Configuration_Digest__c='fixture-setup',Configuration__c='{"client":"claude","enabledIntent":true,"publicClientId":"fixture-public-client","callbacks":["https://claude.ai/api/mcp/auth_callback"],"sitePrefix":"/cardstack","packageVersion":"0.1.0.8","transportVersion":"cardstack/v1","uiVersion":"mcp-apps/v1","permissionPolicyRevision":"1"}');
  Account record=new Account(Name='Configured account',Description='Before',NumberOfEmployees=5); insert record; return record;
 }
 public static String accountLayout() { return '{"permissions":{"writeEnabled":true},"fields":[{"api":"Name","editable":true},{"api":"Description","editable":true},{"api":"NumberOfEmployees","editable":true}],"sections":[{"label":"Configured details","columns":1,"fields":[{"api":"Name","editable":true},{"api":"Description","editable":true},{"api":"NumberOfEmployees","editable":true}]}],"actions":[{"name":"configured","label":"Configured details","enabled":true,"type":"record-edit","mappings":[{"fieldApi":"NumberOfEmployees","source":"current"},{"fieldApi":"Name","source":"current"},{"fieldApi":"Description","source":"current"}]}]}'; }
 public static void grantCurrentActorAdmin() {
  PermissionSet admin=[SELECT Id FROM PermissionSet WHERE Name='Cardstack_Admin' WITH SYSTEM_MODE LIMIT 1];
  if([SELECT count() FROM PermissionSetAssignment WHERE AssigneeId=:UserInfo.getUserId() AND PermissionSetId=:admin.Id WITH SYSTEM_MODE]==0) insert as system new PermissionSetAssignment(AssigneeId=UserInfo.getUserId(),PermissionSetId=admin.Id);
 }
 public static String genericOpportunityLayout() { return '{"permissions":{"writeEnabled":true},"fields":[{"api":"Name","editable":true},{"api":"CloseDate","editable":true},{"api":"Amount","editable":true}],"actions":[{"name":"generic_forecast","label":"Generic forecast details","enabled":true,"type":"record-edit","mappings":[{"fieldApi":"Name","source":"current"},{"fieldApi":"CloseDate","source":"current"},{"fieldApi":"Amount","source":"current"}]}]}'; }
 /** Generic Opportunity currency fixtures use the actual staging/publication path. */
 public static Opportunity genericOpportunityFixture(String amount) {
  CardstackConnectionAccess.userOverride=true;
  CardstackConfigService.publishDraft(CardstackConfigService.saveDraft('layout:Opportunity:default',genericOpportunityLayout()));
  insert as system new Cardstack_Connection_Setup__c(Client__c='claude',Revision__c=1,Configuration_Digest__c='fixture-setup',Configuration__c='{"client":"claude","enabledIntent":true,"publicClientId":"fixture-public-client","callbacks":["https://claude.ai/api/mcp/auth_callback"],"sitePrefix":"/cardstack","packageVersion":"0.1.0.8","transportVersion":"cardstack/v1","uiVersion":"mcp-apps/v1","permissionPolicyRevision":"1"}');
  Opportunity record=CardstackOpportunityEditTestData.insertOpportunity(); record.Amount=Decimal.valueOf(amount); Database.update(record,AccessLevel.USER_MODE); return record;
 }
 public static Contact fixture() {
  CardstackConnectionAccess.userOverride=true;
  insert as system new Cardstack_Config__c(Name='layout:Contact:default',Is_Active__c=true,Value__c=layout());
  insert as system new Cardstack_Connection_Setup__c(Client__c='claude',Revision__c=1,Configuration_Digest__c='fixture-setup',Configuration__c='{"client":"claude","enabledIntent":true,"publicClientId":"fixture-public-client","callbacks":["https://claude.ai/api/mcp/auth_callback"],"sitePrefix":"/cardstack","packageVersion":"0.1.0.8","transportVersion":"cardstack/v1","uiVersion":"mcp-apps/v1","permissionPolicyRevision":"1"}');
  Contact record=new Contact(LastName='Original',Description='Before',HasOptedOutOfEmail=false); insert record; return record;
 }
 public static String layout() { return '{"permissions":{"writeEnabled":true},"fields":[{"api":"LastName","editable":true},{"api":"Description","editable":true},{"api":"HasOptedOutOfEmail","editable":true}],"actions":[{"name":"edit_contact","label":"Edit Contact","description":"Studio authored display metadata","enabled":true,"type":"record-edit","mappings":[{"fieldApi":"LastName","source":"current"},{"fieldApi":"Description","source":"current"},{"fieldApi":"HasOptedOutOfEmail","source":"current"}]}]}'; }
 public static CardstackOpportunityEditTypes.Envelope open(Contact record) { return CardstackOpportunityEditService.startRecord('claude',record.Id,'edit_contact'); }
 public static CardstackOpportunityEditTypes.FieldChange change(String field,String operation,String value) { return CardstackOpportunityEditTestData.change(field,operation,value); }
 public static CardstackOpportunityEditTypes.TransitionRequest request(CardstackOpportunityEditTypes.Envelope envelope,String operation) {
  CardstackOpportunityEditTypes.TransitionRequest request=new CardstackOpportunityEditTypes.TransitionRequest(); request.interactionKey=envelope.interactionKey; request.expectedRevision=envelope.view.revision; request.operation=operation;
  if(operation=='confirm') { request.reviewRevision=envelope.view.reviewRevision; request.reviewGrant=envelope.reviewGrant; } return request;
 }
 public static CardstackOpportunityEditTypes.Envelope review(CardstackOpportunityEditTypes.Envelope envelope) {
  CardstackOpportunityEditTypes.TransitionRequest request=request(envelope,'review'); request.changes=new List<CardstackOpportunityEditTypes.FieldChange>{change('LastName','set','Reviewed'),change('Description','clear',null),change('HasOptedOutOfEmail','set','true')}; return transition(request);
 }
 public static CardstackOpportunityEditTypes.Envelope transition(CardstackOpportunityEditTypes.TransitionRequest request) { return CardstackOpportunityEditService.transitionRecordFromMcp('claude',request); }
 public static Contact current(Id recordId) { return [SELECT Id,LastName,Description,HasOptedOutOfEmail,SystemModstamp FROM Contact WHERE Id=:recordId WITH USER_MODE]; }
 public static Cardstack_Interaction__c interaction() { return [SELECT Id,State__c,Expires_At__c FROM Cardstack_Interaction__c WITH SYSTEM_MODE LIMIT 1]; }
 public static void denied(CardstackOpportunityEditTypes.Envelope envelope,String code) { Assert.areEqual(code,envelope.view.errors[0].code,'Expected bounded denial.'); Assert.isNull(envelope.reviewGrant,'Denial cannot mint authority.'); }
}
