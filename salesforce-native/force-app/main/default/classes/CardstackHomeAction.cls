/** Retained Home invocable contract for installed-package and cached-call compatibility. */
global with sharing class CardstackHomeAction {
    /**
     * Returns retirement guidance without reading CRM data.
     * @param requests Cached Home requests.
     * @return One schema-compatible empty result per request.
     */
    @InvocableMethod(
        label='Cardstack Home'
        description='Home Card has been retired. Request a record or list instead.'
    )
    global static List<HomeResponse> home(List<HomeRequest> requests) {
        List<HomeResponse> responses = new List<HomeResponse>();
        for (HomeRequest request : requests) {
            responses.add(retirementResponse());
        }
        return responses;
    }

    private static HomeResponse retirementResponse() {
        HomeResponse res = new HomeResponse();
        res.userName = '';
        res.tasks = new List<HomeTask>();
        res.openTaskCount = 0;
        res.recent = new List<RecentItem>();
        res.openOpportunityCount = 0;
        res.openPipelineTotal = '';
        res.summary = 'Home Card has been retired. Request a record or list instead.';
        return res;
    }

    global class HomeRequest {
        @InvocableVariable(label='Unused' description='No inputs required; leave blank.')
        public String unused;
    }

    global class HomeResponse {
        @InvocableVariable(label='User Name')
        public String userName;

        @InvocableVariable(label='Open Tasks')
        public List<HomeTask> tasks;

        @InvocableVariable(label='Open Task Count')
        public Integer openTaskCount;

        @InvocableVariable(label='Recent Records')
        public List<RecentItem> recent;

        @InvocableVariable(label='Open Opportunity Count')
        public Integer openOpportunityCount;

        @InvocableVariable(label='Open Pipeline Total')
        public String openPipelineTotal;

        @InvocableVariable(label='Summary')
        public String summary;
    }

    global class HomeTask {
        @InvocableVariable public String recordId;
        @InvocableVariable public String subject;
        @InvocableVariable public String dueDate;
        @InvocableVariable public Boolean overdue;
    }

    global class RecentItem {
        @InvocableVariable public String recordId;
        @InvocableVariable public String name;
        @InvocableVariable public String objectLabel;
        @InvocableVariable public String touched;
        @InvocableVariable public String recordUrl;
    }
}
