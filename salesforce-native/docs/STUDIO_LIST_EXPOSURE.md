# Studio list exposure

Record Cards → choose an object → Lists lets Salesforce admins search current native views and active saved Cardstack lists, choose enabled targets, and control **Allow unnamed filtered requests**. Every choice shows its source and canonical identity, including choices with identical labels. Salesforce choices use the existing user-mode SOQL fallback: this does not reproduce arbitrary saved-view filters, columns, or sorting. Cardstack choices use existing saved filters; this editor never rewrites `listview:` filter records.

Working changes, the saved draft, and published policy are separate. **Save draft** persists a candidate; **Review & Publish** opens review for that exact saved draft. A draft has no runtime effect. Save, Discard, and Stay use the shared native draft dialog when leaving an object or Studio section. Edits made while a save is pending remain working changes. A lost save response requires an authoritative saved-state check before retrying or leaving; overlapping checks share one read. Studio emits `configchange` only when a fresh read confirms the submitted candidate.

Version 1 stores canonical targets:

```json
{
  "version": 1,
  "allowAdHoc": false,
  "views": [{ "viewId": "00B000000000001EAA", "enabled": true }],
  "customLists": [{ "key": "listview:Opportunity:approved_name", "enabled": true }]
}
```

Both arrays are required. Empty selections deny all named lists. Omitting `allowAdHoc` means false. Enabled targets restrict the existing renderer and Salesforce-owned lifecycle; they do not grant CRM permissions. An unknown nonempty named-list request is denied even when unnamed filtered requests are allowed. Connected-user sharing and CRUD/FLS still apply. Admin metadata availability is not evidence of another user's access.

Valid 15-character view inputs normalize to checksum18 identities; invalid checksums, duplicate canonical identities, mismatched object keys, nonboolean flags, malformed JSON, and unknown explicit versions are unavailable for declarative editing and semantic review. The publication backend also validates candidates. Selected unavailable or deleted targets stay visible and retained. Enabling an unavailable target cannot make it accessible.

No active policy preserves legacy runtime behavior. Recognized unversioned exposure settings (`views` with `viewId`/`exposed`, optional old `customLists` with `id`/`name`, including empty arrays) are explicitly marked **not enforced**. **Start explicit list configuration** starts version 1 with empty selections and unnamed requests disabled; choose and review targets before publishing. It never silently activates enforcement or carries forward old exposed flags. Unknown unversioned `enabled`/`key` shapes are unavailable, not legacy fallback.

Migration preserves unrelated top-level properties and archives complete legacy rows under inert `legacyExposure` (or the next unused numbered name if that property already exists). Compatible version-1 editing retains unrelated object and row properties, including false and zero. These properties never become runtime capabilities. The read-only **Advanced** saved JSON field supports inspection and copy/export of the saved value. Unsupported configuration stays inspectable and is not overwritten by this editor. List filters remain separate. Alias/default routing and exact Salesforce filter previews are not offered.

Local behavior tests and API 67 compilation cover the authoring contract. Real Studio rendering, ordinary-user enforcement against published selections, native Apex execution, and chat-client proof require the Editor Chat owner's native validation; local checks alone do not establish those claims.
