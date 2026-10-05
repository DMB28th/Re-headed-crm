/**
 * Cardstack native port of `crm_home`.
 *
 * Renders the rep's CRM launcher: open follow-up tasks, recently touched
 * records, and pipeline summary tiles. Use when the user asks to open or
 * see their CRM, their day, or their tasks — without naming a specific
 * record or view.
 *
 * Security: `with sharing` + WITH_USER_MODE on all SOQL.
 */
global with sharing class CardstackHomeAction {

    private static final Integer TASK_LIMIT = 5;
    private static final Integer RECENT_LIMIT = 5;

    @InvocableMethod(
        label='Cardstack Home'
        description='Open the CRM home card: open follow-up tasks, recently touched records, and pipeline summary. Use when the user asks to see their CRM, their day, or their tasks.'
    )
    global static List<HomeResponse> home(List<HomeRequest> requests) {
        List<HomeResponse> responses = new List<HomeResponse>();
        for (HomeRequest req : requests) {
            responses.add(doHome());
        }
        return responses;
    }

    private static HomeResponse doHome() {
        HomeResponse res = new HomeResponse();
        res.userName = UserInfo.getName();

        // Open tasks owned by the running user.
        Integer taskLim = TASK_LIMIT;
        List<Task> tasks = [
            SELECT Id, Subject, Status, ActivityDate, WhatId
            FROM Task
            WHERE OwnerId = :UserInfo.getUserId() AND Status != 'Completed'
            WITH USER_MODE
            ORDER BY ActivityDate ASC NULLS LAST
            LIMIT :taskLim
        ];
        res.tasks = new List<HomeTask>();
        for (Task t : tasks) {
            HomeTask ht = new HomeTask();
            ht.recordId = t.Id;
            ht.subject = t.Subject;
            ht.dueDate = t.ActivityDate == null ? 'No due date' : t.ActivityDate.format();
            ht.overdue = t.ActivityDate != null && t.ActivityDate < Date.today();
            res.tasks.add(ht);
        }
        res.openTaskCount = res.tasks.size();

        // Recently modified records across key objects.
        res.recent = new List<RecentItem>();
        Integer recentLim = RECENT_LIMIT;
        for (String obj : new List<String>{ 'Opportunity', 'Account', 'Contact' }) {
            Schema.SObjectType t = Schema.getGlobalDescribe().get(obj);
            if (t == null || !t.getDescribe().isAccessible()) {
                continue;
            }
            List<SObject> rows = Database.query(
                'SELECT Id, Name, LastModifiedDate FROM ' + obj
                + ' WITH USER_MODE ORDER BY LastModifiedDate DESC LIMIT :recentLim'
            );
            for (SObject r : rows) {
                RecentItem item = new RecentItem();
                item.recordId = (String) r.get('Id');
                item.name = String.valueOf(r.get('Name'));
                item.objectLabel = t.getDescribe().getLabel();
                Datetime lmd = (Datetime) r.get('LastModifiedDate');
                item.touched = lmd == null ? '' : lmd.format('MMM d');
                item.recordUrl = URL.getOrgDomainUrl().toExternalForm() + '/' + item.recordId;
                res.recent.add(item);
                if (res.recent.size() >= RECENT_LIMIT) {
                    break;
                }
            }
            if (res.recent.size() >= RECENT_LIMIT) {
                break;
            }
        }

        // Pipeline summary: open opportunity count + total amount.
        Integer openCount = 0;
        Decimal openTotal = 0;
        Schema.SObjectType oppType = Schema.getGlobalDescribe().get('Opportunity');
        if (oppType != null && oppType.getDescribe().isAccessible()) {
            for (AggregateResult ar : [
                SELECT COUNT(Id) c, SUM(Amount) s FROM Opportunity
                WHERE IsClosed = false WITH USER_MODE
            ]) {
                openCount = (Integer) ar.get('c');
                openTotal = ar.get('s') == null ? 0 : (Decimal) ar.get('s');
            }
        }
        res.openOpportunityCount = openCount;
        res.openPipelineTotal = '$' + openTotal.format();

        res.summary = 'Hi ' + res.userName + ' — ' + res.openTaskCount + ' open task(s), '
            + openCount + ' open opportunities (' + res.openPipelineTotal + ')';
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
