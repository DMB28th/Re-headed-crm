/** Closed read-only discovery entrypoint risk checks. */
@IsTest private with sharing class CardstackRecordDiscoveryMcpAdapterTest {
 @IsTest static void shouldExposeOnlySearch_WhenListingTools() {
  Test.startTest(); List<Object> tools=CardstackRecordDiscoveryMcpAdapter.tools(); Test.stopTest();
  Assert.areEqual(1,tools.size(),'One additive read route.'); Map<String,Object> tool=(Map<String,Object>)tools[0];
  Assert.areEqual('cardstack_record_search',tool.get('name'),'Canonical model search name.');
  Assert.areEqual(true,((Map<String,Object>)tool.get('annotations')).get('readOnlyHint'),'Discovery never authorizes writes.');
  Assert.areEqual(false,((Map<String,Object>)tool.get('inputSchema')).get('additionalProperties'),'Unknown input cannot alter authority.');
 }
 @IsTest static void shouldRejectUnknownKeys_BeforeAnyRead() {
  CardstackConnectionAccess.userOverride=true;
  Test.startTest(); Map<String,Object> response=CardstackRecordDiscoveryMcpAdapter.call('claude','cardstack_record_search',new Map<String,Object>{'query'=>'Acme','writeEnabled'=>true}); Integer reads=Limits.getQueries(); Test.stopTest();
  Assert.areEqual(0,reads,'Malformed input must fail before configuration/CRM reads.');
  Assert.areEqual(true,response.get('isError'),'Rejected read request.');
  Assert.areEqual('INVALID_ARGUMENTS',((Map<String,Object>)response.get('structuredContent')).get('errorCode'),'Bounded rejection.');
 }
 @IsTest static void shouldRejectFractionalLimit_BeforeAnyRead() {
  CardstackConnectionAccess.userOverride=true;
  Test.startTest(); Map<String,Object> response=CardstackRecordDiscoveryMcpAdapter.call('claude','cardstack_record_search',new Map<String,Object>{'query'=>'Acme','maxResults'=>1.5}); Integer reads=Limits.getQueries(); Test.stopTest();
  Assert.areEqual(0,reads,'No read for unchecked numeric input.'); Assert.areEqual(true,response.get('isError'),'Exact integer required.');
 }
 @IsTest static void shouldRejectMissingQuery_BeforeAnyRead() {
  CardstackConnectionAccess.userOverride=true;
  Test.startTest(); Map<String,Object> response=CardstackRecordDiscoveryMcpAdapter.call('claude','cardstack_record_search',new Map<String,Object>()); Integer reads=Limits.getQueries(); Test.stopTest();
  Assert.areEqual(0,reads,'Missing query fails before setup read.'); Assert.areEqual(true,response.get('isError'),'Closed input contract.');
 }
 @IsTest static void shouldRejectWrongObjectType_BeforeAnyRead() {
  CardstackConnectionAccess.userOverride=true;
  Test.startTest(); Map<String,Object> response=CardstackRecordDiscoveryMcpAdapter.call('claude','cardstack_record_search',new Map<String,Object>{'query'=>'Acme','objectApiName'=>true}); Integer reads=Limits.getQueries(); Test.stopTest();
  Assert.areEqual(0,reads,'Wrong type fails before setup read.'); Assert.areEqual(true,response.get('isError'),'Canonical object string required.');
 }
}
