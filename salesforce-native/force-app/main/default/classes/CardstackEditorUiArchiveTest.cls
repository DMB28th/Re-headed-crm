/** Exact historical asset integrity and permission boundary; not actual-host fault proof. */
@IsTest private with sharing class CardstackEditorUiArchiveTest {
    private static final String RECORD_DIGEST='a2a99a80ee382b9922804f720e2e7c9dd1c18cdba95988c4eea2a430e4f4d075';
    private static String address(Boolean record,String digest) {
        return 'ui://cardstack/'+(record?'record':'opportunity')+'-edit-v1-sha256-'+digest+'.html';
    }
    private static void useBody(Blob body) {
        CardstackConnectionAccess.userOverride=true;
        CardstackEditorUiArchive.overrideEnabled=true;
        CardstackEditorUiArchive.overrideBody=body;
    }
    @IsTest static void shouldServeExactRetainedReleaseBytes() {
        CardstackConnectionAccess.userOverride=true;
        List<String> recordDigests=new List<String>{RECORD_DIGEST,'5552323110417f4e8d870affa2030ce04a4b7c82e805abcca82cfdcdd28c3b56'};
        List<String> opportunityDigests=new List<String>{'c24749508bbe8ff9163e328b84916bfaed2e1fb9e36b2315f1fda86e64e8455f','e2b9d0699964d727fd6c0b113cce7f61c03062dd7ac19d96bc7eef1f175767eb'};
        Test.startTest();
        for(Boolean record:new List<Boolean>{false,true}) {
            for(String digest:(record?recordDigests:opportunityDigests)) {
                String uri=address(record,digest);
                CardstackEditorUiResource.Asset asset=CardstackEditorUiArchive.load(record?CardstackEditorUiResource.Family.RECORD:CardstackEditorUiResource.Family.OPPORTUNITY,uri);
                Assert.isNotNull(asset,'Qualified historical asset exists.');
                Assert.areEqual(uri,asset.uri,'Exact historical address is preserved.');
                Assert.areEqual(digest,EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256',Blob.valueOf(asset.html))).toLowerCase(),'Actual historical bytes match the full digest.');
            }
        }
        Test.stopTest();
    }
    @IsTest static void shouldRejectUnregisteredDigestBeforeQuery() {
        CardstackConnectionAccess.userOverride=true;
        Test.startTest();
        Assert.isNull(CardstackEditorUiArchive.load(CardstackEditorUiResource.Family.RECORD,address(true,'0000000000000000000000000000000000000000000000000000000000000000')),'Unknown digest remains unavailable.');
        Assert.areEqual(0,Limits.getQueries(),'Caller digest cannot select arbitrary resources.');
        Test.stopTest();
    }
    @IsTest static void shouldRejectCrossFamilyAddressBeforeQuery() {
        CardstackConnectionAccess.userOverride=true;
        Test.startTest();
        Assert.isNull(CardstackEditorUiArchive.load(CardstackEditorUiResource.Family.OPPORTUNITY,address(true,RECORD_DIGEST)),'Record archive never enters Opportunity family.');
        Assert.areEqual(0,Limits.getQueries(),'Cross-family request cannot query an asset.');
        Test.stopTest();
    }
    @IsTest static void shouldRejectMutableAliasBeforeQuery() {
        CardstackConnectionAccess.userOverride=true;
        Test.startTest();
        Assert.isNull(CardstackEditorUiArchive.load(CardstackEditorUiResource.Family.RECORD,'ui://cardstack/record-edit-v1.html'),'Historical registry contains immutable addresses only.');
        Assert.areEqual(0,Limits.getQueries(),'Alias resolution belongs to the current adapter.');
        Test.stopTest();
    }
    @IsTest static void shouldRejectCorruptArchivedBytes() {
        useBody(Blob.valueOf('different installed bytes'));
        Test.startTest();
        Assert.isNull(CardstackEditorUiArchive.load(CardstackEditorUiResource.Family.RECORD,address(true,RECORD_DIGEST)),'Corrupt archive cannot serve falsely addressed bytes.');
        Test.stopTest();
    }
    @IsTest static void shouldRejectMissingArchivedBytes() {
        useBody(null); Test.startTest();
        Assert.isNull(CardstackEditorUiArchive.load(CardstackEditorUiResource.Family.RECORD,address(true,RECORD_DIGEST)),'Missing archive fails closed.'); Test.stopTest();
    }
    @IsTest static void shouldRejectEmptyArchivedBytes() {
        useBody(Blob.valueOf('')); Test.startTest();
        Assert.isNull(CardstackEditorUiArchive.load(CardstackEditorUiResource.Family.RECORD,address(true,RECORD_DIGEST)),'Empty archive fails closed.'); Test.stopTest();
    }
    @IsTest static void shouldRejectUnknownUriWithoutPermissionQueries() {
        CardstackConnectionAccess.userOverride=null;
        Test.startTest();
        Assert.isNull(CardstackEditorUiArchive.load(CardstackEditorUiResource.Family.RECORD,address(true,'0000000000000000000000000000000000000000000000000000000000000000')),'Unregistered URI returns no asset without permission lookup.');
        Assert.areEqual(0,Limits.getQueries(),'Unknown fixed-registry lookup performs no authorization or resource queries.');
        Test.stopTest();
    }
    @IsTest static void shouldRequireNamedUserBeforeQuery() {
        CardstackConnectionAccess.userOverride=false; Test.startTest();
        try {
            CardstackEditorUiArchive.load(CardstackEditorUiResource.Family.RECORD,address(true,RECORD_DIGEST));
            Assert.fail('Named user gate must precede historical access.');
        } catch(CardstackConnectionTypes.ConnectionException failure) {
            Assert.areEqual('NOT_AUTHORIZED',failure.getMessage(),'Original permission boundary is unchanged.');
        }
        Assert.areEqual(0,Limits.getQueries(),'Denied actor cannot query archives.'); Test.stopTest();
    }
}
