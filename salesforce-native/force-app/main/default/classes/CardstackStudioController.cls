/**
 * CardstackStudioController
 *
 * @AuraEnabled entry points for the cardstackStudio LWC app. Thin wrappers
 * over CardstackConfigService / CardstackAuditService plus native org
 * introspection (CRM objects via describe, MCP server definitions, org info)
 * for the Connections tab.
 */
public with sharing class CardstackStudioController {

    /**
     * @description Describe native editor eligibility; draft metadata grants no execution rights.
     * @param objectApi Canonical native object API name.
     * @return Shared record-edit-eligibility/v1 descriptor.
     */
    @AuraEnabled(cacheable=true)
    public static Map<String,Object> getRecordEditCapability(String objectApi) {
        CardstackStudioAccess.requireAdmin();
        return CardstackRecordScreenCapability.describeEligibility(objectApi);
    }

    /** Returns only native metadata needed to author related-list configuration. */
    @AuraEnabled(cacheable=true)
    public static List<Map<String,Object>> getRelatedListCatalog(String objectApi) {
        CardstackStudioAccess.requireAdmin();
        List<Map<String,Object>> result = new List<Map<String,Object>>();
        try {
            for (CardstackRelatedListPolicy.Definition definition : CardstackRelatedListPolicy.catalog(objectApi)) {
                List<Map<String,Object>> columns = new List<Map<String,Object>>();
                for (CardstackRelatedListPolicy.Column column : definition.columns) {
                    columns.add(new Map<String,Object>{'fieldApi'=>column.fieldApi,'label'=>column.label,'sortable'=>column.sortable});
                }
                result.add(new Map<String,Object>{'relationship'=>definition.relationship,'label'=>definition.label,'columns'=>columns});
            }
            return result;
        } catch (Exception failure) {
            throw studioError('Related-list metadata is unavailable.');
        }
    }

    // ---------- Config staging ----------

    @AuraEnabled(cacheable=true)
    public static String getConfigValue(String key) {
        CardstackStudioAccess.requireAdmin();
        return CardstackConfigService.getConfig(key);
    }

    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getStagingInfo(String key) {
        CardstackStudioAccess.requireAdmin();
        return CardstackConfigService.getStagingInfo(key);
    }

    /**
     * @description Return fresh staging state for authoritative editor reconciliation.
     * @param key Configuration key.
     * @return Persisted draft and published values.
     */
    @AuraEnabled
    public static Map<String, Object> getStagingInfoFresh(String key) {
        CardstackStudioAccess.requireAdmin();
        return CardstackConfigService.getStagingInfo(key);
    }

    /** Bounded metadata-only choices; runtime rechecks the exact published plan independently. */
    @AuraEnabled
    public static Map<String,Object> getPublishedFlowPlans(String objectApi) {
        CardstackStudioAccess.requireAdmin();
        try {
            return CardstackFlowPublication.catalog(objectApi);
        } catch (Exception failure) {
            throw studioError('Published in-chat Flow metadata is unavailable.');
        }
    }

    /** Acquires exact native metadata and stages a checked immutable interpreter plan. */
    @AuraEnabled
    public static Map<String,Object> prepareInterpretedFlowDraft(String definitionId18) {
        CardstackStudioAccess.requireAdmin();
        try {
            return CardstackFlowPublication.prepareDraft(CardstackConnectionTypes.normalizeId(definitionId18));
        } catch (Exception failure) {
            throw studioError('Flow metadata could not be acquired or compiled. Existing launch cards are retained.');
        }
    }

    // Flow editing needs a fresh snapshot after staging/publishing; do not cache this response.
    @AuraEnabled
    public static Map<String, Object> getFlowLaunchCards() {
        CardstackStudioAccess.requireAdmin();
        return CardstackConfigService.getStagingInfo('flows');
    }

    @AuraEnabled
    public static String saveDraft(String key, String value) {
        CardstackStudioAccess.requireAdmin();
        validateJson(value);
        return CardstackConnectionTypes.normalizeId(String.valueOf(CardstackConfigService.saveDraft(key, value)));
    }

    @AuraEnabled
    public static void publishDraft(String draftId) {
        CardstackStudioAccess.requireAdmin();
        CardstackConfigService.publishDraft((Id) CardstackConnectionTypes.normalizeId(draftId));
    }

    /** Fresh exact candidate snapshot; caching would invalidate review semantics. */
    @AuraEnabled
    public static Map<String, Object> getDraftReview(String draftId) {
        CardstackStudioAccess.requireAdmin();
        try {
            return CardstackConfigService.getDraftReview((Id) CardstackConnectionTypes.normalizeId(draftId));
        } catch (CardstackConfigService.ConfigException failure) {
            throw studioError(failure.getMessage());
        }
    }

    /** Publish the raw values acknowledged in native Studio review. */
    @AuraEnabled
    public static void publishReviewedDraft(String draftId, String expectedLiveDigest, String expectedDraftDigest) {
        CardstackStudioAccess.requireAdmin();
        try {
            Id nativeDraftId = (Id)CardstackConnectionTypes.normalizeId(draftId);
            Map<String,Object> reviewed = CardstackConfigService.getDraftReview(nativeDraftId);
            String key = (String)reviewed.get('key');
            if (key != null && key.startsWith('flow-plan:')) {
                CardstackFlowPublication.publishReviewed(nativeDraftId, expectedLiveDigest, expectedDraftDigest);
            } else {
                CardstackConfigService.publishReviewedDraft(nativeDraftId, expectedLiveDigest, expectedDraftDigest);
            }
        } catch (CardstackConfigService.ConfigException failure) {
            throw studioError(failure.getMessage());
        } catch (CardstackOpportunityActionPolicy.PolicyException failure) {
            throw studioError(failure.getMessage());
        }
    }

    /** Exact fresh status: bounded history absence cannot establish publication. */
    @AuraEnabled
    public static String getDraftStatus(String draftId) {
        CardstackStudioAccess.requireAdmin();
        Id normalizedId = (Id) CardstackConnectionTypes.normalizeId(draftId);
        return [SELECT Status__c FROM Cardstack_Config_Draft__c WHERE Id = :normalizedId WITH USER_MODE LIMIT 1].Status__c;
    }

    private static AuraHandledException studioError(String message) {
        AuraHandledException error = new AuraHandledException(message);
        error.setMessage(message);
        return error;
    }

    @AuraEnabled
    public static void rollbackDraft(String draftId) {
        CardstackStudioAccess.requireAdmin();
        CardstackConfigService.rollbackDraft((Id) CardstackConnectionTypes.normalizeId(draftId));
    }

    @AuraEnabled(cacheable=true)
    public static List<Cardstack_Config_Draft__c> getDrafts(String status) {
        CardstackStudioAccess.requireAdmin();
        List<Cardstack_Config_Draft__c> drafts = CardstackConfigService.listDrafts(status);
        // Keep the bounded generic history, including retained candidates for
        // inspection/discard. Add the separate supported window in active views
        // so retained history cannot displace active work before LIMIT 200.
        if (!String.isBlank(status) && status != 'Draft') return drafts;
        Set<Id> included = new Set<Id>();
        for (Cardstack_Config_Draft__c draft : drafts) included.add(draft.Id);
        for (Cardstack_Config_Draft__c draft : CardstackConfigService.listSupportedDrafts()) {
            if (!included.contains(draft.Id)) {
                drafts.add(draft);
                included.add(draft.Id);
            }
        }
        return drafts;
    }

    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> listConfigKeys() {
        CardstackStudioAccess.requireAdmin();
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
        CardstackStudioAccess.requireAdmin();
        Date fromDate = parseDate(fromDateStr);
        Date toDate = parseDate(toDateStr);
        return CardstackAuditService.searchLogs(term, tool, limitSize, fromDate, toDate, userId);
    }

    @AuraEnabled(cacheable=true)
    public static List<String> listAuditTools() {
        CardstackStudioAccess.requireAdmin();
        return CardstackAuditService.listTools();
    }

    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> listAuditUsers() {
        CardstackStudioAccess.requireAdmin();
        return CardstackAuditService.listUsers();
    }

    @AuraEnabled
    public static void setSetupFlag(String key, Boolean value) {
        CardstackStudioAccess.requireAdmin();
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
        CardstackStudioAccess.requireAdmin();
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
        CardstackStudioAccess.requireAdmin();
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
                    'type' => String.valueOf(f.getType()),
                    'updateable' => String.valueOf(f.isUpdateable()),
                    'nillable' => String.valueOf(f.isNillable())
                });
            }
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'getObjectFields failed: ' + e.getMessage());
        }
        return fields;
    }

    /** @param objectApi Native object API. @return Actor-readable lists for admin authoring. */
    @AuraEnabled(cacheable=true)
    public static List<Map<String,Object>> getStudioListCatalog(String objectApi) {
        CardstackStudioAccess.requireAdmin();
        try { return CardstackListCatalog.available(objectApi); }
        catch (Exception failure) { throw new AuraHandledException('Could not read the list catalog. Check Salesforce access.'); }
    }

    /** @param objectApi Native object API. @return Readable fields with Boolean editability. */
    @AuraEnabled(cacheable=true)
    public static List<Map<String,Object>> getStudioFieldCatalog(String objectApi) {
        CardstackStudioAccess.requireAdmin();
        List<Map<String,Object>> fields = new List<Map<String,Object>>();
        Schema.SObjectType objectType = Schema.getGlobalDescribe().get(objectApi);
        if (objectType == null || !objectType.getDescribe().isAccessible()) return fields;
        Map<String,Schema.SObjectField> fieldMap = objectType.getDescribe().fields.getMap();
        List<String> names = new List<String>(fieldMap.keySet()); names.sort();
        for (String api : names) {
            Schema.DescribeFieldResult field = fieldMap.get(api).getDescribe();
            if (!field.isAccessible()) continue;
            fields.add(new Map<String,Object>{'api'=>field.getName(), 'label'=>field.getLabel(),
                'type'=>String.valueOf(field.getType()), 'updateable'=>field.isUpdateable()});
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
        CardstackStudioAccess.requireAdmin();
        Map<String, Object> info = new Map<String, Object>();
        Organization org = [
            SELECT Id, Name, OrganizationType, InstanceName, IsSandbox
            FROM Organization WITH USER_MODE LIMIT 1
        ];
        info.put('orgName', org.Name);
        info.put('orgId', CardstackConnectionTypes.normalizeId(String.valueOf(org.Id)));
        info.put('instance', org.InstanceName);
        info.put('isSandbox', org.IsSandbox);
        info.put('userName', UserInfo.getUserName());
        info.put('crm', 'salesforce');
        info.put('status', 'connected');
        info.put('label', 'this org (native)');
        info.put('mcpServers', new List<Map<String, Object>>());
        return info;
    }

    /** Accurate default-layout state, independent of the bounded Publish/history window. */
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getStudioOverview() {
        CardstackStudioAccess.requireAdmin();
        Map<String, Map<String, Object>> objectsByApi = new Map<String, Map<String, Object>>();
        for (Map<String, String> objectInfo : getCrmObjects()) {
            objectsByApi.put(objectInfo.get('api'), overviewObject(objectInfo.get('api'), objectInfo.get('label'), 'ready'));
        }
        // One bulk relationship query obtains the latest candidate for EACH default
        // layout, including objects whose candidate is older than the newest 200.
        Map<String, Schema.SObjectType> metadata = Schema.getGlobalDescribe();
        for (Cardstack_Config__c config : [
            SELECT Name, Value__c, Is_Active__c,
                (SELECT Id FROM Drafts__r WHERE Status__c = 'Draft' ORDER BY CreatedDate DESC, Id DESC LIMIT 1)
            FROM Cardstack_Config__c WHERE Name LIKE 'layout:%'
            WITH USER_MODE
        ]) {
            if (!CardstackConfigService.isSupportedStudioKey(config.Name)) continue;
            String objectApi = config.Name.substringAfter('layout:').substringBefore(':');
            if (!objectsByApi.containsKey(objectApi)) {
                Schema.SObjectType objectType = metadata.get(objectApi);
                Boolean available = objectType != null && objectType.getDescribe().isAccessible();
                objectsByApi.put(objectApi, overviewObject(objectApi,
                    available ? objectType.getDescribe().getLabel() : objectApi, available ? 'ready' : 'unavailable'));
            }
            Map<String, Object> state = objectsByApi.get(objectApi);
            state.put('hasLive', config.Is_Active__c && !String.isBlank(config.Value__c));
            state.put('hasDraft', !config.Drafts__r.isEmpty());
            if (!config.Drafts__r.isEmpty()) state.put('latestDraftId', CardstackConnectionTypes.normalizeId(String.valueOf(config.Drafts__r[0].Id)));
        }
        List<String> objectApis = new List<String>(objectsByApi.keySet());
        objectApis.sort();
        List<Map<String, Object>> objects = new List<Map<String, Object>>();
        for (String objectApi : objectApis) objects.add(objectsByApi.get(objectApi));
        List<Map<String, Object>> recent = new List<Map<String, Object>>();
        for (Cardstack_Audit_Log__c log : CardstackAuditService.searchLogs('', '', 10)) {
            recent.add(new Map<String, Object>{
                'action' => log.Action__c, 'tool' => log.Tool_Name__c,
                'user' => log.User__r != null ? log.User__r.Name : '', 'time' => log.Timestamp__c
            });
        }
        return new Map<String, Object>{
            'org' => getConnectionInfo(), 'objects' => objects,
            'activePendingDraftCount' => CardstackConfigService.countSupportedDrafts(), 'recentActivity' => recent
        };
    }

    private static Map<String, Object> overviewObject(String objectApi, String label, String metadataStatus) {
        return new Map<String, Object>{
            'objectApi' => objectApi, 'label' => label, 'hasLive' => false,
            'hasDraft' => false, 'latestDraftId' => null, 'metadataStatus' => metadataStatus
        };
    }

    // ---------- Dashboard ----------

    /**
     * Aggregated data for the Studio dashboard home tab.
     * Returns org info, config coverage, pending drafts, and recent activity.
     */
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getDashboardData() {
        CardstackStudioAccess.requireAdmin();
        Map<String, Object> data = new Map<String, Object>();

        // Org identity (reuse connection info)
        data.put('org', getConnectionInfo());

        // Config coverage: published layout:* configs vs configurable CRM objects
        Integer layoutCount = 0;
        // Count distinct objects with at least one layout (strip :audience suffix)
        Set<String> objectsWithLayout = new Set<String>();
        for (Cardstack_Config__c c : [
            SELECT Name FROM Cardstack_Config__c
            WHERE Name LIKE 'layout:%' AND Is_Active__c = true
            WITH USER_MODE
        ]) {
            if (!CardstackConfigService.isSupportedStudioKey(c.Name)) continue;
            layoutCount++;
            String remainder = c.Name.substringAfter('layout:');
            Integer colonIdx = remainder.indexOf(':');
            objectsWithLayout.add(colonIdx > 0 ? remainder.substring(0, colonIdx) : remainder);
        }
        Integer totalObjects = getCrmObjects().size();
        data.put('layoutsPublished', layoutCount);
        data.put('objectsConfigured', objectsWithLayout.size());
        data.put('totalObjects', totalObjects);

        // Pending drafts
        List<Cardstack_Config_Draft__c> drafts = CardstackConfigService.listSupportedDrafts();
        data.put('pendingDraftCount', CardstackConfigService.countSupportedDrafts());
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
        CardstackStudioAccess.requireAdmin();
        List<Map<String, Object>> items = new List<Map<String, Object>>();

        // 1. First object layout published
        Integer layoutCount = 0;
        for (Cardstack_Config__c config : CardstackConfigService.listConfigs()) {
            if (config.Is_Active__c && config.Name.startsWith('layout:') && CardstackConfigService.isSupportedStudioKey(config.Name)) layoutCount++;
        }
        items.add(checklistItem(
            'layout', 'Configure your first object layout',
            'Pick an object and design its chat card in the visual builder.',
            layoutCount > 0, false, 'objects'
        ));

        // 2. No pending drafts
        Integer draftCount = CardstackConfigService.countSupportedDrafts();
        items.add(checklistItem(
            'drafts', 'Publish pending drafts',
            draftCount == 0 ? 'All drafts are published.' : draftCount + ' draft(s) waiting to publish.',
            draftCount == 0, false, 'publish'
        ));

        // 3. Permission set assigned to current user
        Integer permCount = [
            SELECT COUNT() FROM PermissionSetAssignment
            WHERE AssigneeId = :UserInfo.getUserId()
            AND PermissionSet.Name = 'Cardstack_Admin'
            WITH USER_MODE
        ];
        items.add(checklistItem(
            'perms', 'Assign a Cardstack permission set',
            'Cardstack_Admin is required for Studio. Cardstack_User grants chat access only.',
            permCount > 0, false, null
        ));

        // 4. MCP server activated (best-effort; tooling object may not be queryable)
        Boolean mcpActive = isMcpServerActive();
        Boolean mcpConfirmed = getSetupFlag('setup:mcpServerConfirmed');
        items.add(checklistItem(
            'mcp', 'Legacy MCP server setup history',
            'Legacy beta history only; this does not verify the MCP Apps connection below.',
            mcpActive || mcpConfirmed, !mcpActive, null
        ));

        // 5. Claude connected (manual)
        Boolean claudeDone = getSetupFlag('setup:claudeConnected');
        items.add(checklistItem(
            'claude', 'Legacy Claude setup history',
            'Legacy beta history only; each client needs current MCP Apps diagnostic evidence.',
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
        CardstackStudioAccess.requireAdmin();
        List<Map<String, String>> flows = new List<Map<String, String>>();
        try {
            for (FlowDefinitionView f : [
                SELECT Id, ActiveVersionId, ApiName, Label, Description, ProcessType
                FROM FlowDefinitionView
                WHERE IsActive = true
                    AND ProcessType IN ('Flow', 'AutoLaunchedFlow')
                    AND (TriggerType = null OR TriggerType = 'None')
                WITH USER_MODE
                ORDER BY Label
                LIMIT 200
            ]) {
                flows.add(new Map<String, String>{
                    'apiName' => f.ApiName,
                    'definitionId18' => nativeFlowIdentity(String.valueOf(f.Id)),
                    'activeVersionId18' => nativeFlowIdentity(f.ActiveVersionId),
                    'label' => f.Label,
                    'description' => String.valueOf(f.Description),
                    'processType' => String.valueOf(f.ProcessType)
                });
            }
        } catch (Exception e) {
            throw studioError('Active Flow metadata is unavailable.');
        }
        return flows;
    }

    /** Native metadata views may return opaque references; only actual IDs enable exact acquisition. */
    @TestVisible private static String nativeFlowIdentity(String reference) {
        if(String.isBlank(reference)) return null;
        try { return CardstackConnectionTypes.normalizeId(reference); }
        catch(CardstackConnectionTypes.ConnectionException unavailable) { return null; }
    }

    /**
     * Input variables of a flow (for the wizard's input-mapping step).
     * Only variables marked as available for input.
     */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, Object>> getFlowInputs(String flowApiName) {
        CardstackStudioAccess.requireAdmin();
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
                WITH USER_MODE
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
            throw studioError('Flow input metadata is unavailable.');
        }
        return inputs;
    }
}
