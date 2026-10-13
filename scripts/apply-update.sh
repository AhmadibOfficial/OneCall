#!/usr/bin/env bash
# Update Ahmad's existing local OneCall project, including the backend and Flutter.
set -euo pipefail
umask 077

if [[ "${1:-}" == --help || $# -lt 1 || $# -gt 2 ]]; then
  echo 'Usage: bash apply-update.sh ARCHIVE.zip [EXISTING_PROJECT_ROOT]'
  echo 'Close the local backend and emulator first. This builds; it does not start or deploy services.'
  exit 0
fi
onecall_archive="$1"
onecall_root="${2:-$HOME/onecall/apps/backend/onecall}"
for onecall_command in python3 tar docker node pnpm flutter java javac; do
  command -v "$onecall_command" >/dev/null || { echo "Missing required command: $onecall_command" >&2; exit 1; }
done
node -e 'if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("Use Node 24 or newer")'
test -f "$onecall_archive" || { echo 'The update archive was not found.' >&2; exit 1; }
test -f "$onecall_root/apps/backend/.env" || { echo 'The existing backend .env is missing. Select your working OneCall project.' >&2; exit 1; }
onecall_root="$(cd -- "$onecall_root" && pwd -P)"
onecall_archive="$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$onecall_archive")"

# Validation happens before any backup or project write. No private credentials
# or runtime paths from an archive can replace the installed configuration.
onecall_stage="$(mktemp -d)"
cleanup() {
  onecall_exit=$?
  rm -rf -- "$onecall_stage"
  if [[ "$onecall_exit" != 0 && -n "${onecall_backup_dir:-}" ]]; then
    echo "Update stopped. Your backup is in $onecall_backup_dir. Review the failing step before restarting." >&2
  fi
}
trap cleanup EXIT
python3 - "$onecall_archive" "$onecall_root" "$onecall_stage" <<'PY'
import json, os, re, stat, sys, zipfile
from pathlib import Path, PurePosixPath
archive, root, stage = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
if json.loads((root / 'package.json').read_text()).get('name') != 'onecall':
    raise SystemExit('The target is not the OneCall workspace.')
config = {}
for raw in (root / 'apps/backend/.env').read_text().splitlines():
    match = re.match(r'^\s*(?:export\s+)?([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.*?)\s*$', raw)
    if match:
        value = match[2]
        if value.startswith(('"', "'")) and value.endswith(value[0]):
            value = value[1:-1]
        else:
            value = value.split(' #', 1)[0].rstrip()
        config[match[1]] = value
# This helper is for the known local pilot only, never a hosted/live database.
if config.get('NODE_ENV') != 'development' or config.get('DATABASE_URL') != 'postgresql://onecall_local:onecall_local_only@127.0.0.1:54329/onecall_pilot':
    raise SystemExit('This installer requires the existing local development pilot database. Use docs/NIGERIA.md for other environments.')
if config.get('REDIS_URL') != 'redis://127.0.0.1:63799/0':
    raise SystemExit('This installer requires the existing local pilot Redis URL.')
with zipfile.ZipFile(archive) as z:
    infos = z.infolist()
    if len(infos) > 5000 or sum(i.file_size for i in infos) > 200 * 1024 * 1024:
        raise SystemExit('The archive exceeds the source update limits.')
    seen = set()
    for info in infos:
        path = PurePosixPath(info.filename)
        mode = info.external_attr >> 16
        if (path.is_absolute() or not path.parts or path.parts[0] != 'onecall'
                or '..' in path.parts or '\\' in info.filename or stat.S_ISLNK(mode)):
            raise SystemExit('The archive contains an unsafe path or link.')
        if info.is_dir():
            continue
        relative = Path(*path.parts[1:])
        if not relative.parts or relative in seen:
            raise SystemExit('The archive contains an invalid or duplicate file.')
        seen.add(relative)
        if (any(part in ('.git', 'node_modules', 'dist', 'build', 'uploads', '.dart_tool', '.gradle') for part in relative.parts)
                or (relative.name.startswith('.env') and not relative.name.endswith('.example'))
                or relative.name in ('local.properties', 'key.properties')
                or relative.suffix in ('.pem', '.key', '.jks', '.keystore', '.dump')):
            raise SystemExit('The archive contains private configuration or runtime data.')
        target = root / relative
        for part in (target, *target.parents):
            if part == root:
                break
            if part.is_symlink():
                raise SystemExit('An update target is a symbolic link; no files were changed.')
        staged = stage / relative
        staged.parent.mkdir(parents=True, exist_ok=True)
        staged.write_bytes(z.read(info))
        staged.chmod(0o755 if mode & 0o111 else 0o644)
    if json.loads((stage / 'package.json').read_text()).get('name') != 'onecall':
        raise SystemExit('The archive is not a OneCall source update.')
    for file in ('apps/mobile/lib/main.dart', 'apps/mobile/lib/ui/app_theme.dart',
                 'apps/backend/prisma/schema.prisma', 'pnpm-lock.yaml', 'compose.pilot.yml'):
        if not (stage / file).is_file():
            raise SystemExit('The complete app update is missing required files.')
print('Source archive and local environment validated.')
PY

# Stop here before mutations if the known local backend or emulator is active.
if python3 - <<'PY'
import socket
try:
    with socket.create_connection(('127.0.0.1', 3000), timeout=1):
        pass
except OSError:
    raise SystemExit(1)
PY
then
  echo 'Close the backend on port 3000 before applying this update.' >&2
  exit 1
fi
onecall_adb="${ANDROID_HOME:-$HOME/Android/Sdk}/platform-tools/adb"
if [[ -x "$onecall_adb" ]]; then
  while read -r onecall_serial onecall_state onecall_other; do
    if [[ "$onecall_serial" == emulator-* && "$onecall_state" != '' ]]; then
      echo 'Close the Android emulator before compiling on this laptop.' >&2
      exit 1
    fi
  done < <("$onecall_adb" devices < /dev/null)
fi

onecall_backup_dir="$(mktemp -d "$HOME/onecall-before-update-XXXXXXXX")"
onecall_db_partial="$onecall_backup_dir/database.dump.partial"
echo "Backing up source and database to $onecall_backup_dir"
tar --exclude=node_modules --exclude=build --exclude=dist --exclude=.git --exclude=.gradle --exclude=.dart_tool \
  -czf "$onecall_backup_dir/source.tar.gz" -C "$onecall_root" .
docker compose -f "$onecall_root/compose.pilot.yml" exec -T postgres \
  pg_dump -U onecall_local -d onecall_pilot -Fc > "$onecall_db_partial"
test -s "$onecall_db_partial" || { echo 'Database backup was empty. Update stopped.' >&2; exit 1; }
docker compose -f "$onecall_root/compose.pilot.yml" exec -T postgres \
  pg_restore --list < "$onecall_db_partial" > /dev/null
mv -- "$onecall_db_partial" "$onecall_backup_dir/database.dump"

python3 - "$onecall_stage" "$onecall_root" <<'PY'
from pathlib import Path
import os, shutil, sys, tempfile
stage, root = Path(sys.argv[1]), Path(sys.argv[2])
for source in stage.rglob('*'):
    if not source.is_file():
        continue
    target = root / source.relative_to(stage)
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix='.onecall-update-', dir=target.parent)
    os.close(fd)
    try:
        shutil.copyfile(source, temp)
        os.chmod(temp, source.stat().st_mode & 0o777)
        os.replace(temp, target)
    finally:
        Path(temp).unlink(missing_ok=True)
print('Updated the complete source. Existing .env and runtime data are preserved.')
PY

cd -- "$onecall_root"
# Prisma reads the preserved .env. Inherited test URLs must not override it.
unset DATABASE_URL REDIS_URL ONECALL_TEST_DATABASE_URL ONECALL_TEST_REDIS_URL
pnpm install --frozen-lockfile
pnpm --filter backend prisma:validate
pnpm --filter backend prisma:deploy
pnpm --filter backend prisma:generate
pnpm --filter backend build

export GRADLE_OPTS="${GRADLE_OPTS:-} -Dorg.gradle.jvmargs=-Xmx1536m -Dorg.gradle.workers.max=1 -Dorg.gradle.parallel=false -Dorg.gradle.daemon=false"
cd -- apps/mobile
flutter pub get
flutter analyze
flutter test
flutter build apk --debug --dart-define=ONECALL_API_URL=http://10.0.2.2:3000/api/v1
printf '\nUpdate and Android build completed. Backup: %s\n' "$onecall_backup_dir"
echo 'Next: start your backend and emulator, then run bash scripts/run-android.sh from the project root.'
