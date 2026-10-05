/**
 * Cardstack native port of `crm_preview_complete_task`.
 *
 * Mints a confirmation token for checking off a follow-up task. Writes
 * nothing. Passing the token to crm_complete_task lets the audit record it
 * as rep-confirmed rather than model-initiated.
 *
 * Security: `with sharing` + WITH_USER_MODE.
 */
global with sharing class CardstackPreviewCompleteTaskAction {

    @InvocableMethod(
        label='Cardstack Preview Complete Task'
        description='Preview completing a CRM task: returns the task details and mints a confirmation token. Writes nothing. Pass the token to Cardstack Complete Task.'
    )
    global static List<PreviewCompleteTaskResponse> preview(List<PreviewCompleteTaskRequest> requests) {
        List<PreviewCompleteTaskResponse> responses = new List<PreviewCompleteTaskResponse>();
        for (PreviewCompleteTaskRequest req : requests) {
            responses.add(doPreview(req));
        }
        return responses;
    }

    private static PreviewCompleteTaskResponse doPreview(PreviewCompleteTaskRequest req) {
        if (String.isBlank(req.taskId)) {
            throw new CardstackException('taskId is required.');
        }
        CardstackPolicyService.Policy policy=CardstackPolicyService.resolve('Task');
        CardstackPreviewUpdateAction.PatchEntry statusChange=new CardstackPreviewUpdateAction.PatchEntry(); statusChange.fieldApiName='Status';statusChange.newValue='Completed';
        CardstackPolicyService.validateChanges(policy,new List<CardstackPreviewUpdateAction.PatchEntry>{statusChange});
        Set<String> fields=new Set<String>{'Id','Subject','Status','SystemModstamp','ActivityDate','WhatId','WhoId'};
        for (CardstackPolicyService.FieldPolicy field:policy.fields.values()) if (field.required) fields.add(field.apiName);
        String taskId=req.taskId;
        List<Task> tasks=Database.query('SELECT '+String.join(new List<String>(fields),',')+' FROM Task WHERE Id=:taskId WITH USER_MODE LIMIT 1');
        if (tasks.isEmpty()) {
            throw new CardstackException('Task not found: ' + req.taskId);
        }
        Task t = tasks[0];
        CardstackPolicyService.validateResult(policy,t,new List<CardstackPreviewUpdateAction.PatchEntry>{statusChange});
        if (t.Status == 'Completed') {
            throw new CardstackException('Task is already completed.');
        }

        CardstackConfirmToken.ConfirmToken minted =
            CardstackConfirmToken.mintRecord('complete:' + t.Id+':'+policy.revision,t.Id,JSON.serialize(new List<Object>{t.SystemModstamp,t.Subject,t.Status}));

        PreviewCompleteTaskResponse res = new PreviewCompleteTaskResponse();
        res.taskId = t.Id;
        res.subject = t.Subject;
        res.status = t.Status;
        res.dueDate = t.ActivityDate == null ? 'No due date' : t.ActivityDate.format();
        res.confirmToken = minted.token;
        res.expiresAt = minted.expiresAt;
        res.summary = 'Ready to mark "' + t.Subject + '" complete — nothing written yet.';
        return res;
    }

    global class PreviewCompleteTaskRequest {
        @InvocableVariable(label='Task ID' description='Id of the task to complete.' required=true)
        public String taskId;
    }

    global class PreviewCompleteTaskResponse {
        @InvocableVariable(label='Task ID')
        public String taskId;

        @InvocableVariable(label='Subject')
        public String subject;

        @InvocableVariable(label='Status')
        public String status;

        @InvocableVariable(label='Due Date')
        public String dueDate;

        @InvocableVariable(label='Confirm Token')
        public String confirmToken;

        @InvocableVariable(label='Expires At')
        public String expiresAt;

        @InvocableVariable(label='Summary')
        public String summary;
    }

    public class CardstackException extends Exception {}
}
