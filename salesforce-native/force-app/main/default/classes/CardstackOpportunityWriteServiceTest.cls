/** Native behavior contract. Faults only fail required writes; fixtures roll back. */
@IsTest(SeeAllData=false)
private with sharing class CardstackOpportunityWriteServiceTest {
    @TestSetup static void grantPackageReadPermissions() {
        CardstackOpportunityEditTestData.grantCurrentActorPackageRead();
    }
    @IsTest static void allFieldsOrNone() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture();
        String stage = alternateStage(record.StageName);
        CardstackOpportunityEditTypes.Envelope reviewed = reviewed(record, new List<CardstackOpportunityEditTypes.FieldChange>{
            change('StageName', stage), change('CloseDate', '2027-01-15'), change('Amount', '12345.67')});
        Test.startTest(); Integer rowsBefore = Limits.getDmlRows();
        CardstackOpportunityEditTypes.Envelope completed = confirm(reviewed);
        Assert.areEqual('Completed', completed.view.status, 'All three reviewed fields must save atomically');
        Assert.areEqual(4, Limits.getDmlRows()-rowsBefore, 'One CRM update, audit insert, confirmation receipt and interaction completion');
        Opportunity after = current(record.Id);
        Assert.areEqual(stage, after.StageName, 'Exact reviewed Stage API value is saved');
        Assert.areEqual(Date.newInstance(2027, 1, 15), after.CloseDate, 'Exact reviewed calendar date is saved');
        Assert.areEqual(Decimal.valueOf('12345.67'), after.Amount, 'Exact reviewed decimal is saved');
        Assert.areEqual('saved', completed.view.receipt.status, 'Receipt distinguishes a committed save');
        Assert.areEqual(JSON.serialize(reviewed.view.diff), JSON.serialize(completed.view.receipt.diff), 'Receipt retains the exact reviewed diff');
        assertCommitted(reviewed, completed); assertNoRawKeys(reviewed); Test.stopTest();
        }
    }
    @IsTest static void optionalAmountClearSavesExplicitNull() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture();
        CardstackOpportunityEditTypes.Envelope reviewed = reviewed(record, new List<CardstackOpportunityEditTypes.FieldChange>{
            CardstackOpportunityEditTestData.change('Amount', 'clear', null)});
        Test.startTest(); CardstackOpportunityEditTypes.Envelope result = confirm(reviewed);
        Assert.areEqual('Completed', result.view.status, 'Explicit optional clear must save');
        Assert.isNull(current(record.Id).Amount, 'Clear persists null rather than zero or keep-current');
        Assert.isNull(result.view.receipt.diff[0].afterValue, 'Receipt preserves explicit null'); Test.stopTest();
        }
    }
    @IsTest static void alteredGrantOrReviewCannotWrite() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope review = reviewAmount(record);
        CardstackOpportunityEditTypes.TransitionRequest request = confirmRequest(review);
        request.reviewGrant = EncodingUtil.convertToHex(Crypto.generateAesKey(256));
        Test.startTest(); denied(CardstackOpportunityWriteService.confirm('claude', request), 'INVALID_REVIEW_CONTEXT');
        assertUntouched(record.Id); Assert.areEqual(0, CardstackOpportunityWriteService.crmUpdateAttempts, 'Altered grant reaches no CRM DML');
        Test.stopTest();
        }
    }
    @IsTest static void alteredReviewRevisionCannotWrite() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope review = reviewAmount(record);
        CardstackOpportunityEditTypes.TransitionRequest request = confirmRequest(review); request.reviewRevision++;
        Test.startTest(); denied(CardstackOpportunityWriteService.confirm('claude', request), 'INVALID_REVIEW_CONTEXT');
        assertUntouched(record.Id); Test.stopTest();
        }
    }
    @IsTest static void staleInteractionRevisionCannotWrite() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope review = reviewAmount(record);
        CardstackOpportunityEditTypes.TransitionRequest request = confirmRequest(review); request.expectedRevision--;
        Test.startTest(); denied(CardstackOpportunityWriteService.confirm('claude', request), 'STALE_REVISION');
        assertUntouched(record.Id); Test.stopTest();
        }
    }
    @IsTest static void redirectedInteractionCannotUseAnotherGrant() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope review = reviewAmount(record);
        Opportunity second = CardstackOpportunityEditTestData.insertOpportunity();
        CardstackOpportunityEditTypes.Envelope other = reviewAmount(second);
        CardstackOpportunityEditTypes.TransitionRequest request = confirmRequest(review); request.interactionKey = other.interactionKey;
        Test.startTest(); denied(CardstackOpportunityWriteService.confirm('claude', request), 'INVALID_REVIEW_CONTEXT');
        assertUntouched(record.Id); assertUntouched(second.Id); Test.stopTest();
        }
    }
    @IsTest static void confirmForbidsReplacementAnswers() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope review = reviewAmount(record);
        CardstackOpportunityEditTypes.TransitionRequest request = confirmRequest(review);
        request.changes = new List<CardstackOpportunityEditTypes.FieldChange>{change('Amount', '99999')};
        Test.startTest(); denied(CardstackOpportunityWriteService.confirm('claude', request), 'INVALID_REQUEST');
        assertUntouched(record.Id); Test.stopTest();
        }
    }
    @IsTest static void changedCanonicalPatchCannotWrite() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope review = reviewAmount(record);
        Cardstack_Interaction__c row = interaction(review);
        Map<String,Object> state = (Map<String,Object>)JSON.deserializeUntyped(row.State__c);
        Map<String,Object> patch = (Map<String,Object>)state.get('patch');
        ((Map<String,Object>)((List<Object>)patch.get('entries'))[0]).put('newValue', '99999');
        row.State__c = JSON.serialize(state); update as system row;
        Test.startTest(); denied(confirm(review), 'INVALID_REVIEW_CONTEXT'); assertUntouched(record.Id); Test.stopTest();
        }
    }
    @IsTest static void requiredAuditFailureRollsBack() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope review = reviewAllFields(record);
        Opportunity before = current(record.Id); String stateBefore = interaction(review).State__c;
        CardstackOpportunityWriteAudit.failAppend = true;
        Test.startTest(); denied(confirm(review), 'SAVE_UNAVAILABLE');
        Assert.areEqual(1, CardstackOpportunityWriteService.crmUpdateAttempts, 'Fault must occur after the real CRM update attempt');
        Assert.areEqual(1, CardstackOpportunityWriteAudit.appendAttempts, 'Required audit boundary was reached');
        assertUntouched(record.Id); assertPending(review); assertExactRecord(before, current(record.Id));
        Assert.areEqual(stateBefore, interaction(review).State__c, 'Mandatory audit failure rolls back every private state change'); Test.stopTest();
        }
    }
    @IsTest static void receiptFailureRollsBack() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope review = reviewAllFields(record);
        Opportunity before = current(record.Id); String stateBefore = interaction(review).State__c;
        CardstackOpportunityEditRepository.failComplete = true;
        Test.startTest(); denied(confirm(review), 'SAVE_UNAVAILABLE');
        Assert.areEqual(1, CardstackOpportunityWriteService.crmUpdateAttempts, 'Receipt failure follows the real CRM update attempt');
        Assert.areEqual(1, CardstackOpportunityWriteAudit.appendAttempts, 'Audit insertion was attempted before receipt completion');
        Assert.areEqual(1, CardstackOpportunityEditRepository.completionAttempts, 'Receipt persistence boundary was reached');
        assertUntouched(record.Id); assertPending(review); assertExactRecord(before, current(record.Id));
        Assert.areEqual(stateBefore, interaction(review).State__c, 'Receipt failure rolls back audit and all completion state'); Test.stopTest();
        }
    }
    @IsTest static void repeatConfirmReturnsOriginalReceipt() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope review = reviewAmount(record);
        Test.startTest(); CardstackOpportunityEditTypes.Envelope first = confirm(review);
        Assert.areEqual('Completed', first.view.status, 'Initial save commits');
        Integer rowsBefore = Limits.getDmlRows(); CardstackOpportunityEditTypes.Envelope repeat = confirm(review);
        Assert.areEqual('Completed', repeat.view.status, 'Duplicate original Confirm retrieves completion');
        Assert.areEqual(JSON.serialize(first.view.receipt), JSON.serialize(repeat.view.receipt), 'Replay returns immutable original receipt');
        Assert.areEqual(0, Limits.getDmlRows()-rowsBefore, 'Replay performs no CRM or private DML');
        assertCommitted(review, repeat); Test.stopTest();
        }
    }
    @IsTest static void lostResponseResumeReturnsOriginalReceipt() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope review = reviewAmount(record);
        Test.startTest(); confirm(review); // Discard returned envelope: unit simulation, not a network-loss proof.
        Cardstack_Confirmation__c stored = confirmation(review); Integer rowsBefore = Limits.getDmlRows();
        CardstackOpportunityEditTypes.Envelope resumed = resume(review);
        Assert.areEqual('Completed', resumed.view.status, 'Resume recovers a committed outcome after discarded response');
        Assert.areEqual(stored.Receipt__c, JSON.serialize(resumed.view.receipt), 'Recovery reads original durable confirmation receipt');
        Assert.areEqual(0, Limits.getDmlRows()-rowsBefore, 'Outcome recovery never writes again');
        assertCommitted(review, resumed); Test.stopTest();
        }
    }
    @IsTest static void expiredCompletedResumeDoesNotWrite() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope review = reviewAmount(record);
        CardstackOpportunityEditTypes.Envelope completed = confirm(review);
        Assert.areEqual('Completed', completed.view.status, 'Prerequisite real save commits');
        expireRows(review);
        Database.update(new Opportunity(Id=record.Id, Amount=Decimal.valueOf('15000')), AccessLevel.USER_MODE);
        Test.startTest(); Integer rowsBefore = Limits.getDmlRows(); CardstackOpportunityEditTypes.Envelope resumed = resume(review);
        Assert.areEqual('Completed', resumed.view.status, 'Completion survives original edit expiry and later record changes');
        Assert.areEqual(JSON.serialize(completed.view.receipt), JSON.serialize(resumed.view.receipt), 'Original reviewed outcome stays immutable');
        Assert.areEqual(Decimal.valueOf('15000'), current(record.Id).Amount, 'Recovery must not overwrite later CRM values');
        Assert.areEqual(0, Limits.getDmlRows()-rowsBefore, 'Expired outcome retrieval performs no writes'); Test.stopTest();
        }
    }
    @IsTest static void expiredCompletedConfirmReturnsOriginalReceipt() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope review = reviewAmount(record);
        CardstackOpportunityEditTypes.Envelope completed = confirm(review);
        Assert.areEqual('Completed', completed.view.status, 'Prerequisite real save commits'); expireRows(review);
        Test.startTest(); Integer rowsBefore = Limits.getDmlRows(); CardstackOpportunityEditTypes.Envelope repeat = confirm(review);
        Assert.areEqual('Completed', repeat.view.status, 'Consumed grant can retrieve its own outcome after expiry');
        Assert.areEqual(JSON.serialize(completed.view.receipt), JSON.serialize(repeat.view.receipt), 'Replay retains original receipt');
        Assert.areEqual(0, Limits.getDmlRows()-rowsBefore, 'Expired consumed grant creates no authority or effect'); Test.stopTest();
        }
    }
    @IsTest static void completedAlteredRevisionHidesReceipt() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope review = reviewAmount(record);
        Assert.areEqual('Completed', confirm(review).view.status, 'Prerequisite save commits');
        CardstackOpportunityEditTypes.TransitionRequest request = confirmRequest(review); request.expectedRevision += 10;
        Test.startTest(); denied(CardstackOpportunityWriteService.confirm('claude', request), 'STALE_REVISION');
        Assert.areEqual(1, [SELECT count() FROM Cardstack_Audit_Log__c WITH SYSTEM_MODE], 'Invalid replay adds no audit'); Test.stopTest();
        }
    }
    @IsTest static void completedAlteredGrantHidesReceipt() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope review = reviewAmount(record);
        Assert.areEqual('Completed', confirm(review).view.status, 'Prerequisite save commits');
        CardstackOpportunityEditTypes.TransitionRequest request = confirmRequest(review);
        request.reviewGrant = EncodingUtil.convertToHex(Crypto.generateAesKey(256));
        Test.startTest(); denied(CardstackOpportunityWriteService.confirm('claude', request), 'INVALID_REVIEW_CONTEXT');
        Assert.areEqual(1, CardstackOpportunityWriteService.crmUpdateAttempts, 'Altered replay cannot execute a second update'); Test.stopTest();
        }
    }
    @IsTest static void completedAlteredReviewRevisionHidesReceipt() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope review = reviewAmount(record);
        Assert.areEqual('Completed', confirm(review).view.status, 'Prerequisite save commits');
        CardstackOpportunityEditTypes.TransitionRequest request = confirmRequest(review); request.reviewRevision++;
        Test.startTest(); denied(CardstackOpportunityWriteService.confirm('claude', request), 'INVALID_REVIEW_CONTEXT');
        Assert.areEqual(1, CardstackOpportunityWriteService.crmUpdateAttempts, 'Altered reviewed revision never repeats update'); Test.stopTest();
        }
    }
    @IsTest static void rotatedGrantCannotWrite() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope review = reviewAmount(record);
        CardstackOpportunityEditTypes.Envelope rotated = resume(review);
        Assert.areEqual('Review', rotated.view.status, 'Resume rotates active review authority');
        Test.startTest(); denied(confirm(review), 'STALE_REVISION'); assertUntouched(record.Id);
        Assert.areEqual('Completed', confirm(rotated).view.status, 'Only the current reviewed grant can save');
        Assert.areEqual(1, CardstackOpportunityWriteService.crmUpdateAttempts, 'Old grant adds no update attempt'); Test.stopTest();
        }
    }
    @IsTest static void validationFailureRequiresNewReview() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope review = reviewAmount(record);
        Opportunity before = current(record.Id);
        CardstackOpportunityWriteService.failCrmUpdate = true;
        Test.startTest(); CardstackOpportunityEditTypes.Envelope editing = confirm(review);
        Assert.areEqual('Editing', editing.view.status, 'Known CRM DML failure returns to Editing');
        Assert.areEqual('SAVE_VALIDATION_FAILED', editing.view.errors[0].code, 'Known DML errors use bounded field feedback');
        Assert.isNull(editing.reviewGrant, 'Failed save invalidates confirmation authority');
        Assert.areEqual('12000', editing.view.fields[2].value, 'Accepted answer remains available for correction');
        assertUntouched(record.Id); assertExactRecord(before, current(record.Id));
        Assert.isNull(interactionState(review).get('confirmationId'), 'Failed grant is removed from durable state');
        Assert.isTrue(confirmation(review).Expires_At__c <= Datetime.now(), 'Known failure invalidates the original persisted grant');
        denied(confirm(review), 'STALE_REVISION'); CardstackOpportunityWriteService.failCrmUpdate = false;
        CardstackOpportunityEditTypes.Envelope fresh = reviewAmount(record, editing);
        Assert.areEqual('Completed', confirm(fresh).view.status, 'A new review and explicit Confirm can save after correction');
        Assert.areEqual(1, [SELECT count() FROM Cardstack_Audit_Log__c WITH SYSTEM_MODE], 'Only successful retry has audit'); Test.stopTest();
        }
    }
    @IsTest static void accessRemovedHidesReceipt() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope review = reviewAmount(record);
        Assert.areEqual('Completed', confirm(review).view.status, 'Prerequisite save commits');
        CardstackConnectionAccess.userOverride = false;
        Test.startTest(); denied(resume(review), 'NOT_AUTHORIZED'); denied(confirm(review), 'NOT_AUTHORIZED'); Test.stopTest();
        }
    }
    @IsTest static void wrongActorCannotConfirm() {
        User other = new User(Username='task3-'+EncodingUtil.convertToHex(Crypto.generateAesKey(128))+'@example.invalid',
            Email='task3@example.invalid', Alias='task3red', LastName='Task3 other actor', TimeZoneSidKey='America/New_York',
            LocaleSidKey='en_US', EmailEncodingKey='UTF-8', LanguageLocaleKey='en_US', ProfileId=UserInfo.getProfileId());
        insert other;
        CardstackOpportunityEditTypes.Envelope review; Opportunity record;
        System.runAs(new User(Id=UserInfo.getUserId())) { record = fixture(); review = reviewAmount(record); }
        CardstackOpportunityEditTypes.Envelope deniedResult;
        Test.startTest(); System.runAs(other) { deniedResult = confirm(review); }
        denied(deniedResult, 'INVALID_INTERACTION'); assertUntouched(record.Id); Test.stopTest();
    }
    @IsTest static void wrongClientCannotConfirm() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope review = reviewAmount(record);
        insert as system new Cardstack_Connection_Setup__c(Client__c='chatgpt', Revision__c=1, Configuration_Digest__c='fixture-setup',
            Configuration__c='{"client":"chatgpt","enabledIntent":true}');
        Test.startTest(); denied(CardstackOpportunityWriteService.confirm('chatgpt', confirmRequest(review)), 'INVALID_INTERACTION');
        assertUntouched(record.Id); Test.stopTest();
        }
    }
    @IsTest static void cancelAndConfirmSerialize() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope review = reviewAmount(record);
        CardstackOpportunityEditTypes.TransitionRequest cancel = operation(review, 'cancel');
        Test.startTest(); CardstackOpportunityEditTypes.Envelope cancelled = CardstackOpportunityEditService.transition('claude', cancel);
        Assert.areEqual('Cancelled', cancelled.view.status, 'First serial transition cancels review');
        denied(confirm(review), 'STALE_REVISION'); assertUntouched(record.Id);
        Assert.areEqual('Cancelled', interactionState(review).get('status'), 'Delayed Confirm cannot revive cancellation'); Test.stopTest();
        }
    }
    @IsTest static void confirmThenCancelPreservesCommittedOutcome() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope review = reviewAmount(record);
        Test.startTest(); CardstackOpportunityEditTypes.Envelope completed = confirm(review);
        Assert.areEqual('Completed', completed.view.status, 'First serial transition commits');
        denied(CardstackOpportunityEditService.transition('claude', operation(completed, 'cancel')), 'PROCESS_COMPLETED');
        assertCommitted(review, resume(review)); Test.stopTest();
        }
    }
    @IsTest static void pendingExpiredGrantCannotWrite() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope review = reviewAmount(record);
        Cardstack_Confirmation__c row = confirmation(review); row.Expires_At__c = Datetime.now().addSeconds(-1); update as system row;
        Test.startTest(); denied(confirm(review), 'EXPIRED'); assertUntouched(record.Id); Test.stopTest();
        }
    }
    @IsTest static void changedFreshnessCannotWrite() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope review = reviewAmount(record);
        Database.update(new Opportunity(Id=record.Id, Amount=Decimal.valueOf('15000')), AccessLevel.USER_MODE);
        Test.startTest(); Assert.areEqual('Conflict', confirm(review).view.status, 'Changed target context prevents stale save');
        Assert.areEqual(Decimal.valueOf('15000'), current(record.Id).Amount, 'Conflict preserves the newer value');
        Assert.areEqual(0, [SELECT count() FROM Cardstack_Audit_Log__c WITH SYSTEM_MODE], 'Conflict creates no save audit'); Test.stopTest();
        }
    }
    @IsTest static void changedStageContextCannotWrite() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope review = reviewAmount(record);
        CardstackOpportunityStageProvider.source = new FixtureSource(new List<String>{record.StageName});
        Test.startTest(); Assert.areEqual('Conflict', confirm(review).view.status, 'Fresh Stage context binds confirmed values');
        assertUntouched(record.Id); Test.stopTest();
        }
    }
    @IsTest static void changedPinnedCurrencyCannotWrite() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope review = reviewAmount(record);
        Cardstack_Interaction__c row = interaction(review); Map<String,Object> state = interactionState(review);
        String changed = state.get('currencyCode') == 'USD' ? 'EUR' : 'USD';
        state.put('currencyCode', changed); ((Map<String,Object>)state.get('initialRecord')).put('currencyCode', changed);
        row.State__c = JSON.serialize(state); update as system row;
        Test.startTest(); Assert.areEqual('Conflict', confirm(review).view.status, 'Current currency context must match the reviewed binding');
        assertUntouched(record.Id); Test.stopTest();
        }
    }
    @IsTest static void completedPolicyDriftHidesReceipt() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope review = reviewAmount(record);
        Assert.areEqual('Completed', confirm(review).view.status, 'Prerequisite save commits');
        Cardstack_Config__c row = [SELECT Id, Value__c FROM Cardstack_Config__c WITH SYSTEM_MODE LIMIT 1];
        row.Value__c = row.Value__c.replace('"writeEnabled":true', '"writeEnabled":false'); update as system row;
        Test.startTest(); denied(resume(review), 'EDIT_DISABLED'); denied(confirm(review), 'EDIT_DISABLED'); Test.stopTest();
        }
    }
    @IsTest static void noChangesCompletionCannotInventConfirmAuthority() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
        Opportunity record = fixture(); CardstackOpportunityEditTypes.Envelope completed = reviewed(record,
            new List<CardstackOpportunityEditTypes.FieldChange>{change('Amount', '10000')}, 'Completed');
        CardstackOpportunityEditTypes.TransitionRequest request = confirmRequest(completed);
        request.reviewGrant = EncodingUtil.convertToHex(Crypto.generateAesKey(256));
        Test.startTest(); denied(CardstackOpportunityWriteService.confirm('claude', request), 'INVALID_REVIEW_CONTEXT');
        Assert.areEqual('noChanges', resume(completed).view.receipt.status, 'No-op receipt remains resumable'); assertUntouched(record.Id); Test.stopTest();
        }
    }
    private static CardstackOpportunityEditTypes.Envelope confirm(CardstackOpportunityEditTypes.Envelope review) {
        return CardstackOpportunityWriteService.confirm('claude', confirmRequest(review));
    }
    private static CardstackOpportunityEditTypes.TransitionRequest confirmRequest(CardstackOpportunityEditTypes.Envelope review) {
        CardstackOpportunityEditTypes.TransitionRequest request = operation(review, 'confirm');
        request.reviewRevision = review.view.reviewRevision; request.reviewGrant = review.reviewGrant; return request;
    }
    private static CardstackOpportunityEditTypes.TransitionRequest operation(CardstackOpportunityEditTypes.Envelope view, String operation) {
        CardstackOpportunityEditTypes.TransitionRequest request = new CardstackOpportunityEditTypes.TransitionRequest();
        request.operation = operation; request.interactionKey = view.interactionKey;
        request.expectedRevision = operation == 'resume' ? null : view.view.revision; return request;
    }
    private static CardstackOpportunityEditTypes.Envelope resume(CardstackOpportunityEditTypes.Envelope review) {
        return CardstackOpportunityEditService.transition('claude', operation(review, 'resume'));
    }
    private static CardstackOpportunityEditTypes.Envelope reviewAmount(Opportunity record) { return reviewed(record, new List<CardstackOpportunityEditTypes.FieldChange>{change('Amount', '12000')}); }
    private static CardstackOpportunityEditTypes.Envelope reviewAllFields(Opportunity record) {
        return reviewed(record, new List<CardstackOpportunityEditTypes.FieldChange>{
            change('StageName', alternateStage(record.StageName)), change('CloseDate', '2027-01-15'), change('Amount', '12345.67')});
    }
    private static CardstackOpportunityEditTypes.Envelope reviewAmount(Opportunity record, CardstackOpportunityEditTypes.Envelope editing) {
        CardstackOpportunityEditTypes.TransitionRequest request = operation(editing, 'review');
        request.changes = new List<CardstackOpportunityEditTypes.FieldChange>{change('Amount', '12000')};
        CardstackOpportunityEditTypes.Envelope result = CardstackOpportunityEditService.transition('claude', request);
        Assert.areEqual('Review', result.view.status, 'Corrected answers require a new accepted review'); return result;
    }
    private static CardstackOpportunityEditTypes.Envelope reviewed(Opportunity record, List<CardstackOpportunityEditTypes.FieldChange> changes) {
        return reviewed(record, changes, 'Review');
    }
    private static CardstackOpportunityEditTypes.Envelope reviewed(Opportunity record, List<CardstackOpportunityEditTypes.FieldChange> changes, String status) {
        CardstackOpportunityEditTypes.Envelope opened = CardstackOpportunityEditService.start('claude', record.Id, 'edit_opportunity');
        Assert.areEqual('Editing', opened.view.status, 'Published accessible fixture starts Editing');
        CardstackOpportunityEditTypes.TransitionRequest request = operation(opened, 'review'); request.changes = changes;
        CardstackOpportunityEditTypes.Envelope result = CardstackOpportunityEditService.transition('claude', request);
        Assert.areEqual(status, result.view.status, 'Prerequisite review is accepted before Confirm'); return result;
    }
    private static CardstackOpportunityEditTypes.FieldChange change(String field, String value) { return CardstackOpportunityEditTestData.change(field, 'set', value); }
    private static void denied(CardstackOpportunityEditTypes.Envelope result, String code) {
        Assert.areEqual('Rejected', result.view.status, 'Invalid Confirm must reject');
        Assert.areEqual(code, result.view.errors[0].code, 'Specific denial prevents unrelated scaffold success');
        Assert.isNull(result.view.receipt, 'Denied request cannot disclose receipt'); Assert.isNull(result.view.recordName, 'Denied request hides historical record name');
        Assert.isTrue(result.view.diff.isEmpty() && result.view.fields.isEmpty(), 'Denied request hides reviewed values');
        Assert.isNull(result.reviewGrant, 'Denied request carries no authority');
    }
    private static void assertUntouched(Id recordId) {
        Opportunity record = current(recordId);
        Assert.areEqual(Decimal.valueOf('10000'), record.Amount, 'Rejected or rolled-back save leaves original Amount');
        Assert.areEqual(Date.newInstance(2026, 11, 30), record.CloseDate, 'Rejected or rolled-back save leaves original date');
        Assert.areEqual(0, [SELECT count() FROM Cardstack_Audit_Log__c WITH SYSTEM_MODE], 'Rejected or rolled-back save leaves no audit');
    }
    private static void assertPending(CardstackOpportunityEditTypes.Envelope review) {
        Assert.areEqual('Review', interactionState(review).get('status'), 'Infrastructure failure retains pending review rather than false completion');
        Assert.isNull(confirmation(review).Receipt__c, 'Infrastructure failure stores no receipt');
        Assert.isTrue(confirmation(review).Expires_At__c > Datetime.now(), 'Infrastructure failure preserves original unconsumed grant');
        Assert.isNull(interactionState(review).get('receipt'), 'Infrastructure failure stores no interaction receipt');
    }
    private static void assertExactRecord(Opportunity before, Opportunity after) {
        Assert.areEqual(before.StageName, after.StageName, 'Rollback preserves exact Stage');
        Assert.areEqual(before.CloseDate, after.CloseDate, 'Rollback preserves exact calendar date');
        Assert.areEqual(before.Amount, after.Amount, 'Rollback preserves exact decimal');
        Assert.areEqual(before.SystemModstamp, after.SystemModstamp, 'Rollback preserves original target freshness');
    }
    private static void assertCommitted(CardstackOpportunityEditTypes.Envelope review, CardstackOpportunityEditTypes.Envelope result) {
        Assert.areEqual(1, CardstackOpportunityWriteService.crmUpdateAttempts, 'Exactly one CRM update is attempted for successful/replayed save');
        Assert.areEqual(1, [SELECT count() FROM Cardstack_Audit_Log__c WITH SYSTEM_MODE], 'Exactly one audit is durable');
        Assert.areEqual('Completed', interactionState(review).get('status'), 'Interaction completion is durable');
        Assert.areEqual(JSON.serialize(result.view.receipt), confirmation(review).Receipt__c, 'Confirmation retains the identical receipt');
        Assert.areEqual(result.view.revision, ((Decimal)interactionState(review).get('revision')).intValue(), 'Latest completion revision is durable');
    }
    private static Cardstack_Interaction__c interaction(CardstackOpportunityEditTypes.Envelope view) {
        String keyHash = hash(view.interactionKey);
        return [SELECT Id, Expires_At__c, State__c FROM Cardstack_Interaction__c WHERE Key_Hash__c=:keyHash WITH SYSTEM_MODE LIMIT 1];
    }
    private static Map<String,Object> interactionState(CardstackOpportunityEditTypes.Envelope view) { return (Map<String,Object>)JSON.deserializeUntyped(interaction(view).State__c); }
    private static Cardstack_Confirmation__c confirmation(CardstackOpportunityEditTypes.Envelope view) {
        String grantHash = hash(view.reviewGrant);
        return [SELECT Id, Expires_At__c, Receipt__c FROM Cardstack_Confirmation__c WHERE Key_Hash__c=:grantHash WITH SYSTEM_MODE LIMIT 1];
    }
    private static void expireRows(CardstackOpportunityEditTypes.Envelope review) {
        Cardstack_Interaction__c row = interaction(review); row.Expires_At__c = Datetime.now().addSeconds(-1); update as system row;
        Cardstack_Confirmation__c grant = confirmation(review); grant.Expires_At__c = Datetime.now().addSeconds(-1); update as system grant;
    }
    private static void assertNoRawKeys(CardstackOpportunityEditTypes.Envelope review) {
        String state = interaction(review).State__c, receipt = confirmation(review).Receipt__c;
        String audit = [SELECT Details__c FROM Cardstack_Audit_Log__c WITH SYSTEM_MODE LIMIT 1].Details__c;
        for (String serialized : new List<String>{state, receipt, audit}) {
            Assert.isFalse(serialized.contains(review.interactionKey), 'Raw handle must never persist');
            Assert.isFalse(serialized.contains(review.reviewGrant), 'Raw grant must never persist');
        }
    }
    private static Opportunity current(Id recordId) { return [SELECT StageName, CloseDate, Amount, SystemModstamp FROM Opportunity WHERE Id=:recordId WITH USER_MODE LIMIT 1]; }
    private static String hash(String value) { return EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256', Blob.valueOf(value))); }
    private static String alternateStage(String current) {
        for (Schema.PicklistEntry choice : Opportunity.StageName.getDescribe().getPicklistValues()) {
            if (choice.isActive() && choice.getValue() != current) { return choice.getValue(); }
        }
        Assert.fail('Fixture requires two active native Stage values'); return null;
    }
    private static Opportunity fixture() {
        CardstackConnectionAccess.userOverride = true;
        insert as system new Cardstack_Config__c(Name='layout:Opportunity:default', Is_Active__c=true,
            Value__c='{"permissions":{"writeEnabled":true},"fields":[{"api":"StageName","editable":true},{"api":"CloseDate","editable":true},{"api":"Amount","editable":true}],"actions":[{"name":"edit_opportunity","label":"Edit Opportunity","enabled":true,"type":"record-edit","mappings":[{"fieldApi":"StageName","source":"current"},{"fieldApi":"CloseDate","source":"current"},{"fieldApi":"Amount","source":"current"}]}]}');
        insert as system new Cardstack_Connection_Setup__c(Client__c='claude', Revision__c=1, Configuration_Digest__c='fixture-setup',
            Configuration__c='{"client":"claude","enabledIntent":true,"publicClientId":"fixture-public-client","callbacks":["https://claude.ai/api/mcp/auth_callback"],"sitePrefix":"/cardstack","packageVersion":"0.1.0.8","transportVersion":"cardstack/v1","uiVersion":"mcp-apps/v1","permissionPolicyRevision":"1"}');
        Opportunity record = CardstackOpportunityEditTestData.insertOpportunity();
        CardstackOpportunityStageProvider.source = new FixtureSource(new List<String>{record.StageName, alternateStage(record.StageName)}); return record;
    }
    private with sharing class FixtureSource implements CardstackOpportunityStageProvider.OptionsSource {
        private List<String> stages;
        private FixtureSource(List<String> stages) { this.stages = stages; }
        public CardstackOpportunityEditTypes.StageContext fetch(String objectApi, String recordTypeId) {
            CardstackOpportunityEditTypes.StageContext result = new CardstackOpportunityEditTypes.StageContext(); result.recordTypeId = recordTypeId;
            for (String stage : stages) { result.choices.add(CardstackOpportunityEditTestData.choice('Fixture '+stage, stage)); } return result;
        }
    }
}
