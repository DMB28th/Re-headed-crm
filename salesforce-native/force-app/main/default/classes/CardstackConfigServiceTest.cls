/**
 * Tests for CardstackConfigService: get/publish/rollback staging workflow.
 */
@IsTest
private class CardstackConfigServiceTest {
    // Package validation users need the same explicit permissions as installed admins.
    @TestSetup
    static void grantPackagePermissions() {
        CardstackRecordEditTestData.grantCurrentActorContactAccess();
        PermissionSet admin = [SELECT Id FROM PermissionSet WHERE Name = 'Cardstack_Admin' LIMIT 1];
        if ([SELECT count() FROM PermissionSetAssignment WHERE AssigneeId = :UserInfo.getUserId() AND PermissionSetId = :admin.Id] == 0) {
            insert new PermissionSetAssignment(AssigneeId = UserInfo.getUserId(), PermissionSetId = admin.Id);
        }
    }


    @IsTest
    static void getConfigReturnsNullWhenMissing() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
        Test.startTest();
        String value = CardstackConfigService.getConfig('layout:Account:default');
        Test.stopTest();
        System.assertEquals(null, value, 'Missing config should return null.');
            }
    }

    @IsTest
    static void saveDraftThenPublishAppliesValue() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
        Test.startTest();
        Id draftId = CardstackConfigService.saveDraft(
            'layout:Account:default', '{"name":"default"}'
        );
        System.assertNotEquals(null, draftId, 'Draft should be created.');

        // Not live until published.
        System.assertEquals(
            null,
            CardstackConfigService.getConfig('layout:Account:default'),
            'Draft must not be visible before publish.'
        );

        CardstackConfigService.publishDraft(draftId);
        Test.stopTest();

        System.assertEquals(
            '{"name":"default"}',
            CardstackConfigService.getConfig('layout:Account:default'),
            'Published value should be live.'
        );
        Cardstack_Config_Draft__c draft = [
            SELECT Status__c FROM Cardstack_Config_Draft__c WHERE Id = :draftId
        ];
        System.assertEquals('Published', draft.Status__c);
            }
    }

    @IsTest
    static void rollbackLeavesLiveValueUntouched() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
        Id first = CardstackConfigService.saveDraft('exposures:Contact', '{"version":1,"allowAdHoc":false,"views":[],"customLists":[]}');
        CardstackConfigService.publishDraft(first);

        Test.startTest();
        Id second = CardstackConfigService.saveDraft('exposures:Contact', '{"version":1,"allowAdHoc":true,"views":[],"customLists":[]}');
        CardstackConfigService.rollbackDraft(second);
        Test.stopTest();

        System.assertEquals(
            '{"version":1,"allowAdHoc":false,"views":[],"customLists":[]}',
            CardstackConfigService.getConfig('exposures:Contact'),
            'Rollback must not change the live value.'
        );
        Cardstack_Config_Draft__c draft = [
            SELECT Status__c FROM Cardstack_Config_Draft__c WHERE Id = :second
        ];
        System.assertEquals('Rolled Back', draft.Status__c);
            }
    }

    @IsTest
    static void publishNonDraftThrows() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
        Id draftId = CardstackConfigService.saveDraft('flows', '[]');
        CardstackConfigService.publishDraft(draftId);

        Test.startTest();
        Boolean threw = false;
        try {
            CardstackConfigService.publishDraft(draftId);
        } catch (CardstackConfigService.ConfigException e) {
            threw = true;
        }
        Test.stopTest();
        System.assert(threw, 'Publishing an already-published draft should throw.');
            }
    }

    @IsTest
    static void stagingInfoReportsDraftAndLive() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
        Cardstack_Config_Draft__c retained = retainedHomeDraft();
        Id draftId = retained.Id;
        Test.startTest();
        Map<String, Object> info = CardstackConfigService.getStagingInfo('homecard');
        Test.stopTest();
        System.assertEquals('homecard', info.get('key'));
        System.assertEquals('{"title":"Retained live"}', info.get('liveValue'));
        System.assertNotEquals(null, info.get('draft'), 'Open draft should be reported.');
            }
    }
    private static String contactCandidate() {
        return '{"permissions":{"writeEnabled":true},"fields":[{"api":"LastName","editable":true,"required":true},{"api":"Description","editable":true},{"api":"HasOptedOutOfEmail","editable":true}],"actions":[{"name":"edit_contact","label":"Edit Contact","description":"Current Contact values","type":"record-edit","enabled":true,"mappings":[{"fieldApi":"LastName","source":"current"},{"fieldApi":"Description","source":"current"},{"fieldApi":"HasOptedOutOfEmail","source":"current"}]}]}';
    }

    @IsTest
    static void contactDraftRemainsInactiveUntilPublication() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            String candidate = contactCandidate();
            Test.startTest();
            Id draftId = CardstackConfigService.saveDraft('layout:Contact:default', candidate);
            Assert.isNull(CardstackConfigService.getConfig('layout:Contact:default'), 'A Contact draft cannot authorize runtime editing.');
            CardstackConfigService.publishDraft(draftId);
            Test.stopTest();
            Assert.areEqual(candidate, CardstackConfigService.getConfig('layout:Contact:default'), 'Only publication activates the validated Contact policy.');
        }
    }

    @IsTest
    static void invalidContactCandidateCannotCreateConfiguration() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Test.startTest();
            try {
                CardstackConfigService.saveDraft('layout:Contact:default', contactCandidate().replace('"source":"current"', '"source":"constant"'));
                Assert.fail('Contact candidates permit only current-value mappings.');
            } catch (CardstackOpportunityActionPolicy.PolicyException expected) {
                Assert.areEqual('INVALID_PRESET', expected.getMessage(), 'Candidate shape is rejected before insertion.');
            }
            Test.stopTest();
            Assert.areEqual(0, [SELECT count() FROM Cardstack_Config__c WHERE Name = 'layout:Contact:default'], 'Invalid staging must not create even inactive configuration.');
        }
    }

    @IsTest
    static void contactPublicationRechecksPersistedCandidate() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Id draftId = CardstackConfigService.saveDraft('layout:Contact:default', contactCandidate());
            update new Cardstack_Config_Draft__c(Id = draftId, Draft_Value__c = contactCandidate().replace('"fieldApi":"Description"', '"fieldApi":"LastName"'));
            Test.startTest();
            try {
                CardstackConfigService.publishDraft(draftId);
                Assert.fail('Persisted duplicate targets cannot be published.');
            } catch (CardstackOpportunityActionPolicy.PolicyException expected) {
                Assert.areEqual('INVALID_PRESET', expected.getMessage(), 'Publication repeats candidate validation.');
            }
            Test.stopTest();
            Assert.isNull(CardstackConfigService.getConfig('layout:Contact:default'), 'Rejected publication must not activate configuration.');
            Assert.areEqual('Draft', [SELECT Status__c FROM Cardstack_Config_Draft__c WHERE Id = :draftId].Status__c, 'Rejected publication must leave draft status intact.');
        }
    }

    private static Cardstack_Config_Draft__c retainedHomeDraft() {
        Cardstack_Config__c config = new Cardstack_Config__c(Name = 'homecard', Value__c = '{"title":"Retained live"}', Is_Active__c = true);
        insert config;
        Cardstack_Config_Draft__c published = new Cardstack_Config_Draft__c(Config__c = config.Id, Draft_Value__c = '{"title":"Retained history"}', Status__c = 'Published');
        insert published;
        Cardstack_Config_Draft__c draft = new Cardstack_Config_Draft__c(Config__c = config.Id, Draft_Value__c = '{"title":"Retained draft"}', Status__c = 'Draft');
        insert draft;
        return draft;
    }

    @IsTest
    static void retiredDraftCannotPublish() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Cardstack_Config_Draft__c draft = retainedHomeDraft();
            Integer audits = [SELECT count() FROM Cardstack_Audit_Log__c];
            Test.startTest();
            try {
                CardstackConfigService.publishDraft(draft.Id);
                Assert.fail('Retired Home publication must fail.');
            } catch (CardstackConfigService.ConfigException expected) {
                Assert.areEqual('RETIRED_CONFIGURATION', expected.getMessage(), 'Retirement is explicit.');
            }
            Test.stopTest();
            Assert.areEqual('{"title":"Retained live"}', CardstackConfigService.getConfig('homecard'), 'Live value is unchanged.');
            Cardstack_Config_Draft__c stored = [SELECT Id, Config__c, Draft_Value__c, Status__c FROM Cardstack_Config_Draft__c WHERE Id = :draft.Id];
            Assert.areEqual('Draft', stored.Status__c, 'Draft status is unchanged.');
            Assert.areEqual(draft.Draft_Value__c, stored.Draft_Value__c, 'Saved candidate is unchanged.');
            Assert.areEqual(18, CardstackConnectionTypes.normalizeId(String.valueOf(stored.Id)).length(), 'Draft identity is checksum18.');
            Assert.areEqual(18, CardstackConnectionTypes.normalizeId(String.valueOf(stored.Config__c)).length(), 'Config identity is checksum18.');
            Assert.areEqual(audits, [SELECT count() FROM Cardstack_Audit_Log__c], 'Rejected publication creates no audit.');
        }
    }

    @IsTest
    static void retiredDraftCanBeDiscardedWithoutDeletingHistory() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Cardstack_Config_Draft__c draft = retainedHomeDraft();
            Test.startTest();
            CardstackConfigService.rollbackDraft(draft.Id);
            Test.stopTest();
            Assert.areEqual('{"title":"Retained live"}', CardstackConfigService.getConfig('homecard'), 'Discard leaves live value intact.');
            Assert.areEqual('Rolled Back', [SELECT Status__c FROM Cardstack_Config_Draft__c WHERE Id = :draft.Id].Status__c, 'Discard retains its draft record.');
            Assert.areEqual(2, CardstackConfigService.listDrafts(null).size(), 'Published and discarded history remain inspectable.');
            Assert.areEqual(1, CardstackConfigService.listConfigs().size(), 'Retired configuration remains inspectable.');
        }
    }

    @IsTest
    static void retiredSaveCannotCreateOrAuditConfiguration() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Test.startTest();
            try {
                CardstackConfigService.saveDraft('homecard', '{}');
                Assert.fail('Retired Home authoring must fail.');
            } catch (CardstackConfigService.ConfigException expected) {
                Assert.areEqual('RETIRED_CONFIGURATION', expected.getMessage(), 'Retirement is explicit.');
            }
            Test.stopTest();
            Assert.areEqual(0, [SELECT count() FROM Cardstack_Config__c], 'Rejected staging creates no configuration.');
            Assert.areEqual(0, [SELECT count() FROM Cardstack_Config_Draft__c], 'Rejected staging creates no draft.');
            Assert.areEqual(0, [SELECT count() FROM Cardstack_Audit_Log__c], 'Rejected staging creates no audit.');
        }
    }

    @IsTest
    static void supportedStudioKeysExcludeRetainedAudiences() {
        Assert.isTrue(CardstackConfigService.isRetiredKey('homecard'), 'Only Home is retired.');
        for (String key : new List<String>{'layout:Account:default','layout:Contact:default','layout:Opportunity:default','layout:Custom__c:default','exposures:Account','flows'}) {
            Assert.isTrue(CardstackConfigService.isSupportedStudioKey(key), 'Supported Studio key: ' + key);
            Assert.isFalse(CardstackConfigService.isRetiredKey(key), 'Supported keys are not retired.');
        }
        for (String key : new List<String>{null,'','homecard','layout:Account:sales','layout:Account','layout::default','exposures:','exposures:Account:extra','setup:claudeConnected','screens','FLOWS','layout:Account:Default'}) {
            Assert.isFalse(CardstackConfigService.isSupportedStudioKey(key), 'Retained or malformed keys are excluded: ' + key);
        }
        Assert.isFalse(CardstackConfigService.isRetiredKey('HomeCard'), 'Retirement requires the exact Home key.');
        Assert.isFalse(CardstackConfigService.isRetiredKey('layout:Account:sales'), 'Audience history is unsupported, not Home retirement.');
    }

    @IsTest
    static void unsupportedAudienceSaveCannotCreateConfiguration() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Test.startTest();
            try {
                CardstackConfigService.saveDraft('layout:Account:sales', '{}');
                Assert.fail('Unsupported audiences must not authorize new drafts.');
            } catch (CardstackConfigService.ConfigException expected) {
                Assert.areEqual('UNSUPPORTED_CONFIGURATION', expected.getMessage(), 'Unsupported authoring is explicit.');
            }
            Test.stopTest();
            Assert.areEqual(0, [SELECT count() FROM Cardstack_Config__c], 'Rejected audience staging creates no configuration.');
        }
    }

    @IsTest
    static void unsupportedAudiencePublicationRetainsHistory() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Cardstack_Config__c config = new Cardstack_Config__c(Name = 'layout:Account:sales', Value__c = '{}', Is_Active__c = true);
            insert config;
            Cardstack_Config_Draft__c draft = new Cardstack_Config_Draft__c(Config__c = config.Id, Draft_Value__c = '{"name":"Retained"}', Status__c = 'Draft');
            insert draft;
            Test.startTest();
            try {
                CardstackConfigService.publishDraft(draft.Id);
                Assert.fail('Unsupported audience history must not be republished.');
            } catch (CardstackConfigService.ConfigException expected) {
                Assert.areEqual('UNSUPPORTED_CONFIGURATION', expected.getMessage(), 'Unsupported authoring is explicit.');
            }
            Test.stopTest();
            Assert.areEqual('{}', CardstackConfigService.getConfig(config.Name), 'Existing audience values remain readable and unchanged.');
            Assert.areEqual('Draft', [SELECT Status__c FROM Cardstack_Config_Draft__c WHERE Id = :draft.Id].Status__c, 'Saved audience draft remains unchanged.');
            Assert.areEqual(0, [SELECT count() FROM Cardstack_Audit_Log__c], 'Rejected audience publication creates no audit.');
            Assert.areEqual(1, CardstackConfigService.listDrafts(null).size(), 'Audience history remains readable.');
        }
    }

    @IsTest
    static void setupFlagsKeepSavePublishCompatibility() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Test.startTest();
            Id draftId = CardstackConfigService.saveDraft('setup:claudeConnected', 'true');
            CardstackConfigService.publishDraft(draftId);
            Test.stopTest();
            Assert.areEqual('true', CardstackConfigService.getConfig('setup:claudeConnected'), 'Setup markers retain publication compatibility.');
            Assert.isFalse(CardstackConfigService.isSupportedStudioKey('setup:claudeConnected'), 'Setup markers do not enter active authoring counts.');
            Assert.areEqual('Published', [SELECT Status__c FROM Cardstack_Config_Draft__c WHERE Id = :draftId].Status__c, 'Setup draft was actually published.');
        }
    }

    @IsTest
    static void supportedDraftWindowExcludesMoreThanTwoHundredRetainedDrafts() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Cardstack_Config__c supported = new Cardstack_Config__c(Name = 'layout:Contact:default', Is_Active__c = false);
            Cardstack_Config__c retained = new Cardstack_Config__c(Name = 'homecard', Value__c = '{}', Is_Active__c = true);
            insert new List<Cardstack_Config__c>{supported, retained};
            Cardstack_Config_Draft__c older = new Cardstack_Config_Draft__c(Config__c = supported.Id, Draft_Value__c = '{}', Status__c = 'Draft');
            insert older;
            Test.setCreatedDate(older.Id, Datetime.now().addDays(-1));
            List<Cardstack_Config_Draft__c> newer = new List<Cardstack_Config_Draft__c>();
            for (Integer index = 0; index < 251; index++) newer.add(new Cardstack_Config_Draft__c(Config__c = retained.Id, Draft_Value__c = '{}', Status__c = 'Draft'));
            insert newer;
            Test.startTest();
            List<Cardstack_Config_Draft__c> active = CardstackConfigService.listSupportedDrafts();
            Integer count = CardstackConfigService.countSupportedDrafts();
            List<Cardstack_Config_Draft__c> history = CardstackConfigService.listDrafts(null);
            Test.stopTest();
            Assert.areEqual(1, active.size(), 'Retained drafts do not consume the supported query window.');
            Assert.areEqual(older.Id, active[0].Id, 'Older Contact candidate remains available.');
            Assert.areEqual(1, count, 'Authoritative active count excludes retained Home drafts.');
            Assert.areEqual(200, history.size(), 'Generic bounded history contract is preserved.');
            for (Cardstack_Config_Draft__c draft : history) Assert.areEqual(retained.Id, draft.Config__c, 'The newest retained history remains readable.');
        }
    }

    @IsTest
    static void supportedPendingCountExceedsActiveTrayWindow() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Cardstack_Config__c config = new Cardstack_Config__c(Name = 'flows', Is_Active__c = false);
            insert config;
            List<Cardstack_Config_Draft__c> drafts = new List<Cardstack_Config_Draft__c>();
            for (Integer index = 0; index < 251; index++) drafts.add(new Cardstack_Config_Draft__c(Config__c = config.Id, Draft_Value__c = '[]', Status__c = 'Draft'));
            insert drafts;
            Test.startTest();
            Integer count = CardstackConfigService.countSupportedDrafts();
            List<Cardstack_Config_Draft__c> active = CardstackConfigService.listSupportedDrafts();
            Test.stopTest();
            Assert.areEqual(drafts.size(), count, 'Pending count includes every supported candidate beyond the tray window.');
            Assert.areEqual(200, active.size(), 'Active tray stays bounded.');
        }
    }

    @IsTest
    static void changedLiveOrDraftRejectsReviewedPublish() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Id id = CardstackConfigService.saveDraft('flows', '[]');
            Map<String,Object> review = CardstackConfigService.getDraftReview(id);
            update new Cardstack_Config_Draft__c(Id=id, Draft_Value__c='[ {"apiName":"Changed"} ]');
            Test.startTest();
            assertStaleReview(id, review);
            Test.stopTest();
            Assert.isNull(CardstackConfigService.getConfig('flows'), 'Changed candidate cannot activate configuration');
            Assert.areEqual('Draft', [SELECT Status__c FROM Cardstack_Config_Draft__c WHERE Id=:id].Status__c, 'Rejected draft is retained');
            Assert.areEqual(0, [SELECT COUNT() FROM Cardstack_Audit_Log__c], 'Stale review does not report success');
        }
    }

    @IsTest
    static void changedLiveRejectsReviewedPublish() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Id first = CardstackConfigService.saveDraft('flows', '[]');
            CardstackConfigService.publishDraft(first);
            Id next = CardstackConfigService.saveDraft('flows', '[{"apiName":"Next"}]');
            Map<String,Object> review = CardstackConfigService.getDraftReview(next);
            Cardstack_Config_Draft__c candidate = [SELECT Config__c FROM Cardstack_Config_Draft__c WHERE Id=:next];
            update new Cardstack_Config__c(Id=candidate.Config__c, Value__c='[ {"apiName":"Live"} ]');
            Test.startTest();
            assertStaleReview(next, review);
            Test.stopTest();
            Assert.areEqual('[ {"apiName":"Live"} ]', CardstackConfigService.getConfig('flows'), 'Stale review cannot overwrite live changes');
        }
    }

    @IsTest
    static void exactStoredWhitespaceIsReviewed() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Id id = CardstackConfigService.saveDraft('flows', '[]');
            Map<String,Object> review = CardstackConfigService.getDraftReview(id);
            update new Cardstack_Config_Draft__c(Id=id, Draft_Value__c='[ ]');
            Test.startTest();
            assertStaleReview(id, review);
            Test.stopTest();
            Assert.isNull(CardstackConfigService.getConfig('flows'), 'Semantically equal but different stored text requires a fresh review');
        }
    }

    @IsTest
    static void reviewedPublicationRechecksCandidateValidators() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Id id = CardstackConfigService.saveDraft('layout:Contact:default', contactCandidate());
            update new Cardstack_Config_Draft__c(Id=id, Draft_Value__c=contactCandidate().replace('"source":"current"', '"source":"constant"'));
            Map<String,Object> review = CardstackConfigService.getDraftReview(id);
            Test.startTest();
            try {
                CardstackConfigService.publishReviewedDraft(id, (String)review.get('liveDigest'), (String)review.get('draftDigest'));
                Assert.fail('Review digests do not bypass candidate validation');
            } catch (CardstackOpportunityActionPolicy.PolicyException expected) {
                Assert.areEqual('INVALID_PRESET', expected.getMessage(), 'Persisted candidate is validated again');
            }
            Test.stopTest();
            Assert.isNull(CardstackConfigService.getConfig('layout:Contact:default'), 'Rejected candidate remains inactive');
        }
    }

    @IsTest
    static void retiredDraftCannotGetStudioReview() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Cardstack_Config_Draft__c retained = retainedHomeDraft();
            Test.startTest();
            try { CardstackConfigService.getDraftReview(retained.Id); Assert.fail('Retired candidate cannot enter review'); }
            catch (CardstackConfigService.ConfigException expected) { Assert.areEqual('RETIRED_CONFIGURATION', expected.getMessage(), 'Retained value is inspectable but not publishable'); }
            Test.stopTest();
        }
    }

    @IsTest
    static void exactNullAndEmptyDigestsDiffer() {
        Test.startTest();
        String nullDigest = CardstackConfigService.storedDigest(null);
        String emptyDigest = CardstackConfigService.storedDigest('');
        Test.stopTest();
        Assert.areNotEqual(nullDigest, emptyDigest, 'Null and empty text are different reviewed values');
        Assert.areEqual(nullDigest.toLowerCase(), nullDigest, 'Snapshot digests are lowercase');
        Assert.areEqual(64, emptyDigest.length(), 'SHA-256 digest is full length');
    }

    @IsTest
    static void unsupportedDraftCannotGetStudioReview() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Cardstack_Config__c config = new Cardstack_Config__c(Name='screens', Is_Active__c=false);
            insert config;
            Cardstack_Config_Draft__c draft = new Cardstack_Config_Draft__c(Config__c=config.Id, Draft_Value__c='[]', Status__c='Draft');
            insert draft;
            Test.startTest();
            try { CardstackConfigService.getDraftReview(draft.Id); Assert.fail('Unsupported retained candidate cannot enter Studio review'); }
            catch (CardstackConfigService.ConfigException expected) { Assert.areEqual('UNSUPPORTED_CONFIGURATION', expected.getMessage(), 'Review has the supported key boundary'); }
            Test.stopTest();
            Assert.areEqual('Draft', [SELECT Status__c FROM Cardstack_Config_Draft__c WHERE Id=:draft.Id].Status__c, 'Unsupported history remains retained');
        }
    }

    private static void assertStaleReview(Id id, Map<String,Object> review) {
        try {
            CardstackConfigService.publishReviewedDraft(id, (String)review.get('liveDigest'), (String)review.get('draftDigest'));
            Assert.fail('Changed stored values require a fresh review');
        } catch (CardstackConfigService.ConfigException expected) {
            Assert.areEqual('STALE_REVIEW', expected.getMessage(), 'Explicit stale review code');
        }
    }
    @IsTest static void invalidListPolicyCannotCreateDraftOrConfig() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Test.startTest();
            try { CardstackConfigService.saveDraft('exposures:Opportunity', '{"version":2}'); Assert.fail('Unknown explicit version must be rejected.'); }
            catch (CardstackListExposurePolicy.PolicyException expected) { Assert.isTrue(expected.getMessage().contains('not available in chat'), 'Candidate validation rejects safely.'); }
            Test.stopTest();
            Assert.areEqual(0, [SELECT count() FROM Cardstack_Config__c WHERE Name='exposures:Opportunity'], 'Validation precedes parent insertion.');
            Assert.areEqual(0, [SELECT count() FROM Cardstack_Config_Draft__c], 'Validation precedes draft insertion.');
        }
    }
    @IsTest static void persistedListPolicyIsRevalidatedDuringReviewedPublish() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            String live='{"version":1,"allowAdHoc":false,"views":[],"customLists":[]}';
            Id draftId=CardstackConfigService.saveDraft('exposures:Opportunity', live);
            update new Cardstack_Config_Draft__c(Id=draftId, Draft_Value__c='{"version":2}');
            Map<String,Object> review=CardstackConfigService.getDraftReview(draftId);
            Test.startTest();
            try { CardstackConfigService.publishReviewedDraft(draftId, (String)review.get('liveDigest'), (String)review.get('draftDigest')); Assert.fail('Review digests do not authorize an invalid policy.'); }
            catch (CardstackListExposurePolicy.PolicyException expected) { Assert.isTrue(expected.getMessage().contains('not available in chat'), 'Reviewed publication delegates to validators.'); }
            Test.stopTest();
            Assert.areEqual(null, CardstackConfigService.getConfig('exposures:Opportunity'), 'Invalid review cannot activate configuration.');
            Assert.areEqual('Draft', [SELECT Status__c FROM Cardstack_Config_Draft__c WHERE Id=:draftId].Status__c, 'Invalid candidate remains unpublished.');
        }
    }

    @IsTest static void persistedListPolicyIsRevalidatedDuringDirectPublish() {
        System.runAs(new User(Id=UserInfo.getUserId())) {
            Id draftId=CardstackConfigService.saveDraft('exposures:Opportunity', '{"version":1,"views":[],"customLists":[]}');
            update new Cardstack_Config_Draft__c(Id=draftId,Draft_Value__c='{"version":2}');
            Test.startTest();
            try { CardstackConfigService.publishDraft(draftId); Assert.fail('Direct publication must validate the persisted policy.'); }
            catch (CardstackListExposurePolicy.PolicyException expected) { Assert.isTrue(expected.getMessage().contains('not available in chat'), 'Invalid persisted content is rejected.'); }
            Test.stopTest();
            Assert.areEqual(null,CardstackConfigService.getConfig('exposures:Opportunity'),'No invalid publication becomes active.');
            Assert.areEqual('Draft',[SELECT Status__c FROM Cardstack_Config_Draft__c WHERE Id=:draftId].Status__c,'Candidate remains a draft.');
        }
    }

}
