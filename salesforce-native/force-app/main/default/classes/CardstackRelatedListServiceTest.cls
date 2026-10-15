/** Actual native keyset and membership behavior specifications. */
@IsTest(SeeAllData=false)
private with sharing class CardstackRelatedListServiceTest {
  private static String layout(
    String relationship,
    List<String> columns,
    String sortField,
    String direction,
    Integer size
  ) {
    return JSON.serialize(
      new Map<String, Object>{
        'relatedLists' => new List<Object>{
          new Map<String, Object>{
            'key' => 'children',
            'relationship' => relationship,
            'columns' => columns,
            'sort' => new Map<String, Object>{
              'field' => sortField,
              'direction' => direction
            },
            'pageSize' => size
          }
        }
      }
    );
  }
  private static Account fixture(
    Integer size,
    String sortField,
    String direction
  ) {
    Account p = new Account(Name = 'Related parent');
    insert as system p;
    List<Contact> rows = new List<Contact>();
    for (Integer i = 0; i < size; i++)
      rows.add(
        new Contact(
          AccountId = p.Id,
          LastName = 'Child ' + i,
          Phone = i < 2 ? '111' : null
        )
      );
    insert as system rows;
    insert as system new Cardstack_Config__c(
      Name = 'layout:Account:default',
      Is_Active__c = true,
      Value__c = layout(
        'Contacts',
        new List<String>{ 'Name', 'Phone' },
        sortField,
        direction,
        2
      )
    );
    return p;
  }
  @IsTest
  static void nativeDateAndDatetimeKeepDistinctWireFormats() {
    Account parent = fixture(0, 'Name', 'asc');
    Opportunity child = CardstackOpportunityEditTestData.insertOpportunity();
    child.AccountId = parent.Id;
    child.CloseDate = Date.newInstance(2028, 2, 29);
    update as system child;
    configureOpportunityDates(new List<String>{'CloseDate', 'CreatedDate'}, 'CloseDate');
    Datetime created = [SELECT CreatedDate FROM Opportunity WHERE Id=:child.Id WITH SYSTEM_MODE].CreatedDate;
    Test.startTest();
    CardstackRelatedListService.RelatedPage page = CardstackRelatedListService.readPage(String.valueOf(parent.Id), 'children', null);
    Test.stopTest();
    Assert.areEqual('DATE', page.columns[0].dataType, 'Native calendar field is authoritative.');
    Assert.areEqual('2028-02-29', page.rows[0].cells[0].value, 'Actual native leap date is calendar-only without timezone conversion.');
    Assert.areEqual('DATETIME', page.columns[1].dataType, 'Native timestamp remains distinct.');
    Assert.areEqual(created.formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\''), page.rows[0].cells[1].value, 'Actual native CreatedDate remains an exact UTC timestamp.');
  }
  @IsTest
  static void nativeDateSortContinuationUsesTypedAnchor() {
    Account parent = fixture(0, 'Name', 'asc');
    List<Opportunity> children = new List<Opportunity>();
    for(Integer index=0; index<3; index++) {
      Opportunity child = CardstackOpportunityEditTestData.insertOpportunity();
      child.AccountId = parent.Id;
      child.CloseDate = Date.newInstance(2028, 2, 29).addDays(index == 2 ? 1 : 0);
      children.add(child);
    }
    update as system children;
    configureOpportunityDates(new List<String>{'CloseDate'}, 'CloseDate');
    Test.startTest();
    CardstackRelatedListService.RelatedPage first = CardstackRelatedListService.readPage(String.valueOf(parent.Id), 'children', null);
    CardstackRelatedListService.RelatedPage last = CardstackRelatedListService.readPage(String.valueOf(parent.Id), 'children', first.nextCursor);
    Test.stopTest();
    Assert.areEqual(2, first.rows.size(), 'Equal DATE keys use exact native ID tie breaking.');
    Assert.areEqual('2028-02-29', first.rows[1].cells[0].value, 'Anchor presentation remains calendar-only.');
    Assert.areEqual(1, last.rows.size(), 'Typed continuation crosses the next calendar date without duplicates.');
    Assert.areEqual('2028-03-01', last.rows[0].cells[0].value, 'Native date ordering crosses the leap-day boundary.');
    Assert.isFalse(last.hasMore, 'No phantom continuation.');
    Assert.areNotEqual(first.rows[0].recordId, last.rows[0].recordId, 'Previously displayed row does not recur.');
    Assert.areNotEqual(first.rows[1].recordId, last.rows[0].recordId, 'Exact anchor does not recur.');
  }
  private static void configureOpportunityDates(List<String> columns, String sortField) {
    Cardstack_Config__c config = [SELECT Id FROM Cardstack_Config__c WHERE Name='layout:Account:default' WITH SYSTEM_MODE LIMIT 1];
    config.Value__c = layout('Opportunities', columns, sortField, 'asc', 2);
    update as system config;
  }
  @IsTest
  static void tiesThenNullContinuation() {
    Account p = fixture(5, 'Phone', 'asc');
    Test.startTest();
    CardstackRelatedListService.RelatedPage a = CardstackRelatedListService.readPage(
      String.valueOf(p.Id),
      'children',
      null
    );
    CardstackRelatedListService.RelatedPage b = CardstackRelatedListService.readPage(
      String.valueOf(p.Id),
      'children',
      a.nextCursor
    );
    CardstackRelatedListService.RelatedPage c = CardstackRelatedListService.readPage(
      String.valueOf(p.Id),
      'children',
      b.nextCursor
    );
    Test.stopTest();
    Assert.areEqual(2, a.rows.size(), 'Bounded page');
    Assert.areEqual('111', a.rows[0].cells[1].value, 'Non-null group first');
    Assert.isNull(b.rows[0].cells[1].value, 'Null group next');
    Assert.areEqual(1, c.rows.size(), 'Final remainder');
    Assert.isFalse(c.hasMore, 'No invented continuation');
    Set<String> ids = new Set<String>();
    for (CardstackRelatedListService.Row r : a.rows)
      ids.add(r.recordId);
    for (CardstackRelatedListService.Row r : b.rows)
      ids.add(r.recordId);
    for (CardstackRelatedListService.Row r : c.rows)
      ids.add(r.recordId);
    Assert.areEqual(5, ids.size(), 'Every child exactly once');
  }
  @IsTest
  static void emptyList() {
    Account p = fixture(0, 'Name', 'asc');
    Test.startTest();
    CardstackRelatedListService.RelatedPage a = CardstackRelatedListService.readPage(
      String.valueOf(p.Id),
      'children',
      null
    );
    Test.stopTest();
    Assert.areEqual(0, a.rows.size(), 'Successful empty page');
    Assert.isFalse(a.hasMore, 'No continuation');
    Assert.isNull(a.nextCursor, 'No cursor');
  }
  @IsTest
  static void reparentedAnchor() {
    Account p = fixture(3, 'Name', 'asc');
    CardstackRelatedListService.RelatedPage a = CardstackRelatedListService.readPage(
      String.valueOf(p.Id),
      'children',
      null
    );
    Account other = new Account(Name = 'Other');
    insert as system other;
    update as system new Contact(Id = a.rows[1].recordId, AccountId = other.Id);
    stale(String.valueOf(p.Id), a.nextCursor);
  }
  @IsTest
  static void deletedAnchor() {
    Account p = fixture(3, 'Name', 'asc');
    CardstackRelatedListService.RelatedPage a = CardstackRelatedListService.readPage(
      String.valueOf(p.Id),
      'children',
      null
    );
    delete as system new Contact(Id = a.rows[1].recordId);
    stale(String.valueOf(p.Id), a.nextCursor);
  }
  @IsTest
  static void changedPolicy() {
    Account p = fixture(3, 'Name', 'asc');
    CardstackRelatedListService.RelatedPage a = CardstackRelatedListService.readPage(
      String.valueOf(p.Id),
      'children',
      null
    );
    Cardstack_Config__c config = [
      SELECT Id
      FROM Cardstack_Config__c
      WHERE Name = 'layout:Account:default'
      WITH SYSTEM_MODE
      LIMIT 1
    ];
    config.Value__c = layout(
      'Contacts',
      new List<String>{ 'Name' },
      'Name',
      'desc',
      2
    );
    update as system config;
    stale(String.valueOf(p.Id), a.nextCursor);
  }
  @IsTest
  static void wrongParentRejected() {
    Account p = fixture(1, 'Name', 'asc');
    Account other = new Account(Name = 'Other');
    insert as system other;
    Contact child = [SELECT Id FROM Contact WITH SYSTEM_MODE LIMIT 1];
    Test.startTest();
    try {
      CardstackRelatedListService.checkChild(
        String.valueOf(other.Id),
        'children',
        String.valueOf(child.Id)
      );
      Assert.fail('Membership required');
    } catch (CardstackRelatedListService.RelatedException e) {
      Assert.areEqual('RELATED_UNAVAILABLE', e.getMessage(), 'Bounded failure');
    }
    Test.stopTest();
  }
  @IsTest
  static void checkedChild() {
    Account p = fixture(1, 'Name', 'asc');
    Contact child = [SELECT Id FROM Contact WITH SYSTEM_MODE LIMIT 1];
    Test.startTest();
    String checked = CardstackRelatedListService.checkChild(
      String.valueOf(p.Id),
      'children',
      String.valueOf(child.Id)
    );
    Test.stopTest();
    Assert.areEqual(String.valueOf(child.Id), checked, 'Exact child');
    Assert.areEqual(18, checked.length(), 'Checksum18');
  }
  @IsTest
  static void denylistFailsClosed() {
    Account p = fixture(1, 'Name', 'asc');
    insert as system new Cardstack_Config__c(
      Name = 'layout:Contact:default',
      Is_Active__c = true,
      Value__c = '{"permissions":{"fieldDenylist":["Phone"]}}'
    );
    Test.startTest();
    try {
      CardstackRelatedListService.readPage(
        String.valueOf(p.Id),
        'children',
        null
      );
      Assert.fail('Denied column fails whole list');
    } catch (CardstackRelatedListService.RelatedException e) {
      Assert.areEqual('RELATED_UNAVAILABLE', e.getMessage(), 'Bounded denial');
    }
    Test.stopTest();
  }
  @IsTest
  static void paddedMixedCaseDenylistFailsClosed() {
    Account p = fixture(1, 'Name', 'asc');
    insert as system new Cardstack_Config__c(
      Name = 'layout:Contact:default',
      Is_Active__c = true,
      Value__c = '{"permissions":{"fieldDenylist":[" pHoNe "]}}'
    );
    Test.startTest();
    try {
      CardstackRelatedListService.readPage(
        String.valueOf(p.Id),
        'children',
        null
      );
      Assert.fail('Denied column fails whole list');
    } catch (CardstackRelatedListService.RelatedException e) {
      Assert.areEqual('RELATED_UNAVAILABLE', e.getMessage(), 'Bounded denial');
    }
    Test.stopTest();
  }
  @IsTest
  static void summariesDoNotReadChildren() {
    Account p = fixture(251, 'Name', 'asc');
    Test.startTest();
    List<CardstackRelatedListPolicy.Definition> d = CardstackRelatedListService.listDefinitions(
      String.valueOf(p.Id)
    );
    Integer rows = Limits.getQueryRows();
    Test.stopTest();
    Assert.areEqual(1, d.size(), 'Summary');
    Assert.areEqual(2, rows, 'Only parent and active layout, no child/count');
  }

  @IsTest
  static void changedAnchorSortRequiresRefresh() {
    Account p = fixture(3, 'Name', 'asc');
    CardstackRelatedListService.RelatedPage a = CardstackRelatedListService.readPage(
      String.valueOf(p.Id),
      'children',
      null
    );
    update as system new Contact(
      Id = a.rows[1].recordId,
      LastName = 'Moved sort'
    );
    stale(String.valueOf(p.Id), a.nextCursor);
  }
  @IsTest
  static void crossParentCursorRejected() {
    Account p = fixture(3, 'Name', 'asc');
    Account other = new Account(Name = 'Other');
    insert as system other;
    CardstackRelatedListService.RelatedPage a = CardstackRelatedListService.readPage(
      String.valueOf(p.Id),
      'children',
      null
    );
    stale(String.valueOf(other.Id), a.nextCursor);
  }
  @IsTest
  static void malformedCursorRejected() {
    Account p = fixture(3, 'Name', 'asc');
    stale(String.valueOf(p.Id), 'not-position');
  }
  @IsTest
  static void descendingNullContinuation() {
    Account p = fixture(5, 'Phone', 'desc');
    Test.startTest();
    CardstackRelatedListService.RelatedPage a = CardstackRelatedListService.readPage(
      String.valueOf(p.Id),
      'children',
      null
    );
    CardstackRelatedListService.RelatedPage b = CardstackRelatedListService.readPage(
      String.valueOf(p.Id),
      'children',
      a.nextCursor
    );
    CardstackRelatedListService.RelatedPage c = CardstackRelatedListService.readPage(
      String.valueOf(p.Id),
      'children',
      b.nextCursor
    );
    Test.stopTest();
    Assert.areEqual(
      '111',
      a.rows[0].cells[1].value,
      'Descending still places nulls last'
    );
    Assert.isNull(b.rows[0].cells[1].value, 'Nulls remain last');
    Assert.areEqual(1, c.rows.size(), 'Null tie continuation');
  }
  @IsTest
  static void opportunityNativeCurrency() {
    Account p = fixture(0, 'Name', 'asc');
    String stage;
    for (
      Schema.PicklistEntry entry : Opportunity.StageName.getDescribe()
        .getPicklistValues()
    )
      if (entry.isActive()) {
        stage = entry.getValue();
        break;
      }
    Opportunity child = new Opportunity(
      AccountId = p.Id,
      Name = 'Currency child',
      StageName = stage,
      CloseDate = Date.today(),
      Amount = 1234.56
    );
    insert as system child;
    Cardstack_Config__c cfg = [
      SELECT Id
      FROM Cardstack_Config__c
      WHERE Name = 'layout:Account:default'
      WITH SYSTEM_MODE
      LIMIT 1
    ];
    cfg.Value__c = layout(
      'Opportunities',
      new List<String>{ 'Name', 'Amount' },
      'CloseDate',
      'asc',
      2
    );
    update as system cfg;
    String expected = UserInfo.getDefaultCurrency();
    if (
      Opportunity.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED)
        .fields.getMap()
        .containsKey('CurrencyIsoCode')
    )
      expected = (String) Database.queryWithBinds(
          'SELECT CurrencyIsoCode FROM Opportunity WHERE Id=:childId',
          new Map<String, Object>{ 'childId' => child.Id },
          AccessLevel.USER_MODE
        )[0]
        .get('CurrencyIsoCode');
    Test.startTest();
    CardstackRelatedListService.RelatedPage a = CardstackRelatedListService.readPage(
      String.valueOf(p.Id),
      'children',
      null
    );
    Test.stopTest();
    Assert.areEqual(
      '1234.56',
      a.rows[0].cells[1].value,
      'Exact decimal literal'
    );
    Assert.areEqual(
      expected,
      a.rows[0].cells[1].currencyCode,
      'Record currency or native default'
    );
  }

  @IsTest
  static void unpublishedParentExposesNoHeader() {
    Account p = new Account(Name = 'Unpublished private header');
    insert as system p;
    Test.startTest();
    try {
      CardstackRelatedListService.parentIdentity(String.valueOf(p.Id));
      Assert.fail('No active parent layout means no published related scope');
    } catch (CardstackRelatedListService.RelatedException e) {
      Assert.areEqual(
        'RELATED_UNAVAILABLE',
        e.getMessage(),
        'No private parent title in failure'
      );
    }
    Test.stopTest();
  }
  @IsTest
  static void inactiveParentExposesNoHeader() {
    Account p = fixture(0, 'Name', 'asc');
    Cardstack_Config__c cfg = [
      SELECT Id
      FROM Cardstack_Config__c
      WHERE Name = 'layout:Account:default'
      WITH SYSTEM_MODE
      LIMIT 1
    ];
    cfg.Is_Active__c = false;
    update as system cfg;
    Test.startTest();
    try {
      CardstackRelatedListService.parentIdentity(String.valueOf(p.Id));
      Assert.fail('Inactive layout cannot authorize parent title');
    } catch (CardstackRelatedListService.RelatedException e) {
      Assert.areEqual('RELATED_UNAVAILABLE', e.getMessage(), 'Bounded failure');
    }
    Test.stopTest();
  }
  private static void stale(String parentId, String cursor) {
    Test.startTest();
    try {
      CardstackRelatedListService.readPage(parentId, 'children', cursor);
      Assert.fail('Restart stale continuation');
    } catch (CardstackRelatedListService.RelatedException e) {
      Assert.areEqual('PAGE_STALE', e.getMessage(), 'Bounded cursor failure');
    }
    Test.stopTest();
  }
}
