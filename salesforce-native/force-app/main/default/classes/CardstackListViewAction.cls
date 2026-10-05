/**
 * Native list cards using user-mode SOQL and saved Cardstack filters.
 * Salesforce view names are resolved for labeling and My-owner filtering.
 * Beta does not reproduce arbitrary saved-view columns, filters, or sorting:
 * Hosted MCP throws a fatal exception when Apex requests its session ID.
 */
global with sharing class CardstackListViewAction {

    private static final Integer DEFAULT_LIMIT = 10;
    private static final Integer MAX_LIMIT = 25;

    @InvocableMethod(
        label='Cardstack List View'
        description='List CRM records as an interactive table using user-mode SOQL. Named Salesforce views use a labeled beta fallback, not their exact saved filters or columns. My views restrict records to the connected user. Supports query, stage, openOnly, amount bounds, sorting, and saved Cardstack filters.'
    )
    global static List<ListViewResponse> listView(List<ListViewRequest> requests) {
        List<ListViewResponse> responses = new List<ListViewResponse>();
        if (requests == null) {
            return responses;
        }
        for (ListViewRequest req : requests) {
            try {
                responses.add(safeListView(req));
            } catch (Exception e) {
                // Last-resort: never let the invocable throw
                ListViewResponse err = new ListViewResponse();
                err.objectName = 'Opportunity';
                err.summary = 'Could not load the list view: ' + e.getMessage();
                err.rows = new List<ViewRow>();
                err.columns = new List<TableColumn>();
                err.count = 0;
                err.usedRealView = false;
                err.fallbackNote = 'Error: ' + e.getMessage();
                responses.add(err);
            }
        }
        return responses;
    }

    /**
     * Never-throwing wrapper. Every failure path returns a renderable response.
     */
    private static ListViewResponse safeListView(ListViewRequest req) {
        try {
            return doListView(req);
        } catch (Exception e) {
            ListViewResponse res = new ListViewResponse();
            res.objectName = req != null && !String.isBlank(req.objectName) ? req.objectName.trim() : 'Opportunity';
            res.summary = 'Could not load the list view: ' + e.getMessage();
            res.rows = new List<ViewRow>();
            res.columns = new List<TableColumn>();
            res.count = 0;
            res.usedRealView = false;
            res.fallbackNote = 'Error: ' + e.getMessage();
        return res;
        }
    }

    private static ListViewResponse doListView(ListViewRequest req) {
        String objectName = String.isBlank(req.objectName) ? 'Opportunity' : req.objectName.trim();
        Schema.SObjectType t = Schema.getGlobalDescribe().get(objectName);
        if (t == null || !t.getDescribe().isAccessible()) {
            ListViewResponse err = new ListViewResponse();
            err.objectName = objectName;
            err.summary = 'Object not available: ' + objectName;
            err.rows = new List<ViewRow>();
            err.columns = new List<TableColumn>();
            err.count = 0;
            err.usedRealView = false;
            return err;
        }
        Schema.DescribeSObjectResult d = t.getDescribe();

        Integer lim = DEFAULT_LIMIT;
        if (req.maxRows != null && req.maxRows > 0) {
            lim = Math.min(req.maxRows, MAX_LIMIT);
        }

        // 1. Resolve view name against real list views.
        // If no viewName was given but this looks like a plain "show me my X" request
        // (no specific filters), default to the "My {Object}" list view.
        // Wrapped in try-catch: view resolution must never break the list.
        ListView resolved = null;
        try {
            if (!String.isBlank(req.viewName)) {
                resolved = resolveView(objectName, req.viewName.trim());
            } else if (String.isBlank(req.query) && String.isBlank(req.stage)
                    && req.openOnly != true && req.minAmount == null && req.maxAmount == null) {
                // Plain list request — try "My {PluralLabel}" before falling back to filters.
                String myView = 'My ' + d.getLabelPlural();
                resolved = resolveView(objectName, myView);
            }
        } catch (Exception e) {
            // View resolution failed; fall through to filter-based with resolved=null.
            resolved = null;
        }
        // 2. Check for a saved Cardstack view (listview:{Object}:{name}).
        Boolean usedSavedView = false;
        if (resolved == null && !String.isBlank(req.viewName)) {
            Map<String, Object> saved = loadSavedView(objectName, req.viewName.trim());
            if (saved != null) {
                return executeSavedView(objectName, d, req.viewName.trim(), saved, req, lim);
            }
        }

        // Hosted MCP cannot supply an Apex session for self-REST. Do not call
        // UserInfo.getSessionId(): it raises an uncatchable platform exception.
        String requestedView = resolved != null ? resolved.Name : req.viewName;
        ListViewResponse res = executeFilterBased(objectName, d, req, lim, requestedView);
        if (!String.isBlank(req.viewName)) {
            res.viewName = requestedView;
            res.usedRealView = false;
            res.fallbackNote = 'Beta filtered list for "' + requestedView + '"; Salesforce saved-view filters, columns, and sort are not reproduced.';
        }

        // 4. Save as a Cardstack view if requested.
        if (!String.isBlank(req.saveViewAs)) {
            saveView(objectName, req.saveViewAs.trim(), req, isMyViewName(req.viewName) || isMyViewName(requestedView));
            res.summary += ' Saved as "' + req.saveViewAs.trim() + '".';
        }
        return res;
    }

    // ── View resolution ───────────────────────────────────────────────

    /**
     * Fuzzy-matches a conversational view name ("my opportunities") against the
     * org's real list views. Returns the best match or null.
     */
    private static ListView resolveView(String objectName, String viewName) {
        List<ListView> views;
        if (Test.isRunningTest()) {
            // In tests there are no real list views; resolution is exercised
            // via resolveViewName() unit tests with injected candidates.
            return null;
        }
        try {
            views = [
                SELECT Id, Name, DeveloperName
                FROM ListView
                WHERE SobjectType = :objectName
                WITH USER_MODE
                ORDER BY Name
            ];
        } catch (Exception e) {
            return null;
        }
        try {
            return matchView(views, viewName);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Pure matching logic — testable without SOQL.
     */
    @TestVisible
    private static ListView matchView(List<ListView> views, String viewName) {
        if (views == null || views.isEmpty() || String.isBlank(viewName)) {
            return null;
        }
        String want = normalize(viewName);
        // 1. Exact normalized match on Name.
        for (ListView v : views) {
            if (normalize(v.Name).equals(want)) {
                return v;
            }
        }
        // 2. Exact normalized match on DeveloperName.
        for (ListView v : views) {
            if (normalize(v.DeveloperName).equals(want)) {
                return v;
            }
        }
        // 3. Name contains the want (or vice versa) — "opportunities" → "My Opportunities".
        for (ListView v : views) {
            String have = normalize(v.Name);
            if (have.contains(want) || want.contains(have)) {
                return v;
            }
        }
        return null;
    }

    @TestVisible
    private static String normalize(String s) {
        if (String.isBlank(s)) return '';
        return s.toLowerCase().replaceAll('[^a-z0-9]', '');
    }

    private static final String VIEW_KEY_PREFIX = 'listview:';

    // Saved Cardstack filters remain available without self-REST.
    private static Map<String, Object> loadSavedView(String objectName, String name) {
        String key = VIEW_KEY_PREFIX + objectName + ':' + normalize(name);
        try {
            if (!Schema.sObjectType.Cardstack_Config__c.isAccessible()) return null;
            List<Cardstack_Config__c> rows = [
                SELECT Value__c FROM Cardstack_Config__c
                WHERE Name = :key AND Is_Active__c = true
                WITH USER_MODE LIMIT 1
            ];
            if (rows.isEmpty() || String.isBlank(rows[0].Value__c)) return null;
            return (Map<String, Object>) JSON.deserializeUntyped(rows[0].Value__c);
        } catch (Exception e) {
            return null;
        }
    }

    private static ListViewResponse executeSavedView(
        String objectName, Schema.DescribeSObjectResult d, String viewName,
        Map<String, Object> saved, ListViewRequest req, Integer lim
    ) {
        // A saved Cardstack view stores filter params; run the filter path with them.
        ListViewRequest merged = new ListViewRequest();
        merged.objectName = objectName;
        merged.viewName = viewName;
        merged.query = (String) saved.get('query');
        merged.stage = (String) saved.get('stage');
        merged.openOnly = (Boolean) saved.get('openOnly');
        merged.sortBy = (String) saved.get('sortBy');
        merged.sortDir = (String) saved.get('sortDir');
        Object minA = saved.get('minAmount');
        Object maxA = saved.get('maxAmount');
        if (minA instanceof Decimal) merged.minAmount = (Decimal) minA;
        if (maxA instanceof Decimal) merged.maxAmount = (Decimal) maxA;
        // Live request overrides refine the saved view.
        if (!String.isBlank(req.query)) merged.query = req.query;
        if (!String.isBlank(req.stage)) merged.stage = req.stage;
        if (req.openOnly == true) merged.openOnly = true;
        if (req.minAmount != null) merged.minAmount = req.minAmount;
        if (req.maxAmount != null) merged.maxAmount = req.maxAmount;
        if (!String.isBlank(req.sortBy)) { merged.sortBy = req.sortBy; merged.sortDir = req.sortDir; }
        merged.maxRows = lim;
        ListViewResponse res = executeFilterBased(objectName, d, merged, lim, saved.get('myOnly') == true ? 'my saved view' : null);
        res.viewName = viewName + ' (saved view)';
        res.usedRealView = false;
        return res;
    }

    private static void saveView(String objectName, String name, ListViewRequest req, Boolean myOnly) {
        try {
            if (!Schema.sObjectType.Cardstack_Config__c.isCreateable()
                || !Schema.sObjectType.Cardstack_Config__c.isUpdateable()) {
                return;
            }
            String key = VIEW_KEY_PREFIX + objectName + ':' + normalize(name);
            Map<String, Object> val = new Map<String, Object>{
                'displayName' => name,
                'objectName' => objectName,
                'myOnly' => myOnly,
                'query' => req.query,
                'stage' => req.stage,
                'openOnly' => req.openOnly == true,
                'minAmount' => req.minAmount,
                'maxAmount' => req.maxAmount,
                'sortBy' => req.sortBy,
                'sortDir' => req.sortDir,
                'savedBy' => UserInfo.getUserId(),
                'savedAt' => Datetime.now().format()
            };
            List<Cardstack_Config__c> existing = [
                SELECT Id FROM Cardstack_Config__c WHERE Name = :key WITH USER_MODE LIMIT 1
            ];
            if (existing.isEmpty()) {
                insert as user new Cardstack_Config__c(
                    Name = key,
                    Value__c = JSON.serialize(val),
                    Description__c = 'Cardstack saved list view: ' + name,
                    Is_Active__c = true
                );
            } else {
                Cardstack_Config__c c = new Cardstack_Config__c(
                    Id = existing[0].Id,
                    Value__c = JSON.serialize(val),
                    Is_Active__c = true
                );
                update as user c;
            }
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'Cardstack save view failed: ' + e.getMessage());
        }
    }

    // ── Filter-based fallback (original behavior, hardened) ───────────

    private static Boolean isMyViewName(String name) {
        return !String.isBlank(name) && name.trim().toLowerCase().startsWith('my ');
    }

    @TestVisible
    private static ListViewResponse executeFilterBased(
        String objectName, Schema.DescribeSObjectResult d,
        ListViewRequest req, Integer lim, String resolvedViewName
    ) {
        Map<String, Schema.SObjectField> fields = d.fields.getMap();

        List<String> cols = new List<String>{ 'Id', 'Name' };
        for (String c : new List<String>{ 'StageName', 'Amount', 'CloseDate', 'Status', 'Subject', 'Industry', 'Email', 'Phone' }) {
            if (fields.containsKey(c)) {
                cols.add(c);
            }
        }

        List<String> whereParts = new List<String>();
        // "My ..." views filter to the running user's records.
        if ((isMyViewName(req.viewName) || isMyViewName(resolvedViewName))
                && fields.containsKey('OwnerId')) {
            whereParts.add('OwnerId = \'' + UserInfo.getUserId() + '\'');
        }
        if (req.openOnly == true) {
            if (fields.containsKey('IsClosed')) {
                whereParts.add('IsClosed = false');
            } else if (fields.containsKey('Status')) {
                whereParts.add('Status != \'Completed\'');
            }
        }
        if (!String.isBlank(req.stage) && fields.containsKey('StageName')) {
            whereParts.add('StageName = \'' + String.escapeSingleQuotes(req.stage.trim()) + '\'');
        }
        if (req.minAmount != null && fields.containsKey('Amount')) {
            whereParts.add('Amount >= ' + req.minAmount);
        }
        if (req.maxAmount != null && fields.containsKey('Amount')) {
            whereParts.add('Amount <= ' + req.maxAmount);
        }
        if (!String.isBlank(req.query)) {
            whereParts.add('Name LIKE \'%' + String.escapeSingleQuotes(req.query.trim()) + '%\'');
        }

        String orderBy = 'CreatedDate DESC';
        if (!String.isBlank(req.sortBy) && fields.containsKey(req.sortBy.trim())) {
            orderBy = req.sortBy.trim() + ('desc'.equalsIgnoreCase(req.sortDir) ? ' DESC' : ' ASC');
        } else if (fields.containsKey('Amount') && req.query == null) {
            orderBy = 'Amount DESC';
        }

        String soql = 'SELECT ' + String.join(cols, ', ') + ' FROM ' + objectName;
        if (!whereParts.isEmpty()) {
            soql += ' WHERE ' + String.join(whereParts, ' AND ');
        }
        soql += ' WITH USER_MODE ORDER BY ' + orderBy + ' LIMIT :lim';
        List<SObject> rows = Database.query(soql);
        List<TableColumn> columns = new List<TableColumn>();
        for (String c : cols) {
            if (c == 'Id') continue;
            TableColumn tc = new TableColumn();
            tc.apiName = c;
            tc.label = fields.containsKey(c) ? fields.get(c).getDescribe().getLabel() : c;
            columns.add(tc);
        }

        ListViewResponse res = new ListViewResponse();
        res.objectName = objectName;
        res.usedRealView = false;
        res.columns = columns;
        res.rows = new List<ViewRow>();
        for (SObject r : rows) {
            ViewRow row = new ViewRow();
            row.recordId = (String) r.get('Id');
            row.name = String.valueOf(r.get('Name'));
            row.detail = detailFor(d, r);
            row.recordUrl = URL.getOrgDomainUrl().toExternalForm() + '/' + row.recordId;
            row.cells = new List<String>();
            for (TableColumn tc : columns) {
                Object v = r.get(tc.apiName);
                row.cells.add(v == null ? '' : formatCell(v));
            }
            res.rows.add(row);
        }
        res.count = res.rows.size();
        res.summary = res.count + ' ' + d.getLabelPlural();
        return res;
    }

    private static String formatCell(Object v) {
        if (v instanceof Decimal) {
            return '$' + ((Decimal) v).format();
        }
        if (v instanceof Date) {
            return ((Date) v).format();
        }
        if (v instanceof Datetime) {
            return ((Datetime) v).format('M/d/yyyy');
        }
        return String.valueOf(v);
    }

    private static String detailFor(Schema.DescribeSObjectResult d, SObject r) {
        List<String> parts = new List<String>();
        Map<String, Schema.SObjectField> fields = d.fields.getMap();
        for (String f : new List<String>{ 'StageName', 'Status', 'Subject', 'Industry' }) {
            if (fields.containsKey(f) && r.get(f) != null) {
                parts.add(String.valueOf(r.get(f)));
            }
        }
        if (fields.containsKey('Amount') && r.get('Amount') != null) {
            parts.add('$' + ((Decimal) r.get('Amount')).format());
        }
        return String.join(parts, ' · ');
    }

    // ── Invocable types ───────────────────────────────────────────────

    global class ListViewRequest {
        @InvocableVariable(label='Object API Name' description='Object API name; defaults to Opportunity.')
        public String objectName;

        @InvocableVariable(label='View Name' description='Salesforce list view name as the user said it, e.g. "my opportunities". Resolves fuzzily against real list views.')
        public String viewName;

        @InvocableVariable(label='Query' description='Free-text filter on record names. Refines the view when one is resolved.')
        public String query;

        @InvocableVariable(label='Stage' description='Filter to a StageName value. Refines the view when one is resolved.')
        public String stage;

        @InvocableVariable(label='Open Only' description='Exclude closed/won/lost records. Refines the view when one is resolved.')
        public Boolean openOnly;

        @InvocableVariable(label='Min Amount' description='Refines the view when one is resolved.')
        public Decimal minAmount;

        @InvocableVariable(label='Max Amount' description='Refines the view when one is resolved.')
        public Decimal maxAmount;

        @InvocableVariable(label='Sort By' description='Field API name to sort by. Used when no real view is resolved.')
        public String sortBy;

        @InvocableVariable(label='Sort Direction' description='asc or desc. Used when no real view is resolved.')
        public String sortDir;

        @InvocableVariable(label='Limit' description='Max rows; defaults to 10, capped at 25.')
        public Integer maxRows;

        @InvocableVariable(label='Save View As' description='Save these filters as a Cardstack view under this name, e.g. "Q4 pipeline". Recall it later via View Name.')
        public String saveViewAs;
    }

    global class ListViewResponse {
        @InvocableVariable(label='Object API Name')
        public String objectName;

        @InvocableVariable(label='View Name' description='Resolved real list view name, or the requested name.')
        public String viewName;

        @InvocableVariable(label='View ID' description='Salesforce ID of the resolved list view, when a real view was used.')
        public String viewId;

        @InvocableVariable(label='Used Real View' description='True when the real Salesforce list view was executed.')
        public Boolean usedRealView;

        @InvocableVariable(label='Fallback Note' description='Explains why the filter-based fallback was used, when applicable.')
        public String fallbackNote;

        @InvocableVariable(label='Columns' description='Table columns: label + field API name, from the real view or the filter query.')
        public List<TableColumn> columns;



        @InvocableVariable(label='Rows')
        public List<ViewRow> rows;

        @InvocableVariable(label='Count')
        public Integer count;

        @InvocableVariable(label='Summary')
        public String summary;
    }

    global class TableColumn {
        @InvocableVariable public String label;
        @InvocableVariable public String apiName;
    }

    global class ViewRow {
        @InvocableVariable public String recordId;
        @InvocableVariable public String name;
        @InvocableVariable public String detail;
        @InvocableVariable public String recordUrl;
        @InvocableVariable public List<String> cells;
    }

    public class CardstackException extends Exception {}
}
