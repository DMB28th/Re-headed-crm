/** Stable connection DTOs. Private protocol/internal identity fields are never Aura exports. */
public with sharing class CardstackConnectionTypes {
    public class ConnectionException extends Exception {}
    public static final String SITE_TRANSPORT = 'site/v1';
    public static final String DIRECT_TRANSPORT = 'direct-org-api/v1';
    public static final String DIRECT_ROUTE = 'apex-probe/v1';
    public static final String DIRECT_CLIENT = 'chatgpt';
    public static final String DIRECT_PATH = '/services/apexrest/cardstack-mcp-probe/';
    public class SetupInput {
        @AuraEnabled public String transportKind {get;set;}
        @AuraEnabled public String routeVersion {get;set;}
        @AuraEnabled public String client {get;set;}
        @AuraEnabled public String publicClientId {get;set;}
        @AuraEnabled public List<String> callbacks {get;set;}
        @AuraEnabled public Id siteId {get;set;}
        @AuraEnabled public String sitePrefix {get;set;}
        @AuraEnabled public Boolean enabledIntent {get;set;}
        @AuraEnabled public Integer expectedRevision {get;set;}
        @AuraEnabled public Map<String,Boolean> stepStates {get;set;}
    }
    public class SetupView {
        @AuraEnabled public String transportKind {get;set;}
        @AuraEnabled public String routeVersion {get;set;}
        @AuraEnabled public String sitePrefix {get;set;}
        @AuraEnabled public Map<String,Boolean> stepStates {get;set;}
        @AuraEnabled public String client {get;set;}
        @AuraEnabled public Integer revision {get;set;}
        @AuraEnabled public String publicClientId {get;set;}
        @AuraEnabled public List<String> callbacks {get;set;}
        @AuraEnabled public String resourceUrl {get;set;}
        @AuraEnabled public String metadataUrl {get;set;}
        @AuraEnabled public String issuer {get;set;}
        @AuraEnabled public Boolean enabledIntent {get;set;}
        @AuraEnabled public Map<String,String> versions {get;set;}
        @AuraEnabled public List<CheckView> checks {get;set;}
        @AuraEnabled public String summary {get;set;}
    }
    public class CheckView {
        @AuraEnabled public String stage {get;set;}
        @AuraEnabled public String status {get;set;}
        @AuraEnabled public String source {get;set;}
        @AuraEnabled public Datetime checkedAt {get;set;}
        @AuraEnabled public String errorCode {get;set;}
    }
    public class ContextView {
        @AuraEnabled public Id siteId {get;set;}
        @AuraEnabled public String sitePrefix {get;set;}
        @AuraEnabled public String resourceUrl {get;set;}
        @AuraEnabled public String metadataUrl {get;set;}
        @AuraEnabled public String issuer {get;set;}
        @AuraEnabled public List<CheckView> checks {get;set;}
    }
    public class SetupSnapshot {
        public SetupView setupView;
        public String configurationDigest;
        public transient Id siteId;
        public transient String sitePrefix;
        private transient String orgIdentity = normalizeId(String.valueOf(UserInfo.getOrganizationId()));
        public SetupSnapshot() {}
        /** Private persisted enrollment identity; never included in public setup output. */
        public SetupSnapshot(String storedOrg) { orgIdentity = normalizeId(storedOrg); }
        /** Compares full current identity internally without exporting it. */
        public Boolean isCurrentOrg() { return orgIdentity.equals(normalizeId(String.valueOf(UserInfo.getOrganizationId()))); }
    }
    public class DiagnosticOpen {
        public String client;
        public Map<String,String> versions;
        public String attemptKey;
        public String challenge;
        public Datetime expiresAt;
        public Integer configurationRevision;
        public String resourceUri;
        public Map<String,Object> fixture;
    }
    public class DiagnosticReceipt {
        @AuraEnabled public Map<String,Object> values {get;set;}
        @AuraEnabled public String client {get;set;}
        @AuraEnabled public Map<String,String> versions {get;set;}
        /** Original attempt deadline, not the history retention deadline. */
        @AuraEnabled public Datetime expiresAt {get;set;}
        @AuraEnabled public String reference {get;set;}
        @AuraEnabled public Integer configurationRevision {get;set;}
        @AuraEnabled public Datetime checkedAt {get;set;}
        @AuraEnabled public Boolean exactValues {get;set;}
        @AuraEnabled public List<CheckView> stages {get;set;}
    }
    /** Only the two canonical clients are supported; route is not OAuth app attestation. */
    public static String requireClient(String value) {
        if(value == null || (!value.equals('claude') && !value.equals('chatgpt'))) throw new ConnectionException('INVALID_CLIENT');
        return value;
    }
    /** Normalize 15-character platform input; reject mismatching 18-character checksum. */
    public static String normalizeId(String value) {
        if(value == null || !Pattern.matches('[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?', value)) throw new ConnectionException('INVALID_SETUP');
        String base = value.substring(0,15), checksum = '', alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
        for(Integer block = 0; block < 3; block++) {
            Integer flags = 0; List<Integer> weights = new List<Integer>{1,2,4,8,16};
            for(Integer offset = 0; offset < 5; offset++) {
                String ch = base.substring(block*5+offset, block*5+offset+1);
                if(!ch.equals(ch.toLowerCase())) flags += weights[offset];
            }
            checksum += alphabet.substring(flags, flags+1);
        }
        String full = base + checksum;
        if(value.length() == 18 && !value.equals(full)) throw new ConnectionException('INVALID_SETUP');
        return full;
    }
    /** Prefix is one canonical path component, with a single leading slash. */
    public static String normalizePrefix(String value) {
        if(value != null && Pattern.compile('[\\x00-\\x1F\\x7F]').matcher(value).find()) throw new ConnectionException('INVALID_SETUP');
        if(String.isBlank(value)) return '';
        String prefix = value.trim();
        if(prefix == '/') return '';
        if(!prefix.startsWith('/')) prefix = '/' + prefix;
        if(prefix.length() > 80 || !Pattern.matches('/[a-zA-Z0-9_-]+', prefix)) throw new ConnectionException('INVALID_SETUP');
        return prefix;
    }
}
