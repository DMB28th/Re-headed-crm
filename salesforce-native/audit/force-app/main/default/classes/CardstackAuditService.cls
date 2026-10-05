/**
 * CardstackAuditService
 *
 * Native audit log for Cardstack MCP tool invocations and Studio admin actions.
 * Replaces the file-backed audit log from the Node.js Studio. Writes to
 * Cardstack_Audit_Log__c; failures to write audit rows never break the caller.
 */
public with sharing class CardstackAuditService {

    public class AuditException extends Exception {}

    /**
     * Appends one audit row. Never throws for permission problems — audit
     * must not break the tool it observes; failures are swallowed.
     */
    public static void logAction(String action, String toolName, String recordId, String details) {
        if (String.isBlank(action)) {
            return;
        }
        try {
            if (!Schema.sObjectType.Cardstack_Audit_Log__c.isCreateable()) {
                return;
            }
            Cardstack_Audit_Log__c row = new Cardstack_Audit_Log__c(
                Action__c = action.left(100),
                Tool_Name__c = toolName == null ? null : toolName.left(255),
                User__c = UserInfo.getUserId(),
                Record_Id__c = recordId == null ? null : recordId.left(18),
                Details__c = details,
                Timestamp__c = System.now()
            );
            SObjectAccessDecision decision = Security.stripInaccessible(
                AccessType.CREATABLE,
                new List<Cardstack_Audit_Log__c>{ row }
            );
            insert decision.getRecords();
        } catch (Exception e) {
            // Audit is best-effort; never break the caller.
            System.debug(LoggingLevel.WARN, 'Cardstack audit write failed: ' + e.getMessage());
        }
    }

    /**
     * Searches the audit trail. All filters optional; newest first.
     * Date range filters on Timestamp__c (inclusive). User filter matches User__c.
     */
    public static List<Cardstack_Audit_Log__c> searchLogs(
        String searchTerm, String toolName, Integer limitSize,
        Date fromDate, Date toDate, String userId
    ) {
        if (!Schema.sObjectType.Cardstack_Audit_Log__c.isAccessible()) {
            throw new AuditException('Insufficient access to the audit log.');
        }
        Integer lim = (limitSize == null || limitSize < 1 || limitSize > 500)
            ? 100 : limitSize;
        String term = String.isBlank(searchTerm) ? null : '%' + String.escapeSingleQuotes(searchTerm) + '%';
        String tool = String.isBlank(toolName) ? null : toolName;
        String uid = String.isBlank(userId) ? null : userId;

        // Build dynamic query to handle optional filters cleanly.
        // Note: Details__c is a Long Text Area and cannot be filtered in SOQL.
        String q = 'SELECT Id, Name, Action__c, Tool_Name__c, User__c, User__r.Name, '
            + 'Record_Id__c, Details__c, Timestamp__c '
            + 'FROM Cardstack_Audit_Log__c';
        List<String> wheres = new List<String>();
        if (term != null) {
            wheres.add('(Action__c LIKE :term OR Record_Id__c LIKE :term)');
        }
        if (tool != null) {
            wheres.add('Tool_Name__c = :tool');
        }
        if (uid != null) {
            wheres.add('User__c = :uid');
        }
        if (fromDate != null) {
            Datetime fromDt = Datetime.newInstance(fromDate, Time.newInstance(0, 0, 0, 0));
            wheres.add('Timestamp__c >= :fromDt');
        }
        if (toDate != null) {
            Datetime toDt = Datetime.newInstance(toDate, Time.newInstance(23, 59, 59, 999));
            wheres.add('Timestamp__c <= :toDt');
        }
        if (!wheres.isEmpty()) {
            q += ' WHERE ' + String.join(wheres, ' AND ');
        }
        q += ' WITH USER_MODE ORDER BY Timestamp__c DESC LIMIT :lim';
        return Database.query(q);
    }

    /**
     * Backwards-compatible overload.
     */
    public static List<Cardstack_Audit_Log__c> searchLogs(
        String searchTerm, String toolName, Integer limitSize
    ) {
        return searchLogs(searchTerm, toolName, limitSize, null, null, null);
    }

    /**
     * Distinct users present in the log, for filter picklists.
     * Returns user Id + Name pairs.
     */
    public static List<Map<String, String>> listUsers() {
        if (!Schema.sObjectType.Cardstack_Audit_Log__c.isAccessible()) {
            throw new AuditException('Insufficient access to the audit log.');
        }
        List<AggregateResult> agg = [
            SELECT User__c u, User__r.Name n
            FROM Cardstack_Audit_Log__c
            WITH USER_MODE
            GROUP BY User__c, User__r.Name
            ORDER BY User__r.Name ASC
            LIMIT 100
        ];
        List<Map<String, String>> users = new List<Map<String, String>>();
        for (AggregateResult r : agg) {
            String uid = (String) r.get('u');
            String name = (String) r.get('n');
            if (uid != null) {
                users.add(new Map<String, String>{
                    'id' => uid,
                    'name' => String.isBlank(name) ? uid : name
                });
            }
        }
        return users;
    }

    /**
     * Distinct tool names present in the log, for filter picklists.
     */
    public static List<String> listTools() {
        if (!Schema.sObjectType.Cardstack_Audit_Log__c.isAccessible()) {
            throw new AuditException('Insufficient access to the audit log.');
        }
        List<AggregateResult> agg = [
            SELECT Tool_Name__c t
            FROM Cardstack_Audit_Log__c
            WITH USER_MODE
            GROUP BY Tool_Name__c
            ORDER BY Tool_Name__c ASC
            LIMIT 100
        ];
        List<String> tools = new List<String>();
        for (AggregateResult r : agg) {
            String t = (String) r.get('t');
            if (t != null) {
                tools.add(t);
            }
        }
        return tools;
    }
}
