/**
 * Cardstack native port of `crm_flow_cancel`.
 *
 * Cancels an in-progress flow run. Verifies the session token binds to the
 * flow run being cancelled, then reports cancellation. No Salesforce-side
 * interview state is persisted (the flow runs in the CRM), so cancellation
 * is a session invalidation + confirmation.
 *
 * Security: `with sharing`.
 */
global with sharing class CardstackFlowCancelAction {

    @InvocableMethod(
        label='Cardstack Flow Cancel'
        description='Cancel an in-progress Salesforce Flow run. Pass the actionSessionId from Flow Start.'
    )
    global static List<FlowCancelResponse> cancelFlow(List<FlowCancelRequest> requests) {
        List<FlowCancelResponse> responses = new List<FlowCancelResponse>();
        for (FlowCancelRequest req : requests) {
            responses.add(doCancel(req));
        }
        return responses;
    }

    private static FlowCancelResponse doCancel(FlowCancelRequest req) {
        if (String.isBlank(req.flowApiName)) {
            throw new CardstackException('flowApiName is required.');
        }
        if (String.isBlank(req.actionSessionId)) {
            throw new CardstackException('actionSessionId is required.');
        }

        String flowApiName = req.flowApiName.trim();
        String recordId = req.recordId;

        // Verify the session — a forged cancel is rejected.
        if (!String.isBlank(recordId)) {
            CardstackConfirmToken.verify(
                req.actionSessionId, 'flow:' + flowApiName + ':' + recordId);
        } else {
            // Session must at least be a valid Cardstack token.
            try {
                CardstackConfirmToken.verify(req.actionSessionId, 'flow:' + flowApiName + ':');
            } catch (Exception e) {
                throw new CardstackException(
                    'Invalid session — pass the actionSessionId from Flow Start.');
            }
        }

        FlowCancelResponse res = new FlowCancelResponse();
        res.flowApiName = flowApiName;
        res.recordId = recordId;
        res.cancelled = true;
        res.summary = 'Flow "' + flowApiName + '" cancelled.'
            + (recordId != null ? ' No changes were made to ' + recordId + '.' : '');
        return res;
    }

    global class FlowCancelRequest {
        @InvocableVariable(label='Flow API Name' description='API name of the flow to cancel.' required=true)
        public String flowApiName;

        @InvocableVariable(label='Action Session ID' description='Session token from Flow Start.' required=true)
        public String actionSessionId;

        @InvocableVariable(label='Record ID' description='Id of the record the flow was running on.')
        public String recordId;
    }

    global class FlowCancelResponse {
        @InvocableVariable(label='Flow API Name')
        public String flowApiName;

        @InvocableVariable(label='Record ID')
        public String recordId;

        @InvocableVariable(label='Cancelled')
        public Boolean cancelled;

        @InvocableVariable(label='Summary')
        public String summary;
    }

    public class CardstackException extends Exception {}
}
