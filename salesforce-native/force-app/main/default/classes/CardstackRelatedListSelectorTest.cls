/** Selector authority order and read-only boundaries. */
@IsTest(SeeAllData=false)
private with sharing class CardstackRelatedListSelectorTest {
  @IsTest
  static void missingParentReadsNoChildren() {
    String nonexistent = CardstackConnectionTypes.normalizeId(
      '001000000000001'
    );
    Test.startTest();
    try {
      CardstackRelatedListService.readPage(nonexistent, 'children', null);
      Assert.fail('Missing parent cannot expose any child');
    } catch (CardstackRelatedListService.RelatedException failure) {
      Assert.areEqual(
        'RELATED_UNAVAILABLE',
        failure.getMessage(),
        'Missing parent sanitized'
      );
    }
    Assert.areEqual(
      1,
      Limits.getQueries(),
      'Only parent query precedes rejection'
    );
    Assert.areEqual(
      0,
      Limits.getDmlStatements(),
      'Related service is read only'
    );
    Test.stopTest();
  }
  @IsTest
  static void nullParentRejectedBeforeQueries() {
    Test.startTest();
    try {
      CardstackRelatedListSelector.parent(null);
      Assert.fail('Parent required');
    } catch (CardstackRelatedListSelector.ReadException failure) {
      Assert.areEqual(
        'RELATED_UNAVAILABLE',
        failure.getMessage(),
        'Sanitized denial'
      );
    }
    Assert.areEqual(0, Limits.getQueries(), 'No child reads without parent');
    Test.stopTest();
  }
  @IsTest
  static void caseParentUsesNativeName() {
    Case parent = new Case(Subject = 'Related Case parent');
    insert as system parent;
    Case expected = [
      SELECT Id, CaseNumber
      FROM Case
      WHERE Id = :parent.Id
      WITH USER_MODE
      LIMIT 1
    ];
    Test.startTest();
    SObject read = CardstackRelatedListSelector.parent(parent.Id);
    Test.stopTest();
    Assert.areEqual(
      expected.CaseNumber,
      read.get('CaseNumber'),
      'Parent identity uses native CaseNumber'
    );
  }
}
