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
        List<Task> tasks = [
            SELECT Id, Subject, Status, ActivityDate, WhatId, WhoId
            FROM Task WHERE Id = :req.taskId WITH USER_MODE LIMIT 1
        ];
        if (tasks.isEmpty()) {
            throw new CardstackException('Task not found: ' + req.taskId);
        }
        Task t = tasks[0];
        if (t.Status == 'Completed') {
            throw new CardstackException('Task is already completed.');
        }

        CardstackConfirmToken.ConfirmToken minted =
            CardstackConfirmToken.mint('complete:' + t.Id);

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
