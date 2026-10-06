const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
// Exercise the component's actual model and event handlers without a Salesforce DOM.
const source = fs.readFileSync(__dirname + '/../force-app/main/default/lwc/cardstackObjectConfig/cardstackObjectConfig.js', 'utf8')
  .replace(/^import .*;$/gm, '').replace(/^\s*@wire\(.*\)\s*$/gm, '').replace(/@track\s+/g, '')
  .replace('export default class CardstackObjectConfig', 'globalThis.Builder = class CardstackObjectConfig');
const context = { LightningElement: class {}, ShowToastEvent: class {}, setTimeout, console };
vm.runInNewContext(source, context);
function builder() {
  const b = new context.Builder(); b.selectedObject = 'Account'; b.toast = () => {};
  b.wiredFieldsResult = { data: ['Phone', 'Website', 'Description', 'Industry'].map(api => ({ api, label: api, type: 'STRING' })) };
  return b;
}
function drop(b, section, column, key) {
  b.handleDrop({ preventDefault() {}, stopPropagation() {}, currentTarget: { dataset: { section, column, key }, classList: { remove() {} } } });
}
test('palette drop places a real field into an empty third column and prevents duplicate fields', () => {
  const b = builder(); const s = b.makeSection('Details', [], 3); b.workingSections = [s];
  b.dragApi = 'Website'; drop(b, s.key, 'center');
  assert.equal(s.fields[0].api, 'Website'); assert.equal(s.fields[0].column, 'center');
  b.dragApi = 'Website'; drop(b, s.key, 'right'); assert.equal(s.fields.length, 1);
});
test('drag across sections retains field settings and inserts before a target field', () => {
  const b = builder(); const a = b.makeSection('First', b.enrichFields([{ api: 'Phone', label: 'Desk phone', editable: true, column: 'left' }]), 2);
  const c = b.makeSection('Second', b.enrichFields([{ api: 'Website', column: 'right' }]), 3); b.workingSections = [a, c];
  b.dragKey = a.fields[0].key; b.dragSectionKey = a.key; drop(b, c.key, 'right', c.fields[0].key);
  assert.equal(a.fields.length, 0); assert.equal(c.fields[0].label, 'Desk phone');
  assert.equal(c.fields[0].editable, true); assert.equal(c.fields[0].column, 'right');
});
test('reducing column count preserves every field and round-trips the chosen layout', () => {
  const b = builder(); const s = b.makeSection('Details', b.enrichFields([{ api: 'Phone', column: 'center' }, { api: 'Website', column: 'right' }]), 3);
  b.workingSections = [s]; b.handleSectionColumnsChange({ currentTarget: { dataset: { key: s.key } }, detail: { value: '2' } });
  assert.equal(s.fields[0].column, 'right'); assert.equal(b.sectionViews[0].columnViews.length, 2);
  b.handleSectionColumnsChange({ currentTarget: { dataset: { key: s.key } }, detail: { value: '1' } });
  assert.ok(s.fields.every(f => f.column === 'full')); assert.equal(b.sectionViews[0].columnViews.length, 1);
  const parsed = b.parseLayoutOnly(b.buildLayoutJson()); assert.equal(parsed.sections[0].columns, 1); assert.equal(parsed.sections[0].fields.length, 2);
});
test('palette drag into highlights is capped and keeps the section fields intact', () => {
  const b = builder(); b.workingSections = [b.makeSection('Details', b.enrichFields([{ api: 'Phone', column: 'left' }]))];
  b.dragApi = 'Industry'; drop(b, 'highlights'); assert.equal(b.workingHighlights[0].api, 'Industry');
  assert.equal(b.workingSections[0].fields.length, 1);
  b.workingHighlights = Array.from({ length: 7 }, (_, i) => ({ key: String(i), api: 'Other' + i }));
  b.dragApi = 'Website'; drop(b, 'highlights'); assert.equal(b.workingHighlights.length, 7);
});
test('column-count-only changes are unsaved changes and highlights-only cards can be staged', () => {
  const b = builder(); const s = b.makeSection('Details', b.enrichFields([{ api: 'Phone', column: 'full' }]), 2); b.workingSections = [s];
  b.staging = { layout: { liveValue: b.buildLayoutJson() } }; assert.equal(b.isDirty, false);
  b.handleSectionColumnsChange({ currentTarget: { dataset: { key: s.key } }, detail: { value: '3' } }); assert.equal(b.isDirty, true);
  b.workingSections = []; b.workingHighlights = b.enrichHighlights([{ api: 'Industry' }]); assert.equal(b.canStage, true);
  assert.equal(b.parseLayoutOnly(b.buildLayoutJson()).highlights.length, 1);
});
test('schema arriving after the layout validates fields without resetting their settings', () => {
  const b = builder(); const schema = b.wiredFieldsResult; b.wiredFieldsResult = undefined;
  b.parseWorkingModel('{"highlights":[{"api":"Industry"}],"sections":[{"label":"Details","columns":3,"fields":[{"api":"Phone","label":"Desk phone","column":"center","editable":true}]}]}');
  assert.equal(b.hasInvalidFields, true); const key = b.workingSections[0].fields[0].key;
  b.wiredFields(schema); assert.equal(b.hasInvalidFields, false); assert.equal(b.canStage, true);
  assert.equal(b.workingSections[0].fields[0].key, key); assert.equal(b.workingSections[0].fields[0].label, 'Desk phone');
  assert.equal(b.workingSections[0].fields[0].column, 'center'); assert.equal(b.workingSections[0].fields[0].editable, true);
});
test('highlights-only Stage Draft persists the actual layout', async () => {
  const b = builder(); b.workingHighlights = b.enrichHighlights([{ api: 'Industry' }]); b.loadStaging = async () => {};
  let saved; context.saveDraft = async payload => { saved = payload; };
  await b.stageLayout(); assert.ok(saved, 'Stage Draft must call saveDraft');
  assert.equal(saved.key, 'layout:Account:default'); assert.equal(JSON.parse(saved.value).highlights[0].api, 'Industry');
});
test('Move up reorders within the displayed column rather than swapping a different column', () => {
  const b = builder(); const s = b.makeSection('Details', b.enrichFields([{ api: 'Phone', column: 'left' }, { api: 'Website', column: 'right' }, { api: 'Industry', column: 'left' }]), 2); b.workingSections = [s];
  b.moveField(s.fields[2].key, s.key, -1); assert.equal(b.sectionViews[0].columnViews[0].fields[0].api, 'Industry');
  assert.equal(b.sectionViews[0].columnViews[1].fields[0].api, 'Website');
});
test('field flags are exclusive, survive save/reload, and count as unsaved changes', () => {
  const b = builder(); const s = b.makeSection('Details', b.enrichFields([{ api: 'Phone', editable: true }])); b.workingSections = [s];
  b.staging = { layout: { liveValue: b.buildLayoutJson() } };
  const edit = action => b.handleFieldEdit({ detail: { key: s.fields[0].key, section: s.key, action } });
  edit('required'); assert.equal(s.fields[0].required, true); assert.equal(s.fields[0].readOnly, false); assert.equal(b.isDirty, true);
  edit('readOnly'); assert.equal(s.fields[0].readOnly, true); assert.equal(s.fields[0].required, false); assert.equal(s.fields[0].editable, false);
  const saved = b.parseLayoutOnly(b.buildLayoutJson()).sections[0].fields[0];
  assert.equal(saved.readOnly, true); assert.equal(saved.required, false);
  edit('required'); assert.equal(s.fields[0].required, true); assert.equal(s.fields[0].readOnly, false);
  const required = b.parseLayoutOnly(b.buildLayoutJson()).sections[0].fields[0]; assert.equal(required.required, true);
  edit('required'); assert.equal(s.fields[0].required, false);
});
test('read only is cleared by enabling chat editing and flags survive moving fields', () => {
  const b = builder(); const a = b.makeSection('First', b.enrichFields([{ api: 'Phone', readOnly: true }]));
  const c = b.makeSection('Second', [], 3); b.workingSections = [a,c];
  b.handleFieldEdit({ detail: { key: a.fields[0].key, section: a.key, action: 'editable', value: true } });
  assert.equal(a.fields[0].readOnly, false);
  b.handleFieldEdit({ detail: { key: a.fields[0].key, section: a.key, action: 'required' } });
  b.dragKey = a.fields[0].key; b.dragSectionKey = a.key; drop(b,c.key,'center');
  assert.equal(c.fields[0].required, true); assert.equal(c.fields[0].editable, true);
});
test('moving a flagged field through Highlights and save/reload retains its settings', () => {
  for (const settings of [{required:true,editable:true}, {readOnly:true,editable:false}]) {
    const b = builder(); const s = b.makeSection('Details', b.enrichFields([{api:'Phone',...settings}])); b.workingSections=[s];
    b.dragKey=s.fields[0].key; b.dragSectionKey=s.key; drop(b,'highlights');
    b.parseWorkingModel(b.buildLayoutJson());
    b.dragKey=b.workingHighlights[0].key; b.dragSectionKey='highlights'; drop(b,b.workingSections[0].key,'left');
    const restored=b.workingSections[0].fields[0];
    assert.equal(restored.required,!!settings.required); assert.equal(restored.readOnly,!!settings.readOnly); assert.equal(restored.editable,settings.editable);
  }
});

test('highlight flags are unsaved changes and unknown published metadata survives staging', () => {
  const b = builder();
  const json = JSON.stringify({ futureSetting: { version: 2 }, highlights: [{api:'Industry',editable:true}], permissions: {writeEnabled:true,fieldDenylist:[],futureRule:'keep'} });
  b.parseWorkingModel(json); b.staging={layout:{liveValue:json}};
  assert.equal(b.isDirty,false);
  b.workingHighlights[0].readOnly=true;
  assert.equal(b.isDirty,true);
  const saved=JSON.parse(b.buildLayoutJson());
  assert.equal(saved.futureSetting.version,2);
  assert.equal(saved.permissions.futureRule,'keep');
});

test('removing migrated fields cannot resurrect their old edit permissions', () => {
  for (const legacy of [{fields:[{api:'Phone',editable:true}]}, {recordCard:{sections:[{fields:[{api:'Phone',editable:true}]}],futureSetting:'keep'}}]) {
    const b=builder();b.parseWorkingModel(JSON.stringify({...legacy,permissions:{writeEnabled:true}}));
    b.workingSections=[];b.workingHighlights=b.enrichHighlights([{api:'Industry',readOnly:true}]);
    const json=b.buildLayoutJson();const saved=JSON.parse(json);
    assert.equal(saved.fields,undefined);assert.equal(saved.recordCard?.sections,undefined);
    assert.equal(b.parseLayoutOnly(json).sections.length,0);
    if(legacy.recordCard)assert.equal(saved.recordCard.futureSetting,'keep');
  }
});

test('new multi-column sections do not add an empty full-width row', () => {
  for (const columns of [2, 3]) {
    const b = builder(); b.workingSections = [b.makeSection('New section', [], columns)];
    assert.equal(b.sectionViews[0].showFullWidth, false);
    assert.equal(b.sectionViews[0].columnViews.length, columns);
  }
});
test('explicit full-width fields remain visible and survive column changes', () => {
  const b = builder(); const s = b.makeSection('Details', b.enrichFields([{api:'Description',column:'full'}]), 3); b.workingSections = [s];
  assert.equal(b.sectionViews[0].showFullWidth, true);
  b.handleSectionColumnsChange({currentTarget:{dataset:{key:s.key}},detail:{value:'1'}});
  assert.equal(b.sectionViews[0].showFullWidth, false);
  assert.equal(b.sectionViews[0].columnViews[0].fields[0].api, 'Description');
  b.handleSectionColumnsChange({currentTarget:{dataset:{key:s.key}},detail:{value:'2'}});
  assert.equal(b.sectionViews[0].showFullWidth, true);
  assert.equal(b.sectionViews[0].fullFields[0].api, 'Description');
});
