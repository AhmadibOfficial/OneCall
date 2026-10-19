#!/usr/bin/env python3
"""Test the actual admin archive with disposable files and stub database/build tools."""
import os
from pathlib import Path
import runpy
import subprocess
import sys
import unittest
import zipfile
BASE = runpy.run_path(str(Path(__file__).with_name('test-apply-update.py')))
ARCHIVE = Path(sys.argv.pop(1)).resolve()
SCRIPT = Path(__file__).with_name('apply-admin-update.sh')
class AdminInstallTest(unittest.TestCase):
    def setUp(self):
        BASE['InstallTest'].setUp(self)
        (self.root/'apps/mobile').mkdir()
        (self.root/'apps/mobile/native-fixed.txt').write_text('keep-native-fixes')
        with zipfile.ZipFile(ARCHIVE) as z:
            self.members = {i.filename:z.read(i) for i in z.infolist() if not i.is_dir()}
    def run_update(self, extra=None):
        with zipfile.ZipFile(self.zip,'w') as z:
            for name,value in self.members.items(): z.writestr(name,value)
        return subprocess.run(['bash',str(SCRIPT),str(self.zip),str(self.root)], env={**self.env,**(extra or {})}, capture_output=True,text=True,timeout=30)
    def unchanged(self):
        self.assertEqual((self.root/'apps/backend/.env').read_text(),BASE['ENV'])
        self.assertEqual((self.root/'apps/mobile/native-fixed.txt').read_text(),'keep-native-fixes')
    def test_actual_archive_builds_after_generation_and_keeps_local_files(self):
        result=self.run_update(); self.assertEqual(result.returncode,0,result.stderr); self.unchanged()
        self.assertTrue((self.root/'apps/backend/admin-web/operations.js').is_file())
        commands=(self.home/'commands.log').read_text()
        self.assertLess(commands.index('prisma:generate'),commands.index('backend build'))
        self.assertNotIn('flutter',commands)
        self.assertIn('onecall-kaduna-local',commands)
        self.assertTrue(next(self.home.glob('onecall-before-admin-*')).joinpath('database.dump').is_file())
    def test_backup_failure_stops_before_overlay(self):
        result=self.run_update({'FAIL_BACKUP':'1'}); self.assertNotEqual(result.returncode,0); self.unchanged()
        self.assertFalse((self.root/'apps/backend/admin-web').exists())
    def test_migration_failure_stops_before_build(self):
        result=self.run_update({'FAIL_MIGRATION':'1'}); self.assertNotEqual(result.returncode,0);self.unchanged()
        self.assertNotIn('backend build',(self.home/'commands.log').read_text())
        self.assertTrue(next(self.home.glob('onecall-before-admin-*')).joinpath('database.dump').is_file())
    def test_private_configuration_is_rejected(self):
        self.members['apps/backend/.env']='replace-private';result=self.run_update();self.assertNotEqual(result.returncode,0);self.unchanged()
        self.assertFalse((self.home/'commands.log').exists())
    def test_target_symlink_is_rejected(self):
        outside=self.home/'outside';outside.mkdir();(self.root/'apps/backend/admin-web').symlink_to(outside,target_is_directory=True)
        result=self.run_update();self.assertNotEqual(result.returncode,0);self.assertEqual(list(outside.iterdir()),[]);self.unchanged()
if __name__=='__main__':unittest.main(verbosity=2)
