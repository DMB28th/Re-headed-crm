/** Closed related tools and public/private response separation. */
@IsTest(SeeAllData=false)
private with sharing class CardstackRelatedListMcpAdapterTest {
  @TestSetup
  static void grantPackageRead() {
    CardstackOpportunityEditTestData.grantCurrentActorPackageRead();
  }
  @IsTest
  static void opportunityChildUsesExistingFixedAdapter() {
    Map<String,Id> fixture=opportunityFixture();
    Test.startTest();
    Map<String,Object> opened=CardstackRelatedListMcpAdapter.call('claude','cardstack_record_related_open_child',childArgs(fixture.get('parent'),fixture.get('child')));
    Map<String,Object> card=(Map<String,Object>)opened.get('structuredContent');
    Assert.areEqual('opportunity-card/v1',card.get('contractVersion'),'Checked Opportunity uses its existing fixed native family.');
    Assert.areEqual(CardstackConnectionTypes.normalizeId(String.valueOf(fixture.get('child'))),card.get('recordId'),'Exact owned child opened.');
    Assert.areEqual(0,Limits.getDmlRows(),'Opening does not start an interaction or write a CRM record.');
    Map<String,Object> started=CardstackOpportunityMcpAdapter.call('claude','cardstack_opportunity_edit_start',new Map<String,Object>{'recordId'=>card.get('recordId'),'actionName'=>'edit_opportunity'});
    Assert.areEqual('Editing',((Map<String,Object>)started.get('structuredContent')).get('status'),'Existing stage-aware start remains available after membership navigation.');
    Assert.isTrue(((Map<String,Object>)started.get('_meta')).containsKey('cardstack/opportunityEdit'),'Only existing Opportunity private authority is returned.');
    Test.stopTest();
  }
  @IsTest
  static void scalarOnlyOpportunityUsesGenericConfiguredFamily() {
    Map<String,Id> fixture=opportunityFixture();
    Cardstack_Config__c layout=[SELECT Id,Value__c FROM Cardstack_Config__c WHERE Name='layout:Opportunity:default' WITH SYSTEM_MODE LIMIT 1];
    layout.Value__c='{"permissions":{"writeEnabled":true},"fields":[{"api":"Description","editable":true}],"actions":[{"name":"scalar_details","label":"Update notes","type":"record-edit","enabled":true,"mappings":[{"fieldApi":"Description","source":"current"}]}]}';
    update as system layout;
    Test.startTest();
    Map<String,Object> opened=CardstackRelatedListMcpAdapter.call('claude','cardstack_record_related_open_child',childArgs(fixture.get('parent'),fixture.get('child')));
    Map<String,Object> card=(Map<String,Object>)opened.get('structuredContent');
    Assert.areEqual('record-card/v1',card.get('contractVersion'),'Published scalar-only Opportunity keeps the generic configured family.');
    Assert.areEqual('Opportunity',card.get('objectApiName'),'Native object identity remains exact.');
    Assert.areEqual(0,Limits.getDmlRows(),'Route hint never starts an edit.');
    Map<String,Object> started=CardstackRecordMcpAdapter.call('claude','cardstack_record_edit_start',new Map<String,Object>{'recordId'=>card.get('recordId'),'actionName'=>'scalar_details'});
    Assert.areEqual('Editing',((Map<String,Object>)started.get('structuredContent')).get('status'),'The existing generic engine starts configured scalar Opportunity fields.');
    Assert.isTrue(((Map<String,Object>)started.get('_meta')).containsKey('cardstack/recordEdit'),'Scalar-only native authority remains generic.');
    Test.stopTest();
  }
  @IsTest
  static void foreignOpportunityFailsMembershipBeforeOpen() {
    Map<String,Id> fixture=opportunityFixture();
    Test.startTest();
    Map<String,Object> rejected=CardstackRelatedListMcpAdapter.call('claude','cardstack_record_related_open_child',childArgs(fixture.get('parent'),fixture.get('foreign')));
    Map<String,Object> body=(Map<String,Object>)rejected.get('structuredContent');
    Assert.areEqual('record-related-error/v1',body.get('contractVersion'),'Membership rejection precedes either independent card adapter.');
    Assert.areEqual('RELATED_UNAVAILABLE',body.get('code'),'Foreign parent has bounded denial.');
    Assert.isFalse(JSON.serialize(rejected).contains(String.valueOf(fixture.get('foreign'))),'Foreign child identity is not disclosed by failure.');
    Assert.areEqual(0,Limits.getDmlRows(),'Rejected membership never starts or saves an edit.');
    Test.stopTest();
  }
  private static Map<String,Object> childArgs(Id parentId,Id childId) {
    return new Map<String,Object>{'parentId'=>CardstackConnectionTypes.normalizeId(String.valueOf(parentId)),'listKey'=>'deals','childId'=>CardstackConnectionTypes.normalizeId(String.valueOf(childId))};
  }
  private static Map<String,Id> opportunityFixture() {
    CardstackConnectionAccess.userOverride=true;
    Account parent=new Account(Name='Owned related parent'),other=new Account(Name='Foreign related parent');
    insert as system new List<Account>{parent,other};
    Opportunity child=CardstackOpportunityEditTestData.insertOpportunity(),foreign=CardstackOpportunityEditTestData.insertOpportunity();
    child.AccountId=parent.Id;foreign.AccountId=other.Id;update as system new List<Opportunity>{child,foreign};
    insert as system new List<Cardstack_Config__c>{
      new Cardstack_Config__c(Name='layout:Account:default',Is_Active__c=true,Value__c='{"relatedLists":[{"key":"deals","relationship":"Opportunities","columns":["Name","Amount"],"sort":{"field":"Name","direction":"asc"},"pageSize":2}]}'),
      new Cardstack_Config__c(Name='layout:Opportunity:default',Is_Active__c=true,Value__c='{"permissions":{"writeEnabled":true},"fields":[{"api":"StageName","editable":true},{"api":"CloseDate","editable":true},{"api":"Amount","editable":true}],"actions":[{"name":"edit_opportunity","label":"Edit Opportunity","type":"record-edit","enabled":true,"mappings":[{"fieldApi":"StageName","source":"current"},{"fieldApi":"CloseDate","source":"current"},{"fieldApi":"Amount","source":"current"}]}]}')
    };
    insert as system new Cardstack_Connection_Setup__c(Client__c='claude',Revision__c=1,Configuration_Digest__c='fixture-setup',Configuration__c='{"client":"claude","enabledIntent":true,"publicClientId":"fixture-public-client","callbacks":["https://claude.ai/api/mcp/auth_callback"],"sitePrefix":"/cardstack","packageVersion":"0.1.0.8","transportVersion":"cardstack/v1","uiVersion":"mcp-apps/v1","permissionPolicyRevision":"1"}');
    CardstackOpportunityStageProvider.source=new FixtureSource(child.StageName);
    return new Map<String,Id>{'parent'=>parent.Id,'child'=>child.Id,'foreign'=>foreign.Id};
  }
  private with sharing class FixtureSource implements CardstackOpportunityStageProvider.OptionsSource {
    private String stage;
    private FixtureSource(String stage) {this.stage=stage;}
    public CardstackOpportunityEditTypes.StageContext fetch(String objectApi,String recordTypeId) {
      CardstackOpportunityEditTypes.StageContext context=new CardstackOpportunityEditTypes.StageContext();context.recordTypeId=recordTypeId;context.choices.add(CardstackOpportunityEditTestData.choice(stage,stage));return context;
    }
  }
  @IsTest
  static void toolsAreAppOnlyAndClosed() {
    Test.startTest();
    List<Object> tools = CardstackRelatedListMcpAdapter.tools();
    Test.stopTest();
    Assert.areEqual(3, tools.size(), 'Three related read/navigation tools');
    for (Object raw : tools) {
      Map<String, Object> tool = (Map<String, Object>) raw;
      Map<String, Object> schema = (Map<String, Object>) tool.get(
        'inputSchema'
      );
      Assert.areEqual(
        false,
        schema.get('additionalProperties'),
        'Closed request schemas'
      );
      Map<String, Object> ui = (Map<String, Object>) ((Map<String, Object>) tool.get(
          '_meta'
        ))
        .get('ui');
      Assert.areEqual(
        JSON.serialize(new List<String>{ 'app' }),
        JSON.serialize(ui.get('visibility')),
        'No model tool visibility'
      );
      Map<String,Object> metadata=(Map<String,Object>)tool.get('_meta');
      Assert.isFalse(ui.containsKey('resourceUri'),'App-only related helpers reuse the current mounted workspace.');
      Assert.isFalse(metadata.containsKey('openai/outputTemplate'),'No separate legacy widget render target.');
      Assert.areEqual(true,metadata.get('openai/widgetAccessible'),'App callability retained.');
      Assert.areEqual(true,((Map<String,Object>)tool.get('annotations')).get('readOnlyHint'),'Navigation and reads remain read only.');
    }
  }
  @IsTest
  static void cursorAndInternalIdentifiersRemainPrivate() {
    CardstackRelatedListService.RelatedPage page = new CardstackRelatedListService.RelatedPage();
    page.parent = new CardstackRelatedListService.Identity();
    page.parent.recordId = CardstackConnectionTypes.normalizeId(
      '001000000000001'
    );
    page.parent.objectApiName = 'Account';
    page.parent.recordName = 'Parent';
    page.listKey = 'children';
    page.relationship = 'Contacts';
    page.childObjectApiName = 'Contact';
    page.label = 'Contacts';
    page.definitionFingerprint = 'a'.repeat(64);
    page.nextCursor = 'position';
    page.columns = new List<CardstackRelatedListPolicy.Column>();
    Test.startTest();
    Map<String, Object> result = CardstackRelatedListMcpAdapter.pageResult(
      page
    );
    Test.stopTest();
    Map<String, Object> body = (Map<String, Object>) result.get(
      'structuredContent'
    );
    Assert.isFalse(
      body.containsKey('nextCursor'),
      'Cursor excluded from model-visible body'
    );
    Assert.isFalse(
      JSON.serialize(body).contains('lookupField'),
      'Query identifiers excluded'
    );
    Map<String, Object> meta = (Map<String, Object>) ((Map<String, Object>) result.get(
        '_meta'
      ))
      .get('cardstack/related');
    Assert.areEqual(
      'position',
      meta.get('nextCursor'),
      'Continuation is private position metadata'
    );
  }
}
