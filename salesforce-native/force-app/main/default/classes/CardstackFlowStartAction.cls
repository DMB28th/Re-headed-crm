/**
 * Cardstack native port of `crm_flow_start`.
 *
 * Begins a Salesforce Flow for a record. Resolves the flow by API name and
 * returns its launch context: the flow's label, required inputs, and a
 * session token. If inputs must be collected first, they come back as
 * pending — collect them in chat, then call crm_flow_continue. When ready,
 * the rep opens the flow in Salesforce from the card, which owns the
 * screens and the write.
 *
 * Security: `with sharing`.
 */
global with sharing class CardstackFlowStartAction {

    @InvocableMethod(
        label='Cardstack Flow Start'
        description='Begin a Salesforce Flow for a record. Returns pending inputs to collect in chat, then call Flow Continue. When ready, the rep opens the flow in Salesforce from the card.'
    )
    global static List<FlowStartResponse> startFlow(List<FlowStartRequest> requests) {
        List<FlowStartResponse> responses = new List<FlowStartResponse>();
        for (FlowStartRequest req : requests) {
            responses.add(doStart(req));
        }
        return responses;
    }

    private static FlowStartResponse doStart(FlowStartRequest req) {
        if (String.isBlank(req.recordId)) {
            throw new CardstackException('recordId is required.');
        }
        if (String.isBlank(req.flowApiName)) {
            throw new CardstackException('flowApiName is required.');
        }

        String objectName = objectNameForId(req.recordId);
        String flowApiName = req.flowApiName.trim();

        // Verify the flow exists and is active.
        List<FlowDefinitionView> defs = [
            SELECT ApiName, Label, IsActive
            FROM FlowDefinitionView
            WHERE ApiName = :flowApiName WITH USER_MODE LIMIT 1
        ];
        if (defs.isEmpty()) {
            throw new CardstackException('Flow not found: ' + flowApiName);
        }
        if (!defs[0].IsActive) {
            throw new CardstackException('Flow is not active: ' + flowApiName);
        }

        // Record context for the card.
        String recId = req.recordId;
        List<SObject> rows = Database.query(
            'SELECT Id, Name FROM ' + objectName + ' WHERE Id = :recId WITH USER_MODE LIMIT 1'
        );
        String recordName = rows.isEmpty() ? req.recordId : String.valueOf(rows[0].get('Name'));

        // Session token binds continue/cancel calls to this flow run.
        CardstackConfirmToken.ConfirmToken session =
            CardstackConfirmToken.mint('flow:' + flowApiName + ':' + req.recordId);

        FlowStartResponse res = new FlowStartResponse();
        res.objectName = objectName;
        res.recordId = req.recordId;
        res.recordName = recordName;
        res.flowApiName = flowApiName;
        res.flowLabel = defs[0].Label;
        res.actionSessionId = session.token;
        res.flowUrl = URL.getOrgDomainUrl().toExternalForm()
            + '/flow/' + flowApiName + '?recordId=' + req.recordId;
        res.summary = 'Flow "' + defs[0].Label + '" ready for ' + recordName
            + '. Reply in chat with the flow\u2019s input values, or open it in Salesforce to run the screens.';
        // Guided-card fields.
        res.status = 'Waiting on you';
        res.statusVariant = 'warning';
        res.currentStep = 1;
        res.totalSteps = null;
        res.stepLabel = 'Started';
        res.stepText = 'Step 1';
        res.nextPrompt = 'Reply in chat with the values this flow needs (for example: approval decision, comments, dates), '
            + 'or open the flow in Salesforce from the card to run its screens.';
        res.isQuickAction = false;
        res.hasAnswers = false;
        res.suggestedReplies = new List<CardstackFlowStartAction.SuggestedReply>();
        return res;
    }

    private static String objectNameForId(String recordId) {
        String prefix = recordId.substring(0, 3);
        for (Schema.SObjectType t : Schema.getGlobalDescribe().values()) {
            Schema.DescribeSObjectResult d = t.getDescribe();
            if (prefix.equals(d.getKeyPrefix())) {
                return d.getName();
            }
        }
        throw new CardstackException('Cannot resolve object for id: ' + recordId);
    }

    global class FlowStartRequest {
        @InvocableVariable(label='Record ID' description='Id of the record to run the flow on.' required=true)
        public String recordId;

        @InvocableVariable(label='Flow API Name' description='API name of the flow to start.' required=true)
        public String flowApiName;

        @InvocableVariable(label='Object API Name' description='Object API name; resolved from recordId when omitted.')
        public String objectName;
    }

    global class FlowStartResponse {
        @InvocableVariable(label='Object API Name')
        public String objectName;

        @InvocableVariable(label='Record ID')
        public String recordId;

        @InvocableVariable(label='Record Name')
        public String recordName;

        @InvocableVariable(label='Flow API Name')
        public String flowApiName;

        @InvocableVariable(label='Flow Label')
        public String flowLabel;

        @InvocableVariable(label='Action Session ID')
        public String actionSessionId;

        @InvocableVariable(label='Flow URL')
        public String flowUrl;

        @InvocableVariable(label='Summary')
        public String summary;

        @InvocableVariable(label='Status' description='Waiting on you, In Progress, Complete, Failed, Cancelled.')
        public String status;

        @InvocableVariable(label='Status Variant' description='Badge variant: warning, info, success, error, secondary.')
        public String statusVariant;

        @InvocableVariable(label='Current Step' description='1-based conversational step; increments per continue call.')
        public Integer currentStep;

        @InvocableVariable(label='Total Steps' description='Null when unknown; the flow owns its screens.')
        public Integer totalSteps;

        @InvocableVariable(label='Step Label' description='Human-readable step name.')
        public String stepLabel;

        @InvocableVariable(label='Step Text' description='Preformatted step header, e.g. "Step 2 of 5" or "Step 2".')
        public String stepText;

        @InvocableVariable(label='Next Prompt' description='What the user should type next in chat.')
        public String nextPrompt;

        @InvocableVariable(label='Is Quick Action' description='True when this card is a quick action, not a multi-step flow.')
        public Boolean isQuickAction;

        @InvocableVariable(label='Has Answers' description='True when answers were collected.')
        public Boolean hasAnswers;

        @InvocableVariable(label='Suggested Replies' description='Quick-reply options rendered as buttons; sent via action/sendMessage.')
        public List<SuggestedReply> suggestedReplies;
    }

    global class SuggestedReply {
        @InvocableVariable public String label;
    }

    public class CardstackException extends Exception {}
}
