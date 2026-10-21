import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "phone_distribution.py"
SPEC = importlib.util.spec_from_file_location("phone_distribution", SCRIPT)
PILOT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PILOT)
BADGING = """package: name='com.example.onecall.localphone' versionCode='1' versionName='0.1.0'
sdkVersion:'24'
application-label:'OneCall Phone Pilot'
launchable-activity: name='com.example.onecall.MainActivity' label='' icon=''
application-debuggable
native-code: 'armeabi-v7a' 'arm64-v8a'
"""


class PhoneDistributionTest(unittest.TestCase):
    def test_records_actual_minimum_android_version(self):
        self.assertEqual(PILOT.verify_manifest(BADGING), 24)
        self.assertEqual(PILOT.verify_manifest(BADGING.replace("sdkVersion:'24'", "sdkVersion:'26'")), 26)

    def test_rejects_existing_emulator_and_cloud_installations(self):
        for application_id in ["com.example.onecall", "com.example.onecall.localpilot", "com.example.onecall.cloudpilot"]:
            with self.subTest(application_id=application_id), self.assertRaises(ValueError):
                PILOT.verify_manifest(BADGING.replace(PILOT.APPLICATION_ID, application_id))

    def test_rejects_missing_or_extra_architectures(self):
        for native in ["'x86_64'", "'arm64-v8a'", "'armeabi-v7a'", "'arm64-v8a' 'armeabi-v7a' 'x86_64'", "'arm64-v8a' 'arm64-v8a'", ""]:
            with self.subTest(native=native), self.assertRaises(ValueError):
                PILOT.verify_manifest(BADGING.replace("'armeabi-v7a' 'arm64-v8a'", native))

    def test_rejects_wrong_identity_release_or_missing_platform_metadata(self):
        for badging in [BADGING.replace(PILOT.LABEL, "OneCall"),
                        BADGING.replace(PILOT.ACTIVITY, "com.example.other.MainActivity"),
                        BADGING.replace("application-debuggable\n", ""),
                        BADGING.replace("sdkVersion:'24'\n", ""),
                        BADGING.replace("sdkVersion:'24'", "sdkVersion:'0'")]:
            with self.subTest(badging=badging), self.assertRaises(ValueError):
                PILOT.verify_manifest(badging)

    def test_distribution_preserves_provenance_and_usb_connection_requirements(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            apk, notes, out = root / "input.apk", root / "notes.md", root / "out"
            apk.write_bytes(b"APK fixture; actual Android metadata and signing checked in CI")
            notes.write_text("Keep USB connected and the existing local backend running.")
            PILOT.package(apk, out, BADGING, notes, "a" * 40)
            info = json.loads((out / "build-info.json").read_text())
            self.assertEqual(info["apiUrl"], "http://127.0.0.1:3000/api/v1")
            self.assertEqual(info["applicationId"], "com.example.onecall.localphone")
            self.assertEqual(info["abis"], ["arm64-v8a", "armeabi-v7a"])
            self.assertEqual(info["minAndroidApi"], 24)
            self.assertEqual(info["sourceCommit"], "a" * 40)
            self.assertEqual(info["sha256"], hashlib.sha256(apk.read_bytes()).hexdigest())
            self.assertIn("adb reverse tcp:3000 tcp:3000", info["requires"])
            self.assertIn("physical phone walkthrough required", info["deviceAcceptance"])
            self.assertEqual((out / PILOT.APK_NAME).read_bytes(), apk.read_bytes())
            self.assertEqual((out / "SHA256SUMS.txt").read_text(), f'{info["sha256"]}  {PILOT.APK_NAME}\n')
            self.assertEqual((out / "README.md").read_bytes(), notes.read_bytes())

    def test_bad_provenance_or_missing_inputs_do_not_create_a_distribution(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for commit in ["", "main", "a" * 39, "G" * 40, "b" * 40]:
                out = root / "out"
                with self.subTest(commit=commit), self.assertRaises(ValueError):
                    PILOT.package(root / "missing.apk", out, BADGING, root / "missing.md", commit)
                self.assertFalse(out.exists())


if __name__ == "__main__":
    unittest.main()
