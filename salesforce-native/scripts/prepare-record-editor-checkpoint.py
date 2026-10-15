#!/usr/bin/env python3
"""Offline API67 candidate preparation. No auth, org, network or deployment operations."""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1]
CORE = {'applications', 'classes', 'customPermissions', 'flexipages', 'lwc', 'objects', 'permissionsets', 'staticresources', 'tabs'}
# Explicit exclusions preserve installed HXL and all org setup; no delete manifest exists.
EXCLUDED = {'uiWidgets','lightningTypes','mcpServerDefinitions','externalClientApps','extlClntAppOauthSettings','connectedApps','authproviders','sites','siteDotComSites','networks','profiles','settings','namedCredentials','externalCredentials','extlClntAppGlobalOauthSettings','extlClntAppOauthPolicies'}
OVERLAY = {'CardstackMcpTransportProbeTest','CardstackSiteAuthProbeTest'}
NS = '{http://soap.sforce.com/2006/04/metadata}'

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def write_json(path, body): path.write_text(json.dumps(body,indent=2,sort_keys=True)+'\n');path.chmod(0o600)
def clean_comments(body):
    tokens = re.compile(r"'(?:\\.|[^'\\])*'|//[^\n]*|/\*[\s\S]*?\*/")
    return tokens.sub(lambda match: match[0] if match[0].startswith("'") else ' ',body)
def test_identities(folder, snapshot=None):
    identities=[]
    paths=sorted(folder.glob('*.cls')) if snapshot is None else sorted(folder/name for name in snapshot if name.endswith('.cls'))
    for path in paths:
        body=clean_comments(path.read_text() if snapshot is None else snapshot[path.name].decode('utf-8'))
        if not re.search(r'(?i)@istest\b',body): continue
        declared=re.search(r'(?i)\bclass\s+(\w+)',body)
        if not declared or declared[1] != path.stem: raise ValueError('TEST_INVENTORY_MALFORMED')
        pattern=r'(?i)(?:@istest(?:\([^)]*\))?\s+(?:(?:public|private|protected)\s+)?static\s+void|(?:public\s+|private\s+)?static\s+testmethod\s+void)\s+(\w+)\s*\('
        identities += [path.stem+'.'+match[1] for match in re.finditer(pattern,body)]
    if len({name.lower() for name in identities}) != len(identities): raise ValueError('TEST_INVENTORY_DUPLICATE')
    return sorted(identities)
def verify_tests(expected, observed):
    if not isinstance(expected,list) or not expected or any(not isinstance(name,str) or not re.fullmatch(r'[A-Za-z]\w*\.[A-Za-z]\w*',name) for name in expected) or len({name.lower() for name in expected}) != len(expected) or sorted(expected) != observed: raise ValueError('TEST_INVENTORY_MISMATCH')
def files(folder):
    for path in folder.rglob('*'):
        if path.is_symlink(): raise ValueError('UNSAFE_SOURCE_SYMLINK')
    return sorted(path.relative_to(folder).as_posix() for path in folder.rglob('*') if path.is_file())
def pairs(root, names):
    for name in names:
        path=root/name
        if name.endswith('.cls') or name.endswith('.resource'):
            if name+'-meta.xml' not in names: raise ValueError('MISSING_PAIR')
        if name.endswith('.cls-meta.xml') or name.endswith('.resource-meta.xml'):
            if name[:-9] not in names: raise ValueError('MISSING_PAIR')
        if name.startswith('lwc/'):
            bundle=Path(name).parts[1]
            if 'lwc/'+bundle+'/'+bundle+'.js-meta.xml' not in names: raise ValueError('MISSING_PAIR')
        if name.endswith('.xml'):
            try: ET.parse(path)
            except ET.ParseError: raise ValueError('METADATA_MALFORMED') from None

def prepare(source, destination, inventory, overlay=None):
    source=Path(source).resolve(); raw=Path(destination).absolute();destination=raw.resolve()
    if destination == source or source in destination.parents or any(parent.is_symlink() for parent in [raw,*raw.parents] if parent not in [Path('/var'),Path('/tmp')]) or destination == Path(destination.anchor): raise ValueError('UNSAFE_DESTINATION')
    if destination.exists(): raise ValueError('DESTINATION_EXISTS')
    if inventory.get('apiVersion') != '67.0': raise ValueError('API67_REQUIRED')
    native=source/'force-app/main/default'; names=files(native)
    families={Path(name).parts[0] for name in names}
    if families - CORE - EXCLUDED: raise ValueError('UNSUPPORTED_FAMILY')
    core_names=[name for name in names if Path(name).parts[0] in CORE]
    expected=inventory.get('coreFiles')
    if not isinstance(expected,list) or not expected or len(set(expected)) != len(expected) or any(not isinstance(name,str) or Path(name).is_absolute() or '..' in Path(name).parts for name in expected): raise ValueError('COMPONENT_INVENTORY_MALFORMED')
    if set(core_names)-set(expected): raise ValueError('UNLISTED_SOURCE')
    if set(expected)-set(core_names): raise ValueError('MISSING_SOURCE')
    pairs(native,core_names)
    source_inventory=[{'component':name,'sha256':sha(native/name)} for name in core_names]
    core_tests=test_identities(native/'classes');verify_tests(inventory.get('coreTests'),core_tests)
    overlay_names=[];overlay_tests=[];overlay_inventory=[]
    if overlay is not None:
        overlay=Path(overlay).resolve();overlay_names=files(overlay)
        if set(overlay_names) != {name+suffix for name in OVERLAY for suffix in ['.cls','.cls-meta.xml']}: raise ValueError('OVERLAY_INVENTORY')
        # Validate identities and metadata against one frozen byte snapshot.
        overlay_snapshot={name:(overlay/name).read_bytes() for name in overlay_names}
        overlay_inventory=[{'component':name,'sha256':hashlib.sha256(overlay_snapshot[name]).hexdigest()} for name in overlay_names]
        for name in OVERLAY:
            if not re.search(r'(?i)@istest\s+(?:private\s+)?with\s+sharing\s+class\s+'+name+r'\b',clean_comments(overlay_snapshot[name+'.cls'].decode('utf-8'))): raise ValueError('OVERLAY_NOT_TEST')
            try: metadata=ET.fromstring(overlay_snapshot[name+'.cls-meta.xml'])
            except ET.ParseError: raise ValueError('METADATA_MALFORMED') from None
            if metadata.findtext(NS+'apiVersion') != '67.0': raise ValueError('API67_REQUIRED')
        overlay_tests=test_identities(overlay,overlay_snapshot)
        overlay_expected=inventory.get('overlayTests',{})
        for name in OVERLAY: verify_tests(overlay_expected.get(name),[identity for identity in overlay_tests if identity.startswith(name+'.')])
        if len({name.lower() for name in core_tests+overlay_tests}) != len(core_tests+overlay_tests): raise ValueError('TEST_INVENTORY_DUPLICATE')
    destination.mkdir(mode=0o700,parents=True,exist_ok=False)
    # Retain every failure after the private artifact begins; never clean it up.
    write_json(destination/'status.json',{'status':'PREPARING','apiVersion':'67.0','native':'NOT_RUN'})
    try:
        env={**os.environ,'SF_DISABLE_TELEMETRY':'true','SF_AUTOUPDATE_DISABLE':'true'}
        stage=destination/'core-source'
        result=subprocess.run([sys.executable,str(source/'scripts/build-package.py'),'--core-only',str(stage)],cwd=source,env=env,capture_output=True,text=True)
        (destination/'stage.log').write_text(result.stdout+result.stderr)
        if result.returncode: raise ValueError('STAGING_FAILED')
        staged=stage/'force-app/main/default'
        if files(staged) != core_names or any(sha(staged/item['component']) != item['sha256'] for item in source_inventory): raise ValueError('STAGING_INVENTORY_MISMATCH')
        conversion=destination/'deploy-source';shutil.copytree(stage,conversion)
        if overlay is not None:
            for name in overlay_names:
                shutil.copy2(overlay/name,conversion/'force-app/main/default/classes'/name)
            if any(sha(conversion/'force-app/main/default/classes'/item['component']) != item['sha256'] for item in overlay_inventory): raise ValueError('OVERLAY_STAGING_INVENTORY_MISMATCH')
        mdapi=destination/'mdapi'
        result=subprocess.run(['sf','project','convert','source','--root-dir',str(conversion/'force-app'),'--output-dir',str(mdapi),'--api-version','67.0','--json'],cwd=conversion,env=env,capture_output=True,text=True)
        (destination/'conversion.log').write_text(result.stdout+result.stderr)
        if result.returncode: raise ValueError('CONVERSION_FAILED')
        manifest=ET.parse(mdapi/'package.xml').getroot()
        if manifest.findtext(NS+'version') != '67.0': raise ValueError('API67_REQUIRED')
        mdapi_names=files(mdapi)
        allowed_types={'ApexClass','CustomApplication','CustomPermission','FlexiPage','LightningComponentBundle','CustomObject','CustomField','PermissionSet','StaticResource','CustomTab'}
        if any(section.findtext(NS+'name') not in allowed_types for section in manifest.findall(NS+'types')): raise ValueError('CONVERTED_FAMILY_UNSUPPORTED')
        if any('destructiveChanges' in name or name.startswith('unpackaged/') for name in mdapi_names): raise ValueError('UNSAFE_ZIP_SHAPE')
        with zipfile.ZipFile(destination/'deploy.zip','x',compression=zipfile.ZIP_DEFLATED) as archive:
            for name in mdapi_names:
                info=zipfile.ZipInfo(name,date_time=(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o600 << 16
                archive.writestr(info,(mdapi/name).read_bytes())
        if any(sha(native/item['component']) != item['sha256'] for item in source_inventory): raise ValueError('SOURCE_CHANGED_DURING_PREPARATION')
        if overlay is not None and (files(overlay) != overlay_names or any(sha(overlay/item['component']) != item['sha256'] or sha(conversion/'force-app/main/default/classes'/item['component']) != item['sha256'] for item in overlay_inventory)): raise ValueError('OVERLAY_CHANGED_DURING_PREPARATION')
        receipt={'status':'PREPARED','apiVersion':'67.0','native':'NOT_RUN','persistentOverlay':'spike2-retained-tests/v1' if overlay is not None else None,'sourceInventory':source_inventory,'overlayInventory':overlay_inventory,'metadataInventory':[{'component':name,'sha256':sha(mdapi/name)} for name in mdapi_names],'testIdentities':sorted(core_tests+overlay_tests),'excludedFamilies':sorted(families & EXCLUDED),'zipSha256':sha(destination/'deploy.zip')}
        write_json(destination/'inventory.json',receipt)
        (destination/'SHA256SUMS').write_text(receipt['zipSha256']+'  deploy.zip\n')
        write_json(destination/'status.json',{'status':'PREPARED','apiVersion':'67.0','native':'NOT_RUN','tests':len(receipt['testIdentities']),'coreFiles':len(core_names),'overlayFiles':len(overlay_names),'zipSha256':receipt['zipSha256']})
        return receipt
    except Exception as failure:
        code=str(failure) if isinstance(failure,ValueError) else 'PREPARATION_FAILED'
        write_json(destination/'status.json',{'status':'FAILED','errorCode':code,'native':'NOT_RUN'})
        raise ValueError(code) from None
    finally:
        for path in destination.rglob('*'):path.chmod(0o700 if path.is_dir() else 0o600)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination',type=Path,help='New private artifact directory outside salesforce-native')
    parser.add_argument('--persistent-overlay',choices=['spike2-retained-tests/v1'],help='Explicitly include the 40 retained persistent-org test identities; not distributable source')
    args=parser.parse_args()
    try:
        inventory=json.loads((SOURCE/'scripts/record-editor-checkpoint-inventory.json').read_text())
        receipt=prepare(SOURCE,args.destination,inventory,SOURCE/'integration/spike2' if args.persistent_overlay else None)
        print(json.dumps({'status':receipt['status'],'apiVersion':'67.0','native':'NOT_RUN','coreFiles':len(receipt['sourceInventory']),'overlayFiles':len(receipt['overlayInventory']),'tests':len(receipt['testIdentities']),'zipSha256':receipt['zipSha256']}))
    except (ValueError,OSError,json.JSONDecodeError):
        print(json.dumps({'status':'FAILED','errorCode':'PREPARATION_FAILED','native':'NOT_RUN'}));return 1
    return 0
if __name__=='__main__':sys.exit(main())
