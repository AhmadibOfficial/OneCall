#!/usr/bin/env bash
set -euo pipefail
onecall_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
: "${ONECALL_API_URL:?Set your deployed HTTPS API base ending in /api/v1.}"
: "${ONECALL_APPLICATION_ID:?Set the final owned Android application ID.}"
python3 - <<'PY'
import os,re
from pathlib import Path
from urllib.parse import urlsplit
u=urlsplit(os.environ['ONECALL_API_URL']);app=os.environ['ONECALL_APPLICATION_ID']
if u.scheme!='https' or not u.hostname or u.username or u.password or u.query or u.fragment or u.path.rstrip('/')!='/api/v1':raise SystemExit('Use a credential-free HTTPS API base ending in /api/v1.')
if u.hostname in ('localhost','127.0.0.1','10.0.2.2','api.example.com') or u.hostname.endswith('.example'):raise SystemExit('Deploy and verify the real API before building a release.')
if not re.fullmatch(r'[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}',app) or app.startswith('com.example.'):raise SystemExit('Choose the owned final application ID.')
PY
cd "$onecall_root/apps/mobile"
test -f android/key.properties || { echo 'Configure android/key.properties privately first.' >&2; exit 1; }
flutter pub get
flutter analyze
flutter test
onecall_args=(--release "--dart-define=ONECALL_API_URL=$ONECALL_API_URL")
if [ -n "${ONECALL_GOOGLE_SERVER_CLIENT_ID:-}" ]; then
  onecall_args+=("--dart-define=ONECALL_GOOGLE_SERVER_CLIENT_ID=$ONECALL_GOOGLE_SERVER_CLIENT_ID")
fi
flutter build appbundle "${onecall_args[@]}"
echo 'Signed app bundle: apps/mobile/build/app/outputs/bundle/release/app-release.aab'
