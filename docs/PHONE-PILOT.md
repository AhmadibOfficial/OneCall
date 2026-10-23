# OneCall physical Android phone pilot

This is the real OneCall app built for ARM Android phones, including ARM64 and
ARMv7. It is labelled **OneCall Phone Pilot**, with application ID
`com.example.onecall.localphone`. It installs alongside earlier OneCall builds
and has separate local app storage. Sign in using your existing backend account.
Your accounts and bookings remain in your existing backend database.

The app connects to `http://127.0.0.1:3000/api/v1` on the phone. A USB connection
and `adb reverse tcp:3000 tcp:3000` carry those requests to the existing local
backend on your computer. Keep the cable connected and backend running during
the test. Repeat the reverse command after reconnecting or restarting the phone.
This is a local testing build, not a standalone cloud-connected or Play Store app.
The actual minimum Android API and included architectures are in `build-info.json`.

## Prepare your existing backend

Check whether it is already running:

```bash
curl -fsS --connect-timeout 5 --max-time 10 \
  http://127.0.0.1:3000/api/v1/health/ready
```

If the result is `{"status":"ok"}`, leave that backend running. Otherwise start
the existing pilot in a separate terminal and keep it open:

```bash
cd "$HOME/onecall/apps/backend/onecall"
docker compose -p onecall-kaduna-local -f compose.pilot.yml up -d --wait
pnpm --filter backend start:dev
```

Reuse your local configuration and the established `onecall-kaduna-local` Compose
project. Do not reset the database, remove volumes or start a second backend if
port 3000 is already serving OneCall. No public port binding or router changes are
needed for this USB test.

## Connect your phone and install

1. Enable Developer options on your own phone (usually tap **Build number** seven
   times under **Settings > About phone**), then enable **USB debugging**.
2. Connect the phone to your Kali computer using a data-capable USB cable. Unlock
   the phone and approve its **Allow USB debugging** prompt for this computer.
3. Save this release's APK as `~/Downloads/OneCall-phone-arm.apk` and its
   `SHA256SUMS.txt` in the same folder. Verify the checksum before installing.
4. Run the commands below on Kali. `-d` selects the USB phone even if an emulator
   is also running; with multiple USB devices, disconnect the others first.

```bash
bash <<'BASH'
set -euo pipefail
onecall_adb="$HOME/Android/Sdk/platform-tools/adb"
onecall_apk="$HOME/Downloads/OneCall-phone-arm.apk"

curl -fsS --connect-timeout 5 --max-time 10 -w '\n' \
  http://127.0.0.1:3000/api/v1/health/ready

cd "$HOME/Downloads"
sha256sum --check SHA256SUMS.txt

"$onecall_adb" devices -l
"$onecall_adb" -d get-state
"$onecall_adb" -d shell -n getprop ro.product.cpu.abilist
"$onecall_adb" -d shell -n getprop ro.build.version.sdk

"$onecall_adb" -d reverse tcp:3000 tcp:3000
"$onecall_adb" -d install -r "$onecall_apk" < /dev/null
"$onecall_adb" -d shell -n am start \
  -n com.example.onecall.localphone/com.example.onecall.MainActivity
BASH
```

An `unauthorized` device needs the approval prompt accepted on the unlocked
phone. An empty device list usually requires checking the cable, USB debugging
or Linux USB permissions. Do not grant root to the app. If installation reports a
signature conflict, retain the existing app and report the exact error before
removing any data. This build uses a temporary CI debug certificate; future
builds may not share that certificate.

## Physical phone acceptance

Sign in, inspect your existing request, test navigation and appearance settings,
then check provider/booking operations appropriate to your account. Use support
and photo upload only on bookings you control. Record any launch crash, failed
API request or permission problem. Build checks and APK signature verification
do not replace this physical-device walkthrough.

Email/SMS live activation remains deferred; existing verification and backend
permissions remain enforced. Google/Apple live sign-in still requires its own
credentials and native configuration. Paystack checkout now has explicit disabled/test/live configuration; its actual availability comes from the backend. See [CLOUD-ACTIVATION.md](CLOUD-ACTIVATION.md). Ads and Amboy remain deferred.
Switching workspaces does not change account roles or provider approval. Cloud production checks remain enforced.

To remove the USB tunnel when finished:

```bash
"$HOME/Android/Sdk/platform-tools/adb" -d reverse --remove tcp:3000
```

Android's official guides describe [USB device setup](https://developer.android.com/studio/run/device)
and [ADB reverse port forwarding](https://developer.android.com/develop/ui/views/layout/webapps/access-local-server).

For Wi-Fi/mobile-data deployment and the parcel network, see [PARCEL-NETWORK.md](PARCEL-NETWORK.md). The USB phone pilot remains a local build.
