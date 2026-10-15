/** Published policy fixtures; source contract checks do not execute these tests. */
@IsTest private with sharing class CardstackListExposurePolicyTest {
    @TestVisible private static final String CONTRACT_JSON = '{"version":1,"allowAdHoc":false,"views":[{"viewId":"00B000000000001EAA","enabled":true}],"customLists":[{"key":"listview:Opportunity:approved_name","enabled":true}]}';
    @IsTest static void publishedContractUsesCanonicalIdentity() {
        Test.startTest();
        CardstackListExposurePolicy.Policy policy = CardstackListExposurePolicy.parse('Opportunity', CONTRACT_JSON);
        Test.stopTest();
        Assert.isTrue(CardstackListExposurePolicy.isAllowed(policy, 'salesforce', '00B000000000001'), '15 character platform identity normalizes to checksum18.');
        Assert.isTrue(CardstackListExposurePolicy.isAllowed(policy, 'cardstack', 'listview:Opportunity:approved_name'), 'Full saved keys remain distinct.');
        Assert.isFalse(CardstackListExposurePolicy.allowsAdHoc(policy), 'Unnamed requests default closed.');
    }
    @IsTest static void missingOrLegacyPolicyPreservesBaseline() {
        Test.startTest();
        CardstackListExposurePolicy.Policy missing = CardstackListExposurePolicy.parse('Opportunity', null);
        CardstackListExposurePolicy.Policy legacy = CardstackListExposurePolicy.parse('Opportunity', '{"views":[{"viewId":"old-view","exposed":false,"aliases":["legacy"]}],"customLists":[]}');
        Test.stopTest();
        Assert.areEqual('legacy', missing.mode, 'Absent policy retains legacy behavior.');
        Assert.areEqual('legacy', legacy.mode, 'Recognized unversioned exposure settings are not enforced.');
    }
    @IsTest static void emptySelectionsDenyAllNamedLists() {
        Test.startTest();
        CardstackListExposurePolicy.Policy policy = CardstackListExposurePolicy.parse('Opportunity', '{"version":1,"views":[],"customLists":[]}');
        Test.stopTest();
        Assert.isFalse(CardstackListExposurePolicy.isAllowed(policy, 'salesforce', '00B000000000001'), 'Empty selections grant no named list.');
        Assert.isFalse(CardstackListExposurePolicy.allowsAdHoc(policy), 'Missing ad hoc flag is false.');
    }
    @IsTest static void malformedCandidateCannotBeSaved() {
        Test.startTest();
        for (String raw : new List<String>{'{', '{"version":2}', '{}', '{"version":1,"views":[],"customLists":[],"allowAdHoc":"true"}', '{"version":1,"views":[{"viewId":"bad","enabled":true}],"customLists":[]}', '{"version":1,"views":[],"customLists":[{"key":"listview:Account:other","enabled":true}]}'} ) {
            try {
                CardstackListExposurePolicy.validateCandidate('exposures:Opportunity', raw);
                Assert.fail('Reject malformed policy: ' + raw);
            } catch (CardstackListExposurePolicy.PolicyException expected) {
                Assert.isTrue(expected.getMessage().contains('not available in chat'), 'Validation uses a safe policy error.');
            }
        }
        Test.stopTest();
    }
    @IsTest static void unrelatedPropertiesCannotGrantCapabilities() {
        Test.startTest();
        CardstackListExposurePolicy.Policy policy = CardstackListExposurePolicy.parse('Opportunity', '{"version":1,"views":[{"viewId":"00B000000000001","enabled":false,"exposed":true,"isDefault":true,"aliases":["everything"]}],"customLists":[],"futureProperty":true}');
        Test.stopTest();
        Assert.isFalse(CardstackListExposurePolicy.isAllowed(policy, 'salesforce', '00B000000000001'), 'Only enabled canonical selections authorize.');
    }
    @IsTest static void unreadableConfigurationDeniesEvenWithoutAVisiblePolicy() {
        User actor=CardstackConnectionTestFactory.namedUser();
        System.runAs(actor) {
            Test.startTest();
            CardstackListExposurePolicy.Policy policy=CardstackListExposurePolicy.loadPublished('Opportunity');
            Test.stopTest();
            Assert.areEqual('denied', policy.mode, 'Missing configuration CRUD/FLS is denial, never absence.');
            Assert.isFalse(CardstackListExposurePolicy.allowsAdHoc(policy), 'An unreadable policy cannot allow unnamed rows.');
        }
    }

}
