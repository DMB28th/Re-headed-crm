/** Candidate metadata rules without persistent grants. */
@IsTest(SeeAllData=false)
private with sharing class CardstackRelatedListPolicyTest {
  @IsTest
  static void absentMeansDisabled() {
    Test.startTest();
    List<CardstackRelatedListPolicy.Definition> d = CardstackRelatedListPolicy.parse(
      'Account',
      '{}'
    );
    Test.stopTest();
    Assert.areEqual(0, d.size(), 'Absent relatedLists enables none');
  }
  @IsTest
  static void nativeMetadataAndColumnOrder() {
    Test.startTest();
    List<CardstackRelatedListPolicy.Definition> d = CardstackRelatedListPolicy.parse(
      'Account',
      layout('Contacts', new List<String>{ 'Phone', 'Name' }, 'Name', 'asc', 2)
    );
    Test.stopTest();
    Assert.areEqual('Contact', d[0].childObjectApiName, 'Native child object');
    Assert.areEqual('AccountId', d[0].lookupField, 'Native lookup');
    Assert.areEqual('Phone', d[0].columns[0].fieldApi, 'Configured order');
  }
  @IsTest
  static void caseNativeName() {
    Test.startTest();
    List<CardstackRelatedListPolicy.Definition> d = CardstackRelatedListPolicy.parse(
      'Account',
      layout('Cases', new List<String>{ 'Subject' }, 'CaseNumber', 'asc', 2)
    );
    Test.stopTest();
    Assert.areEqual('CaseNumber', d[0].nameField, 'Native Case name field');
  }
  @IsTest
  static void nativeIntegerColumnsUseCodecPrecision() {
    String relationship;
    for(Schema.ChildRelationship child:Account.SObjectType.getDescribe().getChildRelationships()) {
      if(child.getChildSObject()==Account.SObjectType && child.getField()!=null && child.getField().getDescribe().getName()=='ParentId') relationship=child.getRelationshipName();
    }
    Assert.isNotNull(relationship,'Native Account child relationship is available.');
    Test.startTest();
    List<CardstackRelatedListPolicy.Definition> definitions=CardstackRelatedListPolicy.parse('Account',layout(relationship,new List<String>{'NumberOfEmployees'},'Name','asc',2));
    Test.stopTest();
    Assert.areEqual('INTEGER',definitions[0].columns[0].dataType,'Native integer type remains exact.');
    Assert.areEqual(10,definitions[0].columns[0].precision,'Integer wire precision uses the shared signed native codec bound.');
    Assert.areEqual(0,definitions[0].columns[0].scale,'Integer scale is zero.');
  }
  @IsTest
  static void identifiersRejected() {
    reject(layout('Contacts', new List<String>{ 'Id' }, 'Name', 'asc', 2));
  }
  @IsTest
  static void traversalsRejected() {
    reject(
      layout('Contacts', new List<String>{ 'Account.Name' }, 'Name', 'asc', 2)
    );
  }
  @IsTest
  static void unsupportedSortRejected() {
    reject(
      layout('Contacts', new List<String>{ 'Name' }, 'Description', 'asc', 2)
    );
  }
  @IsTest
  static void unknownRelationshipRejected() {
    reject(layout('NotNative', new List<String>{ 'Name' }, 'Name', 'asc', 2));
  }
  @IsTest
  static void pageBoundRejected() {
    reject(layout('Contacts', new List<String>{ 'Name' }, 'Name', 'asc', 51));
  }
  @IsTest
  static void queryAuthorityRejected() {
    Map<String, Object> raw = (Map<String, Object>) JSON.deserializeUntyped(
      layout('Contacts', new List<String>{ 'Name' }, 'Name', 'asc', 2)
    );
    ((Map<String, Object>) ((List<Object>) raw.get('relatedLists'))[0])
      .put('foreignKey', 'OwnerId');
    reject(JSON.serialize(raw));
  }
  public static String layout(
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
  private static void reject(String raw) {
    Test.startTest();
    try {
      CardstackRelatedListPolicy.validateLayout('layout:Account:default', raw);
      Assert.fail('Must fail closed');
    } catch (CardstackRelatedListPolicy.PolicyException e) {
      Assert.areEqual('RELATED_UNAVAILABLE', e.getMessage(), 'Bounded error');
    }
    Test.stopTest();
  }
}
