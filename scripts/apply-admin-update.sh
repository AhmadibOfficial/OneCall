#!/usr/bin/env bash
set -euo pipefail
umask 077
onecall_archive="${1:?Usage: bash apply-admin-update.sh ARCHIVE.zip [PROJECT_ROOT]}"
onecall_root="${2:-$HOME/onecall/apps/backend/onecall}"
for command_name in python3 docker node pnpm tar; do command -v "$command_name" >/dev/null; done
onecall_root="$(cd -- "$onecall_root" && pwd -P)"
onecall_archive="$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$onecall_archive")"
onecall_stage="$(mktemp -d)"
cleanup() { python3 -c 'import shutil,sys; shutil.rmtree(sys.argv[1])' "$onecall_stage"; }
trap cleanup EXIT
python3 - "$onecall_root" "$onecall_archive" "$onecall_stage" <<'PY'
from pathlib import Path, PurePosixPath
import json, re, socket, stat, sys, zipfile
root, archive, stage = map(Path, sys.argv[1:])
if json.loads((root/'package.json').read_text()).get('name') != 'onecall':
    raise SystemExit('Select the existing OneCall workspace.')
config = {}
for raw in (root/'apps/backend/.env').read_text().splitlines():
    match = re.match(r'^\s*(?:export\s+)?([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.*?)\s*$', raw)
    if match:
        value=match[2]
        config[match[1]]=value[1:-1] if value.startswith(('"', "'")) and value.endswith(value[0]) else value.split(' #',1)[0].rstrip()
if config.get('NODE_ENV') != 'development' or config.get('DATABASE_URL') != 'postgresql://onecall_local:onecall_local_only@127.0.0.1:54329/onecall_pilot' or config.get('REDIS_URL') != 'redis://127.0.0.1:63799/0':
    raise SystemExit('This helper requires the established local development pilot configuration.')
try:
    with socket.create_connection(('127.0.0.1',3000),timeout=1):
        pass
except OSError:
    pass
else:
    raise SystemExit('Stop the backend on port 3000 before updating.')
allowed_files = {
'apps/backend/package.json', 'apps/backend/prisma/schema.prisma',
'apps/backend/src/bootstrap/app.module.ts', 'apps/backend/src/bootstrap/configure-application.ts',
'apps/backend/scripts/grant-local-admin.cjs', 'apps/backend/test/admin-operations.e2e-spec.ts',
'apps/backend/test/jest-admin.json', 'docs/ADMIN.md', 'docs/verification/admin-operations-result.json',
'scripts/apply-admin-update.sh',
}
allowed_prefixes = ('apps/backend/admin-web/', 'apps/backend/src/modules/admin/',
'apps/backend/prisma/migrations/20261011150000_admin_operations/')
with zipfile.ZipFile(archive) as z:
    infos=z.infolist()
    if len(infos)>100 or sum(i.file_size for i in infos)>5*1024*1024: raise SystemExit('Archive exceeds admin patch limits.')
    seen=set()
    for info in infos:
        p=PurePosixPath(info.filename)
        if info.is_dir(): continue
        name=str(p)
        if p.is_absolute() or '..' in p.parts or '\\' in info.filename or stat.S_ISLNK(info.external_attr>>16) or name in seen:
            raise SystemExit('Unsafe or duplicate archive path.')
        if name not in allowed_files and not name.startswith(allowed_prefixes): raise SystemExit('Unexpected file in admin archive.')
        if p.name.startswith('.env') or p.suffix in ('.key','.pem','.dump'):
            raise SystemExit('Private configuration is not allowed in admin archive.')
        target=root/name
        for part in (target,*target.parents):
            if part==root: break
            if part.is_symlink(): raise SystemExit('Refusing symbolic-link update target.')
        output=stage/name; output.parent.mkdir(parents=True,exist_ok=True); output.write_bytes(z.read(info)); seen.add(name)
    for name in ('apps/backend/src/modules/admin/operations.service.ts','apps/backend/admin-web/operations.js',
                 'apps/backend/prisma/schema.prisma','apps/backend/prisma/migrations/20261011150000_admin_operations/migration.sql'):
        if name not in seen: raise SystemExit('The operations update is incomplete.')
print('Local pilot and admin archive validated.')
PY
# Reuse the running local project's database/Redis volumes, never create a new project.
onecall_compose_project="${COMPOSE_PROJECT_NAME:-onecall-kaduna-local}"
onecall_backup="$(mktemp -d "$HOME/onecall-before-admin-XXXXXXXX")"
echo "Backing up backend and database to $onecall_backup"
tar --exclude=node_modules --exclude=dist --exclude=uploads -czf "$onecall_backup/backend.tar.gz" -C "$onecall_root" apps/backend
if ! docker compose -p "$onecall_compose_project" -f "$onecall_root/compose.pilot.yml" exec -T postgres pg_dump -U onecall_local -d onecall_pilot -Fc > "$onecall_backup/database.dump.partial"; then
  echo 'Database backup failed. No source files were applied.' >&2; exit 1
fi
test -s "$onecall_backup/database.dump.partial"
docker compose -p "$onecall_compose_project" -f "$onecall_root/compose.pilot.yml" exec -T postgres pg_restore --list < "$onecall_backup/database.dump.partial" > /dev/null
mv "$onecall_backup/database.dump.partial" "$onecall_backup/database.dump"
python3 - "$onecall_stage" "$onecall_root" <<'PY'
from pathlib import Path
import os, shutil, sys, tempfile
stage, root=map(Path,sys.argv[1:])
for source in stage.rglob('*'):
    if not source.is_file(): continue
    target=root/source.relative_to(stage); target.parent.mkdir(parents=True,exist_ok=True)
    fd, temp=tempfile.mkstemp(prefix='.onecall-admin-',dir=target.parent); os.close(fd)
    try:
        shutil.copyfile(source,temp); os.chmod(temp,0o644); os.replace(temp,target)
    finally: Path(temp).unlink(missing_ok=True)
PY
cd "$onecall_root"
unset DATABASE_URL REDIS_URL ONECALL_TEST_DATABASE_URL ONECALL_TEST_REDIS_URL
if ! (pnpm --filter backend prisma:validate && pnpm --filter backend prisma:deploy && pnpm --filter backend prisma:generate && pnpm --filter backend build); then
  echo "Update stopped. Source/database backup: $onecall_backup" >&2; exit 1
fi
printf '\nAdmin operations update built. Backup: %s\nStart the backend, then open http://127.0.0.1:3000/admin/\n' "$onecall_backup"
