/** Configuration-only Case reuse fixtures. All data and grants roll back with native tests. */
@IsTest public with sharing class CardstackConfiguredCaseTestData {
 public static final String ACTION='case_details';
 public static final List<String> INPUTS=new List<String>{'SuppliedEmail','Subject','Description','SuppliedPhone'};
 public static void grantActor() {
  CardstackOpportunityEditTestData.grantCurrentActorPackageRead();
  CardstackRecordEditTestData.grantCurrentActorAdmin();
  PermissionSet permission=new PermissionSet(Name='CardstackConfiguredCaseFixture',Label='Cardstack Configured Case Fixture');
  insert as system permission;
  insert as system new ObjectPermissions(ParentId=permission.Id,SobjectType='Case',PermissionsRead=true,PermissionsCreate=true,PermissionsEdit=true);
  List<FieldPermissions> grants=new List<FieldPermissions>();
  for(String name:INPUTS) {
   Schema.DescribeFieldResult field=Case.SObjectType.getDescribe().fields.getMap().get(name).getDescribe();
   if(field.isPermissionable()) grants.add(new FieldPermissions(ParentId=permission.Id,SobjectType='Case',Field='Case.'+name,PermissionsRead=true,PermissionsEdit=true));
  }
  insert as system grants;
  insert as system new PermissionSetAssignment(AssigneeId=UserInfo.getUserId(),PermissionSetId=permission.Id);
 }
 public static String layout(String label) {
  List<Object> fields=new List<Object>(),mappings=new List<Object>();
  for(String name:INPUTS) {
   fields.add(new Map<String,Object>{'api'=>name,'editable'=>true,'required'=>name=='Subject'});
   mappings.add(new Map<String,Object>{'fieldApi'=>name,'source'=>'current'});
  }
  return JSON.serialize(new Map<String,Object>{
   'permissions'=>new Map<String,Object>{'writeEnabled'=>true},'fields'=>fields,
   'sections'=>new List<Object>{
    new Map<String,Object>{'label'=>'Request','columns'=>1,'fields'=>new List<Object>{new Map<String,Object>{'api'=>'Subject','editable'=>true,'required'=>true},new Map<String,Object>{'api'=>'Description','editable'=>true,'required'=>false}}},
    new Map<String,Object>{'label'=>'Reply details','columns'=>2,'fields'=>new List<Object>{new Map<String,Object>{'api'=>'SuppliedPhone','editable'=>true,'required'=>false},new Map<String,Object>{'api'=>'SuppliedEmail','editable'=>true,'required'=>false}}}
   },
   'actions'=>new List<Object>{new Map<String,Object>{'name'=>ACTION,'label'=>label,'enabled'=>true,'type'=>'record-edit','mappings'=>mappings}}
  });
 }
 public static Case fixture() {
  CardstackConnectionAccess.userOverride=true;
  publish('Update case details');
  insert as system new Cardstack_Connection_Setup__c(Client__c='claude',Revision__c=1,Configuration_Digest__c='fixture-setup',Configuration__c='{"client":"claude","enabledIntent":true,"publicClientId":"fixture-public-client","callbacks":["https://claude.ai/api/mcp/auth_callback"],"sitePrefix":"/cardstack","packageVersion":"0.1.0.8","transportVersion":"cardstack/v1","uiVersion":"mcp-apps/v1","permissionPolicyRevision":"1"}');
  Case record=new Case(Subject='Configured request',Description='Starting description',SuppliedEmail='before@example.com',SuppliedPhone='Starting phone');
  insert as user record;
  return current(record.Id);
 }
 public static void publish(String label) {
  CardstackConfigService.publishDraft(CardstackConfigService.saveDraft('layout:Case:default',layout(label)));
 }
 public static Case current(Id recordId) {
  return [SELECT Id,CaseNumber,Subject,Description,SuppliedEmail,SuppliedPhone,OwnerId,SystemModstamp FROM Case WHERE Id=:recordId WITH USER_MODE];
 }
 public static Integer saveAudits() {
  return [SELECT count() FROM Cardstack_Audit_Log__c WHERE Tool_Name__c='cardstack_record_edit_transition' WITH SYSTEM_MODE];
 }
}
