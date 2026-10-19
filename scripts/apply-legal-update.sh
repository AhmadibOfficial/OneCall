#!/usr/bin/env bash
set -euo pipefail
umask 077
onecall_archive="${1:?Usage: bash apply-legal-update.sh ARCHIVE.zip [PROJECT_ROOT]}"
onecall_root="${2:-$HOME/onecall/apps/backend/onecall}"
for onecall_command in python3 git pnpm; do command -v "$onecall_command" >/dev/null; done
onecall_root="$(cd -- "$onecall_root" && pwd -P)"
onecall_archive="$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$onecall_archive")"
onecall_stage="$(mktemp -d)"
cleanup() { python3 -c 'import shutil,sys; shutil.rmtree(sys.argv[1])' "$onecall_stage"; }
trap cleanup EXIT

python3 - "$onecall_root" "$onecall_archive" "$onecall_stage" <<'PY'
from pathlib import Path, PurePosixPath
import json, stat, sys, zipfile
root, archive, stage = map(Path, sys.argv[1:])
if json.loads((root/'package.json').read_text()).get('name') != 'onecall':
    raise SystemExit('Select the existing OneCall workspace.')
with zipfile.ZipFile(archive) as z:
    infos = z.infolist()
    if len(infos) > 60 or sum(i.file_size for i in infos) > 2*1024*1024:
        raise SystemExit('Archive exceeds legal update limits.')
    seen = set()
    for info in infos:
        p = PurePosixPath(info.filename)
        if info.is_dir():
            continue
        if p.is_absolute() or '..' in p.parts or '\\' in info.filename or stat.S_ISLNK(info.external_attr >> 16) or str(p) in seen:
            raise SystemExit('Unsafe or duplicate archive path.')
        if str(p) not in {'onecall-legal.patch', 'README.md', 'scripts/apply-legal-update.sh'}:
            raise SystemExit('Unexpected file in legal update archive.')
        seen.add(str(p))
    if 'onecall-legal.patch' not in seen:
        raise SystemExit('Legal source patch is missing.')
    (stage/'onecall-legal.patch').write_bytes(z.read('onecall-legal.patch'))
PY

cd "$onecall_root"
onecall_patch="$onecall_stage/onecall-legal.patch"
git apply --numstat "$onecall_patch" > "$onecall_stage/paths.tsv"
python3 - "$onecall_root" "$onecall_stage/paths.tsv" <<'PY'
from pathlib import Path, PurePosixPath
import sys
root, manifest = map(Path, sys.argv[1:])
allowed = {
    '.github/workflows/kaduna-pilot.yml', 'apps/backend/package.json',
    'apps/backend/src/bootstrap/configure-application.ts',
    'apps/backend/test/legal-public.test.cjs',
    'apps/mobile/lib/ui/legal_page.dart', 'apps/mobile/lib/ui/auth_page.dart',
    'apps/mobile/lib/ui/profile_pages.dart', 'apps/mobile/pubspec.yaml',
    'apps/mobile/assets/legal/onecall-policies.json', 'docs/LEGAL.md',
    'docs/NIGERIA.md', 'docs/legal/onecall-policies.json',
    'docs/legal/ONECALL-LEGAL-DRAFT.md', 'docs/verification/legal-result.json',
    'scripts/apply-legal-update.sh', 'scripts/generate-legal-pages.py',
    'scripts/package-source.py', 'scripts/verify-kaduna-pilot.sh',
}
web_names = {'index', 'privacy', 'terms', 'payments', 'consumer', 'storage', 'providers', 'account-deletion'}
allowed |= {'apps/backend/legal-web/' + n + '.html' for n in web_names}
allowed.add('apps/backend/legal-web/style.css')
paths = []
for line in manifest.read_text().splitlines():
    fields = line.split('\t')
    if len(fields) != 3 or fields[0] == '-' or fields[1] == '-':
        raise SystemExit('Expected a text-only legal patch.')
    name = fields[2]
    p = PurePosixPath(name)
    if name not in allowed or p.is_absolute() or '..' in p.parts or '\\' in name or name in paths:
        raise SystemExit('Unexpected legal patch target: ' + name)
    for part in (root/name, *(root/name).parents):
        if part == root:
            break
        if part.is_symlink():
            raise SystemExit('Refusing a symbolic-link target: ' + name)
    paths.append(name)
if not paths:
    raise SystemExit('The source patch is empty or this directory is unsuitable.')
manifest.write_text('\n'.join(paths) + '\n')
PY

if ! git apply --ignore-space-change --check "$onecall_patch"; then
  echo 'No files changed. This legal update needs the current admin-operations source, or your local edits need a manual merge. Do not overwrite them.' >&2
  exit 1
fi

onecall_backup="$(mktemp -d "$HOME/onecall-before-legal-XXXXXXXX")"
python3 - "$onecall_root" "$onecall_stage/paths.tsv" "$onecall_backup" <<'PY'
from pathlib import Path
import json, sys, zipfile
root, manifest, backup = map(Path, sys.argv[1:])
paths = manifest.read_text().splitlines()
absent = []
with zipfile.ZipFile(backup/'source-before.zip', 'w', compression=zipfile.ZIP_DEFLATED) as z:
    for name in paths:
        path = root/name
        if path.is_file():
            z.write(path, name)
        elif path.exists():
            raise SystemExit('Expected a regular file: ' + name)
        else:
            absent.append(name)
(backup/'new-files.json').write_text(json.dumps(absent, indent=2) + '\n')
print('Source backup: ' + str(backup))
PY

git apply --ignore-space-change "$onecall_patch"
if ! (python3 scripts/generate-legal-pages.py --check && pnpm --filter backend build && pnpm --filter backend test:legal); then
  echo "Source applied but verification stopped. Backup: $onecall_backup. Review the failure before restarting the backend." >&2
  exit 1
fi
printf '\nLegal source update applied. Backup: %s\n' "$onecall_backup"
echo 'No database migration, account deletion, GitHub push or deployment was performed.'
echo 'Next: run Flutter pub get, analyze and tests, rebuild the app, then review http://127.0.0.1:3000/legal/ after restarting the backend.'
