#!/usr/bin/env python3
"""Offline-only exact Task2 source archive and hash inventory; never contacts an org."""
import difflib
import hashlib
import json
from pathlib import Path
import zipfile

native = Path(__file__).resolve().parents[1]
root = native / 'force-app/main/default'
bundle = native / 'docs/evidence/install-auth-state'
files = sorted(root.glob('classes/CardstackConnection*.cls*'))
files += sorted((root / 'objects/Cardstack_Connection_Setup__c').rglob('*.xml'))
files += [root / f'customPermissions/{name}.customPermission-meta.xml' for name in ['Cardstack_Manage_Connections', 'Cardstack_Use_Connections']]
files += [root / f'permissionsets/Cardstack_{name}.permissionset-meta.xml' for name in ['Admin', 'User']]
files += [bundle / 'package.xml']
with zipfile.ZipFile(bundle / 'source.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in files:
        name = str(file.relative_to(native)) if file != bundle / 'package.xml' else 'package.xml'
        info = zipfile.ZipInfo(name, date_time=(2026, 10, 9, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, file.read_bytes())
receipt = {'offlineOnly': True, 'apiVersion': '67.0', 'format': 'Salesforce source archive; convert offline before SOAP deployment', 'files': {str(file.relative_to(native)): hashlib.sha256(file.read_bytes()).hexdigest() for file in files}, 'sourceZipSha256': hashlib.sha256((bundle / 'source.zip').read_bytes()).hexdigest()}
(bundle / 'source-inventory.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({'offlineOnly': True, 'fileCount': len(files)}))

# Reviewable mutation fixture only: remove stale-revision rejection from a copy.
repository = root / 'classes/CardstackConnectionSetupRepository.cls'
clean = repository.read_text()
guard = "        if(input.expectedRevision != revision) throw new CardstackConnectionTypes.ConnectionException('STALE_SETUP');\n"
assert clean.count(guard) == 1
mutated = clean.replace(guard, '')
patch = ''.join(difflib.unified_diff(clean.splitlines(keepends=True), mutated.splitlines(keepends=True), fromfile='a/force-app/main/default/classes/CardstackConnectionSetupRepository.cls', tofile='b/force-app/main/default/classes/CardstackConnectionSetupRepository.cls'))
(bundle / 'stale-revision-behavioral-red.patch').write_text(patch)
(bundle / 'mutation-inventory.json').write_text(json.dumps({'checkOnly': True, 'persistentDeploymentPermitted': False, 'manifest': 'package.xml', 'greenSourceZipSha256': receipt['sourceZipSha256'], 'originalRepositorySha256': hashlib.sha256(clean.encode()).hexdigest(), 'mutatedRepositorySha256': hashlib.sha256(mutated.encode()).hexdigest(), 'patchSha256': hashlib.sha256(patch.encode()).hexdigest(), 'expectedFailure': 'CardstackConnectionSetupTest.saveRejectsStaleRevision', 'scope': 'Remove only expectedRevision rejection from extracted copy; not original TDD chronology'}, indent=2) + '\n')
