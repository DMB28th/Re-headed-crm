/**
 * Cardstack native port of `crm_get_record`.
 *
 * Renders the record card for a single CRM record. Pass id when known,
 * otherwise a name query to resolve. Returns the record's key fields as a
 * purpose-built shape for the card widget.
 *
 * Security: `with sharing` + WITH_USER_MODE on all SOQL.
 */
global with sharing class CardstackGetRecordAction {

    private static final Integer NAME_SEARCH_LIMIT = 3;

    @InvocableMethod(
        label='Cardstack Get Record'
        description='Show a CRM record card for a single record. Pass id when known, otherwise a name query. Use exactly one input per call so its interactive card renders. For several records call this tool separately for each. Use when the user asks to show, see, or look up a specific record.'
    )
    global static List<GetRecordResponse> getRecord(List<GetRecordRequest> requests) {
        if (requests == null || requests.size()!=1) {
            throw new CardstackException('Record cards require exactly one input per call. Call this tool separately for each record.');
        }
        List<GetRecordResponse> responses = new List<GetRecordResponse>();
        for (GetRecordRequest req : requests) {
            responses.add(doGetRecord(req));
        }
        return responses;
    }

    private static GetRecordResponse doGetRecord(GetRecordRequest req) {
        String objectName = String.isBlank(req.objectName) ? 'Account' : req.objectName.trim();
        Schema.SObjectType t = Schema.getGlobalDescribe().get(objectName);
        if (t == null) {
            throw new CardstackException('Unknown object: ' + objectName);
        }
        if (!t.getDescribe().isAccessible()) {
            throw new CardstackException('Object not accessible: ' + objectName);
        }

        String recordId = req.recordId;
        String disambiguation = '';
        if (String.isBlank(recordId)) {
            if (String.isBlank(req.query)) {
                throw new CardstackException('Provide recordId or query.');
            }
            List<SObject> matches = searchByName(objectName, req.query.trim());
            if (matches.isEmpty()) {
                throw new CardstackException(
                    'No ' + objectName + ' record matches "' + req.query + '".');
            }
            recordId = (String) matches[0].get('Id');
            if (matches.size() > 1) {
                List<String> others = new List<String>();
                for (Integer i = 1; i < matches.size(); i++) {
                    others.add(String.valueOf(matches[i].get('Name')));
                }
                disambiguation = ' (' + matches.size() + ' matched; showing '
                    + matches[0].get('Name') + ' — others: ' + String.join(others, ', ') + ')';
            }
        }

        SObject rec;
        // Load the Studio layout (live) for this object, if the admin configured one.
        Map<String, Object> layoutCfg = loadLayoutConfig(objectName);

        GetRecordResponse res = new GetRecordResponse();
        res.objectName = objectName;
        res.recordId = recordId;

        if (layoutCfg != null) {
            // Layout-driven card: query exactly the configured fields.
            rec = fetchRecord(objectName, recordId, collectLayoutApis(layoutCfg));
            if (rec == null) {
                throw new CardstackException('Record not found: ' + recordId);
            }
            res.recordName = String.valueOf(rec.get('Name'));
            applyLayout(res, objectName, rec, layoutCfg);
        } else {
            rec = fetchRecord(objectName, recordId);
            if (rec == null) {
                throw new CardstackException('Record not found: ' + recordId);
            }
            res.recordName = String.valueOf(rec.get('Name'));
            res.fields = recordFieldsToRows(objectName, rec);
            res.hasHighlights = false;
            res.hasSections = false;
            res.showFlatFields = true;
        }
        res.recordUrl = URL.getOrgDomainUrl().toExternalForm() + '/' + recordId;
        res.summary = res.recordName + disambiguation;
        return res;
    }

    private static List<SObject> searchByName(String objectName, String query) {
        String likeTerm = '%' + query + '%';
        Integer lim = NAME_SEARCH_LIMIT;
        return Database.query(
            'SELECT Id, Name FROM ' + objectName
            + ' WHERE Name LIKE :likeTerm WITH USER_MODE ORDER BY Name LIMIT :lim'
        );
    }

    private static SObject fetchRecord(String objectName, String recordId) {
        return fetchRecord(objectName, recordId, null);
    }

    private static SObject fetchRecord(String objectName, String recordId, Set<String> extraFields) {
        Schema.DescribeSObjectResult d =
            Schema.getGlobalDescribe().get(objectName).getDescribe();
        Map<String, Schema.SObjectField> fieldMap = d.fields.getMap();
        // Case-insensitive lookup: api -> real API name.
        Map<String, String> apiLookup = new Map<String, String>();
        for (String k : fieldMap.keySet()) {
            apiLookup.put(k.toLowerCase(), fieldMap.get(k).getDescribe().getName());
        }
        List<String> fieldNames = new List<String>{ 'Id', 'Name' };
        for (String candidate : new List<String>{
            'Industry', 'Type', 'StageName', 'Amount', 'CloseDate',
            'Email', 'Phone', 'Title', 'Status', 'Subject', 'Description',
            'OwnerId', 'CreatedDate', 'LastModifiedDate'
        }) {
            if (d.fields.getMap().containsKey(candidate)) {
                fieldNames.add(candidate);
            }
        }
        Set<String> selectedApis = new Set<String>();
        for (String fieldName : fieldNames) selectedApis.add(fieldName.toLowerCase());
        if (extraFields != null) {
            for (String api : extraFields) {
                if (String.isBlank(api)) continue;
                String real = apiLookup.get(api.toLowerCase());
                // Only add real, readable fields — never inject raw config text into SOQL.
                if (real != null && !selectedApis.contains(real.toLowerCase())
                        && fieldMap.get(real).getDescribe().isAccessible()) {
                    fieldNames.add(real);
                    selectedApis.add(real.toLowerCase());
                }
            }
        }
        String soql = 'SELECT ' + String.join(fieldNames, ', ') + ' FROM ' + objectName
            + ' WHERE Id = :recordId WITH USER_MODE LIMIT 1';
        List<SObject> rows = Database.query(soql);
        return rows.isEmpty() ? null : rows[0];
    }

    // ---------- Studio layout support ----------

    private static final String LAYOUT_KEY_PREFIX = 'layout:';

    /**
     * Load the published Studio layout for this object (key layout:{Object}:default).
     * Returns the parsed config map, or null when none is configured / readable.
     */
    private static Map<String, Object> loadLayoutConfig(String objectName) {
        String key = LAYOUT_KEY_PREFIX + objectName + ':default';
        try {
            if (!Schema.sObjectType.Cardstack_Config__c.isAccessible()) return null;
            List<Cardstack_Config__c> rows = [
                SELECT Value__c FROM Cardstack_Config__c
                WHERE Name = :key AND Is_Active__c = true
                WITH USER_MODE LIMIT 1
            ];
            if (rows.isEmpty() || String.isBlank(rows[0].Value__c)) return null;
            Map<String, Object> cfg =
                (Map<String, Object>) JSON.deserializeUntyped(rows[0].Value__c);
            return hasLayoutContent(cfg) ? cfg : null;
        } catch (Exception e) {
            return null;
        }
    }

    private static Boolean hasLayoutContent(Map<String, Object> cfg) {
        if (cfg == null) return false;
        if (isNonEmptyList(cfg.get('sections'))) return true;
        if (isNonEmptyList(cfg.get('highlights'))) return true;
        if (isNonEmptyList(cfg.get('fields'))) return true;
        Object rc = cfg.get('recordCard');
        if (rc instanceof Map<String, Object>
                && isNonEmptyList(((Map<String, Object>) rc).get('sections'))) {
            return true;
        }
        return false;
    }

    private static Boolean isNonEmptyList(Object o) {
        return o instanceof List<Object> && !((List<Object>) o).isEmpty();
    }

    /** Union of every field API referenced by the layout config. */
    private static Set<String> collectLayoutApis(Map<String, Object> cfg) {
        Set<String> apis = new Set<String>();
        if (isNonEmptyList(cfg.get('highlights'))) {
            for (Object ho : (List<Object>) cfg.get('highlights')) {
                String api = fieldApiOf((Map<String, Object>) ho);
                if (!String.isBlank(api)) apis.add(api);
            }
        }
        if (isNonEmptyList(cfg.get('sections'))) {
            for (Object so : (List<Object>) cfg.get('sections')) {
                for (Object fo : sectionFieldsOf((Map<String, Object>) so)) {
                    String api = fieldApiOf((Map<String, Object>) fo);
                    if (!String.isBlank(api)) apis.add(api);
                }
            }
        }
        if (isNonEmptyList(cfg.get('fields'))) {
            for (Object fo : (List<Object>) cfg.get('fields')) {
                String api = fieldApiOf((Map<String, Object>) fo);
                if (!String.isBlank(api)) apis.add(api);
            }
        }
        Object rc = cfg.get('recordCard');
        if (rc instanceof Map<String, Object>
                && isNonEmptyList(((Map<String, Object>) rc).get('sections'))) {
            for (Object so : (List<Object>) ((Map<String, Object>) rc).get('sections')) {
                for (Object fo : sectionFieldsOf((Map<String, Object>) so)) {
                    String api = fieldApiOf((Map<String, Object>) fo);
                    if (!String.isBlank(api)) apis.add(api);
                }
            }
        }
        return apis;
    }

    private static String fieldApiOf(Map<String, Object> fm) {
        if (fm == null) return null;
        Object api = fm.get('api');
        if (api == null) api = fm.get('name');
        return api == null ? null : String.valueOf(api);
    }

    private static List<Object> sectionFieldsOf(Map<String, Object> sm) {
        if (sm == null) return new List<Object>();
        Object f = sm.get('fields');
        return f instanceof List<Object> ? (List<Object>) f : new List<Object>();
    }

    /**
     * Populate highlights/sections (new shape) or flat fields (old shape)
     * from the Studio layout. Also returns the configured fields in flat order
     * for legacy flat-field clients. Always sets the widget flags.
     */
    private static void applyLayout(GetRecordResponse res, String objectName,
            SObject rec, Map<String, Object> cfg) {
        Schema.DescribeSObjectResult d =
            Schema.getGlobalDescribe().get(objectName).getDescribe();
        Map<String, Schema.SObjectField> fieldMap = d.fields.getMap();
        Map<String, String> apiLookup = new Map<String, String>();
        for (String k : fieldMap.keySet()) {
            apiLookup.put(k.toLowerCase(), fieldMap.get(k).getDescribe().getName());
        }

        res.highlights = new List<FieldRow>();
        res.sections = new List<LayoutSection>();
        res.fields = new List<FieldRow>();

        Boolean newShape = isNonEmptyList(cfg.get('sections'))
            || isNonEmptyList(cfg.get('highlights'));
        if (newShape) {
            if (isNonEmptyList(cfg.get('highlights'))) {
                Integer n = 0;
                for (Object ho : (List<Object>) cfg.get('highlights')) {
                    if (n >= 7) break;
                    FieldRow r = toLayoutRow(apiLookup, fieldMap, rec,
                        (Map<String, Object>) ho);
                    if (r != null) { res.highlights.add(r); res.fields.add(r); n++; }
                }
            }
            if (isNonEmptyList(cfg.get('sections'))) {
                for (Object so : (List<Object>) cfg.get('sections')) {
                    Map<String, Object> sm = (Map<String, Object>) so;
                    LayoutSection sec = new LayoutSection();
                    sec.label = sm.get('label') == null ? '' : String.valueOf(sm.get('label'));
                    sec.fields = new List<FieldRow>();
                    initSectionColumns(sec, sm);
                    for (Object fo : sectionFieldsOf(sm)) {
                        FieldRow r = toLayoutRow(apiLookup, fieldMap, rec,
                            (Map<String, Object>) fo);
                        if (r != null) { addSectionField(sec, r, (Map<String, Object>) fo, sm); res.fields.add(r); }
                    }
                    res.sections.add(sec);
                }
            }
            res.hasHighlights = !res.highlights.isEmpty();
            res.hasSections = !res.sections.isEmpty();
            res.showFlatFields = false;
            return;
        }

        // Old flat Studio shape {fields:[...]} — render as a flat field list.
        if (isNonEmptyList(cfg.get('fields'))) {
            for (Object fo : (List<Object>) cfg.get('fields')) {
                FieldRow r = toLayoutRow(apiLookup, fieldMap, rec,
                    (Map<String, Object>) fo);
                if (r != null) res.fields.add(r);
            }
            res.hasHighlights = false;
            res.hasSections = false;
            res.showFlatFields = true;
            return;
        }

        // Legacy recordCard.sections shape.
        Object rc = cfg.get('recordCard');
        if (rc instanceof Map<String, Object>
                && isNonEmptyList(((Map<String, Object>) rc).get('sections'))) {
            for (Object so : (List<Object>) ((Map<String, Object>) rc).get('sections')) {
                Map<String, Object> sm = (Map<String, Object>) so;
                LayoutSection sec = new LayoutSection();
                Object lbl = sm.get('label');
                if (lbl == null) lbl = sm.get('title');
                sec.label = lbl == null ? '' : String.valueOf(lbl);
                sec.fields = new List<FieldRow>();
                initSectionColumns(sec, sm);
                for (Object fo : sectionFieldsOf(sm)) {
                    FieldRow r = toLayoutRow(apiLookup, fieldMap, rec,
                        (Map<String, Object>) fo);
                    if (r != null) { addSectionField(sec, r, (Map<String, Object>) fo, sm); res.fields.add(r); }
                }
                res.sections.add(sec);
            }
        }
        res.hasHighlights = !res.highlights.isEmpty();
        res.hasSections = !res.sections.isEmpty();
        res.showFlatFields = !res.hasSections;
    }

    private static void initSectionColumns(LayoutSection section, Map<String, Object> config) {
        section.fullFields = new List<FieldRow>();
        section.leftFields = new List<FieldRow>();
        section.rightFields = new List<FieldRow>();
        section.centerFields = new List<FieldRow>();
        section.usesThreeColumns = String.valueOf(config.get('columns')) == '3';
        section.usesColumns = false;
    }

    private static void addSectionField(LayoutSection section, FieldRow field, Map<String, Object> config, Map<String, Object> sectionConfig) {
        section.fields.add(field);
        String column = config.get('column') == null ? 'full' : String.valueOf(config.get('column'));
        String count = String.valueOf(sectionConfig.get('columns'));
        if (count == '1') column = 'full';
        if (count == '2' && column == 'center') column = 'right';
        if (column == 'center') {
            section.centerFields.add(field);
            section.usesColumns = true;
            section.usesThreeColumns = true;
        } else if (column == 'left') {
            section.leftFields.add(field);
            section.usesColumns = true;
        } else if (column == 'right') {
            section.rightFields.add(field);
            section.usesColumns = true;
        } else {
            section.fullFields.add(field);
        }
    }

    /** Build one FieldRow from a layout field ref; null when unknown/inaccessible/empty. */
    private static FieldRow toLayoutRow(Map<String, String> apiLookup,
            Map<String, Schema.SObjectField> fieldMap, SObject rec,
            Map<String, Object> fm) {
        String api = fieldApiOf(fm);
        if (String.isBlank(api)) return null;
        String real = apiLookup.get(api.toLowerCase());
        if (real == null) return null;
        FieldRow r = new FieldRow();
        r.fieldApi = real;
        Object labelOverride = fm.get('label');
        try {
            r.label = labelOverride != null && !String.isBlank(String.valueOf(labelOverride))
                ? String.valueOf(labelOverride)
                : fieldMap.get(real).getDescribe().getLabel();
        } catch (Exception e) {
            r.label = real;
        }
        try {
            Object val = rec.get(real);
            if (val == null || String.isBlank(String.valueOf(val))) return null;
            r.value = formatValue(val, fieldMap.get(real).getDescribe().getType());
        } catch (Exception e) {
            return null;
        }
        return r;
    }

    private static List<FieldRow> recordFieldsToRows(String objectName, SObject rec) {
        List<FieldRow> rows = new List<FieldRow>();
        Schema.DescribeSObjectResult d =
            Schema.getGlobalDescribe().get(objectName).getDescribe();
        Map<String, Schema.SObjectField> fieldMap = d.fields.getMap();
        for (String fieldName : new List<String>{
            'Industry', 'Type', 'StageName', 'Amount', 'CloseDate',
            'Email', 'Phone', 'Title', 'Status', 'Subject', 'Description'
        }) {
            if (!fieldMap.containsKey(fieldName)) {
                continue;
            }
            Object val = rec.get(fieldName);
            if (val == null) {
                continue;
            }
            FieldRow r = new FieldRow();
            r.fieldApi = fieldName;
            r.label = fieldMap.get(fieldName).getDescribe().getLabel();
            r.value = formatValue(val, fieldMap.get(fieldName).getDescribe().getType());
            rows.add(r);
        }
        return rows;
    }

    private static String formatValue(Object val, Schema.DisplayType fieldType) {
        if (val instanceof Decimal) {
            return (fieldType == Schema.DisplayType.Currency ? '$' : '') + ((Decimal) val).format();
        }
        if (val instanceof Date) {
            return ((Date) val).format();
        }
        if (val instanceof Datetime) {
            return ((Datetime) val).format('MMM d, yyyy');
        }
        return String.valueOf(val);
    }

    global class GetRecordRequest {
        @InvocableVariable(label='Object API Name' description='Object API name; defaults to Account.')
        public String objectName;

        @InvocableVariable(label='Record ID' description='Record id, when known.')
        public String recordId;

        @InvocableVariable(label='Name Query' description='Name text to resolve when id is unknown.')
        public String query;
    }

    global class GetRecordResponse {
        @InvocableVariable(label='Object API Name')
        public String objectName;

        @InvocableVariable(label='Record ID')
        public String recordId;

        @InvocableVariable(label='Record Name')
        public String recordName;

        @InvocableVariable(label='Fields')
        public List<FieldRow> fields;

        @InvocableVariable(label='Highlight Fields' description='Compact key fields from the Studio Highlights Panel.')
        public List<FieldRow> highlights;

        @InvocableVariable(label='Sections' description='Studio layout sections with their fields.')
        public List<LayoutSection> sections;

        @InvocableVariable(label='Has Highlights')
        public Boolean hasHighlights;

        @InvocableVariable(label='Has Sections')
        public Boolean hasSections;

        @InvocableVariable(label='Show Flat Fields' description='Render the flat fields list (no sections).')
        public Boolean showFlatFields;

        @InvocableVariable(label='Record URL')
        public String recordUrl;

        @InvocableVariable(label='Summary')
        public String summary;
    }

    global class LayoutSection {
        @InvocableVariable public String label;
        @InvocableVariable public List<FieldRow> fields;
        @InvocableVariable public List<FieldRow> fullFields;
        @InvocableVariable public List<FieldRow> leftFields;
        @InvocableVariable public List<FieldRow> rightFields;
        @InvocableVariable public List<FieldRow> centerFields;
        @InvocableVariable public Boolean usesThreeColumns;
        @InvocableVariable public Boolean usesColumns;
    }

    global class FieldRow {
        @InvocableVariable public String fieldApi;
        @InvocableVariable public String label;
        @InvocableVariable public String value;
    }

    public class CardstackException extends Exception {}
}
