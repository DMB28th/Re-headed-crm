/**
 * Tests for CardstackConfigService: get/publish/rollback staging workflow.
 */
@IsTest
private class CardstackConfigServiceTest {

    @IsTest
    static void getConfigReturnsNullWhenMissing() {
        Test.startTest();
        String value = CardstackConfigService.getConfig('layout:Account:default');
        Test.stopTest();
        System.assertEquals(null, value, 'Missing config should return null.');
    }

    @IsTest
    static void saveDraftThenPublishAppliesValue() {
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

    @IsTest
    static void rollbackLeavesLiveValueUntouched() {
        Id first = CardstackConfigService.saveDraft('exposures:Contact', '{"v":1}');
        CardstackConfigService.publishDraft(first);

        Test.startTest();
        Id second = CardstackConfigService.saveDraft('exposures:Contact', '{"v":2}');
        CardstackConfigService.rollbackDraft(second);
        Test.stopTest();

        System.assertEquals(
            '{"v":1}',
            CardstackConfigService.getConfig('exposures:Contact'),
            'Rollback must not change the live value.'
        );
        Cardstack_Config_Draft__c draft = [
            SELECT Status__c FROM Cardstack_Config_Draft__c WHERE Id = :second
        ];
        System.assertEquals('Rolled Back', draft.Status__c);
    }

    @IsTest
    static void publishNonDraftThrows() {
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

    @IsTest
    static void stagingInfoReportsDraftAndLive() {
        Id draftId = CardstackConfigService.saveDraft('homecard', '{"title":"Hi"}');
        Test.startTest();
        Map<String, Object> info = CardstackConfigService.getStagingInfo('homecard');
        Test.stopTest();
        System.assertEquals('homecard', info.get('key'));
        System.assertEquals(null, info.get('liveValue'));
        System.assertNotEquals(null, info.get('draft'), 'Open draft should be reported.');
    }
}
