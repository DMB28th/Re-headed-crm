const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.resolve(__dirname, '../scripts/build-package.py');
const metadata = 'force-app/main/default';
const privateMarker = 'DO_NOT_PACKAGE_CREDENTIAL';

function put(root, name, content) {
    const file = path.join(root, metadata, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
}

function stage(coreOnly) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cardstack-package-fixture-'));
    const source = path.join(root, 'source');
    const destination = path.join(root, 'stage');
    fs.mkdirSync(path.join(source, 'scripts'), { recursive: true });
    fs.copyFileSync(script, path.join(source, 'scripts/build-package.py'));
    fs.writeFileSync(path.join(source, 'sfdx-project.json'), JSON.stringify({ packageDirectories: [{ path: 'force-app' }] }));
    put(source, 'classes/CardstackMcpIngress.cls', 'public class CardstackMcpIngress {}');
    put(source, 'lwc/cardstackConnection/cardstackConnection.js', 'export default class CardstackConnection {}');
    put(source, 'staticresources/CardstackConnectionUi.resource', '<html>safe transport</html>');
    put(source, 'objects/Cardstack_Connection__c/Cardstack_Connection__c.object-meta.xml', '<CustomObject/>');
    put(source, 'permissionsets/Cardstack_User.permissionset-meta.xml', '<PermissionSet/>');
    put(source, 'permissionsets/Site_Guest.permissionset-meta.xml', `<PermissionSet>${privateMarker}</PermissionSet>`);
    put(source, 'uiWidgets/CardstackWidget.uiWidget-meta.xml', '<UiWidget/>');
    put(source, 'lightningTypes/CardstackType.lightningType-meta.xml', '<LightningType/>');
    for (const dir of ['mcpServerDefinitions', 'externalClientApps', 'extlClntAppOauthSettings',
        'connectedApps', 'authproviders', 'sites', 'siteDotComSites', 'networks', 'profiles',
        'settings', 'namedCredentials']) {
        put(source, `${dir}/per-org.xml`, `<Companion credential="${privateMarker}"/>`);
    }
    const result = spawnSync('python3', [path.join(source, 'scripts/build-package.py'),
        ...(coreOnly ? ['--core-only'] : []), destination], { encoding: 'utf8' });
    return { root, destination, result };
}

function stageFiles(destination) {
    const names = [];
    function visit(folder) {
        for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
            const name = path.join(folder, entry.name);
            if (entry.isDirectory()) visit(name);
            else names.push(path.relative(destination, name));
        }
    }
    visit(destination);
    return names.sort();
}

test('excludesCompanionSecretsAndSites and includesOnlyPackageableTransport in core stage', () => {
    const { root, destination, result } = stage(true);
    try {
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(stageFiles(destination), [
            'config/package-org.json',
            'force-app/main/default/classes/CardstackMcpIngress.cls',
            'force-app/main/default/lwc/cardstackConnection/cardstackConnection.js',
            'force-app/main/default/objects/Cardstack_Connection__c/Cardstack_Connection__c.object-meta.xml',
            'force-app/main/default/permissionsets/Cardstack_User.permissionset-meta.xml',
            'force-app/main/default/staticresources/CardstackConnectionUi.resource',
            'sfdx-project.json',
        ]);
        for (const file of stageFiles(destination)) {
            assert.equal(fs.readFileSync(path.join(destination, file)).includes(privateMarker), false, file);
        }
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('normal stage retains the existing HXL and Lightning companion source', () => {
    const { root, destination, result } = stage(false);
    try {
        assert.equal(result.status, 0, result.stderr);
        const files = stageFiles(destination);
        assert.ok(files.includes('force-app/main/default/uiWidgets/CardstackWidget.uiWidget-meta.xml'));
        assert.ok(files.includes('force-app/main/default/lightningTypes/CardstackType.lightningType-meta.xml'));
        assert.ok(files.includes('force-app/main/default/classes/CardstackMcpIngress.cls'));
        for (const file of files) assert.equal(fs.readFileSync(path.join(destination, file)).includes(privateMarker), false, file);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});


test('actual package stage excludes retired Home editor source and retains compatibility types', () => {
    const destination = path.join(os.tmpdir(), `cardstack-retirement-stage-${process.pid}-${Date.now()}`);
    const result = spawnSync('python3', [script, destination], {encoding:'utf8'});
    try {
        assert.equal(result.status,0,result.stderr);
        const files = stageFiles(destination);
        assert.equal(files.some(file=>file.includes('/lwc/cardstackHomeCardConfig/')),false);
        assert.ok(files.some(file=>file.includes('/classes/CardstackHomeAction.cls')));
        assert.ok(files.some(file=>file.includes('/lightningTypes/cardstackHomeResult/')));
        assert.equal(files.some(file=>file.includes('/lwc/cardstackSetupChecklist/')),false);
        assert.ok(files.some(file=>file.includes('/lwc/cardstackConnectionSetup/')));
    } finally { fs.rmSync(destination,{recursive:true,force:true}); }
});
