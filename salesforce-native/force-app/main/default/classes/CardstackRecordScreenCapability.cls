/** Native CRM capability. Published configuration narrows native rights; wire input never selects identifiers. */
public with sharing class CardstackRecordScreenCapability {
 @TestVisible private static Map<String,Integer> flowReadLengthOverride=new Map<String,Integer>();
 public static final String VERSION='contact-current/v1';
 public static final String LEGACY_CURRENT_VERSION='record-current/v2';
 public static final String CURRENT_VERSION='record-current/v3';
 private static final Set<String> CORE_OBJECTS=new Set<String>{'Account','Contact','Opportunity','Lead','Case','Campaign','Contract','Order','Product2','Quote','Task','Event'};
 private static final Set<Schema.DisplayType> HISTORICAL_SCALAR_TYPES=new Set<Schema.DisplayType>{Schema.DisplayType.String,Schema.DisplayType.TextArea,Schema.DisplayType.Boolean,Schema.DisplayType.Integer,Schema.DisplayType.Date,Schema.DisplayType.Double,Schema.DisplayType.Currency};
 private static final Set<Schema.DisplayType> STRING_TYPES=new Set<Schema.DisplayType>{Schema.DisplayType.String,Schema.DisplayType.TextArea,Schema.DisplayType.Email,Schema.DisplayType.Phone,Schema.DisplayType.Url};
 private static final Set<Schema.DisplayType> EXPANDED_TYPES=new Set<Schema.DisplayType>{Schema.DisplayType.Email,Schema.DisplayType.Phone,Schema.DisplayType.Url,Schema.DisplayType.Picklist};
 /** Canonical native identity and ordered published inputs plus required readable projection. */
 public with sharing class Definition {
  public Schema.SObjectType objectType; public String objectApiName; public String capabilityVersion;
  public CardstackRecordActionService.Definition action; public CardstackPolicyService.Policy published;
  public CardstackOpportunityEditTypes.Policy policy=new CardstackOpportunityEditTypes.Policy();
  public List<String> fields=new List<String>(); public List<CardstackOpportunityEditTypes.FieldView> descriptors;
  public Set<String> requiredReadableProjection=new Set<String>(); public String nameField;
  public String fingerprint; private String metadataFingerprint; private Boolean terminalReadOnly=false; private CardstackNativePicklistProvider.Context picklists; public Map<String,Object> layout;
 }
 // Exact legacy serialized descriptor shape preserves schema-2 fingerprint interpretation.
 private with sharing class LegacyFieldView {
  public String fieldApi; public String label; public String value; public String dataType;
  public Boolean required; public Boolean canClear; public List<CardstackOpportunityEditTypes.Choice> choices=new List<CardstackOpportunityEditTypes.Choice>(); public String currencyCode;
 }
 /** Legacy Contact overload retained for persisted schema-2 state and old callers. */
 public static Definition resolveDefinition(String actionName) {
  return buildDefinition('Contact',CardstackRecordActionService.resolve('Contact',actionName),CardstackPolicyService.resolve('Contact'),CardstackConfigService.getConfig('layout:Contact:default'),VERSION);
 }
 /** Resolve record-derived canonical object before reading its published current-only action/layout. */
 public static Definition resolveDefinition(Id recordId,String actionName) {
  Schema.SObjectType objectType=recordType(recordId); String objectApi=objectType.getDescribe().getName();
  Definition result=buildDefinition(objectApi,CardstackRecordActionService.resolve(objectApi,actionName),CardstackPolicyService.resolve(objectApi),CardstackConfigService.getConfig('layout:'+objectApi+':default'),CURRENT_VERSION);
  // Only picklists need an early authorized record read to bind actual-type options.
  // Scalar callers retain their existing explicit USER_MODE readContext checks.
  for(String field:result.fields) if(fieldDescribe(result.objectType,field).getType()==Schema.DisplayType.Picklist) { readContext(recordId,result,false); break; }
  return result;
 }
 /** Stored interpretation is selected only by explicit schema/version and native record identity. */
 public static Definition resolveDefinition(CardstackOpportunityEditTypes.StoredState state) {
  if(isFlow(state))return CardstackFlowService.resolveCapability(state);
  if(isGeneric(state) && 'Completed'.equals(state.status)) return resolveCompletedDefinition(state);
  if(!isGeneric(state)) throw new CardstackOpportunityEditRepository.RepositoryException('INVALID_STATE_KIND');
  Definition result=state.schemaVersion==2?resolveDefinition(state.actionName):(state.schemaVersion==3?resolveHistoricalDefinition((Id)state.recordId,state.actionName):resolveDefinition((Id)state.recordId,state.actionName));
  validateCapabilityContext(state,result); return result;
 }
 /** Independent static digest pinned only in the undeployed schema4 interpretation. */
 public static String metadataDigest(Definition definition) { return definition==null?null:definition.metadataFingerprint; }
 /** Completed outcomes resolve native metadata/rights without current selectable options. */
 private static Definition resolveCompletedDefinition(CardstackOpportunityEditTypes.StoredState state) {
  String objectApi=recordType((Id)state.recordId).getDescribe().getName();
  Definition result=state.schemaVersion==2?resolveDefinition(state.actionName):(state.schemaVersion==3?resolveHistoricalDefinition((Id)state.recordId,state.actionName):buildDefinition(objectApi,CardstackRecordActionService.resolve(objectApi,state.actionName),CardstackPolicyService.resolve(objectApi),CardstackConfigService.getConfig('layout:'+objectApi+':default'),CURRENT_VERSION));
  result.terminalReadOnly=true; validateCapabilityContext(state,result); return result;
 }
 /** Schema3 keeps the exact scalar projection/descriptors and v2 digest interpretation. */
 @TestVisible private static Definition resolveHistoricalDefinition(Id recordId,String actionName) {
  String objectApi=recordType(recordId).getDescribe().getName();
  return buildDefinition(objectApi,CardstackRecordActionService.resolve(objectApi,actionName),CardstackPolicyService.resolve(objectApi),CardstackConfigService.getConfig('layout:'+objectApi+':default'),LEGACY_CURRENT_VERSION);
 }
 /** Candidate-only native/published intersection; does not publish or grant access. */
 public static Definition definition(CardstackRecordActionService.Definition action,CardstackPolicyService.Policy published) {
  if(published==null) throw new CardstackOpportunityActionPolicy.PolicyException('INVALID_POLICY');
  return buildDefinition(published.objectApiName,action,published,null,CURRENT_VERSION);
 }
 private static Definition buildDefinition(String objectApi,CardstackRecordActionService.Definition action,CardstackPolicyService.Policy published,String raw,String requestedCapabilityVersion) {
  validate(objectApi,action,published); Definition result=new Definition(); result.objectType=canonicalType(objectApi); result.objectApiName=objectApi; result.capabilityVersion=requestedCapabilityVersion;
  result.action=action; result.published=published; result.nameField=nameField(result.objectType);
  for(CardstackRecordActionService.Mapping mapping:action.mappings) {
   Schema.DescribeFieldResult shape=fieldDescribe(result.objectType,mapping.fieldApi);
   if(VERSION.equals(requestedCapabilityVersion) && (!new Set<Schema.DisplayType>{Schema.DisplayType.String,Schema.DisplayType.TextArea,Schema.DisplayType.Boolean}.contains(shape.getType()) || mapping.fieldApi.equals('Name'))) throw new CardstackOpportunityActionPolicy.PolicyException('UNSUPPORTED_FIELD_TYPE');
   if(LEGACY_CURRENT_VERSION.equals(requestedCapabilityVersion) && !HISTORICAL_SCALAR_TYPES.contains(shape.getType())) throw new CardstackOpportunityActionPolicy.PolicyException('UNSUPPORTED_FIELD_TYPE');
   result.fields.add(mapping.fieldApi); result.policy.editableFields.add(mapping.fieldApi);
   if(published.fields.get(mapping.fieldApi).required==true || !shape.isNillable()) result.policy.requiredFields.add(mapping.fieldApi);
  }
  for(CardstackPolicyService.FieldPolicy field:published.fields.values()) if(field.required==true) {
   fieldDescribe(result.objectType,field.apiName); result.policy.requiredFields.add(field.apiName);
  }
  if(VERSION.equals(requestedCapabilityVersion)) result.policy.requiredFields.add('LastName');
  else for(Schema.SObjectField field:result.objectType.getDescribe().fields.getMap().values()) {
   Schema.DescribeFieldResult shape=field.getDescribe();
   if(!shape.isNillable() && shape.isUpdateable() && !shape.isCalculated() && !shape.isAutoNumber()) result.policy.requiredFields.add(shape.getName());
  }
  result.requiredReadableProjection.addAll(result.policy.requiredFields);
  for(String field:result.fields) {
   Schema.DescribeFieldResult shape=fieldDescribe(result.objectType,field);
   if(shape.isNillable() && shape.getType()!=Schema.DisplayType.Boolean && !result.policy.requiredFields.contains(field)) result.policy.clearableFields.add(field);
  }
  result.layout=projectLayout(result.objectType,result.fields,raw); result.descriptors=describeDefinition(result);
  if(VERSION.equals(requestedCapabilityVersion)) result.fingerprint=CardstackOpportunityEditTypes.digest(new List<Object>{VERSION,JSON.serialize(action),published.revision,legacyDescriptors(result),JSON.serialize(result.layout)});
  else {
   List<String> required=new List<String>(result.requiredReadableProjection); required.sort();
   List<Object> metadata=new List<Object>(); for(String field:projection(result)) metadata.add(fieldMetadata(fieldDescribe(result.objectType,field)));
   result.fingerprint=CardstackOpportunityEditTypes.digest(new List<Object>{requestedCapabilityVersion,objectApi,JSON.serialize(action),published.revision,metadata,required,JSON.serialize(result.descriptors),JSON.serialize(result.layout)});
  }
  result.metadataFingerprint=result.fingerprint; return result;
 }
 /** Pure native eligibility catalog for Studio; independent of published execution policy. */
 public static Map<String,Object> describeEligibility(String objectApi) {
  Map<String,Object> result=new Map<String,Object>{'contractVersion'=>'record-edit-eligibility/v1','objectApiName'=>null,'nativeKeyPrefix'=>null,'eligible'=>false,'exclusionReason'=>null,'fields'=>new List<Map<String,Object>>()};
  Schema.SObjectType known=String.isBlank(objectApi)?null:Schema.getGlobalDescribe().get(objectApi);
  if(known!=null && known.getDescribe().getName().equals(objectApi)) { result.put('objectApiName',objectApi); result.put('nativeKeyPrefix',known.getDescribe().getKeyPrefix()); }
  Schema.SObjectType objectType;
  try { objectType=canonicalType(objectApi); } catch(CardstackOpportunityActionPolicy.PolicyException error) { result.put('exclusionReason',error.getMessage()); return result; }
  result.put('objectApiName',objectType.getDescribe().getName()); String excluded=objectExclusion(objectType);
  result.put('eligible',excluded==null); result.put('exclusionReason',excluded);
  if(excluded!=null) return result;
  List<String> names=new List<String>(); for(Schema.SObjectField field:objectType.getDescribe().fields.getMap().values()) names.add(field.getDescribe().getName()); names.sort();
  List<Map<String,Object>> fields=new List<Map<String,Object>>();
  for(String field:names) {
   Schema.DescribeFieldResult shape=fieldDescribe(objectType,field); String reason='Opportunity'.equals(objectApi) && 'StageName'.equals(field)?'SPECIALIZED_STAGE_ACTION':fieldExclusion(shape);
   Map<String,Object> metadata=fieldMetadata(shape); metadata.put('eligible',reason==null); metadata.put('exclusionReason',reason); fields.add(metadata);
  }
  result.put('fields',fields); return result;
 }
 /** Canonical native object catalog shared by runtime and the descriptor; Describe alone is insufficient. */
 public static Schema.SObjectType canonicalType(String objectApi) {
  if(String.isBlank(objectApi) || !Pattern.matches('[A-Za-z][A-Za-z0-9_]{0,79}',objectApi)) throw new CardstackOpportunityActionPolicy.PolicyException('UNSUPPORTED_OBJECT');
  Schema.SObjectType objectType=Schema.getGlobalDescribe().get(objectApi);
  if(objectType==null || !objectType.getDescribe().getName().equals(objectApi)) throw new CardstackOpportunityActionPolicy.PolicyException('NONCANONICAL_OBJECT');
  String reason=objectExclusion(objectType); if(reason!=null) throw new CardstackOpportunityActionPolicy.PolicyException(reason); return objectType;
 }
 private static String objectExclusion(Schema.SObjectType objectType) {
  Schema.DescribeSObjectResult shape=objectType.getDescribe(); String api=shape.getName(),lower=api.toLowerCase();
  if((!shape.isCustom() && !CORE_OBJECTS.contains(api)) || shape.isCustomSetting() || (shape.isCustom() && !api.endsWith('__c'))
   || lower.startsWith('cardstack_') || lower.contains('__cardstack_')) return 'UNSUPPORTED_OBJECT';
  if(!shape.isQueryable() || !shape.isAccessible() || !shape.isUpdateable()) return 'OBJECT_NOT_EDITABLE';
  if(!shape.fields.getMap().containsKey('SystemModstamp')) return 'UNSUPPORTED_OBJECT';
  return null;
 }
 /** Record-derived type and checksum18 identity are always checked before configuration lookup. */
 public static Schema.SObjectType recordType(Id recordId) {
  if(recordId==null) throw new CardstackOpportunityActionPolicy.PolicyException('INVALID_RECORD');
  CardstackConnectionTypes.normalizeId(String.valueOf(recordId)); return canonicalType(recordId.getSObjectType().getDescribe().getName());
 }
 /** Native eligibility excludes dependencies and unsupported codecs before authoring. */
 private static String fieldExclusion(Schema.DescribeFieldResult shape) {
  if(shape.isCalculated() || shape.isAutoNumber() || (!HISTORICAL_SCALAR_TYPES.contains(shape.getType()) && !EXPANDED_TYPES.contains(shape.getType()))) return 'UNSUPPORTED_FIELD_TYPE';
  if(shape.getType()==Schema.DisplayType.Picklist && (shape.isDependentPicklist() || shape.getController()!=null)) return 'UNSUPPORTED_FIELD_TYPE';
  if((shape.getType()==Schema.DisplayType.Double || shape.getType()==Schema.DisplayType.Currency) && (shape.getPrecision()<1 || shape.getPrecision()>28 || shape.getScale()<0 || shape.getScale()>shape.getPrecision())) return 'UNSUPPORTED_NUMERIC_METADATA';
  if(!shape.isAccessible() || !shape.isUpdateable()) return 'FIELD_NOT_EDITABLE'; return null;
 }
 private static Map<String,Object> fieldMetadata(Schema.DescribeFieldResult shape) {
  return new Map<String,Object>{'fieldApi'=>shape.getName(),'label'=>shape.getLabel(),'dataType'=>String.valueOf(shape.getType()),'nativeRequired'=>!shape.isNillable(),'canClear'=>shape.isNillable() && shape.getType()!=Schema.DisplayType.Boolean,'length'=>shape.getLength(),'precision'=>shape.getPrecision(),'scale'=>shape.getScale()};
 }
 /** Reject noncanonical/duplicate identifiers, unsupported codecs and non-current mappings. */
 public static void validateShape(String objectApi,CardstackRecordActionService.Definition action) {
  Schema.SObjectType objectType=canonicalType(objectApi);
  if('Opportunity'.equals(objectApi) && hasStage(action)) throw new CardstackOpportunityActionPolicy.PolicyException('SPECIALIZED_STAGE_ACTION');
  if(action==null || (!'record-edit'.equals(action.type) && !'screen-flow'.equals(action.type)) || ('record-edit'.equals(action.type) && action.flowApiName!=null) || ('screen-flow'.equals(action.type) && String.isBlank(action.flowApiName)) || action.mappings==null || action.mappings.isEmpty() || action.mappings.size()>20) throw new CardstackOpportunityActionPolicy.PolicyException('INVALID_PRESET');
  Set<String> seen=new Set<String>();
  for(CardstackRecordActionService.Mapping mapping:action.mappings) {
   if(mapping==null || String.isBlank(mapping.fieldApi) || seen.contains(mapping.fieldApi) || !'current'.equals(mapping.source) || mapping.sourceField!=null || mapping.value!=null) throw new CardstackOpportunityActionPolicy.PolicyException('INVALID_PRESET');
   String reason=fieldExclusion(fieldDescribe(objectType,mapping.fieldApi)); if(reason!=null) throw new CardstackOpportunityActionPolicy.PolicyException(reason); seen.add(mapping.fieldApi);
  }
 }
 /** Native permissions and published policy only restrict current-only capabilities. */
 public static void validate(String objectApi,CardstackRecordActionService.Definition action,CardstackPolicyService.Policy policy) {
  validateShape(objectApi,action);
  if(action.enabled!=true || policy==null || policy.editEnabled!=true) throw new CardstackOpportunityActionPolicy.PolicyException('EDIT_DISABLED');
  if(!objectApi.equals(policy.objectApiName) || policy.fields==null) throw new CardstackOpportunityActionPolicy.PolicyException('INVALID_POLICY');
  if(UserInfo.getUserType().equals('Guest')) throw new CardstackOpportunityActionPolicy.PolicyException('FIELD_NOT_EDITABLE');
  for(CardstackRecordActionService.Mapping mapping:action.mappings) {
   CardstackPolicyService.FieldPolicy field=policy.fields.get(mapping.fieldApi);
   if(field==null || !mapping.fieldApi.equals(field.apiName) || field.readOnly==true) throw new CardstackOpportunityActionPolicy.PolicyException('FIELD_NOT_EDITABLE');
  }
 }
 /** Candidate-only layout hook; no runtime rights or configuration publication. */
 public static void validateLayout(String key,String raw) {
  if(key==null || !Pattern.matches('layout:[a-z][a-z0-9_]{0,79}:[^:]+',key.toLowerCase())) return;
  // Config Name equality ignores case. Resolve only this storage-key alias;
  // execution objects and field identifiers still require exact native names.
  String objectKey=key.split(':')[1]; Schema.SObjectType keyedObject=Schema.getGlobalDescribe().get(objectKey);
  String objectApi=keyedObject==null?objectKey:keyedObject.getDescribe().getName();
  // Legacy Account mappings and Opportunity Stage policy remain at their existing authoring boundary.
  List<CardstackRecordActionService.Definition> actions;
  try {
   Map<String,Object> body=(Map<String,Object>)JSON.deserializeUntyped(raw); if(body==null || body.get('actions')==null) return;
   actions=(List<CardstackRecordActionService.Definition>)JSON.deserialize(JSON.serialize(body.get('actions')),List<CardstackRecordActionService.Definition>.class);
  } catch(Exception error) { throw new CardstackOpportunityActionPolicy.PolicyException('INVALID_PRESET'); }
  if(actions.size()>20) throw new CardstackOpportunityActionPolicy.PolicyException('INVALID_PRESET');
  Set<String> names=new Set<String>(); CardstackPolicyService.Policy candidate;
  for(CardstackRecordActionService.Definition action:actions) {
   if(action==null || !'record-edit'.equals(action.type)) continue;
   if('Account'.equals(objectApi) && !currentOnly(action)) continue;
   if('Opportunity'.equals(objectApi) && hasStage(action)) continue;
   validateShape(objectApi,action);
   if(action.enabled==null || String.isBlank(action.label) || action.label.length()>160 || String.isBlank(action.name) || !Pattern.matches('[a-zA-Z0-9_-]{1,80}',action.name) || names.contains(action.name)) throw new CardstackOpportunityActionPolicy.PolicyException('INVALID_PRESET');
   names.add(action.name); if(action.enabled==true) { if(candidate==null) candidate=CardstackPolicyService.resolveCandidate(objectApi,raw); buildDefinition(objectApi,action,candidate,raw,CURRENT_VERSION); }
  }
 }
 /** True only for checked literal-current mappings; legacy Account mappings do not become generic writes. */
 public static Boolean currentOnly(CardstackRecordActionService.Definition action) {
  if(action==null || action.mappings==null || action.mappings.isEmpty()) return false;
  for(CardstackRecordActionService.Mapping mapping:action.mappings) if(mapping==null || !'current'.equals(mapping.source) || mapping.sourceField!=null || mapping.value!=null) return false; return true;
 }
 public static Boolean hasStage(CardstackRecordActionService.Definition action) {
  if(action!=null && action.mappings!=null) for(CardstackRecordActionService.Mapping mapping:action.mappings) if(mapping!=null && 'StageName'.equals(mapping.fieldApi)) return true; return false;
 }
 private static List<String> projection(Definition definition) {
  Set<String> fields=new Set<String>{'Id','SystemModstamp',definition.nameField}; fields.addAll(definition.fields); fields.addAll(definition.requiredReadableProjection);
  if(VERSION.equals(definition.capabilityVersion)) fields.add('LastName');
  Boolean hasPicklist=false; for(String field:definition.fields) if(fieldDescribe(definition.objectType,field).getType()==Schema.DisplayType.Picklist) hasPicklist=true;
  if(CURRENT_VERSION.equals(definition.capabilityVersion) && hasPicklist && definition.objectType.getDescribe().fields.getMap().containsKey('RecordTypeId')) fields.add('RecordTypeId');
  Boolean hasCurrencyField=false; for(String field:definition.fields) if(fieldDescribe(definition.objectType,field).getType()==Schema.DisplayType.Currency) hasCurrencyField=true;
  if(hasCurrencyField && definition.objectType.getDescribe().fields.getMap().containsKey('CurrencyIsoCode')) {
   Schema.DescribeFieldResult shape=fieldDescribe(definition.objectType,'CurrencyIsoCode'); if(!shape.isAccessible()) throw new CardstackOpportunitySelector.ReadException('RECORD_UNAVAILABLE'); fields.add('CurrencyIsoCode');
  }
  List<String> result=new List<String>(fields); result.sort(); return result;
 }
 /** Authorized typed record projection and freshness; locks only after native/published validation. */
 public static CardstackOpportunityEditTypes.RecordContext readContext(Id recordId,Definition definition,Boolean lockRecord) {
  if(definition!=null && definition.terminalReadOnly && lockRecord==true) throw new CardstackOpportunitySelector.ReadException('TERMINAL_CAPABILITY');
  if(recordId==null || definition==null || lockRecord==null || recordType(recordId)!=definition.objectType) throw new CardstackOpportunitySelector.ReadException('INVALID_RECORD');
  validate(definition.objectApiName,definition.action,definition.published); List<String> ordered=projection(definition);
  for(String field:ordered) if(!fieldDescribe(definition.objectType,field).isAccessible()) throw new CardstackOpportunitySelector.ReadException('RECORD_UNAVAILABLE');
  String query='SELECT '+String.join(ordered,',')+' FROM '+definition.objectApiName+' WHERE Id=:recordId LIMIT 1'+(lockRecord?' FOR UPDATE':'');
  try {
   List<SObject> records=Database.queryWithBinds(query,new Map<String,Object>{'recordId'=>recordId},AccessLevel.USER_MODE);
   if(records.isEmpty()) throw new CardstackOpportunitySelector.ReadException('RECORD_UNAVAILABLE');
   CardstackOpportunityEditTypes.RecordContext result=new CardstackOpportunityEditTypes.RecordContext(); result.record=records[0];
   if(!VERSION.equals(definition.capabilityVersion)) {
    result.currencyCode=ordered.contains('CurrencyIsoCode')?(String)result.record.get('CurrencyIsoCode'):UserInfo.getDefaultCurrency();
    if(String.isBlank(result.currencyCode) || !Pattern.matches('[A-Z]{3}',result.currencyCode)) throw new CardstackOpportunitySelector.ReadException('RECORD_UNAVAILABLE');
   }
   if(CURRENT_VERSION.equals(definition.capabilityVersion) && !definition.terminalReadOnly) bindPicklists(result,definition);
   if(definition.terminalReadOnly && CURRENT_VERSION.equals(definition.capabilityVersion)) for(String field:definition.fields) if(fieldDescribe(definition.objectType,field).getType()==Schema.DisplayType.Picklist) { CardstackNativePicklistProvider.actualRecordType(result.record); break; }
   result.freshness=freshness(result,definition); return result;
  } catch(QueryException error) { throw new CardstackOpportunitySelector.ReadException('RECORD_UNAVAILABLE',error); }
 }
 /** Rebind options after each authorized read, including the final FOR UPDATE read. */
 private static void bindPicklists(CardstackOpportunityEditTypes.RecordContext current,Definition definition) {
  List<String> fields=new List<String>();
  for(String field:definition.fields) if(fieldDescribe(definition.objectType,field).getType()==Schema.DisplayType.Picklist) fields.add(field);
  if(fields.isEmpty()) return;
  definition.picklists=CardstackNativePicklistProvider.resolve(definition.objectType,CardstackNativePicklistProvider.actualRecordType(current.record),fields);
  definition.descriptors=describeDefinition(definition);
  definition.fingerprint=CardstackOpportunityEditTypes.digest(new List<Object>{definition.metadataFingerprint,CardstackNativePicklistProvider.VERSION,definition.picklists.objectApiName,definition.picklists.recordTypeId,definition.picklists.fingerprint,JSON.serialize(definition.descriptors)});
 }
 private static String freshness(CardstackOpportunityEditTypes.RecordContext current,Definition definition) { return freshness(current,definition,definition.fingerprint); }
 // Only terminal snapshot verification uses the historical binding; it never becomes a writable Definition fingerprint.
 private static String freshness(CardstackOpportunityEditTypes.RecordContext current,Definition definition,String historicalBinding) {
  List<Object> parts=new List<Object>{definition.capabilityVersion,historicalBinding}; if(!VERSION.equals(definition.capabilityVersion)) parts.add(current.currencyCode);
  for(String field:projection(definition)) {
   Object value=current.record.get(field); Schema.DisplayType kind=fieldDescribe(definition.objectType,field).getType();
   // Schema 3 hashes numeric value identity, not origin-dependent Decimal scale.
   // Schema 2 retains the raw typed native JSON used by historical grants.
   if(!VERSION.equals(definition.capabilityVersion) && (kind==Schema.DisplayType.Double || kind==Schema.DisplayType.Currency)) value=literal(value);
   parts.add(new List<Object>{field,value});
  } return CardstackOpportunityEditTypes.digest(parts);
 }
 /** Checked public descriptors in published action order; display is never write authority. */
 public static List<CardstackOpportunityEditTypes.FieldView> describeFields(Definition definition,CardstackOpportunityEditTypes.RecordContext current) {
  requireContext(current,definition); List<CardstackOpportunityEditTypes.FieldView> result=describeDefinition(definition);
  for(CardstackOpportunityEditTypes.FieldView field:result) {
   field.value=literal(current.record.get(field.fieldApi)); if(field.dataType=='CURRENCY') field.currencyCode=current.currencyCode;
   if(field.dataType=='INTEGER') field.precision=codecPrecision(fieldDescribe(definition.objectType,field.fieldApi));
  } return result;
 }
 /** Effective codec bounds are separate from raw metadata and fingerprinted descriptors. */
 private static Integer codecPrecision(Schema.DescribeFieldResult shape) {
  if(shape.getType()==Schema.DisplayType.Integer && shape.getPrecision()==0) return 10;
  return shape.getPrecision();
 }
 private static List<CardstackOpportunityEditTypes.FieldView> describeDefinition(Definition definition) {
  List<CardstackOpportunityEditTypes.FieldView> result=new List<CardstackOpportunityEditTypes.FieldView>();
  for(String field:definition.fields) {
   Schema.DescribeFieldResult shape=fieldDescribe(definition.objectType,field); CardstackOpportunityEditTypes.FieldView input=new CardstackOpportunityEditTypes.FieldView();
   input.fieldApi=field; input.label=shape.getLabel(); input.dataType=String.valueOf(shape.getType()); input.required=definition.policy.requiredFields.contains(field); input.canClear=definition.policy.clearableFields.contains(field);
   if(!VERSION.equals(definition.capabilityVersion)) {
    if(STRING_TYPES.contains(shape.getType()) || shape.getType()==Schema.DisplayType.Picklist) input.length=shape.getLength();
    if(shape.getType()==Schema.DisplayType.Integer || shape.getType()==Schema.DisplayType.Double || shape.getType()==Schema.DisplayType.Currency) { input.precision=shape.getPrecision(); input.scale=shape.getScale(); }
   }
   if(shape.getType()==Schema.DisplayType.Picklist && definition.picklists!=null) input.choices=definition.picklists.fields.get(field);
   result.add(input);
  } return result;
 }
 private static String legacyDescriptors(Definition definition) {
  List<LegacyFieldView> fields=new List<LegacyFieldView>();
  for(CardstackOpportunityEditTypes.FieldView field:definition.descriptors) {
   LegacyFieldView legacy=new LegacyFieldView(); legacy.fieldApi=field.fieldApi; legacy.label=field.label; legacy.dataType=field.dataType; legacy.required=field.required; legacy.canClear=field.canClear; fields.add(legacy);
  } return JSON.serialize(fields);
 }
 /** Canonical strings derive fresh native typed values; retained Object-valued maps never execute. */
 public static CardstackOpportunityEditTypes.CanonicalPatch canonicalize(CardstackOpportunityEditTypes.RecordContext current,Definition definition,List<CardstackOpportunityEditTypes.FieldChange> changes) {
  requireContext(current,definition);
  if(definition.terminalReadOnly) throw new CardstackOpportunityEditDomain.ValidationException('TERMINAL_CAPABILITY');
  if(changes==null || changes.size()>20) throw new CardstackOpportunityEditDomain.ValidationException('MISSING_RECORD_CONTEXT');
  validate(definition.objectApiName,definition.action,definition.published);
  for(String field:definition.fields) if(literal(current.record.get(field))!=null && literal(current.record.get(field)).length()>4096) throw new CardstackOpportunityEditDomain.ValidationException('CURRENT_VALUE_UNAVAILABLE');
  Map<String,CardstackOpportunityEditTypes.FieldChange> answers=new Map<String,CardstackOpportunityEditTypes.FieldChange>();
  for(CardstackOpportunityEditTypes.FieldChange answer:changes) {
   if(answer==null || !exactField(definition.fields,answer.fieldApi)) throw new CardstackOpportunityEditDomain.ValidationException('UNKNOWN_FIELD');
   if(answers.containsKey(answer.fieldApi)) throw new CardstackOpportunityEditDomain.ValidationException('DUPLICATE_FIELD'); answers.put(answer.fieldApi,answer);
  }
  CardstackOpportunityEditTypes.CanonicalPatch result=new CardstackOpportunityEditTypes.CanonicalPatch(); List<Object> parts=new List<Object>{definition.capabilityVersion,definition.fingerprint};
  for(String field:definition.fields) {
   if(!answers.containsKey(field)) continue; CardstackOpportunityEditTypes.FieldChange answer=answers.get(field); Schema.DescribeFieldResult shape=fieldDescribe(definition.objectType,field); Object typed;
   if('clear'.equals(answer.operation)) {
    if(answer.value!=null) throw new CardstackOpportunityEditDomain.ValidationException('INVALID_OPERATION');
    if(!definition.policy.clearableFields.contains(field)) throw new CardstackOpportunityEditDomain.ValidationException('CLEAR_NOT_ALLOWED');
   } else if('set'.equals(answer.operation) && answer.value!=null) {
    if(shape.getType()==Schema.DisplayType.Picklist) {
     String before=literal(current.record.get(field));
     if(before!=null && before.equals(answer.value)) continue;
     Boolean selectable=false;
     if(definition.picklists!=null) for(CardstackOpportunityEditTypes.Choice choice:definition.picklists.fields.get(field)) if(choice.value.equals(answer.value)) selectable=true;
     if(!selectable) throw new CardstackOpportunityEditDomain.ValidationException('INVALID_PICKLIST');
     typed=answer.value;
    } else typed=decode(shape,answer.value);
   }
   else throw new CardstackOpportunityEditDomain.ValidationException('INVALID_OPERATION');
   if(definition.policy.requiredFields.contains(field) && empty(typed)) throw new CardstackOpportunityEditDomain.ValidationException('FIELD_REQUIRED');
   String before=literal(current.record.get(field)),after=literal(typed); if(before==null?after==null:before.equals(after)) continue;
   CardstackPreviewUpdateAction.PatchEntry entry=new CardstackPreviewUpdateAction.PatchEntry(); entry.fieldApiName=field; entry.newValue=after; result.entries.add(entry); result.typedValues.put(field,typed);
   CardstackOpportunityEditTypes.DiffRow diff=new CardstackOpportunityEditTypes.DiffRow(); diff.fieldApi=field; diff.label=shape.getLabel(); diff.beforeValue=before; diff.afterValue=after; result.diff.add(diff); parts.add(new List<Object>{field,after});
  }
  for(String field:definition.policy.requiredFields) if(empty(result.typedValues.containsKey(field)?result.typedValues.get(field):current.record.get(field))) throw new CardstackOpportunityEditDomain.ValidationException('FIELD_REQUIRED');
  result.digest=CardstackOpportunityEditTypes.digest(parts); return result;
 }
 private static void requireContext(CardstackOpportunityEditTypes.RecordContext current,Definition definition) {
  if(current==null || current.record==null || definition==null || current.record.getSObjectType()!=definition.objectType) throw new CardstackOpportunityEditDomain.ValidationException('MISSING_RECORD_CONTEXT');
 }
 private static Boolean empty(Object value) { return value==null || (value instanceof String && String.isBlank((String)value)); }
 // One scalar codec extension hook; future native lookup providers can extend this boundary without a second writer.
 private static Object decode(Schema.DescribeFieldResult shape,String value) {
  if(value.length()>4096) throw new CardstackOpportunityEditDomain.ValidationException(STRING_TYPES.contains(shape.getType())?'TEXT_TOO_LONG':'VALUE_TOO_LONG');
  Schema.DisplayType kind=shape.getType();
  if(kind==Schema.DisplayType.Boolean) {
   if(!'true'.equals(value) && !'false'.equals(value)) throw new CardstackOpportunityEditDomain.ValidationException('INVALID_BOOLEAN'); return 'true'.equals(value);
  }
  if(STRING_TYPES.contains(kind)) {
   if(value.length()>shape.getLength()) throw new CardstackOpportunityEditDomain.ValidationException('TEXT_TOO_LONG'); return value;
  }
  if(kind==Schema.DisplayType.Date) {
   if(!Pattern.matches('[0-9]{4}-[0-9]{2}-[0-9]{2}',value)) throw new CardstackOpportunityEditDomain.ValidationException('INVALID_DATE');
   try { Date dateValue=Date.newInstance(Integer.valueOf(value.substring(0,4)),Integer.valueOf(value.substring(5,7)),Integer.valueOf(value.substring(8,10))); if(!value.equals(literal(dateValue))) throw new CardstackOpportunityEditDomain.ValidationException('INVALID_DATE'); return dateValue; }
   catch(TypeException error) { throw new CardstackOpportunityEditDomain.ValidationException('INVALID_DATE',error); }
  }
  if(kind==Schema.DisplayType.Integer || kind==Schema.DisplayType.Double || kind==Schema.DisplayType.Currency) {
   Boolean integerKind=kind==Schema.DisplayType.Integer;
   if(!Pattern.matches(integerKind?'-?[0-9]+':'-?[0-9]+(\\.[0-9]+)?',value)) throw new CardstackOpportunityEditDomain.ValidationException(integerKind?'INVALID_INTEGER':'INVALID_DECIMAL');
   String unsigned=value.startsWith('-')?value.substring(1):value; Integer dot=unsigned.indexOf('.');
   String whole=(dot<0?unsigned:unsigned.substring(0,dot)).replaceFirst('^0+',''),fraction=dot<0?'':unsigned.substring(dot+1).replaceFirst('0+$','');
   if(fraction.length()>shape.getScale()) throw new CardstackOpportunityEditDomain.ValidationException('NUMBER_SCALE');
   if(whole.length()>codecPrecision(shape)-shape.getScale()) throw new CardstackOpportunityEditDomain.ValidationException('NUMBER_PRECISION');
   String normalized=(value.startsWith('-')?'-':'')+(whole==''?'0':whole)+(fraction==''?'':'.'+fraction);
   try { return integerKind?(Object)Integer.valueOf(normalized):(Object)Decimal.valueOf(normalized); }
   catch(TypeException error) { throw new CardstackOpportunityEditDomain.ValidationException(integerKind?'INTEGER_RANGE':'NUMBER_PRECISION',error); }
  }
  throw new CardstackOpportunityEditDomain.ValidationException('UNSUPPORTED_FIELD_TYPE');
 }
 /** Reject cross-object state/snapshot changes, full-identity mismatch and metadata/published drift. */
 public static void validateCapabilityContext(CardstackOpportunityEditTypes.StoredState state,Definition definition) {
  if(!isNative(state) || definition==null || state.recordId==null || !state.recordId.equals(CardstackConnectionTypes.normalizeId(state.recordId))
   || recordType((Id)state.recordId)!=definition.objectType || !definition.objectApiName.equals(state.objectApiName)
   || !definition.capabilityVersion.equals(state.capabilityVersion) || !(isFlow(state)?'screen-flow/v1':(state.schemaVersion==2?'record-edit/v1':(state.schemaVersion==3?'record-edit/v2':'record-edit/v3'))).equals(state.processVersion)
   || !definition.published.revision.equals(state.policyDigest) || !CardstackOpportunityEditTypes.digest(new List<Object>{isFlow(state)?'flow-action/v1':'record-action/v1',JSON.serialize(definition.action)}).equals(state.actionDigest)
   || state.orderedFields==null || !JSON.serialize(state.orderedFields).equals(JSON.serialize(definition.fields))) throw new CardstackOpportunityEditRepository.RepositoryException('CONTEXT_CHANGED');
  if(definition.terminalReadOnly && !'Completed'.equals(state.status)) throw new CardstackOpportunityEditRepository.RepositoryException('INVALID_STATE');
  if(state.schemaVersion>=4 && !definition.metadataFingerprint.equals(state.capabilityMetadataFingerprint)) throw new CardstackOpportunityEditRepository.RepositoryException('CONTEXT_CHANGED');
  if((!definition.terminalReadOnly || state.schemaVersion<4) && !definition.fingerprint.equals(state.capabilityFingerprint)) throw new CardstackOpportunityEditRepository.RepositoryException('CONTEXT_CHANGED');
  if(state.initialRecord==null || state.initialRecord.record==null || state.initialRecord.record.getSObjectType()!=definition.objectType || state.initialRecord.record.Id==null
   || !state.recordId.equals(CardstackConnectionTypes.normalizeId(String.valueOf(state.initialRecord.record.Id)))) throw new CardstackOpportunityEditRepository.RepositoryException('INVALID_STATE');
  try {
   if(!(definition.terminalReadOnly?freshness(state.initialRecord,definition,state.capabilityFingerprint):freshness(state.initialRecord,definition)).equals(state.initialRecord.freshness)
    || (state.schemaVersion>=3 && (state.currencyCode==null || !state.currencyCode.equals(state.initialRecord.currencyCode)))) throw new CardstackOpportunityEditRepository.RepositoryException('INVALID_STATE');
  } catch(SObjectException error) { throw new CardstackOpportunityEditRepository.RepositoryException('INVALID_STATE',error); }
 }
 /** Recheck native rights and the pinned authorized read without a provider call after DML. */
 public static void validateVerifiedContext(CardstackOpportunityEditTypes.StoredState state,Definition definition,CardstackOpportunityEditTypes.RecordContext current) {
  validateCapabilityContext(state,definition); validate(definition.objectApiName,definition.action,definition.published); requireContext(current,definition);
  if(current.record.Id==null || !state.recordId.equals(CardstackConnectionTypes.normalizeId(String.valueOf(current.record.Id)))) throw new CardstackOpportunityEditRepository.RepositoryException('INVALID_STATE');
  for(String field:projection(definition)) if(!fieldDescribe(definition.objectType,field).isAccessible()) throw new CardstackOpportunityEditRepository.RepositoryException('FIELD_NOT_EDITABLE');
  if(current.freshness==null || !current.freshness.equals(freshness(current,definition))) throw new CardstackOpportunityEditRepository.RepositoryException('INVALID_STATE');
 }
 /** Restore native readonly fields using JSON whose type is derived only from the record identity. */
 public static SObject restoreRecord(CardstackOpportunityEditTypes.StoredState state,Map<String,Object> snapshot) {
  Schema.SObjectType objectType=recordType((Id)state.recordId); String objectApi=objectType.getDescribe().getName();
  if(snapshot==null || !objectApi.equals(state.objectApiName)) throw new CardstackOpportunityEditRepository.RepositoryException('INVALID_STATE');
  Object attrs=snapshot.remove('attributes');
  if(attrs!=null && (!(attrs instanceof Map<String,Object>) || !objectApi.equals(((Map<String,Object>)attrs).get('type')))) throw new CardstackOpportunityEditRepository.RepositoryException('INVALID_STATE');
  JSONGenerator nativeSnapshot=JSON.createGenerator(false); nativeSnapshot.writeStartObject();
  // The native SObject parser requires attributes first. Rebuild that header from
  // trusted Schema after checking, rather than deserialize caller attributes.
  nativeSnapshot.writeObjectField('attributes',new Map<String,Object>{'type'=>objectApi});
  for(String field:snapshot.keySet()) {
   Schema.DescribeFieldResult shape=fieldDescribe(objectType,field); Object value=snapshot.get(field);
   if(value==null) { nativeSnapshot.writeNullField(field); continue; }
   if(shape.getType()==Schema.DisplayType.DateTime) value=(Datetime)JSON.deserializeStrict(JSON.serialize(value),Datetime.class);
   else if(shape.getType()==Schema.DisplayType.Id || shape.getType()==Schema.DisplayType.Reference) value=Id.valueOf(CardstackConnectionTypes.normalizeId((String)value));
   else if(shape.getType()==Schema.DisplayType.Boolean) { if(!(value instanceof Boolean)) throw new CardstackOpportunityEditRepository.RepositoryException('INVALID_STATE'); }
   // Snapshot restoration preserves its typed Decimal representation, including
   // schema-2 native scale. Submitted-value normalization is not restoration.
   else if(shape.getType()==Schema.DisplayType.Double || shape.getType()==Schema.DisplayType.Currency) {
    if(!(value instanceof Decimal || value instanceof Integer || value instanceof Long || value instanceof Double)) throw new CardstackOpportunityEditRepository.RepositoryException('INVALID_STATE');
    value=Decimal.valueOf(String.valueOf(value));
   }
   else if(shape.getType()==Schema.DisplayType.Date || shape.getType()==Schema.DisplayType.Integer) value=decode(shape,String.valueOf(value));
   else if(!(value instanceof String)) throw new CardstackOpportunityEditRepository.RepositoryException('INVALID_STATE');
   nativeSnapshot.writeObjectField(field,value);
  }
  nativeSnapshot.writeEndObject(); SObject result=(SObject)JSON.deserializeStrict(nativeSnapshot.getAsString(),SObject.class);
  if(result.getSObjectType()!=objectType || result.Id==null || !state.recordId.equals(CardstackConnectionTypes.normalizeId(String.valueOf(result.Id)))) throw new CardstackOpportunityEditRepository.RepositoryException('INVALID_STATE'); return result;
 }
 /** Distinct Flow terminal capability keeps the actual Flow action tag; plan fields supply server-only mappings. */
 public static Definition flowDefinition(String objectApi,CardstackRecordActionService.Definition action,CardstackPolicyService.Policy published,CardstackFlowPlan.Plan plan) {
  if(action==null || action.type!='screen-flow' || plan==null || plan.targetObjectApiName!=objectApi || plan.identity.apiName!=action.flowApiName || (action.mappings!=null && !action.mappings.isEmpty()))throw new CardstackOpportunityActionPolicy.PolicyException('INVALID_FLOW_ACTION');
  CardstackRecordActionService.Definition terminal=(CardstackRecordActionService.Definition)JSON.deserializeStrict(JSON.serialize(action),CardstackRecordActionService.Definition.class);terminal.mappings=new List<CardstackRecordActionService.Mapping>();
  for(String field:plan.writeSet){CardstackRecordActionService.Mapping mapping=new CardstackRecordActionService.Mapping();mapping.fieldApi=field;mapping.source='current';terminal.mappings.add(mapping);}
  Definition result=buildDefinition(objectApi,terminal,published,null,CURRENT_VERSION);
  for(String field:plan.readSet){CardstackPolicyService.FieldPolicy policy=published.fields.get(field);if(policy==null || !fieldDescribe(result.objectType,field).isAccessible())throw new CardstackOpportunityActionPolicy.PolicyException('FIELD_NOT_READABLE');result.requiredReadableProjection.add(field);}
  List<Object> nativeProjection=new List<Object>();for(String field:projection(result)){Map<String,Object> metadata=fieldMetadata(fieldDescribe(result.objectType,field));if(Test.isRunningTest() && flowReadLengthOverride.containsKey(field))metadata.put('length',flowReadLengthOverride.get(field));nativeProjection.add(metadata);}
  result.fingerprint=CardstackOpportunityEditTypes.digest(new List<Object>{result.fingerprint,CardstackFlowPlan.hash(plan),nativeProjection});result.metadataFingerprint=result.fingerprint;return result;
 }
 /** Completed Flow receipts retain native access checking without reselecting mutable picklist options. */
 public static void markFlowCompleted(Definition definition){definition.terminalReadOnly=true;}
 /** Explicit registered family; existing record routes must still use isGeneric rather than isNative. */
 public static Boolean isFlow(CardstackOpportunityEditTypes.StoredState state){return state!=null && state.schemaVersion==5 && 'screen-flow-v1'.equals(state.kind);}
 public static Boolean isNative(CardstackOpportunityEditTypes.StoredState state){return isGeneric(state)||isFlow(state);}
 public static Boolean isGeneric(CardstackOpportunityEditTypes.StoredState state) { return state!=null && (state.schemaVersion==2 || state.schemaVersion==3 || state.schemaVersion==4) && 'record-edit-v1'.equals(state.kind); }
 public static Boolean exactField(List<String> fields,String field) { for(String candidate:fields) if(candidate.equals(field)) return true; return false; }
 private static Schema.DescribeFieldResult fieldDescribe(Schema.SObjectType objectType,String field) {
  Schema.SObjectField nativeField=objectType.getDescribe().fields.getMap().get(field);
  if(nativeField==null || !nativeField.getDescribe().getName().equals(field)) throw new CardstackOpportunityActionPolicy.PolicyException('UNKNOWN_FIELD'); return nativeField.getDescribe();
 }
 public static String recordName(Definition definition,SObject record) { return literal(record.get(definition.nameField)); }
 private static String nameField(Schema.SObjectType objectType) {
  for(Schema.SObjectField field:objectType.getDescribe().fields.getMap().values()) if(field.getDescribe().isNameField()) return field.getDescribe().getName();
  throw new CardstackOpportunityActionPolicy.PolicyException('UNSUPPORTED_OBJECT');
 }
 private static String literal(Object value) {
  if(value==null) return null;
  if(value instanceof Date) {
   Date dateValue=(Date)value; String year=String.valueOf(dateValue.year()); while(year.length()<4) year='0'+year;
   return year+'-'+(dateValue.month()<10?'0':'')+String.valueOf(dateValue.month())+'-'+(dateValue.day()<10?'0':'')+String.valueOf(dateValue.day());
  }
  if(value instanceof Decimal) { Decimal numberValue=(Decimal)value; if(numberValue==0) return '0'; String plain=numberValue.toPlainString(); return plain.contains('.')?plain.replaceFirst('0+$','').replaceFirst('\\.$',''):plain; }
  return String.valueOf(value);
 }
 /** Checked declarative grouping of the authorized action inputs, without display-only fields. */
 private static Map<String,Object> projectLayout(Schema.SObjectType objectType,List<String> fields,String raw) {
  List<Object> sections=new List<Object>(); Set<String> seen=new Set<String>(); Set<String> referenced=new Set<String>();
  if(!String.isBlank(raw)) {
   Map<String,Object> body=(Map<String,Object>)JSON.deserializeUntyped(raw);
   List<Object> candidates=new List<Object>();
   if(body.get('highlights') instanceof List<Object>) candidates.add(new Map<String,Object>{'label'=>'Highlights','columns'=>2,'fields'=>body.get('highlights')});
   Object configured=body.get('sections');
   if(!(configured instanceof List<Object>) && body.get('recordCard') instanceof Map<String,Object>) configured=((Map<String,Object>)body.get('recordCard')).get('sections');
   if(configured instanceof List<Object>) candidates.addAll((List<Object>)configured);
   Integer index=0;
   for(Object item:candidates) {
    if(!(item instanceof Map<String,Object>)) throw new CardstackOpportunityActionPolicy.PolicyException('INVALID_LAYOUT');
    Map<String,Object> section=(Map<String,Object>)item; List<String> selected=new List<String>();
    if(!(section.get('fields') instanceof List<Object>)) throw new CardstackOpportunityActionPolicy.PolicyException('INVALID_LAYOUT');
    for(Object rawField:(List<Object>)section.get('fields')) {
     if(!(rawField instanceof Map<String,Object>)) throw new CardstackOpportunityActionPolicy.PolicyException('INVALID_LAYOUT');
     Map<String,Object> entry=(Map<String,Object>)rawField; Object field=entry.get('api')==null?entry.get('name'):entry.get('api');
     if(!(field instanceof String) || referenced.contains((String)field)) throw new CardstackOpportunityActionPolicy.PolicyException('INVALID_LAYOUT');
     try { fieldDescribe(objectType,(String)field); } catch(Exception error) { throw new CardstackOpportunityActionPolicy.PolicyException('INVALID_LAYOUT'); }
     referenced.add((String)field);
     if(exactField(fields,(String)field)) { selected.add((String)field); seen.add((String)field); }
    }
    if(selected.isEmpty()) continue;
    Object label=section.get('label'); if(!(label instanceof String) || ((String)label).length()>256) throw new CardstackOpportunityActionPolicy.PolicyException('INVALID_LAYOUT');
    Object count=section.get('columns'); Integer columns=count==null?2:Integer.valueOf(String.valueOf(count));
    if(columns!=1 && columns!=2 && columns!=3) throw new CardstackOpportunityActionPolicy.PolicyException('INVALID_LAYOUT');
    // Studio's three-column card layout uses the supported two-column editor grouping.
    sections.add(new Map<String,Object>{'id'=>'section-'+String.valueOf(index++),'label'=>label,'columns'=>columns==1?1:2,'fields'=>selected});
   }
  }
  List<String> remaining=new List<String>(); for(String field:fields) if(!seen.contains(field)) remaining.add(field);
  if(!remaining.isEmpty()) sections.add(new Map<String,Object>{'id'=>'details','label'=>'Details','columns'=>2,'fields'=>remaining});
  if(sections.size()>20) throw new CardstackOpportunityActionPolicy.PolicyException('INVALID_LAYOUT');
  return new Map<String,Object>{'version'=>1,'sections'=>sections};
 }
}
