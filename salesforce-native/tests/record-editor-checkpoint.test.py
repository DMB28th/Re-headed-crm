"""Offline preparation contracts; conversion success uses the installed Salesforce CLI."""
import importlib.util
import json
import shutil
import tempfile
import unittest
import zipfile
from unittest.mock import patch
from types import SimpleNamespace
from pathlib import Path
SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/prepare-record-editor-checkpoint.py'

class CheckpointTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='cardstack-preparation-test-')
        self.root = Path(self.tmp.name)
        self.source = self.root / 'source'
        (self.source / 'scripts').mkdir(parents=True)
        shutil.copy2(SCRIPT.parent / 'build-package.py', self.source / 'scripts/build-package.py')
        (self.source / 'sfdx-project.json').write_text(json.dumps({'packageDirectories':[{'path':'force-app','default':True}],'sourceApiVersion':'67.0'}))
        self.put('classes/FixtureTest.cls', '@IsTest private with sharing class FixtureTest { @IsTest static void checksValue() { Assert.areEqual(1,1); } }')
        self.put('classes/FixtureTest.cls-meta.xml', '<ApexClass xmlns="http://soap.sforce.com/2006/04/metadata"><apiVersion>67.0</apiVersion><status>Active</status></ApexClass>')
        self.inventory = {'apiVersion':'67.0','coreFiles':['classes/FixtureTest.cls','classes/FixtureTest.cls-meta.xml'],'coreTests':['FixtureTest.checksValue'],'overlayTests':{}}
        spec=importlib.util.spec_from_file_location('checkpoint', SCRIPT)
        self.module=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.module)
    def tearDown(self): self.tmp.cleanup()
    def put(self,path,body):
        target=self.source/'force-app/main/default'/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(body)
    def prepare(self,name='artifact',overlay=None): return self.module.prepare(self.source,self.root/name,self.inventory,overlay)
    def test_root_zip_api67_and_deterministic_inventory(self):
        one=self.prepare('one');two=self.prepare('two')
        self.assertEqual(one['zipSha256'],two['zipSha256'])
        self.assertEqual(one['testIdentities'],['FixtureTest.checksValue'])
        self.assertEqual(one['sourceInventory'],two['sourceInventory'])
        with zipfile.ZipFile(self.root/'one/deploy.zip') as archive:
            self.assertIn('package.xml',archive.namelist());self.assertIn('classes/FixtureTest.cls',archive.namelist())
            self.assertIn(b'<version>67.0</version>',archive.read('package.xml'))
            self.assertFalse(any(name.startswith('unpackaged/') for name in archive.namelist()))
        self.assertEqual((self.root/'one').stat().st_mode & 0o777,0o700)
    def test_existing_destination_is_never_overwritten(self):
        target=self.root/'artifact';target.mkdir();(target/'sentinel').write_text('keep')
        with self.assertRaisesRegex(ValueError,'DESTINATION_EXISTS'):self.prepare()
        self.assertEqual((target/'sentinel').read_text(),'keep')
    def test_authoritative_and_symlink_destinations_rejected(self):
        with self.assertRaisesRegex(ValueError,'UNSAFE_DESTINATION'):self.module.prepare(self.source,self.source/'out',self.inventory)
        (self.root/'linked').symlink_to(self.source,target_is_directory=True)
        with self.assertRaisesRegex(ValueError,'UNSAFE_DESTINATION'):self.module.prepare(self.source,self.root/'linked/out',self.inventory)
    def test_unknown_family_and_unlisted_component_rejected(self):
        self.put('unknownFamily/Unexpected.xml','<Unknown/>')
        with self.assertRaisesRegex(ValueError,'UNSUPPORTED_FAMILY'):self.prepare()
        shutil.rmtree(self.source/'force-app/main/default/unknownFamily')
        self.put('classes/Unlisted.cls','public class Unlisted {}')
        with self.assertRaisesRegex(ValueError,'UNLISTED_SOURCE'):self.prepare()
    def test_missing_pair_is_rejected_before_conversion(self):
        (self.source/'force-app/main/default/classes/FixtureTest.cls-meta.xml').unlink()
        with self.assertRaisesRegex(ValueError,'MISSING_SOURCE|MISSING_PAIR'):self.prepare()
    def test_empty_duplicate_and_malformed_test_inventories_rejected(self):
        for values in [[],['FixtureTest.checksValue']*2,['FixtureTest'],['FixtureTest.missing']]:
            self.inventory['coreTests']=values
            with self.assertRaisesRegex(ValueError,'TEST_INVENTORY'):self.prepare()
    def test_forbidden_org_families_excluded_without_delete_manifest(self):
        self.put('settings/Security.settings-meta.xml','private-marker')
        receipt=self.prepare()
        self.assertEqual(receipt['excludedFamilies'],['settings'])
        with zipfile.ZipFile(self.root/'artifact/deploy.zip') as archive:
            self.assertFalse(any('settings/' in name or 'destructiveChanges' in name for name in archive.namelist()))
            self.assertFalse(any(b'private-marker' in archive.read(name) for name in archive.namelist()))
    def test_overlay_rejects_nonallowlisted_and_nontest_classes(self):
        overlay=self.root/'overlay';overlay.mkdir();(overlay/'OtherTest.cls').write_text('@IsTest class OtherTest {}')
        with self.assertRaisesRegex(ValueError,'OVERLAY_INVENTORY'):self.prepare(overlay=overlay)
        (overlay/'OtherTest.cls').unlink()
        (overlay/'CardstackMcpTransportProbeTest.cls').write_text('public class CardstackMcpTransportProbeTest {}')
        (overlay/'CardstackMcpTransportProbeTest.cls-meta.xml').write_text('<ApexClass/>')
        with self.assertRaisesRegex(ValueError,'OVERLAY_INVENTORY|OVERLAY_NOT_TEST'):self.prepare(overlay=overlay)
    def test_allowlisted_class_only_overlay_has_separate_hashes_and_combined_identities(self):
        overlay=self.root/'overlay';overlay.mkdir()
        for name in sorted(self.module.OVERLAY):
            (overlay/(name+'.cls')).write_text('@IsTest private with sharing class '+name+' { @IsTest static void retainedMethod() {} }')
            (overlay/(name+'.cls-meta.xml')).write_text('<ApexClass xmlns="http://soap.sforce.com/2006/04/metadata"><apiVersion>67.0</apiVersion><status>Active</status></ApexClass>')
            self.inventory['overlayTests'][name]=[name+'.retainedMethod']
        receipt=self.prepare(overlay=overlay)
        self.assertEqual(len(receipt['testIdentities']),3)
        self.assertEqual(len(receipt['overlayInventory']),4)
        self.assertFalse((self.root/'artifact/core-source/force-app/main/default/classes/CardstackSiteAuthProbeTest.cls').exists())
        with zipfile.ZipFile(self.root/'artifact/deploy.zip') as archive: self.assertIn('classes/CardstackSiteAuthProbeTest.cls',archive.namelist())
    def overlay_fixture(self):
        overlay=self.root/'overlay';overlay.mkdir()
        for name in sorted(self.module.OVERLAY):
            (overlay/(name+'.cls')).write_text('@IsTest private with sharing class '+name+' { @IsTest static void retainedMethod() {} }')
            (overlay/(name+'.cls-meta.xml')).write_text('<ApexClass xmlns="http://soap.sforce.com/2006/04/metadata"><apiVersion>67.0</apiVersion><status>Active</status></ApexClass>')
            self.inventory['overlayTests'][name]=[name+'.retainedMethod']
        return overlay
    def assert_retained_overlay_failure(self,code,conversion=False):
        artifact=self.root/'artifact'
        self.assertEqual(json.loads((artifact/'status.json').read_text()),{'status':'FAILED','errorCode':code,'native':'NOT_RUN'})
        self.assertTrue((artifact/'stage.log').exists())
        self.assertTrue((artifact/'core-source/force-app/main/default/classes/FixtureTest.cls').exists())
        self.assertFalse((artifact/'inventory.json').exists())
        self.assertEqual((artifact/'stage.log').stat().st_mode & 0o777,0o600)
        if conversion: self.assertTrue((artifact/'conversion.log').exists())
    def test_overlay_method_drift_during_staging_rejects_changed_validated_identities(self):
        overlay=self.overlay_fixture();target=overlay/'CardstackMcpTransportProbeTest.cls';original=self.module.subprocess.run
        def run(args,**kwargs):
            result=original(args,**kwargs)
            if args[0]!='sf': target.write_text(target.read_text().replace('retainedMethod','changedMethod'))
            return result
        with patch.object(self.module.subprocess,'run',run):
            with self.assertRaisesRegex(ValueError,'OVERLAY_STAGING_INVENTORY_MISMATCH'):self.prepare(overlay=overlay)
        self.assert_retained_overlay_failure('OVERLAY_STAGING_INVENTORY_MISMATCH')
    def test_overlay_copy_corruption_rejects_bytes_not_present_in_preflight(self):
        overlay=self.overlay_fixture();target=overlay/'CardstackMcpTransportProbeTest.cls';before=target.read_bytes();original=self.module.shutil.copy2
        def copy(source,destination,*args,**kwargs):
            result=original(source,destination,*args,**kwargs)
            if Path(source).resolve()==target.resolve(): Path(destination).write_bytes(Path(destination).read_bytes()+b'\n// copy drift')
            return result
        with patch.object(self.module.shutil,'copy2',copy):
            with self.assertRaisesRegex(ValueError,'OVERLAY_STAGING_INVENTORY_MISMATCH'):self.prepare(overlay=overlay)
        self.assertEqual(target.read_bytes(),before)
        self.assert_retained_overlay_failure('OVERLAY_STAGING_INVENTORY_MISMATCH')
    def test_overlay_original_drift_after_conversion_rejects_prepared_result(self):
        overlay=self.overlay_fixture();target=overlay/'CardstackMcpTransportProbeTest.cls';original=self.module.subprocess.run
        def run(args,**kwargs):
            result=original(args,**kwargs)
            if args[0]=='sf': target.write_bytes(target.read_bytes()+b'\n// source drift')
            return result
        with patch.object(self.module.subprocess,'run',run):
            with self.assertRaisesRegex(ValueError,'OVERLAY_CHANGED_DURING_PREPARATION'):self.prepare(overlay=overlay)
        self.assert_retained_overlay_failure('OVERLAY_CHANGED_DURING_PREPARATION',conversion=True)
    def test_overlay_copied_drift_after_conversion_rejects_receipt_zip_mismatch(self):
        overlay=self.overlay_fixture();target=overlay/'CardstackMcpTransportProbeTest.cls';before=target.read_bytes();original=self.module.subprocess.run
        def run(args,**kwargs):
            result=original(args,**kwargs)
            if args[0]=='sf':
                copied=self.root/'artifact/deploy-source/force-app/main/default/classes'/target.name
                copied.write_bytes(copied.read_bytes()+b'\n// copied source drift')
            return result
        with patch.object(self.module.subprocess,'run',run):
            with self.assertRaisesRegex(ValueError,'OVERLAY_CHANGED_DURING_PREPARATION'):self.prepare(overlay=overlay)
        self.assertEqual(target.read_bytes(),before)
        self.assert_retained_overlay_failure('OVERLAY_CHANGED_DURING_PREPARATION',conversion=True)
    def test_failed_conversion_retains_private_failure_evidence(self):
        original=self.module.subprocess.run
        def run(args,**kwargs):
            if args[0]=='sf': return SimpleNamespace(returncode=1,stdout='conversion failed',stderr='offline failure fixture')
            return original(args,**kwargs)
        with patch.object(self.module.subprocess,'run',run):
            with self.assertRaisesRegex(ValueError,'CONVERSION_FAILED'): self.prepare()
        artifact=self.root/'artifact'
        self.assertEqual(json.loads((artifact/'status.json').read_text())['status'],'FAILED')
        self.assertTrue((artifact/'conversion.log').exists())
        self.assertTrue((artifact/'core-source/force-app/main/default/classes/FixtureTest.cls').exists())
        self.assertEqual((artifact/'conversion.log').stat().st_mode & 0o777,0o600)
if __name__=='__main__': unittest.main()
