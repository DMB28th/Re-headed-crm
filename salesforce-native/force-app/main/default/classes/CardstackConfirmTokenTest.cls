@IsTest
private class CardstackConfirmTokenTest {

    @IsTest
    static void mintAndVerifyRoundTrip() {
        CardstackConfirmToken.ConfirmToken minted =
            CardstackConfirmToken.mint('complete:00Txx0000000001');
        System.assertNotEquals(null, minted.token);
        System.assertNotEquals(null, minted.expiresAt);

        // Should not throw.
        CardstackConfirmToken.verify(minted.token, 'complete:00Txx0000000001');
    }

    @IsTest
    static void wrongSubjectFails() {
        CardstackConfirmToken.ConfirmToken minted =
            CardstackConfirmToken.mint('complete:00Txx0000000001');
        try {
            CardstackConfirmToken.verify(minted.token, 'complete:00Txx0000000002');
            System.assert(false, 'expected exception for subject mismatch');
        } catch (CardstackConfirmToken.CardstackException e) {
            System.assert(e.getMessage().contains('does not match'), e.getMessage());
        }
    }

    @IsTest
    static void tamperedTokenFails() {
        CardstackConfirmToken.ConfirmToken minted =
            CardstackConfirmToken.mint('complete:00Txx0000000001');
        String tampered = minted.token.substring(0, minted.token.length() - 4) + 'AAAA';
        try {
            CardstackConfirmToken.verify(tampered, 'complete:00Txx0000000001');
            System.assert(false, 'expected exception for tampered token');
        } catch (CardstackConfirmToken.CardstackException e) {
            System.assert(true, 'rejected: ' + e.getMessage());
        }
    }

    @IsTest
    static void garbageTokenFails() {
        try {
            CardstackConfirmToken.verify('not-a-token', 'complete:00Txx0000000001');
            System.assert(false, 'expected exception');
        } catch (CardstackConfirmToken.CardstackException e) {
            System.assert(true, 'rejected: ' + e.getMessage());
        }
    }
}
