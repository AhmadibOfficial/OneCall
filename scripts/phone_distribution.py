#!/usr/bin/env python3
"""Package OneCall's ARM phone pilot for a local backend over USB ADB reverse."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil

API_URL = "http://127.0.0.1:3000/api/v1"
APPLICATION_ID = "com.example.onecall.localphone"
LABEL = "OneCall Phone Pilot"
APK_NAME = "OneCall-phone-arm.apk"
ABIS = ["arm64-v8a", "armeabi-v7a"]
ACTIVITY = "com.example.onecall.MainActivity"


def verify_manifest(badging):
    patterns = {
        "package": r"^package: name='([^']+)'",
        "label": r"^application-label:'([^']+)'",
        "launcher": r"^launchable-activity: name='([^']+)'",
        "nativeCode": r"^native-code:(.*)$",
        "minAndroidApi": r"^(?:minSdkVersion|sdkVersion):'(\d+)'",
    }
    observed = {}
    for key, pattern in patterns.items():
        match = re.search(pattern, badging, re.M)
        observed[key] = match[1] if match else None
    observed["debuggable"] = bool(re.search(r"^application-debuggable\s*$", badging, re.M))
    native = re.findall(r"'([^']+)'", observed["nativeCode"] or "")
    if (observed["package"] != APPLICATION_ID
            or observed["label"] != LABEL
            or observed["launcher"] != ACTIVITY
            or sorted(native) != ABIS
            or not observed["minAndroidApi"]
            or int(observed["minAndroidApi"]) < 1
            or not observed["debuggable"]):
        raise ValueError("APK metadata did not match the USB phone pilot: " + json.dumps(observed))
    return int(observed["minAndroidApi"])


def package(apk, destination, badging, notes, commit):
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("A complete source commit is required.")
    min_sdk = verify_manifest(badging)
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
        "launcher": ACTIVITY,
        "apiUrl": API_URL,
        "sourceCommit": commit,
        "buildType": "debug-usb-phone-pilot",
        "abis": ABIS,
        "minAndroidApi": min_sdk,
        "sha256": digest,
        "requires": "A running local OneCall backend on port 3000 and an authorized USB phone with adb reverse tcp:3000 tcp:3000",
        "signing": "Temporary CI test certificate; not Play Store or production signing",
        "deviceAcceptance": "Not performed by this build job; physical phone walkthrough required",
    }, indent=2) + "\n", encoding="utf-8")
    shutil.copyfile(notes, destination / "README.md")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apk", type=Path, default=Path("apps/mobile/build/app/outputs/flutter-apk/app-debug.apk"))
    parser.add_argument("--badging", type=Path, required=True)
    parser.add_argument("--destination", type=Path, default=Path("phone-distribution"))
    args = parser.parse_args()
    package(args.apk, args.destination, args.badging.read_text(encoding="utf-8"),
            Path("docs/PHONE-PILOT.md"), os.environ.get("GITHUB_SHA", ""))
    print("Packaged the ARM USB phone pilot with its source, ABI and checksum metadata.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError) as error:
        raise SystemExit(str(error)) from None
