/**
 * Cardstack native port of `crm_get_related`.
 *
 * Fetches related records for a parent record — pagination for record-card
 * related lists. The relationship is a child relationship name (e.g.
 * Opportunities on Account, Contacts on Account).
 *
 * Security: `with sharing` + WITH_USER_MODE on all SOQL.
 */
global with sharing class CardstackGetRelatedAction {

    private static final Integer DEFAULT_LIMIT = 10;
    private static final Integer MAX_LIMIT = 50;

    @InvocableMethod(
        label='Cardstack Get Related'
        description='Fetch related records for a parent record (e.g. Opportunities for an Account, Tasks for a Contact). Use for related-list pagination on a record card.'
    )
    global static List<GetRelatedResponse> getRelated(List<GetRelatedRequest> requests) {
        List<GetRelatedResponse> responses = new List<GetRelatedResponse>();
        for (GetRelatedRequest req : requests) {
            responses.add(doGetRelated(req));
        }
        return responses;
    }

    private static GetRelatedResponse doGetRelated(GetRelatedRequest req) {
        if (String.isBlank(req.parentId)) {
            throw new CardstackException('parentId is required.');
        }
        if (String.isBlank(req.relationship)) {
            throw new CardstackException('relationship is required.');
        }

        Integer lim = DEFAULT_LIMIT;
        if (req.maxRows != null && req.maxRows > 0) {
            lim = Math.min(req.maxRows, MAX_LIMIT);
        }

        // Resolve the parent object from the Id prefix.
        String parentObject = objectNameForId(req.parentId);
        Schema.DescribeSObjectResult parentDescribe =
            Schema.getGlobalDescribe().get(parentObject).getDescribe();

        // Find the child relationship by name.
        Schema.ChildRelationship targetRel = null;
        for (Schema.ChildRelationship cr : parentDescribe.getChildRelationships()) {
            if (req.relationship.equalsIgnoreCase(cr.getRelationshipName())) {
                targetRel = cr;
                break;
            }
        }
        if (targetRel == null) {
            throw new CardstackException(
                'Relationship "' + req.relationship + '" not found on ' + parentObject + '.');
        }

        String childObject = targetRel.getChildSObject().getDescribe().getName();
        String childField = targetRel.getField().getDescribe().getName();
        // Locals for dynamic SOQL bind variables.
        String parentId = req.parentId;

        List<String> cols = new List<String>{ 'Id', 'Name' };
        Schema.DescribeSObjectResult childDescribe =
            targetRel.getChildSObject().getDescribe();
        for (String c : new List<String>{ 'StageName', 'Amount', 'CloseDate', 'Status', 'Subject', 'Email', 'Phone' }) {
            if (childDescribe.fields.getMap().containsKey(c)) {
                cols.add(c);
            }
        }

        List<SObject> rows = Database.query(
            'SELECT ' + String.join(cols, ', ') + ' FROM ' + childObject
            + ' WHERE ' + childField + ' = :parentId'
            + ' WITH USER_MODE ORDER BY CreatedDate DESC LIMIT :lim'
        );

        GetRelatedResponse res = new GetRelatedResponse();
        res.parentId = req.parentId;
        res.relationship = req.relationship;
        res.childObject = childObject;
        res.columns = new List<TableColumn>{
            column('Name', 'name'),
            column('Details', 'detail')
        };
        res.rows = new List<RelatedRow>();
        for (SObject r : rows) {
            RelatedRow row = new RelatedRow();
            row.recordId = (String) r.get('Id');
            row.name = String.valueOf(r.get('Name'));
            row.detail = detailFor(childDescribe, r);
            row.recordUrl = URL.getOrgDomainUrl().toExternalForm() + '/' + row.recordId;
            row.cells = new List<String>{ row.name, row.detail };
            res.rows.add(row);
        }
        res.count = res.rows.size();
        res.summary = res.count + ' related ' + childDescribe.getLabelPlural()
            + ' via ' + req.relationship;
        return res;
    }

    private static String objectNameForId(String recordId) {
        String prefix = recordId.substring(0, 3);
        for (Schema.SObjectType t : Schema.getGlobalDescribe().values()) {
            Schema.DescribeSObjectResult d = t.getDescribe();
            if (prefix.equals(d.getKeyPrefix())) {
                return d.getName();
            }
        }
        throw new CardstackException('Cannot resolve object for id: ' + recordId);
    }

    private static String detailFor(Schema.DescribeSObjectResult d, SObject r) {
        List<String> parts = new List<String>();
        for (String f : new List<String>{ 'StageName', 'Status', 'Subject' }) {
            if (d.fields.getMap().containsKey(f) && r.get(f) != null) {
                parts.add(String.valueOf(r.get(f)));
            }
        }
        if (d.fields.getMap().containsKey('Amount') && r.get('Amount') != null) {
            parts.add('$' + ((Decimal) r.get('Amount')).format());
        }
        return String.join(parts, ' · ');
    }

    global class GetRelatedRequest {
        @InvocableVariable(label='Parent Record ID' description='Id of the parent record.' required=true)
        public String parentId;

        @InvocableVariable(label='Relationship Name' description='Child relationship API name, e.g. Opportunities, Contacts.' required=true)
        public String relationship;

        @InvocableVariable(label='Limit' description='Max rows; defaults to 10, capped at 50.')
        public Integer maxRows;
    }

    global class GetRelatedResponse {
        @InvocableVariable(label='Parent Record ID')
        public String parentId;

        @InvocableVariable(label='Relationship')
        public String relationship;

        @InvocableVariable(label='Child Object')
        public String childObject;

        @InvocableVariable(label='Rows')
        public List<RelatedRow> rows;

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

    global class RelatedRow {
        @InvocableVariable public String recordId;
        @InvocableVariable public String name;
        @InvocableVariable public String detail;
        @InvocableVariable public String recordUrl;
        @InvocableVariable public List<String> cells;
    }

    public class CardstackException extends Exception {}
}
