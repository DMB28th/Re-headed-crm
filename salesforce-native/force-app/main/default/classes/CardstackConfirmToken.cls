/**
 * Shared confirm-token minting/verification for Cardstack's preview → write
 * pairs (complete_task, update_record). A token binds an action to a record
 * (and patch, for updates) with an expiry; the write side verifies before
 * writing and aborts on a bad token rather than downgrading.
 *
 * The token is stateless: payload | expiry | HMAC-SHA256(payload|expiry),
 * base64-encoded. No custom object needed.
 */
global with sharing class CardstackConfirmToken {

    private static final Long TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
    // Org-local secret: stable per org, never leaves Salesforce.
    private static final String HMAC_KEY = 'CardstackConfirm.v1.' + UserInfo.getOrganizationId();

    /**
     * Mint a token for the given subject string (e.g. 'complete:taskId' or
     * 'update:object:recordId:patchHash').
     */
    global static ConfirmToken mint(String subject) {
        Long expiresAt = Datetime.now().getTime() + TOKEN_TTL_MS;
        String payload = subject + '|' + expiresAt;
        String sig = hmac(payload);
        String token = EncodingUtil.base64Encode(
            Blob.valueOf(payload + '|' + sig));
        ConfirmToken ct = new ConfirmToken();
        ct.token = token;
        ct.expiresAt = Datetime.newInstance(expiresAt).format('yyyy-MM-dd\'T\'HH:mm:ss\'Z\'');
        return ct;
    }

    /**
     * Verify a token against the expected subject. Throws on bad signature,
     * subject mismatch, or expiry.
     */
    global static void verify(String token, String expectedSubject) {
        String decoded;
        try {
            decoded = EncodingUtil.base64Decode(token).toString();
        } catch (Exception e) {
            throw new CardstackException('Invalid confirmation token.');
        }
        List<String> parts = decoded.split('\\|');
        if (parts.size() != 3) {
            throw new CardstackException('Invalid confirmation token.');
        }
        String subject = parts[0];
        Long expiresAt;
        try {
            expiresAt = Long.valueOf(parts[1]);
        } catch (Exception e) {
            throw new CardstackException('Invalid confirmation token.');
        }
        String sig = parts[2];
        if (subject != expectedSubject) {
            throw new CardstackException('Confirmation token does not match this action.');
        }
        if (hmac(subject + '|' + expiresAt) != sig) {
            throw new CardstackException('Confirmation token failed verification.');
        }
        if (Datetime.now().getTime() > expiresAt) {
            throw new CardstackException('Confirmation token has expired.');
        }
    }

    private static String hmac(String data) {
        Blob mac = Crypto.generateMac(
            'HmacSHA256', Blob.valueOf(data), Blob.valueOf(HMAC_KEY));
        return EncodingUtil.base64Encode(mac);
    }

    global class ConfirmToken {
        @InvocableVariable public String token;
        @InvocableVariable public String expiresAt;
    }

    public class CardstackException extends Exception {}
}
