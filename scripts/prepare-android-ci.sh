#!/usr/bin/env bash
# Install the Flutter-pinned NDK from Google's checksum-verified archive in CI.
set -euo pipefail
test "${CI:-}" = true || { echo 'This SDK setup is for disposable CI runners only.' >&2; exit 1; }
onecall_sdk="${ANDROID_HOME:?ANDROID_HOME is required}"
onecall_temp="$(mktemp -d "${RUNNER_TEMP:-/tmp}/onecall-ndk-XXXXXXXX")"
onecall_archive="$onecall_temp/android-ndk-r28c-linux.zip"

# Published by https://github.com/android/ndk/releases/tag/r28c.
curl --fail --location --retry 3 --retry-all-errors \
  --connect-timeout 20 --max-time 600 \
  --output "$onecall_archive" \
  https://dl.google.com/android/repository/android-ndk-r28c-linux.zip
printf '%s  %s\n' a7b54a5de87fecd125a17d54f73c446199e72a64 "$onecall_archive" | sha1sum --check -
test "$(stat --format=%s "$onecall_archive")" = 722261334
unzip -tq "$onecall_archive"
unzip -q "$onecall_archive" -d "$onecall_temp"
onecall_extracted="$onecall_temp/android-ndk-r28c"
test -f "$onecall_extracted/source.properties"
test -x "$onecall_extracted/toolchains/llvm/prebuilt/linux-x86_64/bin/clang"
grep -Eq '^Pkg.Revision[[:space:]]*=[[:space:]]*28\.2\.13676358[[:space:]]*$' "$onecall_extracted/source.properties"
mkdir -p "$onecall_sdk/ndk"
if [ -e "$onecall_sdk/ndk/28.2.13676358" ]; then
  mv "$onecall_sdk/ndk/28.2.13676358" "$onecall_temp/previous-ndk"
fi
mv "$onecall_extracted" "$onecall_sdk/ndk/28.2.13676358"
echo 'Verified Android NDK 28.2.13676358 is ready.'
