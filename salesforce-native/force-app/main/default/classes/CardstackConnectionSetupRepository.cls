/**
 * Isolated system-mode store: private setup has no direct user CRUD. Every entry
 * rechecks a custom permission; CRM/config services remain outside this boundary.
 */
public without sharing class CardstackConnectionSetupRepository {
    private static final String POLICY_REVISION = '1';
    /** These are contract identifiers, not a claim that new runtime is delivered. */
    public static Map<String,String> versions() {
        return new Map<String,String>{'package'=>'0.1.0.8', 'transport'=>'cardstack/v1', 'ui'=>'mcp-apps/v1', 'permissionPolicy'=>POLICY_REVISION};
    }
    /** Admin-only read. */
    public static CardstackConnectionTypes.SetupSnapshot readAdmin(String client) {
        CardstackConnectionAccess.requireAdmin(); return read(client);
    }
    /** User-gated snapshot for internal named diagnostics. */
    public static CardstackConnectionTypes.SetupSnapshot readUser(String client) {
        CardstackConnectionAccess.requireUser(); return read(client);
    }
    private static CardstackConnectionTypes.SetupSnapshot read(String client) {
        CardstackConnectionTypes.requireClient(client);
        List<Cardstack_Connection_Setup__c> rows = [SELECT Revision__c, Configuration__c, Configuration_Digest__c, Step_States__c FROM Cardstack_Connection_Setup__c WHERE Client__c = :client WITH SYSTEM_MODE LIMIT 1];
        return snapshot(client, rows.isEmpty() ? null : rows[0]);
    }
    /** Locks existing row; unique Client__c rejects concurrent initial creation. */
    public static CardstackConnectionTypes.SetupView saveAdmin(CardstackConnectionTypes.SetupInput input) {
        CardstackConnectionAccess.requireAdmin();
        CardstackConnectionTypes.SetupInput normalized = validate(input);
        String client = normalized.client;
        List<Cardstack_Connection_Setup__c> rows = [SELECT Id, Revision__c, Configuration__c, Configuration_Digest__c, Step_States__c FROM Cardstack_Connection_Setup__c WHERE Client__c = :client WITH SYSTEM_MODE LIMIT 1 FOR UPDATE];
        Cardstack_Connection_Setup__c row = rows.isEmpty() ? null : rows[0];
        Integer revision = row == null ? 0 : row.Revision__c.intValue();
        if(input.expectedRevision != revision) throw new CardstackConnectionTypes.ConnectionException('STALE_SETUP');
        String history = input.stepStates == null ? (row == null ? null : row.Step_States__c) : serializeHistory(input.stepStates);
        String serialized = canonical(normalized, row == null ? null : row.Configuration__c);
        if(serialized.length() > 32768) throw new CardstackConnectionTypes.ConnectionException('INVALID_SETUP');
        String semantic = semanticConfiguration(serialized);
        // Legacy digests included endpoint observations. Compare semantics, but preserve
        // the original digest and observed evidence on a no-op to keep active bindings valid.
        if(row != null && semantic.equals(semanticConfiguration(row.Configuration__c))) {
            if(history != row.Step_States__c) {
                row.Step_States__c = history;
                persist(row);
            }
            return snapshot(client, row).setupView;
        }
        String digest = EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256', Blob.valueOf(semantic)));
        if(row == null) row = new Cardstack_Connection_Setup__c(Client__c=client);
        row.Step_States__c = history;
        row.Revision__c = revision + 1; row.Configuration__c = serialized; row.Configuration_Digest__c = digest;
        persist(row);
        return snapshot(client, row).setupView;
    }
    private static void persist(Cardstack_Connection_Setup__c row) {
        try {
            if(row.Id == null) Database.insert(row, AccessLevel.SYSTEM_MODE);
            else Database.update(row, AccessLevel.SYSTEM_MODE);
        } catch(DmlException e) {
            // Unique constraint closes the row-absence race without overwriting winner.
            if(e.getDmlStatusCode(0) == 'DUPLICATE_VALUE') throw new CardstackConnectionTypes.ConnectionException('STALE_SETUP');
            throw new CardstackConnectionTypes.ConnectionException('INVALID_SETUP');
        }
    }
    /** Fixed Boolean guide history is independent of runtime authorization and digest. */
    private static String serializeHistory(Map<String,Boolean> states) {
        Set<String> allowed = new Set<String>{'installation','site','claude','chatgpt','verify','nextGate'};
        if(states.size() > 6) throw new CardstackConnectionTypes.ConnectionException('INVALID_SETUP');
        JSONGenerator writer = JSON.createGenerator(false); writer.writeStartObject();
        for(String key : states.keySet()) if(!allowed.contains(key) || states.get(key) == null) throw new CardstackConnectionTypes.ConnectionException('INVALID_SETUP');
        for(String key : new List<String>{'installation','site','claude','chatgpt','verify','nextGate'}) {
            if(states.containsKey(key)) writer.writeBooleanField(key, states.get(key));
        }
        writer.writeEndObject(); return writer.getAsString();
    }
    private static CardstackConnectionTypes.SetupInput validate(CardstackConnectionTypes.SetupInput input) {
        if(input == null) throw new CardstackConnectionTypes.ConnectionException('INVALID_SETUP');
        CardstackConnectionTypes.SetupInput value = new CardstackConnectionTypes.SetupInput();
        value.client = CardstackConnectionTypes.requireClient(input.client);
        value.transportKind = input.transportKind == null ? CardstackConnectionTypes.SITE_TRANSPORT : input.transportKind;
        if(!CardstackConnectionTypes.SITE_TRANSPORT.equals(value.transportKind) && !CardstackConnectionTypes.DIRECT_TRANSPORT.equals(value.transportKind)) throw new CardstackConnectionTypes.ConnectionException('INVALID_SETUP');
        Boolean direct = CardstackConnectionTypes.DIRECT_TRANSPORT.equals(value.transportKind);
        if(direct && (!CardstackConnectionTypes.DIRECT_CLIENT.equals(value.client) || !CardstackConnectionTypes.DIRECT_ROUTE.equals(input.routeVersion))) throw new CardstackConnectionTypes.ConnectionException('INVALID_SETUP');
        if(!direct && input.routeVersion != null) throw new CardstackConnectionTypes.ConnectionException('INVALID_SETUP');
        value.routeVersion = direct ? CardstackConnectionTypes.DIRECT_ROUTE : null;
        if(input.expectedRevision == null || input.expectedRevision < 0) throw new CardstackConnectionTypes.ConnectionException('INVALID_SETUP');
        value.publicClientId = input.publicClientId == null ? '' : input.publicClientId.trim();
        if(value.publicClientId.length() > 256 || hasControls(input.publicClientId)) throw new CardstackConnectionTypes.ConnectionException('INVALID_SETUP');
        value.sitePrefix = CardstackConnectionTypes.normalizePrefix(input.sitePrefix);
        value.siteId = input.siteId;
        if(value.siteId != null) {
            value.siteId = (Id)CardstackConnectionTypes.normalizeId(String.valueOf(value.siteId));
            if(value.siteId.getSObjectType() != Schema.Site.SObjectType) throw new CardstackConnectionTypes.ConnectionException('INVALID_SETUP');
        }
        if(direct && (value.siteId != null || !value.sitePrefix.equals(''))) throw new CardstackConnectionTypes.ConnectionException('INVALID_SETUP');
        value.enabledIntent = input.enabledIntent == true;
        value.callbacks = new List<String>();
        if(input.callbacks != null && input.callbacks.size() > 10) throw new CardstackConnectionTypes.ConnectionException('INVALID_SETUP');
        Set<String> unique = new Set<String>();
        if(input.callbacks != null) for(String callback : input.callbacks) {
            if(hasControls(callback)) throw new CardstackConnectionTypes.ConnectionException('INVALID_SETUP');
            if(String.isBlank(callback)) continue;
            String url = callback.trim();
            if(url.length() > 2048 || !Pattern.matches('https://[a-zA-Z0-9.-]+(:[0-9]+)?(/[^\\s#]*)?', url) || url.contains('@')) throw new CardstackConnectionTypes.ConnectionException('INVALID_SETUP');
            if(!unique.contains(url)) { unique.add(url); value.callbacks.add(url); }
        }
        value.callbacks.sort();
        if(value.enabledIntent && (value.publicClientId == '' || value.callbacks.isEmpty() || (!direct && value.siteId == null))) throw new CardstackConnectionTypes.ConnectionException('INVALID_SETUP');
        return value;
    }
    private static Boolean hasControls(String value) {
        return value != null && Pattern.compile('[\\x00-\\x1F\\x7F]').matcher(value).find();
    }
    /** Explicit field order makes persisted configuration and digest deterministic. */
    private static String canonical(CardstackConnectionTypes.SetupInput input, String previousSerialized) {
        JSONGenerator writer = JSON.createGenerator(false); writer.writeStartObject();
        Boolean direct = CardstackConnectionTypes.DIRECT_TRANSPORT.equals(input.transportKind);
        if(direct) {
            writer.writeStringField('transportKind', input.transportKind);
            writer.writeStringField('routeVersion', input.routeVersion);
            writer.writeStringField('orgIdentity', CardstackConnectionTypes.normalizeId(String.valueOf(UserInfo.getOrganizationId())));
        }
        writer.writeStringField('client', input.client);
        writer.writeStringField('publicClientId', input.publicClientId);
        writer.writeObjectField('callbacks', input.callbacks);
        if(input.siteId == null) writer.writeNullField('siteId'); else writer.writeStringField('siteId', CardstackConnectionTypes.normalizeId(String.valueOf(input.siteId)));
        writer.writeStringField('sitePrefix', input.sitePrefix); writer.writeBooleanField('enabledIntent', input.enabledIntent);
        // Context-derived URLs are not accepted from input and can remain unreadable.
        CardstackConnectionTypes.ContextView context = direct ? CardstackConnectionContext.directDescriptor(input.client) : CardstackConnectionContext.resolve(input.client, input.siteId, input.sitePrefix);
        if(!direct && previousSerialized != null) {
            Map<String,Object> previous;
            try { previous = (Map<String,Object>)JSON.deserializeUntyped(previousSerialized); }
            catch(JSONException e) { throw new CardstackConnectionTypes.ConnectionException('INVALID_SETUP'); }
            String selectedSite = input.siteId == null ? null : CardstackConnectionTypes.normalizeId(String.valueOf(input.siteId));
            if(previous.get('transportKind') == null && sameText(selectedSite, previous.get('siteId')) && sameText(input.sitePrefix, previous.get('sitePrefix')) &&
                sameText(context.issuer, previous.get('issuer'))) {
                // An unavailable getter must not erase applicable observed evidence on a real edit.
                // A known current getter supplies fresh evidence; a semantic no-op keeps the stored row.
                if(context.resourceUrl == null) { context.resourceUrl = (String)previous.get('resourceUrl'); }
                if(context.metadataUrl == null) { context.metadataUrl = (String)previous.get('metadataUrl'); }
            }
        }
        if(context.resourceUrl == null) writer.writeNullField('resourceUrl'); else writer.writeStringField('resourceUrl', context.resourceUrl);
        if(context.metadataUrl == null) writer.writeNullField('metadataUrl'); else writer.writeStringField('metadataUrl', context.metadataUrl);
        writer.writeStringField('issuer', context.issuer);
        writer.writeStringField('packageVersion', versions().get('package')); writer.writeStringField('transportVersion', versions().get('transport'));
        writer.writeStringField('uiVersion', versions().get('ui')); writer.writeStringField('permissionPolicyRevision', POLICY_REVISION);
        writer.writeEndObject(); return writer.getAsString();
    }
    /** Endpoint observations are evidence, not semantic configuration or caller input. */
    private static String semanticConfiguration(String serialized) {
        Map<String,Object> configuration;
        try { configuration = (Map<String,Object>)JSON.deserializeUntyped(serialized); }
        catch(JSONException e) { throw new CardstackConnectionTypes.ConnectionException('INVALID_SETUP'); }
        JSONGenerator writer = JSON.createGenerator(false);
        writer.writeStartObject();
        // Preserve every byte of the existing Site semantic shape. Direct enrollment
        // includes its fixed registry version and full private org in the binding.
        if(configuration.get('transportKind') != null) {
            for(String key : new List<String>{'transportKind','routeVersion','orgIdentity'}) writer.writeObjectField(key, configuration.get(key));
        }
        for(String key : new List<String>{'client','publicClientId','callbacks','siteId','sitePrefix','enabledIntent',
            'issuer','packageVersion','transportVersion','uiVersion','permissionPolicyRevision'}) {
            if(configuration.get(key) == null) { writer.writeNullField(key); }
            else { writer.writeObjectField(key, configuration.get(key)); }
        }
        writer.writeEndObject();
        return writer.getAsString();
    }
    private static Boolean sameText(String value, Object previous) {
        return value == null ? previous == null : value.equals((String)previous);
    }
    /** Missing evidence is Unknown; drift requires both observed values. */
    private static Boolean knownDifference(String currentValue, Object storedValue) {
        return currentValue != null && storedValue != null && !currentValue.equals((String)storedValue);
    }
    /** Exact direct schema and digest are private enrollment evidence, never input authority. */
    private static void validateDirectStored(String client, Cardstack_Connection_Setup__c row, Map<String,Object> stored) {
        Set<String> fields = new Set<String>{'transportKind','routeVersion','orgIdentity','client','publicClientId','callbacks','siteId','sitePrefix','enabledIntent','resourceUrl','metadataUrl','issuer','packageVersion','transportVersion','uiVersion','permissionPolicyRevision'};
        if(!stored.keySet().equals(fields) || row.Revision__c == null || row.Revision__c <= 0 || row.Revision__c != row.Revision__c.intValue() ||
            !CardstackConnectionTypes.DIRECT_CLIENT.equals(client) || !client.equals(stored.get('client')) ||
            !CardstackConnectionTypes.DIRECT_ROUTE.equals(stored.get('routeVersion')) || stored.get('siteId') != null ||
            !''.equals(stored.get('sitePrefix')) || stored.get('metadataUrl') != null ||
            !(stored.get('enabledIntent') instanceof Boolean) || !(stored.get('orgIdentity') instanceof String) ||
            !(stored.get('publicClientId') instanceof String) || !(stored.get('callbacks') instanceof List<Object>) ||
            !(stored.get('resourceUrl') instanceof String) || !(stored.get('issuer') instanceof String)) throw new CardstackConnectionTypes.ConnectionException('INVALID_SETUP');
        String storedOrg = (String)stored.get('orgIdentity');
        if(!CardstackConnectionTypes.normalizeId(storedOrg).equals(storedOrg)) throw new CardstackConnectionTypes.ConnectionException('INVALID_SETUP');
        CardstackConnectionTypes.SetupInput input = new CardstackConnectionTypes.SetupInput();
        input.client = client; input.transportKind = CardstackConnectionTypes.DIRECT_TRANSPORT; input.routeVersion = CardstackConnectionTypes.DIRECT_ROUTE;
        input.publicClientId = (String)stored.get('publicClientId'); input.callbacks = new List<String>();
        for(Object callback : (List<Object>)stored.get('callbacks')) {
            if(!(callback instanceof String)) throw new CardstackConnectionTypes.ConnectionException('INVALID_SETUP');
            input.callbacks.add((String)callback);
        }
        input.expectedRevision = 0; input.enabledIntent = (Boolean)stored.get('enabledIntent');
        CardstackConnectionTypes.SetupInput normalized = validate(input);
        if(!normalized.publicClientId.equals(input.publicClientId) || !JSON.serialize(normalized.callbacks).equals(JSON.serialize(input.callbacks))) throw new CardstackConnectionTypes.ConnectionException('INVALID_SETUP');
        String digest = EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256', Blob.valueOf(semanticConfiguration(row.Configuration__c))));
        if(!digest.equals(row.Configuration_Digest__c)) throw new CardstackConnectionTypes.ConnectionException('INVALID_SETUP');
    }
    private static Boolean directVersionsMatch(Map<String,Object> stored) {
        Map<String,String> expected = new Map<String,String>{'packageVersion'=>versions().get('package'), 'transportVersion'=>versions().get('transport'), 'uiVersion'=>versions().get('ui'), 'permissionPolicyRevision'=>POLICY_REVISION};
        for(String field : expected.keySet()) {
            if(!(stored.get(field) instanceof String) || !expected.get(field).equals((String)stored.get(field))) return false;
        }
        return true;
    }
    private static CardstackConnectionTypes.SetupSnapshot snapshot(String client, Cardstack_Connection_Setup__c row) {
        Map<String,Object> stored = new Map<String,Object>();
        if(row != null) {
            try { stored = (Map<String,Object>)JSON.deserializeUntyped(row.Configuration__c); }
            catch(JSONException e) { throw new CardstackConnectionTypes.ConnectionException('INVALID_SETUP'); }
        }
        Boolean direct = CardstackConnectionTypes.DIRECT_TRANSPORT.equals(stored.get('transportKind'));
        if(stored.get('transportKind') != null && !direct) throw new CardstackConnectionTypes.ConnectionException('INVALID_SETUP');
        if(direct) validateDirectStored(client, row, stored);
        CardstackConnectionTypes.SetupSnapshot result = direct ? new CardstackConnectionTypes.SetupSnapshot((String)stored.get('orgIdentity')) : new CardstackConnectionTypes.SetupSnapshot();
        result.siteId = stored.get('siteId') == null ? null : (Id)CardstackConnectionTypes.normalizeId((String)stored.get('siteId'));
        result.sitePrefix = stored.get('sitePrefix') == null ? '' : (String)stored.get('sitePrefix');
        CardstackConnectionTypes.SetupView view = new CardstackConnectionTypes.SetupView();
        view.transportKind = direct ? CardstackConnectionTypes.DIRECT_TRANSPORT : null;
        view.routeVersion = direct ? CardstackConnectionTypes.DIRECT_ROUTE : null;
        view.sitePrefix = result.sitePrefix;
        view.stepStates = new Map<String,Boolean>();
        if(row != null && row.Step_States__c != null) {
            try {
                view.stepStates = (Map<String,Boolean>)JSON.deserializeStrict(row.Step_States__c, Map<String,Boolean>.class);
                serializeHistory(view.stepStates);
            } catch(JSONException e) { throw new CardstackConnectionTypes.ConnectionException('INVALID_SETUP'); }
        }
        view.client = client; view.revision = row == null ? 0 : row.Revision__c.intValue();
        view.publicClientId = (String)stored.get('publicClientId'); view.enabledIntent = stored.get('enabledIntent') == true;
        view.callbacks = new List<String>();
        if(stored.get('callbacks') != null) for(Object item : (List<Object>)stored.get('callbacks')) view.callbacks.add((String)item);
        CardstackConnectionTypes.ContextView context = direct ? CardstackConnectionContext.directDescriptor(client) : CardstackConnectionContext.resolve(client, result.siteId, result.sitePrefix);
        view.resourceUrl = context.resourceUrl; view.metadataUrl = context.metadataUrl; view.issuer = context.issuer;
        view.versions = versions(); view.checks = context.checks;
        view.checks.add(CardstackConnectionContext.unknown('oauthPolicy'));
        view.summary = row == null ? 'Not configured' : 'Needs verification';
        if(row != null && ((direct && (!directVersionsMatch(stored) || !result.isCurrentOrg() || !context.resourceUrl.equals(stored.get('resourceUrl')) || !context.issuer.equals(stored.get('issuer')))) || (String)stored.get('packageVersion') != view.versions.get('package') ||
            (String)stored.get('transportVersion') != view.versions.get('transport') ||
            (String)stored.get('uiVersion') != view.versions.get('ui') ||
            (String)stored.get('permissionPolicyRevision') != POLICY_REVISION ||
            knownDifference(context.resourceUrl, stored.get('resourceUrl')) ||
            knownDifference(context.metadataUrl, stored.get('metadataUrl')) ||
            knownDifference(context.issuer, stored.get('issuer')))) {
            view.summary = 'Stale';
            CardstackConnectionTypes.CheckView drift = new CardstackConnectionTypes.CheckView();
            drift.stage = 'configuration'; drift.status = 'Stale'; drift.errorCode = 'STALE_SETUP';
            drift.source = 'Stored configuration differs from current contract/context'; drift.checkedAt = Datetime.now();
            view.checks.add(drift);
        }
        result.setupView = view; result.configurationDigest = row == null ? null : row.Configuration_Digest__c;
        return result;
    }
}
