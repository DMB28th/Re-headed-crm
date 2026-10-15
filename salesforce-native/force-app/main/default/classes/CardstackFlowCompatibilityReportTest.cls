/** Studio transport contains primitive maps/lists rather than unannotated Apex DTOs. */
@IsTest
private with sharing class CardstackFlowCompatibilityReportTest {
    @IsTest static void acquisitionFailureProjectsVisibleVerdictAndIssue() {
        CardstackFlowCompatibilityReport report=new CardstackFlowCompatibilityReport();
        report.verdict='ACQUISITION_FAILED';report.block('METADATA_ACCESS_DENIED','$acquisition',null);
        Test.startTest();Map<String,Object> view=report.studioView();Test.stopTest();
        Assert.areEqual('ACQUISITION_FAILED',view.get('verdict'),'Native Studio receives a visible verdict.');
        List<Object> issues=(List<Object>)view.get('issues');
        Assert.areEqual(1,issues.size(),'Acquisition failure retains its issue.');
        Map<String,Object> issue=(Map<String,Object>)issues[0];
        Assert.areEqual('METADATA_ACCESS_DENIED',issue.get('code'),'Safe acquisition code survives transport.');
        Assert.areEqual('$acquisition',issue.get('path'),'Metadata path survives transport.');
        Assert.areEqual(true,issue.get('blocksStart'),'Failure never advertises start authority.');
        Assert.areEqual('METADATA_ACCESS_DENIED',issue.get('reason'),'Failure remains explicit.');
    }
    @IsTest static void supportedProjectionRetainsNoticesWithoutPrivateIdentityOrDtoMembers() {
        CardstackFlowCompatibilityReport report=new CardstackFlowCompatibilityReport();report.verdict='SUPPORTED';
        report.identity=CardstackFlowTestData.identity();report.sourceHash='source-hash';
        CardstackFlowCompatibilityReport.Issue notice=new CardstackFlowCompatibilityReport.Issue();
        notice.code='PRESENTATION_PROPERTY_NORMALIZED';notice.path='$.screens[0].locationX';notice.reason=notice.code;notice.blocksStart=false;report.notices.add(notice);
        String original=JSON.serialize(report);
        Test.startTest();Map<String,Object> view=report.studioView();Test.stopTest();
        Assert.areEqual('SUPPORTED',view.get('verdict'),'Projection preserves the actual verdict.');
        Assert.areEqual(CardstackFlowPlan.COMPILER,view.get('compilerVersion'),'Compiler interpretation is explicit.');
        Assert.isFalse(view.containsKey('identity'),'Private definition/version identities stay in stored authority.');
        Assert.areEqual(0,((List<Object>)view.get('issues')).size(),'Supported report remains issue-free.');
        Map<String,Object> projected=(Map<String,Object>)((List<Object>)view.get('notices'))[0];
        Assert.areEqual(false,projected.get('blocksStart'),'A presentation notice remains nonblocking.');
        Assert.areEqual('$.screens[0].locationX',projected.get('path'),'Notice is a primitive map with its exact path.');
        Assert.areEqual(original,JSON.serialize(report),'Transport projection cannot mutate the publication report/hash body.');
    }
}
