#!/usr/bin/env python3
"""Exercise the installer against disposable projects and stub build/DB commands."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile

SCRIPT = Path(__file__).with_name('apply-update.sh')
ENV = '''NODE_ENV=development
DATABASE_URL=postgresql://onecall_local:onecall_local_only@127.0.0.1:54329/onecall_pilot
REDIS_URL=redis://127.0.0.1:63799/0
JWT_SECRET=private-local-test-value
'''


class InstallTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.root = self.home / 'existing'
        self.bin = self.home / 'bin'
        self.bin.mkdir()
        (self.root / 'apps/backend').mkdir(parents=True)
        (self.root / 'apps/backend/.env').write_text(ENV)
        (self.root / 'apps/backend/keep.txt').write_text('local-only')
        (self.root / 'package.json').write_text('{"name":"onecall","version":"old"}')
        (self.root / 'compose.pilot.yml').write_text('old-compose')
        self.zip = self.home / 'update.zip'
        self.members = {
            'onecall/package.json': '{"name":"onecall","version":"new"}',
            'onecall/compose.pilot.yml': 'new-compose',
            'onecall/pnpm-lock.yaml': 'lock',
            'onecall/apps/backend/prisma/schema.prisma': 'schema',
            'onecall/apps/mobile/lib/main.dart': 'main',
            'onecall/apps/mobile/lib/ui/app_theme.dart': 'theme',
        }
        for command in ('node', 'pnpm', 'flutter', 'docker', 'java', 'javac'):
            (self.bin / command).write_text('''#!/usr/bin/env bash
set -e
name="${0##*/}"
printf '%s %s\n' "$name" "$*" >> "$HOME/commands.log"
if [[ "$name" == docker ]]; then
  case "$*" in
    *pg_dump*) [[ "${FAIL_BACKUP:-}" != 1 ]] || exit 27; printf 'PGDMP-stub';;
    *pg_restore*) cat >/dev/null;;
  esac
fi
if [[ "$name" == pnpm && "$*" == *prisma:deploy* && "${FAIL_MIGRATION:-}" == 1 ]]; then exit 28; fi
''')
            (self.bin / command).chmod(0o755)
        # Keep the real Python/tar on PATH. adb is deliberately absent.
        self.env = {**os.environ, 'HOME': str(self.home),
                    'PATH': str(self.bin) + ':' + os.environ['PATH'],
                    'ANDROID_HOME': str(self.home / 'absent-sdk')}

    def run_update(self, extra_env=None, packaged=False):
        if not packaged:
            with zipfile.ZipFile(self.zip, 'w') as z:
                for name, value in self.members.items():
                    z.writestr(name, value)
        return subprocess.run(['bash', str(SCRIPT), str(self.zip), str(self.root)],
                              env={**self.env, **(extra_env or {})}, text=True,
                              capture_output=True, timeout=30)

    def assert_untouched(self):
        self.assertEqual(json.loads((self.root / 'package.json').read_text())['version'], 'old')
        self.assertEqual((self.root / 'apps/backend/.env').read_text(), ENV)

    def test_full_update_preserves_config_and_local_files_and_builds_android(self):
        result = self.run_update()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.root / 'apps/backend/.env').read_text(), ENV)
        self.assertEqual((self.root / 'apps/backend/keep.txt').read_text(), 'local-only')
        self.assertEqual(json.loads((self.root / 'package.json').read_text())['version'], 'new')
        backups = list(self.home.glob('onecall-before-update-*'))
        self.assertEqual(len(backups), 1)
        self.assertTrue((backups[0] / 'source.tar.gz').is_file())
        self.assertEqual((backups[0] / 'database.dump').read_bytes(), b'PGDMP-stub')
        self.assertEqual(backups[0].stat().st_mode & 0o777, 0o700)
        commands = (self.home / 'commands.log').read_text()
        self.assertLess(commands.index('pnpm --filter backend prisma:generate'),
                        commands.index('pnpm --filter backend build'))
        self.assertIn('flutter analyze', commands)
        self.assertIn('flutter test', commands)
        self.assertIn('flutter build apk --debug --dart-define=ONECALL_API_URL=http://10.0.2.2:3000/api/v1', commands)

    def test_packaged_source_archive_passes_the_real_installer(self):
        subprocess.run(['python3', str(SCRIPT.with_name('package-source.py')), str(self.zip)],
                       check=True, capture_output=True, text=True, timeout=30)
        result = self.run_update(packaged=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.root / 'apps/backend/.env').read_text(), ENV)
        self.assertTrue((self.root / 'apps/mobile/lib/ui/app_theme.dart').is_file())
        self.assertTrue((self.root / 'apps/backend/prisma/migrations/20261011040000_nigeria_marketplace/migration.sql').is_file())
        self.assertFalse((self.root / 'pubspec.yaml').exists())
        self.assertFalse((self.root / 'prisma/schema.prisma').exists())

    def test_private_configuration_cannot_be_replaced(self):
        self.members['onecall/apps/backend/.env'] = 'malicious-config'
        result = self.run_update()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('private configuration', result.stderr)
        self.assert_untouched()

    def test_archive_traversal_stops_before_project_writes(self):
        self.members['onecall/../escape.txt'] = 'bad'
        result = self.run_update()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('unsafe path', result.stderr)
        self.assertFalse((self.home / 'escape.txt').exists())
        self.assert_untouched()

    def test_target_symlink_cannot_write_outside_the_project(self):
        outside = self.home / 'outside'
        outside.mkdir()
        (self.root / 'apps/mobile').symlink_to(outside, target_is_directory=True)
        result = self.run_update()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('symbolic link', result.stderr)
        self.assertEqual(list(outside.iterdir()), [])
        self.assert_untouched()

    def test_failed_database_backup_stops_before_overlay(self):
        result = self.run_update({'FAIL_BACKUP': '1'})
        self.assertNotEqual(result.returncode, 0)
        self.assert_untouched()
        self.assertNotIn('prisma:deploy', (self.home / 'commands.log').read_text())

    def test_failed_migration_stops_before_mobile_build_and_keeps_backups(self):
        result = self.run_update({'FAIL_MIGRATION': '1'})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Your backup is in', result.stderr)
        self.assertEqual((self.root / 'apps/backend/.env').read_text(), ENV)
        self.assertNotIn('flutter pub get', (self.home / 'commands.log').read_text())
        self.assertTrue(next(self.home.glob('onecall-before-update-*')).joinpath('database.dump').is_file())

    def test_nonlocal_environment_is_refused(self):
        (self.root / 'apps/backend/.env').write_text(ENV.replace('NODE_ENV=development', 'NODE_ENV=production'))
        result = self.run_update()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('local development pilot database', result.stderr)
        self.assertEqual(json.loads((self.root / 'package.json').read_text())['version'], 'old')
        self.assertEqual(list(self.home.glob('onecall-before-update-*')), [])


if __name__ == '__main__':
    unittest.main(verbosity=2)
