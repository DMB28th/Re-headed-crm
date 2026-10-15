/** Admin-only guided setup. String adapters avoid unsupported inner DTO LWC signatures. */
public with sharing class CardstackConnectionSetupController {
    private static final Set<String> INPUT_KEYS = new Set<String>{'transportKind','routeVersion','client','publicClientId','callbacks','siteId','sitePrefix','enabledIntent','expectedRevision','stepStates'};
    private static final Set<String> SAFE_ERRORS = new Set<String>{'NOT_AUTHORIZED','INVALID_CLIENT','INVALID_SETUP','STALE_SETUP','DIAGNOSTIC_REJECTED'};
    /** Fresh configuration and current actor diagnostic evidence; no provider metadata guesses. */
    public static CardstackConnectionTypes.SetupView load(String client) {
        CardstackConnectionAccess.requireAdmin();
        CardstackConnectionTypes.SetupView view = CardstackConnectionSetup.get(client);
        if(view.revision > 0) {
            List<CardstackConnectionTypes.DiagnosticReceipt> history = CardstackConnectionDiagnostics.mine(client);
            if(!history.isEmpty()) {
                CardstackConnectionTypes.DiagnosticReceipt latest = history[0];
                for(CardstackConnectionTypes.CheckView evidence : latest.stages) {
                    evidence.source += ' (configuration revision ' + latest.configurationRevision + ')';
                    view.checks.add(evidence);
                }
                if(!'Stale'.equals(view.summary)) {
                    String status = latest.stages[0].status;
                    view.summary = status == 'Stale' ? 'Stale' : status == 'Fail' ? 'Needs attention' :
                        latest.exactValues == true ? 'Diagnostic passed' : 'Needs verification';
                    if(latest.exactValues == true && latest.stages[2].status == 'Pass') view.summary = 'Client UI observed';
                }
            }
        }
        return view;
    }
    /** Typed backend facade preserves original validation and revision checks. */
    public static CardstackConnectionTypes.SetupView save(CardstackConnectionTypes.SetupInput input) {
        CardstackConnectionAccess.requireAdmin();
        return CardstackConnectionSetup.save(input);
    }
    /** On-demand check reads supported current context and actor-owned diagnostic history. */
    public static CardstackConnectionTypes.SetupView check(String client) {
        CardstackConnectionAccess.requireAdmin(); return load(client);
    }
    /** Explicit operator observation requires a current successful backend receipt. */
    public static CardstackConnectionTypes.DiagnosticReceipt observe(String receiptReference) {
        CardstackConnectionAccess.requireAdmin();
        CardstackConnectionTypes.DiagnosticReceipt receipt = CardstackConnectionDiagnostics.observe(receiptReference);
        receipt.values = null; receipt.reference = null; return receipt;
    }
    /** Supported LWC String boundary; errors contain only a fixed code. */
    @AuraEnabled public static String loadForUi(String client) {
        try { CardstackConnectionAccess.requireAdmin(); return JSON.serialize(viewOutput(load(client))); }
        catch(Exception e) { throw safeException(e); }
    }
    /** No cache: every request rechecks access and evidence. */
    @AuraEnabled public static String checkForUi(String client) {
        try { CardstackConnectionAccess.requireAdmin(); return JSON.serialize(viewOutput(check(client))); }
        catch(Exception e) { throw safeException(e); }
    }
    /** Exact bounded input. A blank Site selection retains only the server-owned previous selection. */
    @AuraEnabled public static String saveForUi(String inputJson) {
        try {
            CardstackConnectionAccess.requireAdmin();
            CardstackConnectionTypes.SetupInput input = parseInput(inputJson);
            CardstackConnectionTypes.SetupSnapshot previous = CardstackConnectionSetupRepository.readAdmin(input.client);
            if(input.transportKind == null) {
                input.transportKind = previous.setupView.transportKind;
                input.routeVersion = previous.setupView.routeVersion;
            }
            if(!CardstackConnectionTypes.DIRECT_TRANSPORT.equals(input.transportKind) && input.siteId == null) input.siteId = previous.siteId;
            return JSON.serialize(viewOutput(save(input)));
        } catch(Exception e) { throw safeException(e); }
    }
    /** Minimum observation output deliberately excludes payload and receipt reference. */
    @AuraEnabled public static String observeForUi(String receiptReference) {
        try {
            CardstackConnectionAccess.requireAdmin();
            CardstackConnectionTypes.DiagnosticReceipt receipt = observe(receiptReference);
            return JSON.serialize(new Map<String,Object>{'client'=>receipt.client,'versions'=>receipt.versions,
                'configurationRevision'=>receipt.configurationRevision,'checkedAt'=>receipt.checkedAt,
                'expiresAt'=>receipt.expiresAt,'exactValues'=>receipt.exactValues,'stages'=>checkOutput(receipt.stages, true)});
        } catch(Exception e) { throw safeException(e); }
    }
    /** Downloadable support output excludes identities, URLs, client IDs, callbacks and raw errors. */
    @AuraEnabled public static String exportSummary(String client) {
        try {
            CardstackConnectionAccess.requireAdmin();
            CardstackConnectionTypes.SetupView view = load(client);
            return JSON.serialize(new Map<String,Object>{'status'=>view.summary,'versions'=>view.versions,'checks'=>checkOutput(view.checks, false)});
        } catch(Exception e) { throw safeException(e); }
    }
    private static CardstackConnectionTypes.SetupInput parseInput(String inputJson) {
        if(inputJson == null || inputJson.length() > 32768) throw invalidInput();
        Map<String,Object> raw;
        try { raw = (Map<String,Object>)JSON.deserializeUntyped(inputJson); }
        catch(Exception e) { throw invalidInput(); }
        if(raw == null || !INPUT_KEYS.containsAll(raw.keySet())) throw invalidInput();
        // Reject strings coerced into Boolean/Integer values by typed deserialization.
        for(String field : new List<String>{'transportKind','routeVersion','client','publicClientId','siteId','sitePrefix'}) {
            if(raw.get(field) != null && !(raw.get(field) instanceof String)) throw invalidInput();
        }
        if(raw.get('enabledIntent') != null && !(raw.get('enabledIntent') instanceof Boolean)) throw invalidInput();
        if(raw.get('expectedRevision') != null && !(raw.get('expectedRevision') instanceof Integer)) throw invalidInput();
        if(raw.get('callbacks') != null) {
            if(!(raw.get('callbacks') instanceof List<Object>)) throw invalidInput();
            for(Object callback : (List<Object>)raw.get('callbacks')) if(!(callback instanceof String)) throw invalidInput();
        }
        if(raw.get('stepStates') != null) {
            if(!(raw.get('stepStates') instanceof Map<String,Object>)) throw invalidInput();
            Map<String,Object> states = (Map<String,Object>)raw.get('stepStates');
            if(!new Set<String>{'installation','site','claude','chatgpt','verify','nextGate'}.containsAll(states.keySet())) throw invalidInput();
            for(Object value : states.values()) if(!(value instanceof Boolean)) throw invalidInput();
        }
        String site = (String)raw.get('siteId');
        if(String.isBlank(site)) raw.put('siteId',null);
        else {
            if(site.length() != 18) throw invalidInput();
            CardstackConnectionTypes.normalizeId(site);
        }
        try { return (CardstackConnectionTypes.SetupInput)JSON.deserializeStrict(JSON.serialize(raw), CardstackConnectionTypes.SetupInput.class); }
        catch(Exception e) { throw invalidInput(); }
    }
    private static Map<String,Object> viewOutput(CardstackConnectionTypes.SetupView view) {
        Map<String,Object> result = new Map<String,Object>{'client'=>view.client,'revision'=>view.revision,'publicClientId'=>view.publicClientId,
            'callbacks'=>view.callbacks,'sitePrefix'=>view.sitePrefix,'resourceUrl'=>view.resourceUrl,
            'metadataUrl'=>view.metadataUrl,'issuer'=>view.issuer,'enabledIntent'=>view.enabledIntent,
            'versions'=>view.versions,'checks'=>checkOutput(view.checks,true),'summary'=>view.summary,'stepStates'=>view.stepStates};
        if(CardstackConnectionTypes.DIRECT_TRANSPORT.equals(view.transportKind)) { result.put('transportKind', view.transportKind); result.put('routeVersion', view.routeVersion); }
        return result;
    }
    private static List<Object> checkOutput(List<CardstackConnectionTypes.CheckView> checks, Boolean includeSource) {
        List<Object> result = new List<Object>();
        for(CardstackConnectionTypes.CheckView check : checks) {
            Map<String,Object> item = new Map<String,Object>{'stage'=>check.stage,'status'=>check.status,'checkedAt'=>check.checkedAt,'errorCode'=>check.errorCode};
            if(includeSource) item.put('source',check.source);
            result.add(item);
        }
        return result;
    }
    private static CardstackConnectionTypes.ConnectionException invalidInput() {
        return new CardstackConnectionTypes.ConnectionException('INVALID_SETUP');
    }
    private static AuraHandledException safeException(Exception failure) {
        String code = failure instanceof CardstackConnectionTypes.ConnectionException && SAFE_ERRORS.contains(failure.getMessage()) ? failure.getMessage() : 'SETUP_UNAVAILABLE';
        AuraHandledException safe = new AuraHandledException(code); safe.setMessage(code); return safe;
    }
}
