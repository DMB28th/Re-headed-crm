# Published record actions

Cardstack Studio’s Objects → Actions editor connects a record-card button to a supported process. For this beta, **Edit Account fields · in chat** supports published editable text and integer fields. Salesforce launch-card targets open Salesforce; this does not interpret Salesforce Screen Flows inside chat.

## Admin configuration

1. In Objects, choose Account. Include the source and target fields in its layout.
2. In Permissions, enable chat edits. Mark target fields editable; read-only and denied fields cannot be targets.
3. In Actions, give the button a label and choose **Edit Account fields · in chat**.
4. Add inputs in the desired order. Choose each field’s starting value: its current value, another exposed record field, a constant, or an answer from the user. Empty text and literal zero are preserved.
5. Add the action, then publish its Account layout draft in Publish Center. The layout’s View JSON includes the action definition and mappings.
6. In a fresh Claude chat with Cardstack Salesforce enabled, show that Account’s record card and click the published button. HXL buttons prepare a message; send it to continue.

The record ID comes from the card. Mappings create defaults, not writes. Users submit or skip each field, inspect the review, and confirm the exact current review before Salesforce saves. Keep current removes any prior answer for that field, including after Back. Salesforce sharing/FLS, published policy, source freshness, actor/session/revision binding, and existing confirmation checks still apply.

A record card supports twenty configured actions; each guided edit supports one to twenty distinct fields. Disabled, unpublished, invalid, and unsupported actions do not become executable buttons. Advanced JSON above twenty actions renders only the first twenty configured entries.

## Limits

- Native process editing currently supports Account text/integer fields; picklists and lookups remain future work.
- Guided record actions use Cardstack’s editor; they are not imported Salesforce Screen Flows.
- Published Salesforce flow launch cards are selectable as clearly labeled handoffs and receive the current recordId. Full in-chat Screen Flow interpretation and arbitrary launch-variable mappings remain future work.
- ChatGPT parity has not been verified for this release.

## Salesforce launch URLs

The handoff uses `/lightning/flow/<ApiName>?flow__recordId=<recordId>`. To consume this context, the flow needs a Text variable named `recordId` available for input. This follows Salesforce’s [record-button distribution guide](https://help.salesforce.com/s/articleView?id=platform.automate_flow_distribute_internal_url_record_button.htm&language=en_US&type=5). The disposable flow was verified through its review screen with the correct record ID.
