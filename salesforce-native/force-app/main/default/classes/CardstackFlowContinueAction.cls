/**
 * Cardstack native port of `crm_flow_continue`.
 *
 * Supplies answers a flow asked for (from crm_flow_start's pending inputs)
 * and re-renders the flow-run card. Pass the actionSessionId from
 * crm_flow_start and an answers map of input name → value. The session
 * token is verified to bind this continuation to the original flow run.
 *
 * Security: `with sharing`.
 */
global with sharing class CardstackFlowContinueAction {

    @InvocableMethod(
        label='Cardstack Flow Continue'
        description='Continue a Salesforce Flow with collected inputs. Pass the actionSessionId from Flow Start and the answers collected in chat.'
    )
    global static List<FlowContinueResponse> continueFlow(List<FlowContinueRequest> requests) {
        List<FlowContinueResponse> responses = new List<FlowContinueResponse>();
        for (FlowContinueRequest req : requests) {
            responses.add(doContinue(req));
        }
        return responses;
    }

    private static FlowContinueResponse doContinue(FlowContinueRequest req) {
        if (String.isBlank(req.recordId)) {
            throw new CardstackException('recordId is required.');
        }
        if (String.isBlank(req.flowApiName)) {
            throw new CardstackException('flowApiName is required.');
        }
        if (String.isBlank(req.actionSessionId)) {
            throw new CardstackException('actionSessionId is required — start the flow first.');
        }

        String flowApiName = req.flowApiName.trim();

        // Verify the session binds to this flow run.
        CardstackConfirmToken.verify(
            req.actionSessionId, 'flow:' + flowApiName + ':' + req.recordId);

        // Re-verify the flow is still active.
        List<FlowDefinitionView> defs = [
            SELECT ApiName, Label, IsActive
            FROM FlowDefinitionView
            WHERE ApiName = :flowApiName WITH USER_MODE LIMIT 1
        ];
        if (defs.isEmpty() || !defs[0].IsActive) {
            throw new CardstackException('Flow is not available: ' + flowApiName);
        }

        // Echo the answers for the card; the flow itself runs in Salesforce.
        List<AnswerRow> answerRows = new List<AnswerRow>();
        if (req.answers != null) {
            for (CardstackPreviewUpdateAction.PatchEntry a : req.answers) {
                AnswerRow ar = new AnswerRow();
                ar.inputName = a.fieldApiName;
                ar.value = a.newValue;
                answerRows.add(ar);
            }
        }

        // Refresh the session for further continues.
        CardstackConfirmToken.ConfirmToken refreshed =
            CardstackConfirmToken.mint('flow:' + flowApiName + ':' + req.recordId);

        FlowContinueResponse res = new FlowContinueResponse();
        res.flowApiName = flowApiName;
        res.flowLabel = defs[0].Label;
        res.recordId = req.recordId;
        res.answers = answerRows;
        res.answerCount = answerRows.size();
        res.hasAnswers = !answerRows.isEmpty();
        res.actionSessionId = refreshed.token;
        res.flowUrl = URL.getOrgDomainUrl().toExternalForm()
            + '/flow/' + flowApiName + '?recordId=' + req.recordId;
        res.summary = 'Flow "' + defs[0].Label + '" continuing with '
            + answerRows.size() + ' answer(s). Reply in chat with the next values, '
            + 'or open it in Salesforce to proceed there.';
        // Guided-card fields.
        res.status = 'In Progress';
        res.statusVariant = 'info';
        res.currentStep = answerRows.size() + 1;
        res.totalSteps = null;
        res.stepLabel = 'Collecting inputs';
        res.stepText = 'Step ' + res.currentStep;
        res.nextPrompt = 'Reply in chat with the next values this flow needs, '
            + 'or open the flow in Salesforce from the card to continue its screens.';
        res.isQuickAction = false;
        res.suggestedReplies = new List<CardstackFlowStartAction.SuggestedReply>();
        return res;
    }

    global class FlowContinueRequest {
        @InvocableVariable(label='Record ID' description='Id of the record the flow runs on.' required=true)
        public String recordId;

        @InvocableVariable(label='Flow API Name' description='API name of the flow.' required=true)
        public String flowApiName;

        @InvocableVariable(label='Action Session ID' description='Session token from Flow Start.' required=true)
        public String actionSessionId;

        @InvocableVariable(label='Answers' description='Flow input name → value collected from the rep.')
        public List<CardstackPreviewUpdateAction.PatchEntry> answers;
    }

    global class FlowContinueResponse {
        @InvocableVariable(label='Flow API Name')
        public String flowApiName;

        @InvocableVariable(label='Flow Label')
        public String flowLabel;

        @InvocableVariable(label='Record ID')
        public String recordId;

        @InvocableVariable(label='Answers')
        public List<AnswerRow> answers;

        @InvocableVariable(label='Answer Count')
        public Integer answerCount;

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
        public List<CardstackFlowStartAction.SuggestedReply> suggestedReplies;
    }

    global class AnswerRow {
        @InvocableVariable public String inputName;
        @InvocableVariable public String value;
    }

    public class CardstackException extends Exception {}
}
