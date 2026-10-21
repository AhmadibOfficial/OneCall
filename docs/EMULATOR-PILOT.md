# OneCall local emulator pilot

This download is the real OneCall Android app built for an **x86_64 Android
emulator on the same computer as your existing OneCall backend**. The app connects
to `http://10.0.2.2:3000/api/v1`. It requires the local backend to run; it is not
a public cloud deployment or a standalone offline booking service.

The app is labelled **OneCall Local Pilot**, with application ID
`com.example.onecall.localpilot`. It installs alongside the earlier local pilot
and has separate local app storage. Use your existing backend account to sign in;
your accounts and bookings stay in the existing backend database. The build does
not verify accounts, change backend permissions or include any account secrets.

Email/domain setup and live SMS setup are deferred. Existing account verification
requirements remain enforced. New accounts still use the established local
development verification flow. Payments, advertising and Amboy remain deferred.

## Run the existing local backend

Check the backend before installing:

```bash
curl -fsS --connect-timeout 5 --max-time 10 \
  http://127.0.0.1:3000/api/v1/health/ready
```

If this returns `{"status":"ok"}`, keep that backend running. If it is unavailable,
start the existing pilot from a separate terminal. For the established Kali
checkout and Compose project:

```bash
cd "$HOME/onecall/apps/backend/onecall"
docker compose -p onecall-kaduna-local -f compose.pilot.yml up -d --wait
pnpm --filter backend start:dev
```

Reuse the existing local configuration and database. Keep development services
on the local computer. This workflow does not overwrite environment files,
create/reset databases or configure public hosting. Resolve any existing port
3000 listener before starting an additional backend process.

## Install the downloaded APK

Start the existing `OneCall_Kaduna_API_34` emulator and leave it running. Wait for
the Android home screen and package manager to finish booting. Save the APK as
`$HOME/Downloads/OneCall-emulator-x86_64.apk`, then run:

```bash
onecall_adb="$HOME/Android/Sdk/platform-tools/adb"
"$onecall_adb" -s emulator-5554 get-state
"$onecall_adb" -s emulator-5554 shell -n pm path android
"$onecall_adb" -s emulator-5554 install -r \
  "$HOME/Downloads/OneCall-emulator-x86_64.apk" < /dev/null
"$onecall_adb" -s emulator-5554 shell -n am start \
  -n com.example.onecall.localpilot/com.example.onecall.MainActivity
```

Sign in and check your existing requests. A physical ARM Android phone cannot
use this x86_64 emulator build or the emulator's `10.0.2.2` host address.

The download includes SHA-256, source/API/build metadata, installation notes and
the public signing-certificate details. Signing uses a temporary CI debug key;
a later build may use a different certificate. This is not a Play Store release.
If an update reports a signature conflict, retain the existing installation and
report the conflict before removing any local app data.

## Rebuild and acceptance

The GitHub workflow **Publish OneCall emulator pilot** checks both cloud and
emulator packaging rules, runs Flutter analysis/tests, builds the fixed local
target, checks its actual application ID, label, launcher, debug flag and ABI,
with Android ABI filtering scoped to the local-pilot application ID,
and verifies the APK signature before publishing a prerelease. Publication runs
only from `main`; pull requests build/test without publishing. Future builds can
be requested through the workflow's **Run workflow** button on `main`.

Emulator UI/device acceptance still needs the local walkthrough. A successful
build or signed APK does not establish successful connection to your computer,
email/SMS delivery or public cloud readiness. The existing cloud publication
workflow and production verification gates are unchanged.
