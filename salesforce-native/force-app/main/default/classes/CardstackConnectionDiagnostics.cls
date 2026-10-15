/**
 * Authorized system store for private synthetic checks; no CRM access. The private
 * object intentionally has no end-user CRUD. Every public entry checks a current
 * custom permission. Locks always acquire setup before the attempt.
 */
public without sharing class CardstackConnectionDiagnostics {
    private static final String REJECTED = 'DIAGNOSTIC_REJECTED';
    private static final String RESOURCE_URI = 'ui://cardstack/connection-diagnostic-v1.html';
    @TestVisible private static Datetime nowOverride;
    private class StoredState {
        public String orgIdentity;
        public String siteIdentity;
        public String configurationDigest;
        public String payloadDigest;
        public Map<String,String> versions;
        public Boolean emptyText;
        public Datetime checkedAt;
        public String observerIdentity;
        public Datetime observedAt;
    }
    /** Creates independent transient 256-bit key/challenge; persists their hashes only.
     * @param client Canonical route client.
     * @return Named protocol payload, never a support receipt or text fallback.
     */
    public static CardstackConnectionTypes.DiagnosticOpen open(String client) {
        CardstackConnectionAccess.requireUser();
        CardstackConnectionTypes.requireClient(client);
        CardstackConnectionTypes.SetupSnapshot setup = lockSetup(client, false);
        if(!usable(setup)) { throw rejection(); }
        CardstackConnectionTypes.DiagnosticOpen result = new CardstackConnectionTypes.DiagnosticOpen();
        result.attemptKey = EncodingUtil.convertToHex(Crypto.generateAesKey(256));
        result.challenge = EncodingUtil.convertToHex(Crypto.generateAesKey(256));
        // DateTime fields persist whole seconds. Floor before returning and storing
        // so strict receipt equality holds without extending the ten-minute limit.
        Datetime deadline = nowValue().addMinutes(10);
        result.expiresAt = Datetime.newInstanceGmt(deadline.yearGmt(), deadline.monthGmt(), deadline.dayGmt(),
            deadline.hourGmt(), deadline.minuteGmt(), deadline.secondGmt());
        result.configurationRevision = setup.setupView.revision;
        result.client = client; result.versions = new Map<String,String>(setup.setupView.versions);
        result.resourceUri = RESOURCE_URI; result.fixture = fixture(false);
        StoredState state = new StoredState();
        state.orgIdentity = orgIdentity(); state.siteIdentity = siteIdentity(setup);
        state.configurationDigest = setup.configurationDigest; state.versions = setup.setupView.versions;
        Cardstack_Connection_Check__c row = new Cardstack_Connection_Check__c(
            Attempt_Hash__c=digest(result.attemptKey), Challenge_Hash__c=digest(result.challenge),
            Actor__c=(Id)actorIdentity(), Client__c=client, Revision__c=result.configurationRevision,
            Expires_At__c=result.expiresAt, State__c=JSON.serialize(state));
        try { Database.insert(row, AccessLevel.SYSTEM_MODE); }
        catch(DmlException e) { throw rejection(); }
        return result;
    }
    /** Validates actor, deadline, setup and exact fixed payload before one durable acceptance.
     * @param attemptKey Transient key from named open.
     * @param challenge Transient challenge from named open.
     * @param values Exact fixture or empty-text variant.
     * @return Original accepted receipt for an identical replay.
     */
    public static CardstackConnectionTypes.DiagnosticReceipt echo(String attemptKey, String challenge, Map<String,Object> values) {
        CardstackConnectionAccess.requireUser();
        return accept(null, attemptKey, challenge, values);
    }
    /** Binds ingress route as well as the actor and stored setup.
     * @param client Canonical client from authenticated ingress.
     * @param attemptKey Transient attempt key.
     * @param challenge Transient challenge.
     * @param values Exact synthetic fixture.
     * @return Accepted sanitized receipt.
     */
    public static CardstackConnectionTypes.DiagnosticReceipt echoForClient(String client, String attemptKey, String challenge, Map<String,Object> values) {
        CardstackConnectionAccess.requireUser(); CardstackConnectionTypes.requireClient(client);
        return accept(client, attemptKey, challenge, values);
    }
    private static CardstackConnectionTypes.DiagnosticReceipt accept(String client, String attemptKey, String challenge, Map<String,Object> values) {
        if(!secretShape(attemptKey) || !secretShape(challenge)) { throw rejection(); }
        String attemptHash = digest(attemptKey);
        Cardstack_Connection_Check__c located = locate(attemptHash, false);
        if(client != null && !client.equals(located.Client__c)) { throw rejection(); }
        CardstackConnectionTypes.SetupSnapshot setup = lockSetup(located.Client__c, false);
        Cardstack_Connection_Check__c row = lockAttempt(attemptHash, false);
        StoredState state = readState(row);
        if(!current(row, state, setup) || row.Expires_At__c <= nowValue() ||
            !row.Challenge_Hash__c.equals(digest(challenge))) { throw rejection(); }
        Map<String,Object> accepted = validateFixture(values);
        String acceptedDigest = payloadDigest(accepted);
        if(state.checkedAt != null) {
            if(!acceptedDigest.equals(state.payloadDigest)) { throw rejection(); }
            return receipt(row, state, setup);
        }
        state.payloadDigest = acceptedDigest; state.emptyText = ((String)accepted.get('text')).equals(''); state.checkedAt = nowValue();
        row.State__c = JSON.serialize(state); save(row);
        return receipt(row, state, setup);
    }
    /** Reads at most 100 retained checks for the current Salesforce actor and client.
     * @param client Canonical client.
     * @return Sanitized actor-owned history with current drift status.
     */
    public static List<CardstackConnectionTypes.DiagnosticReceipt> mine(String client) {
        CardstackConnectionAccess.requireUser(); CardstackConnectionTypes.requireClient(client);
        CardstackConnectionTypes.SetupSnapshot setup = lockSetup(client, false);
        Id actor = (Id)actorIdentity(); Datetime cutoff = nowValue().addDays(-30);
        List<Cardstack_Connection_Check__c> rows = [SELECT Attempt_Hash__c, Client__c, Revision__c, Expires_At__c, State__c
            FROM Cardstack_Connection_Check__c WHERE Actor__c = :actor AND Client__c = :client AND CreatedDate >= :cutoff
            WITH SYSTEM_MODE ORDER BY CreatedDate DESC, Id DESC LIMIT 100];
        List<CardstackConnectionTypes.DiagnosticReceipt> results = new List<CardstackConnectionTypes.DiagnosticReceipt>();
        for(Cardstack_Connection_Check__c row : rows) { results.add(receipt(row, readState(row), setup)); }
        return results;
    }
    /** Records a distinct operator observation of an already passing, current receipt.
     * @param receiptReference Opaque public reference, never a private record ID.
     * @return Minimum sanitized summary; observation is not host attestation.
     */
    public static CardstackConnectionTypes.DiagnosticReceipt observe(String receiptReference) {
        CardstackConnectionAccess.requireAdmin();
        if(receiptReference == null || !Pattern.matches('check_[a-f0-9]{64}', receiptReference)) { throw rejection(); }
        String attemptHash = receiptReference.substring(6);
        Cardstack_Connection_Check__c located = locate(attemptHash, true);
        CardstackConnectionTypes.SetupSnapshot setup = lockSetup(located.Client__c, true);
        Cardstack_Connection_Check__c row = lockAttempt(attemptHash, true);
        StoredState state = readState(row);
        if(!current(row, state, setup) || state.checkedAt == null || row.Expires_At__c <= nowValue()) { throw rejection(); }
        if(state.observedAt == null) {
            state.observerIdentity = actorIdentity(); state.observedAt = nowValue();
            row.State__c = JSON.serialize(state); save(row);
        }
        CardstackConnectionTypes.DiagnosticReceipt result = receipt(row, state, setup);
        result.values = null; // Observers need stage evidence, not even the fixed synthetic payload.
        return result;
    }
    private static CardstackConnectionTypes.SetupSnapshot lockSetup(String client, Boolean admin) {
        // Holding this row lock also serializes revision updates through the foundation.
        List<Cardstack_Connection_Setup__c> rows = [SELECT Id FROM Cardstack_Connection_Setup__c
            WHERE Client__c = :client WITH SYSTEM_MODE LIMIT 1 FOR UPDATE];
        if(rows.isEmpty()) { throw rejection(); }
        return admin ? CardstackConnectionSetupRepository.readAdmin(client) : CardstackConnectionSetupRepository.readUser(client);
    }
    private static Cardstack_Connection_Check__c locate(String attemptHash, Boolean admin) {
        Id actor = (Id)actorIdentity();
        List<Cardstack_Connection_Check__c> rows;
        if(admin) {
            rows = [SELECT Client__c FROM Cardstack_Connection_Check__c WHERE Attempt_Hash__c = :attemptHash WITH SYSTEM_MODE LIMIT 1];
        } else {
            rows = [SELECT Client__c FROM Cardstack_Connection_Check__c WHERE Attempt_Hash__c = :attemptHash AND Actor__c = :actor WITH SYSTEM_MODE LIMIT 1];
        }
        if(rows.isEmpty()) { throw rejection(); }
        return rows[0];
    }
    private static Cardstack_Connection_Check__c lockAttempt(String attemptHash, Boolean admin) {
        Id actor = (Id)actorIdentity();
        List<Cardstack_Connection_Check__c> rows;
        if(admin) {
            rows = [SELECT Id, Attempt_Hash__c, Challenge_Hash__c, Client__c, Revision__c, Expires_At__c, State__c
                FROM Cardstack_Connection_Check__c WHERE Attempt_Hash__c = :attemptHash WITH SYSTEM_MODE LIMIT 1 FOR UPDATE];
        } else {
            rows = [SELECT Id, Attempt_Hash__c, Challenge_Hash__c, Client__c, Revision__c, Expires_At__c, State__c
                FROM Cardstack_Connection_Check__c WHERE Attempt_Hash__c = :attemptHash AND Actor__c = :actor WITH SYSTEM_MODE LIMIT 1 FOR UPDATE];
        }
        if(rows.isEmpty()) { throw rejection(); }
        return rows[0];
    }
    private static Boolean usable(CardstackConnectionTypes.SetupSnapshot setup) {
        return setup.isCurrentOrg() && setup.setupView.enabledIntent == true &&
            setup.setupView.revision > 0 && !'Stale'.equals(setup.setupView.summary);
    }
    private static Boolean current(Cardstack_Connection_Check__c row, StoredState state, CardstackConnectionTypes.SetupSnapshot setup) {
        return state != null && usable(setup) && row.Revision__c == setup.setupView.revision &&
            orgIdentity().equals(state.orgIdentity) && siteIdentity(setup).equals(state.siteIdentity) &&
            setup.configurationDigest != null && setup.configurationDigest.equals(state.configurationDigest) &&
            setup.setupView.versions.equals(state.versions);
    }
    private static StoredState readState(Cardstack_Connection_Check__c row) {
        try { return (StoredState)JSON.deserialize(row.State__c, StoredState.class); }
        catch(JSONException e) { throw rejection(); }
    }
    private static void save(Cardstack_Connection_Check__c row) {
        try { Database.update(row, AccessLevel.SYSTEM_MODE); }
        catch(DmlException e) { throw rejection(); }
    }
    private static Map<String,Object> fixture(Boolean emptyText) {
        return new Map<String,Object>{'text'=>emptyText ? '' : 'café ✓ "quoted"','amount'=>0,'accepted'=>false,
            'choice'=>'beta','rating'=>'hot','notes'=>'first\nsecond','enabled'=>false};
    }
    private static Map<String,Object> validateFixture(Map<String,Object> values) {
        Map<String,Object> expected = fixture(false);
        if(values == null || !values.keySet().equals(expected.keySet())) { throw rejection(); }
        for(String key : new List<String>{'text','choice','rating','notes'}) {
            Object value = values.get(key);
            if(!(value instanceof String)) { throw rejection(); }
            String text = (String)value;
            if(key.equals('text') && text.equals('')) { continue; }
            if(!text.equals((String)expected.get(key))) { throw rejection(); }
        }
        for(String key : new List<String>{'accepted','enabled'}) {
            if(!(values.get(key) instanceof Boolean) || (Boolean)values.get(key) != false) { throw rejection(); }
        }
        if(!numericZero(values.get('amount'))) { throw rejection(); }
        // Return only a new fixed canonical map, never arbitrary caller data.
        return fixture(((String)values.get('text')).equals(''));
    }
    private static Boolean numericZero(Object amount) {
        if(!(amount instanceof Integer || amount instanceof Long || amount instanceof Decimal || amount instanceof Double)) { return false; }
        // Typed numeric normalization excludes NaN/infinity and never coerces caller strings/Booleans.
        try { return Decimal.valueOf(String.valueOf(amount)) == Decimal.valueOf('0'); }
        catch(TypeException e) { return false; }
    }
    private static String payloadDigest(Map<String,Object> values) {
        // Explicit key order; numeric JSON zero canonicalized to Integer by validation.
        List<Object> ordered = new List<Object>();
        for(String key : new List<String>{'text','amount','accepted','choice','rating','notes','enabled'}) { ordered.add(values.get(key)); }
        return digest(JSON.serialize(ordered));
    }
    private static CardstackConnectionTypes.DiagnosticReceipt receipt(Cardstack_Connection_Check__c row, StoredState state, CardstackConnectionTypes.SetupSnapshot setup) {
        Boolean fresh = current(row, state, setup);
        Boolean accepted = state.checkedAt != null;
        CardstackConnectionTypes.DiagnosticReceipt result = new CardstackConnectionTypes.DiagnosticReceipt();
        result.reference = 'check_' + row.Attempt_Hash__c;
        result.configurationRevision = row.Revision__c.intValue(); result.checkedAt = state.checkedAt;
        result.client = row.Client__c; result.versions = state.versions; result.expiresAt = row.Expires_At__c;
        result.values = accepted ? fixture(state.emptyText == true) : null; result.exactValues = accepted && fresh;
        String status = !fresh ? 'Stale' : accepted ? 'Pass' : row.Expires_At__c <= nowValue() ? 'Fail' : 'Unknown';
        result.stages = new List<CardstackConnectionTypes.CheckView>{
            stage('diagnosticExchange',status,'Server exact typed echo',state.checkedAt, !fresh ? 'STALE_SETUP' : status.equals('Fail') ? 'ATTEMPT_EXPIRED' : null),
            stage('htmlLoading','Unknown','No HTML-loading evidence',null,null),
            stage('clientUiObserved',state.observedAt == null ? 'Unknown' : fresh ? 'Pass' : 'Stale','Operator observation',state.observedAt,null)};
        return result;
    }
    private static CardstackConnectionTypes.CheckView stage(String name, String status, String source, Datetime checkedAt, String code) {
        CardstackConnectionTypes.CheckView result = new CardstackConnectionTypes.CheckView();
        result.stage = name; result.status = status; result.source = source; result.checkedAt = checkedAt; result.errorCode = code; return result;
    }
    private static String actorIdentity() { return CardstackConnectionTypes.normalizeId(String.valueOf(UserInfo.getUserId())); }
    private static String orgIdentity() { return CardstackConnectionTypes.normalizeId(String.valueOf(UserInfo.getOrganizationId())); }
    private static String siteIdentity(CardstackConnectionTypes.SetupSnapshot setup) {
        return setup.siteId == null ? '' : CardstackConnectionTypes.normalizeId(String.valueOf(setup.siteId));
    }
    private static Boolean secretShape(String value) { return value != null && Pattern.matches('[a-f0-9]{64}',value); }
    private static String digest(String value) { return EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256',Blob.valueOf(value))); }
    private static Datetime nowValue() { return Test.isRunningTest() && nowOverride != null ? nowOverride : Datetime.now(); }
    private static CardstackConnectionTypes.ConnectionException rejection() { return new CardstackConnectionTypes.ConnectionException(REJECTED); }
}
