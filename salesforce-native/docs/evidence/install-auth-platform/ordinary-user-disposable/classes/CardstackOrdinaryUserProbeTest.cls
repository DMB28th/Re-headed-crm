/** Unit fixtures exercise installed permission gates; runAs is never OAuth evidence. */
@IsTest private with sharing class CardstackOrdinaryUserProbeTest {
    private static RestResponse invoke(String route) {
        RestContext.request = new RestRequest();
        RestContext.request.requestURI = '/services/apexrest/cardstack-ordinary-user-probe/v1/' + route;
        RestContext.request.httpMethod = 'GET';
        RestContext.response = new RestResponse();
        CardstackOrdinaryUserProbe.get();
        return RestContext.response;
    }
    @IsTest static void deniesUnassignedUser() {
        User actor = CardstackConnectionTestFactory.namedUser();
        Test.startTest();
        System.runAs(actor) {
            Assert.areEqual(403, invoke('use').statusCode, 'No Use permission');
            Assert.areEqual(403, invoke('admin').statusCode, 'No Manage permission');
        }
        Test.stopTest();
    }
    @IsTest static void userGrantAllowsUseOnlyWithoutPrivateCrud() {
        User actor = CardstackConnectionTestFactory.namedUser();
        CardstackConnectionTestFactory.assign(actor, 'Cardstack_User');
        Test.startTest();
        System.runAs(actor) {
            RestResponse response = invoke('use');
            Assert.areEqual(200, response.statusCode, 'Use permission allows probe');
            Map<String,Object> value = (Map<String,Object>) JSON.deserializeUntyped(response.responseBody.toString());
            Assert.areEqual(true, value.get('namedActor'), 'Actual named UserInfo');
            Assert.areEqual(false, value.get('privateRead'), 'No private read');
            Assert.areEqual(false, value.get('privateCreate'), 'No private create');
            Assert.areEqual(false, value.get('privateUpdate'), 'No private update');
            Assert.areEqual(false, value.get('privateDelete'), 'No private delete');
            Assert.areEqual(403, invoke('admin').statusCode, 'Use does not authorize Manage');
        }
        Test.stopTest();
    }
    @IsTest static void rejectsUnknownNestedAndTrailingRoutes() {
        Test.startTest();
        Assert.areEqual(404, invoke('other').statusCode, 'Unknown');
        Assert.areEqual(404, invoke('nested/use').statusCode, 'Nested');
        Assert.areEqual(404, invoke('use/').statusCode, 'Trailing slash');
        Test.stopTest();
    }
}
