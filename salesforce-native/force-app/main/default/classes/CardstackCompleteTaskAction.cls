/**
 * Cardstack native port of `crm_complete_task`.
 *
 * Marks a CRM follow-up task as completed. This is a write. Pass the
 * confirmToken from crm_preview_complete_task when the rep checked it off;
 * without one the write is recorded as model-initiated. A bad token aborts
 * rather than downgrading.
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

        // Verified BEFORE the write — a bad token aborts.
        Boolean repConfirmed = false;
        if (!String.isBlank(req.confirmToken)) {
            CardstackConfirmToken.verify(req.confirmToken, 'complete:' + req.taskId);
            repConfirmed = true;
        }

        List<Task> tasks = [
            SELECT Id, Subject, Status FROM Task
            WHERE Id = :req.taskId WITH USER_MODE LIMIT 1
        ];
        if (tasks.isEmpty()) {
            throw new CardstackException('Task not found: ' + req.taskId);
        }
        Task t = tasks[0];
        if (t.Status == 'Completed') {
            throw new CardstackException('Task is already completed.');
        }
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

        @InvocableVariable(label='Confirm Token' description='Token from Preview Complete Task, proving the rep checked this off. Do not invent one.')
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
