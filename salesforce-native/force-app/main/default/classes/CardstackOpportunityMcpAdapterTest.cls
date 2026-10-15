/** Product wire behavior tests. Salesforce fixtures roll back; provider is synthetic only. */
@IsTest(SeeAllData=false)
private with sharing class CardstackOpportunityMcpAdapterTest {
    @TestSetup static void grantPackageReadPermissions() {
        CardstackOpportunityEditTestData.grantCurrentActorPackageRead();
    }
    private static final String URI = 'ui://cardstack/opportunity-edit-v1.html';
    private static final String OPEN = 'cardstack_opportunity_open';
    private static final String START = 'cardstack_opportunity_edit_start';
    private static final String TRANSITION = 'cardstack_opportunity_edit_transition';
    private static final String REFRESH = 'cardstack_opportunity_refresh';
    @IsTest static void openIsOnlyModelVisible() {
        CardstackConnectionAccess.userOverride=true;
        CardstackOpportunityMcpAdapter.resourceOverrideEnabled=true;
        CardstackOpportunityMcpAdapter.resourceOverride=Blob.valueOf('abc');
        Test.startTest(); List<Object> listed = CardstackOpportunityMcpAdapter.tools(); Test.stopTest();
        Assert.areEqual(4, listed.size(), 'Exactly four product tools, never a model save fallback');
        List<String> names = new List<String>{OPEN, START, TRANSITION, REFRESH};
        for (Integer index = 0; index < names.size(); index++) {
            Map<String,Object> tool = (Map<String,Object>)listed[index];
            Assert.areEqual(names[index], tool.get('name'), 'Exact versioned registry order/name');
            Map<String,Object> meta = (Map<String,Object>)tool.get('_meta');
            Map<String,Object> ui = (Map<String,Object>)meta.get('ui');
            Assert.areEqual(index == 0 ? new List<String>{'model','app'} : new List<String>{'app'}, ui.get('visibility'), 'Only open is model visible; every tool is app callable');
            if(index==0) {
                Assert.areEqual('ui://cardstack/opportunity-edit-v1-sha256-ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad.html', ui.get('resourceUri'), 'Only Open renders the current content-addressed native UI');
            } else {
                Assert.isFalse(ui.containsKey('resourceUri'),'Private helpers return data into the existing UI without rendering another widget');
                Assert.isFalse(meta.containsKey('openai/outputTemplate'),'Private helpers cannot advertise a compatibility render template');
            }
            Assert.areEqual(true,meta.get('openai/widgetAccessible'),'Open and private helpers remain callable from the app');
            Assert.areEqual(false, ((Map<String,Object>)tool.get('inputSchema')).get('additionalProperties'), 'Top-level schemas forbid unknown keys');
        }
    }
    @IsTest static void openCompatibilityAliasesMatch() {
        CardstackConnectionAccess.userOverride=true;
        CardstackOpportunityMcpAdapter.resourceOverrideEnabled=true;
        CardstackOpportunityMcpAdapter.resourceOverride=Blob.valueOf('abc');
        Test.startTest(); List<Object> tools = CardstackOpportunityMcpAdapter.tools(); Test.stopTest();
        Assert.areEqual(4, tools.size(), 'Registry prerequisite');
        Map<String,Object> meta = (Map<String,Object>)((Map<String,Object>)tools[0]).get('_meta');
        Assert.areEqual('ui://cardstack/opportunity-edit-v1-sha256-ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad.html', meta.get('openai/outputTemplate'), 'Compatibility template matches the content address');
        Assert.areEqual(true, meta.get('openai/widgetAccessible'), 'Host may invoke product tools');
    }
    @IsTest static void recordToolSchemasAdvertiseExactInputs() {
        Test.startTest(); Map<String,Map<String,Object>> schemas = schemas(); Test.stopTest();
        assertObjectSchema(schemas.get(OPEN), new Map<String,String>{'recordId'=>'string'}, new Set<String>{'recordId'});
        assertObjectSchema(schemas.get(REFRESH), new Map<String,String>{'recordId'=>'string'}, new Set<String>{'recordId'});
        assertObjectSchema(schemas.get(START), new Map<String,String>{'recordId'=>'string','actionName'=>'string'}, new Set<String>{'recordId','actionName'});
    }
    @IsTest static void transitionSchemaAdvertisesExactOperations() {
        Test.startTest(); Map<String,Object> schema = schemas().get(TRANSITION); Test.stopTest();
        assertObjectSchema(schema, new Map<String,String>{'interactionKey'=>'string','expectedRevision'=>'integer','operation'=>'string',
            'changes'=>'array','reviewRevision'=>'integer','reviewGrant'=>'string'}, new Set<String>{'interactionKey','operation'});
        Map<String,Object> props = (Map<String,Object>)schema.get('properties');
        Assert.areEqual(new Set<String>{'review','back','cancel','resume','confirm'}, stringSet(((Map<String,Object>)props.get('operation')).get('enum')), 'Exact lowercase operation vocabulary');
        List<Object> branches = (List<Object>)schema.get('oneOf'); Assert.areEqual(5, branches.size(), 'Five mutually exclusive per-operation schemas');
        Set<String> seen = new Set<String>();
        for (Object raw : branches) {
            Map<String,Object> branch = (Map<String,Object>)raw, branchProps = (Map<String,Object>)branch.get('properties');
            String operation = (String)((Map<String,Object>)branchProps.get('operation')).get('const');
            Assert.isFalse(seen.contains(operation), 'Operations have one exact branch each'); seen.add(operation);
            Map<String,String> types = new Map<String,String>{'interactionKey'=>'string','operation'=>'string','expectedRevision'=>'integer'};
            Set<String> required = new Set<String>{'interactionKey','operation'};
            if (operation != 'resume') { required.add('expectedRevision'); }
            if (operation == 'review') { types.put('changes','array'); required.add('changes'); }
            if (operation == 'confirm') { types.put('reviewRevision','integer'); types.put('reviewGrant','string'); required.add('reviewRevision'); required.add('reviewGrant'); }
            assertObjectSchema(branch, types, required);
        }
        Assert.areEqual(new Set<String>{'review','back','cancel','resume','confirm'}, seen, 'No unknown, duplicate or differently cased operation branches');
    }
    @IsTest static void nestedChangeSchemaKeepsStringValuesAndExplicitClear() {
        Test.startTest(); Map<String,Object> schema = schemas().get(TRANSITION); Test.stopTest();
        Map<String,Object> props = (Map<String,Object>)schema.get('properties');
        Map<String,Object> item = (Map<String,Object>)((Map<String,Object>)props.get('changes')).get('items');
        assertObjectSchema(item, new Map<String,String>{'fieldApi'=>'string','operation'=>'string','value'=>'string'}, new Set<String>{'fieldApi','operation'});
        Map<String,Object> itemProps = (Map<String,Object>)item.get('properties');
        Assert.areEqual(new Set<String>{'StageName','CloseDate','Amount'}, stringSet(((Map<String,Object>)itemProps.get('fieldApi')).get('enum')), 'Only the three approved field APIs');
        Assert.areEqual(new Set<String>{'set','clear'}, stringSet(((Map<String,Object>)itemProps.get('operation')).get('enum')), 'Only explicit set/clear vocabulary');
        List<Object> branches = (List<Object>)item.get('oneOf'); Assert.areEqual(2, branches.size(), 'Set and clear have mutually exclusive nested shapes');
        Set<String> seen = new Set<String>();
        for (Object raw : branches) {
            Map<String,Object> branch = (Map<String,Object>)raw, branchProps = (Map<String,Object>)branch.get('properties');
            String operation = (String)((Map<String,Object>)branchProps.get('operation')).get('const');
            Assert.isFalse(seen.contains(operation), 'Nested operations have one branch each'); seen.add(operation);
            Map<String,String> types = new Map<String,String>{'fieldApi'=>'string','operation'=>'string'};
            Set<String> required = new Set<String>{'fieldApi','operation'};
            if (operation == 'set') { types.put('value','string'); required.add('value'); }
            assertObjectSchema(branch,types,required);
            Assert.areEqual(new Set<String>{'StageName','CloseDate','Amount'}, stringSet(((Map<String,Object>)branchProps.get('fieldApi')).get('enum')), 'Branches retain field API restriction');
        }
        Assert.areEqual(new Set<String>{'set','clear'},seen,'Clear forbids even an explicit null value key');
    }
    @IsTest static void confirmationKeysOnlyInMeta() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); Test.startTest();
        Map<String,Object> started = start(record);
        Map<String,Object> reviewed = CardstackOpportunityMcpAdapter.call('claude', TRANSITION, reviewArgs(started, '12000'));
        Map<String,Object> view = view(reviewed);
        Assert.areEqual('Review', view.get('status'), 'Typed exact review reaches governed service');
        Assert.areEqual('opportunity-edit/v1', view.get('contractVersion'), 'Edit view contract');
        Assert.areEqual(new Set<String>{'contractVersion','status','recordId','recordName','revision','reviewRevision','expiresAt','fields','diff','errors','receipt'},
            view.keySet(), 'Only declared public View fields are serialized');
        Map<String,Object> privateData = privateData(reviewed);
        Assert.areEqual(new Set<String>{'interactionKey','reviewGrant'}, privateData.keySet(), 'Only opaque envelope keys enter private metadata');
        Assert.isTrue(privateData.get('interactionKey') instanceof String, 'Private handle is typed');
        Assert.isTrue(privateData.get('reviewGrant') instanceof String, 'Private review grant is typed');
        assertNoSecrets(reviewed, privateData); Assert.areEqual(0, [SELECT count() FROM Cardstack_Audit_Log__c WITH SYSTEM_MODE], 'Review is not a CRM save');
        Assert.areEqual(Decimal.valueOf('10000'), current(record.Id).Amount, 'Review never trial-writes CRM'); Test.stopTest();
        }
    }
    @IsTest static void startNormalizesPlatform15Identity() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); Test.startTest();
        Map<String,Object> result = CardstackOpportunityMcpAdapter.call('claude', START,
            new Map<String,Object>{'recordId'=>String.valueOf(record.Id).substring(0,15),'actionName'=>'edit_opportunity'});
        Assert.areEqual('Editing', view(result).get('status'), 'Valid platform 15-character input normalizes at boundary');
        Assert.areEqual(CardstackConnectionTypes.normalizeId(String.valueOf(record.Id)), view(result).get('recordId'), 'Output is full checksum18'); Test.stopTest();
        }
    }
    @IsTest static void openReadsFixedCardAndSafeActions() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); Test.startTest();
        Map<String,Object> result = CardstackOpportunityMcpAdapter.call('claude', OPEN, recordArgs(record));
        assertCard(result, record); Assert.areEqual(0, Limits.getDmlRows(), 'Open is authoritative read-only');
        List<Object> actions = (List<Object>)view(result).get('actions');
        Assert.areEqual(new List<Object>{new Map<String,Object>{'name'=>'edit_opportunity','label'=>'Edit Opportunity','type'=>'record-edit'}}, actions, 'Only safe published fixed action descriptors');
        Assert.isFalse(result.containsKey('_meta'), 'Read-only card mints no private authority'); Test.stopTest();
        }
    }
    @IsTest static void readOnlyPolicyStillAllowsCardWithoutEdit() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture();
        Cardstack_Config__c config = [SELECT Id, Value__c FROM Cardstack_Config__c LIMIT 1];
        config.Value__c = config.Value__c.replace('"writeEnabled":true', '"writeEnabled":false'); update as system config;
        Test.startTest(); Map<String,Object> result = CardstackOpportunityMcpAdapter.call('claude', OPEN, recordArgs(record));
        assertCard(result, record); Assert.areEqual(new List<Object>(), view(result).get('actions'), 'Read-only card never invents an editable action'); Test.stopTest();
        }
    }
    @IsTest static void unpublishedFieldsNeverEnterReadCard() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture();
        Cardstack_Config__c config = [SELECT Id, Value__c FROM Cardstack_Config__c LIMIT 1];
        config.Value__c = config.Value__c.replace(',{"api":"Amount","editable":true}', ''); update as system config;
        Test.startTest(); Map<String,Object> result = CardstackOpportunityMcpAdapter.call('claude', OPEN, recordArgs(record));
        Assert.areEqual('opportunity-card/v1', view(result).get('contractVersion'), 'Readable configured card remains available');
        List<Object> fields = (List<Object>)view(result).get('fields'); Assert.areEqual(2, fields.size(), 'Only published/native-readable intersection');
        Assert.areEqual('StageName', ((Map<String,Object>)fields[0]).get('fieldApi'), 'Fixed subset order begins with Stage');
        Assert.areEqual('CloseDate', ((Map<String,Object>)fields[1]).get('fieldApi'), 'Amount is not exported merely because native read allows it');
        Assert.isFalse(JSON.serialize(result).contains('10000'), 'Unconfigured Amount cannot enter any result channel');
        Assert.areEqual(new List<Object>(),view(result).get('actions'),'The three-field preset disappears when Amount is unpublished'); Test.stopTest();
        }
    }
    @IsTest static void unpublishedRequiredFieldRemovesEditAction() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); Cardstack_Config__c config = [SELECT Id, Value__c FROM Cardstack_Config__c LIMIT 1];
        config.Value__c = config.Value__c.replace('{"api":"StageName","editable":true},',''); update as system config;
        Test.startTest(); Map<String,Object> card = view(CardstackOpportunityMcpAdapter.call('claude',OPEN,recordArgs(record)));
        Assert.areEqual('opportunity-card/v1',card.get('contractVersion'),'Remaining configured card remains read-only available');
        List<Object> fields = (List<Object>)card.get('fields'); Assert.areEqual(2,fields.size(),'Unpublished required Stage is excluded');
        Assert.areEqual('CloseDate',((Map<String,Object>)fields[0]).get('fieldApi'),'Remaining fixed order');
        Assert.areEqual('Amount',((Map<String,Object>)fields[1]).get('fieldApi'),'Remaining published Amount');
        Assert.areEqual(new List<Object>(),card.get('actions'),'A fixed three-field action cannot survive a missing required published field'); Test.stopTest();
        }
    }
    @IsTest static void refreshRechecksPublishedFieldsAndActionPolicy() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); Map<String,Object> original = CardstackOpportunityMcpAdapter.call('claude',OPEN,recordArgs(record));
        assertCard(original,record); Assert.areEqual(1,((List<Object>)view(original).get('actions')).size(),'Initial mixed configuration exposes only the valid preset');
        Cardstack_Config__c config = [SELECT Id, Value__c FROM Cardstack_Config__c LIMIT 1];
        config.Value__c = config.Value__c.replace(',{"api":"Amount","editable":true}','').replace('"api":"CloseDate","editable":true','"api":"CloseDate","editable":false'); update as system config;
        Test.startTest(); Map<String,Object> refreshed = view(CardstackOpportunityMcpAdapter.call('claude',REFRESH,recordArgs(record)));
        Assert.areEqual('opportunity-card/v1',refreshed.get('contractVersion'),'Refresh uses current public card contract');
        List<Object> fields = (List<Object>)refreshed.get('fields'); Assert.areEqual(2,fields.size(),'Refresh filters current published field set');
        Assert.areEqual('StageName',((Map<String,Object>)fields[0]).get('fieldApi'),'Current fixed subset');
        Assert.areEqual('CloseDate',((Map<String,Object>)fields[1]).get('fieldApi'),'Noneditable field remains readable');
        Assert.areEqual(new List<Object>(),refreshed.get('actions'),'Refresh cannot reuse earlier now-invalid actions');
        Assert.isFalse(JSON.serialize(refreshed).contains('10000'),'Refresh excludes unpublished Amount'); Test.stopTest();
        }
    }
    @IsTest static void noneditableRequiredFieldRemovesEditAction() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); Cardstack_Config__c config = [SELECT Id, Value__c FROM Cardstack_Config__c LIMIT 1];
        config.Value__c = config.Value__c.replace('"api":"CloseDate","editable":true','"api":"CloseDate","editable":false'); update as system config;
        Test.startTest(); Map<String,Object> result = CardstackOpportunityMcpAdapter.call('claude',OPEN,recordArgs(record)); assertCard(result,record);
        Assert.areEqual(new List<Object>(),view(result).get('actions'),'Required read-only input cannot authorize the fixed editable preset'); Test.stopTest();
        }
    }
    @IsTest static void cardDoesNotRequireStageChoiceProvider() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityStageProvider.source = new FixtureSource(null);
        Test.startTest(); assertCard(CardstackOpportunityMcpAdapter.call('claude',OPEN,recordArgs(record)),record);
        Assert.areEqual(0,Limits.getDmlRows(),'Card never creates an edit to obtain Stage choices'); Test.stopTest();
        }
    }
    @IsTest static void cardRequiresEnabledCurrentSetup() {
        // Test-only inspection of service-owned configuration; no end-user CRUD/FLS grant.
        Opportunity record = fixture(); Cardstack_Connection_Setup__c setup = [SELECT Id, Configuration__c FROM Cardstack_Connection_Setup__c WITH SYSTEM_MODE LIMIT 1];
        setup.Configuration__c = setup.Configuration__c.replace('"enabledIntent":true','"enabledIntent":false'); update as system setup;
        Test.startTest(); Map<String,Object> result = CardstackOpportunityMcpAdapter.call('claude',OPEN,recordArgs(record));
        Assert.areEqual(true,result.get('isError'),'Disabled route cannot render product CRM values');
        Assert.isFalse(JSON.serialize(result).contains(record.Name),'Rejected card hides record name');
        Assert.isFalse(JSON.serialize(result).contains('10000'),'Rejected card hides record Amount');
        Assert.isFalse(result.containsKey('_meta'),'Denied read mints no private authority'); Test.stopTest();
    }
    @IsTest static void refreshIsSeparateAuthoritativeRead() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); Map<String,Object> started = start(record);
        record.Amount = Decimal.valueOf('15000.25'); Database.update(record, AccessLevel.USER_MODE);
        Test.startTest(); Map<String,Object> result = CardstackOpportunityMcpAdapter.call('claude', REFRESH, recordArgs(record));
        assertCard(result, record);
        List<Object> fields = (List<Object>)view(result).get('fields'); Assert.areEqual('15000.25', ((Map<String,Object>)fields[2]).get('value'), 'Refresh reads committed current CRM value');
        Assert.isFalse(result.containsKey('_meta'), 'Refresh does not create or rewrite a review grant');
        Assert.areEqual(1, [SELECT count() FROM Cardstack_Interaction__c WITH SYSTEM_MODE], 'Refresh creates no interaction');
        Assert.areEqual('Editing', view(started).get('status'), 'Earlier editing result remains a separate snapshot'); Test.stopTest();
        }
    }
    @IsTest static void confirmSavesOnlyReviewedPatchAndReturnsReceipt() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); Map<String,Object> reviewed = reviewed(record, '12000');
        Test.startTest(); Map<String,Object> completed = CardstackOpportunityMcpAdapter.call('claude', TRANSITION, confirmArgs(reviewed));
        Assert.areEqual('Completed', view(completed).get('status'), 'Valid Confirm returns durable completed state');
        Assert.areEqual('saved', ((Map<String,Object>)view(completed).get('receipt')).get('status'), 'Truthful saved receipt');
        Assert.areEqual(Decimal.valueOf('12000'), current(record.Id).Amount, 'Exact reviewed value saved');
        assertNoSecrets(completed, privateData(reviewed)); Test.stopTest();
        }
    }
    @IsTest static void repeatConfirmReturnsOriginalReceipt() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); Map<String,Object> reviewed = reviewed(record, '12000');
        Map<String,Object> args = confirmArgs(reviewed); Map<String,Object> completed = CardstackOpportunityMcpAdapter.call('claude', TRANSITION, args);
        Assert.areEqual('Completed', view(completed).get('status'), 'First response establishes actual committed receipt');
        Test.startTest(); Map<String,Object> repeated = CardstackOpportunityMcpAdapter.call('claude', TRANSITION, args);
        Assert.areEqual(JSON.serialize(view(completed).get('receipt')), JSON.serialize(view(repeated).get('receipt')), 'Duplicate returns original receipt without reserialization loss');
        Assert.areEqual(0, Limits.getDmlRows(), 'No second save/audit/private mutation on completion replay'); Test.stopTest();
        }
    }
    @IsTest static void resumeAfterSaveReturnsReceiptBeforeRefresh() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); Map<String,Object> reviewed = reviewed(record, '12000');
        Map<String,Object> completed = CardstackOpportunityMcpAdapter.call('claude', TRANSITION, confirmArgs(reviewed));
        Assert.areEqual('Completed', view(completed).get('status'), 'Saved completion prerequisite');
        Test.startTest(); Map<String,Object> resumed = CardstackOpportunityMcpAdapter.call('claude', TRANSITION,
            new Map<String,Object>{'operation'=>'resume','interactionKey'=>privateData(reviewed).get('interactionKey')});
        Assert.areEqual(JSON.serialize(view(completed).get('receipt')), JSON.serialize(view(resumed).get('receipt')), 'Response-loss recovery preserves saved receipt');
        Assert.areEqual(0, Limits.getDmlRows(), 'Recovery never repeats save'); Test.stopTest();
        }
    }
    @IsTest static void confirmRejectsPatchOrRedirect() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); Map<String,Object> reviewed = reviewed(record, '12000');
        Map<String,Object> args = confirmArgs(reviewed); args.put('changes', changes('99999'));
        Test.startTest(); Map<String,Object> rejected = CardstackOpportunityMcpAdapter.call('claude', TRANSITION, args);
        assertRejectedInputSecrets(rejected,args); invalid(rejected, 'INVALID_ARGUMENTS');
        Assert.areEqual(0, Limits.getDmlRows(), 'Replacement patch rejected before any private/CRM mutation');
        Assert.areEqual(Decimal.valueOf('10000'), current(record.Id).Amount, 'Replacement input cannot save'); Test.stopTest();
        }
    }
    @IsTest static void confirmRejectsRecordRedirect() { Map<String,Object> args = syntheticConfirm(); args.put('recordId', fullId()); rejectArgs(TRANSITION,args); }
    @IsTest static void confirmRejectsActionRedirect() { Map<String,Object> args = syntheticConfirm(); args.put('actionName', 'other'); rejectArgs(TRANSITION,args); }
    @IsTest static void confirmRejectsBooleanConfirmation() { Map<String,Object> args = syntheticConfirm(); args.put('confirmed', true); rejectArgs(TRANSITION,args); }
    @IsTest static void confirmRejectsExplicitNullChanges() { Map<String,Object> args = syntheticConfirm(); args.put('changes', null); rejectArgs(TRANSITION,args); }
    @IsTest static void confirmRejectsBooleanGrant() { Map<String,Object> args = syntheticConfirm(); args.put('reviewGrant', true); rejectArgs(TRANSITION,args); }
    @IsTest static void confirmRejectsStringRevision() { Map<String,Object> args = syntheticConfirm(); args.put('expectedRevision', '2'); rejectArgs(TRANSITION,args); }
    @IsTest static void confirmRejectsFractionalRevision() { Map<String,Object> args = syntheticConfirm(); args.put('expectedRevision', Decimal.valueOf('2.5')); rejectArgs(TRANSITION,args); }
    @IsTest static void confirmRejectsMissingReviewRevision() { Map<String,Object> args = syntheticConfirm(); args.remove('reviewRevision'); rejectArgs(TRANSITION,args); }
    @IsTest static void reviewRejectsUnknownFieldChangeKeys() { Map<String,Object> args = syntheticReview(); ((Map<String,Object>)((List<Object>)args.get('changes'))[0]).put('redirect', fullId()); rejectArgs(TRANSITION,args); }
    @IsTest static void reviewRejectsNumericAmount() { Map<String,Object> args = syntheticReview(); ((Map<String,Object>)((List<Object>)args.get('changes'))[0]).put('value', 12000); rejectArgs(TRANSITION,args); }
    @IsTest static void clearRejectsExplicitNullValueKey() { Map<String,Object> args = syntheticReview(); args.put('changes', new List<Object>{new Map<String,Object>{'fieldApi'=>'Amount','operation'=>'clear','value'=>null}}); rejectArgs(TRANSITION,args); }
    @IsTest static void resumeRejectsChanges() { rejectArgs(TRANSITION,new Map<String,Object>{'operation'=>'resume','interactionKey'=>'a'.repeat(64),'changes'=>new List<Object>()}); }
    @IsTest static void resumeRejectsExplicitNullRevision() { rejectArgs(TRANSITION,new Map<String,Object>{'operation'=>'resume','interactionKey'=>'a'.repeat(64),'expectedRevision'=>null}); }
    @IsTest static void backRejectsGrant() { rejectArgs(TRANSITION,new Map<String,Object>{'operation'=>'back','interactionKey'=>'a'.repeat(64),'expectedRevision'=>2,'reviewGrant'=>'b'.repeat(64)}); }
    @IsTest static void cancelRejectsMissingRevision() { rejectArgs(TRANSITION,new Map<String,Object>{'operation'=>'cancel','interactionKey'=>'a'.repeat(64)}); }
    @IsTest static void operationIsExactCaseSensitive() { Map<String,Object> args = syntheticConfirm(); args.put('operation','Confirm'); rejectArgs(TRANSITION,args); }
    @IsTest static void openRejectsUnknownKey() { rejectArgs(OPEN,new Map<String,Object>{'recordId'=>fullId(),'confirmed'=>true}); }
    @IsTest static void refreshRejectsInteractionHandle() { rejectArgs(REFRESH,new Map<String,Object>{'recordId'=>fullId(),'interactionKey'=>'a'.repeat(64)}); }
    @IsTest static void startRejectsBooleanAction() { rejectArgs(START,new Map<String,Object>{'recordId'=>fullId(),'actionName'=>true}); }
    @IsTest static void suppliedBadChecksumRejected() { rejectArgs(OPEN,new Map<String,Object>{'recordId'=>fullId().substring(0,15)+'BAD'}); }
    @IsTest static void reviewRejectsDuplicateFields() { Map<String,Object> args=syntheticReview(); args.put('changes',new List<Object>{new Map<String,Object>{'fieldApi'=>'Amount','operation'=>'set','value'=>'1'},new Map<String,Object>{'fieldApi'=>'Amount','operation'=>'clear'}}); rejectArgs(TRANSITION,args); }
    @IsTest static void reviewRejectsUnknownFields() { Map<String,Object> args=syntheticReview(); ((Map<String,Object>)((List<Object>)args.get('changes'))[0]).put('fieldApi','NextStep'); rejectArgs(TRANSITION,args); }
    @IsTest static void setRequiresPresentStringValue() { Map<String,Object> args=syntheticReview(); ((Map<String,Object>)((List<Object>)args.get('changes'))[0]).remove('value'); rejectArgs(TRANSITION,args); }
    @IsTest static void unknownToolRejected() { rejectArgs('cardstack_opportunity_confirm',new Map<String,Object>()); }
    @IsTest static void nullArgumentsRejected() { rejectArgs(OPEN,null); }
    @IsTest static void decodedUtf8OverLimitRejected() {
        CardstackConnectionAccess.userOverride = true; Map<String,Object> args = sizedReview(16385);
        Test.startTest(); Map<String,Object> rejected = CardstackOpportunityMcpAdapter.call('claude', TRANSITION,args);
        assertRejectedInputSecrets(rejected,args); invalid(rejected, 'REQUEST_TOO_LARGE');
        Assert.areEqual(0, Limits.getQueries(), 'Oversize rejected before private lookup'); Assert.areEqual(0, Limits.getDmlRows(), 'Oversize has no effect'); Test.stopTest();
    }
    @IsTest static void decodedUtf8ExactLimitReachesDomain() {
        CardstackConnectionAccess.userOverride = true; seedSetup(); Map<String,Object> args = sizedReview(16384);
        Test.startTest(); Map<String,Object> rejected = CardstackOpportunityMcpAdapter.call('claude', TRANSITION,args);
        assertRejectedInputSecrets(rejected,args); invalid(rejected, 'INVALID_INTERACTION');
        Test.stopTest();
    }
    @IsTest static void resourceMimeAndCspMatch() {
        CardstackConnectionAccess.userOverride = true;
        CardstackOpportunityMcpAdapter.resourceOverrideEnabled = true;
        CardstackOpportunityMcpAdapter.resourceOverride = Blob.valueOf('<!doctype html><p>Synthetic product resource</p>');
        Test.startTest(); Map<String,Object> result = CardstackOpportunityMcpAdapter.readResource(URI); Test.stopTest();
        Assert.isNotNull(result, 'Existing injected resource is served without a placeholder');
        List<Object> contents = (List<Object>)result.get('contents'); Assert.areEqual(1, contents.size(), 'Exactly one registered resource');
        Map<String,Object> content = (Map<String,Object>)contents[0];
        Assert.areEqual(URI, content.get('uri'), 'Exact URI'); Assert.areEqual('text/html;profile=mcp-app',content.get('mimeType'),'Exact App MIME');
        Assert.areEqual('<!doctype html><p>Synthetic product resource</p>',content.get('text'),'Exact bytes converted to UTF-8');
        Map<String,Object> meta = (Map<String,Object>)content.get('_meta');
        Assert.areEqual(new Map<String,Object>{'connectDomains'=>new List<Object>(),'resourceDomains'=>new List<Object>(),'frameDomains'=>new List<Object>()},
            ((Map<String,Object>)meta.get('ui')).get('csp'),'No external domains');
        Assert.areEqual(new Map<String,Object>{'connect_domains'=>new List<Object>(),'resource_domains'=>new List<Object>()},meta.get('openai/widgetCSP'),'Compatible empty CSP alias');
    }
    @IsTest static void missingResourceIsTruthfullyUnavailable() {
        CardstackConnectionAccess.userOverride = true; CardstackOpportunityMcpAdapter.resourceOverrideEnabled = true;
        Test.startTest(); Assert.isNull(CardstackOpportunityMcpAdapter.readResource(URI),'Absent UI yields no success HTML'); Test.stopTest();
    }
    @IsTest static void unregisteredResourceNeverServed() {
        CardstackConnectionAccess.userOverride = true; CardstackOpportunityMcpAdapter.resourceOverrideEnabled = true;
        CardstackOpportunityMcpAdapter.resourceOverride = Blob.valueOf('<p>Synthetic resource</p>');
        Test.startTest(); Assert.isNull(CardstackOpportunityMcpAdapter.readResource(URI+'?redirect=x'),'Exact URI only'); Test.stopTest();
    }
    @IsTest static void emptyResourceIsUnavailable() {
        CardstackConnectionAccess.userOverride=true; CardstackOpportunityMcpAdapter.resourceOverrideEnabled=true; CardstackOpportunityMcpAdapter.resourceOverride=Blob.valueOf('');
        Test.startTest(); Assert.isNull(CardstackOpportunityMcpAdapter.readResource(URI),'Empty bytes never become successful UI'); Test.stopTest();
    }
    @IsTest static void nonUtf8ResourceIsUnavailable() {
        CardstackConnectionAccess.userOverride=true; CardstackOpportunityMcpAdapter.resourceOverrideEnabled=true; CardstackOpportunityMcpAdapter.resourceOverride=EncodingUtil.convertFromHex('ff');
        Test.startTest(); Assert.isNull(CardstackOpportunityMcpAdapter.readResource(URI),'Invalid UTF-8 never becomes successful UI'); Test.stopTest();
    }
    @IsTest static void guestDeniedBeforeCrmDispatch() {
        CardstackConnectionAccess.userOverride = false; Test.startTest();
        try { CardstackOpportunityMcpAdapter.call('claude',OPEN,new Map<String,Object>{'recordId'=>fullId()}); Assert.fail('Private adapter requires named-user permission'); }
        catch (CardstackConnectionTypes.ConnectionException error) { Assert.areEqual('NOT_AUTHORIZED',error.getMessage(),'Existing gate remains authoritative'); }
        Assert.areEqual(0,Limits.getQueries(),'No CRM/state read before permission'); Assert.areEqual(0,Limits.getDmlRows(),'No mutation before permission'); Test.stopTest();
    }
    private static void rejectArgs(String name, Map<String,Object> args) {
        CardstackConnectionAccess.userOverride = true; Test.startTest(); Map<String,Object> result = CardstackOpportunityMcpAdapter.call('claude',name,args);
        assertRejectedInputSecrets(result,args); invalid(result,'INVALID_ARGUMENTS');
        Assert.areEqual(0,Limits.getQueries(),'Malformed args rejected before CRM/state reads'); Assert.areEqual(0,Limits.getDmlRows(),'Malformed args have no effect'); Test.stopTest();
    }
    private static void invalid(Map<String,Object> result, String code) {
        Assert.areEqual(true,result.get('isError'),'Rejected calls signal tool error');
        Assert.areEqual('Rejected',view(result).get('status'),'Rejected checked public view');
        List<Object> errors = (List<Object>)view(result).get('errors'); Assert.areEqual(1,errors.size(),'One bounded error');
        Assert.areEqual(code,((Map<String,Object>)errors[0]).get('code'),'Denial identifies exact boundary rather than unrelated unavailable stub');
        Assert.isFalse(result.containsKey('_meta'),'Malformed calls disclose no private envelope');
    }
    private static void assertRejectedInputSecrets(Map<String,Object> result, Map<String,Object> args) {
        String publicJson = JSON.serialize(new List<Object>{result.get('content'),result.get('structuredContent')});
        for (String key : new List<String>{'interactionKey','reviewGrant'}) {
            Assert.isFalse(publicJson.contains(key),'Rejected public channels/messages exclude private input key names');
            if (args != null && args.get(key) instanceof String) {
                Assert.isFalse(publicJson.contains((String)args.get(key)),'Rejected public channels/messages exclude raw submitted private sentinel');
            }
        }
    }
    private static Map<String,Map<String,Object>> schemas() {
        List<Object> tools = CardstackOpportunityMcpAdapter.tools(); Assert.areEqual(4,tools.size(),'Schema assertions require the complete product registry');
        Map<String,Map<String,Object>> result = new Map<String,Map<String,Object>>();
        for (Object raw : tools) {
            Map<String,Object> tool = (Map<String,Object>)JSON.deserializeUntyped(JSON.serialize(raw));
            result.put((String)tool.get('name'),(Map<String,Object>)tool.get('inputSchema'));
        }
        return result;
    }
    private static void assertObjectSchema(Map<String,Object> schema, Map<String,String> types, Set<String> required) {
        Assert.isNotNull(schema,'Registered schema is present'); Assert.areEqual('object',schema.get('type'),'Object wire shape');
        Assert.areEqual(false,schema.get('additionalProperties'),'Unknown nested/top-level keys forbidden');
        Map<String,Object> props = (Map<String,Object>)schema.get('properties'); Assert.areEqual(types.keySet(),props.keySet(),'Exact allowed property set');
        Assert.areEqual(required,stringSet(schema.get('required')),'Exact required key set');
        for (String key : types.keySet()) { Assert.areEqual(types.get(key),((Map<String,Object>)props.get(key)).get('type'),'Exact input type for '+key); }
    }
    private static Set<String> stringSet(Object raw) {
        Assert.isTrue(raw instanceof List<Object>,'Schema enum/required is a typed array'); Set<String> result = new Set<String>();
        for (Object item : (List<Object>)raw) { Assert.isTrue(item instanceof String,'Schema array entries are strings'); Assert.isFalse(result.contains((String)item),'No duplicated schema entries'); result.add((String)item); }
        return result;
    }
    private static void assertCard(Map<String,Object> result, Opportunity record) {
        Map<String,Object> card = view(result);
        Assert.areEqual(new Set<String>{'contractVersion','recordId','recordName','fields','actions'},card.keySet(),'Checked public card keys only');
        Assert.areEqual('opportunity-card/v1',card.get('contractVersion'),'Read-only card uses separate contract');
        Assert.areEqual(CardstackConnectionTypes.normalizeId(String.valueOf(record.Id)),card.get('recordId'),'Full checksum18 target');
        Assert.areEqual(record.Name,card.get('recordName'),'Authorized current name');
        List<Object> fields = (List<Object>)card.get('fields'); Assert.areEqual(3,fields.size(),'Exactly fixed three published fields');
        List<String> expected = new List<String>{'StageName','CloseDate','Amount'};
        for (Integer index = 0; index < expected.size(); index++) {
            Map<String,Object> field = (Map<String,Object>)fields[index];
            Assert.areEqual(new Set<String>{'fieldApi','label','value','dataType','currencyCode'},field.keySet(),'No arbitrary native metadata');
            Assert.areEqual(expected[index],field.get('fieldApi'),'Fixed field order');
            Assert.isTrue(field.get('value') == null || field.get('value') instanceof String,'Date/decimal remain exact strings');
        }
        Assert.areEqual('2026-11-30',((Map<String,Object>)fields[1]).get('value'),'Calendar date preserved without timezone');
    }
    private static Map<String,Object> start(Opportunity record) {
        Map<String,Object> result = CardstackOpportunityMcpAdapter.call('claude',START,new Map<String,Object>{'recordId'=>String.valueOf(record.Id),'actionName'=>'edit_opportunity'});
        Assert.areEqual('Editing',view(result).get('status'),'Start reaches published authorized process'); Assert.isFalse(result.containsKey('isError'),'Accepted start is not an error'); return result;
    }
    private static Map<String,Object> reviewed(Opportunity record, String amount) {
        Map<String,Object> result = CardstackOpportunityMcpAdapter.call('claude',TRANSITION,reviewArgs(start(record),amount));
        Assert.areEqual('Review',view(result).get('status'),'Changed review prerequisite'); return result;
    }
    private static Map<String,Object> reviewArgs(Map<String,Object> result, String amount) {
        return new Map<String,Object>{'interactionKey'=>privateData(result).get('interactionKey'),'expectedRevision'=>view(result).get('revision'),'operation'=>'review','changes'=>changes(amount)};
    }
    private static Map<String,Object> confirmArgs(Map<String,Object> result) {
        Map<String,Object> data = privateData(result);
        return new Map<String,Object>{'interactionKey'=>data.get('interactionKey'),'expectedRevision'=>view(result).get('revision'),'operation'=>'confirm','reviewRevision'=>view(result).get('reviewRevision'),'reviewGrant'=>data.get('reviewGrant')};
    }
    private static Map<String,Object> syntheticConfirm() {
        return new Map<String,Object>{'interactionKey'=>'a'.repeat(64),'expectedRevision'=>2,'operation'=>'confirm','reviewRevision'=>1,'reviewGrant'=>'b'.repeat(64)};
    }
    private static Map<String,Object> syntheticReview() {
        return new Map<String,Object>{'interactionKey'=>'a'.repeat(64),'expectedRevision'=>1,'operation'=>'review','changes'=>changes('12000')};
    }
    private static List<Object> changes(String amount) { return new List<Object>{new Map<String,Object>{'fieldApi'=>'Amount','operation'=>'set','value'=>amount}}; }
    private static Map<String,Object> sizedReview(Integer target) {
        Map<String,Object> args = syntheticReview();
        Map<String,Object> answer = (Map<String,Object>)((List<Object>)args.get('changes'))[0]; answer.put('value','');
        Integer remaining = target - Blob.valueOf(JSON.serialize(args)).size();
        answer.put('value','é'.repeat(remaining/2)+(Math.mod(remaining,2)==0?'':'x'));
        Assert.areEqual(target,Blob.valueOf(JSON.serialize(args)).size(),'Fixture measures decoded JSON argument UTF-8 bytes, not character count'); return args;
    }
    private static Map<String,Object> view(Map<String,Object> result) { return (Map<String,Object>)JSON.deserializeUntyped(JSON.serialize(result.get('structuredContent'))); }
    private static Map<String,Object> privateData(Map<String,Object> result) {
        Assert.isTrue(result.get('_meta') instanceof Map<String,Object>,'Only private metadata supplies handle/grant');
        Map<String,Object> meta = (Map<String,Object>)result.get('_meta');
        Assert.areEqual(new Set<String>{'cardstack/opportunityEdit'},meta.keySet(),'No private aliases outside pinned namespace');
        return (Map<String,Object>)meta.get('cardstack/opportunityEdit');
    }
    private static void assertNoSecrets(Map<String,Object> result, Map<String,Object> secrets) {
        String publicJson = JSON.serialize(new List<Object>{result.get('content'),result.get('structuredContent')});
        for (String key : new List<String>{'interactionKey','reviewGrant'}) {
            Assert.isFalse(publicJson.contains(key),'Private key names do not enter public channels');
            if (secrets.get(key) != null) { Assert.isFalse(publicJson.contains((String)secrets.get(key)),'Raw private value never enters model channels'); }
        }
        List<Object> content = (List<Object>)result.get('content'); Assert.areEqual(1,content.size(),'One bounded text fallback');
        Assert.areEqual('text',((Map<String,Object>)content[0]).get('type'),'Text fallback type');
        Assert.isTrue(((Map<String,Object>)content[0]).get('text') instanceof String,'Fallback typed text');
    }
    private static Map<String,Object> recordArgs(Opportunity record) { return new Map<String,Object>{'recordId'=>String.valueOf(record.Id)}; }
    private static String fullId() { return CardstackConnectionTypes.normalizeId(Opportunity.SObjectType.getDescribe().getKeyPrefix()+'0'.repeat(12)); }
    private static Opportunity current(Id recordId) { return [SELECT Amount FROM Opportunity WHERE Id=:recordId WITH USER_MODE LIMIT 1]; }
    private static Opportunity fixture() {
        CardstackConnectionAccess.userOverride = true;
        insert as system new Cardstack_Config__c(Name='layout:Opportunity:default',Is_Active__c=true,
            Value__c='{"permissions":{"writeEnabled":true},"fields":[{"api":"StageName","editable":true},{"api":"CloseDate","editable":true},{"api":"Amount","editable":true}],"actions":['+
                '{"name":"edit_opportunity","label":"Edit Opportunity","enabled":true,"type":"record-edit","mappings":[{"fieldApi":"StageName","source":"current"},{"fieldApi":"CloseDate","source":"current"},{"fieldApi":"Amount","source":"current"}]},'+
                '{"name":"enabled_flow","label":"Enabled Flow fixture","enabled":true,"type":"flow","flowApiName":"EnabledFlowFixture"},'+
                '{"name":"invalid_fixed","label":"Invalid fixed preset fixture","enabled":true,"type":"record-edit","mappings":[{"fieldApi":"Amount","source":"constant","value":"99999"}]},'+
                '{"name":"disabled_fixed","label":"Disabled fixed preset fixture","enabled":false,"type":"record-edit","mappings":[{"fieldApi":"StageName","source":"current"},{"fieldApi":"CloseDate","source":"current"},{"fieldApi":"Amount","source":"current"}]}]}');
        seedSetup();
        Opportunity record = CardstackOpportunityEditTestData.insertOpportunity(); CardstackOpportunityStageProvider.source = new FixtureSource(record.StageName); return record;
    }
    private static void seedSetup() {
        insert as system new Cardstack_Connection_Setup__c(Client__c='claude',Revision__c=1,Configuration_Digest__c='fixture-setup',
            Configuration__c='{"client":"claude","enabledIntent":true,"publicClientId":"fixture-public-client","callbacks":["https://claude.ai/api/mcp/auth_callback"],"sitePrefix":"/cardstack","packageVersion":"0.1.0.8","transportVersion":"cardstack/v1","uiVersion":"mcp-apps/v1","permissionPolicyRevision":"1"}');
    }
    private with sharing class FixtureSource implements CardstackOpportunityStageProvider.OptionsSource {
        private String stage; private FixtureSource(String value) { stage = value; }
        public CardstackOpportunityEditTypes.StageContext fetch(String objectApi, String recordTypeId) {
            if (objectApi != 'Opportunity') { return null; }
            CardstackOpportunityEditTypes.StageContext result = new CardstackOpportunityEditTypes.StageContext(); result.recordTypeId = recordTypeId;
            result.choices = new List<CardstackOpportunityEditTypes.Choice>{CardstackOpportunityEditTestData.choice('Current Stage fixture',stage)}; return result;
        }
    }
}
