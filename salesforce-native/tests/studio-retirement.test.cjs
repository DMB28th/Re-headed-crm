const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const base = path.resolve(__dirname, '../force-app/main/default');
const read = file => fs.readFileSync(path.join(base, file), 'utf8');

test('actual MCP discovery retires only Home and preserves supported tools', () => {
    const result = spawnSync('python3', ['-c', `import json, xml.etree.ElementTree as E, sys
r=E.parse(sys.argv[1]).getroot(); n={'m':'http://soap.sforce.com/2006/04/metadata'}
print(json.dumps({'tools':[e.text for e in r.findall('m:tools/m:toolName',n)], 'resources':[e.text for e in r.findall('m:resources/m:resourceName',n)]}))`, path.join(base, 'mcpServerDefinitions/Cardstack.mcpServerDefinition-meta.xml')], {encoding:'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const discovery = JSON.parse(result.stdout);
    assert.equal(discovery.tools.includes('CardstackHomeAction'), false);
    assert.equal(discovery.resources.includes('cardstackHome'), false);
    for (const tool of ['CardstackGetRecordAction','CardstackListViewAction','CardstackListViewsAction','CardstackFlowStartAction','CardstackFlowContinueAction','CardstackFlowCancelAction','CardstackPreviewCompleteTaskAction','CardstackCompleteTaskAction']) assert.ok(discovery.tools.includes(tool), tool);
});

test('Home and unsupported audience authoring are absent and layout routing stays default', () => {
    assert.doesNotMatch(read('lwc/cardstackStudio/cardstackStudio.html'), /home card|home-card-config/i);
    assert.equal(fs.existsSync(path.join(base,'lwc/cardstackHomeCardConfig')), false);
    const html = read('lwc/cardstackObjectConfig/cardstackObjectConfig.html');
    assert.doesNotMatch(html, /label="(?:Audience|Assignment|View as|Add Audience)"/);
    const source = read('lwc/cardstackObjectConfig/cardstackObjectConfig.js').replace(/^import .*;$/gm,'').replace(/^\s*@wire\(.*\)\s*$/gm,'').replace(/@(track|api)\s+/g,'').replace(/export default class \w+/, 'globalThis.Component = class');
    const context = {LightningElement:class {}, ShowToastEvent:class {},setTimeout}; require('./studio-authoring-fixture.cjs').install(context);vm.runInNewContext(source,context);
    const component = new context.Component(); component.selectedObject='Contact'; component.audience='sales';
    assert.equal(component.layoutKey,'layout:Contact:default');
    component.workingHighlights=[{api:'LastName'}]; component.workingSections=[]; component.syncPreview();
    assert.equal(component._previewHighlights,component.workingHighlights);
    assert.equal(JSON.parse(component.generatedJson).name,'default');
});

test('retirement guards precede writes and retained history reads stay available', () => {
    const service = read('classes/CardstackConfigService.cls');
    assert.match(service,/public static Boolean isRetiredKey\(String key\)/);
    assert.match(service,/public static Boolean isSupportedStudioKey\(String key\)/);
    assert.match(service,/RETIRED_CONFIGURATION/);
    const save = service.split('public static Id saveDraft')[1].split('// ---------- Publish')[0];
    assert.ok(save.indexOf('validateAuthoringKey(key)')>=0 && save.indexOf('validateAuthoringKey(key)')<save.indexOf('getOrCreateConfig'));
    const publish = service.split('public static void publishDraft')[1].split('public static void rollbackDraft')[0];
    assert.ok(publish.indexOf('validateAuthoringKey(draft.Config__r.Name)')>=0 && publish.indexOf('validateAuthoringKey(draft.Config__r.Name)')<publish.indexOf('update cfgDecision'));
    assert.doesNotMatch(service.split('public static void rollbackDraft')[1].split('public static List<Cardstack_Config_Draft__c> listDrafts')[0],/validateAuthoringKey/);
    assert.doesNotMatch(service.split('public static List<Cardstack_Config_Draft__c> listDrafts')[1].split('public static List<Cardstack_Config_Draft__c> listSupportedDrafts')[0],/isSupportedStudioKey|isRetiredKey/);
    assert.match(read('classes/CardstackStudioController.cls'),/CardstackConfigService.isSupportedStudioKey/);
});

test('cached Home compatibility response contains no CRM query or rows', () => {
    const home = read('classes/CardstackHomeAction.cls');
    assert.doesNotMatch(home,/SELECT |Database\.query|Schema\.getGlobalDescribe/);
    assert.match(home,/Home Card has been retired\. Request a record or list instead\./);
    assert.match(home,/res\.tasks = new List<HomeTask>\(\)/);
    assert.match(home,/res\.recent = new List<RecentItem>\(\)/);
    for (const type of ['HomeRequest','HomeResponse','HomeTask','RecentItem']) assert.match(home,new RegExp('global class '+type));
    for (const type of ['cardstackHomeOutputValues','cardstackHomeResult']) assert.ok(fs.existsSync(path.join(base,'lightningTypes',type)));
    assert.doesNotMatch(read('applications/Cardstack_Studio.app-meta.xml'),/standard-home|home card/i);
});


function publishConsumer(rows, status = '') {
    const context = { LightningElement: class { dispatchEvent() {} }, CustomEvent: class {}, ShowToastEvent: class {}, refreshApex: async () => {}, CardstackReviewDialog: {open: async () => true}, LightningConfirm: {open: async () => true} };
    const model = path.join(base, 'lwc/cardstackStudioKeys/cardstackStudioKeys.js');
    if (fs.existsSync(model)) vm.runInNewContext(fs.readFileSync(model,'utf8').replace(/export /g,''),context);
    vm.runInNewContext(read('lwc/cardstackConfigDiff/cardstackConfigDiff.js').replace(/^import .*;$/gm,'').replace(/export /g,''),context);
    vm.runInNewContext(read('lwc/cardstackPublishModel/cardstackPublishModel.js').replace(/export /g,''),context);
    const source = read('lwc/cardstackPublishCenter/cardstackPublishCenter.js').replace(/^import .*;$/gm,'').replace(/^\s*@wire\(.*\)\s*$/gm,'').replace(/@(track|api)\s+/g,'').replace(/export default class \w+/,'globalThis.Component = class');
    require('./studio-authoring-fixture.cjs').install(context);vm.runInNewContext(source,context);
    const component = new context.Component(); component.toast=()=>{}; if (status) component.statusFilter=status;
    component.wiredResult = {data: rows};
    return {component, context};
}

const plain = value => JSON.parse(JSON.stringify(value));
const draftRow = (index,key,status='Draft') => ({Id:`a01${String(index).padStart(12,'0')}AAA`,Name:`Draft ${index}`,Config__r:{Name:key},Status__c:status,Draft_Value__c:'{}'});

test('actual default and Draft Publish Center consumer publishes only supported candidates and retains discard/history', async () => {
    const rows = [draftRow(1,'homecard'),draftRow(2,'layout:Account:sales'),draftRow(3,'layout:Contact:default'),draftRow(4,'flows'),draftRow(5,'exposures:Account'),draftRow(6,'homecard','Published'),draftRow(7,'layout:Account:sales','Rolled Back')];
    for (const status of ['', 'Draft']) {
        const {component,context} = publishConsumer(rows.filter(row=>!status || row.Status__c===status),status);
        assert.equal(component.statusFilter,status,'Default constructor uses the All view.');
        assert.deepEqual(plain(component.pendingDrafts).map(row=>row.configKey),['layout:Contact:default','flows','exposures:Account']);
        assert.deepEqual(plain(component.retainedDrafts).map(row=>row.configKey),['homecard','layout:Account:sales']);
        assert.equal(component.otherDrafts.length,status ? 0 : 2);
        const published=[],discarded=[],diffs=[];
        context.getDraftReview=async ({draftId})=>({draftId,key:rows.find(row=>row.Id===draftId).Config__r.Name,liveValue:null,draftValue:'{}',liveDigest:'live',draftDigest:'draft'});
        context.publishReviewedDraft=async ({draftId})=>published.push(draftId);
        context.rollbackDraft=async ({draftId})=>discarded.push(draftId);
        context.getStagingInfo=async ({key})=>{diffs.push(key);return {liveValue:'{}'};};
        await component.loadDiffs(component.wiredResult.data);
        assert.deepEqual(diffs,['layout:Contact:default','flows','exposures:Account']);
        component.selectedIds=component.pendingDrafts.map(row=>row.Id); await component.publishSelected(); assert.deepEqual(published,rows.slice(2,5).map(row=>row.Id));
        for (const row of component.retainedDrafts) {
            component.toggleJson({currentTarget:{dataset:{id:row.Id}}});
            const inspected=component.retainedDrafts.find(candidate=>candidate.Id===row.Id);
            assert.equal(inspected.showJson,true); assert.deepEqual(JSON.parse(inspected.prettyValue),{});
            await component.askRollback({currentTarget:{dataset:{id:row.Id}}});
        }
        assert.deepEqual(discarded,rows.slice(0,2).map(row=>row.Id));
    }
    const html=read('lwc/cardstackPublishCenter/cardstackPublishCenter.html');
    assert.match(html,/for:each=\{retainedDrafts\}/);
    const retainedSection=html.split('for:each={retainedDrafts}')[1].split('<template if:true={otherDrafts.length}>')[0];
    assert.match(retainedSection,/onclick=\{askRollback\}/); assert.doesNotMatch(retainedSection,/onclick=\{publish\}/);
});

test('supported query selection and authoritative count are independent of bounded generic history', () => {
    const service=read('classes/CardstackConfigService.cls');
    assert.match(service,/public static List<Cardstack_Config_Draft__c> listSupportedDrafts\(\)/);
    assert.match(service,/public static Integer countSupportedDrafts\(\)/);
    const active=service.split('public static List<Cardstack_Config_Draft__c> listSupportedDrafts()')[1].split('public static Integer countSupportedDrafts()')[0];
    assert.match(active,/Config__c IN :supportedConfigIds/);
    assert.ok(active.indexOf('Config__c IN :supportedConfigIds')<active.indexOf('LIMIT 200'));
    const count=service.split('public static Integer countSupportedDrafts()')[1].split('// ----------')[0];
    assert.match(count,/COUNT\(\)/); assert.match(count,/Config__c IN :supportedConfigIds/); assert.doesNotMatch(count,/LIMIT 200/);
    const controller=read('classes/CardstackStudioController.cls');
    assert.match(controller,/CardstackConfigService.listSupportedDrafts\(\)/);
    assert.match(controller,/data.put\('pendingDraftCount', CardstackConfigService.countSupportedDrafts\(\)\)/);
    assert.match(controller,/Integer draftCount = CardstackConfigService.countSupportedDrafts\(\)/);
});


test('shared active key classifier retains the backend supported key contract', () => {
    const {context}=publishConsumer([]);
    for (const key of ['layout:Account:default','layout:Contact:default','layout:Custom__c:default','exposures:Opportunity','flows']) assert.equal(context.isSupportedStudioKey(key),true,key);
    for (const key of [null,undefined,'','homecard','layout:Account:sales','layout::default','layout:Account:Default','exposures:','exposures:Account:extra','setup:claudeConnected','screens','FLOWS']) assert.equal(context.isSupportedStudioKey(key),false,key);
});
