/** All native related-list queries use connected-user rights and sharing. */
public inherited sharing class CardstackRelatedListSelector {
  public class ReadException extends Exception {
  }
  /** Parent must be read before any child or anchor query. */
  public static SObject parent(Id recordId) {
    if (recordId == null || UserInfo.getUserType() == 'Guest')
      throw new ReadException('RELATED_UNAVAILABLE');
    Schema.DescribeSObjectResult d = recordId.getSObjectType().getDescribe();
    String name = CardstackRelatedListPolicy.nameField(d);
    List<SObject> rows = Database.queryWithBinds(
      'SELECT Id,' +
        name +
        ' FROM ' +
        d.getName() +
        ' WHERE Id=:parentId LIMIT 1',
      new Map<String, Object>{ 'parentId' => recordId },
      AccessLevel.USER_MODE
    );
    if (rows.isEmpty())
      throw new ReadException('RELATED_UNAVAILABLE');
    return rows[0];
  }
  /** Active layout only; drafts never reach execution. */
  public static String config(String key) {
    List<Cardstack_Config__c> rows = [
      SELECT Value__c
      FROM Cardstack_Config__c
      WHERE Name = :key AND Is_Active__c = TRUE
      WITH USER_MODE
      LIMIT 1
    ];
    return rows.isEmpty() ? null : rows[0].Value__c;
  }
  /** One bounded query for child restrictive policies, outside relationship loops. */
  public static Map<String, String> childLayouts(Set<String> objects) {
    Map<String, String> result = new Map<String, String>();
    if (objects == null || objects.isEmpty())
      return result;
    Set<String> keys = new Set<String>();
    for (String api : objects)
      keys.add('layout:' + api + ':default');
    for (Cardstack_Config__c row : [
      SELECT Name, Value__c
      FROM Cardstack_Config__c
      WHERE Name IN :keys AND Is_Active__c = TRUE
      WITH USER_MODE
      LIMIT 6
    ]) {
      result.put(row.Name.split(':')[1], row.Value__c);
    }
    return result;
  }
  /** Exact checked membership, also used to reread a continuation anchor. */
  public static SObject child(
    Id parentId,
    CardstackRelatedListPolicy.Definition d,
    Id childId
  ) {
    if (
      parentId == null ||
      d == null ||
      childId == null ||
      childId.getSObjectType().getDescribe().getName() != d.childObjectApiName
    )
      throw new ReadException('RELATED_UNAVAILABLE');
    List<SObject> rows = Database.queryWithBinds(
      'SELECT ' +
        projection(d) +
        ' FROM ' +
        d.childObjectApiName +
        ' WHERE ' +
        d.lookupField +
        '=:parentId AND Id=:childId LIMIT 1',
      new Map<String, Object>{ 'parentId' => parentId, 'childId' => childId },
      AccessLevel.USER_MODE
    );
    if (rows.isEmpty())
      throw new ReadException('RELATED_UNAVAILABLE');
    return rows[0];
  }
  /** Native typed keyset seek with NULLS LAST and Id tie breaker. */
  public static List<SObject> page(
    Id parentId,
    CardstackRelatedListPolicy.Definition d,
    SObject anchor
  ) {
    if (parentId == null || d == null)
      throw new ReadException('RELATED_UNAVAILABLE');
    Map<String, Object> binds = new Map<String, Object>{
      'parentId' => parentId,
      'bound' => d.pageSize + 1
    };
    String seek = '';
    if (anchor != null) {
      binds.put('anchorId', anchor.Id);
      if (d.sortField == 'Id')
        seek = ' AND Id' + (d.sortDirection == 'asc' ? '>' : '<') + ':anchorId';
      else {
        Object value = anchor.get(d.sortField);
        binds.put('sortValue', value);
        seek = value == null
          ? ' AND (' + d.sortField + ' = null AND Id > :anchorId)'
          : ' AND (' +
            d.sortField +
            (d.sortDirection == 'asc' ? ' > ' : ' < ') +
            ':sortValue OR (' +
            d.sortField +
            ' = :sortValue AND Id > :anchorId) OR ' +
            d.sortField +
            ' = null)';
      }
    }
    String order = d.sortField + ' ' + d.sortDirection.toUpperCase();
    if (d.sortField != 'Id')
      order += ' NULLS LAST, Id ASC';
    return Database.queryWithBinds(
      'SELECT ' +
        projection(d) +
        ' FROM ' +
        d.childObjectApiName +
        ' WHERE ' +
        d.lookupField +
        '=:parentId' +
        seek +
        ' ORDER BY ' +
        order +
        ' LIMIT :bound',
      binds,
      AccessLevel.USER_MODE
    );
  }
  private static String projection(CardstackRelatedListPolicy.Definition d) {
    Set<String> fields = new Set<String>{ 'Id', d.nameField, d.sortField };
    for (CardstackRelatedListPolicy.Column c : d.columns)
      fields.add(c.fieldApi);
    if (d.currencyField != null)
      fields.add(d.currencyField);
    List<String> ordered = new List<String>(fields);
    ordered.sort();
    return String.join(ordered, ',');
  }
}
