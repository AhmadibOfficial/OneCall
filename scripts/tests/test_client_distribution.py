import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from urllib.error import HTTPError

SCRIPT = Path(__file__).resolve().parents[1] / "client_distribution.py"
SPEC = importlib.util.spec_from_file_location("client_distribution", SCRIPT)
CLIENT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CLIENT)
BASE = "https://onecall-test.onrender.com/api/v1"


class Response(io.BytesIO):
    status = 200


class CloudDistributionTest(unittest.TestCase):
    def test_placeholder_local_and_credential_bearing_targets_are_rejected(self):
        for value in ["", "https://api.example.com/api/v1", "http://onecall-test.onrender.com/api/v1",
                      "https://127.0.0.1/api/v1", "https://169.254.169.254/api/v1",
                      "https://onecall-test.onrender.com.evil.test/api/v1",
                      "https://account:secret@onecall-test.onrender.com/api/v1",
                      BASE + "?token=secret", BASE + "#fragment", BASE + "\nINJECTED=true",
                      "https://onecall-test.onrender.com:443/api/v1", BASE + "/another-path"]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                CLIENT.api_url(value)
        self.assertEqual(CLIENT.api_url(BASE + "/"), BASE)

    def test_preflight_is_read_only_and_checks_health_and_public_documents(self):
        calls = []

        class Opener:
            def open(self, request, timeout):
                calls.append(request)
                return Response(b'{"status":"ok"}' if request.full_url.endswith("/ready") else b"OneCall")

        CLIENT.preflight(BASE, opener=Opener(), attempts=1)
        self.assertEqual([x.full_url for x in calls], [
            BASE + "/health/ready", "https://onecall-test.onrender.com/legal/privacy.html",
            "https://onecall-test.onrender.com/legal/account-deletion.html",
        ])
        self.assertTrue(all(x.get_method() == "GET" and x.data is None for x in calls))

    def test_unready_or_malformed_health_does_not_allow_publication(self):
        for body in [b'{"status":"error"}', b'[]', b'not JSON']:
            class Opener:
                def open(self, request, timeout):
                    return Response(body)
            with self.subTest(body=body), self.assertRaises(ValueError):
                CLIENT.preflight(BASE, opener=Opener(), attempts=1)

    def test_redirect_failure_does_not_allow_publication(self):
        class Opener:
            def open(self, request, timeout):
                raise HTTPError(request.full_url, 302, "Redirect", {}, None)
        with self.assertRaises(ValueError):
            CLIENT.preflight(BASE, opener=Opener(), attempts=1)
        self.assertIsNone(CLIENT.NoRedirects().redirect_request(None, None, 302, "redirect", {}, "https://elsewhere.test"))

    def test_package_records_the_actual_file_hash_commit_and_testing_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            apk = root / "input.apk"
            apk.write_bytes(b"package metadata fixture, not a signed APK")
            CLIENT.package(apk, root / "out", BASE, "a" * 40)
            info = json.loads((root / "out/build-info.json").read_text())
            self.assertEqual(info["apiUrl"], BASE)
            self.assertEqual(info["sourceCommit"], "a" * 40)
            self.assertEqual(info["applicationId"], "com.example.onecall.cloudpilot")
            self.assertEqual((root / "out/SHA256SUMS.txt").read_text(), info["sha256"] + "  OneCall-pilot.apk\n")
            self.assertEqual((root / "out/OneCall-pilot.apk").read_bytes(), apk.read_bytes())

    def test_download_page_uses_the_published_release_and_rejects_tag_injection(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            CLIENT.download_page(root, "pilot-12-1")
            page = (root / "index.html").read_text()
            self.assertIn("/releases/download/pilot-12-1/OneCall-pilot.apk", page)
            self.assertIn("testing build", page)
            for tag in ["../main", "pilot-1-1\"><script>", "latest"]:
                with self.assertRaises(ValueError):
                    CLIENT.download_page(root, tag)


if __name__ == "__main__":
    unittest.main()
