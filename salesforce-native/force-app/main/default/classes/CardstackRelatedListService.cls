/** Fresh native related-list authorization and bounded position-only pagination. */
public with sharing class CardstackRelatedListService {
  public class RelatedException extends Exception {
  }
  public class Identity {
    public String recordId;
    public String objectApiName;
    public String recordName;
  }
  public class Cell {
    public String fieldApi;
    public String value;
    public String currencyCode;
  }
  public class Row {
    public String recordId;
    public String recordName;
    public List<Cell> cells = new List<Cell>();
  }
  public class RelatedPage {
    public String contractVersion = 'record-related-page/v1';
    public Identity parent;
    public String listKey;
    public String relationship;
    public String childObjectApiName;
    public String label;
    public String definitionFingerprint;
    public List<CardstackRelatedListPolicy.Column> columns;
    public List<Row> rows = new List<Row>();
    public Boolean hasMore = false;
    public String nextCursor;
  }
  private class Cursor {
    public Integer version = 1;
    public String parentId;
    public String listKey;
    public String fingerprint;
    public String anchorId;
    public String anchorSortHash;
  }
  /** No counts or child rows are read when opening the Related tab. */
  public static List<CardstackRelatedListPolicy.Definition> listDefinitions(
    String parentId
  ) {
    try {
      SObject parent = CardstackRelatedListSelector.parent(identity(parentId));
      return CardstackRelatedListPolicy.resolve(
        parent.getSObjectType().getDescribe().getName()
      );
    } catch (Exception failure) {
      throw new RelatedException(code(failure, 'RELATED_UNAVAILABLE'));
    }
  }
  /** Parent read and fresh policy resolution precede anchor/child reads. */
  public static RelatedPage readPage(String parentId, String listKey, String cursor) {
    try {
      Id parentIdentity = identity(parentId);
      SObject parent = CardstackRelatedListSelector.parent(parentIdentity);
      CardstackRelatedListPolicy.Definition d = definition(parent, listKey);
      SObject anchor;
      if (cursor != null)
        anchor = anchor(parentIdentity, d, cursor);
      List<SObject> records = CardstackRelatedListSelector.page(
        parentIdentity,
        d,
        anchor
      );
      RelatedPage page = new RelatedPage();
      page.parent = parentView(parent);
      page.listKey = d.key;
      page.relationship = d.relationship;
      page.childObjectApiName = d.childObjectApiName;
      page.label = d.label;
      page.definitionFingerprint = d.fingerprint;
      page.columns = d.columns;
      page.hasMore = records.size() > d.pageSize;
      if (page.hasMore)
        records.remove(records.size() - 1);
      for (SObject record : records)
        page.rows.add(row(d, record));
      if (page.hasMore) {
        SObject last = records[records.size() - 1];
        Cursor c = new Cursor();
        c.parentId = String.valueOf(parentIdentity);
        c.listKey = d.key;
        c.fingerprint = d.fingerprint;
        c.anchorId = String.valueOf(last.Id);
        c.anchorSortHash = sortHash(d, last);
        page.nextCursor = EncodingUtil.base64Encode(
          Blob.valueOf(JSON.serialize(c))
        );
      }
      return page;
    } catch (Exception failure) {
      throw new RelatedException(code(failure, 'RELATED_UNAVAILABLE'));
    }
  }
  /** Navigation is membership only; existing card/editor performs independent grants. */
  public static String checkChild(
    String parentId,
    String listKey,
    String childId
  ) {
    try {
      Id parentIdentity = identity(parentId);
      SObject parent = CardstackRelatedListSelector.parent(parentIdentity);
      CardstackRelatedListPolicy.Definition d = definition(parent, listKey);
      SObject child = CardstackRelatedListSelector.child(
        parentIdentity,
        d,
        identity(childId)
      );
      return String.valueOf(child.Id);
    } catch (Exception failure) {
      throw new RelatedException(code(failure, 'RELATED_UNAVAILABLE'));
    }
  }
  /** Authorized native parent chrome; useful for a checked summary envelope. */
  public static Identity parentIdentity(String parentId) {
    try {
      SObject parent = CardstackRelatedListSelector.parent(identity(parentId));
      CardstackRelatedListPolicy.resolve(
        parent.getSObjectType().getDescribe().getName()
      );
      return parentView(parent);
    } catch (Exception failure) {
      throw new RelatedException(code(failure, 'RELATED_UNAVAILABLE'));
    }
  }
  private static CardstackRelatedListPolicy.Definition definition(
    SObject parent,
    String listKey
  ) {
    if (
      String.isBlank(listKey) ||
      !Pattern.matches('[A-Za-z0-9_-]{1,80}', listKey)
    )
      throw new RelatedException('INVALID_REQUEST');
    for (
      CardstackRelatedListPolicy.Definition d : CardstackRelatedListPolicy.resolve(
        parent.getSObjectType().getDescribe().getName()
      )
    )
      if (d.key.equals(listKey))
        return d;
    throw new RelatedException('RELATED_UNAVAILABLE');
  }
  private static SObject anchor(
    Id parentId,
    CardstackRelatedListPolicy.Definition d,
    String raw
  ) {
    try {
      if (raw.length() > 2048 || !Pattern.matches('[A-Za-z0-9+/=]+', raw))
        throw new RelatedException('PAGE_STALE');
      String decoded = EncodingUtil.base64Decode(raw).toString();
      Map<String, Object> shape = (Map<String, Object>) JSON.deserializeUntyped(
        decoded
      );
      if (shape == null || shape.size() != 6)
        throw new RelatedException('PAGE_STALE');
      Cursor c = (Cursor) JSON.deserializeStrict(decoded, Cursor.class);
      if (
        c.version != 1 ||
        !String.valueOf(parentId).equals(c.parentId) ||
        !d.key.equals(c.listKey) ||
        !d.fingerprint.equals(c.fingerprint)
      )
        throw new RelatedException('PAGE_STALE');
      SObject record = CardstackRelatedListSelector.child(
        parentId,
        d,
        identity(c.anchorId)
      );
      if (!sortHash(d, record).equals(c.anchorSortHash))
        throw new RelatedException('PAGE_STALE');
      return record;
    } catch (Exception failure) {
      throw new RelatedException('PAGE_STALE');
    }
  }
  private static Row row(
    CardstackRelatedListPolicy.Definition d,
    SObject record
  ) {
    Row row = new Row();
    row.recordId = String.valueOf(record.Id);
    row.recordName = literal(record.get(d.nameField));
    for (CardstackRelatedListPolicy.Column column : d.columns) {
      Cell cell = new Cell();
      cell.fieldApi = column.fieldApi;
      cell.value = literal(record.get(column.fieldApi), column.dataType);
      if (column.dataType == 'CURRENCY') {
        cell.currencyCode = d.currencyField == null
          ? UserInfo.getDefaultCurrency()
          : (String) record.get(d.currencyField);
        if (
          cell.currencyCode == null ||
          !Pattern.matches('[A-Z]{3}', cell.currencyCode)
        )
          throw new RelatedException('RELATED_UNAVAILABLE');
      }
      row.cells.add(cell);
    }
    return row;
  }
  private static Identity parentView(SObject parent) {
    Identity result = new Identity();
    result.recordId = String.valueOf(parent.Id);
    Schema.DescribeSObjectResult d = parent.getSObjectType().getDescribe();
    result.objectApiName = d.getName();
    result.recordName = literal(
      parent.get(CardstackRelatedListPolicy.nameField(d))
    );
    return result;
  }
  private static Id identity(String raw) {
    try {
      return (Id) CardstackConnectionTypes.normalizeId(raw);
    } catch (Exception failure) {
      throw new RelatedException('INVALID_REQUEST');
    }
  }
  /** Native column type keeps calendar dates distinct from timestamp coercion. */
  private static String literal(Object value, String dataType) {
    if (value != null && dataType == 'DATE') {
      Date calendar = (Date) value;
      String year = String.valueOf(calendar.year());
      while (year.length() < 4) year = '0' + year;
      return year + '-' + (calendar.month() < 10 ? '0' : '') + String.valueOf(calendar.month())
        + '-' + (calendar.day() < 10 ? '0' : '') + String.valueOf(calendar.day());
    }
    return literal(value);
  }
  private static String literal(Object value) {
    if (value == null)
      return null;
    if (String.valueOf(value).length() > 4096)
      throw new RelatedException('RELATED_UNAVAILABLE');
    if (value instanceof Datetime)
      return ((Datetime) value).formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\'');
    return String.valueOf(value);
  }
  private static String sortHash(
    CardstackRelatedListPolicy.Definition d,
    SObject row
  ) {
    return EncodingUtil.convertToHex(
      Crypto.generateDigest(
        'SHA-256',
        Blob.valueOf(JSON.serialize(row.get(d.sortField)))
      )
    );
  }
  private static String code(Exception failure, String fallback) {
    String message = failure.getMessage();
    return new Set<String>{
          'INVALID_REQUEST',
          'PAGE_STALE',
          'RELATED_UNAVAILABLE'
        }
        .contains(message)
      ? message
      : fallback;
  }
}
