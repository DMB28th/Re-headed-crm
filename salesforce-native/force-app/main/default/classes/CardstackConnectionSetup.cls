/** Admin facade over private, server-owned connection configuration. */
public with sharing class CardstackConnectionSetup {
    /** Reads setup only after explicit admin authorization. */
    public static CardstackConnectionTypes.SetupView get(String client) {
        CardstackConnectionAccess.requireAdmin();
        return CardstackConnectionSetupRepository.readAdmin(CardstackConnectionTypes.requireClient(client)).setupView;
    }
    /** Optimistic revision contract; a no-op preserves revision and digest. */
    public static CardstackConnectionTypes.SetupView save(CardstackConnectionTypes.SetupInput input) {
        CardstackConnectionAccess.requireAdmin();
        return CardstackConnectionSetupRepository.saveAdmin(input);
    }
    /** Internal named-service snapshot, never an Aura method or public tool. */
    public static CardstackConnectionTypes.SetupSnapshot snapshot(String client) {
        CardstackConnectionAccess.requireUser();
        return CardstackConnectionSetupRepository.readUser(CardstackConnectionTypes.requireClient(client));
    }
}
