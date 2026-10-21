#!/usr/bin/env python3
"""Package the fixed-target, separately installed OneCall emulator pilot."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil

API_URL = "http://10.0.2.2:3000/api/v1"
APPLICATION_ID = "com.example.onecall.localpilot"
LABEL = "OneCall Local Pilot"
APK_NAME = "OneCall-emulator-x86_64.apk"


def verify_manifest(badging):
    package = re.search(r"^package: name='([^']+)'", badging, re.M)
    label = re.search(r"^application-label:'([^']+)'", badging, re.M)
    activity = re.search(r"^launchable-activity: name='([^']+)'", badging, re.M)
    native = re.search(r"^native-code:(.*)$", badging, re.M)
    if (not package or package[1] != APPLICATION_ID
            or not label or label[1] != LABEL
            or not activity or activity[1] != "com.example.onecall.MainActivity"
            or not native or re.findall(r"'([^']+)'", native[1]) != ["x86_64"]
            or not re.search(r"^application-debuggable\s*$", badging, re.M)):
        observed = {
            "package": package[1] if package else None,
            "label": label[1] if label else None,
            "launcher": activity[1] if activity else None,
            "nativeCode": native[1].strip() if native else None,
            "debuggable": bool(re.search(r"^application-debuggable\s*$", badging, re.M)),
        }
        raise ValueError("APK metadata did not match the local pilot: " + json.dumps(observed))


def package(apk, destination, badging, notes, commit):
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("A complete source commit is required.")
    verify_manifest(badging)
    if not apk.is_file() or not notes.is_file():
        raise ValueError("The APK or installation instructions are missing.")
    destination.mkdir(parents=True, exist_ok=True)
    target = destination / APK_NAME
    shutil.copyfile(apk, target)
    with target.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    (destination / "SHA256SUMS.txt").write_text(f"{digest}  {APK_NAME}\n", encoding="utf-8")
    (destination / "build-info.json").write_text(json.dumps({
        "app": LABEL,
        "applicationId": APPLICATION_ID,
        "apiUrl": API_URL,
        "sourceCommit": commit,
        "buildType": "debug-emulator-pilot",
        "abi": "x86_64",
        "sha256": digest,
        "requires": "A running local OneCall backend on the emulator host at port 3000",
        "signing": "Temporary CI test certificate; not Play Store or production signing",
        "deviceAcceptance": "Not performed by this build job",
    }, indent=2) + "\n", encoding="utf-8")
    shutil.copyfile(notes, destination / "README.md")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apk", type=Path, default=Path("apps/mobile/build/app/outputs/flutter-apk/app-debug.apk"))
    parser.add_argument("--badging", type=Path, required=True)
    parser.add_argument("--destination", type=Path, default=Path("emulator-distribution"))
    args = parser.parse_args()
    package(args.apk, args.destination, args.badging.read_text(encoding="utf-8"),
            Path("docs/EMULATOR-PILOT.md"), os.environ.get("GITHUB_SHA", ""))
    print("Packaged the emulator-only OneCall pilot and its source/hash metadata.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError) as error:
        raise SystemExit(str(error)) from None
