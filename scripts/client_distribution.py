#!/usr/bin/env python3
"""Validate the cloud pilot target and package its Android/web downloads."""
import argparse
import hashlib
import html
import json
import os
from pathlib import Path
import re
import shutil
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import build_opener, HTTPRedirectHandler, Request


def api_url(value):
    if not isinstance(value, str) or value != value.strip() or any(c.isspace() for c in value):
        raise ValueError("Use the deployed Render HTTPS API URL ending /api/v1.")
    u = urlsplit(value)
    if (u.scheme != "https" or u.username or u.password or u.port or u.query or u.fragment
            or u.path.rstrip("/") != "/api/v1"
            or not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.onrender\.com", u.hostname or "")):
        raise ValueError("Use the deployed *.onrender.com HTTPS API URL ending /api/v1.")
    return f"https://{u.hostname}/api/v1"


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        return None


def preflight(value, opener=None, attempts=3, pause=time.sleep):
    base = api_url(value)
    origin = base.removesuffix("/api/v1")
    opener = opener or build_opener(NoRedirects())
    for attempt in range(attempts):
        try:
            for path in ["/api/v1/health/ready", "/legal/privacy.html", "/legal/account-deletion.html"]:
                with opener.open(Request(origin + path, method="GET"), timeout=20) as response:
                    if response.status != 200:
                        raise ValueError("The deployed API/public pages are not ready.")
                    if path.endswith("/ready"):
                        payload = json.loads(response.read(65536))
                        if not isinstance(payload, dict) or payload.get("status") != "ok":
                            raise ValueError("The deployed API readiness check did not pass.")
        except (HTTPError, URLError, TimeoutError, ValueError, json.JSONDecodeError):
            if attempt + 1 == attempts:
                raise ValueError("Cloud readiness failed; no APK or web release was published.") from None
            pause(10)
        else:
            return


def package(apk, destination, value, commit):
    base = api_url(value)
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("A complete source commit is required.")
    if not apk.is_file():
        raise ValueError("The built APK is missing.")
    destination.mkdir(parents=True, exist_ok=True)
    target = destination / "OneCall-pilot.apk"
    shutil.copyfile(apk, target)
    with target.open("rb") as source:
        digest = hashlib.file_digest(source, "sha256").hexdigest()
    (destination / "SHA256SUMS.txt").write_text(f"{digest}  OneCall-pilot.apk\n")
    (destination / "build-info.json").write_text(json.dumps({
        "app": "OneCall Cloud Pilot", "sourceCommit": commit, "apiUrl": base,
        "applicationId": "com.example.onecall.cloudpilot", "buildType": "debug-pilot",
        "sha256": digest, "signing": "CI test certificate; not a Play Store release",
    }, indent=2) + "\n")


def download_page(directory, tag):
    if not re.fullmatch(r"pilot-[0-9]+-[0-9]+", tag):
        raise ValueError("Invalid pilot release tag.")
    release = f"https://github.com/AhmadibOfficial/OneCall/releases/download/{tag}"
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "index.html").write_text("""<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>OneCall · Android download</title>
<style>*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px;background:#f5f7fb;color:#071e42;font:16px/1.7 system-ui,sans-serif}main{width:min(100%,560px);padding:clamp(24px,6vw,48px);border:1px solid #dce5f1;border-radius:28px;background:white}h1{font-size:36px;line-height:1.15;letter-spacing:-1px}p{color:#536581}a{color:#075ecb;text-underline-offset:4px}.download{display:inline-block;background:#075ecb;color:white;padding:14px 24px;border-radius:18px;text-decoration:none;font-weight:600}nav{display:flex;gap:20px;flex-wrap:wrap;margin-top:24px}</style>
<main><h1>OneCall for Android</h1><p>Try the OneCall cloud pilot. This testing build installs separately from the earlier local pilot.</p>
<a class="download" href=""" + '"' + html.escape(release + "/OneCall-pilot.apk", quote=True) + '"' + """>Download APK</a>
<p>This is an Android testing build. Play Store release signing is a separate step.</p><nav><a href="/">Open web app</a>
<a href=""" + '"' + html.escape(release + "/SHA256SUMS.txt", quote=True) + '"' + """>Download checksum</a></nav></main></html>""")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["resolve", "preflight", "package", "page"])
    parser.add_argument("--destination", type=Path, default=Path("distribution"))
    args = parser.parse_args()
    value = os.environ.get("ONECALL_API_URL", "")
    if args.action == "resolve":
        value = os.environ.get("ONECALL_REQUESTED_API_URL", "")
        if not value:
            value = json.loads(Path("deploy/client-target.json").read_text())["apiUrl"]
        print("ONECALL_API_URL=" + api_url(value))
    elif args.action == "preflight":
        preflight(value)
        print("Cloud readiness and public privacy/deletion pages passed.")
    elif args.action == "package":
        package(Path("apps/mobile/build/app/outputs/flutter-apk/app-debug.apk"), args.destination,
                value, os.environ.get("GITHUB_SHA", ""))
    else:
        download_page(args.destination, os.environ.get("ONECALL_PILOT_TAG", ""))


if __name__ == "__main__":
    try:
        main()
    except (KeyError, OSError, ValueError) as error:
        raise SystemExit(str(error)) from None
