#!/usr/bin/env bash
# Install the built debug app without running another Gradle build beside the emulator.
set -euo pipefail
onecall_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
onecall_adb="${ANDROID_HOME:-$HOME/Android/Sdk}/platform-tools/adb"
onecall_device="${1:-emulator-5554}"
onecall_apk="$onecall_root/apps/mobile/build/app/outputs/flutter-apk/app-debug.apk"
test -x "$onecall_adb"
test -f "$onecall_apk" || { echo 'Build the debug APK first.' >&2; exit 1; }
curl -fsS --connect-timeout 5 --max-time 10 -w '\n' http://127.0.0.1:3000/api/v1/health/ready
echo 'Waiting for Android and its package manager...'
if ! timeout --kill-after=5s 180s "$onecall_adb" -s "$onecall_device" shell -n '
  while :; do
    if [ "$(getprop sys.boot_completed)" = "1" ]; then
      case "$(pm path android 2>/dev/null)" in package:*) exit 0 ;; esac
    fi
    sleep 2
  done
'; then
  echo 'Android is not ready. Keep the emulator running and retry.' >&2
  exit 1
fi
"$onecall_adb" -s "$onecall_device" install -r "$onecall_apk" < /dev/null
"$onecall_adb" -s "$onecall_device" shell -n am start -n com.example.onecall/.MainActivity
