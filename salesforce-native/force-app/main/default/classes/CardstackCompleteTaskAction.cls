/**
 * Cardstack native port of `crm_complete_task`.
 *
 * Marks a CRM follow-up task as completed. This is a write. Pass the
 * confirmToken from crm_preview_complete_task when the rep checked it off;
 * confirmation is mandatory and binds the connected user and published policy.
 *
 * Security: `with sharing` + WITH_USER_MODE.
 */
global with sharing class CardstackCompleteTaskAction {

    @InvocableMethod(
        label='Cardstack Complete Task'
        description='Mark a CRM follow-up task as completed. Pass the confirmToken from Preview Complete Task when the rep checked it off.'
    )
    global static List<CompleteTaskResponse> completeTask(List<CompleteTaskRequest> requests) {
        List<CompleteTaskResponse> responses = new List<CompleteTaskResponse>();
        for (CompleteTaskRequest req : requests) {
            responses.add(doComplete(req));
        }
        return responses;
    }

    private static CompleteTaskResponse doComplete(CompleteTaskRequest req) {
        if (String.isBlank(req.taskId)) {
            throw new CardstackException('taskId is required.');
        }

        CardstackPolicyService.Policy policy=CardstackPolicyService.resolve('Task');
        CardstackPreviewUpdateAction.PatchEntry statusChange=new CardstackPreviewUpdateAction.PatchEntry(); statusChange.fieldApiName='Status';statusChange.newValue='Completed';
        CardstackPolicyService.validateChanges(policy,new List<CardstackPreviewUpdateAction.PatchEntry>{statusChange});
        Cardstack_Confirmation__c confirmation=CardstackConfirmToken.locked(req.confirmToken,'complete:'+req.taskId+':'+policy.revision);
        if (confirmation.Receipt__c!=null) return (CompleteTaskResponse)JSON.deserialize(confirmation.Receipt__c,CompleteTaskResponse.class);
        Boolean repConfirmed=true;

        Set<String> fields=new Set<String>{'Id','Subject','Status','SystemModstamp'};
        for (CardstackPolicyService.FieldPolicy field:policy.fields.values()) if (field.required) fields.add(field.apiName);
        String taskId=req.taskId;
        List<Task> tasks=Database.query('SELECT '+String.join(new List<String>(fields),',')+' FROM Task WHERE Id=:taskId WITH USER_MODE LIMIT 1 FOR UPDATE');
        if (tasks.isEmpty()) {
            throw new CardstackException('Task not found: ' + req.taskId);
        }
        Task t = tasks[0];
        CardstackPolicyService.validateResult(policy,t,new List<CardstackPreviewUpdateAction.PatchEntry>{statusChange});
        if (t.Status == 'Completed') {
            throw new CardstackException('Task is already completed.');
        }
        CardstackConfirmToken.assertFresh(confirmation,JSON.serialize(new List<Object>{t.SystemModstamp,t.Subject,t.Status}));
        String beforeStatus = t.Status;

        t.Status = 'Completed';
        try {
            update as user t;
        } catch (DmlException de) {
            // Structured DML failure — never let it escape the invocable.
            return dmlFailureResponse(req, de, t, beforeStatus);
        }

        // Structured audit log for the UI diff renderer.
        try {
            Map<String, Object> detail = new Map<String, Object>{
                'objectName' => 'Task',
                'before' => new Map<String, Object>{ 'Status' => beforeStatus },
                'after' => new Map<String, Object>{ 'Status' => 'Completed' },
                'subject' => t.Subject,
                'confirmedBy' => repConfirmed ? 'rep' : 'model'
            };
            CardstackAuditService.logAction(
                'COMPLETE_TASK', 'CardstackCompleteTaskAction', t.Id,
                JSON.serialize(detail)
            );
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'Cardstack audit write failed: ' + e.getMessage());
        }

        CompleteTaskResponse res = new CompleteTaskResponse();
        res.taskId = t.Id;
        res.subject = t.Subject;
        res.status = 'Completed';
        res.confirmedBy = repConfirmed ? 'rep' : 'model';
        res.dmlFailed = false;
        res.showSuccess = true;
        res.summary = 'Completed task "' + t.Subject + '". Logged as '
            + (repConfirmed ? 'rep-confirmed' : 'model-initiated') + '.';
        CardstackConfirmToken.complete(confirmation,res);
        return res;
    }

    /**
     * Build a structured failure response when completing the task is blocked
     * by validation rules or triggers.
     */
    @TestVisible
    private static CompleteTaskResponse dmlFailureResponse(
        CompleteTaskRequest req, DmlException de, Task t, String beforeStatus
    ) {
        List<CardstackDmlError.DmlErrorDetail> errors =
            CardstackDmlError.parse(de, 'Task');

        try {
            CardstackAuditService.logAction(
                'COMPLETE_TASK_BLOCKED', 'CardstackCompleteTaskAction', t.Id,
                JSON.serialize(new Map<String, Object>{
                    'errors' => errors,
                    'beforeStatus' => beforeStatus
                })
            );
        } catch (Exception ex) {
            System.debug(LoggingLevel.WARN,
                'Cardstack audit blocked-complete failed: ' + ex.getMessage());
        }

        CompleteTaskResponse res = new CompleteTaskResponse();
        res.taskId = t.Id;
        res.subject = t.Subject;
        res.status = beforeStatus;
        res.confirmedBy = 'model';
        res.dmlFailed = true;
        res.showSuccess = false;
        res.dmlErrors = errors;
        Integer n = errors.size();
        res.dmlErrorSummary = 'Couldn\'t complete the task — ' + n
            + (n == 1 ? ' problem: ' : ' problems: ')
            + errors[0].message;
        res.summary = res.dmlErrorSummary + ' The task was not completed.';
        return res;
    }

    global class CompleteTaskRequest {
        @InvocableVariable(label='Task ID' description='Id of the task to complete.' required=true)
        public String taskId;

        @InvocableVariable(label='Confirm Token' description='Required token from Preview Complete Task after user confirmation. Do not invent one.' required=true)
        public String confirmToken;
    }

    global class CompleteTaskResponse {
        @InvocableVariable(label='Task ID')
        public String taskId;

        @InvocableVariable(label='Subject')
        public String subject;

        @InvocableVariable(label='Status')
        public String status;

        @InvocableVariable(label='Confirmed By')
        public String confirmedBy;

        @InvocableVariable(label='DML Failed')
        public Boolean dmlFailed;

        @InvocableVariable(label='Show Success')
        public Boolean showSuccess;

        @InvocableVariable(label='DML Error Summary')
        public String dmlErrorSummary;

        @InvocableVariable(label='DML Errors')
        public List<CardstackDmlError.DmlErrorDetail> dmlErrors;

        @InvocableVariable(label='Summary')
        public String summary;
    }

    public class CardstackException extends Exception {}
}
