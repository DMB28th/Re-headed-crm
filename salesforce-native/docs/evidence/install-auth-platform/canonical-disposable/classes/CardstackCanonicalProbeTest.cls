/** Source-only synthetic fixture tests. Seams cannot establish live Salesforce authentication. */
@IsTest private with sharing class CardstackCanonicalProbeTest {
    private static final String UI_URI='ui://cardstack/apex-transport-probe.html';
    private static final String BASE='https://example.my.salesforce-sites.com/probe';
    private static final String ISSUER='https://example.my.salesforce.com';
    private static Map<String,Object> values() {
        return new Map<String,Object>{'text'=>'café ✓ "quoted"','amount'=>0,'accepted'=>false,
            'choice'=>'beta','rating'=>'hot','notes'=>'first\nsecond','enabled'=>false};
    }
    private static void context(Boolean named,Boolean usePermission) {
        CardstackCanonicalProbe.testNamed=named;
        CardstackCanonicalProbe.testUse=usePermission;
        CardstackCanonicalProbe.testBase=BASE;
        CardstackCanonicalProbe.testPrefix='/probe';
        CardstackCanonicalProbe.testIssuer=ISSUER;
    }
    private static RestResponse invoke(String path,String method,String body) {
        RestRequest req=new RestRequest();req.requestURI=path;req.httpMethod=method;
        if(body!=null) req.requestBody=Blob.valueOf(body);
        RestContext.request=req;RestContext.response=new RestResponse();
        if(method=='GET') CardstackCanonicalProbe.get();
        else if(method=='DELETE') CardstackCanonicalProbe.remove();
        else CardstackCanonicalProbe.post();
        return RestContext.response;
    }
    private static RestResponse rpc(String method,Object params) {
        return invoke('/services/apexrest/cardstack/v1/chatgpt/mcp','POST',JSON.serialize(
            new Map<String,Object>{'jsonrpc'=>'2.0','id'=>1,'method'=>method,'params'=>params}));
    }
    private static Map<String,Object> parsed(RestResponse response) {
        Assert.isNotNull(response.responseBody,'Expected JSON response');
        return (Map<String,Object>)JSON.deserializeUntyped(response.responseBody.toString());
    }
    private static Map<String,Object> result(RestResponse response) {
        Map<String,Object> body=parsed(response);
        Assert.isTrue(body.containsKey('result'),'Valid request produces a result');
        return (Map<String,Object>)body.get('result');
    }
    private static void assertError(RestResponse response,Integer code) {
        Map<String,Object> body=parsed(response);
        Assert.areEqual(200,response.statusCode,'RPC error uses HTTP200');
        Assert.areEqual(code,((Map<String,Object>)body.get('error')).get('code'),'Exact protocol error');
    }
    private static RestResponse echo(Object args) {
        return rpc('tools/call',new Map<String,Object>{'name'=>'echo_cardstack_values','arguments'=>args});
    }
    @IsTest static void publicMetadataHasExactShape() {
        Test.startTest();
        context(false,false); RestResponse r=invoke('/services/apexrest/cardstack/v1/chatgpt/metadata','GET',null); Assert.areEqual(200,r.statusCode,'Public metadata'); Assert.areEqual(new Map<String,Object>{'resource'=>BASE+'/services/apexrest/cardstack/v1/chatgpt/mcp','authorization_servers'=>new List<Object>{ISSUER},'scopes_supported'=>new List<Object>{'api','refresh_token'},'bearer_methods_supported'=>new List<Object>{'header'}},parsed(r),'Only public descriptor fields'); Assert.areEqual(0,Limits.getQueries(),'No public queries');
        Test.stopTest();
    }
    @IsTest static void prefixAppearsOnce() {
        Test.startTest();
        context(false,false); Assert.areEqual(BASE+'/services/apexrest/cardstack/v1/claude/mcp',parsed(invoke('/probe/services/apexrest/cardstack/v1/claude/metadata','GET',null)).get('resource'),'Prefix already present in platform base');
        Test.stopTest();
    }
    @IsTest static void resourceRelativeRouteAccepted() {
        Test.startTest();
        context(false,false); Assert.areEqual(200,invoke('/cardstack/v1/claude/metadata','GET',null).statusCode,'Documented resource-relative representation');
        Test.stopTest();
    }
    @IsTest static void prefixResourceRouteAccepted() {
        Test.startTest();
        context(false,false); Assert.areEqual(200,invoke('/probe/cardstack/v1/chatgpt/metadata','GET',null).statusCode,'Documented prefixed relative representation');
        Test.stopTest();
    }
    @IsTest static void prefixWithoutLeadingSlashAccepted() {
        Test.startTest();
        context(false,false); CardstackCanonicalProbe.testPrefix='probe'; Assert.areEqual(200,invoke('/probe/cardstack/v1/chatgpt/metadata','GET',null).statusCode,'Site prefix leading slash normalized only');
        Test.stopTest();
    }
    @IsTest static void nestedRouteDenied() {
        Test.startTest();
        context(false,false); Assert.areEqual(404,invoke('/nested/services/apexrest/cardstack/v1/chatgpt/metadata','GET',null).statusCode,'Nested path denied');
        Test.stopTest();
    }
    @IsTest static void unknownClientDenied() {
        Test.startTest();
        context(false,false); Assert.areEqual(404,invoke('/services/apexrest/cardstack/v1/other/metadata','GET',null).statusCode,'Unknown client denied');
        Test.stopTest();
    }
    @IsTest static void unknownLeafDenied() {
        Test.startTest();
        context(false,false); Assert.areEqual(404,invoke('/services/apexrest/cardstack/v1/chatgpt/identity','GET',null).statusCode,'No identity endpoint');
        Test.stopTest();
    }
    @IsTest static void querySuffixDenied() {
        Test.startTest();
        context(false,false); Assert.areEqual(404,invoke('/services/apexrest/cardstack/v1/chatgpt/metadata?x=1','GET',null).statusCode,'Query suffix denied');
        Test.stopTest();
    }
    @IsTest static void encodedSlashDenied() {
        Test.startTest();
        context(false,false); Assert.areEqual(404,invoke('/services/apexrest/cardstack/v1/chatgpt%2fmcp','GET',null).statusCode,'Encoded slash denied');
        Test.stopTest();
    }
    @IsTest static void extraPathDenied() {
        Test.startTest();
        context(false,false); Assert.areEqual(404,invoke('/services/apexrest/cardstack/v1/chatgpt/metadata/more','GET',null).statusCode,'Extra path denied');
        Test.stopTest();
    }
    @IsTest static void nonSiteFailsClosed() {
        Test.startTest();
        context(false,false); CardstackCanonicalProbe.testBase=''; Assert.areEqual(503,invoke('/services/apexrest/cardstack/v1/chatgpt/metadata','GET',null).statusCode,'Non-Site context unavailable');
        Test.stopTest();
    }
    @IsTest static void insecureSiteFailsClosed() {
        Test.startTest();
        context(false,false); CardstackCanonicalProbe.testBase='http://example.my.salesforce-sites.com/probe'; Assert.areEqual(503,invoke('/services/apexrest/cardstack/v1/chatgpt/metadata','GET',null).statusCode,'HTTP context denied');
        Test.stopTest();
    }
    @IsTest static void contextPrefixMismatchFailsClosed() {
        Test.startTest();
        context(false,false); CardstackCanonicalProbe.testPrefix='/wrong'; Assert.areEqual(503,invoke('/services/apexrest/cardstack/v1/chatgpt/metadata','GET',null).statusCode,'Mismatch fails closed');
        Test.stopTest();
    }
    @IsTest static void guestChallengeIsExact() {
        Test.startTest();
        context(false,false); RestResponse r=invoke('/services/apexrest/cardstack/v1/chatgpt/mcp','POST','{'); Assert.areEqual(401,r.statusCode,'Auth before body parse'); Assert.areEqual('Bearer resource_metadata="'+BASE+'/services/apexrest/cardstack/v1/chatgpt/metadata", scope="api refresh_token"',r.headers.get('WWW-Authenticate'),'Exact sibling pointer'); Assert.areEqual(0,Limits.getQueries(),'No anonymous resource read');
        Test.stopTest();
    }
    @IsTest static void guestGetAuthenticatesBefore405() {
        Test.startTest();
        context(false,false); Assert.areEqual(401,invoke('/services/apexrest/cardstack/v1/claude/mcp','GET',null).statusCode,'GET auth first');
        Test.stopTest();
    }
    @IsTest static void guestDeleteAuthenticatesBefore405() {
        Test.startTest();
        context(false,false); Assert.areEqual(401,invoke('/services/apexrest/cardstack/v1/claude/mcp','DELETE',null).statusCode,'DELETE auth first');
        Test.stopTest();
    }
    @IsTest static void namedNoUseDeniedBeforeResource() {
        Test.startTest();
        context(true,false); RestResponse r=rpc('resources/read',new Map<String,Object>{'uri'=>UI_URI}); Assert.areEqual(403,r.statusCode,'Missing current Use denied'); Assert.areEqual(0,Limits.getQueries(),'No query before permission');
        Test.stopTest();
    }
    @IsTest static void permissionRemovalAppliesNextCall() {
        Test.startTest();
        context(true,true); Assert.areEqual(200,rpc('ping',null).statusCode,'First call allowed'); CardstackCanonicalProbe.testUse=false; Assert.areEqual(403,rpc('ping',null).statusCode,'Next call checks current permission');
        Test.stopTest();
    }
    @IsTest static void namedGetReturns405() {
        Test.startTest();
        context(true,true); Assert.areEqual(405,invoke('/services/apexrest/cardstack/v1/chatgpt/mcp','GET',null).statusCode,'Named GET unavailable');
        Test.stopTest();
    }
    @IsTest static void namedDeleteReturns405() {
        Test.startTest();
        context(true,true); Assert.areEqual(405,invoke('/services/apexrest/cardstack/v1/chatgpt/mcp','DELETE',null).statusCode,'Named DELETE unavailable');
        Test.stopTest();
    }
    @IsTest static void notificationHasNoBody() {
        Test.startTest();
        context(true,true); RestResponse r=invoke('/services/apexrest/cardstack/v1/chatgpt/mcp','POST','{"jsonrpc":"2.0","method":"notifications/initialized"}'); Assert.areEqual(202,r.statusCode,'Notification accepted'); Assert.isNull(r.responseBody,'No body');
        Test.stopTest();
    }
    @IsTest static void failedEchoNotificationHasNoBody() {
        Test.startTest();
        context(true,true); RestResponse r=invoke('/services/apexrest/cardstack/v1/chatgpt/mcp','POST','{"jsonrpc":"2.0","method":"tools/call","params":false}'); Assert.areEqual(202,r.statusCode,'Notification even invalid params'); Assert.isNull(r.responseBody,'No error body');
        Test.stopTest();
    }
    @IsTest static void juneInitializeSupported() {
        Test.startTest();
        context(true,true); Assert.areEqual('2025-06-18',result(rpc('initialize',new Map<String,Object>{'protocolVersion'=>'2025-06-18'})).get('protocolVersion'),'June version');
        Test.stopTest();
    }
    @IsTest static void novemberInitializeSupported() {
        Test.startTest();
        context(true,true); Assert.areEqual('2025-11-25',result(rpc('initialize',new Map<String,Object>{'protocolVersion'=>'2025-11-25'})).get('protocolVersion'),'November version');
        Test.stopTest();
    }
    @IsTest static void initializeInvalidTypeDenied() {
        Test.startTest();
        context(true,true); assertError(rpc('initialize',new Map<String,Object>{'protocolVersion'=>67}),-32602);
        Test.stopTest();
    }
    @IsTest static void exactSevenTypedEcho() {
        Test.startTest();
        context(true,true); Assert.areEqual(values(),result(echo(values())).get('structuredContent'),'Exact seven keys types values'); Assert.areEqual(0,Limits.getDmlStatements(),'No mutation'); Assert.areEqual(0,Limits.getCallouts(),'No callouts');
        Test.stopTest();
    }
    @IsTest static void emptyTextRetained() {
        Test.startTest();
        context(true,true); Map<String,Object> v=values();v.put('text',''); Assert.areEqual(v,result(echo(v)).get('structuredContent'),'Empty text retained with full fixture');
        Test.stopTest();
    }
    @IsTest static void freshReloadHasNoSharedState() {
        Test.startTest();
        context(true,true); Assert.areEqual(values(),result(echo(values())).get('structuredContent'),'First exchange'); Assert.areEqual(new Map<String,Object>{'status'=>'ready'},result(rpc('tools/call',new Map<String,Object>{'name'=>'open_cardstack_apex_probe','arguments'=>new Map<String,Object>()})).get('structuredContent'),'Fresh open remains constant');
        Test.stopTest();
    }
    @IsTest static void missingEchoKeyDenied() {
        Test.startTest();
        context(true,true); Map<String,Object> v=values();v.remove('enabled');assertError(echo(v),-32602);
        Test.stopTest();
    }
    @IsTest static void extraEchoKeyDenied() {
        Test.startTest();
        context(true,true); Map<String,Object> v=values();v.put('recordId','private');assertError(echo(v),-32602);
        Test.stopTest();
    }
    @IsTest static void wrongBooleanDenied() {
        Test.startTest();
        context(true,true); Map<String,Object> v=values();v.put('enabled','false');assertError(echo(v),-32602);
        Test.stopTest();
    }
    @IsTest static void wrongNumberDenied() {
        Test.startTest();
        context(true,true); Map<String,Object> v=values();v.put('amount','0');assertError(echo(v),-32602);
        Test.stopTest();
    }
    @IsTest static void wrongStringDenied() {
        Test.startTest();
        context(true,true); Map<String,Object> v=values();v.put('text',false);assertError(echo(v),-32602);
        Test.stopTest();
    }
    @IsTest static void nullEchoDenied() {
        Test.startTest();
        context(true,true); Map<String,Object> v=values();v.put('text',null);assertError(echo(v),-32602);
        Test.stopTest();
    }
    @IsTest static void longStringDenied() {
        Test.startTest();
        context(true,true); Map<String,Object> v=values();v.put('notes','x'.repeat(1001));assertError(echo(v),-32602);
        Test.stopTest();
    }
    @IsTest static void malformedJsonDenied() {
        Test.startTest();
        context(true,true); assertError(invoke('/services/apexrest/cardstack/v1/chatgpt/mcp','POST','{'),-32700);
        Test.stopTest();
    }
    @IsTest static void batchDenied() {
        Test.startTest();
        context(true,true); assertError(invoke('/services/apexrest/cardstack/v1/chatgpt/mcp','POST','[]'),-32600);
        Test.stopTest();
    }
    @IsTest static void wrongIdDenied() {
        Test.startTest();
        context(true,true); assertError(invoke('/services/apexrest/cardstack/v1/chatgpt/mcp','POST','{"jsonrpc":"2.0","id":true,"method":"ping"}'),-32600);
        Test.stopTest();
    }
    @IsTest static void unknownMethodDenied() {
        Test.startTest();
        context(true,true); assertError(rpc('records/delete',null),-32601);
        Test.stopTest();
    }
    @IsTest static void invalidParamsDenied() {
        Test.startTest();
        context(true,true); assertError(rpc('tools/call',false),-32602);
        Test.stopTest();
    }
    @IsTest static void oversizedBodyDenied() {
        Test.startTest();
        context(true,true); assertError(invoke('/services/apexrest/cardstack/v1/chatgpt/mcp','POST','x'.repeat(16385)),-32600);
        Test.stopTest();
    }
    @IsTest static void exactBodyLimitNotSizeError() {
        Test.startTest();
        context(true,true); assertError(invoke('/services/apexrest/cardstack/v1/chatgpt/mcp','POST','x'.repeat(16384)),-32700);
        Test.stopTest();
    }
    @IsTest static void unknownResourceDenied() {
        Test.startTest();
        context(true,true); assertError(rpc('resources/read',new Map<String,Object>{'uri'=>'ui://unknown'}),-32602);
        Test.stopTest();
    }
    @IsTest static void missingResourceExplicitError() {
        Test.startTest();
        context(true,true); CardstackCanonicalProbe.testResourceMissing=true;assertError(rpc('resources/read',new Map<String,Object>{'uri'=>UI_URI}),-32603);
        Test.stopTest();
    }
    @IsTest static void resourceHashMatchesFrozenBytes() {
        Test.startTest();
        context(true,true); List<Object> contents=(List<Object>)result(rpc('resources/read',new Map<String,Object>{'uri'=>UI_URI})).get('contents'); Map<String,Object> r=(Map<String,Object>)contents[0]; Assert.areEqual(UI_URI,r.get('uri'),'Exact renderer URI');Assert.areEqual('text/html;profile=mcp-app',r.get('mimeType'),'Exact MIME'); Assert.areEqual('2ca5d8564f646d661763dfc924d49133ad66e43d195f990a690d47eb73ea758f',EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256',Blob.valueOf((String)r.get('text')))),'Deployed immutable resource hash');
        Test.stopTest();
    }
    @IsTest static void echoToolIsAppOnly() {
        Test.startTest();
        context(true,true); List<Object> tools=(List<Object>)result(rpc('tools/list',null)).get('tools'); Assert.areEqual(2,tools.size(),'Exactly two tools'); Map<String,Object> echoTool=(Map<String,Object>)tools[1];Assert.areEqual(new List<Object>{'app'},((Map<String,Object>)((Map<String,Object>)echoTool.get('_meta')).get('ui')).get('visibility'),'App-only helper');
        Test.stopTest();
    }
    @IsTest static void openToolLinksRenderer() {
        Test.startTest();
        context(true,true); List<Object> tools=(List<Object>)result(rpc('tools/list',null)).get('tools'); Map<String,Object> tool=(Map<String,Object>)tools[0];Assert.areEqual(UI_URI,((Map<String,Object>)((Map<String,Object>)tool.get('_meta')).get('ui')).get('resourceUri'),'Tool resource link');
        Test.stopTest();
    }
    @IsTest static void hostileHeadersIgnored() {
        Test.startTest();
        context(false,false); RestRequest req=new RestRequest();req.requestURI='/services/apexrest/cardstack/v1/chatgpt/metadata';req.httpMethod='GET';req.addHeader('Host','hostile.invalid');req.addHeader('Forwarded','host=hostile.invalid;proto=http');RestContext.request=req;RestContext.response=new RestResponse();CardstackCanonicalProbe.get();Assert.areEqual(BASE+'/services/apexrest/cardstack/v1/chatgpt/mcp',parsed(RestContext.response).get('resource'),'Public context ignores caller headers');
        Test.stopTest();
    }
    @IsTest static void routeCaseMustBeExact() {
        Test.startTest();
        context(false,false); Assert.areEqual(404,invoke('/services/apexrest/cardstack/v1/CHATGPT/metadata','GET',null).statusCode,'Apex String operator case folding must not broaden routes');
        Test.stopTest();
    }
    @IsTest static void uriCaseMustBeExact() {
        Test.startTest();
        context(true,true); assertError(rpc('resources/read',new Map<String,Object>{'uri'=>'UI://cardstack/apex-transport-probe.html'}),-32602);
        Test.stopTest();
    }
    @IsTest static void methodCaseMustBeExact() {
        Test.startTest();
        context(true,true); assertError(rpc('TOOLS/LIST',null),-32601);
        Test.stopTest();
    }
    @IsTest static void parsedQueryParamsDenied() {
        Test.startTest();
        context(false,false);RestRequest req=new RestRequest();req.requestURI='/services/apexrest/cardstack/v1/chatgpt/metadata';req.httpMethod='GET';req.addParameter('extra','1');RestContext.request=req;RestContext.response=new RestResponse();CardstackCanonicalProbe.get();Assert.areEqual(404,RestContext.response.statusCode,'Parsed query params denied');
        Test.stopTest();
    }
    @IsTest static void guestHtmlDenied() {
        Test.startTest();
        context(false,false);Assert.areEqual(401,rpc('resources/read',new Map<String,Object>{'uri'=>UI_URI}).statusCode,'Anonymous HTML unavailable');Assert.areEqual(0,Limits.getQueries(),'No anonymous static resource lookup');
        Test.stopTest();
    }
    @IsTest static void guestToolDenied() {
        Test.startTest();
        context(false,false);Assert.areEqual(401,echo(values()).statusCode,'Anonymous tool execution unavailable');
        Test.stopTest();
    }
    @IsTest static void noUseGetDenied() {
        Test.startTest();
        context(true,false);Assert.areEqual(403,invoke('/services/apexrest/cardstack/v1/chatgpt/mcp','GET',null).statusCode,'Permission before GET405');
        Test.stopTest();
    }
    @IsTest static void noUseDeleteDenied() {
        Test.startTest();
        context(true,false);Assert.areEqual(403,invoke('/services/apexrest/cardstack/v1/chatgpt/mcp','DELETE',null).statusCode,'Permission before DELETE405');
        Test.stopTest();
    }
    @IsTest static void resourceCspForbidsRemoteDomains() {
        Test.startTest();
        context(true,true);List<Object> contents=(List<Object>)result(rpc('resources/read',new Map<String,Object>{'uri'=>UI_URI})).get('contents');Map<String,Object> r=(Map<String,Object>)contents[0];Assert.areEqual(new Map<String,Object>{'connectDomains'=>new List<Object>(),'resourceDomains'=>new List<Object>(),'frameDomains'=>new List<Object>()},((Map<String,Object>)((Map<String,Object>)r.get('_meta')).get('ui')).get('csp'),'No remote requests/resources/frames');
        Test.stopTest();
    }
    @IsTest static void rootSiteMetadataPrefixEmpty() {
        Test.startTest();
        context(false,false);CardstackCanonicalProbe.testPrefix='';CardstackCanonicalProbe.testBase='https://example.my.salesforce-sites.com';Assert.areEqual('https://example.my.salesforce-sites.com/services/apexrest/cardstack/v1/chatgpt/mcp',parsed(invoke('/cardstack/v1/chatgpt/metadata','GET',null)).get('resource'),'Root Site URL has no duplicated slash');
        Test.stopTest();
    }
    @IsTest static void invalidUtf8IsParseError() {
        context(true,true);
        RestRequest req=new RestRequest();req.requestURI='/services/apexrest/cardstack/v1/chatgpt/mcp';req.httpMethod='POST';
        req.requestBody=EncodingUtil.base64Decode('/w==');RestContext.request=req;RestContext.response=new RestResponse();
        Test.startTest();CardstackCanonicalProbe.post();Test.stopTest();
        assertError(RestContext.response,-32700);
    }
}
