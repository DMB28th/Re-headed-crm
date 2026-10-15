/** Existing direct enrollment feeds the same review/grant/save/replay engine. NOT_RUN native source. */
@IsTest private with sharing class CardstackDirectRecordTest {
    @TestSetup static void permissions() {
        CardstackOpportunityEditTestData.grantCurrentActorPackageRead();
        CardstackRecordEditTestData.grantCurrentActorAccountAccess();
        CardstackRecordEditTestData.grantCurrentActorAdmin();
    }
    private static void enroll(Integer revision, Boolean enabled) {
        CardstackConnectionAccess.adminOverride = true; CardstackConnectionAccess.userOverride = true;
        CardstackMcpTransportProbe.namedOverride = true;
        CardstackConnectionContext.platformOverrideEnabled = true; CardstackConnectionContext.siteIdOverride = null;
        CardstackConnectionTypes.SetupInput input = new CardstackConnectionTypes.SetupInput();
        input.client = 'chatgpt'; input.expectedRevision = revision; input.transportKind = 'direct-org-api/v1'; input.routeVersion = 'apex-probe/v1';
        input.publicClientId = 'existing-public-client'; input.callbacks = new List<String>{'https://client.example/callback'}; input.enabledIntent = enabled;
        CardstackConnectionSetup.save(input);
    }
    private static Map<String,Object> call(String tool, Map<String,Object> arguments) {
        RestContext.request = new RestRequest(); RestContext.response = new RestResponse();
        RestContext.request.requestURI = '/services/apexrest/cardstack-mcp-probe/';
        RestContext.request.requestBody = Blob.valueOf(JSON.serialize(new Map<String,Object>{'jsonrpc'=>'2.0','id'=>1,'method'=>'tools/call','params'=>new Map<String,Object>{'name'=>tool,'arguments'=>arguments}}));
        CardstackMcpTransportProbe.post();
        Assert.areEqual(200, RestContext.response.statusCode, 'Enrolled direct product request');
        Map<String,Object> response = (Map<String,Object>)JSON.deserializeUntyped(RestContext.response.responseBody.toString());
        Assert.isFalse(response.containsKey('error'), 'Product result envelope');
        return (Map<String,Object>)response.get('result');
    }
    private static Map<String,Object> view(Map<String,Object> result) { return (Map<String,Object>)result.get('structuredContent'); }
    private static Map<String,Object> meta(Map<String,Object> result) { return (Map<String,Object>)((Map<String,Object>)result.get('_meta')).get('cardstack/recordEdit'); }
    private static Map<String,Object> transition(Map<String,Object> result, String operation) {
        return new Map<String,Object>{'operation'=>operation,'interactionKey'=>meta(result).get('interactionKey'),'expectedRevision'=>view(result).get('revision')};
    }
    private static Map<String,Object> review(Account record) {
        Map<String,Object> opened = call('cardstack_record_edit_start',new Map<String,Object>{'recordId'=>CardstackConnectionTypes.normalizeId(String.valueOf(record.Id)),'actionName'=>'configured'});
        Assert.areEqual('Editing',view(opened).get('status'),'Same generic editor starts');
        Map<String,Object> input = transition(opened,'review');
        input.put('changes',new List<Object>{new Map<String,Object>{'fieldApi'=>'NumberOfEmployees','operation'=>'set','value'=>'0'},new Map<String,Object>{'fieldApi'=>'Name','operation'=>'set','value'=>'Direct reviewed account'}});
        Map<String,Object> reviewed = call('cardstack_record_edit_transition',input);
        Assert.areEqual('Review',view(reviewed).get('status'),'Grant comes only from review'); return reviewed;
    }
    @IsTest static void directConfirmedSaveUsesSharedWriterAndReplaysOnce() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Account record = CardstackRecordEditTestData.accountFixture(); enroll(0,true);
            Map<String,Object> reviewed = review(record), input = transition(reviewed,'confirm');
            input.put('reviewRevision',view(reviewed).get('reviewRevision')); input.put('reviewGrant',meta(reviewed).get('reviewGrant'));
            Test.startTest(); Map<String,Object> completed = call('cardstack_record_edit_transition',input);
            Integer rows = Limits.getDmlRows(); Map<String,Object> replay = call('cardstack_record_edit_transition',input);
            Assert.areEqual(rows,Limits.getDmlRows(),'Consumed replay adds no writes'); Test.stopTest();
            Account saved = [SELECT Name,NumberOfEmployees FROM Account WHERE Id=:record.Id WITH USER_MODE];
            Assert.areEqual('Completed',view(completed).get('status'),'Shared confirmation completes');
            Assert.areEqual('Direct reviewed account',saved.Name,'Native independent read-back'); Assert.areEqual(0,saved.NumberOfEmployees,'Exact zero survives direct transport');
            Assert.areEqual(JSON.serialize(view(completed).get('receipt')),JSON.serialize(view(replay).get('receipt')),'Same receipt replays');
            Assert.areEqual(1,[SELECT count() FROM Cardstack_Audit_Log__c WITH SYSTEM_MODE],'Shared mandatory audit once');
            Map<String,Object> state = (Map<String,Object>)JSON.deserializeUntyped(CardstackRecordEditTestData.interaction().State__c);
            Assert.areEqual('chatgpt',state.get('client'),'Lifecycle bound to server-selected client');
        }
    }
    @IsTest static void directEnrollmentChangeInvalidatesReviewedInteraction() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Account record = CardstackRecordEditTestData.accountFixture(); enroll(0,true);
            Map<String,Object> reviewed = review(record), input = transition(reviewed,'confirm');
            input.put('reviewRevision',view(reviewed).get('reviewRevision')); input.put('reviewGrant',meta(reviewed).get('reviewGrant'));
            CardstackConnectionTypes.SetupInput edited = new CardstackConnectionTypes.SetupInput();
            edited.client='chatgpt'; edited.expectedRevision=1; edited.transportKind='direct-org-api/v1'; edited.routeVersion='apex-probe/v1';
            edited.publicClientId='changed-public-client'; edited.callbacks=new List<String>{'https://client.example/callback'}; edited.enabledIntent=true;
            CardstackConnectionSetup.save(edited);
            Test.startTest(); Map<String,Object> denied = call('cardstack_record_edit_transition',input); Test.stopTest();
            Assert.areEqual('Conflict',view(denied).get('status'),'Old reviewed setup binding conflicts');
            Assert.areEqual('Configured account',[SELECT Name FROM Account WHERE Id=:record.Id WITH USER_MODE].Name,'No CRM write');
            Assert.areEqual(0,[SELECT count() FROM Cardstack_Audit_Log__c WITH SYSTEM_MODE],'No audit or confirmation effect');
        }
    }
}
