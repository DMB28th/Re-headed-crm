#!/usr/bin/env python3
"""Stage packageable source; keep per-org MCP/OAuth setup outside the package."""
import argparse
import json
import shutil
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1]
# Reviewed package source types. New metadata families require an explicit package
# decision; Site, guest, OAuth, JWT and org-wide settings must stay subscriber setup.
PACKAGEABLE = {
    'applications', 'classes', 'customPermissions', 'flexipages', 'lwc',
    'objects', 'permissionsets', 'staticresources', 'tabs',
}
COMPANION = {'uiWidgets', 'lightningTypes'}
PACKAGE_PERMISSION_SETS = {
    'Cardstack_Admin.permissionset-meta.xml',
    'Cardstack_User.permissionset-meta.xml',
}

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('destination', type=Path, help='New staging directory outside the source tree')
parser.add_argument('--core-only', action='store_true', help='Stage Apex, Studio, and config; deploy HXL and Lightning types separately')
args = parser.parse_args()
included_types = PACKAGEABLE if args.core_only else PACKAGEABLE | COMPANION
destination = args.destination.resolve()
if destination == SOURCE or SOURCE in destination.parents:
    parser.error('Use a staging directory outside salesforce-native.')
if destination.exists():
    parser.error('Destination already exists; use a new staging directory.')
destination.mkdir(parents=True)
for item in (SOURCE / 'force-app/main/default').iterdir():
    if item.name not in included_types:
        continue
    target = destination / 'force-app/main/default' / item.name
    target.parent.mkdir(parents=True, exist_ok=True)
    if item.name == 'permissionsets':
        target.mkdir()
        for permission_set in item.iterdir():
            if permission_set.name in PACKAGE_PERMISSION_SETS and permission_set.is_file():
                shutil.copy2(permission_set, target / permission_set.name)
    elif item.is_dir():
        shutil.copytree(item, target)
    else:
        shutil.copy2(item, target)
project = json.loads((SOURCE / 'sfdx-project.json').read_text())
project['name'] = 'cardstack-native'
(destination / 'sfdx-project.json').write_text(json.dumps(project, indent=2) + '\n')
(destination / 'config').mkdir()
(destination / 'config/package-org.json').write_text(json.dumps({
    'orgName': 'Cardstack package validation', 'edition': 'Developer'
}, indent=2) + '\n')
print(f'Staged package source at {destination}')
print('Excluded metadata types: ' + ', '.join(sorted(
    item.name for item in (SOURCE / 'force-app/main/default').iterdir()
    if item.name not in included_types)))
