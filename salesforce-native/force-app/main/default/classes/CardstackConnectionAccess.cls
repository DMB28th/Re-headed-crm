/** Explicit permission gates; Apex class access alone never authorizes connection state. */
public with sharing class CardstackConnectionAccess {
    @TestVisible private static Boolean adminOverride;
    @TestVisible private static Boolean userOverride;
    /** Setup is admin-only. Test overrides cannot be used in production. */
    public static void requireAdmin() {
        Boolean allowed = Test.isRunningTest() && adminOverride != null ? adminOverride : FeatureManagement.checkPermission('Cardstack_Manage_Connections');
        if(!allowed || UserInfo.getUserType() == 'Guest') throw new CardstackConnectionTypes.ConnectionException('NOT_AUTHORIZED');
    }
    /** Named application access is explicit, including admin callers. */
    public static void requireUser() {
        Boolean allowed = Test.isRunningTest() && userOverride != null ? userOverride : FeatureManagement.checkPermission('Cardstack_Use_Connections');
        if(!allowed || UserInfo.getUserType() == 'Guest') throw new CardstackConnectionTypes.ConnectionException('NOT_AUTHORIZED');
    }
}
