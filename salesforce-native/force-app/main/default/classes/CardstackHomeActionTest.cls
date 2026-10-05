@IsTest
private class CardstackHomeActionTest {

    @IsTest
    static void homeReturnsTasksAndSummary() {
        insert new Task(Subject = 'Home Test Follow-up', Status = 'Not Started',
            ActivityDate = Date.today().addDays(2), OwnerId = UserInfo.getUserId());

        List<CardstackHomeAction.HomeResponse> resps =
            CardstackHomeAction.home(
                new List<CardstackHomeAction.HomeRequest>{
                    new CardstackHomeAction.HomeRequest()
                });

        System.assertEquals(1, resps.size());
        CardstackHomeAction.HomeResponse res = resps[0];
        System.assertEquals(UserInfo.getName(), res.userName);
        System.assertEquals(1, res.openTaskCount, 'the open task is counted');
        System.assertEquals('Home Test Follow-up', res.tasks[0].subject);
        System.assertEquals(false, res.tasks[0].overdue, 'due in future');
        System.assert(res.summary.contains(UserInfo.getName()), 'summary: ' + res.summary);
    }

    @IsTest
    static void overdueTaskFlagged() {
        insert new Task(Subject = 'Home Overdue', Status = 'In Progress',
            ActivityDate = Date.today().addDays(-3), OwnerId = UserInfo.getUserId());

        List<CardstackHomeAction.HomeResponse> resps =
            CardstackHomeAction.home(
                new List<CardstackHomeAction.HomeRequest>{
                    new CardstackHomeAction.HomeRequest()
                });

        Boolean found = false;
        for (CardstackHomeAction.HomeTask t : resps[0].tasks) {
            if (t.subject == 'Home Overdue') {
                found = true;
                System.assertEquals(true, t.overdue, 'past due date flagged');
            }
        }
        System.assert(found, 'overdue task in list');
    }

    @IsTest
    static void pipelineSummaryPopulated() {
        insert new Opportunity(Name = 'Home Pipe', StageName = 'Prospecting',
            CloseDate = Date.today().addDays(30), Amount = 42000);

        List<CardstackHomeAction.HomeResponse> resps =
            CardstackHomeAction.home(
                new List<CardstackHomeAction.HomeRequest>{
                    new CardstackHomeAction.HomeRequest()
                });

        CardstackHomeAction.HomeResponse res = resps[0];
        System.assert(res.openOpportunityCount >= 1, 'open opp counted');
        System.assert(res.openPipelineTotal.startsWith('$'), 'formatted total: ' + res.openPipelineTotal);
    }

    @IsTest
    static void completedTasksExcluded() {
        insert new Task(Subject = 'Home Done Task', Status = 'Completed',
            OwnerId = UserInfo.getUserId());

        List<CardstackHomeAction.HomeResponse> resps =
            CardstackHomeAction.home(
                new List<CardstackHomeAction.HomeRequest>{
                    new CardstackHomeAction.HomeRequest()
                });

        for (CardstackHomeAction.HomeTask t : resps[0].tasks) {
            System.assertNotEquals('Home Done Task', t.subject, 'completed excluded');
        }
    }
}
