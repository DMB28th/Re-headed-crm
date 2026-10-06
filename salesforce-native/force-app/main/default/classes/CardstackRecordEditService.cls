/** Native single-input adapter over a private, revisioned record-edit interaction. */
public with sharing class CardstackRecordEditService {
 public class View {
  public String key; public Integer revision; public String status; public String fieldApi;
  public String value; public String error; public String confirmToken; public String recordId;
  public String objectName; public String recordName; public String fieldLabel; public String progress;
  public String summary; public String reviewReference; public Boolean required; public Boolean canClear; public Boolean canBack;
 }
 private class State {
  public String recordId; public String objectName; public String recordName; public String policyRevision;
  public String initialVersion; public String status='Editing'; public Integer revision=1; public Integer index=0;
  public List<String> fields=new List<String>(); public Map<String,String> answers=new Map<String,String>();
  public String summary; public Id confirmationId;
 }
 public static View start(Id recordId) {
  if (recordId==null || recordId.getSObjectType()!=Account.SObjectType) throw new EditException('This native edit beta supports Account records.');
  CardstackPolicyService.Policy policy=CardstackPolicyService.resolve('Account');
  if (!policy.editEnabled) throw new EditException('Chat edits are disabled in the published Account layout.');
  State s=new State();s.recordId=String.valueOf(recordId);s.objectName='Account';s.policyRevision=policy.revision;
  for (CardstackPolicyService.FieldPolicy fp:policy.fields.values()) if (!fp.readOnly && supported(fp.dataType)) s.fields.add(fp.apiName);
  s.fields.sort();
  if (s.fields.isEmpty() || s.fields.size()>20) throw new EditException('Publish between one and twenty editable text or integer fields for this beta.');
  SObject record=readRecord(s);s.recordName=String.valueOf(record.get('Name'));
  s.initialVersion=CardstackConfirmToken.recordVersion(record,allPatches(s));
  String key=EncodingUtil.convertToHex(Crypto.generateAesKey(256));
  insert as system new Cardstack_Interaction__c(Key_Hash__c=hash(key),Actor_Id__c=UserInfo.getUserId(),Expires_At__c=Datetime.now().addMinutes(15),State__c=JSON.serialize(s));
  return view(s,key,null,null,policy,record);
 }
 public static View advance(String key,Integer revision,String operation,String answer,String confirmToken) {
  return advance(key,revision,operation,answer,confirmToken,null);
 }
 public static View advance(String key,Integer revision,String operation,String answer,String confirmToken,String reviewReference) {
  if (String.isBlank(key) || key.length()!=64) throw new EditException('Invalid edit session.');
  String digest=hash(key);
  List<Cardstack_Interaction__c> rows=[SELECT Id,Actor_Id__c,Expires_At__c,State__c FROM Cardstack_Interaction__c WHERE Key_Hash__c=:digest WITH SYSTEM_MODE LIMIT 1 FOR UPDATE];
  if (rows.isEmpty() || rows[0].Actor_Id__c!=UserInfo.getUserId()) throw new EditException('Invalid edit session.');
  Cardstack_Interaction__c row=rows[0];State s=(State)JSON.deserialize(row.State__c,State.class);
  CardstackPolicyService.Policy policy=CardstackPolicyService.resolve(s.objectName);
  if (policy.revision!=s.policyRevision) throw new EditException('Published policy or field access changed. Start a new edit.');
  SObject record=readRecord(s);
  if (s.status=='Completed') {
   if(operation=='confirm' || operation=='resume') return view(s,key,null,null,policy,record);
   throw new EditException('This edit is complete. Start a new edit to change the record.');
  }
  if (s.status=='Cancelled') throw new EditException('This edit was cancelled.');
  if (row.Expires_At__c<Datetime.now()) throw new EditException('This edit expired. Start a new edit.');
  if (operation!='resume' && (revision==null || revision!=s.revision)) throw new EditException('This card is stale. Resume the latest edit card.');
  String error;String grant;
  if (operation=='resume' && s.status!='Review') return view(s,key,null,null,policy,record);
  if (operation=='resume') {
   if (s.initialVersion!=CardstackConfirmToken.recordVersion(record,allPatches(s))) throw new EditException('Record changed while editing. Start again.');
   invalidate(s);
   CardstackPreviewUpdateAction.PreviewUpdateRequest req=new CardstackPreviewUpdateAction.PreviewUpdateRequest();req.recordId=s.recordId;req.changes=answeredPatches(s);
   CardstackPreviewUpdateAction.PreviewUpdateResponse preview=CardstackPreviewUpdateAction.preview(new List<CardstackPreviewUpdateAction.PreviewUpdateRequest>{req})[0];
   String freshHash=hash(preview.confirmToken);s.confirmationId=[SELECT Id FROM Cardstack_Confirmation__c WHERE Key_Hash__c=:freshHash AND Actor_Id__c=:row.Actor_Id__c WITH SYSTEM_MODE LIMIT 1].Id;
   s.summary=preview.summary;s.revision++;row.State__c=JSON.serialize(s);update as system row;
   return view(s,key,null,preview.confirmToken,policy,record);
  }
  if (operation=='cancel') { invalidate(s);s.status='Cancelled';s.summary='Edit cancelled. No CRM changes saved.'; }
  else if (operation=='back') {
   invalidate(s);s.status='Editing';s.index=Math.max(0,s.index-1);s.summary=null;
  } else if (operation=='answer' || operation=='clear' || operation=='skip') {
   if (s.status!='Editing') throw new EditException('Go Back before changing a reviewed answer.');
   String api=s.fields[s.index];CardstackPolicyService.FieldPolicy fp=policy.fields.get(api);
   if (fp==null || fp.readOnly) throw new EditException('Field access changed. Start a new edit.');
   if (operation!='skip') {
    if (operation=='clear') answer=null;
    error=validateAnswer(fp,answer);
    if (error!=null) return view(s,key,error,null,policy,record);
    s.answers.put(api,answer);
   }
   s.index++;
   if (s.index>=s.fields.size()) {
    if (s.initialVersion!=CardstackConfirmToken.recordVersion(record,allPatches(s))) throw new EditException('Record changed while editing. Start again.');
    List<CardstackPreviewUpdateAction.PatchEntry> patches=answeredPatches(s);
    if (changedPatches(s,record).isEmpty()) {s.status='Cancelled';s.summary='No field changes selected.';}
    else {
     CardstackPreviewUpdateAction.PreviewUpdateRequest req=new CardstackPreviewUpdateAction.PreviewUpdateRequest();req.recordId=s.recordId;req.changes=patches;
     CardstackPreviewUpdateAction.PreviewUpdateResponse preview=CardstackPreviewUpdateAction.preview(new List<CardstackPreviewUpdateAction.PreviewUpdateRequest>{req})[0];
     grant=preview.confirmToken;s.summary=preview.summary;
     String grantHash=hash(grant);s.confirmationId=[SELECT Id FROM Cardstack_Confirmation__c WHERE Key_Hash__c=:grantHash AND Actor_Id__c=:row.Actor_Id__c WITH SYSTEM_MODE LIMIT 1].Id;
     s.status='Review';
     if (preview.hasPredictedErrors) {invalidate(s);grant=null;s.status='Editing';s.index=s.fields.size()-1;error='Salesforce validation rejected these answers. Go Back to correct them.';}
    }
   }
  } else if (operation=='confirm') {
   if (s.status!='Review') throw new EditException('Review all answers before confirming.');
   if(reviewReference!=null && reviewReference!=publicReviewReference(key,s)) throw new EditException('This confirmation belongs to a different review. Use the current review card.');
   if (String.isBlank(confirmToken)) throw new EditException('The current preview confirmation is required.');
   String grantHash=hash(confirmToken);
   if ([SELECT count() FROM Cardstack_Confirmation__c WHERE Id=:s.confirmationId AND Key_Hash__c=:grantHash AND Actor_Id__c=:row.Actor_Id__c WITH SYSTEM_MODE]!=1) throw new EditException('Confirmation does not match this review.');
   CardstackUpdateRecordAction.UpdateRecordRequest req=new CardstackUpdateRecordAction.UpdateRecordRequest();req.recordId=s.recordId;req.changes=answeredPatches(s);req.confirmToken=confirmToken;
   CardstackUpdateRecordAction.UpdateRecordResponse receipt=CardstackUpdateRecordAction.updateRecord(new List<CardstackUpdateRecordAction.UpdateRecordRequest>{req})[0];
   if (receipt.dmlFailed==true) return view(s,key,receipt.dmlErrorSummary,confirmToken,policy,record);
   s.summary=receipt.summary;
   s.status='Completed';record=readRecord(s);
  } else throw new EditException('Unknown edit operation.');
  s.revision++;row.State__c=JSON.serialize(s);update as system row;
  return view(s,key,error,grant,policy,record);
 }
 private static View view(State s,String key,String error,String grant,CardstackPolicyService.Policy policy,SObject record) {
  View v=new View();v.key=key;v.revision=s.revision;v.status=s.status;v.recordId=s.recordId;v.objectName=s.objectName;v.recordName=s.recordName;v.summary=s.summary;v.error=error;v.confirmToken=grant;
  if(s.status=='Review') v.reviewReference=publicReviewReference(key,s);
  v.canBack=s.status=='Review' || (s.status=='Editing' && s.index>0);
  if (s.status=='Editing') {
   v.fieldApi=s.fields[s.index];Schema.DescribeFieldResult f=Schema.getGlobalDescribe().get(s.objectName).getDescribe().fields.getMap().get(v.fieldApi).getDescribe();
   v.fieldLabel=f.getLabel();v.required=policy.fields.get(v.fieldApi).required;v.canClear=!v.required;
   Object current=record.get(v.fieldApi);v.value=s.answers.containsKey(v.fieldApi) ? s.answers.get(v.fieldApi) : (current==null ? '' : String.valueOf(current));
   v.progress='Field '+String.valueOf(s.index+1)+' of '+s.fields.size();
  }
  return v;
 }
 private static SObject readRecord(State s) {
  CardstackPolicyService.Policy p=CardstackPolicyService.resolve(s.objectName);
  for(String api:s.fields) if (!p.fields.containsKey(api) || p.fields.get(api).readOnly) throw new EditException('Field access changed. Start a new edit.');
  Set<String> projection=new Set<String>{'Id','Name','SystemModstamp'};projection.addAll(s.fields);List<String> fields=new List<String>(projection);String rid=s.recordId;
  List<SObject> records=Database.query('SELECT '+String.join(fields,',')+' FROM '+s.objectName+' WHERE Id=:rid WITH USER_MODE LIMIT 1');
  if(records.isEmpty()) throw new EditException('Record is not available.');return records[0];
 }
 private static Boolean supported(String type) {return type=='STRING' || type=='TEXTAREA' || type=='INTEGER';}
 private static String validateAnswer(CardstackPolicyService.FieldPolicy fp,String answer) {
  if (fp.required && String.isBlank(answer)) return 'This field is required.';
  if (answer==null) return null;
  Schema.DescribeFieldResult f=Account.SObjectType.getDescribe().fields.getMap().get(fp.apiName).getDescribe();
  if (fp.dataType=='INTEGER') {
   if (!Pattern.matches('-?[0-9]+',answer)) return 'Enter a whole number, or use Clear value.';
   try {Integer.valueOf(answer);}catch(Exception e){return 'This number is outside the supported range.';}
  } else if(answer.length()>f.getLength()) return 'This value is too long for the Salesforce field.';
  return null;
 }
 private static List<CardstackPreviewUpdateAction.PatchEntry> changedPatches(State s,SObject record) {
  List<CardstackPreviewUpdateAction.PatchEntry> changed=new List<CardstackPreviewUpdateAction.PatchEntry>();
  for(CardstackPreviewUpdateAction.PatchEntry p:answeredPatches(s)) {
   Object before=record.get(p.fieldApiName);Schema.DescribeFieldResult f=Account.SObjectType.getDescribe().fields.getMap().get(p.fieldApiName).getDescribe();
   Object after=p.newValue;
   if(f.getType()==Schema.DisplayType.Integer && p.newValue!=null) after=Integer.valueOf(p.newValue);
   if(before==null && (after==null || (after instanceof String && ((String)after).length()==0))) continue;
   if(before!=null && after!=null && String.valueOf(before)==String.valueOf(after)) continue;
   changed.add(p);
  }
  return changed;
 }
 private static List<CardstackPreviewUpdateAction.PatchEntry> allPatches(State s) {
  List<CardstackPreviewUpdateAction.PatchEntry> result=new List<CardstackPreviewUpdateAction.PatchEntry>();
  for(String api:s.fields){CardstackPreviewUpdateAction.PatchEntry p=new CardstackPreviewUpdateAction.PatchEntry();p.fieldApiName=api;result.add(p);}return result;
 }
 private static List<CardstackPreviewUpdateAction.PatchEntry> answeredPatches(State s) {
  List<CardstackPreviewUpdateAction.PatchEntry> result=new List<CardstackPreviewUpdateAction.PatchEntry>();
  for(String api:s.fields) if(s.answers.containsKey(api)){CardstackPreviewUpdateAction.PatchEntry p=new CardstackPreviewUpdateAction.PatchEntry();p.fieldApiName=api;p.newValue=s.answers.get(api);result.add(p);}return result;
 }
 private static void invalidate(State s) {
  if(s.confirmationId!=null){Cardstack_Confirmation__c c=new Cardstack_Confirmation__c(Id=s.confirmationId,Expires_At__c=Datetime.now().addSeconds(-1));update as system c;s.confirmationId=null;}
 }
 private static String publicReviewReference(String key,State s){return 'review-'+hash(key+':'+s.revision+':'+s.summary).substring(0,12);}
 private static String hash(String key){return EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256',Blob.valueOf(key)));}
 public class EditException extends Exception {}
}
