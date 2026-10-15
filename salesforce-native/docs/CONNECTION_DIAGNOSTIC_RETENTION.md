# Private connection diagnostic retention

Source contract only; this document does not indicate deployment, a running job,
or actual client UI proof. Installation and diagnostic requests create no schedule.

`CardstackConnectionRetention.purgeBatch(requestedLimit)` requires the current
actor's `Cardstack_Manage_Connections` custom permission. It deletes only private
`Cardstack_Connection_Check__c` records whose CreatedDate is strictly older than
30 days and whose attempt deadline has elapsed. Every invocation deletes at most
200 records; null means 200, larger requests are capped, and zero/negative limits
are no-ops. Active checks and records exactly at the 30-day boundary remain.
No Account, Contact, Opportunity, setup or other records are deleted. Named-user
history reads expose at most the actor's newest 100 checks within the last 30 days.

After the source passes API67 validation and is explicitly deployed, an authorized
Salesforce admin may choose a schedule in Setup → Apex Classes → Schedule Apex,
selecting `CardstackConnectionRetention`, a deliberate job name, start/end dates,
and frequency. A scheduled execution calls one bounded purge. Its scheduling
actor must retain the manage-connections permission at execution time. No class
or private-object grants are added by this implementation; use an appropriately
authorized administrative execution context under normal Salesforce governance.

An admin may instead explicitly invoke a one-time bounded purge from an authorized
Apex execution context:

```apex
Integer deletedChecks = CardstackConnectionRetention.purgeBatch(200);
```

Select frequency for expected check volume and review scheduled job failures and
backlog using normal Salesforce administration. More than 200 expired checks
require additional explicit runs or a suitable admin-selected recurring schedule;
the service neither chains work nor silently increases the deletion bound. The
30-day history read cutoff applies even when physical deletion is behind schedule.
Cancel or change the schedule using Salesforce Scheduled Jobs; configuration
changes and token revocation do not create, delete or alter schedules.

Attempts expire ten minutes after opening. A receipt's `expiresAt` is that original
attempt deadline, separate from the 30-day history retention window. A historical
successful exchange remains evidence of exact synthetic values under its recorded
configuration; setup/contract drift marks its stages Stale. An operator observation
is separate evidence and requires an already passing, current, unexpired attempt.
It cannot create a passing diagnostic or prove host attestation.
