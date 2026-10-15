/** Describe-derived related-list projection; candidates never authorize runtime reads. */
public with sharing class CardstackRelatedListPolicy {
  public class PolicyException extends Exception {
  }
  public class Column {
    public String fieldApi;
    public String label;
    public String dataType;
    public Integer precision;
    public Integer scale;
    public Boolean sortable;
  }
  public class Definition {
    public String key;
    public String relationship;
    public String childObjectApiName;
    public String label;
    public List<Column> columns = new List<Column>();
    public String sortField;
    public String sortDirection;
    public Integer pageSize;
    public String fingerprint;
    public String lookupField;
    public String nameField;
    public String currencyField;
  }
  private static final Set<String> TYPES = new Set<String>{
    'STRING',
    'TEXTAREA',
    'BOOLEAN',
    'INTEGER',
    'DATE',
    'DATETIME',
    'TIME',
    'DOUBLE',
    'CURRENCY',
    'PERCENT',
    'EMAIL',
    'PHONE',
    'URL',
    'PICKLIST'
  };
  /** Candidate-only validation hook for existing save and reviewed-publish boundaries. */
  public static void validateLayout(String configKey, String rawCandidate) {
    if (configKey == null || !configKey.startsWith('layout:'))
      return;
    try {
      if (!Pattern.matches('layout:[A-Za-z][A-Za-z0-9_]*:default', configKey))
        throw new PolicyException('RELATED_UNAVAILABLE');
      parse(configKey.split(':')[1], rawCandidate);
    } catch (Exception failure) {
      throw new PolicyException('RELATED_UNAVAILABLE');
    }
  }
  /** Native metadata catalog; no CRM rows and no candidate grants. */
  public static List<Definition> catalog(String parentObjectApi) {
    Schema.DescribeSObjectResult parent = describe(parentObjectApi);
    List<Definition> result = new List<Definition>();
    for (
      Schema.ChildRelationship relationship : parent.getChildRelationships()
    ) {
      if (
        relationship.getRelationshipName() == null ||
        relationship.isDeprecatedAndHidden() ||
        relationship.getField() == null
      )
        continue;
      Schema.DescribeSObjectResult child = relationship.getChildSObject()
        .getDescribe();
      if (!child.isAccessible() || !child.isQueryable())
        continue;
      Definition d = new Definition();
      d.relationship = relationship.getRelationshipName();
      d.childObjectApiName = child.getName();
      d.label = child.getLabelPlural();
      Map<String, Schema.SObjectField> fields = child.fields.getMap();
      for (Schema.SObjectField nativeField : fields.values()) {
        Schema.DescribeFieldResult f = nativeField.getDescribe();
        if (f.isAccessible() && scalar(f))
          d.columns.add(column(f));
      }
      if (!d.columns.isEmpty())
        result.add(d);
    }
    return result;
  }
  /** Reload active parent layout and child denylists; no transaction cache. */
  public static List<Definition> resolve(String parentObjectApi) {
    String parentLayout = CardstackRelatedListSelector.config(
      'layout:' + parentObjectApi + ':default'
    );
    if (parentLayout == null)
      throw new PolicyException('RELATED_UNAVAILABLE');
    List<Definition> result = parse(parentObjectApi, parentLayout);
    Map<String, Set<String>> denyByObject = new Map<String, Set<String>>();
    Set<String> objects = new Set<String>();
    for (Definition d : result)
      objects.add(d.childObjectApiName);
    Map<String, String> rawByObject = CardstackRelatedListSelector.childLayouts(
      objects
    );
    for (String api : objects)
      denyByObject.put(api, deniedFields(rawByObject.get(api)));
    for (Definition d : result) {
      Set<String> denied = denyByObject.get(d.childObjectApiName);
      if (
        denied.contains(d.nameField.toLowerCase()) ||
        denied.contains(d.sortField.toLowerCase()) ||
        (d.currencyField != null &&
        denied.contains(d.currencyField.toLowerCase()))
      )
        throw new PolicyException('RELATED_UNAVAILABLE');
      for (Column c : d.columns)
        if (denied.contains(c.fieldApi.toLowerCase()))
          throw new PolicyException('RELATED_UNAVAILABLE');
      List<String> sortedDenied = new List<String>(denied);
      sortedDenied.sort();
      d.fingerprint = digest(d.fingerprint + JSON.serialize(sortedDenied));
    }
    return result;
  }
  @TestVisible
  private static List<Definition> parse(String parentObjectApi, String raw) {
    try {
      Schema.DescribeSObjectResult parent = describe(parentObjectApi);
      List<Definition> result = new List<Definition>();
      if (raw == null)
        return result;
      Map<String, Object> layout = (Map<String, Object>) JSON.deserializeUntyped(
        raw
      );
      if (layout == null)
        throw new PolicyException('RELATED_UNAVAILABLE');
      Object entries = layout.get('relatedLists');
      if (
        !layout.containsKey('relatedLists') &&
        layout.get('recordCard') instanceof Map<String, Object>
      )
        entries = ((Map<String, Object>) layout.get('recordCard'))
          .get('relatedLists');
      if (entries == null && !layout.containsKey('relatedLists'))
        return result;
      if (
        !(entries instanceof List<Object>) ||
        ((List<Object>) entries).size() > 6
      )
        throw new PolicyException('RELATED_UNAVAILABLE');
      Set<String> seen = new Set<String>();
      for (Object entry : (List<Object>) entries) {
        if (!(entry instanceof Map<String, Object>))
          throw new PolicyException('RELATED_UNAVAILABLE');
        Map<String, Object> value = (Map<String, Object>) entry;
        closed(
          value,
          new Set<String>{
            'key',
            'relationship',
            'columns',
            'sort',
            'pageSize'
          }
        );
        String listKey = text(value.get('key'));
        if (
          !Pattern.matches('[A-Za-z0-9_-]{1,80}', listKey) ||
          seen.contains(listKey)
        )
          throw new PolicyException('RELATED_UNAVAILABLE');
        seen.add(listKey);
        Definition d = nativeDefinition(
          parent,
          text(value.get('relationship'))
        );
        d.key = listKey;
        if (!(value.get('columns') instanceof List<Object>))
          throw new PolicyException('RELATED_UNAVAILABLE');
        List<Object> columns = (List<Object>) value.get('columns');
        if (columns.isEmpty() || columns.size() > 8)
          throw new PolicyException('RELATED_UNAVAILABLE');
        Map<String, Schema.SObjectField> fields = describe(d.childObjectApiName)
          .fields.getMap();
        Set<String> projected = new Set<String>();
        Boolean hasCurrency = false;
        for (Object api : columns) {
          Schema.DescribeFieldResult f = field(fields, text(api), false);
          if (projected.contains(f.getName()))
            throw new PolicyException('RELATED_UNAVAILABLE');
          projected.add(f.getName());
          d.columns.add(column(f));
          hasCurrency = hasCurrency || f.getType() == Schema.DisplayType.Currency;
        }
        if (!(value.get('sort') instanceof Map<String, Object>))
          throw new PolicyException('RELATED_UNAVAILABLE');
        Map<String, Object> sortDefinition = (Map<String, Object>) value.get('sort');
        closed(sortDefinition, new Set<String>{ 'field', 'direction' });
        d.sortField = field(fields, text(sortDefinition.get('field')), true).getName();
        d.sortDirection = text(sortDefinition.get('direction'));
        if (!d.sortDirection.equals('asc') && !d.sortDirection.equals('desc'))
          throw new PolicyException('RELATED_UNAVAILABLE');
        d.pageSize = 10;
        if (value.containsKey('pageSize')) {
          Object size = value.get('pageSize');
          if (!(size instanceof Integer) && !(size instanceof Decimal))
            throw new PolicyException('RELATED_UNAVAILABLE');
          Decimal n = Decimal.valueOf(String.valueOf(size));
          if (n < 1 || n > 50 || n != n.setScale(0))
            throw new PolicyException('RELATED_UNAVAILABLE');
          d.pageSize = n.intValue();
        }
        if (hasCurrency && fields.containsKey('CurrencyIsoCode'))
          d.currencyField = field(fields, 'CurrencyIsoCode', false).getName();
        d.fingerprint = digest(JSON.serialize(d));
        result.add(d);
      }
      return result;
    } catch (Exception failure) {
      throw new PolicyException('RELATED_UNAVAILABLE');
    }
  }
  private static Definition nativeDefinition(
    Schema.DescribeSObjectResult parent,
    String relationshipName
  ) {
    for (Schema.ChildRelationship relationship : parent.getChildRelationships())
      if (
        relationship.getRelationshipName() == relationshipName &&
        !relationship.isDeprecatedAndHidden() &&
        relationship.getField() != null
      ) {
        Schema.DescribeSObjectResult child = describe(
          relationship.getChildSObject().getDescribe().getName()
        );
        Schema.DescribeFieldResult lookup = relationship.getField()
          .getDescribe();
        if (!lookup.isAccessible() || !lookup.isFilterable())
          throw new PolicyException('RELATED_UNAVAILABLE');
        Definition d = new Definition();
        d.relationship = relationship.getRelationshipName();
        d.childObjectApiName = child.getName();
        d.lookupField = lookup.getName();
        d.nameField = nameField(child);
        d.label = child.getLabelPlural();
        return d;
      }
    throw new PolicyException('RELATED_UNAVAILABLE');
  }
  /** Native readable name field, including CaseNumber; never guesses Name. */
  public static String nameField(Schema.DescribeSObjectResult objectDescribe) {
    for (Schema.SObjectField f : objectDescribe.fields.getMap().values())
      if (f.getDescribe().isNameField()) {
        if (!f.getDescribe().isAccessible())
          throw new PolicyException('RELATED_UNAVAILABLE');
        return f.getDescribe().getName();
      }
    throw new PolicyException('RELATED_UNAVAILABLE');
  }
  private static Schema.DescribeSObjectResult describe(String api) {
    Schema.SObjectType objectType = Schema.getGlobalDescribe().get(api);
    if (
      objectType == null ||
      !objectType.getDescribe().isAccessible() ||
      !objectType.getDescribe().isQueryable()
    )
      throw new PolicyException('RELATED_UNAVAILABLE');
    return objectType.getDescribe();
  }
  private static Schema.DescribeFieldResult field(
    Map<String, Schema.SObjectField> fields,
    String api,
    Boolean sortFieldDescribe
  ) {
    if (
      !Pattern.matches('[A-Za-z][A-Za-z0-9_]*', api) || !fields.containsKey(api)
    )
      throw new PolicyException('RELATED_UNAVAILABLE');
    Schema.DescribeFieldResult f = fields.get(api).getDescribe();
    if (
      !f.isAccessible() ||
      (!scalar(f) && !(sortFieldDescribe && f.getName() == 'Id')) ||
      (sortFieldDescribe &&
      (!f.isFilterable() ||
      !f.isSortable() ||
      f.getType() == Schema.DisplayType.Boolean))
    )
      throw new PolicyException('RELATED_UNAVAILABLE');
    return f;
  }
  private static Boolean scalar(Schema.DescribeFieldResult f) {
    return TYPES.contains(String.valueOf(f.getType()).toUpperCase()) &&
      f.getType() != Schema.DisplayType.Id &&
      f.getType() != Schema.DisplayType.Reference &&
      !f.isEncrypted();
  }
  private static Column column(Schema.DescribeFieldResult f) {
    Column c = new Column();
    c.fieldApi = f.getName();
    c.label = f.getLabel();
    c.dataType = String.valueOf(f.getType()).toUpperCase();
    c.sortable =
      f.isSortable() &&
      f.isFilterable() &&
      f.getType() != Schema.DisplayType.Boolean;
    if (
      new Set<String>{ 'INTEGER', 'DOUBLE', 'CURRENCY', 'PERCENT' }
        .contains(c.dataType)
    ) {
      c.precision = c.dataType == 'INTEGER' ? 10 : f.getPrecision();
      c.scale = c.dataType == 'INTEGER' ? 0 : f.getScale();
    }
    return c;
  }
  private static Set<String> deniedFields(String raw) {
    Set<String> denied = new Set<String>();
    if (raw == null)
      return denied;
    try {
      Map<String, Object> config = (Map<String, Object>) JSON.deserializeUntyped(
        raw
      );
      if (config == null)
        throw new PolicyException('RELATED_UNAVAILABLE');
      if (config.get('permissions') == null)
        return denied;
      Map<String, Object> permissions = (Map<String, Object>) config.get(
        'permissions'
      );
      if (permissions.get('fieldDenylist') == null)
        return denied;
      for (Object api : (List<Object>) permissions.get('fieldDenylist'))
        denied.add(text(api).trim().toLowerCase());
      return denied;
    } catch (Exception failure) {
      throw new PolicyException('RELATED_UNAVAILABLE');
    }
  }
  private static String text(Object value) {
    if (!(value instanceof String) || String.isBlank((String) value))
      throw new PolicyException('RELATED_UNAVAILABLE');
    return (String) value;
  }
  private static void closed(Map<String, Object> raw, Set<String> allowed) {
    for (String key : raw.keySet())
      if (!allowed.contains(key))
        throw new PolicyException('RELATED_UNAVAILABLE');
  }
  private static String digest(String value) {
    return EncodingUtil.convertToHex(
      Crypto.generateDigest('SHA-256', Blob.valueOf(value))
    );
  }
}
