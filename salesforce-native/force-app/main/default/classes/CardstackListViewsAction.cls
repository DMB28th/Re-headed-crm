/**
 * Cardstack native action: list a user's real Salesforce list views for an object.
 *
 * Lets the user discover what's available ("what opportunity views do I have?")
 * before asking for one. Respects list view visibility via WITH_USER_MODE.
 * Never throws — always returns a renderable response.
 */
global with sharing class CardstackListViewsAction {

    @InvocableMethod(
        label='Cardstack List Views'
        description='List the real Salesforce list views available for a CRM object (e.g. "My Opportunities", "Recently Viewed"). Use when the user asks what views exist, before running Cardstack List View with a view name.'
    )
    global static List<ListViewsResponse> listViews(List<ListViewsRequest> requests) {
        List<ListViewsResponse> responses = new List<ListViewsResponse>();
        for (ListViewsRequest req : requests) {
            responses.add(safeListViews(req));
        }
        return responses;
    }

    private static ListViewsResponse safeListViews(ListViewsRequest req) {
        ListViewsResponse res = new ListViewsResponse();
        res.views = new List<ViewSummary>();
        res.columns = new List<TableColumn>{ column('View Name', 'name') };
        try {
            String objectName = String.isBlank(req.objectName) ? 'Opportunity' : req.objectName.trim();
            Schema.SObjectType t = Schema.getGlobalDescribe().get(objectName);
            if (t == null || !t.getDescribe().isAccessible()) {
                res.objectName = objectName;
                res.summary = 'Object not available: ' + objectName;
                res.count = 0;
                return res;
            }
            res.objectName = objectName;
            List<ListView> views = [
                SELECT Id, Name, DeveloperName
                FROM ListView
                WHERE SobjectType = :objectName
                WITH USER_MODE
                ORDER BY Name
            ];
            for (ListView v : views) {
                ViewSummary s = new ViewSummary();
                s.viewId = v.Id;
                s.name = v.Name;
                s.developerName = v.DeveloperName;
                s.cells = new List<String>{ v.Name };
                res.views.add(s);
            }
            res.count = res.views.size();
            res.summary = res.count + ' list view' + (res.count == 1 ? '' : 's')
                + ' available for ' + t.getDescribe().getLabelPlural()
                + '. Ask for one by name, e.g. "show my opportunities".';
        } catch (Exception e) {
            res.summary = 'Could not list views: ' + e.getMessage();
            res.count = 0;
        }
        return res;
    }

    global class ListViewsRequest {
        @InvocableVariable(label='Object API Name' description='Object API name; defaults to Opportunity.')
        public String objectName;
    }

    global class ListViewsResponse {
        @InvocableVariable(label='Object API Name')
        public String objectName;

        @InvocableVariable(label='Views')
        public List<ViewSummary> views;

        @InvocableVariable(label='Columns' description='Table columns for rendering.')
        public List<TableColumn> columns;

        @InvocableVariable(label='Count')
        public Integer count;

        @InvocableVariable(label='Summary')
        public String summary;
    }

    global class TableColumn {
        @InvocableVariable public String label;
        @InvocableVariable public String apiName;
    }

    private static TableColumn column(String label, String apiName) {
        TableColumn c = new TableColumn();
        c.label = label;
        c.apiName = apiName;
        return c;
    }

    global class ViewSummary {
        @InvocableVariable public String viewId;
        @InvocableVariable public String name;
        @InvocableVariable public String developerName;
        @InvocableVariable public List<String> cells;
    }
}
