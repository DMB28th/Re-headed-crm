/**
 * CardstackStudioController
 *
 * @AuraEnabled entry points for the cardstackStudio LWC app. Thin wrappers
 * over CardstackConfigService / CardstackAuditService plus native org
 * introspection (CRM objects via describe, MCP server definitions, org info)
 * for the Connections tab.
 */
public with sharing class CardstackStudioController {

    // ---------- Config staging ----------

    @AuraEnabled(cacheable=true)
    public static String getConfigValue(String key) {
        return CardstackConfigService.getConfig(key);
    }

    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getStagingInfo(String key) {
        return CardstackConfigService.getStagingInfo(key);
    }

    // Flow editing needs a fresh snapshot after staging/publishing; do not cache this response.
    @AuraEnabled
    public static Map<String, Object> getFlowLaunchCards() {
        return CardstackConfigService.getStagingInfo('flows');
    }

    @AuraEnabled
    public static String saveDraft(String key, String value) {
        validateJson(value);
        return String.valueOf(CardstackConfigService.saveDraft(key, value));
    }

    @AuraEnabled
    public static void publishDraft(String draftId) {
        CardstackConfigService.publishDraft((Id) draftId);
    }

    @AuraEnabled
    public static void rollbackDraft(String draftId) {
        CardstackConfigService.rollbackDraft((Id) draftId);
    }

    @AuraEnabled(cacheable=true)
    public static List<Cardstack_Config_Draft__c> getDrafts(String status) {
        return CardstackConfigService.listDrafts(status);
    }

    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> listConfigKeys() {
        List<Map<String, String>> keys = new List<Map<String, String>>();
        for (Cardstack_Config__c c : CardstackConfigService.listConfigs()) {
            keys.add(new Map<String, String>{
                'key' => c.Name,
                'description' => c.Description__c,
                'active' => String.valueOf(c.Is_Active__c)
            });
        }
        return keys;
    }

    // ---------- Audit ----------

    @AuraEnabled(cacheable=true)
    public static List<Cardstack_Audit_Log__c> searchAudit(
        String term, String tool, Integer limitSize,
        String fromDateStr, String toDateStr, String userId
    ) {
        Date fromDate = parseDate(fromDateStr);
        Date toDate = parseDate(toDateStr);
        return CardstackAuditService.searchLogs(term, tool, limitSize, fromDate, toDate, userId);
    }

    @AuraEnabled(cacheable=true)
    public static List<String> listAuditTools() {
        return CardstackAuditService.listTools();
    }

    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> listAuditUsers() {
        return CardstackAuditService.listUsers();
    }

    @AuraEnabled
    public static void setSetupFlag(String key, Boolean value) {
        if (String.isBlank(key)) {
            return;
        }
        CardstackConfigService.saveDraft(key, value ? 'true' : 'false');
        // Auto-publish setup flags — they're lightweight markers, not content.
        List<Cardstack_Config_Draft__c> drafts = [
            SELECT Id FROM Cardstack_Config_Draft__c
            WHERE Config__r.Name = :key AND Status__c = 'Draft'
            WITH USER_MODE ORDER BY CreatedDate DESC LIMIT 1
        ];
        if (!drafts.isEmpty()) {
            CardstackConfigService.publishDraft(drafts[0].Id);
        }
    }

    private static Date parseDate(String s) {
        if (String.isBlank(s)) {
            return null;
        }
        try {
            return Date.valueOf(s);
        } catch (Exception e) {
            return null;
        }
    }

    // ---------- Org / CRM introspection ----------

    /**
     * Standard + custom CRM objects the admin can configure, via describe.
     * Excludes setup-only objects; includes Account, Contact, Opportunity, etc.
     */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getCrmObjects() {
        List<Map<String, String>> objects = new List<Map<String, String>>();
        Map<String, Schema.SObjectType> gd = Schema.getGlobalDescribe();
        List<String> names = new List<String>(gd.keySet());
        names.sort();
        for (String api : names) {
            if (objects.size() >= 200) {
                break;
            }
            Schema.DescribeSObjectResult d = gd.get(api).getDescribe();
            String properName = d.getName();
            if (!d.isAccessible() || !d.isQueryable() || !d.isCustom() && isSetupObject(properName)) {
                continue;
            }
            // Keep the list focused: custom objects + core CRM objects.
            // Note: gd.keySet() returns lowercase API names, so compare case-insensitively.
            if (!d.isCustom()
                && !CORE_OBJECTS.contains(d.getName())) {
                continue;
            }
            objects.add(new Map<String, String>{
                'api' => d.getName(),
                'label' => d.getLabel(),
                'labelPlural' => d.getLabelPlural()
            });
        }
        return objects;
    }

    private static final Set<String> CORE_OBJECTS = new Set<String>{
        'Account', 'Contact', 'Opportunity', 'Lead', 'Case',
        'Campaign', 'Contract', 'Order', 'Product2', 'Quote',
        'Task', 'Event'
    };

    private static Boolean isSetupObject(String api) {
        return api.endsWith('__mdt') || api.endsWith('__e')
            || api == 'User' || api == 'Group' || api == 'Profile'
            || api == 'PermissionSet' || api.startsWith('Apex')
            || api.startsWith('Async') || api.startsWith('Cron');
    }

    /**
     * Fields of one object for the layout editor's field picker.
     */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getObjectFields(String objectApi) {
        List<Map<String, String>> fields = new List<Map<String, String>>();
        try {
            Schema.SObjectType t = Schema.getGlobalDescribe().get(objectApi);
            if (t == null) {
                return fields;
            }
            Map<String, Schema.SObjectField> fm = t.getDescribe().fields.getMap();
            List<String> names = new List<String>(fm.keySet());
            names.sort();
            for (String api : names) {
                if (fields.size() >= 300) {
                    break;
                }
                Schema.DescribeFieldResult f = fm.get(api).getDescribe();
                if (!f.isAccessible()) {
                    continue;
                }
                fields.add(new Map<String, String>{
                    'api' => f.getName(),
                    'label' => f.getLabel(),
                    'type' => String.valueOf(f.getType())
                });
            }
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'getObjectFields failed: ' + e.getMessage());
        }
        return fields;
    }

    // ---------- Connections ----------

    /**
     * Native connection status: this org IS the CRM, so report org identity.
     * (Hosted MCP server definitions are metadata, not queryable sObjects,
     * so activation state is confirmed in Setup rather than here.)
     */
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getConnectionInfo() {
        Map<String, Object> info = new Map<String, Object>();
        Organization org = [
            SELECT Id, Name, OrganizationType, InstanceName, IsSandbox
            FROM Organization LIMIT 1
        ];
        info.put('orgName', org.Name);
        info.put('orgId', org.Id);
        info.put('instance', org.InstanceName);
        info.put('isSandbox', org.IsSandbox);
        info.put('userName', UserInfo.getUserName());
        info.put('crm', 'salesforce');
        info.put('status', 'connected');
        info.put('label', 'this org (native)');
        info.put('mcpServers', new List<Map<String, Object>>());
        return info;
    }

    // ---------- Dashboard ----------

    /**
     * Aggregated data for the Studio dashboard home tab.
     * Returns org info, config coverage, pending drafts, and recent activity.
     */
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getDashboardData() {
        Map<String, Object> data = new Map<String, Object>();

        // Org identity (reuse connection info)
        data.put('org', getConnectionInfo());

        // Config coverage: published layout:* configs vs configurable CRM objects
        Integer layoutCount = [
            SELECT COUNT() FROM Cardstack_Config__c
            WHERE Name LIKE 'layout:%' AND Is_Active__c = true
            WITH USER_MODE
        ];
        // Count distinct objects with at least one layout (strip :audience suffix)
        Set<String> objectsWithLayout = new Set<String>();
        for (Cardstack_Config__c c : [
            SELECT Name FROM Cardstack_Config__c
            WHERE Name LIKE 'layout:%' AND Is_Active__c = true
            WITH USER_MODE
        ]) {
            String remainder = c.Name.substringAfter('layout:');
            Integer colonIdx = remainder.indexOf(':');
            objectsWithLayout.add(colonIdx > 0 ? remainder.substring(0, colonIdx) : remainder);
        }
        Integer totalObjects = getCrmObjects().size();
        data.put('layoutsPublished', layoutCount);
        data.put('objectsConfigured', objectsWithLayout.size());
        data.put('totalObjects', totalObjects);

        // Pending drafts
        List<Cardstack_Config_Draft__c> drafts = CardstackConfigService.listDrafts('Draft');
        data.put('pendingDraftCount', drafts.size());
        List<Map<String, Object>> draftSummaries = new List<Map<String, Object>>();
        for (Cardstack_Config_Draft__c d : drafts) {
            draftSummaries.add(new Map<String, Object>{
                'id' => d.Id,
                'name' => d.Name,
                'key' => d.Config__r != null ? d.Config__r.Name : '',
                'createdBy' => d.CreatedBy.Name,
                'createdDate' => d.CreatedDate
            });
        }
        data.put('pendingDrafts', draftSummaries);

        // Recent activity (last 10 audit entries)
        List<Map<String, Object>> recent = new List<Map<String, Object>>();
        for (Cardstack_Audit_Log__c log : CardstackAuditService.searchLogs('', '', 10)) {
            recent.add(new Map<String, Object>{
                'action' => log.Action__c,
                'tool' => log.Tool_Name__c,
                'user' => log.User__r != null ? log.User__r.Name : '',
                'time' => log.Timestamp__c
            });
        }
        data.put('recentActivity', recent);

        return data;
    }

    // ---------- Setup checklist ----------

    /**
     * Returns the 5 setup checklist items with their completion states,
     * plus whether the checklist was dismissed.
     * Manual flags are persisted as Cardstack_Config__c records (setup:*).
     */
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getChecklistState() {
        List<Map<String, Object>> items = new List<Map<String, Object>>();

        // 1. First object layout published
        Integer layoutCount = [
            SELECT COUNT() FROM Cardstack_Config__c
            WHERE Name LIKE 'layout:%' AND Is_Active__c = true
            WITH USER_MODE
        ];
        items.add(checklistItem(
            'layout', 'Configure your first object layout',
            'Pick an object and design its chat card in the visual builder.',
            layoutCount > 0, false, 'objects'
        ));

        // 2. No pending drafts
        Integer draftCount = CardstackConfigService.listDrafts('Draft').size();
        items.add(checklistItem(
            'drafts', 'Publish pending drafts',
            draftCount == 0 ? 'All drafts are published.' : draftCount + ' draft(s) waiting to publish.',
            draftCount == 0, false, 'publish'
        ));

        // 3. Permission set assigned to current user
        Integer permCount = [
            SELECT COUNT() FROM PermissionSetAssignment
            WHERE AssigneeId = :UserInfo.getUserId()
            AND PermissionSet.Name IN ('Cardstack_Admin', 'Cardstack_User')
            WITH USER_MODE
        ];
        items.add(checklistItem(
            'perms', 'Assign a Cardstack permission set',
            'You need Cardstack_Admin or Cardstack_User to use the Studio and tools.',
            permCount > 0, false, null
        ));

        // 4. MCP server activated (best-effort; tooling object may not be queryable)
        Boolean mcpActive = isMcpServerActive();
        Boolean mcpConfirmed = getSetupFlag('setup:mcpServerConfirmed');
        items.add(checklistItem(
            'mcp', 'Activate the MCP server',
            'Create an active McpServerAccess record for the Cardstack definition.',
            mcpActive || mcpConfirmed, !mcpActive, null
        ));

        // 5. Claude connected (manual)
        Boolean claudeDone = getSetupFlag('setup:claudeConnected');
        items.add(checklistItem(
            'claude', 'Connect Claude',
            'Add a custom connector in Claude pointing at your hosted MCP URL.',
            claudeDone, true, null
        ));

        return new Map<String, Object>{
            'items' => items,
            'dismissed' => getSetupFlag('setup:checklistDismissed')
        };
    }

    // ---------- Private ----------

    private static Map<String, Object> checklistItem(
        String id, String label, String detail,
        Boolean done, Boolean manual, String tab
    ) {
        return new Map<String, Object>{
            'id' => id,
            'label' => label,
            'detail' => detail,
            'done' => done,
            'manual' => manual,
            'tab' => tab
        };
    }

    private static Boolean getSetupFlag(String key) {
        List<Cardstack_Config__c> rows = [
            SELECT Value__c FROM Cardstack_Config__c
            WHERE Name = :key AND Is_Active__c = true WITH USER_MODE LIMIT 1
        ];
        return !rows.isEmpty() && rows[0].Value__c == 'true';
    }

    /**
     * Best-effort check for an active McpServerAccess record.
     * McpServerAccess is a Tooling API object and is generally not queryable
     * from Apex; the QueryException is caught and treated as "unknown".
     */
    private static Boolean isMcpServerActive() {
        try {
            List<SObject> rows = Database.query(
                'SELECT Id FROM McpServerAccess ' +
                'WHERE DeveloperName = \'Cardstack\' AND Active = true LIMIT 1'
            );
            return !rows.isEmpty();
        } catch (Exception e) {
            return false;
        }
    }

    private static void validateJson(String value) {
        if (String.isBlank(value)) {
            return;
        }
        try {
            JSON.deserializeUntyped(value);
        } catch (Exception e) {
            throw new CardstackConfigService.ConfigException(
                'Value is not valid JSON: ' + e.getMessage()
            );
        }
    }

    /**
     * Active flows the admin can expose in chat (for the flow wizard's pick step).
     * Returns autolaunched and screen flows that are currently active.
     */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getActiveFlows() {
        List<Map<String, String>> flows = new List<Map<String, String>>();
        try {
            for (FlowDefinitionView f : [
                SELECT ApiName, Label, Description, ProcessType
                FROM FlowDefinitionView
                WHERE IsActive = true
                    AND ProcessType IN ('Flow', 'AutoLaunchedFlow')
                    AND (TriggerType = null OR TriggerType = 'None')
                ORDER BY Label
                LIMIT 200
            ]) {
                flows.add(new Map<String, String>{
                    'apiName' => f.ApiName,
                    'label' => f.Label,
                    'description' => String.valueOf(f.Description),
                    'processType' => String.valueOf(f.ProcessType)
                });
            }
        } catch (Exception e) {
            // FlowDefinitionView may not be visible to all users; return empty.
        }
        return flows;
    }

    /**
     * Input variables of a flow (for the wizard's input-mapping step).
     * Only variables marked as available for input.
     */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, Object>> getFlowInputs(String flowApiName) {
        List<Map<String, Object>> inputs = new List<Map<String, Object>>();
        if (String.isBlank(flowApiName)) {
            return inputs;
        }
        try {
            for (FlowVariableView v : [
                SELECT ApiName, DataType, Description, IsInput
                FROM FlowVariableView
                WHERE FlowVersionView.FlowDefinitionView.ApiName = :flowApiName
                    AND IsInput = true
                ORDER BY ApiName
                LIMIT 100
            ]) {
                inputs.add(new Map<String, Object>{
                    'apiName' => v.ApiName,
                    'dataType' => String.valueOf(v.DataType),
                    'description' => String.valueOf(v.Description),
                    'required' => false
                });
            }
        } catch (Exception e) {
            // Not visible or no variables; return empty.
        }
        return inputs;
    }
}
