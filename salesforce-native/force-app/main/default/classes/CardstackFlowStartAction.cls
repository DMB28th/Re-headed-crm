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
        description='Show a Salesforce flow launch card for a record. The user opens the card in Salesforce to run the flow; this tool does not execute the flow or collect its inputs.'
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
            SELECT ApiName, Label, IsActive, ProcessType, TriggerType
            FROM FlowDefinitionView
            WHERE ApiName = :flowApiName WITH USER_MODE LIMIT 1
        ];
        if (defs.isEmpty()) {
            throw new CardstackException('Flow not found: ' + flowApiName);
        }
        if (!defs[0].IsActive) {
            throw new CardstackException('Flow is not active: ' + flowApiName);
        }

        if ((defs[0].ProcessType != 'Flow' && defs[0].ProcessType != 'AutoLaunchedFlow')
            || (defs[0].TriggerType != null && defs[0].TriggerType != 'None')) {
            throw new CardstackException('This flow cannot be launched from a Salesforce link. Choose a screen flow or an autolaunched flow without a trigger.');
        }
        String cardLabel = launchLabel(flowApiName, defs[0].Label);

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
        res.flowLabel = cardLabel;
        res.actionSessionId = session.token;
        res.flowUrl = URL.getOrgDomainUrl().toExternalForm()
            + '/flow/' + flowApiName + '?recordId=' + req.recordId;
        res.summary = 'Ready to open "' + cardLabel + '" for ' + recordName + '. Complete the flow in Salesforce.';
        res.status = 'Ready to open';
        res.statusVariant = 'info';
        res.currentStep = 1;
        res.totalSteps = null;
        res.stepLabel = 'Salesforce launch';
        res.stepText = 'Runs in Salesforce';
        res.nextPrompt = 'Open in Salesforce to run this flow. Salesforce handles its screens, inputs, and record changes.';
        res.isQuickAction = false;
        res.hasAnswers = false;
        res.suggestedReplies = new List<CardstackFlowStartAction.SuggestedReply>();
        return res;
    }

    public static String launchLabel(String flowApiName, String fallbackLabel) {
        try {
            String raw = CardstackConfigService.getConfig('flows');
            if (String.isBlank(raw)) return fallbackLabel;
            List<Object> policies = (List<Object>) JSON.deserializeUntyped(raw);
            for (Object item : policies) {
                Map<String, Object> policy = (Map<String, Object>) item;
                String apiName = (String) (policy.containsKey('apiName') ? policy.get('apiName') : policy.get('flowApiName'));
                String label = (String) policy.get('label');
                if (apiName == flowApiName && !String.isBlank(label)) return label.trim();
            }
        } catch (Exception e) { /* Optional configuration must not prevent an otherwise valid launch. */ }
        return fallbackLabel;
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
