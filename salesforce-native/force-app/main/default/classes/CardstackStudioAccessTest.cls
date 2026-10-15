/** Actual custom-permission fixtures; runtime read permission is independent of Studio. */
@IsTest private with sharing class CardstackStudioAccessTest {
    @IsTest static void onlyAdminCanUseStudioEvenWithConfigReadAccess() {
        User actor = CardstackConnectionTestFactory.namedUser();
        CardstackConnectionTestFactory.assign(actor, 'Cardstack_User');
        System.runAs(actor) {
            Test.startTest();
            Assert.isFalse(FeatureManagement.checkPermission('Cardstack_Manage_Studio'), 'Chat users must not gain Studio administration.');
            Assert.areEqual(null, CardstackConfigService.getConfig('layout:Account:default'), 'Runtime configuration reads remain separate.');
            try {
                CardstackStudioController.getConfigValue('layout:Account:default');
                Assert.fail('Config read access must not admit a Studio user.');
            } catch (AuraHandledException failure) {
                Assert.isTrue(failure.getMessage().contains('Cardstack_Admin'), 'Explain the admin role needed for Studio.');
                Assert.isTrue(failure.getMessage().contains('Cardstack_User'), 'Explain the separate chat role.');
            }
            Test.stopTest();
        }
    }
    @IsTest static void ordinaryUserRejectedBeforeEveryControllerEntry() {
        User actor = CardstackConnectionTestFactory.namedUser();
        CardstackConnectionTestFactory.assign(actor, 'Cardstack_User');
        System.runAs(actor) {
            Test.startTest();
            for (String entry : new List<String>{'getConfigValue', 'getStagingInfo', 'getStagingInfoFresh', 'getFlowLaunchCards', 'saveDraft', 'publishDraft', 'getDraftReview', 'publishReviewedDraft', 'getDraftStatus', 'rollbackDraft', 'getDrafts', 'listConfigKeys', 'searchAudit', 'listAuditTools', 'listAuditUsers', 'setSetupFlag', 'getCrmObjects', 'getObjectFields', 'getRecordEditCapability', 'getConnectionInfo', 'getStudioOverview', 'getDashboardData', 'getChecklistState', 'getActiveFlows', 'getFlowInputs'}) {
                try {
                    invokeStudioEntry(entry);
                    Assert.fail('Studio entry must require administration: ' + entry);
                } catch (AuraHandledException failure) {
                    Assert.isTrue(failure.getMessage().contains('Cardstack_Admin'), 'Gate before reading or parsing input: ' + entry);
                }
            }
            Test.stopTest();
        }
    }
    private static void invokeStudioEntry(String entry) {
        if (entry == 'getConfigValue') { CardstackStudioController.getConfigValue('flows'); return; }
        if (entry == 'getStagingInfo') { CardstackStudioController.getStagingInfo('flows'); return; }
        if (entry == 'getStagingInfoFresh') { CardstackStudioController.getStagingInfoFresh('flows'); return; }
        if (entry == 'getFlowLaunchCards') { CardstackStudioController.getFlowLaunchCards(); return; }
        if (entry == 'saveDraft') { CardstackStudioController.saveDraft('flows', '[]'); return; }
        if (entry == 'publishDraft') { CardstackStudioController.publishDraft('invalid'); return; }
        if (entry == 'getDraftReview') { CardstackStudioController.getDraftReview('invalid'); return; }
        if (entry == 'publishReviewedDraft') { CardstackStudioController.publishReviewedDraft('invalid', null, null); return; }
        if (entry == 'getDraftStatus') { CardstackStudioController.getDraftStatus('invalid'); return; }
        if (entry == 'rollbackDraft') { CardstackStudioController.rollbackDraft('invalid'); return; }
        if (entry == 'getDrafts') { CardstackStudioController.getDrafts(null); return; }
        if (entry == 'listConfigKeys') { CardstackStudioController.listConfigKeys(); return; }
        if (entry == 'searchAudit') { CardstackStudioController.searchAudit(null, null, 1, null, null, null); return; }
        if (entry == 'listAuditTools') { CardstackStudioController.listAuditTools(); return; }
        if (entry == 'listAuditUsers') { CardstackStudioController.listAuditUsers(); return; }
        if (entry == 'setSetupFlag') { CardstackStudioController.setSetupFlag(null, false); return; }
        if (entry == 'getCrmObjects') { CardstackStudioController.getCrmObjects(); return; }
        if (entry == 'getRecordEditCapability') { CardstackStudioController.getRecordEditCapability('invalid'); return; }
        if (entry == 'getObjectFields') { CardstackStudioController.getObjectFields('Account'); return; }
        if (entry == 'getConnectionInfo') { CardstackStudioController.getConnectionInfo(); return; }
        if (entry == 'getStudioOverview') { CardstackStudioController.getStudioOverview(); return; }
        if (entry == 'getDashboardData') { CardstackStudioController.getDashboardData(); return; }
        if (entry == 'getChecklistState') { CardstackStudioController.getChecklistState(); return; }
        if (entry == 'getActiveFlows') { CardstackStudioController.getActiveFlows(); return; }
        if (entry == 'getFlowInputs') { CardstackStudioController.getFlowInputs(null); return; }
        Assert.fail('Unrecognized controller entry fixture.');
    }
    @IsTest static void assignedAdminCanUseStudio() {
        User actor = CardstackConnectionTestFactory.namedUser();
        CardstackConnectionTestFactory.assign(actor, 'Cardstack_Admin');
        CardstackStudioTestFactory.grantManageStudio(actor);
        System.runAs(actor) {
            Test.startTest();
            Assert.isTrue(FeatureManagement.checkPermission('Cardstack_Manage_Studio'), 'The isolated positive actor has the actual native Studio permission.');
            CardstackStudioAccess.requireAdmin();
            Assert.areEqual(null, CardstackStudioController.getConfigValue('layout:Account:default'), 'Admin can read empty Studio configuration.');
            Test.stopTest();
        }
    }
    @IsTest static void unassignedUserCannotUseStudio() {
        User actor = CardstackConnectionTestFactory.namedUser();
        System.runAs(actor) {
            Test.startTest();
            try {
                CardstackStudioAccess.requireAdmin();
                Assert.fail('An unassigned user cannot use Studio.');
            } catch (AuraHandledException failure) {
                Assert.isTrue(failure.getMessage().contains('Cardstack_Admin'), 'Require Studio administration.');
            }
            Test.stopTest();
        }
    }
}
