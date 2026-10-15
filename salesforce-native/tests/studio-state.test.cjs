const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const modelPath = path.resolve(__dirname, '../force-app/main/default/lwc/cardstackStudioModel/cardstackStudioModel.js');
function model() {
    const scope = {};
    if (fs.existsSync(modelPath)) vm.runInNewContext(fs.readFileSync(modelPath, 'utf8').replace(/export /g, '') + '\nglobalThis.model = {NAV_ITEMS,draftState,readiness};', scope);
    return scope.model || {};
}
test('savedDraftAndLiveCoexist', () => {
    const {draftState, NAV_ITEMS} = model();
    assert.equal(typeof draftState, 'function', 'shared draft state is available');
    const state = draftState({workingJson:'{"fields":["Name"]}',savedJson:'{"fields":["Name"]}',liveJson:'{"fields":["Phone"]}',busy:false,error:null});
    assert.deepEqual(JSON.parse(JSON.stringify(state)), {dirty:false,hasDraft:true,hasLive:true,label:'Draft saved'});
    assert.deepEqual(Array.from(NAV_ITEMS, item => item.value), ['overview','setup','objects','flows','publish','audit']);
    assert.deepEqual(Array.from(NAV_ITEMS, item => item.label), ['Overview','Setup','Record Cards','Flows','Review & Publish','Activity']);
});
test('workingChangesRemainDirtyWhileSavingOrAfterFailure', () => {
    const {draftState} = model();
    assert.equal(typeof draftState, 'function');
    for (const status of [{busy:false,error:null},{busy:true,error:null},{busy:false,error:'save failed'}]) {
        assert.equal(draftState({workingJson:'{"fields":["Name"]}',savedJson:'{}',liveJson:'{}',...status}).dirty, true);
    }
    assert.equal(draftState({workingJson:'{}',liveJson:'{}'}).label, 'Published');
    assert.equal(draftState({workingJson:'{}',savedJson:'{}'}).label, 'Draft saved');
    assert.equal(draftState({workingJson:'{"x":1}',liveJson:'{}'}).label, 'Unsaved changes');
    assert.equal(draftState({}).label, 'Not configured');
});
test('metadataOrClientProofUnknownCannotBecomeReady', () => {
    const {readiness} = model();
    assert.equal(typeof readiness, 'function', 'readiness is available');
    const layout = {sections:[{fields:[{api:'Name',editable:true}]}],permissions:{writeEnabled:true},actions:[]};
    const unknown = readiness({layout, fieldMetadata:null, actionErrors:null});
    assert.equal(unknown.find(item => item.key === 'fields').status, 'unavailable');
    assert.equal(unknown.find(item => item.key === 'edits').status, 'unavailable');
    assert.equal(unknown.find(item => item.key === 'actions').status, 'unavailable');
    assert.equal(unknown.find(item => item.key === 'test').status, 'unavailable');
    assert.notEqual(unknown.find(item => item.key === 'publish').status, 'ready');
});
test('readinessChecksKnownFieldsWritePolicyAndActionValidation', () => {
    const {readiness} = model();
    assert.equal(typeof readiness, 'function');
    const layout = {sections:[{fields:[{api:'Name',editable:true}]}],permissions:{writeEnabled:true},actions:[]};
    const fieldMetadata = [{api:'Name',updateable:'true'}];
    const ready = readiness({layout,fieldMetadata,actionErrors:[]});
    assert.equal(ready.find(item => item.key === 'fields').status, 'ready');
    assert.equal(ready.find(item => item.key === 'edits').status, 'ready');
    assert.equal(ready.find(item => item.key === 'actions').status, 'ready');
    const bad = readiness({layout:{...layout,permissions:{writeEnabled:false}},fieldMetadata,actionErrors:['invalid action']});
    assert.equal(bad.find(item => item.key === 'edits').status, 'attention');
    assert.equal(bad.find(item => item.key === 'actions').status, 'attention');
    assert.equal(readiness({layout,fieldMetadata:[],actionErrors:[]}).find(item => item.key === 'fields').status, 'attention');
    assert.equal(readiness({layout:{sections:[{fields:[{api:'Name',required:true,readOnly:true}]}]},fieldMetadata,actionErrors:[]}).find(item => item.key === 'edits').status, 'attention');
});

test('readOnlyCardDoesNotRequireWritesOrActions', () => {
    const {readiness} = model();
    const rows = readiness({layout:{sections:[{fields:[{api:'Name',readOnly:true}]}]},fieldMetadata:[{api:'Name',updateable:'false'}],actionErrors:[]});
    assert.equal(rows.find(item => item.key === 'fields').status, 'ready');
    assert.equal(rows.find(item => item.key === 'edits').status, 'ready');
    assert.match(rows.find(item => item.key === 'edits').message, /read.only/i);
    assert.equal(rows.find(item => item.key === 'actions').status, 'ready');
});

test('clearingWorkingJsonIsStillAnUnsavedChange', () => {
    const {draftState} = model();
    assert.equal(draftState({workingJson:'',savedJson:'{}'}).dirty, true);
    assert.equal(draftState({workingJson:'',savedJson:'{}'}).label, 'Unsaved changes');
});
