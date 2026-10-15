/** Discovery does not select a first match or authorize a mutation. */
@IsTest private with sharing class CardstackRecordDiscoveryTest {
 @TestSetup static void permissions() {
  CardstackOpportunityEditTestData.grantCurrentActorPackageRead();
  CardstackRecordEditTestData.grantCurrentActorAccountAccess();
  CardstackRecordEditTestData.grantCurrentActorContactAccess();
 }
 private static List<Account> accounts(Integer count) {
  List<Account> rows=new List<Account>();
  for(Integer index=0;index<count;index++) rows.add(new Account(Name='Acme',NumberOfEmployees=index+1));
  insert as system rows; return rows;
 }
 private static void publish() {
  insert as system new Cardstack_Config__c(Name='layout:Account:default',Is_Active__c=true,Value__c=CardstackRecordEditTestData.accountLayout());
 }
 @IsTest static void shouldRequireSelection_WhenDuplicateNames() {
  publish(); List<Account> rows=accounts(2); Test.setFixedSearchResults(new List<Id>{rows[0].Id,rows[1].Id});
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Test.startTest(); CardstackRecordDiscovery.Result result=CardstackRecordDiscovery.search('Acme',null,5); Test.stopTest();
   Assert.areEqual('Matches',result.status,'Return readable matches.'); Assert.areEqual(2,result.candidates.size(),'Never silently choose the first.');
   Assert.isTrue(result.needsSelection,'Duplicate names require explicit selection.'); Assert.isFalse(result.hasMore,'Both results fit.');
   Assert.areEqual(18,result.candidates[0].recordId.length(),'Public IDs are checksum18.');
  }
 }
 @IsTest static void shouldReturnEmpty_WhenNoMatches() {
  publish(); Test.setFixedSearchResults(new List<Id>());
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Test.startTest(); CardstackRecordDiscovery.Result result=CardstackRecordDiscovery.search('Absent',null,5); Test.stopTest();
   Assert.areEqual('Empty',result.status,'No matches is a recoverable read outcome.'); Assert.areEqual(0,result.candidates.size(),'No fabricated record.');
  }
 }
 @IsTest static void shouldCapResults_WhenManyMatches() {
  publish(); List<Account> rows=accounts(251); List<Id> ids=new List<Id>(); for(Account row:rows) ids.add(row.Id); Test.setFixedSearchResults(ids);
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Test.startTest(); CardstackRecordDiscovery.Result result=CardstackRecordDiscovery.search('Acme','Account',3); Test.stopTest();
   Assert.areEqual(3,result.candidates.size(),'Honor bounded result count.'); Assert.isTrue(result.hasMore,'Do not hide truncation.'); Assert.isTrue(result.needsSelection,'Truncated results never imply a unique match.');
  }
 }
 @IsTest static void shouldNormalizeId_WhenPlatform15Input() {
  publish(); Account row=accounts(1)[0]; String canonical=CardstackConnectionTypes.normalizeId(String.valueOf(row.Id));
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Test.startTest(); CardstackRecordDiscovery.Result result=CardstackRecordDiscovery.search(canonical.substring(0,15),null,5); Test.stopTest();
   Assert.areEqual(canonical,result.candidates[0].recordId,'Normalize at ingestion.'); Assert.areEqual('Matches',result.status,'Native ID read bypasses search index.');
  }
 }
 @IsTest static void shouldReturnBothTypes_WhenConfiguredNamesOverlap() {
  publish();
  insert as system new Cardstack_Config__c(Name='layout:Contact:default',Is_Active__c=true,Value__c=CardstackRecordEditTestData.layout());
  Account account=accounts(1)[0]; Contact contact=new Contact(LastName='Acme'); insert as system contact;
  Test.setFixedSearchResults(new List<Id>{account.Id,contact.Id});
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Test.startTest(); CardstackRecordDiscovery.Result result=CardstackRecordDiscovery.search('Acme',null,5); Integer writes=Limits.getDmlStatements(); Test.stopTest();
   Assert.areEqual(2,result.candidates.size(),'Cross-object duplicate names remain explicit choices.');
   Assert.areEqual(new List<String>{'Account','Contact'},result.searchedObjects,'Only published canonical scopes.');
   Assert.isTrue(result.needsSelection,'Different objects do not make identity unique.');
   Assert.areEqual(0,writes,'Discovery creates no draft, grant, audit, or CRM write.');
  }
 }
 @IsTest static void shouldTreatNaturalNameAsText_WhenFifteenCharacters() {
  publish(); Account row=new Account(Name='AcmeCorporation'); insert as system row; Test.setFixedSearchResults(new List<Id>{row.Id});
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Test.startTest(); CardstackRecordDiscovery.Result result=CardstackRecordDiscovery.search('AcmeCorporation',null,5); Test.stopTest();
   Assert.areEqual(1,result.candidates.size(),'Ordinary 15-character names are not platform IDs.');
   Assert.isTrue(result.searchIndexMayLag,'Names use indexed discovery.');
  }
 }
 @IsTest static void shouldRejectId_WhenCallerScopeDisagrees() {
  publish(); Account row=accounts(1)[0]; denied(CardstackConnectionTypes.normalizeId(String.valueOf(row.Id)),'Contact','SCOPE_UNAVAILABLE');
 }
 private static void denied(String query,String objectApi,String code) {
  Test.startTest(); try { CardstackRecordDiscovery.search(query,objectApi,5); Assert.fail('Expected '+code); }
  catch(CardstackRecordDiscovery.DiscoveryException error) { Assert.areEqual(code,error.getMessage(),'Bounded discovery rejection.'); } Test.stopTest();
 }
 @IsTest static void shouldReject_WhenBlankQuery() { denied(' ',null,'INVALID_ARGUMENTS'); }
 @IsTest static void shouldReject_WhenOverlongQuery() { denied('x'.repeat(161),null,'INVALID_ARGUMENTS'); }
 @IsTest static void shouldReject_WhenUnconfiguredObject() { publish(); denied('Acme','Contact','SCOPE_UNAVAILABLE'); }
 @IsTest static void shouldReject_WhenNoncanonicalObject() { publish(); denied('Acme','account','SCOPE_UNAVAILABLE'); }
 @IsTest static void shouldReject_WhenInvalidChecksum() { publish(); denied('001000000000001ZZZ',null,'INVALID_ARGUMENTS'); }
 @IsTest static void shouldIgnore_WhenOnlyDraftConfigured() {
  insert as system new Cardstack_Config__c(Name='layout:Account:default',Is_Active__c=false,Value__c=CardstackRecordEditTestData.accountLayout());
  denied('Acme',null,'SCOPE_UNAVAILABLE');
 }
 @IsTest static void shouldExcludeContext_WhenDenylisted() {
  Map<String,Object> layout=(Map<String,Object>)JSON.deserializeUntyped(CardstackRecordEditTestData.accountLayout());
  ((Map<String,Object>)layout.get('permissions')).put('fieldDenylist',new List<String>{'NumberOfEmployees'});
  insert as system new Cardstack_Config__c(Name='layout:Account:default',Is_Active__c=true,Value__c=JSON.serialize(layout));
  Account row=accounts(1)[0]; Test.setFixedSearchResults(new List<Id>{row.Id});
  System.runAs(new User(Id=UserInfo.getUserId())) {
   Test.startTest(); CardstackRecordDiscovery.Result result=CardstackRecordDiscovery.search('Acme',null,5); Test.stopTest();
   for(CardstackRecordDiscovery.ContextValue field:result.candidates[0].context) Assert.areNotEqual('NumberOfEmployees',field.fieldApi,'Published denial restricts read context.');
  }
 }
}
