/** Strict read-only natural-record discovery. Selection re-enters the existing checked Open. */
public with sharing class CardstackRecordDiscoveryMcpAdapter {
 private static final String SEARCH='cardstack_record_search';
 /** One model-visible search descriptor reuses the shared record workspace resource. */
 public static List<Object> tools() {
  return tools(CardstackRecordMcpAdapter.resourceUri());
 }
 /** Pure discovery descriptor; the native catalog supplies its already checked record-family URI. */
 public static List<Object> tools(String uri) {
  Map<String,Object> ui=new Map<String,Object>{'visibility'=>new List<String>{'model','app'}};
  Map<String,Object> meta=new Map<String,Object>{'ui'=>ui,'openai/widgetAccessible'=>true};
  if(uri!=null) { ui.put('resourceUri',uri); meta.put('openai/outputTemplate',uri); }
  return new List<Object>{new Map<String,Object>{'name'=>SEARCH,
   'description'=>'Find a Salesforce record by full or partial name or Salesforce ID within published Cardstack objects. Use before Open when the record ID is unknown. Multiple matches require the user to select a record; never choose the first or infer a unique record from truncated results. Name search uses the native search index and recent changes can take time to appear.',
   'inputSchema'=>new Map<String,Object>{'type'=>'object','properties'=>new Map<String,Object>{
    'query'=>new Map<String,Object>{'type'=>'string','minLength'=>1,'maxLength'=>160},
    'objectApiName'=>new Map<String,Object>{'type'=>'string','pattern'=>'[A-Za-z][A-Za-z0-9_]{0,79}','description'=>'Optional canonical configured Salesforce object API name; only narrows search.'},
    'maxResults'=>new Map<String,Object>{'type'=>'integer','minimum'=>1,'maximum'=>10,'default'=>5}},
    'required'=>new List<String>{'query'},'additionalProperties'=>false},
   '_meta'=>meta,'annotations'=>new Map<String,Object>{'readOnlyHint'=>true,'destructiveHint'=>false,'openWorldHint'=>false}}};
 }
 public static Boolean handles(String name) { return SEARCH.equals(name); }
 /** Actor/setup and exact arguments are checked before readable candidate projection. */
 public static Map<String,Object> call(String client,String name,Map<String,Object> args) {
  CardstackConnectionAccess.requireUser(); CardstackConnectionTypes.requireClient(client);
  try {
   if(!handles(name) || args==null || !new Set<String>{'query','objectApiName','maxResults'}.containsAll(args.keySet()) || !(args.get('query') instanceof String)) throw invalid();
   String query=(String)args.get('query'); String objectApi;
   if(String.isBlank(query) || query.length()>160) throw invalid();
   if(args.containsKey('objectApiName')) {
    if(!(args.get('objectApiName') instanceof String)) throw invalid(); objectApi=(String)args.get('objectApiName');
    if(!Pattern.matches('[A-Za-z][A-Za-z0-9_]{0,79}',objectApi)) throw invalid();
   }
   Integer maxResults;
   if(args.containsKey('maxResults')) {
    Object value=args.get('maxResults');
    if(!(value instanceof Integer || value instanceof Long || value instanceof Decimal || value instanceof Double)) throw invalid();
    Decimal checked=Decimal.valueOf(String.valueOf(value));
    if(checked<1 || checked>10 || checked!=checked.setScale(0)) throw invalid(); maxResults=checked.intValue();
   }
   CardstackConnectionTypes.SetupSnapshot setup=CardstackConnectionSetupRepository.readUser(client);
   if(setup==null || setup.setupView==null || !setup.isCurrentOrg() || setup.setupView.enabledIntent!=true || setup.setupView.revision==null || setup.setupView.revision<1 || 'Stale'.equals(setup.setupView.summary)) return rejected('CONNECTION_UNAVAILABLE');
   CardstackRecordDiscovery.Result result=CardstackRecordDiscovery.search(query,objectApi,maxResults);
   Map<String,Object> structured=(Map<String,Object>)JSON.deserializeUntyped(JSON.serialize(result));
   String summary=result.status.equals('Empty')?'No matching records. Refine the name or use an exact Salesforce ID.':result.needsSelection?'Choose the Salesforce record to open.':'One matching Salesforce record is available to open.';
   if(result.hasMore) summary+=' More matches exist; narrow the name or object.';
   if(!result.unavailableObjects.isEmpty()) summary+=' Some configured objects are unavailable to search.';
   return new Map<String,Object>{'content'=>new List<Object>{new Map<String,Object>{'type'=>'text','text'=>summary}},'structuredContent'=>structured};
  } catch(CardstackRecordDiscovery.DiscoveryException error) { return rejected(error.getMessage()); }
  catch(CardstackConnectionTypes.ConnectionException error) { return rejected('CONNECTION_UNAVAILABLE'); }
  catch(Exception error) { return rejected('SEARCH_UNAVAILABLE'); }
 }
 private static CardstackRecordDiscovery.DiscoveryException invalid() { return new CardstackRecordDiscovery.DiscoveryException('INVALID_ARGUMENTS'); }
 private static Map<String,Object> rejected(String code) {
  return new Map<String,Object>{'isError'=>true,'content'=>new List<Object>{new Map<String,Object>{'type'=>'text','text'=>'Record search is unavailable. Refine the search or open a known record.'}},
   'structuredContent'=>new Map<String,Object>{'contractVersion'=>'record-discovery/v1','status'=>'Rejected','errorCode'=>code,'hasMore'=>false,'needsSelection'=>false,'searchIndexMayLag'=>false,
    'searchedObjects'=>new List<Object>(),'unavailableObjects'=>new List<Object>(),'candidates'=>new List<Object>()}};
 }
}
