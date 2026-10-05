/**
 * Cardstack DML error helper.
 *
 * Converts a DmlException into structured, card-renderable error details.
 * Platform enforcement is never bypassed — this only makes failures legible:
 * which rule fired, on which field, and (for duplicates) which records look
 * like matches.
 *
 * Security: `with sharing`; candidate lookups use WITH_USER_MODE.
 */
global with sharing class CardstackDmlError {

    /**
     * Parse a DmlException into structured error details.
     * Never throws — returns at least one UNKNOWN entry on parse failure.
     * Note: synthetically constructed DmlExceptions (new DmlException(msg))
     * throw UnexpectedException on getNumDml(); handled below.
     */
    global static List<DmlErrorDetail> parse(DmlException e, String objectName) {
        List<DmlErrorDetail> out = new List<DmlErrorDetail>();
        Boolean parsed = false;
        try {
            Integer n = 0;
            try {
                n = e.getNumDml();
            } catch (Exception ex) {
                n = 0;
            }
            for (Integer i = 0; i < n; i++) {
                DmlErrorDetail d = new DmlErrorDetail();
                System.StatusCode code = null;
                try { code = e.getDmlType(i); } catch (Exception ex) {}
                String msg = null;
                try { msg = e.getDmlMessage(i); } catch (Exception ex) {}
                d.errorType = classify(code, msg);
                List<String> fns = new List<String>();
                try { fns = e.getDmlFieldNames(i); } catch (Exception ex) {}
                d.fieldApi = fns.isEmpty() ? null : String.join(fns, ', ');
                d.fieldLabel = resolveFieldLabel(objectName, fns);
                d.message = cleanMessage(msg);
                out.add(d);
            }
            parsed = !out.isEmpty();
        } catch (Exception ex) {
            parsed = false;
        }
        if (!parsed) {
            DmlErrorDetail d = new DmlErrorDetail();
            String rawMsg = null;
            try {
                rawMsg = e.getMessage();
            } catch (Exception ex) {
                rawMsg = null;
            }
            d.errorType = classify(null, rawMsg);
            d.message = cleanMessage(rawMsg);
            out.add(d);
        }
        return out;
    }

    /**
     * True when any parsed error is a duplicate-rule violation.
     */
    global static Boolean hasDuplicate(List<DmlErrorDetail> errors) {
        for (DmlErrorDetail d : errors) {
            if (d.errorType == 'DUPLICATE') {
                return true;
            }
        }
        return false;
    }

    /**
     * Best-effort duplicate candidates: records of the same object whose Name
     * matches the attempted record's Name (when a Name was supplied).
     * Labelled as *possible* duplicates — the rule's own match criteria are
     * not exposed by the platform, so this is a helpful heuristic, not a
     * definitive match.
     */
    global static List<DuplicateCandidate> findCandidates(
        String objectName, Map<String, Object> attemptedValues
    ) {
        List<DuplicateCandidate> out = new List<DuplicateCandidate>();
        try {
            Object nameVal = attemptedValues.get('Name');
            if (nameVal == null || String.isBlank(String.valueOf(nameVal))) {
                return out;
            }
            String likeName = '%' + String.escapeSingleQuotes(String.valueOf(nameVal).trim()) + '%';
            // WITH_USER_MODE: only candidates the user can see.
            List<SObject> rows = Database.query(
                'SELECT Id, Name FROM ' + objectName
                + ' WHERE Name LIKE :likeName WITH USER_MODE LIMIT 3'
            );
            String base = URL.getOrgDomainUrl().toExternalForm();
            for (SObject r : rows) {
                DuplicateCandidate c = new DuplicateCandidate();
                c.recordId = (String) r.get('Id');
                c.recordName = (String) r.get('Name');
                c.recordUrl = base + '/' + c.recordId;
                out.add(c);
            }
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN,
                'Cardstack duplicate candidate lookup failed: ' + e.getMessage());
        }
        return out;
    }

    // ---- internals ----

    private static String classify(System.StatusCode code, String message) {
        if (code == System.StatusCode.DUPLICATES_DETECTED) {
            return 'DUPLICATE';
        }
        if (code == System.StatusCode.FIELD_CUSTOM_VALIDATION_EXCEPTION) {
            return 'VALIDATION';
        }
        if (code == System.StatusCode.REQUIRED_FIELD_MISSING) {
            return 'REQUIRED';
        }
        if (code == System.StatusCode.STRING_TOO_LONG) {
            return 'VALIDATION';
        }
        String m = message == null ? '' : message.toLowerCase();
        if (m.contains('duplicate')) {
            return 'DUPLICATE';
        }
        if (m.contains('validation')) {
            return 'VALIDATION';
        }
        if (m.contains('required')) {
            return 'REQUIRED';
        }
        return code == null ? 'UNKNOWN' : String.valueOf(code);
    }

    private static String resolveFieldLabel(String objectName, List<String> fieldApis) {
        if (fieldApis == null || fieldApis.isEmpty() || String.isBlank(objectName)) {
            return null;
        }
        try {
            Map<String, Schema.SObjectField> fm = Schema.getGlobalDescribe()
                .get(objectName).getDescribe().fields.getMap();
            List<String> labels = new List<String>();
            for (String f : fieldApis) {
                if (fm.containsKey(f)) {
                    labels.add(fm.get(f).getDescribe().getLabel());
                } else {
                    labels.add(f);
                }
            }
            return String.join(labels, ', ');
        } catch (Exception e) {
            return String.join(fieldApis, ', ');
        }
    }

    /**
     * Strip DML boilerplate: "Update failed. First exception on row 0 with id
     * xxx; first error: FIELD_CUSTOM_VALIDATION_EXCEPTION, <rule text>: []"
     * becomes "<rule text>".
     */
    private static String cleanMessage(String raw) {
        if (String.isBlank(raw)) {
            return 'Save failed.';
        }
        String m = raw.trim();
        // Drop "first error: CODE, " prefix when present.
        Integer idx = m.indexOf('first error:');
        if (idx >= 0) {
            m = m.substring(idx + 'first error:'.length()).trim();
            Integer comma = m.indexOf(',');
            if (comma > 0 && comma < 60) {
                // Heuristic: leading ALL_CAPS token is the status code.
                String head = m.substring(0, comma).trim();
                if (head == head.toUpperCase() && head.contains('_')) {
                    m = m.substring(comma + 1).trim();
                }
            }
        }
        // Drop trailing ": []" field-list noise.
        if (m.endsWith(': []')) {
            m = m.substring(0, m.length() - 4).trim();
        }
        return m;
    }

    global class DmlErrorDetail {
        @InvocableVariable public String fieldApi;
        @InvocableVariable public String fieldLabel;
        @InvocableVariable public String message;
        @InvocableVariable public String errorType;
    }

    global class DuplicateCandidate {
        @InvocableVariable public String recordId;
        @InvocableVariable public String recordName;
        @InvocableVariable public String recordUrl;
    }
}
