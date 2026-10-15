/** Disposable native permission measurement; never reads private records or bearer values. */
@RestResource(urlMapping='/cardstack-ordinary-user-probe/v1/*')
global with sharing class CardstackOrdinaryUserProbe {
    private static final String RESOURCE = '/cardstack-ordinary-user-probe/v1/';
    /** Rejects anonymous actors before permission checks or describe work. */
    @HttpGet global static void get() {
        RestContext.response.addHeader('Content-Type', 'application/json');
        RestContext.response.addHeader('Cache-Control', 'no-store');
        if (String.isBlank(UserInfo.getUserType()) || UserInfo.getUserType() == 'Guest') {
            respond(401, new Map<String,Boolean>{'namedActor' => false});
            return;
        }
        String path = RestContext.request.requestURI;
        Boolean useRoute = matches(path, 'use');
        Boolean adminRoute = matches(path, 'admin');
        if (!useRoute && !adminRoute) {
            respond(404, new Map<String,Boolean>{'knownRoute' => false});
            return;
        }
        try {
            if (useRoute) CardstackConnectionAccess.requireUser();
            else CardstackConnectionAccess.requireAdmin();
        } catch (CardstackConnectionTypes.ConnectionException denied) {
            respond(403, new Map<String,Boolean>{'authorized' => false});
            return;
        }
        Map<String,Boolean> result = new Map<String,Boolean>{'namedActor' => true, 'authorized' => true};
        if (useRoute) {
            Schema.DescribeSObjectResult metadata = Cardstack_Connection_Setup__c.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED);
            result.put('privateRead', metadata.isAccessible());
            result.put('privateCreate', metadata.isCreateable());
            result.put('privateUpdate', metadata.isUpdateable());
            result.put('privateDelete', metadata.isDeletable());
        }
        respond(200, result);
    }
    private static Boolean matches(String path, String route) {
        String exact = RESOURCE + route;
        return path == exact || path == '/services/apexrest' + exact ||
            path == '/cardstackauthprobe' + exact || path == '/cardstackauthprobe/services/apexrest' + exact;
    }
    private static void respond(Integer status, Map<String,Boolean> value) {
        RestContext.response.statusCode = status;
        RestContext.response.responseBody = Blob.valueOf(JSON.serialize(value));
    }
}
