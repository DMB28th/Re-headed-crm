/**
 * Cardstack native port of `crm_list_objects`.
 *
 * Lists the CRM objects available in this org with their labels and key
 * fields, so the model knows what it can work with. In the Node
 * implementation this came from a workspace config store; natively we
 * describe the org's key objects directly.
 *
 * Security: `with sharing` + WITH_USER_MODE on describes (implicit).
 */
global with sharing class CardstackListObjectsAction {

    // Core CRM objects exposed to the assistant. Order matters for display.
    private static final List<String> CORE_OBJECTS = new List<String>{
        'Account', 'Opportunity', 'Contact', 'Lead', 'Task', 'Event', 'Case'
    };

    @InvocableMethod(
        label='Cardstack List Objects'
        description='List the CRM objects available in this Salesforce org with their labels and key fields. Use to discover what objects the assistant can search, read, and write.'
    )
    global static List<ListObjectsResponse> listObjects(List<ListObjectsRequest> requests) {
        List<ListObjectsResponse> responses = new List<ListObjectsResponse>();
        for (ListObjectsRequest req : requests) {
            responses.add(doListObjects());
        }
        return responses;
    }

    private static ListObjectsResponse doListObjects() {
        ListObjectsResponse res = new ListObjectsResponse();
        res.objects = new List<ObjectSummary>();
        Map<String, Schema.SObjectType> gd = Schema.getGlobalDescribe();
        for (String apiName : CORE_OBJECTS) {
            if (!gd.containsKey(apiName)) {
                continue;
            }
            Schema.DescribeSObjectResult d = gd.get(apiName).getDescribe();
            if (!d.isAccessible()) {
                continue;
            }
            ObjectSummary s = new ObjectSummary();
            s.apiName = apiName;
            s.label = d.getLabel();
            s.labelPlural = d.getLabelPlural();
            s.keyFields = keyFieldsFor(d);
            s.cells = new List<String>{ s.label, s.apiName, String.join(s.keyFields, ', ') };
            res.objects.add(s);
        }
        res.columns = new List<TableColumn>{
            column('Object', 'label'),
            column('API Name', 'apiName'),
            column('Key Fields', 'keyFields')
        };
        res.count = res.objects.size();
        res.summary = res.count + ' CRM objects available';
        return res;
    }

    private static List<String> keyFieldsFor(Schema.DescribeSObjectResult d) {
        List<String> keys = new List<String>{ 'Id', 'Name' };
        Map<String, Schema.SObjectField> fields = d.fields.getMap();
        // Add the most useful identifying fields per object, if present.
        List<String> candidates = new List<String>{
            'Industry', 'Type', 'StageName', 'Amount', 'CloseDate',
            'Email', 'Phone', 'Title', 'Status', 'Subject', 'LeadSource'
        };
        for (String c : candidates) {
            if (fields.containsKey(c) && fields.get(c).getDescribe().isAccessible()) {
                keys.add(c);
            }
        }
        return keys;
    }

    global class ListObjectsRequest {
        @InvocableVariable(label='Unused' description='No inputs required; leave blank.')
        public String unused;
    }

    global class ListObjectsResponse {
        @InvocableVariable(label='Objects')
        public List<ObjectSummary> objects;

        @InvocableVariable(label='Columns' description='Table columns for rendering.')
        public List<TableColumn> columns;

        @InvocableVariable(label='Summary')
        public String summary;

        @InvocableVariable(label='Count')
        public Integer count;
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

    global class ObjectSummary {
        @InvocableVariable public String apiName;
        @InvocableVariable public String label;
        @InvocableVariable public String labelPlural;
        @InvocableVariable public List<String> keyFields;
        @InvocableVariable public List<String> cells;
    }
}
