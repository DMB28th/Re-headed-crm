/** Server-owned, actor-bound opaque confirmations. Raw keys are never persisted. */
global with sharing class CardstackConfirmToken {
    global static ConfirmToken mint(String subject) { return mintRecord(subject,null,null); }
    public static ConfirmToken mintRecord(String subject,String recordId,Object recordVersion) {
        String key=EncodingUtil.convertToHex(Crypto.generateAesKey(256));
        Datetime expires=Datetime.now().addMinutes(15);
        insert as system new Cardstack_Confirmation__c(Key_Hash__c=hash(key),Subject_Hash__c=hash(subject),
            Actor_Id__c=UserInfo.getUserId(),Expires_At__c=expires,Record_Id__c=recordId,
            Record_Version__c=recordVersion==null ? null : hash(String.valueOf(recordVersion)));
        ConfirmToken result=new ConfirmToken(); result.token=key;
        result.expiresAt=expires.formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\''); return result;
    }
    global static void verify(String token,String subject) { locked(token,subject); }
    public static Cardstack_Confirmation__c locked(String token,String subject) {
        if (String.isBlank(token) || token.length()!=64) throw new CardstackException('Preview and confirmation are required.');
        String keyHash=hash(token);
        List<Cardstack_Confirmation__c> rows=[SELECT Id,Actor_Id__c,Subject_Hash__c,Expires_At__c,
            Record_Id__c,Record_Version__c,Receipt__c FROM Cardstack_Confirmation__c
            WHERE Key_Hash__c=:keyHash WITH SYSTEM_MODE LIMIT 1 FOR UPDATE];
        if (rows.isEmpty() || rows[0].Actor_Id__c!=UserInfo.getUserId()) throw new CardstackException('Invalid confirmation token.');
        Cardstack_Confirmation__c row=rows[0];
        if (row.Subject_Hash__c!=hash(subject)) throw new CardstackException('Confirmation token does not match this action. Preview again.');
        if (row.Expires_At__c<Datetime.now() && row.Receipt__c==null) throw new CardstackException('Confirmation token has expired.');
        return row;
    }
    public static void assertFresh(Cardstack_Confirmation__c confirmation,Object recordVersion) {
        if (confirmation.Record_Version__c!=hash(String.valueOf(recordVersion))) throw new CardstackException('Record changed since preview. Preview again.');
    }
    public static void complete(Cardstack_Confirmation__c confirmation,Object receipt) {
        confirmation.Receipt__c=JSON.serialize(receipt); update as system confirmation;
    }
    public static String updateSubject(String objectName,String recordId,List<CardstackPreviewUpdateAction.PatchEntry> changes,String policyRevision) {
        Map<String,String> values=new Map<String,String>();
        for (CardstackPreviewUpdateAction.PatchEntry entry:changes) {
            if (entry==null || String.isBlank(entry.fieldApiName)) throw new CardstackException('Invalid field change.');
            String field=entry.fieldApiName.trim().toLowerCase();
            if (values.containsKey(field)) throw new CardstackException('Duplicate field change.');
            values.put(field,entry.newValue);
        }
        List<String> names=new List<String>(values.keySet()); names.sort();
        List<Object> pairs=new List<Object>();
        for(String name:names) pairs.add(new List<Object>{name,values.get(name)});
        return JSON.serialize(new List<Object>{'update',objectName,recordId,policyRevision,pairs});
    }
    public static String recordVersion(SObject record,List<CardstackPreviewUpdateAction.PatchEntry> changes) {
        Map<String,Object> values=new Map<String,Object>();
        for (CardstackPreviewUpdateAction.PatchEntry entry:changes) values.put(entry.fieldApiName.trim().toLowerCase(),record.get(entry.fieldApiName.trim()));
        List<String> names=new List<String>(values.keySet()); names.sort();
        List<Object> pairs=new List<Object>();
        for (String name:names) pairs.add(new List<Object>{name,values.get(name)});
        return JSON.serialize(new List<Object>{record.get('SystemModstamp'),pairs});
    }
    private static String hash(String value) { return EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256',Blob.valueOf(value))); }
    global class ConfirmToken {
        @InvocableVariable public String token;
        @InvocableVariable public String expiresAt;
    }
    public class CardstackException extends Exception {}
}
