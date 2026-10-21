import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "emulator_distribution.py"
SPEC = importlib.util.spec_from_file_location("emulator_distribution", SCRIPT)
PILOT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PILOT)
BADGING = """package: name='com.example.onecall.localpilot' versionCode='1' versionName='0.1.0'
application-label:'OneCall Local Pilot'
launchable-activity: name='com.example.onecall.MainActivity' label='' icon=''
application-debuggable
native-code: 'x86_64'
"""


class EmulatorDistributionTest(unittest.TestCase):
    def test_valid_emulator_manifest(self):
        PILOT.verify_manifest(BADGING)

    def test_rejects_existing_and_cloud_installation_ids(self):
        for application_id in ["com.example.onecall", "com.example.onecall.cloudpilot"]:
            with self.subTest(application_id=application_id), self.assertRaises(ValueError):
                PILOT.verify_manifest(BADGING.replace(PILOT.APPLICATION_ID, application_id))

    def test_rejects_wrong_label_activity_or_non_debuggable_build(self):
        for value in [BADGING.replace(PILOT.LABEL, "OneCall"),
                      BADGING.replace("com.example.onecall.MainActivity", "com.example.other.MainActivity"),
                      BADGING.replace("application-debuggable\n", "")]:
            with self.subTest(badging=value), self.assertRaises(ValueError):
                PILOT.verify_manifest(value)

    def test_rejects_device_or_missing_native_architecture(self):
        for value in ["'arm64-v8a'", "'x86_64' 'arm64-v8a'", ""]:
            with self.subTest(native=value), self.assertRaises(ValueError):
                PILOT.verify_manifest(BADGING.replace("'x86_64'", value))

    def test_distribution_records_file_hash_fixed_target_and_installation_notes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            apk, notes, out = root / "input.apk", root / "notes.md", root / "out"
            apk.write_bytes(b"APK packaging fixture; signing is verified separately in CI")
            notes.write_text("Local backend required; this is an emulator test build.")
            PILOT.package(apk, out, BADGING, notes, "a" * 40)
            info = json.loads((out / "build-info.json").read_text())
            self.assertEqual(info["apiUrl"], "http://10.0.2.2:3000/api/v1")
            self.assertEqual(info["applicationId"], "com.example.onecall.localpilot")
            self.assertEqual(info["abi"], "x86_64")
            self.assertEqual(info["sourceCommit"], "a" * 40)
            self.assertEqual(info["sha256"], hashlib.sha256(apk.read_bytes()).hexdigest())
            self.assertEqual((out / PILOT.APK_NAME).read_bytes(), apk.read_bytes())
            self.assertEqual((out / "SHA256SUMS.txt").read_text(), f'{info["sha256"]}  {PILOT.APK_NAME}\n')
            self.assertEqual((out / "README.md").read_bytes(), notes.read_bytes())

    def test_bad_provenance_or_missing_inputs_do_not_create_a_distribution(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for commit in ["main", "", "a" * 39, "b" * 40]:
                out = root / "out"
                with self.subTest(commit=commit), self.assertRaises(ValueError):
                    PILOT.package(root / "missing.apk", out, BADGING, root / "missing.md", commit)
                self.assertFalse(out.exists())


if __name__ == "__main__":
    unittest.main()
