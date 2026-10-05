/**
 * CardstackConfigService
 *
 * Native key-value configuration store for the Cardstack package.
 * Replaces the file/Postgres config-store from the Node.js Studio:
 * every governed surface (object layouts, list exposures, flow render modes,
 * home card, custom screens) is a Cardstack_Config__c record whose Value__c
 * holds JSON, addressed by a namespaced key:
 *
 *   layout:{ObjectApi}:{audience}   e.g. layout:Account:default
 *   exposures:{ObjectApi}           e.g. exposures:Account
 *   flows                           flow render-mode configs (JSON array)
 *   homecard                        home dashboard card config (JSON)
 *   screens                         custom screen definitions (JSON array)
 *   connection                      org connection state (JSON)
 *
 * Draft/publish/rollback staging is handled via Cardstack_Config_Draft__c.
 */
public with sharing class CardstackConfigService {

    public class ConfigException extends Exception {}

    // ---------- Read ----------

    /**
     * Returns the live (active) config value for a key, or null if none exists.
     */
    public static String getConfig(String key) {
        if (String.isBlank(key)) {
            throw new ConfigException('Config key is required.');
        }
        if (!Schema.sObjectType.Cardstack_Config__c.isAccessible()) {
            throw new ConfigException('Insufficient access to Cardstack configuration.');
        }
        List<Cardstack_Config__c> rows = [
            SELECT Value__c
            FROM Cardstack_Config__c
            WHERE Name = :key AND Is_Active__c = true
            WITH USER_MODE
            LIMIT 1
        ];
        return rows.isEmpty() ? null : rows[0].Value__c;
    }

    /**
     * Lists all config records (keys + metadata, not values) for pickers.
     */
    public static List<Cardstack_Config__c> listConfigs() {
        if (!Schema.sObjectType.Cardstack_Config__c.isAccessible()) {
            throw new ConfigException('Insufficient access to Cardstack configuration.');
        }
        return [
            SELECT Id, Name, Description__c, Is_Active__c, LastModifiedDate
            FROM Cardstack_Config__c
            WITH USER_MODE
            ORDER BY Name ASC
        ];
    }

    /**
     * Staging state for one key: live value plus any open draft.
     */
    public static Map<String, Object> getStagingInfo(String key) {
        Map<String, Object> info = new Map<String, Object>();
        info.put('key', key);
        info.put('liveValue', getConfig(key));
        if (!Schema.sObjectType.Cardstack_Config_Draft__c.isAccessible()) {
            info.put('draft', null);
            return info;
        }
        List<Cardstack_Config_Draft__c> drafts = [
            SELECT Id, Name, Draft_Value__c, Status__c, CreatedDate, CreatedBy.Name
            FROM Cardstack_Config_Draft__c
            WHERE Config__r.Name = :key AND Status__c = 'Draft'
            WITH USER_MODE
            ORDER BY CreatedDate DESC
            LIMIT 1
        ];
        info.put('draft', drafts.isEmpty() ? null : drafts[0]);
        return info;
    }

    // ---------- Draft ----------

    /**
     * Stages a new draft value for a config key. Creates the config record
     * (inactive) if it does not exist yet. Returns the draft Id.
     */
    public static Id saveDraft(String key, String draftValue) {
        if (String.isBlank(key)) {
            throw new ConfigException('Config key is required.');
        }
        if (!Schema.sObjectType.Cardstack_Config__c.isCreateable()
            || !Schema.sObjectType.Cardstack_Config_Draft__c.isCreateable()) {
            throw new ConfigException('Insufficient access to stage configuration changes.');
        }

        Cardstack_Config__c cfg = getOrCreateConfig(key);

        Cardstack_Config_Draft__c draft = new Cardstack_Config_Draft__c(
            Config__c = cfg.Id,
            Draft_Value__c = draftValue,
            Status__c = 'Draft'
        );
        SObjectAccessDecision decision = Security.stripInaccessible(
            AccessType.CREATABLE,
            new List<Cardstack_Config_Draft__c>{ draft }
        );
        List<Cardstack_Config_Draft__c> toInsert =
            (List<Cardstack_Config_Draft__c>) decision.getRecords();
        insert toInsert;
        return toInsert[0].Id;
    }

    // ---------- Publish / rollback ----------

    /**
     * Publishes a draft: copies Draft_Value__c onto the live config, activates
     * it, and marks the draft Published. Any other open drafts for the same
     * config are left untouched (admins resolve them in the Publish Center).
     */
    public static void publishDraft(Id draftId) {
        if (draftId == null) {
            throw new ConfigException('Draft Id is required.');
        }
        if (!Schema.sObjectType.Cardstack_Config_Draft__c.isAccessible()
            || !Schema.sObjectType.Cardstack_Config_Draft__c.isUpdateable()
            || !Schema.sObjectType.Cardstack_Config__c.isUpdateable()) {
            throw new ConfigException('Insufficient access to publish configuration.');
        }
        Cardstack_Config_Draft__c draft = [
            SELECT Id, Config__c, Draft_Value__c, Status__c
            FROM Cardstack_Config_Draft__c
            WHERE Id = :draftId
            WITH USER_MODE
            LIMIT 1
        ];
        if (draft.Status__c != 'Draft') {
            throw new ConfigException('Only drafts in Draft status can be published.');
        }

        Cardstack_Config__c cfg = new Cardstack_Config__c(
            Id = draft.Config__c,
            Value__c = draft.Draft_Value__c,
            Is_Active__c = true
        );
        SObjectAccessDecision cfgDecision = Security.stripInaccessible(
            AccessType.UPDATABLE,
            new List<Cardstack_Config__c>{ cfg }
        );
        update cfgDecision.getRecords();

        draft.Status__c = 'Published';
        SObjectAccessDecision draftDecision = Security.stripInaccessible(
            AccessType.UPDATABLE,
            new List<Cardstack_Config_Draft__c>{ draft }
        );
        update draftDecision.getRecords();

        CardstackAuditService.logAction(
            'CONFIG_PUBLISH', 'cardstackStudio', String.valueOf(draft.Config__c),
            'Published draft ' + draft.Id
        );
    }

    /**
     * Rolls a draft back: marks it Rolled Back. The live config is untouched.
     */
    public static void rollbackDraft(Id draftId) {
        if (draftId == null) {
            throw new ConfigException('Draft Id is required.');
        }
        if (!Schema.sObjectType.Cardstack_Config_Draft__c.isAccessible()
            || !Schema.sObjectType.Cardstack_Config_Draft__c.isUpdateable()) {
            throw new ConfigException('Insufficient access to roll back configuration.');
        }
        Cardstack_Config_Draft__c draft = [
            SELECT Id, Status__c, Config__c
            FROM Cardstack_Config_Draft__c
            WHERE Id = :draftId
            WITH USER_MODE
            LIMIT 1
        ];
        if (draft.Status__c != 'Draft') {
            throw new ConfigException('Only drafts in Draft status can be rolled back.');
        }
        draft.Status__c = 'Rolled Back';
        SObjectAccessDecision decision = Security.stripInaccessible(
            AccessType.UPDATABLE,
            new List<Cardstack_Config_Draft__c>{ draft }
        );
        update decision.getRecords();

        CardstackAuditService.logAction(
            'CONFIG_ROLLBACK', 'cardstackStudio', String.valueOf(draft.Config__c),
            'Rolled back draft ' + draft.Id
        );
    }

    /**
     * Lists drafts, optionally filtered by status. Null/blank status = all.
     */
    public static List<Cardstack_Config_Draft__c> listDrafts(String status) {
        if (!Schema.sObjectType.Cardstack_Config_Draft__c.isAccessible()) {
            throw new ConfigException('Insufficient access to configuration drafts.');
        }
        if (String.isBlank(status)) {
            return [
                SELECT Id, Name, Config__c, Config__r.Name, Draft_Value__c,
                       Status__c, CreatedDate, CreatedBy.Name
                FROM Cardstack_Config_Draft__c
                WITH USER_MODE
                ORDER BY CreatedDate DESC
                LIMIT 200
            ];
        }
        return [
            SELECT Id, Name, Config__c, Config__r.Name, Draft_Value__c,
                   Status__c, CreatedDate, CreatedBy.Name
            FROM Cardstack_Config_Draft__c
            WHERE Status__c = :status
            WITH USER_MODE
            ORDER BY CreatedDate DESC
            LIMIT 200
        ];
    }

    // ---------- Private ----------

    private static Cardstack_Config__c getOrCreateConfig(String key) {
        List<Cardstack_Config__c> rows = [
            SELECT Id FROM Cardstack_Config__c WHERE Name = :key WITH USER_MODE LIMIT 1
        ];
        if (!rows.isEmpty()) {
            return rows[0];
        }
        Cardstack_Config__c cfg = new Cardstack_Config__c(
            Name = key,
            Is_Active__c = false
        );
        SObjectAccessDecision decision = Security.stripInaccessible(
            AccessType.CREATABLE,
            new List<Cardstack_Config__c>{ cfg }
        );
        List<Cardstack_Config__c> toInsert = (List<Cardstack_Config__c>) decision.getRecords();
        insert toInsert;
        return toInsert[0];
    }
}
