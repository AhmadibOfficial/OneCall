#!/usr/bin/env python3
"""Apply the OneCall reference UI update while protecting customised source."""
import argparse
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import tempfile
import zipfile

ALLOWED = {
    '.github/workflows/kaduna-pilot.yml', 'apps/backend/package.json',
    'apps/backend/src/bootstrap/configure-application.ts',
    'apps/backend/test/legal-public.test.cjs',
    'apps/mobile/lib/ui/legal_page.dart', 'apps/mobile/lib/ui/auth_page.dart',
    'apps/mobile/lib/ui/profile_pages.dart', 'apps/mobile/lib/ui/home_page.dart',
    'apps/mobile/lib/ui/order_pages.dart', 'apps/mobile/lib/ui/app_theme.dart',
    'apps/mobile/lib/ui/design_widgets.dart', 'apps/mobile/test/widget_test.dart',
    'apps/mobile/pubspec.yaml', 'apps/mobile/assets/legal/onecall-policies.json',
    'docs/LEGAL.md', 'docs/NIGERIA.md', 'docs/legal/onecall-policies.json',
    'docs/legal/ONECALL-LEGAL-DRAFT.md', 'docs/verification/legal-result.json',
    'docs/verification/reference-ui-result.json', 'docs/ONECALL-UI-REFERENCE.md',
    'scripts/apply-legal-update.sh', 'scripts/generate-legal-pages.py',
    'scripts/package-source.py', 'scripts/verify-kaduna-pilot.sh',
    'scripts/apply-design-update.py',
}
ALLOWED |= {'apps/backend/legal-web/' + name + '.html' for name in (
    'index', 'privacy', 'terms', 'payments', 'consumer', 'storage',
    'providers', 'account-deletion',
)}
ALLOWED.add('apps/backend/legal-web/style.css')
FIX_CODES = 'prefer_interpolation_to_compose_strings,use_null_aware_elements'


def run(args, cwd):
    subprocess.run(args, cwd=cwd, check=True)


def normalise_dart(root, records, unknown, temporary):
    mobile = root / 'apps/mobile'
    if not (mobile / '.dart_tool/package_config.json').is_file():
        raise SystemExit('Run flutter pub get before applying this update.')
    directories = []
    for variant in ('actual', 'pilot', 'legal', 'design'):
        directory = temporary / variant
        directory.mkdir()
        for name in ('lib', 'test'):
            if (mobile / name).is_dir():
                shutil.copytree(mobile / name, directory / name)
        shutil.copyfile(mobile / 'pubspec.yaml', directory / 'pubspec.yaml')
        if (mobile / 'analysis_options.yaml').is_file():
            shutil.copyfile(mobile / 'analysis_options.yaml', directory / 'analysis_options.yaml')
        (directory / '.dart_tool').mkdir()
        config = json.loads((mobile / '.dart_tool/package_config.json').read_text())
        for package in config['packages']:
            if package['name'] == 'onecall':
                package['rootUri'] = '../'
                package['packageUri'] = 'lib/'
        (directory / '.dart_tool/package_config.json').write_text(json.dumps(config))
        if variant != 'actual':
            for name, record in records.items():
                if not name.endswith('.dart'):
                    continue
                target = directory / Path(name).relative_to('apps/mobile')
                text = record['before'][{'pilot': 0, 'legal': 1, 'design': 2}[variant]]
                if text is None:
                    target.unlink(missing_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text(text)
        run(['dart', 'fix', '--apply', '--code=' + FIX_CODES], directory)
        paths = [str(Path(name).relative_to('apps/mobile')) for name in unknown
                 if (directory / Path(name).relative_to('apps/mobile')).is_file()]
        if paths:
            run(['dart', 'format', *paths], directory)
        directories.append(directory)
    for name in unknown:
        relative = Path(name).relative_to('apps/mobile')
        actual = (directories[0] / relative).read_text()
        if not any((directory / relative).is_file() and
                   (directory / relative).read_text() == actual for directory in directories[1:]):
            raise SystemExit('No source changed. Custom edits need a manual merge: ' + name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('root', nargs='?', type=Path,
                        default=Path.home() / 'onecall/apps/backend/onecall')
    args = parser.parse_args()
    root = args.root.resolve()
    os.umask(0o077)
    for command in ('python3', 'pnpm', 'dart', 'flutter'):
        if not shutil.which(command):
            raise SystemExit('Required tool is unavailable: ' + command)
    if json.loads((root / 'package.json').read_text()).get('name') != 'onecall':
        raise SystemExit('Select the existing OneCall project.')
    if not (root / 'apps/mobile/lib/core/api.dart').is_file():
        raise SystemExit('This update requires the working Nigeria pilot source.')
    with zipfile.ZipFile(args.archive) as archive:
        infos = archive.infolist()
        names = [info.filename for info in infos]
        if len(names) != len(set(names)) or set(names) != {
            'payload.json', 'README.md', 'onecall-design.patch', 'scripts/apply-design-update.py',
        } or sum(info.file_size for info in infos) > 3 * 1024 * 1024:
            raise SystemExit('Unexpected or excessive archive entries.')
        payload = json.loads(archive.read('payload.json'))
    if payload.get('schema') != 1 or not isinstance(payload.get('files'), dict):
        raise SystemExit('Unsupported update payload.')
    records = payload['files']
    writes = {}
    unknown = []
    for name, record in records.items():
        path = PurePosixPath(name)
        if name not in ALLOWED or path.is_absolute() or '..' in path.parts or '\\' in name:
            raise SystemExit('Unexpected source target: ' + name)
        if not isinstance(record.get('after'), str) or len(record.get('before', [])) != 3:
            raise SystemExit('Invalid source record: ' + name)
        target = root / name
        for part in (target, *target.parents):
            if part == root:
                break
            if part.is_symlink():
                raise SystemExit('Refusing a symbolic-link target: ' + name)
        if target.exists() and not target.is_file():
            raise SystemExit('Expected a regular source file: ' + name)
        current = target.read_text() if target.is_file() else None
        if current == record['after']:
            continue
        if name == 'apps/backend/package.json':
            package = json.loads(current)
            script = json.loads(record['after'])['scripts']['test:legal']
            existing = package.setdefault('scripts', {}).get('test:legal')
            if existing not in (None, script):
                raise SystemExit('Custom test:legal command requires a manual merge.')
            package['scripts']['test:legal'] = script
            writes[name] = json.dumps(package, indent=2) + '\n'
            continue
        if current not in record['before']:
            if current is not None and name.endswith('.dart'):
                unknown.append(name)
            else:
                raise SystemExit('No source changed. Custom edits need a manual merge: ' + name)
        writes[name] = record['after']
    if unknown:
        print('Checking existing Dart formatting and known automatic fixes in temporary copies...', flush=True)
        with tempfile.TemporaryDirectory(prefix='onecall-design-preflight-') as temporary:
            normalise_dart(root, records, unknown, Path(temporary))
    if not writes:
        print('This source update is already applied.')
        return
    backup = Path(tempfile.mkdtemp(prefix='onecall-before-design-', dir=Path.home()))
    absent = []
    with zipfile.ZipFile(backup / 'source-before.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for name in writes:
            target = root / name
            if target.is_file():
                archive.write(target, name)
            else:
                absent.append(name)
    (backup / 'new-files.json').write_text(json.dumps(absent, indent=2) + '\n')
    print('Source backup: ' + str(backup), flush=True)
    for name, text in writes.items():
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(mode='w', dir=target.parent, delete=False) as file:
            file.write(text)
            temporary = Path(file.name)
        temporary.chmod(0o644)
        temporary.replace(target)
    mobile = root / 'apps/mobile'
    try:
        run(['python3', 'scripts/generate-legal-pages.py', '--check'], root)
        run(['pnpm', '--filter', 'backend', 'build'], root)
        run(['pnpm', '--filter', 'backend', 'test:legal'], root)
        run(['flutter', 'pub', 'get'], mobile)
        run(['dart', 'fix', '--apply', '--code=' + FIX_CODES], mobile)
        changed = [str(Path(name).relative_to('apps/mobile')) for name in writes if name.endswith('.dart')]
        if changed:
            run(['dart', 'format', *changed], mobile)
        run(['flutter', 'analyze'], mobile)
        run(['flutter', 'test'], mobile)
    except subprocess.CalledProcessError:
        raise SystemExit('Verification stopped. Source backup: ' + str(backup) + '. Review the error before rebuilding/installing the app.')
    print('Source and native checks passed. Backup: ' + str(backup))
    print('Next: build the APK with the emulator closed, then install it. No database migration, GitHub push or cloud deployment was performed.')


if __name__ == '__main__':
    main()
