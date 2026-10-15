/** Strict product MCP schemas, governed service dispatch and checked public/private serialization. */
public with sharing class CardstackOpportunityMcpAdapter {
    private static final String OPEN = 'cardstack_opportunity_open';
    private static final String START = 'cardstack_opportunity_edit_start';
    private static final String TRANSITION = 'cardstack_opportunity_edit_transition';
    private static final String REFRESH = 'cardstack_opportunity_refresh';
    private static final String MIME = 'text/html;profile=mcp-app';
    private static final List<String> FIELDS = new List<String>{'StageName','CloseDate','Amount'};
    private static final List<String> OPERATIONS = new List<String>{'review','back','cancel','resume','confirm'};
    @TestVisible private static Boolean resourceOverrideEnabled = false;
    @TestVisible private static Blob resourceOverride;

    /** @return Four closed product descriptors; only Open is model-visible. */
    public static List<Object> tools() {
        return tools(resourceUri());
    }
    /** Pure descriptor projection from a trusted current family asset URI already loaded by the catalog. */
    public static List<Object> tools(String currentUri) {
        Map<String,Object> recordSchema = objectSchema(new Map<String,Object>{'recordId'=>scalar('string')},new List<String>{'recordId'});
        Map<String,Object> startSchema = objectSchema(new Map<String,Object>{'recordId'=>scalar('string'),'actionName'=>scalar('string')},new List<String>{'recordId','actionName'});
        return new List<Object>{
            tool(OPEN,'Open an authorized Opportunity card and its published edit actions.',recordSchema,true,true,currentUri),
            tool(START,'Start the published Opportunity edit from the app.',startSchema,false,false,currentUri),
            tool(TRANSITION,'Review, go back, cancel, resume, or confirm the current server-owned edit from the app.',transitionSchema(),false,false,currentUri),
            tool(REFRESH,'Read the current authorized Opportunity card after saving or changing context.',recordSchema,false,true,currentUri)};
    }
    private static Map<String,Object> tool(String name,String description,Map<String,Object> schema,Boolean visible,Boolean readOnly,String currentUri) {
        Map<String,Object> ui = visible ? new Map<String,Object>{'visibility'=>new List<String>{'model','app'}} :
            new Map<String,Object>{'visibility'=>new List<String>{'app'}};
        Map<String,Object> meta = new Map<String,Object>{'ui'=>ui,'openai/widgetAccessible'=>true};
        if(visible && currentUri != null) {
            ui.put('resourceUri',currentUri);
            meta.put('openai/outputTemplate',currentUri);
        }
        return new Map<String,Object>{'name'=>name,'description'=>description,'inputSchema'=>schema,'_meta'=>meta,
            'annotations'=>new Map<String,Object>{'readOnlyHint'=>readOnly,'destructiveHint'=>false,'openWorldHint'=>false}};
    }
    private static Map<String,Object> scalar(String type) { return new Map<String,Object>{'type'=>type}; }
    private static Map<String,Object> objectSchema(Map<String,Object> properties,List<String> required) {
        return new Map<String,Object>{'type'=>'object','properties'=>properties,'required'=>required,'additionalProperties'=>false};
    }
    private static Map<String,Object> transitionSchema() {
        Map<String,Object> properties = transitionProperties();
        properties.put('operation',new Map<String,Object>{'type'=>'string','enum'=>OPERATIONS});
        Map<String,Object> schema = objectSchema(properties,new List<String>{'interactionKey','operation'});
        List<Object> branches = new List<Object>();
        for(String operation:OPERATIONS) {
            Map<String,Object> props = new Map<String,Object>{'interactionKey'=>scalar('string'),'expectedRevision'=>scalar('integer'),
                'operation'=>new Map<String,Object>{'type'=>'string','const'=>operation}};
            List<String> required = new List<String>{'interactionKey','operation'};
            if(!operation.equals('resume')) { required.add('expectedRevision'); }
            if(operation.equals('review')) { props.put('changes',properties.get('changes')); required.add('changes'); }
            if(operation.equals('confirm')) {
                props.put('reviewRevision',scalar('integer'));props.put('reviewGrant',scalar('string'));
                required.add('reviewRevision');required.add('reviewGrant');
            }
            branches.add(objectSchema(props,required));
        }
        schema.put('oneOf',branches);return schema;
    }
    private static Map<String,Object> transitionProperties() {
        Map<String,Object> field = new Map<String,Object>{'type'=>'string','enum'=>FIELDS};
        Map<String,Object> change = objectSchema(new Map<String,Object>{'fieldApi'=>field,
            'operation'=>new Map<String,Object>{'type'=>'string','enum'=>new List<String>{'set','clear'}},'value'=>scalar('string')},new List<String>{'fieldApi','operation'});
        List<Object> branches = new List<Object>();
        for(String operation:new List<String>{'set','clear'}) {
            Map<String,Object> props = new Map<String,Object>{'fieldApi'=>field,'operation'=>new Map<String,Object>{'type'=>'string','const'=>operation}};
            List<String> required = new List<String>{'fieldApi','operation'};
            if(operation.equals('set')) { props.put('value',scalar('string'));required.add('value'); }
            branches.add(objectSchema(props,required));
        }
        change.put('oneOf',branches);
        return new Map<String,Object>{'interactionKey'=>scalar('string'),'expectedRevision'=>scalar('integer'),'operation'=>scalar('string'),
            'changes'=>new Map<String,Object>{'type'=>'array','items'=>change},'reviewRevision'=>scalar('integer'),'reviewGrant'=>scalar('string')};
    }
    /**
     * @param client Canonical authenticated route, independently checked from arguments.
     * @param name Exact product tool name.
     * @param args Decoded map; unknown keys/types fail before private/CRM reads.
     * @return Checked public card/edit view, private envelope only in MCP metadata.
     */
    public static Map<String,Object> call(String client,String name,Map<String,Object> args) {
        CardstackConnectionAccess.requireUser();CardstackConnectionTypes.requireClient(client);
        Boolean confirmAttempt = false;
        try {
            if(args == null) { throw invalid(); }
            if(Blob.valueOf(JSON.serialize(args)).size() > 16384) { throw new AdapterException('REQUEST_TOO_LARGE'); }
            if(TRANSITION.equals(name)) {
                CardstackOpportunityEditTypes.TransitionRequest request = parseTransition(args);
                requireSetup(client);confirmAttempt = request.operation.equals('confirm');
                return editResult(CardstackOpportunityEditService.transitionFromMcp(client,request));
            }
            Boolean card = OPEN.equals(name) || REFRESH.equals(name);
            if(!card && !START.equals(name)) { throw invalid(); }
            requireKeys(args,card ? new Set<String>{'recordId'} : new Set<String>{'recordId','actionName'},
                card ? new Set<String>{'recordId'} : new Set<String>{'recordId','actionName'});
            Id recordId = recordId(args.get('recordId'));
            String actionName;
            if(!card) {
                actionName = stringValue(args.get('actionName'));
                if(!Pattern.matches('[a-zA-Z0-9_-]{1,80}',actionName)) { throw invalid(); }
            }
            requireSetup(client);
            if(card) { return cardResult(recordId); }
            return editResult(CardstackOpportunityEditService.start(client,recordId,actionName));
        } catch(AdapterException error) { return confirmAttempt || 'OUTCOME_UNAVAILABLE'.equals(error.getMessage()) ? unavailable(confirmAttempt) : rejected(error.getMessage()); }
        catch(CardstackConnectionTypes.ConnectionException error) { return confirmAttempt ? unavailable(true) : rejected('CONNECTION_UNAVAILABLE'); }
        catch(CardstackPolicyService.PolicyException error) { return confirmAttempt ? unavailable(true) : rejected('RECORD_UNAVAILABLE'); }
        catch(CardstackOpportunitySelector.ReadException error) { return confirmAttempt ? unavailable(true) : rejected('RECORD_UNAVAILABLE'); }
        catch(Exception error) {
            // A Confirm effect may already have committed. Do not claim failure or unsaved state.
            return unavailable(confirmAttempt);
        }
    }
    private static void requireSetup(String client) {
        CardstackConnectionTypes.SetupSnapshot setup = CardstackConnectionSetupRepository.readUser(client);
        if(setup == null || setup.setupView == null || !setup.isCurrentOrg() || setup.setupView.enabledIntent != true
            || setup.setupView.revision == null || setup.setupView.revision < 1 || 'Stale'.equals(setup.setupView.summary)) {
            throw new AdapterException('CONNECTION_UNAVAILABLE');
        }
    }
    private static void requireKeys(Map<String,Object> args,Set<String> allowed,Set<String> required) {
        if(args == null || !allowed.containsAll(args.keySet()) || !args.keySet().containsAll(required)) { throw invalid(); }
    }
    private static String stringValue(Object value) {
        if(!(value instanceof String)) { throw invalid(); }return (String)value;
    }
    private static Integer revision(Object value) {
        if(!(value instanceof Integer || value instanceof Long || value instanceof Decimal || value instanceof Double)) { throw invalid(); }
        try {
            Decimal parsedRevision = Decimal.valueOf(String.valueOf(value));
            if(parsedRevision < 0 || parsedRevision > 2147483647 || parsedRevision != parsedRevision.setScale(0)) { throw invalid(); }
            return parsedRevision.intValue();
        } catch(TypeException error) { throw invalid(); }
    }
    private static Id recordId(Object value) {
        String raw = stringValue(value);
        try {
            Id normalized = Id.valueOf(CardstackConnectionTypes.normalizeId(raw));
            if(normalized.getSObjectType() != Opportunity.SObjectType) { throw invalid(); }return normalized;
        } catch(CardstackConnectionTypes.ConnectionException error) { throw invalid(); }
        catch(StringException error) { throw invalid(); }
        catch(TypeException error) { throw invalid(); }
    }
    private static Boolean exactMember(List<String> allowed,String value) {
        for(String candidate:allowed) { if(candidate.equals(value)) { return true; } }return false;
    }
    private static CardstackOpportunityEditTypes.TransitionRequest parseTransition(Map<String,Object> args) {
        String operation = stringValue(args.get('operation'));
        if(!exactMember(OPERATIONS,operation)) { throw invalid(); }
        Set<String> allowed = new Set<String>{'interactionKey','expectedRevision','operation'};
        Set<String> required = new Set<String>{'interactionKey','operation'};
        if(!operation.equals('resume')) { required.add('expectedRevision'); }
        if(operation.equals('review')) { allowed.add('changes');required.add('changes'); }
        if(operation.equals('confirm')) { allowed.add('reviewRevision');allowed.add('reviewGrant');required.add('reviewRevision');required.add('reviewGrant'); }
        requireKeys(args,allowed,required);
        CardstackOpportunityEditTypes.TransitionRequest request = new CardstackOpportunityEditTypes.TransitionRequest();
        request.operation = operation;request.interactionKey = stringValue(args.get('interactionKey'));
        if(args.containsKey('expectedRevision')) { request.expectedRevision = revision(args.get('expectedRevision')); }
        if(operation.equals('review')) { request.changes = parseChanges(args.get('changes')); }
        if(operation.equals('confirm')) { request.reviewRevision = revision(args.get('reviewRevision'));request.reviewGrant = stringValue(args.get('reviewGrant')); }
        return request;
    }
    private static List<CardstackOpportunityEditTypes.FieldChange> parseChanges(Object raw) {
        if(!(raw instanceof List<Object>)) { throw invalid(); }
        List<Object> changes = (List<Object>)raw;
        if(changes.size() > 3) { throw invalid(); }
        Set<String> seen = new Set<String>();List<CardstackOpportunityEditTypes.FieldChange> result = new List<CardstackOpportunityEditTypes.FieldChange>();
        for(Object item:changes) {
            if(!(item instanceof Map<String,Object>)) { throw invalid(); }
            Map<String,Object> change = (Map<String,Object>)item;
            String field = stringValue(change.get('fieldApi')),operation = stringValue(change.get('operation'));
            if(!exactMember(FIELDS,field) || seen.contains(field) || (!operation.equals('set') && !operation.equals('clear'))) { throw invalid(); }
            Set<String> keys = operation.equals('set') ? new Set<String>{'fieldApi','operation','value'} : new Set<String>{'fieldApi','operation'};
            requireKeys(change,keys,keys);seen.add(field);
            CardstackOpportunityEditTypes.FieldChange parsed = new CardstackOpportunityEditTypes.FieldChange();parsed.fieldApi = field;parsed.operation = operation;
            if(operation.equals('set')) { parsed.value = stringValue(change.get('value')); }result.add(parsed);
        }
        return result;
    }
    private static Map<String,Object> cardResult(Id recordId) {
        CardstackPolicyService.Policy policy = CardstackPolicyService.resolve('Opportunity');
        // Existing selector requires native access to all fixed base fields; deny the whole card otherwise.
        CardstackOpportunityEditTypes.RecordContext current = CardstackOpportunitySelector.read(recordId,new Set<String>(),false);
        List<Object> fieldRows = new List<Object>();Map<String,Schema.SObjectField> nativeFields = Opportunity.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED).fields.getMap();
        for(String field:FIELDS) {
            if(!policy.fields.containsKey(field) || !nativeFields.get(field).getDescribe().isAccessible()) { continue; }
            Schema.DescribeFieldResult shape = nativeFields.get(field).getDescribe();
            fieldRows.add(new Map<String,Object>{'fieldApi'=>field,'label'=>shape.getLabel(),'value'=>displayValue(field,current.record.get(field)),
                'dataType'=>String.valueOf(shape.getType()),'currencyCode'=>field.equals('Amount') ? current.currencyCode : null});
        }
        List<Object> actions = new List<Object>();
        for(CardstackRecordActionService.Definition action:CardstackRecordActionService.available('Opportunity')) {
            if(action == null || !'record-edit'.equals(action.type)) { continue; }
            try { CardstackOpportunityActionPolicy.validate('Opportunity',action,policy); }
            catch(CardstackOpportunityActionPolicy.PolicyException error) { continue; }
            actions.add(new Map<String,Object>{'name'=>action.name,'label'=>action.label,'type'=>'record-edit'});
        }
        Map<String,Object> card = new Map<String,Object>{'contractVersion'=>'opportunity-card/v1',
            'recordId'=>CardstackConnectionTypes.normalizeId(String.valueOf(current.record.get('Id'))),'recordName'=>(String)current.record.get('Name'),'fields'=>fieldRows,'actions'=>actions};
        return result('Current Opportunity card. Published edit actions, when available, can be started in the app.',card);
    }
    private static String displayValue(String field,Object value) {
        if(value == null) { return null; }
        if(field.equals('CloseDate')) {
            Date calendar = (Date)value;String year = String.valueOf(calendar.year());while(year.length()<4) { year='0'+year; }
            return year+'-'+(calendar.month()<10?'0':'')+String.valueOf(calendar.month())+'-'+(calendar.day()<10?'0':'')+String.valueOf(calendar.day());
        }
        if(field.equals('Amount')) {
            Decimal amount = (Decimal)value;if(amount==0) { return '0'; }String literal = amount.toPlainString();
            return literal.contains('.') ? literal.replaceFirst('0+$','').replaceFirst('\\.$','') : literal;
        }
        return (String)value;
    }
    private static Map<String,Object> editResult(CardstackOpportunityEditTypes.Envelope envelope) {
        checkView(envelope);
        Map<String,Object> publicView = (Map<String,Object>)JSON.deserializeUntyped(JSON.serialize(envelope.view));
        publicView.remove('screen');
        publicView.remove('objectApiName'); publicView.remove('layout'); // Preserve exact Opportunity v1 public keys.
        String serialized = JSON.serialize(publicView);
        if((envelope.interactionKey != null && serialized.contains(envelope.interactionKey))
            || (envelope.reviewGrant != null && serialized.contains(envelope.reviewGrant))) { throw new AdapterException('OUTCOME_UNAVAILABLE'); }
        Map<String,Object> output = result(summary(envelope.view),publicView);
        if('Rejected'.equals(envelope.view.status) || 'Conflict'.equals(envelope.view.status)) { output.put('isError',true); }
        if(envelope.interactionKey != null) {
            if(!Pattern.matches('[a-f0-9]{64}',envelope.interactionKey) || (envelope.reviewGrant != null && !Pattern.matches('[a-f0-9]{64}',envelope.reviewGrant))) { throw new AdapterException('OUTCOME_UNAVAILABLE'); }
            output.put('_meta',new Map<String,Object>{'cardstack/opportunityEdit'=>new Map<String,Object>{'interactionKey'=>envelope.interactionKey,'reviewGrant'=>envelope.reviewGrant}});
        } else if(envelope.reviewGrant != null) { throw new AdapterException('OUTCOME_UNAVAILABLE'); }
        return output;
    }
    private static void checkView(CardstackOpportunityEditTypes.Envelope envelope) {
        CardstackOpportunityEditTypes.View view = envelope == null ? null : envelope.view;
        if(view == null || !'opportunity-edit/v1'.equals(view.contractVersion) || !exactMember(new List<String>{'Editing','Review','Completed','Cancelled','Expired','Conflict','Rejected'},view.status)
            || view.fields == null || view.diff == null || view.errors == null) { throw new AdapterException('OUTCOME_UNAVAILABLE'); }
        if(view.recordId != null && !CardstackConnectionTypes.normalizeId(view.recordId).equals(view.recordId)) { throw new AdapterException('OUTCOME_UNAVAILABLE'); }
        if(view.recordId != null && Id.valueOf(view.recordId).getSObjectType() != Opportunity.SObjectType) { throw new AdapterException('OUTCOME_UNAVAILABLE'); }
        if((view.revision != null && view.revision < 0) || (view.reviewRevision != null && view.reviewRevision < 0)
            || (view.expiresAt != null && !timestamp(view.expiresAt))) { throw new AdapterException('OUTCOME_UNAVAILABLE'); }
        if(('Editing'.equals(view.status) || 'Review'.equals(view.status) || 'Completed'.equals(view.status))
            && (view.recordId == null || view.recordName == null || view.revision == null || view.revision < 1)) { throw new AdapterException('OUTCOME_UNAVAILABLE'); }
        Set<String> seen = new Set<String>();Integer index=0;
        for(CardstackOpportunityEditTypes.FieldView field:view.fields) {
            if(field == null || !exactMember(FIELDS,field.fieldApi) || seen.contains(field.fieldApi) || field.label == null || field.dataType == null
                || field.required == null || field.canClear == null || field.choices == null || index >= FIELDS.size() || !FIELDS[index].equals(field.fieldApi)) { throw new AdapterException('OUTCOME_UNAVAILABLE'); }seen.add(field.fieldApi);index++;
            Set<String> choices = new Set<String>();
            for(CardstackOpportunityEditTypes.Choice choice:field.choices) {
                if(choice == null || choice.label == null || String.isBlank(choice.value) || choices.contains(choice.value)) { throw new AdapterException('OUTCOME_UNAVAILABLE'); }choices.add(choice.value);
            }
            if(!'StageName'.equals(field.fieldApi) && !field.choices.isEmpty()) { throw new AdapterException('OUTCOME_UNAVAILABLE'); }
            if('Amount'.equals(field.fieldApi) && (field.currencyCode == null || !Pattern.matches('[A-Z]{3}',field.currencyCode))) { throw new AdapterException('OUTCOME_UNAVAILABLE'); }
        }
        if('Editing'.equals(view.status) && (view.fields.size()!=3 || view.expiresAt == null)) { throw new AdapterException('OUTCOME_UNAVAILABLE'); }
        if('Review'.equals(view.status) && (view.reviewRevision == null || view.reviewRevision < 1 || view.diff.isEmpty() || envelope.reviewGrant == null)) { throw new AdapterException('OUTCOME_UNAVAILABLE'); }
        checkDiff(view.diff);
        for(CardstackOpportunityEditTypes.FieldError error:view.errors) {
            if(error == null || error.code == null || !Pattern.matches('[A-Z_]{1,80}',error.code) || error.message == null || error.message.length()>256
                || (error.fieldApi != null && !exactMember(FIELDS,error.fieldApi))) { throw new AdapterException('OUTCOME_UNAVAILABLE'); }
        }
        if('Completed'.equals(view.status)) {
            CardstackOpportunityEditTypes.Receipt receipt = view.receipt;
            if(receipt == null || receipt.reference == null || !Pattern.matches('receipt-[a-f0-9]{32}',receipt.reference) || receipt.actorDisplayName == null || !timestamp(receipt.completedAt)
                || (!'saved'.equals(receipt.status) && !'noChanges'.equals(receipt.status)) || envelope.reviewGrant != null) { throw new AdapterException('OUTCOME_UNAVAILABLE'); }checkDiff(receipt.diff);
            if(('saved'.equals(receipt.status) && receipt.diff.isEmpty()) || ('noChanges'.equals(receipt.status) && !receipt.diff.isEmpty())) { throw new AdapterException('OUTCOME_UNAVAILABLE'); }
        } else if(view.receipt != null) { throw new AdapterException('OUTCOME_UNAVAILABLE'); }
    }
    private static Boolean timestamp(String value) { return value != null && Pattern.matches('[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z',value); }
    private static void checkDiff(List<CardstackOpportunityEditTypes.DiffRow> rows) {
        if(rows == null || rows.size()>3) { throw new AdapterException('OUTCOME_UNAVAILABLE'); }Set<String> seen = new Set<String>();
        for(CardstackOpportunityEditTypes.DiffRow row:rows) {
            if(row == null || !exactMember(FIELDS,row.fieldApi) || seen.contains(row.fieldApi) || row.label == null) { throw new AdapterException('OUTCOME_UNAVAILABLE'); }seen.add(row.fieldApi);
        }
    }
    private static String summary(CardstackOpportunityEditTypes.View view) {
        if('Completed'.equals(view.status)) { return 'saved'.equals(view.receipt.status) ? 'The reviewed Opportunity changes were saved. Refresh the card to read current values.' : 'No changes were needed. Refresh the card to read current values.'; }
        if('Review'.equals(view.status)) { return 'Review the exact changes in the app. Confirm and save is available only there.'; }
        if('Editing'.equals(view.status)) { return view.errors.isEmpty() ? 'Enter Opportunity changes in the app, then review them.' : 'Review the entered field values in the app.'; }
        if('Cancelled'.equals(view.status)) { return 'The edit was cancelled.'; }
        if('Expired'.equals(view.status)) { return 'The edit expired. Start a new edit in the app.'; }
        if('Conflict'.equals(view.status)) { return 'The edit context changed. Refresh before starting a new review.'; }
        return 'Opportunity editing is unavailable for this request.';
    }
    private static Map<String,Object> result(String text,Object structured) {
        return new Map<String,Object>{'content'=>new List<Object>{new Map<String,Object>{'type'=>'text','text'=>text}},'structuredContent'=>structured};
    }
    private static Map<String,Object> rejected(String code) {
        Map<String,Object> output = result('Opportunity editing is unavailable for this request.',new Map<String,Object>{'contractVersion'=>'opportunity-edit/v1','status'=>'Rejected',
            'errors'=>new List<Object>{new Map<String,Object>{'code'=>code,'message'=>'Opportunity editing is unavailable for this request.'}}});output.put('isError',true);return output;
    }
    private static Map<String,Object> unavailable(Boolean confirmAttempt) {
        String message = confirmAttempt ? 'The save outcome is unavailable. Resume the interaction before retrying, then refresh the record.' : 'The request outcome is unavailable. Resume or refresh before retrying.';
        Map<String,Object> output = result(message,new Map<String,Object>{'contractVersion'=>'opportunity-edit/v1','status'=>'Rejected',
            'errors'=>new List<Object>{new Map<String,Object>{'code'=>'OUTCOME_UNAVAILABLE','message'=>'Check the latest server state before retrying.'}}});output.put('isError',true);return output;
    }
    private static CardstackEditorUiResource.Asset resourceAsset() {
        return CardstackEditorUiResource.load(CardstackEditorUiResource.Family.OPPORTUNITY,resourceOverrideEnabled,resourceOverride);
    }
    /** @return Current content address; null when the native asset cannot safely be advertised. */
    public static String resourceUri() {
        CardstackEditorUiResource.Asset asset=resourceAsset();return asset == null ? null : asset.uri;
    }
    /** @param requestedUri Caller URI. @return Exact legacy alias or well-formed address in this fixed family. */
    public static Boolean acceptsResourceUri(String requestedUri) {
        return CardstackEditorUiResource.accepts(CardstackEditorUiResource.Family.OPPORTUNITY,requestedUri);
    }
    /** @param requestedUri Caller URI. @return Exact mutable legacy read alias. */
    public static Boolean isLegacyResourceUri(String requestedUri) {
        return CardstackEditorUiResource.isLegacy(CardstackEditorUiResource.Family.OPPORTUNITY,requestedUri);
    }
    /** @param requestedUri Current content address or exact legacy alias. @return Exact requested resource, or null for stale/unavailable bytes. */
    public static Map<String,Object> readResource(String requestedUri) {
        CardstackConnectionAccess.requireUser();if(!acceptsResourceUri(requestedUri)) { return null; }
        CardstackEditorUiResource.Asset asset=resourceAsset();
        if(!isLegacyResourceUri(requestedUri) && (asset == null || !asset.uri.equals(requestedUri))) {
            asset=CardstackEditorUiArchive.load(CardstackEditorUiResource.Family.OPPORTUNITY,requestedUri);
        }
        if(asset == null) { return null; }
        Map<String,Object> csp = new Map<String,Object>{'connectDomains'=>new List<Object>(),'resourceDomains'=>new List<Object>(),'frameDomains'=>new List<Object>()};
        return new Map<String,Object>{'contents'=>new List<Object>{new Map<String,Object>{'uri'=>requestedUri,'mimeType'=>MIME,'text'=>asset.html,
            '_meta'=>new Map<String,Object>{'ui'=>new Map<String,Object>{'csp'=>csp},
                'openai/widgetCSP'=>new Map<String,Object>{'connect_domains'=>new List<Object>(),'resource_domains'=>new List<Object>()}}}}};
    }
    private static AdapterException invalid() { return new AdapterException('INVALID_ARGUMENTS'); }
    /** Fixed boundary error codes only; caller values never appear in error text. */
    public class AdapterException extends Exception {}
}
