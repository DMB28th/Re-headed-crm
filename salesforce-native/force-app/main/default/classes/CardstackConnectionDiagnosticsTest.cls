/** Test-first actor, exact fixture, replay, drift and observation contracts. */
@IsTest private with sharing class CardstackConnectionDiagnosticsTest {
    private static CardstackConnectionTypes.SetupInput setupInput(Integer revision) {
        CardstackConnectionTypes.SetupInput input = new CardstackConnectionTypes.SetupInput();
        input.client = 'claude'; input.publicClientId = 'diagnostic-public-client';
        input.callbacks = new List<String>{'https://claude.ai/api/mcp/auth_callback'};
        input.siteId = (Id)CardstackConnectionTypes.normalizeId(Schema.Site.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED).getKeyPrefix() + '0'.repeat(12));
        input.sitePrefix = '/cardstack'; input.enabledIntent = true; input.expectedRevision = revision;
        return input;
    }
    private static void configure() {
        CardstackConnectionAccess.adminOverride = true;
        CardstackConnectionAccess.userOverride = true;
        CardstackConnectionSetup.save(setupInput(0));
    }
    private static Map<String,Object> fixture() {
        return new Map<String,Object>{'text'=>'café ✓ "quoted"','amount'=>0,'accepted'=>false,
            'choice'=>'beta','rating'=>'hot','notes'=>'first\nsecond','enabled'=>false};
    }
    private static void rejected(CardstackConnectionTypes.DiagnosticOpen attempt, Map<String,Object> values) {
        try { CardstackConnectionDiagnostics.echo(attempt.attemptKey, attempt.challenge, values); Assert.fail('Submission must fail'); }
        catch(CardstackConnectionTypes.ConnectionException e) { Assert.areEqual('DIAGNOSTIC_REJECTED', e.getMessage(), 'No actor/state oracle'); }
    }
    @IsTest static void exactSevenValuesPreserved() {
        configure(); Test.startTest();
        CardstackConnectionTypes.DiagnosticOpen attempt = CardstackConnectionDiagnostics.open('claude');
        Assert.areEqual(fixture(), attempt.fixture, 'Advertised exact fixture');
        CardstackConnectionTypes.DiagnosticReceipt receipt = CardstackConnectionDiagnostics.echo(attempt.attemptKey, attempt.challenge, fixture());
        Test.stopTest();
        Assert.areEqual(fixture(), receipt.values, 'Exact keys, Unicode, zero, false and newline');
        Assert.areEqual(new Set<String>{'text','amount','accepted','choice','rating','notes','enabled'},receipt.values.keySet(),'Exactly seven keys');
        for(String key:new List<String>{'text','choice','rating','notes'}) {
            Assert.isTrue(receipt.values.get(key) instanceof String,'String field '+key);
            Assert.isTrue(((String)fixture().get(key)).equals((String)receipt.values.get(key)),'Case-sensitive value '+key);
        }
        Assert.areEqual(false,receipt.values.get('enabled'),'Second Boolean false preserved');
        Assert.isTrue(receipt.values.get('enabled') instanceof Boolean,'Second Boolean type');
        Assert.areEqual('claude',receipt.client,'Server-derived client');
        Assert.areEqual(attempt.expiresAt,receipt.expiresAt,'Original attempt deadline');
        Assert.areEqual(CardstackConnectionSetupRepository.versions(),receipt.versions,'Server-derived versions');
        Assert.isTrue(receipt.values.get('amount') instanceof Decimal || receipt.values.get('amount') instanceof Integer, 'Numeric type');
        Assert.isTrue(receipt.values.get('accepted') instanceof Boolean, 'Boolean type');
        Assert.isTrue(receipt.exactValues, 'Automated exact echo passed');
        Assert.areEqual('Pass', receipt.stages[0].status, 'Exchange stage');
        Assert.areEqual('Unknown', receipt.stages[1].status, 'No fabricated HTML proof');
        Assert.areEqual('Unknown', receipt.stages[2].status, 'No fabricated host proof');
        Assert.areEqual(1, [SELECT count() FROM Cardstack_Connection_Check__c], 'One private check');
        String encoded = JSON.serialize(receipt);
        Assert.isFalse(encoded.contains(attempt.attemptKey), 'No key in receipt');
        Assert.isFalse(encoded.contains(attempt.challenge), 'No challenge in receipt');
        Assert.isFalse(encoded.contains(String.valueOf(UserInfo.getUserId())), 'No actor ID');
        Assert.isFalse(encoded.contains(String.valueOf(UserInfo.getOrganizationId())), 'No org ID');
        Assert.isFalse(encoded.contains(String.valueOf(setupInput(0).siteId)), 'No Site ID');
        Cardstack_Connection_Check__c stored=[SELECT Id FROM Cardstack_Connection_Check__c LIMIT 1];
        Assert.isFalse(encoded.contains(String.valueOf(stored.Id)), 'No private record ID');
    }
    @IsTest static void emptyTextRemainsEmpty() {
        configure(); Map<String,Object> values = fixture(); values.put('text',''); Test.startTest();
        CardstackConnectionTypes.DiagnosticOpen attempt = CardstackConnectionDiagnostics.open('claude');
        CardstackConnectionTypes.DiagnosticReceipt receipt = CardstackConnectionDiagnostics.echo(attempt.attemptKey, attempt.challenge, values);
        Test.stopTest(); Assert.areEqual('', receipt.values.get('text'), 'Empty text not null');
    }
    @IsTest static void nullValueRejected() { configure(); Map<String,Object> values=fixture(); values.put('text',null); invalid(values); }
    @IsTest static void nanStringRejected() { configure(); Map<String,Object> values=fixture(); values.put('amount','NaN'); invalid(values); }
    @IsTest static void extraKeyRejected() { configure(); Map<String,Object> values=fixture(); values.put('extra',false); invalid(values); }
    @IsTest static void wrongCaseRejected() { configure(); Map<String,Object> values=fixture(); values.put('choice','BETA'); invalid(values); }
    @IsTest static void wrongNumericTypeRejected() { configure(); Map<String,Object> values=fixture(); values.put('amount',false); invalid(values); }
    @IsTest static void missingKeyRejected() { configure(); Map<String,Object> values=fixture(); values.remove('notes'); invalid(values); }
    @IsTest static void arbitraryTextRejected() { configure(); Map<String,Object> values=fixture(); values.put('text','arbitrary'); invalid(values); }
    @IsTest static void nullMapRejected() { configure(); invalid(null); }
    @IsTest static void nonzeroNumberRejected() { configure(); Map<String,Object> values=fixture(); values.put('amount',1); invalid(values); }
    @IsTest static void stringZeroRejected() { configure(); Map<String,Object> values=fixture(); values.put('amount','0'); invalid(values); }
    @IsTest static void stringFalseRejected() { configure(); Map<String,Object> values=fixture(); values.put('accepted','false'); invalid(values); }
    @IsTest static void decimalZeroAccepted() {
        configure(); Map<String,Object> values=fixture(); values.put('amount',Decimal.valueOf('0.00'));
        Test.startTest(); CardstackConnectionTypes.DiagnosticOpen attempt=CardstackConnectionDiagnostics.open('claude');
        Assert.isTrue(CardstackConnectionDiagnostics.echo(attempt.attemptKey,attempt.challenge,values).exactValues,'JSON numeric zero accepted'); Test.stopTest();
    }
    @IsTest static void doubleZeroAccepted() {
        configure(); Map<String,Object> values=fixture(); values.put('amount',Double.valueOf('0.0'));
        Test.startTest(); CardstackConnectionTypes.DiagnosticOpen attempt=CardstackConnectionDiagnostics.open('claude');
        Assert.isTrue(CardstackConnectionDiagnostics.echo(attempt.attemptKey,attempt.challenge,values).exactValues,'Finite Double zero accepted'); Test.stopTest();
    }

    private static void invalid(Map<String,Object> values) {
        Test.startTest(); CardstackConnectionTypes.DiagnosticOpen attempt = CardstackConnectionDiagnostics.open('claude');
        Integer dmlBefore = Limits.getDmlStatements(); rejected(attempt,values);
        Assert.areEqual(dmlBefore, Limits.getDmlStatements(), 'Rejected echo cannot transition'); Test.stopTest();
    }
    @IsTest static void secretsOnlyStoredHashed() {
        configure(); Test.startTest(); CardstackConnectionTypes.DiagnosticOpen attempt=CardstackConnectionDiagnostics.open('claude'); Test.stopTest();
        // Test-only inspection of intentionally private service state; no CRUD/FLS grant added.
        Cardstack_Connection_Check__c check=[SELECT Attempt_Hash__c, Challenge_Hash__c, State__c FROM Cardstack_Connection_Check__c WITH SYSTEM_MODE LIMIT 1];
        Assert.areEqual(64, attempt.attemptKey.length(), '256-bit key'); Assert.areEqual(64, attempt.challenge.length(), '256-bit challenge');
        Assert.areNotEqual(attempt.attemptKey, attempt.challenge, 'Independent randomness');
        Assert.areEqual(EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256',Blob.valueOf(attempt.attemptKey))),check.Attempt_Hash__c,'Key hash');
        Assert.areEqual(EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256',Blob.valueOf(attempt.challenge))),check.Challenge_Hash__c,'Challenge hash');
        Assert.isFalse(check.State__c.contains(attempt.attemptKey), 'No persisted raw key');
        Assert.isFalse(check.State__c.contains(attempt.challenge), 'No persisted raw challenge');
    }
    @IsTest static void persistedDeadlineMatchesSerializedOpenAndReceipt() {
        configure();
        Datetime opened=Datetime.newInstance(Datetime.newInstanceGmt(2026,10,10,12,0,0).getTime()+29L);
        Datetime expectedDeadline=Datetime.newInstanceGmt(2026,10,10,12,10,0);
        CardstackConnectionDiagnostics.nowOverride=opened; Test.startTest();
        CardstackConnectionTypes.DiagnosticOpen attempt=CardstackConnectionDiagnostics.open('claude');
        // Real insert in open followed by a database read; in-memory equality misses precision loss.
        Cardstack_Connection_Check__c persisted=[SELECT Expires_At__c FROM Cardstack_Connection_Check__c WITH SYSTEM_MODE LIMIT 1];
        CardstackConnectionTypes.DiagnosticReceipt receipt=CardstackConnectionDiagnostics.echo(attempt.attemptKey,attempt.challenge,fixture());
        Test.stopTest();
        Assert.areEqual(expectedDeadline,attempt.expiresAt,'Floor the deadline to persisted whole-second precision');
        Assert.areEqual(0,attempt.expiresAt.timeGmt().millisecond(),'Returned deadline has no milliseconds');
        Assert.areEqual(attempt.expiresAt,persisted.Expires_At__c,'Advertised deadline survives actual DML and requery');
        Map<String,Object> serializedOpen=(Map<String,Object>)JSON.deserializeUntyped(JSON.serialize(attempt));
        Map<String,Object> serializedReceipt=(Map<String,Object>)JSON.deserializeUntyped(JSON.serialize(receipt));
        Assert.areEqual(serializedOpen.get('expiresAt'),serializedReceipt.get('expiresAt'),'Strict wire deadline equality');
        Assert.isTrue(attempt.expiresAt<=opened.addMinutes(10),'Canonical deadline never extends maximum expiry');
    }
    @IsTest static void millisecondBeforeCanonicalDeadlineAccepted() {
        configure();
        CardstackConnectionDiagnostics.nowOverride=Datetime.newInstance(Datetime.newInstanceGmt(2026,10,10,12,0,0).getTime()+999L);
        Test.startTest(); CardstackConnectionTypes.DiagnosticOpen attempt=CardstackConnectionDiagnostics.open('claude');
        CardstackConnectionDiagnostics.nowOverride=Datetime.newInstance(Datetime.newInstanceGmt(2026,10,10,12,10,0).getTime()-1L);
        Assert.isTrue(CardstackConnectionDiagnostics.echo(attempt.attemptKey,attempt.challenge,fixture()).exactValues,'One millisecond before persisted boundary accepted');
        Test.stopTest();
    }
    @IsTest static void canonicalDeadlineRejectsFreshEcho() {
        configure();
        CardstackConnectionDiagnostics.nowOverride=Datetime.newInstance(Datetime.newInstanceGmt(2026,10,10,12,0,0).getTime()+999L);
        Test.startTest(); CardstackConnectionTypes.DiagnosticOpen attempt=CardstackConnectionDiagnostics.open('claude');
        CardstackConnectionDiagnostics.nowOverride=Datetime.newInstanceGmt(2026,10,10,12,10,0);
        Integer dmlBefore=Limits.getDmlStatements(); rejected(attempt,fixture());
        Assert.areEqual(dmlBefore,Limits.getDmlStatements(),'Expiry refusal cannot accept a fresh echo'); Test.stopTest();
    }
    @IsTest static void canonicalDeadlineRejectsAcceptedReplay() {
        configure();
        CardstackConnectionDiagnostics.nowOverride=Datetime.newInstance(Datetime.newInstanceGmt(2026,10,10,12,0,0).getTime()+999L);
        Test.startTest(); CardstackConnectionTypes.DiagnosticOpen attempt=CardstackConnectionDiagnostics.open('claude');
        CardstackConnectionDiagnostics.echo(attempt.attemptKey,attempt.challenge,fixture());
        CardstackConnectionDiagnostics.nowOverride=Datetime.newInstanceGmt(2026,10,10,12,10,0);
        Integer dmlBefore=Limits.getDmlStatements(); rejected(attempt,fixture());
        Assert.areEqual(dmlBefore,Limits.getDmlStatements(),'Replay remains bounded by persisted expiry'); Test.stopTest();
    }
    @IsTest static void expiresAtTenMinutes() {
        configure(); Datetime opened=Datetime.newInstanceGmt(2026,10,10,12,0,0);
        CardstackConnectionDiagnostics.nowOverride=opened; Test.startTest();
        CardstackConnectionTypes.DiagnosticOpen attempt=CardstackConnectionDiagnostics.open('claude');
        Assert.areEqual(opened.addMinutes(10), attempt.expiresAt,'Exact ten-minute TTL');
        CardstackConnectionDiagnostics.nowOverride=opened.addMinutes(10); rejected(attempt,fixture()); Test.stopTest();
    }
    @IsTest static void beforeExpiryAccepted() {
        configure(); Datetime opened=Datetime.newInstanceGmt(2026,10,10,12,0,0);
        CardstackConnectionDiagnostics.nowOverride=opened; Test.startTest();
        CardstackConnectionTypes.DiagnosticOpen attempt=CardstackConnectionDiagnostics.open('claude');
        CardstackConnectionDiagnostics.nowOverride=opened.addSeconds(599);
        Assert.isTrue(CardstackConnectionDiagnostics.echo(attempt.attemptKey,attempt.challenge,fixture()).exactValues,'Before boundary'); Test.stopTest();
    }
    @IsTest static void duplicateEchoReturnsSameReceipt() {
        configure();
        Datetime opened=Datetime.newInstance(Datetime.newInstanceGmt(2026,10,10,12,0,0).getTime()+123L);
        Datetime accepted=opened.addSeconds(1);
        CardstackConnectionDiagnostics.nowOverride=opened; Test.startTest();
        CardstackConnectionTypes.DiagnosticOpen attempt=CardstackConnectionDiagnostics.open('claude');
        CardstackConnectionDiagnostics.nowOverride=accepted;
        CardstackConnectionTypes.DiagnosticReceipt first=CardstackConnectionDiagnostics.echo(attempt.attemptKey,attempt.challenge,fixture());
        Cardstack_Connection_Check__c persistedBefore=[SELECT Id,State__c FROM Cardstack_Connection_Check__c WITH SYSTEM_MODE LIMIT 1];
        Integer dmlBefore=Limits.getDmlStatements();
        CardstackConnectionDiagnostics.nowOverride=opened.addSeconds(2);
        CardstackConnectionTypes.DiagnosticReceipt replay=CardstackConnectionDiagnostics.echo(attempt.attemptKey,attempt.challenge,fixture());
        Assert.areEqual(dmlBefore,Limits.getDmlStatements(),'Replay performs no transition');
        assertSameReceipt(first,replay);
        Assert.areEqual(accepted,first.checkedAt,'First receipt retains the acceptance instant including milliseconds');
        Assert.areEqual(accepted,replay.checkedAt,'Replay retains the original acceptance instant including milliseconds');
        Assert.areEqual(Datetime.newInstanceGmt(2026,10,10,12,10,0),replay.expiresAt,'Original whole-second attempt deadline retained');
        Cardstack_Connection_Check__c persistedAfter=[SELECT Id,State__c FROM Cardstack_Connection_Check__c WITH SYSTEM_MODE LIMIT 1];
        Assert.isTrue(persistedBefore.Id==persistedAfter.Id,'Same private check record');
        Assert.isTrue(persistedBefore.State__c.equals(persistedAfter.State__c),'Durable acceptance state remains byte-for-byte unchanged');
        Test.stopTest();
        Assert.areEqual(1,[SELECT count() FROM Cardstack_Connection_Check__c],'No second check');
    }
    private static void assertSameReceipt(CardstackConnectionTypes.DiagnosticReceipt first, CardstackConnectionTypes.DiagnosticReceipt replay) {
        Assert.isTrue(first.reference.equals(replay.reference),'Same public receipt reference');
        Assert.isTrue(first.client.equals(replay.client),'Same exact client');
        Assert.areEqual(first.configurationRevision,replay.configurationRevision,'Same configuration revision');
        Assert.areEqual(first.checkedAt,replay.checkedAt,'Same acceptance timestamp');
        Assert.areEqual(first.expiresAt,replay.expiresAt,'Same expiry timestamp');
        Assert.areEqual(first.exactValues,replay.exactValues,'Same exact-value verdict');
        Assert.isTrue(replay.exactValues,'Accepted replay remains passing');
        Assert.areEqual(first.versions.keySet(),replay.versions.keySet(),'Same version keys');
        for(String key:first.versions.keySet()) {
            Assert.isTrue(first.versions.get(key).equals(replay.versions.get(key)),'Same exact version '+key);
        }
        assertExactFixture(first.values); assertExactFixture(replay.values);
        Assert.areEqual(first.stages.size(),replay.stages.size(),'Same evidence stages');
        for(Integer i=0;i<first.stages.size();i++) {
            CardstackConnectionTypes.CheckView expected=first.stages[i];
            CardstackConnectionTypes.CheckView actual=replay.stages[i];
            Assert.isTrue(expected.stage.equals(actual.stage),'Same exact stage');
            Assert.isTrue(expected.status.equals(actual.status),'Same exact stage status');
            Assert.isTrue(expected.source.equals(actual.source),'Same exact evidence source');
            Assert.areEqual(expected.checkedAt,actual.checkedAt,'Same stage timestamp');
            Assert.isTrue(expected.errorCode==null ? actual.errorCode==null : expected.errorCode.equals(actual.errorCode),'Same exact error code');
        }
    }
    private static void assertExactFixture(Map<String,Object> values) {
        Map<String,Object> expected=fixture();
        Assert.areEqual(expected.keySet(),values.keySet(),'Exactly the fixed seven keys');
        for(String key:new List<String>{'text','choice','rating','notes'}) {
            Assert.isTrue(values.get(key) instanceof String,'String type '+key);
            Assert.isTrue(((String)expected.get(key)).equals((String)values.get(key)),'Exact case-sensitive fixture '+key);
        }
        Assert.isTrue(values.get('amount') instanceof Integer || values.get('amount') instanceof Long ||
            values.get('amount') instanceof Decimal || values.get('amount') instanceof Double,'Numeric amount type');
        Assert.areEqual(Decimal.valueOf('0'),Decimal.valueOf(String.valueOf(values.get('amount'))),'Exact numeric zero');
        for(String key:new List<String>{'accepted','enabled'}) {
            Assert.isTrue(values.get(key) instanceof Boolean,'Boolean type '+key);
            Assert.areEqual(false,(Boolean)values.get(key),'Exact false fixture '+key);
        }
    }
    @IsTest static void alteredReplayRejected() {
        configure(); Test.startTest(); CardstackConnectionTypes.DiagnosticOpen attempt=CardstackConnectionDiagnostics.open('claude');
        CardstackConnectionDiagnostics.echo(attempt.attemptKey,attempt.challenge,fixture());
        Map<String,Object> alternate=fixture(); alternate.put('text','');
        Integer dmlBefore=Limits.getDmlStatements(); rejected(attempt,alternate);
        Assert.areEqual(dmlBefore,Limits.getDmlStatements(),'Variant switch cannot transition'); Test.stopTest();
        Assert.areEqual(fixture(),CardstackConnectionDiagnostics.mine('claude')[0].values,'Original acceptance retained');
    }
    @IsTest static void revisionChangeStales() {
        configure(); Test.startTest(); CardstackConnectionTypes.DiagnosticOpen attempt=CardstackConnectionDiagnostics.open('claude');
        CardstackConnectionDiagnostics.echo(attempt.attemptKey,attempt.challenge,fixture());
        CardstackConnectionTypes.SetupInput changed=setupInput(1); changed.publicClientId='changed'; CardstackConnectionSetup.save(changed);
        rejected(attempt,fixture());
        Assert.areEqual('Stale',CardstackConnectionDiagnostics.mine('claude')[0].stages[0].status,'Read reflects current revision'); Test.stopTest();
    }
    @IsTest static void sameRevisionDigestChangeStales() {
        configure(); Test.startTest(); CardstackConnectionTypes.DiagnosticOpen attempt=CardstackConnectionDiagnostics.open('claude');
        // Test-owned corruption fixture requires explicit system access to private setup.
        Cardstack_Connection_Setup__c setup=[SELECT Id,Configuration_Digest__c FROM Cardstack_Connection_Setup__c WITH SYSTEM_MODE LIMIT 1];
        setup.Configuration_Digest__c='0'.repeat(64); Database.update(setup,AccessLevel.SYSTEM_MODE);
        rejected(attempt,fixture()); Test.stopTest();
    }
    @IsTest static void wrongActorCannotReadOrSubmit() {
        User owner=CardstackConnectionTestFactory.namedUser(), other=CardstackConnectionTestFactory.namedUser();
        CardstackConnectionTestFactory.assign(owner,'Cardstack_User'); CardstackConnectionTestFactory.assign(other,'Cardstack_User');
        CardstackConnectionTypes.DiagnosticOpen attempt;
        System.runAs(owner) {
            configure(); CardstackConnectionAccess.userOverride=null; attempt=CardstackConnectionDiagnostics.open('claude');
            CardstackConnectionDiagnostics.echo(attempt.attemptKey,attempt.challenge,fixture());
        }
        Test.startTest(); System.runAs(other) {
            CardstackConnectionAccess.userOverride=null;
            Assert.areEqual(0,CardstackConnectionDiagnostics.mine('claude').size(),'Other actor sees no check'); rejected(attempt,fixture());
        } Test.stopTest();
    }
    @IsTest static void permissionRemovalDenied() {
        User actor=CardstackConnectionTestFactory.namedUser(); CardstackConnectionTestFactory.assign(actor,'Cardstack_User');
        CardstackConnectionTypes.DiagnosticOpen attempt;
        System.runAs(actor) {
            configure(); CardstackConnectionAccess.userOverride=null;
            attempt=CardstackConnectionDiagnostics.open('claude');
        }
        List<PermissionSetAssignment> grants=[SELECT Id FROM PermissionSetAssignment
            WHERE AssigneeId=:actor.Id AND PermissionSet.Name='Cardstack_User' AND PermissionSet.IsOwnedByProfile=false LIMIT 1];
        Assert.areEqual(1,grants.size(),'Explicit fixture grant exists'); delete grants;
        Test.startTest(); System.runAs(actor) {
            try { CardstackConnectionDiagnostics.echo(attempt.attemptKey,attempt.challenge,fixture()); Assert.fail('Revoked actor denied'); }
            catch(CardstackConnectionTypes.ConnectionException e) { Assert.areEqual('NOT_AUTHORIZED',e.getMessage(),'Current permission gate'); }
        } Test.stopTest();
    }
    @IsTest static void observedRequiresPassingCurrentReceipt() {
        configure(); Test.startTest(); CardstackConnectionTypes.DiagnosticOpen attempt=CardstackConnectionDiagnostics.open('claude');
        String reference=CardstackConnectionDiagnostics.mine('claude')[0].reference;
        try { CardstackConnectionDiagnostics.observe(reference); Assert.fail('Observation cannot manufacture pass'); }
        catch(CardstackConnectionTypes.ConnectionException e) { Assert.areEqual('DIAGNOSTIC_REJECTED',e.getMessage(),'Unpassed refusal'); }
        CardstackConnectionDiagnostics.echo(attempt.attemptKey,attempt.challenge,fixture());
        CardstackConnectionTypes.DiagnosticReceipt observed=CardstackConnectionDiagnostics.observe(reference);
        Assert.areEqual('Pass',observed.stages[2].status,'Separate observation');
        Assert.areEqual('Operator observation',observed.stages[2].source,'Not host attestation');
        Assert.areEqual('Unknown',observed.stages[1].status,'No HTML telemetry invented');
        CardstackConnectionTypes.SetupInput changed=setupInput(1); changed.publicClientId='changed'; CardstackConnectionSetup.save(changed);
        try { CardstackConnectionDiagnostics.observe(reference); Assert.fail('Stale receipt cannot be observed'); }
        catch(CardstackConnectionTypes.ConnectionException e) { Assert.areEqual('DIAGNOSTIC_REJECTED',e.getMessage(),'Stale refusal'); }
        Test.stopTest();
    }
    @IsTest static void observerStoredSeparatelyAndSummarySanitized() {
        User actor=CardstackConnectionTestFactory.namedUser(), observer=CardstackConnectionTestFactory.namedUser();
        CardstackConnectionTestFactory.assign(actor,'Cardstack_User'); CardstackConnectionTestFactory.assign(observer,'Cardstack_Admin');
        String reference;
        System.runAs(actor) {
            configure(); CardstackConnectionAccess.userOverride=null;
            CardstackConnectionTypes.DiagnosticOpen attempt=CardstackConnectionDiagnostics.open('claude');
            reference=CardstackConnectionDiagnostics.echo(attempt.attemptKey,attempt.challenge,fixture()).reference;
        }
        CardstackConnectionTypes.DiagnosticReceipt observed;
        Test.startTest(); System.runAs(observer) {
            CardstackConnectionAccess.adminOverride=null;
            observed=CardstackConnectionDiagnostics.observe(reference);
            Integer dmlBefore=Limits.getDmlStatements(); CardstackConnectionDiagnostics.observe(reference);
            Assert.areEqual(dmlBefore,Limits.getDmlStatements(),'Repeated observation does not rewrite evidence');
        } Test.stopTest();
        // Inspect private attribution in test code, without expanding observer access.
        Cardstack_Connection_Check__c row=[SELECT Actor__c,State__c FROM Cardstack_Connection_Check__c WITH SYSTEM_MODE LIMIT 1];
        Assert.areEqual(actor.Id,row.Actor__c,'Original actor retained');
        Map<String,Object> state=(Map<String,Object>)JSON.deserializeUntyped(row.State__c);
        Assert.areEqual(CardstackConnectionTypes.normalizeId(String.valueOf(observer.Id)),state.get('observerIdentity'),'Observer stored separately');
        Assert.isNull(observed.values,'Observer gets minimum summary');
        Assert.isFalse(JSON.serialize(observed).contains(String.valueOf(actor.Id)),'Actor identity excluded');
        Assert.isFalse(JSON.serialize(observed).contains(String.valueOf(observer.Id)),'Observer identity excluded');
    }
    @IsTest static void ordinaryUserCannotObserve() {
        configure(); CardstackConnectionAccess.adminOverride=false; Test.startTest();
        try { CardstackConnectionDiagnostics.observe('check_'+'0'.repeat(64)); Assert.fail('Admin required'); }
        catch(CardstackConnectionTypes.ConnectionException e) { Assert.areEqual('NOT_AUTHORIZED',e.getMessage(),'Permission before lookup'); }
        Assert.areEqual(0,Limits.getQueries(),'No state lookup for unauthorized observer'); Test.stopTest();
    }
    @IsTest static void wrongChallengeCannotTransition() {
        configure(); Test.startTest(); CardstackConnectionTypes.DiagnosticOpen attempt=CardstackConnectionDiagnostics.open('claude');
        attempt.challenge='0'.repeat(64); Integer dmlBefore=Limits.getDmlStatements(); rejected(attempt,fixture());
        Assert.areEqual(dmlBefore,Limits.getDmlStatements(),'Wrong challenge cannot write'); Test.stopTest();
    }
    @IsTest static void nullKeyRejected() {
        configure(); Test.startTest(); CardstackConnectionTypes.DiagnosticOpen attempt=CardstackConnectionDiagnostics.open('claude');
        attempt.attemptKey=null; rejected(attempt,fixture()); Test.stopTest();
    }
    @IsTest static void siteChangeStales() {
        configure(); Test.startTest(); CardstackConnectionTypes.DiagnosticOpen attempt=CardstackConnectionDiagnostics.open('claude');
        CardstackConnectionTypes.SetupInput changed=setupInput(1);
        changed.siteId=(Id)CardstackConnectionTypes.normalizeId(Schema.Site.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED).getKeyPrefix()+'0'.repeat(11)+'1');
        CardstackConnectionSetup.save(changed); rejected(attempt,fixture()); Test.stopTest();
    }
    @IsTest static void missingPermissionDeniesEveryReadAndOpen() {
        CardstackConnectionAccess.userOverride=false; Test.startTest();
        try { CardstackConnectionDiagnostics.open('claude'); Assert.fail('Open needs current permission'); }
        catch(CardstackConnectionTypes.ConnectionException e) { Assert.areEqual('NOT_AUTHORIZED',e.getMessage(),'Open gate'); }
        try { CardstackConnectionDiagnostics.mine('claude'); Assert.fail('Mine needs current permission'); }
        catch(CardstackConnectionTypes.ConnectionException e) { Assert.areEqual('NOT_AUTHORIZED',e.getMessage(),'Read gate'); }
        Assert.areEqual(0,Limits.getQueries(),'Permissions checked before data access'); Test.stopTest();
    }
    @IsTest static void namedUserHasNoPrivateCheckCrud() {
        User actor=CardstackConnectionTestFactory.namedUser(); CardstackConnectionTestFactory.assign(actor,'Cardstack_User');
        Test.startTest(); System.runAs(actor) {
            Schema.DescribeSObjectResult shape=Cardstack_Connection_Check__c.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED);
            Assert.isFalse(shape.isAccessible(),'No direct private check reads');
            Assert.isFalse(shape.isCreateable(),'No direct private check inserts');
            Assert.isFalse(shape.isUpdateable(),'No direct private check updates');
            Assert.isFalse(shape.isDeletable(),'No direct private check deletes');
        } Test.stopTest();
    }
    @IsTest static void noCrmIo() {
        configure(); Test.startTest(); CardstackConnectionTypes.DiagnosticOpen attempt=CardstackConnectionDiagnostics.open('claude');
        CardstackConnectionDiagnostics.echo(attempt.attemptKey,attempt.challenge,fixture());
        Assert.areEqual(2,Limits.getDmlRows(),'Only insert and update check'); Assert.areEqual(0,Limits.getCallouts(),'No external service'); Test.stopTest();
        Assert.areEqual(0,[SELECT count() FROM Account],'No Account mutation');
        Assert.areEqual(0,[SELECT count() FROM Contact],'No Contact mutation');
        Assert.areEqual(0,[SELECT count() FROM Opportunity],'No Opportunity mutation');
    }
}
