#!/usr/bin/env python3
"""Stage packageable source; keep per-org MCP/OAuth setup outside the package."""
import argparse
import json
import shutil
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1]
ORG_SETUP = {'mcpServerDefinitions', 'externalClientApps', 'extlClntAppOauthSettings'}

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('destination', type=Path, help='New staging directory outside the source tree')
parser.add_argument('--core-only', action='store_true', help='Stage Apex, Studio, and config; deploy HXL and Lightning types separately')
args = parser.parse_args()
if args.core_only:
    ORG_SETUP.update({'uiWidgets', 'lightningTypes'})
destination = args.destination.resolve()
if destination == SOURCE or SOURCE in destination.parents:
    parser.error('Use a staging directory outside salesforce-native.')
if destination.exists():
    parser.error('Destination already exists; use a new staging directory.')
destination.mkdir(parents=True)
for item in (SOURCE / 'force-app/main/default').iterdir():
    if item.name in ORG_SETUP:
        continue
    target = destination / 'force-app/main/default' / item.name
    target.parent.mkdir(parents=True, exist_ok=True)
    if item.is_dir():
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
print('Excluded per-org setup: ' + ', '.join(sorted(ORG_SETUP)))
