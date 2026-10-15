/** Native editor resource behavior; no host cache or frontend behavior is simulated. */
@IsTest private with sharing class CardstackEditorUiResourceTest {
    private static final String FIRST_HASH = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
    private static final String SECOND_HASH = '88d4266fd4e6338d13b845fcf289579d209c897823b9217da3e161936f031589';
    private static void install(Blob body) {
        CardstackConnectionAccess.userOverride=true;
        CardstackOpportunityMcpAdapter.resourceOverrideEnabled=true;
        CardstackOpportunityMcpAdapter.resourceOverride=body;
        CardstackRecordMcpAdapter.resourceOverrideEnabled=true;
        CardstackRecordMcpAdapter.resourceOverride=body;
    }
    private static String address(Boolean record,String digest) {
        return 'ui://cardstack/'+(record?'record':'opportunity')+'-edit-v1-sha256-'+digest+'.html';
    }
    private static List<Object> tools(Boolean record) {
        return record?CardstackRecordMcpAdapter.tools():CardstackOpportunityMcpAdapter.tools();
    }
    private static Map<String,Object> meta(Boolean record) {
        List<Object> descriptors=tools(record);
        return (Map<String,Object>)((Map<String,Object>)descriptors[0]).get('_meta');
    }
    private static String uri(Boolean record) {
        return (String)((Map<String,Object>)meta(record).get('ui')).get('resourceUri');
    }
    private static Map<String,Object> read(Boolean record,String requested) {
        return record?CardstackRecordMcpAdapter.readResource(requested):CardstackOpportunityMcpAdapter.readResource(requested);
    }
    private static Map<String,Object> content(Map<String,Object> resource) {
        Assert.isNotNull(resource,'An exact current address serves one resource.');
        List<Object> contents=(List<Object>)resource.get('contents');
        Assert.areEqual(1,contents.size(),'Only one resource is served.');
        return (Map<String,Object>)contents[0];
    }
    private static Map<String,Object> rpc(String method,Object params) {
        return CardstackMcpDispatcher.handle('claude',new Map<String,Object>{'jsonrpc'=>'2.0','id'=>'resource-test','method'=>method,'params'=>params});
    }
    @IsTest static void shouldKeepAddress_WhenInstalledBytesUnchanged() {
        install(Blob.valueOf('abc')); Test.startTest();
        for(Boolean record:new List<Boolean>{false,true}) {
            Assert.areEqual(address(record,FIRST_HASH),uri(record),'Full known SHA256 identifies exact installed bytes.');
            Assert.areEqual(address(record,FIRST_HASH),uri(record),'Unchanged bytes retain the same address.');
        } Test.stopTest();
    }
    @IsTest static void shouldChangeAddress_WhenInstalledBytesChange() {
        install(Blob.valueOf('abc')); Test.startTest(); String oldOpportunity=uri(false),oldRecord=uri(true);
        install(Blob.valueOf('abcd'));
        Assert.areEqual(address(false,SECOND_HASH),uri(false),'Changed Opportunity bytes advertise a different content address.');
        Assert.areEqual(address(true,SECOND_HASH),uri(true),'Changed Contact bytes advertise a different content address.');
        Assert.areNotEqual(oldOpportunity,uri(false),'No constant Opportunity address.');
        Assert.areNotEqual(oldRecord,uri(true),'No constant Contact address.'); Test.stopTest();
    }
    @IsTest static void shouldBindServedBody_WhenAddressIsCurrent() {
        install(Blob.valueOf('abc')); Test.startTest();
        for(Boolean record:new List<Boolean>{false,true}) {
            Map<String,Object> served=content(read(record,address(record,FIRST_HASH)));
            Assert.areEqual('abc',served.get('text'),'Exact installed text is served.');
            String digest=EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256',Blob.valueOf((String)served.get('text')))).toLowerCase();
            Assert.areEqual(FIRST_HASH,digest,'Served bytes match independently known fixture digest.');
            Assert.areEqual(address(record,digest),served.get('uri'),'Response URI binds the actual served bytes.');
        } Test.stopTest();
    }
    @IsTest static void shouldAgreeAcrossMetadataListAndRead() {
        install(Blob.valueOf('abc')); Test.startTest();
        List<Object> resources=(List<Object>)((Map<String,Object>)rpc('resources/list',new Map<String,Object>()).get('result')).get('resources');
        Set<String> listed=new Set<String>(); for(Object row:resources) listed.add((String)((Map<String,Object>)row).get('uri'));
        Assert.areEqual(new Set<String>{'ui://cardstack/connection-diagnostic-v1.html',address(false,FIRST_HASH),address(true,FIRST_HASH)},listed,'Only current editor addresses and unchanged diagnostic resource listed.');
        for(Boolean record:new List<Boolean>{false,true}) {
            String expected=address(record,FIRST_HASH); Assert.areEqual(expected,meta(record).get('openai/outputTemplate'),'Model-visible compatibility alias agrees.');
            List<Object> descriptors=tools(record);
            for(Integer index=0;index<descriptors.size();index++) {
                Map<String,Object> descriptorMeta=(Map<String,Object>)((Map<String,Object>)descriptors[index]).get('_meta');
                Map<String,Object> ui=(Map<String,Object>)descriptorMeta.get('ui');
                Assert.areEqual(index==0?new List<String>{'model','app'}:new List<String>{'app'},ui.get('visibility'),'Only Open renders; family helpers remain app-only.');
                if(index==0) {
                    Assert.areEqual(expected,ui.get('resourceUri'),'Open agrees with the listed and served family address.');
                } else {
                    Assert.isFalse(ui.containsKey('resourceUri'),'Helpers return data to the current app without a render target.');
                    Assert.isFalse(descriptorMeta.containsKey('openai/outputTemplate'),'Helpers cannot advertise compatibility rendering.');
                }
                Assert.areEqual(true,descriptorMeta.get('openai/widgetAccessible'),'Every family tool remains app callable.');
            }
            Map<String,Object> response=(Map<String,Object>)rpc('resources/read',new Map<String,Object>{'uri'=>expected}).get('result');
            Assert.areEqual(expected,content(response).get('uri'),'Dispatcher serves the advertised address.');
        } Test.stopTest();
    }
    @IsTest static void shouldServeExactRetainedBytesThroughBothAdapters() {
        install(Blob.valueOf('abc')); Test.startTest();
        for(Boolean record:new List<Boolean>{false,true}) {
            String retained=address(record,record?'5552323110417f4e8d870affa2030ce04a4b7c82e805abcca82cfdcdd28c3b56':'e2b9d0699964d727fd6c0b113cce7f61c03062dd7ac19d96bc7eef1f175767eb');
            Map<String,Object> served=content(read(record,retained));
            Assert.areEqual(retained,served.get('uri'),'Archive retains exact requested address.');
            String digest=EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256',Blob.valueOf((String)served.get('text')))).toLowerCase();
            Assert.areEqual(address(record,digest),retained,'Returned archive is the exact retained body.');
            Assert.areEqual(retained,content((Map<String,Object>)rpc('resources/read',new Map<String,Object>{'uri'=>retained}).get('result')).get('uri'),'Dispatcher serves the same archived bytes.');
        } Test.stopTest();
    }
    @IsTest static void shouldServeRetainedBytes_WhenCurrentAssetIsUnavailable() {
        install(null); Test.startTest();
        String retained=address(true,'5552323110417f4e8d870affa2030ce04a4b7c82e805abcca82cfdcdd28c3b56');
        Assert.areEqual(retained,content(read(true,retained)).get('uri'),'Independent retained asset survives a missing current asset.');
        Assert.isNull(read(true,'ui://cardstack/record-edit-v1.html'),'Legacy alias never points to historical bytes.'); Test.stopTest();
    }
    @IsTest static void shouldBuildSharedDescriptorsWithoutNativeQueries() {
        CardstackConnectionAccess.userOverride=null;
        String recordUri=address(true,FIRST_HASH),opportunityUri=address(false,FIRST_HASH);
        Test.startTest();
        List<Object> descriptors=new List<Object>();
        descriptors.addAll(CardstackRecordMcpAdapter.tools(recordUri));
        descriptors.addAll(CardstackOpportunityMcpAdapter.tools(opportunityUri));
        descriptors.addAll(CardstackRecordDiscoveryMcpAdapter.tools(recordUri));
        descriptors.addAll(CardstackRelatedListMcpAdapter.tools(recordUri));
        Assert.areEqual(0,Limits.getQueries(),'Trusted schema builders perform no asset, configuration or permission reads.');
        for(Object raw:descriptors) {
            Map<String,Object> descriptor=(Map<String,Object>)raw;
            String name=(String)descriptor.get('name');
            Map<String,Object> ui=(Map<String,Object>)((Map<String,Object>)descriptor.get('_meta')).get('ui');
            assertRenderTarget(descriptor, ui);
            if(ui.containsKey('resourceUri')) Assert.areEqual(name.startsWith('cardstack_opportunity_')?opportunityUri:recordUri,ui.get('resourceUri'),'Every linked descriptor uses its supplied fixed family URI.');
        }
        Test.stopTest();
    }
    @IsTest static void shouldReadEachNativeAssetOncePerCatalog() {
        CardstackConnectionAccess.userOverride=true;
        CardstackRecordMcpAdapter.resourceOverrideEnabled=false;
        CardstackOpportunityMcpAdapter.resourceOverrideEnabled=false;
        String recordUri=CardstackRecordMcpAdapter.resourceUri(),opportunityUri=CardstackOpportunityMcpAdapter.resourceUri();
        Assert.isNotNull(recordUri,'Installed native record asset must exist for actual catalog reads.');
        Assert.isNotNull(opportunityUri,'Installed native Opportunity asset must exist for actual catalog reads.');
        Test.startTest();
        List<Object> descriptors=(List<Object>)((Map<String,Object>)rpc('tools/list',new Map<String,Object>()).get('result')).get('tools');
        Assert.areEqual(2,Limits.getQueries(),'One native StaticResource body query per family; helper schemas add none.');
        for(Object raw:descriptors) {
            Map<String,Object> descriptor=(Map<String,Object>)raw;
            String name=(String)descriptor.get('name');
            if(!name.startsWith('cardstack_record_') && !name.startsWith('cardstack_opportunity_')) continue;
            Map<String,Object> ui=(Map<String,Object>)((Map<String,Object>)descriptor.get('_meta')).get('ui');
            assertRenderTarget(descriptor, ui);
            if(ui.containsKey('resourceUri')) Assert.areEqual(name.startsWith('cardstack_opportunity_')?opportunityUri:recordUri,ui.get('resourceUri'),'Public Open and Search metadata agree with the once-loaded current family asset.');
        }
        Test.stopTest();
    }
    private static void assertRenderTarget(Map<String,Object> descriptor, Map<String,Object> ui) {
        Map<String,Object> metadata=(Map<String,Object>)descriptor.get('_meta');
        List<String> visibility=(List<String>)ui.get('visibility');
        if(visibility.size()==1 && visibility[0]=='app') {
            Assert.isFalse(ui.containsKey('resourceUri'),'Private helpers return data to the current iframe without a separate widget.');
            Assert.isFalse(metadata.containsKey('openai/outputTemplate'),'Private helpers do not advertise a legacy widget target.');
            Assert.areEqual(true,metadata.get('openai/widgetAccessible'),'Existing workspace retains app access.');
        } else {
            Assert.isTrue(ui.containsKey('resourceUri'),'Public Open and Search retain their widget-bearing family.');
        }
    }
    @IsTest static void shouldRejectWrongDigest() {
        install(Blob.valueOf('abc')); Test.startTest();
        for(Boolean record:new List<Boolean>{false,true}) {
            String wrong=address(record,SECOND_HASH); Assert.isNull(read(record,wrong),'Wrong digest never serves bytes.');
            Assert.areEqual(new Map<String,Object>{'code'=>-32602,'message'=>'Unknown resource'},rpc('resources/read',new Map<String,Object>{'uri'=>wrong}).get('error'),'Wrong digest is rejected by protocol.');
        } Test.stopTest();
    }
    @IsTest static void shouldRejectStaleDigestAfterUpgrade() {
        install(Blob.valueOf('abc')); Test.startTest(); String oldOpportunity=uri(false),oldRecord=uri(true); install(Blob.valueOf('abcd'));
        Assert.isNull(read(false,oldOpportunity),'Obsolete Opportunity address cannot return new bytes.');
        Assert.isNull(read(true,oldRecord),'Obsolete Contact address cannot return new bytes.');
        Assert.areEqual(-32602,((Map<String,Object>)rpc('resources/read',new Map<String,Object>{'uri'=>oldOpportunity}).get('error')).get('code'),'Obsolete address fails protocol validation.'); Test.stopTest();
    }
    @IsTest static void shouldRejectCrossFamilyAddresses() {
        install(Blob.valueOf('abc')); Test.startTest();
        Assert.isNull(read(false,address(true,FIRST_HASH)),'Opportunity cannot read Contact resource.');
        Assert.isNull(read(true,address(false,FIRST_HASH)),'Contact cannot read Opportunity resource.'); Test.stopTest();
    }
    @IsTest static void shouldRejectMalformedOrForeignAddresses() {
        install(Blob.valueOf('abc')); Test.startTest();
        for(Boolean record:new List<Boolean>{false,true}) {
            String expected=address(record,FIRST_HASH);
            for(String malformed:new List<String>{expected+'?x=1',expected+'#fragment',address(record,FIRST_HASH.toUpperCase()),address(record,'abc'),expected.replace('cardstack','foreign'),expected.replace('ui://','UI://'),expected.replace('.html','.html/extra')}) {
                Assert.isNull(read(record,malformed),'Only exact lowercase family content address is readable.');
                Assert.areEqual(-32602,((Map<String,Object>)rpc('resources/read',new Map<String,Object>{'uri'=>malformed}).get('error')).get('code'),'Malformed addresses fail before broad reads.');
            }
        } Test.stopTest();
    }
    @IsTest static void shouldPreserveExactLegacyReadAliases() {
        install(Blob.valueOf('abc')); Test.startTest();
        for(Boolean record:new List<Boolean>{false,true}) {
            String legacy='ui://cardstack/'+(record?'record':'opportunity')+'-edit-v1.html';
            Map<String,Object> served=content(read(record,legacy)); Assert.areEqual(legacy,served.get('uri'),'Legacy response echoes exact requested alias.');
            Assert.areEqual('abc',served.get('text'),'Legacy alias serves current bytes.'); install(Blob.valueOf('abcd'));
            Assert.areEqual('abcd',content(read(record,legacy)).get('text'),'Legacy alias deliberately remains mutable across upgrades.'); install(Blob.valueOf('abc'));
        } Test.stopTest();
    }
    private static void assertUnavailable(Blob body) {
        install(body); Test.startTest();
        for(Boolean record:new List<Boolean>{false,true}) {
            Assert.isNull(uri(record),'Unavailable asset cannot advertise a fabricated build.');
            Assert.isFalse(((Map<String,Object>)meta(record).get('ui')).containsKey('resourceUri'),'No resource target is advertised without readable native bytes.');
            List<Object> descriptors=tools(record);
            for(Integer index=0;index<descriptors.size();index++) {
                Map<String,Object> descriptorMeta=(Map<String,Object>)((Map<String,Object>)descriptors[index]).get('_meta');
                Map<String,Object> ui=(Map<String,Object>)descriptorMeta.get('ui');
                Assert.areEqual(index==0?new List<String>{'model','app'}:new List<String>{'app'},ui.get('visibility'),'Unavailable assets cannot widen app-only tool visibility.');
            }
            Assert.isFalse(meta(record).containsKey('openai/outputTemplate'),'No current output template without readable bytes.');
            String legacy='ui://cardstack/'+(record?'record':'opportunity')+'-edit-v1.html';
            Assert.isNull(read(record,legacy),'No placeholder renderer.');
            Assert.areEqual(-32603,((Map<String,Object>)rpc('resources/read',new Map<String,Object>{'uri'=>legacy}).get('error')).get('code'),'Legacy unavailable remains a sanitized unavailable error.');
        }
        List<Object> listed=(List<Object>)((Map<String,Object>)rpc('resources/list',new Map<String,Object>()).get('result')).get('resources');
        Assert.areEqual(1,listed.size(),'Unavailable editor families are omitted from resource discovery.'); Test.stopTest();
    }
    @IsTest static void shouldOmitCurrentMetadata_WhenBodyMissing() { assertUnavailable(null); }
    @IsTest static void shouldOmitCurrentMetadata_WhenBodyEmpty() { assertUnavailable(Blob.valueOf('')); }
    @IsTest static void shouldOmitCurrentMetadata_WhenBodyUnreadable() { assertUnavailable(EncodingUtil.convertFromHex('ff')); }
    @IsTest static void shouldGateResourceDiscoveryBeforeQueries() {
        CardstackConnectionAccess.userOverride=false; Test.startTest();
        try { CardstackOpportunityMcpAdapter.tools(); Assert.fail('Named-user gate is required for native resource discovery.'); }
        catch(CardstackConnectionTypes.ConnectionException failure) { Assert.areEqual('NOT_AUTHORIZED',failure.getMessage(),'Existing authorization is preserved.'); }
        Assert.areEqual(0,Limits.getQueries(),'No asset reads before authorization.'); Test.stopTest();
    }
}
