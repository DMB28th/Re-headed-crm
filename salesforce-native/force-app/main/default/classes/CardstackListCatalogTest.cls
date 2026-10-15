/** Native-readable metadata seam, including more than one trigger batch of views. */
@IsTest private with sharing class CardstackListCatalogTest {
    private class FixtureProvider implements CardstackListCatalog.MetadataProvider {
        public List<ListView> nativeViews(String objectApi) { return fixtures(251); }
    }
    @TestVisible private static List<ListView> fixtures(Integer count) {
        List<ListView> rows = new List<ListView>();
        for (Integer i = 1; i <= count; i++) {
            String suffix = String.valueOf(i).leftPad(12, '0');
            rows.add((ListView)JSON.deserialize(JSON.serialize(new Map<String,Object>{'Id'=>'00B'+suffix,'Name'=>'View '+i,'DeveloperName'=>'View_'+i}), ListView.class));
        }
        return rows;
    }
    @IsTest static void bulkCatalogUsesOneNativeReadAndOneSavedQuery() {
        PermissionSet admin = [SELECT Id FROM PermissionSet WHERE Name='Cardstack_Admin' LIMIT 1];
        if ([SELECT count() FROM PermissionSetAssignment WHERE AssigneeId=:UserInfo.getUserId() AND PermissionSetId=:admin.Id] == 0) insert new PermissionSetAssignment(AssigneeId=UserInfo.getUserId(), PermissionSetId=admin.Id);
        CardstackListCatalog.metadataProvider = new FixtureProvider();
        Test.startTest();
        Integer beforeQueries = Limits.getQueries();
        List<Map<String,Object>> rows = CardstackListCatalog.available('Opportunity');
        Integer queries = Limits.getQueries()-beforeQueries;
        Test.stopTest();
        Assert.areEqual(251, rows.size(), 'All native fixtures are available without per-row SOQL.');
        Assert.areEqual(1, queries, 'Saved filters are queried once for the entire catalog.');
        Assert.areEqual(18, ((String)rows[0].get('key')).length(), 'Keys use checksum18.');
        Assert.areEqual('available', rows[0].get('availability'), 'Metadata describes the current actor only.');
    }
    @IsTest static void missingNativeObjectAccessReturnsNoCatalog() {
        User actor = CardstackConnectionTestFactory.namedUser();
        CardstackConnectionTestFactory.assign(actor, 'Cardstack_User');
        System.runAs(actor) {
            Test.startTest();
            List<Map<String,Object>> rows = CardstackListCatalog.available('Opportunity');
            Test.stopTest();
            Assert.areEqual(0, rows.size(), 'Admin metadata cannot grant an ordinary user object access.');
        }
    }
    @IsTest static void ordinaryUserCannotCallAdminCatalogWrappers() {
        User actor = CardstackConnectionTestFactory.namedUser();
        CardstackConnectionTestFactory.assign(actor, 'Cardstack_User');
        System.runAs(actor) {
            Test.startTest();
            try { CardstackStudioController.getStudioListCatalog('Opportunity'); Assert.fail('List wrapper needs admin.'); }
            catch (AuraHandledException expected) { Assert.isTrue(expected.getMessage().contains('Cardstack_Admin'), 'Gate before metadata access.'); }
            try { CardstackStudioController.getStudioFieldCatalog('Opportunity'); Assert.fail('Field wrapper needs admin.'); }
            catch (AuraHandledException expected) { Assert.isTrue(expected.getMessage().contains('Cardstack_Admin'), 'Gate before field access.'); }
            Test.stopTest();
        }
    }
    @IsTest static void publishedPolicyFilters251TargetsWithoutQueriesPerRow() {
        PermissionSet admin=[SELECT Id FROM PermissionSet WHERE Name='Cardstack_Admin' LIMIT 1];
        if ([SELECT count() FROM PermissionSetAssignment WHERE AssigneeId=:UserInfo.getUserId() AND PermissionSetId=:admin.Id] == 0) insert new PermissionSetAssignment(AssigneeId=UserInfo.getUserId(), PermissionSetId=admin.Id);
        List<Object> selected=new List<Object>();
        List<ListView> views=fixtures(251);
        for (Integer i=0; i<views.size(); i+=2) selected.add(new Map<String,Object>{'viewId'=>String.valueOf(views[i].Id),'enabled'=>true});
        insert new Cardstack_Config__c(Name='exposures:Opportunity',Is_Active__c=true,Value__c=JSON.serialize(new Map<String,Object>{'version'=>1,'allowAdHoc'=>false,'views'=>selected,'customLists'=>new List<Object>()}));
        CardstackListCatalog.metadataProvider=new FixtureProvider();
        CardstackListViewsAction.ListViewsRequest request=new CardstackListViewsAction.ListViewsRequest(); request.objectName='Opportunity';
        Test.startTest();
        Integer beforeQueries=Limits.getQueries();
        CardstackListViewsAction.ListViewsResponse response=CardstackListViewsAction.listViews(new List<CardstackListViewsAction.ListViewsRequest>{request})[0];
        Integer queries=Limits.getQueries()-beforeQueries;
        Test.stopTest();
        Assert.areEqual(selected.size(), response.count, 'Only explicitly selected rows survive bulk filtering.');
        Assert.areEqual(1, queries, 'Published policy is queried once, never once per metadata row.');
    }

}
