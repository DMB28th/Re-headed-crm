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
 *   homecard                        retained retired configuration (read/history only)
 *   screens                         custom screen definitions (JSON array)
 *   connection                      org connection state (JSON)
 *
 * Draft/publish/rollback staging is handled via Cardstack_Config_Draft__c.
 */
public with sharing class CardstackConfigService {

    public class ConfigException extends Exception {}

    /**
     * @param key Stored configuration key.
     * @return True only for the retired Home configuration.
     */
    public static Boolean isRetiredKey(String key) {
        return key != null && key.equals('homecard');
    }

    /**
     * @param key Stored configuration key.
     * @return Whether the key participates in active Studio authoring and counts.
     */
    public static Boolean isSupportedStudioKey(String key) {
        if (String.isBlank(key)) return false;
        return key.equals('flows')
            || Pattern.matches('flow-plan:[A-Za-z][A-Za-z0-9_]*:default', key)
            || Pattern.matches('layout:[A-Za-z][A-Za-z0-9_]*:default', key)
            || Pattern.matches('exposures:[A-Za-z][A-Za-z0-9_]*', key);
    }

    // Compatibility keys (including setup flags) remain usable. Only retired Home
    // and unsupported audience layouts reject new authoring; old reads are intact.
    private static void validateAuthoringKey(String key) {
        if (isRetiredKey(key)) throw new ConfigException('RETIRED_CONFIGURATION');
        if (key != null && key.startsWith('layout:') && !isSupportedStudioKey(key)) {
            throw new ConfigException('UNSUPPORTED_CONFIGURATION');
        }
    }

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
        validateAuthoringKey(key);
        if (!Schema.sObjectType.Cardstack_Config__c.isCreateable()
            || !Schema.sObjectType.Cardstack_Config_Draft__c.isCreateable()) {
            throw new ConfigException('Insufficient access to stage configuration changes.');
        }

        // Candidate validation precedes every draft/config insertion; no draft grants rights.
        CardstackOpportunityActionPolicy.validateLayout(key, draftValue);
        CardstackRecordScreenCapability.validateLayout(key, draftValue);
        CardstackRelatedListPolicy.validateLayout(key, draftValue);
        CardstackFlowPublication.validateCandidate(key, draftValue);
        CardstackListExposurePolicy.validateCandidate(key, draftValue);
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
            SELECT Id, Config__c, Config__r.Name, Draft_Value__c, Status__c
            FROM Cardstack_Config_Draft__c
            WHERE Id = :draftId
            WITH USER_MODE
            LIMIT 1
        ];
        if (draft.Status__c != 'Draft') {
            throw new ConfigException('Only drafts in Draft status can be published.');
        }

        validateAuthoringKey(draft.Config__r.Name);

        // Recheck the actual persisted candidate before either publication update.
        CardstackOpportunityActionPolicy.validateLayout(draft.Config__r.Name, draft.Draft_Value__c);
        CardstackRecordScreenCapability.validateLayout(draft.Config__r.Name, draft.Draft_Value__c);
        CardstackRelatedListPolicy.validateLayout(draft.Config__r.Name, draft.Draft_Value__c);
        CardstackFlowPublication.validateCandidate(draft.Config__r.Name, draft.Draft_Value__c);
        CardstackListExposurePolicy.validateCandidate(draft.Config__r.Name, draft.Draft_Value__c);
        // A linked plan policy rebind and the reviewed layout/draft mutation are one transaction.
        Savepoint publicationCheckpoint = Database.setSavepoint();
        try {
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

            CardstackFlowPublication.rebindReferencedPlans(draft.Config__r.Name, draft.Draft_Value__c);

            CardstackAuditService.logAction(
                'CONFIG_PUBLISH', 'cardstackStudio', String.valueOf(draft.Config__c),
                'Published draft ' + draft.Id
            );
        } catch (Exception failure) {
            Database.rollback(publicationCheckpoint);
            throw failure;
        } finally {
            Database.releaseSavepoint(publicationCheckpoint);
        }
    }

    /**
     * Loads fresh stored values for a supported Studio candidate. Digests bind
     * raw text, including inactive retained values; display uses published values.
     * @param draftId Exact candidate identity.
     * @return Snapshot consumed by native publication review.
     */
    public static Map<String, Object> getDraftReview(Id draftId) {
        if (draftId == null) throw new ConfigException('Draft Id is required.');
        Cardstack_Config_Draft__c draft = [
            SELECT Id, Config__c, Draft_Value__c, Status__c
            FROM Cardstack_Config_Draft__c WHERE Id = :draftId WITH USER_MODE LIMIT 1
        ];
        Cardstack_Config__c config = [
            SELECT Id, Name, Value__c, Is_Active__c
            FROM Cardstack_Config__c WHERE Id = :draft.Config__c WITH USER_MODE LIMIT 1
        ];
        validateReviewKey(config.Name);
        if (draft.Status__c != 'Draft') throw new ConfigException('STALE_REVIEW');
        return new Map<String, Object>{
            'draftId' => CardstackConnectionTypes.normalizeId(String.valueOf(draft.Id)),
            'key' => config.Name,
            'liveValue' => config.Is_Active__c ? config.Value__c : null,
            'draftValue' => draft.Draft_Value__c,
            'liveDigest' => storedDigest(config.Value__c),
            'draftDigest' => storedDigest(draft.Draft_Value__c)
        };
    }

    /**
     * Publishes only the exact snapshot explicitly reviewed by the admin.
     * Parent configuration is locked before the candidate, consistently with
     * the existing publication mutation. Lookup alone never authorizes a write.
     * @param draftId Reviewed candidate identity.
     * @param expectedLiveDigest SHA-256 of the reviewed stored parent value.
     * @param expectedDraftDigest SHA-256 of the reviewed stored candidate value.
     */
    public static void publishReviewedDraft(Id draftId, String expectedLiveDigest, String expectedDraftDigest) {
        if (draftId == null) throw new ConfigException('Draft Id is required.');
        Cardstack_Config_Draft__c locator = [
            SELECT Config__c FROM Cardstack_Config_Draft__c
            WHERE Id = :draftId WITH USER_MODE LIMIT 1
        ];
        Cardstack_Config__c config = [
            SELECT Id, Name, Value__c, Is_Active__c FROM Cardstack_Config__c
            WHERE Id = :locator.Config__c WITH USER_MODE LIMIT 1 FOR UPDATE
        ];
        Cardstack_Config_Draft__c draft = [
            SELECT Id, Config__c, Draft_Value__c, Status__c FROM Cardstack_Config_Draft__c
            WHERE Id = :draftId WITH USER_MODE LIMIT 1 FOR UPDATE
        ];
        // Fail closed if any required publication field cannot be written. Never
        // silently strip the value or status from a reviewed publication.
        if (!Schema.sObjectType.Cardstack_Config__c.isUpdateable()
            || !Schema.sObjectType.Cardstack_Config_Draft__c.isUpdateable()
            || !Schema.sObjectType.Cardstack_Config__c.fields.Value__c.isUpdateable()
            || !Schema.sObjectType.Cardstack_Config__c.fields.Is_Active__c.isUpdateable()
            || !Schema.sObjectType.Cardstack_Config_Draft__c.fields.Status__c.isUpdateable()) {
            throw new ConfigException('Insufficient access to publish configuration.');
        }
        validateReviewKey(config.Name);
        if (draft.Config__c != config.Id || draft.Status__c != 'Draft'
            || !storedDigest(config.Value__c).equals(expectedLiveDigest)
            || !storedDigest(draft.Draft_Value__c).equals(expectedDraftDigest)) {
            throw new ConfigException('STALE_REVIEW');
        }
        // Existing publication rechecks both candidate validators under these
        // locks. Roll back both mutations if a caught error reaches the controller.
        Savepoint checkpoint = Database.setSavepoint();
        try {
            publishDraft(draft.Id);
        } catch (Exception failure) {
            Database.rollback(checkpoint);
            throw failure;
        }
    }

    private static void validateReviewKey(String key) {
        validateAuthoringKey(key);
        if (!isSupportedStudioKey(key)) throw new ConfigException('UNSUPPORTED_CONFIGURATION');
    }

    @TestVisible
    private static String storedDigest(String rawStoredValue) {
        return EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256',
            Blob.valueOf(JSON.serialize(new List<String>{rawStoredValue})))).toLowerCase();
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

    /**
     * Lists the active supported candidate window independently of retained history.
     * @return Up to 200 newest Draft candidates for supported Studio keys.
     */
    public static List<Cardstack_Config_Draft__c> listSupportedDrafts() {
        if (!Schema.sObjectType.Cardstack_Config_Draft__c.isAccessible()) {
            throw new ConfigException('Insufficient access to configuration drafts.');
        }
        Set<Id> supportedConfigIds = supportedConfigurationIds();
        if (supportedConfigIds.isEmpty()) return new List<Cardstack_Config_Draft__c>();
        return [
            SELECT Id, Name, Config__c, Config__r.Name, Draft_Value__c,
                   Status__c, CreatedDate, CreatedBy.Name
            FROM Cardstack_Config_Draft__c
            WHERE Status__c = 'Draft' AND Config__c IN :supportedConfigIds
            WITH USER_MODE
            ORDER BY CreatedDate DESC, Id DESC
            LIMIT 200
        ];
    }

    /**
     * Counts supported pending work without applying a tray/history window.
     * @return Exact number of supported Draft candidates visible to this actor.
     */
    public static Integer countSupportedDrafts() {
        if (!Schema.sObjectType.Cardstack_Config_Draft__c.isAccessible()) {
            throw new ConfigException('Insufficient access to configuration drafts.');
        }
        Set<Id> supportedConfigIds = supportedConfigurationIds();
        if (supportedConfigIds.isEmpty()) return 0;
        return [
            SELECT COUNT() FROM Cardstack_Config_Draft__c
            WHERE Status__c = 'Draft' AND Config__c IN :supportedConfigIds
            WITH USER_MODE
        ];
    }

    // ---------- Private ----------

    private static Set<Id> supportedConfigurationIds() {
        Set<Id> identities = new Set<Id>();
        for (Cardstack_Config__c config : listConfigs()) {
            if (isSupportedStudioKey(config.Name)) identities.add(config.Id);
        }
        return identities;
    }

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
