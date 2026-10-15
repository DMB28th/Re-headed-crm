/** Stable fail-closed compatibility result. Neither this DTO nor source hashes confer authority. */
public with sharing class CardstackFlowCompatibilityReport {
    public String verdict='UNSUPPORTED';public String compilerVersion=CardstackFlowPlan.COMPILER;
    public CardstackFlowPlan.Identity identity;public String sourceHash;public String policyRevision;public String schemaCapabilityFingerprint;
    public List<Issue> issues=new List<Issue>();public List<Issue> notices=new List<Issue>();
    public with sharing class Issue {public String code,path,elementName,reason;public Boolean blocksStart=true;}
    /** Adds a safe issue without copying raw values, identifiers, or private source text. */
    public void block(String code,String path,String name) {
        Issue issue=new Issue();issue.code=code;issue.path=path;issue.elementName=name;issue.reason=code;issues.add(issue);
    }
    /** Primitive Studio transport; typed report/identity remain unchanged for publication hashing. */
    public Map<String,Object> studioView() {
        return new Map<String,Object>{'verdict'=>verdict,'compilerVersion'=>compilerVersion,'issues'=>studioIssues(issues),'notices'=>studioIssues(notices)};
    }
    private static List<Object> studioIssues(List<Issue> values) {
        List<Object> projected=new List<Object>();
        for(Issue issue:values)projected.add(new Map<String,Object>{'code'=>issue.code,'path'=>issue.path,'elementName'=>issue.elementName,'reason'=>issue.reason,'blocksStart'=>issue.blocksStart});
        return projected;
    }
}
