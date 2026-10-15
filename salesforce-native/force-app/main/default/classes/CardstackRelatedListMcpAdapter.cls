/** App-only related reads and checked navigation through the existing record authority. */
public with sharing class CardstackRelatedListMcpAdapter {
  private static final String DEFINITIONS = 'cardstack_record_related_definitions';
  private static final String PAGE = 'cardstack_record_related_page';
  private static final String CHILD = 'cardstack_record_related_open_child';
  public class AdapterException extends Exception {
  }
  /** Three closed app-only helpers return data to the already mounted workspace. */
  public static List<Object> tools() {
    return tools(CardstackRecordMcpAdapter.resourceUri());
  }
  /** Pure app-only schemas do not advertise a separate widget render target. */
  public static List<Object> tools(String uri) {
    List<Object> result = new List<Object>();
    for (String name : new List<String>{ DEFINITIONS, PAGE, CHILD }) {
      Map<String, Object> properties = new Map<String, Object>{
        'parentId' => new Map<String, Object>{ 'type' => 'string' }
      };
      List<String> required = new List<String>{ 'parentId' };
      if (name != DEFINITIONS) {
        properties.put(
          'listKey',
          new Map<String, Object>{
            'type' => 'string',
            'pattern' => '^[A-Za-z0-9_-]{1,80}$'
          }
        );
        required.add('listKey');
      }
      if (name == PAGE)
        properties.put(
          'cursor',
          new Map<String, Object>{ 'type' => 'string', 'maxLength' => 2048 }
        );
      if (name == CHILD) {
        properties.put(
          'childId',
          new Map<String, Object>{ 'type' => 'string' }
        );
        required.add('childId');
      }
      Map<String, Object> ui = new Map<String, Object>{
        'visibility' => new List<String>{ 'app' }
      };
      result.add(
        new Map<String, Object>{
          'name' => name,
          'description' => 'Read published related lists or open a checked child in the record workspace.',
          'inputSchema' => new Map<String, Object>{
            'type' => 'object',
            'properties' => properties,
            'required' => required,
            'additionalProperties' => false
          },
          'annotations' => new Map<String, Object>{
            'readOnlyHint' => true,
            'destructiveHint' => false,
            'openWorldHint' => false
          },
          '_meta' => new Map<String, Object>{
            'ui' => ui,
            'openai/widgetAccessible' => true
          }
        }
      );
    }
    return result;
  }
  public static Boolean handles(String name) {
    return name == DEFINITIONS || name == PAGE || name == CHILD;
  }
  /** Runtime rejects unknown properties before querying configuration or CRM. */
  public static Map<String, Object> call(
    String client,
    String name,
    Map<String, Object> args
  ) {
    CardstackConnectionAccess.requireUser();
    CardstackConnectionTypes.requireClient(client);
    try {
      if (
        !handles(name) ||
        args == null ||
        Blob.valueOf(JSON.serialize(args)).size() > 4096
      )
        throw new AdapterException('INVALID_REQUEST');
      Set<String> allowed = new Set<String>{ 'parentId' };
      Set<String> required = new Set<String>{ 'parentId' };
      if (name != DEFINITIONS) {
        allowed.add('listKey');
        required.add('listKey');
      }
      if (name == PAGE)
        allowed.add('cursor');
      if (name == CHILD) {
        allowed.add('childId');
        required.add('childId');
      }
      if (
        !allowed.containsAll(args.keySet()) ||
        !args.keySet().containsAll(required)
      )
        throw new AdapterException('INVALID_REQUEST');
      String parentId = id(args.get('parentId'));
      String listKey;
      if (name != DEFINITIONS) {
        listKey = text(args.get('listKey'));
        if (!Pattern.matches('[A-Za-z0-9_-]{1,80}', listKey))
          throw new AdapterException('INVALID_REQUEST');
      }
      String cursor = args.containsKey('cursor')
        ? text(args.get('cursor'))
        : null;
      if (cursor != null && (cursor.length() == 0 || cursor.length() > 2048))
        throw new AdapterException('INVALID_REQUEST');
      String childId = name == CHILD ? id(args.get('childId')) : null;
      requireSetup(client);
      if (name == CHILD) {
        String checkedId=CardstackRelatedListService.checkChild(parentId,listKey,childId);
        Map<String,Object> openArgs=new Map<String,Object>{'recordId'=>checkedId};
        // Membership never grants edit access. Existing adapters independently resolve native policy.
        if(Id.valueOf(checkedId).getSObjectType()==Opportunity.SObjectType && stageFamilyHint()) {
          return CardstackOpportunityMcpAdapter.call(client,'cardstack_opportunity_open',openArgs);
        }
        return CardstackRecordMcpAdapter.call(client,'cardstack_record_open',openArgs);
      }
      if (name == PAGE)
        return pageResult(
          CardstackRelatedListService.readPage(parentId, listKey, cursor)
        );
      CardstackRelatedListService.Identity parent = CardstackRelatedListService.parentIdentity(
        parentId
      );
      List<Object> lists = new List<Object>();
      for (
        CardstackRelatedListPolicy.Definition d : CardstackRelatedListService.listDefinitions(
          parentId
        )
      )
        lists.add(
          new Map<String, Object>{
            'listKey' => d.key,
            'relationship' => d.relationship,
            'childObjectApiName' => d.childObjectApiName,
            'label' => d.label,
            'definitionFingerprint' => d.fingerprint,
            'columns' => columns(d.columns),
            'pageSize' => d.pageSize
          }
        );
      return result(
        new Map<String, Object>{
          'contractVersion' => 'record-related-definitions/v1',
          'parent' => parent,
          'lists' => lists
        }
      );
    } catch (Exception failure) {
      String code = failure.getMessage();
      if (
        !new Set<String>{
            'INVALID_REQUEST',
            'PAGE_STALE',
            'RELATED_UNAVAILABLE'
          }
          .contains(code)
      )
        code = 'RELATED_UNAVAILABLE';
      Map<String, Object> rejected = result(
        new Map<String, Object>{
          'contractVersion' => 'record-related-error/v1',
          'code' => code
        }
      );
      rejected.put('isError', true);
      return rejected;
    }
  }
  /** One published-config routing hint; selected adapters still independently authorize every read/start. */
  private static Boolean stageFamilyHint() {
    String raw=CardstackConfigService.getConfig('layout:Opportunity:default');
    if(String.isBlank(raw)) return false;
    try {
      Map<String,Object> layout=(Map<String,Object>)JSON.deserializeUntyped(raw);
      if(layout==null || !(layout.get('actions') instanceof List<Object>)) return false;
      List<Object> actions=(List<Object>)layout.get('actions');
      if(actions.size()>20) return false;
      for(Object item:actions) {
        if(!(item instanceof Map<String,Object>)) continue;
        Map<String,Object> action=(Map<String,Object>)item;
        if(!(action.get('enabled') instanceof Boolean) || (Boolean)action.get('enabled')!=true || !(action.get('type') instanceof String) || !'record-edit'.equals((String)action.get('type')) || !(action.get('mappings') instanceof List<Object>)) continue;
        List<Object> mappings=(List<Object>)action.get('mappings');
        if(mappings.isEmpty() || mappings.size()>20) continue;
        for(Object mapped:mappings) {
          if(!(mapped instanceof Map<String,Object>)) continue;
          Map<String,Object> mapping=(Map<String,Object>)mapped;
          if(mapping.get('fieldApi') instanceof String && 'StageName'.equals((String)mapping.get('fieldApi')) && mapping.get('source') instanceof String && 'current'.equals((String)mapping.get('source')) && mapping.get('sourceField')==null && mapping.get('value')==null) return true;
        }
      }
      return false;
    } catch(Exception malformed) { return false; }
  }
  @TestVisible
  private static Map<String, Object> pageResult(
    CardstackRelatedListService.RelatedPage page
  ) {
    Map<String, Object> result = result(
      new Map<String, Object>{
        'contractVersion' => page.contractVersion,
        'parent' => page.parent,
        'listKey' => page.listKey,
        'relationship' => page.relationship,
        'childObjectApiName' => page.childObjectApiName,
        'label' => page.label,
        'definitionFingerprint' => page.definitionFingerprint,
        'columns' => columns(page.columns),
        'rows' => page.rows,
        'hasMore' => page.hasMore
      }
    );
    Map<String, Object> privateMeta = new Map<String, Object>{
      'parentId' => page.parent.recordId,
      'listKey' => page.listKey,
      'definitionFingerprint' => page.definitionFingerprint
    };
    if (page.nextCursor != null)
      privateMeta.put('nextCursor', page.nextCursor);
    result.put(
      '_meta',
      new Map<String, Object>{ 'cardstack/related' => privateMeta }
    );
    return result;
  }
  private static List<Object> columns(
    List<CardstackRelatedListPolicy.Column> descriptors
  ) {
    List<Object> result = new List<Object>();
    for (CardstackRelatedListPolicy.Column column : descriptors) {
      Map<String, Object> c = new Map<String, Object>{
        'fieldApi' => column.fieldApi,
        'label' => column.label,
        'dataType' => column.dataType
      };
      if (column.precision != null) {
        c.put('precision', column.precision);
        c.put('scale', column.scale);
      }
      result.add(c);
    }
    return result;
  }
  private static Map<String, Object> result(Object body) {
    return new Map<String, Object>{
      'content' => new List<Object>{
        new Map<String, Object>{
          'type' => 'text',
          'text' => 'Related list response is available in the record workspace.'
        }
      },
      'structuredContent' => body
    };
  }
  private static String text(Object value) {
    if (!(value instanceof String))
      throw new AdapterException('INVALID_REQUEST');
    return (String) value;
  }
  private static String id(Object value) {
    try {
      return CardstackConnectionTypes.normalizeId(text(value));
    } catch (Exception failure) {
      throw new AdapterException('INVALID_REQUEST');
    }
  }
  private static void requireSetup(String client) {
    CardstackConnectionTypes.SetupSnapshot setup = CardstackConnectionSetupRepository.readUser(
      client
    );
    if (
      setup == null ||
      setup.setupView == null ||
      !setup.isCurrentOrg() ||
      setup.setupView.enabledIntent != true ||
      setup.setupView.revision == null ||
      setup.setupView.revision < 1 ||
      setup.setupView.summary == 'Stale'
    )
      throw new AdapterException('RELATED_UNAVAILABLE');
  }
}
