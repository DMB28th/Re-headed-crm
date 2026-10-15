/** Studio administration is independent of connected-user runtime/configuration access. */
public with sharing class CardstackStudioAccess {
    /** Requires the native Studio custom permission and excludes guest sessions. */
    public static void requireAdmin() {
        if (UserInfo.getUserType() == 'Guest' || !FeatureManagement.checkPermission('Cardstack_Manage_Studio')) {
            String message = 'Cardstack_Admin is required to use Studio. Cardstack_User grants chat access only.';
            AuraHandledException failure = new AuraHandledException(message);
            failure.setMessage(message);
            throw failure;
        }
    }
}
