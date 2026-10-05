/**
 * Cardstack native port of `crm_quick_action_start`.
 *
 * Begins a configured quick action for a record (New Task, Log a Call, …).
 * Returns the action's metadata and record context so the card can render
 * the action's fields; the rep fills, confirms, and Salesforce executes
 * with its own validation.
 *
 * Security: `with sharing`.
 */
global with sharing class CardstackQuickActionStartAction {

    @InvocableMethod(
        label='Cardstack Quick Action Start'
        description='Begin a configured quick action for a record (New Task, Log a Call, …). Returns the action fields with record-context defaults for the card to render.'
    )
    global static List<QuickActionStartResponse> start(List<QuickActionStartRequest> requests) {
        List<QuickActionStartResponse> responses = new List<QuickActionStartResponse>();
        for (QuickActionStartRequest req : requests) {
            responses.add(doStart(req));
        }
        return responses;
    }

    private static QuickActionStartResponse doStart(QuickActionStartRequest req) {
        if (String.isBlank(req.recordId)) {
            throw new CardstackException('recordId is required.');
        }
        if (String.isBlank(req.actionApiName)) {
            throw new CardstackException('actionApiName is required.');
        }

        String objectName = objectNameForId(req.recordId);
        String actionName = req.actionApiName.trim();

        // Describe available quick actions for the object.
        List<QuickAction.DescribeAvailableQuickActionResult> available =
            QuickAction.describeAvailableQuickActions(objectName);
        QuickAction.DescribeAvailableQuickActionResult matched = null;
        for (QuickAction.DescribeAvailableQuickActionResult qa : available) {
            if (actionName.equalsIgnoreCase(qa.getName())) {
                matched = qa;
                break;
            }
        }
        if (matched == null) {
            List<String> names = new List<String>();
            for (QuickAction.DescribeAvailableQuickActionResult qa : available) {
                names.add(qa.getName());
            }
            throw new CardstackException(
                'Quick action "' + actionName + '" not available on ' + objectName
                + '. Available: ' + String.join(names, ', '));
        }

        // Fetch record context for defaults (name for the card header).
        String recId = req.recordId;
        List<SObject> rows = Database.query(
            'SELECT Id, Name FROM ' + objectName + ' WHERE Id = :recId WITH USER_MODE LIMIT 1'
        );
        String recordName = rows.isEmpty() ? req.recordId : String.valueOf(rows[0].get('Name'));

        // Mint a session token so continue calls bind to this action.
        CardstackConfirmToken.ConfirmToken session =
            CardstackConfirmToken.mint('quickaction:' + objectName + ':' + req.recordId + ':' + actionName);

        QuickActionStartResponse res = new QuickActionStartResponse();
        res.objectName = objectName;
        res.recordId = req.recordId;
        res.recordName = recordName;
        res.actionApiName = matched.getName();
        res.actionLabel = matched.getLabel();
        res.actionSessionId = session.token;
        res.recordUrl = URL.getOrgDomainUrl().toExternalForm() + '/' + req.recordId;
        res.summary = 'Ready to run "' + matched.getLabel() + '" on ' + recordName
            + '. Reply in chat with the field values, then confirm.';
        // Guided-card fields (compact quick-action mode).
        res.status = 'Waiting on you';
        res.statusVariant = 'warning';
        res.currentStep = 1;
        res.totalSteps = 1;
        res.stepLabel = 'Ready';
        res.stepText = 'Step 1 of 1';
        res.nextPrompt = 'Reply in chat with the field values for "' + matched.getLabel()
            + '" (for example: subject, comments, due date), then confirm to run it.';
        res.isQuickAction = true;
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

    global class QuickActionStartRequest {
        @InvocableVariable(label='Record ID' description='Id of the record to run the action on.' required=true)
        public String recordId;

        @InvocableVariable(label='Action API Name' description='API name of the quick action (e.g. NewTask, LogACall).' required=true)
        public String actionApiName;

        @InvocableVariable(label='Object API Name' description='Object API name; resolved from recordId when omitted.')
        public String objectName;
    }

    global class QuickActionStartResponse {
        @InvocableVariable(label='Object API Name')
        public String objectName;

        @InvocableVariable(label='Record ID')
        public String recordId;

        @InvocableVariable(label='Record Name')
        public String recordName;

        @InvocableVariable(label='Action API Name')
        public String actionApiName;

        @InvocableVariable(label='Action Label')
        public String actionLabel;

        @InvocableVariable(label='Action Session ID')
        public String actionSessionId;

        @InvocableVariable(label='Record URL')
        public String recordUrl;

        @InvocableVariable(label='Summary')
        public String summary;

        @InvocableVariable(label='Status' description='Waiting on you, In Progress, Complete, Failed, Cancelled.')
        public String status;

        @InvocableVariable(label='Status Variant' description='Badge variant: warning, info, success, error, secondary.')
        public String statusVariant;

        @InvocableVariable(label='Current Step' description='1-based conversational step.')
        public Integer currentStep;

        @InvocableVariable(label='Total Steps' description='1 for single-step quick actions.')
        public Integer totalSteps;

        @InvocableVariable(label='Step Label' description='Human-readable step name.')
        public String stepLabel;

        @InvocableVariable(label='Step Text' description='Preformatted step header, e.g. "Step 1 of 1".')
        public String stepText;

        @InvocableVariable(label='Next Prompt' description='What the user should type next in chat.')
        public String nextPrompt;

        @InvocableVariable(label='Is Quick Action' description='True for the compact quick-action card mode.')
        public Boolean isQuickAction;

        @InvocableVariable(label='Has Answers' description='True when answers were collected.')
        public Boolean hasAnswers;

        @InvocableVariable(label='Suggested Replies' description='Quick-reply options rendered as buttons; sent via action/sendMessage.')
        public List<CardstackFlowStartAction.SuggestedReply> suggestedReplies;
    }

    public class CardstackException extends Exception {}
}
