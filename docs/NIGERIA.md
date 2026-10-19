# OneCall Nigeria source update

This update builds on the verified Kaduna application. The Flutter screens follow the supplied navy-and-blue reference and use the supplied brand image. This is a source build for native acceptance, not a claim that OneCall has launched nationwide.

## What is connected

| Screen / flow | Actual behavior |
| --- | --- |
| Welcome, registration, login | Guest browsing; existing Nest authentication, refresh rotation, secure storage, verification and logout remain connected. Password reset has a client screen. |
| Home and All Services | Twenty catalogue services; state and town selection across 36 states and FCT; approved provider counts for the selected area. |
| Ride and delivery booking | Pickup, destination, optional schedule and ride preference. Requests wait for a matching provider. No fabricated fare, travel time or driver. |
| Home services | Address, description, optional schedule and saved-address selection. |
| Provider workspace | Application awaiting operator approval; jobs scoped to approved areas and services; accept, quote, start and complete in the app. |
| Quotes | Provider proposes the amount; the customer accepts a specific current quote. Replaced quotes cannot be accepted. New requests cannot start work before quote acceptance. |
| Bookings | Upcoming / History, live status refresh and cancellation. Existing pre-upgrade bookings retain their prior transition behavior. |
| Tracking and chat | Actual assigned-provider GPS, foreground sharing, latest position timestamp, optional map, and owned booking chat. No calculated routes or ETA. Latest stored location is removed on completion/cancellation. |
| Profile, addresses and favorites | Stored name edits, owned address CRUD, default address and saved catalogue favorites. |
| Notifications and Support | Stored booking/payment/chat notifications, read status, support tickets and operator responses. Notifications are an in-app inbox; push delivery is not implemented. |
| Wallet and checkout | Actual ledger balance/history, server-priced booking payments, hosted Paystack checkout and server verification. Funding defaults off. No example card numbers or wallet balance are displayed. |

Food/grocery/pharmacy bookings are pickup and delivery requests from a chosen vendor, described by the customer. Restaurant menus, merchant inventory and a shopping cart are not included. A scheduled time is a request, not a guaranteed dispatch slot. The referral rewards programme is not launched; the invite screen copies a real invitation without promising earnings.

## Apply to the entire existing app

This revision centralizes the navy/blue design for every Flutter route, including customer and provider screens, account forms, empty/loading/error states, dialogs, buttons and navigation. It includes OneCall launcher assets for Android/iOS/web/macOS/Windows, Android/iOS launch screens, web metadata and desktop window branding. Large windows keep a readable app width, narrow phones use a three-column service grid, and the location sheet scrolls when the keyboard opens. The original supplied brand image remains unchanged. The compact mark is code-native artwork based on the reference.

Your existing project is `$HOME/onecall/apps/backend/onecall`. **Close the backend process and Android emulator before applying/building.** Download the latest archive as `$HOME/Downloads/onecall-source-audit.zip`, then run:

```bash
bash <<'BASH'
set -euo pipefail
onecall_archive="$HOME/Downloads/onecall-source-audit.zip"
onecall_installer="$(mktemp)"
trap 'rm -f -- "$onecall_installer"' EXIT
unzip -p "$onecall_archive" onecall/scripts/apply-update.sh > "$onecall_installer"
test -s "$onecall_installer"
bash "$onecall_installer" "$onecall_archive" < /dev/null
BASH
```

The installer validates the archive and the existing **local development** environment before writes. It creates a private source backup and a validated PostgreSQL dump, applies the full source, installs backend dependencies, validates/deploys migrations, builds Nest, resolves Flutter dependencies, runs analyzer/tests and builds the debug Android APK with the emulator API address. A failed backup stops before source changes; a later failure stops before subsequent steps and leaves the backup available. It does not automatically roll back a migrated database or start/deploy services.

Keep that backup private because it includes your local `.env`. Existing `.env`, SDK paths, signing keys, database volumes and untracked local files are preserved. The archive contains no private configuration, database contents, SDK, build output or `node_modules`. Existing accounts, service requests, customer secure-storage key and Android identity are retained. Previously operator-provisioned active/verified providers retain only their original eight Kaduna services. New provider applications start unapproved.

The installer is deliberately limited to the known local `compose.pilot.yml` environment. For another database or deployment, make an appropriate database backup and apply the reviewed source/migration in that environment; do not point local tests at persistent customer data.

After successful build, start the backend from the project root in its own terminal:

```bash
cd "$HOME/onecall/apps/backend/onecall"
pnpm --filter backend start:prod
```

This runs compiled code with the preserved local development `.env`. Start the repaired emulator in its own terminal, then install the built app without another Gradle build:

```bash
cd "$HOME/onecall/apps/backend/onecall"
bash scripts/run-android.sh
```

Do not run tests against that persistent database. Native verification uses the disposable `_test` database:

```bash
bash <<'BASH'
set -euo pipefail
cd "$HOME/onecall/apps/backend/onecall"
docker compose -f compose.test.yml up -d --wait
export ONECALL_TEST_DATABASE_URL='postgresql://onecall_test:onecall_test_only@127.0.0.1:54339/onecall_test'
export ONECALL_TEST_REDIS_URL='redis://127.0.0.1:63809/15'
pnpm verify:nigeria --backend-only
BASH
```

## Build and run Android

Close the emulator while compiling on the 3.7 GiB laptop. This source removes unused Firebase plugins; account and service data use the Nest backend. `flutter pub get` must resolve the added `url_launcher` dependency and remove the unused Firebase dependencies. The updated Flutter lockfile can only be finalized by that native package resolution; do not use `--enforce-lockfile` for the first resolution of this update.

```bash
bash <<'BASH'
set -euo pipefail
cd "$HOME/onecall/apps/backend/onecall/apps/mobile"
export JAVA_HOME='/usr/lib/jvm/java-21-openjdk-amd64'
export PATH="$JAVA_HOME/bin:$PATH"
export GRADLE_OPTS="${GRADLE_OPTS:-} -Dorg.gradle.jvmargs=-Xmx1536m -Dorg.gradle.workers.max=1 -Dorg.gradle.parallel=false -Dorg.gradle.daemon=false"
flutter pub get
flutter analyze
flutter test
flutter build apk --debug \
  --dart-define=ONECALL_API_URL=http://10.0.2.2:3000/api/v1
BASH
```

Then start the compiled backend with your existing local development environment (`pnpm --filter backend start:prod` uses that environment), start the repaired emulator in its own terminal, and wait for Android readiness before installing the existing APK:

```bash
bash <<'BASH'
set -euo pipefail
cd "$HOME/onecall/apps/backend/onecall/apps/mobile"
onecall_adb="$HOME/Android/Sdk/platform-tools/adb"
curl -fsS --connect-timeout 5 --max-time 10 -w '\n' http://127.0.0.1:3000/api/v1/health/ready
# -n prevents adb from consuming the remaining heredoc commands.
timeout --kill-after=5s 180s "$onecall_adb" -s emulator-5554 shell -n '
  while :; do
    if [ "$(getprop sys.boot_completed)" = "1" ]; then
      case "$(pm path android 2>/dev/null)" in package:*) exit 0 ;; esac
    fi
    sleep 2
  done
'
"$onecall_adb" -s emulator-5554 install -r build/app/outputs/flutter-apk/app-debug.apk < /dev/null
"$onecall_adb" -s emulator-5554 shell -n am start -n com.example.onecall/.MainActivity
BASH
```

Your original customer session uses the same secure-storage key. Existing Android app identity is retained for this update; release identity/signing still needs production configuration.

## Provider approval and support operations

Database-backed operator commands are privileged console tools, never public mobile APIs. Build/migrate first. Approve only providers whose credentials, service ability and actual coverage operations has checked.

```bash
cd "$HOME/onecall/apps/backend/onecall"
# Your existing test provider remains limited to the Kaduna pilot catalogue.
pnpm --filter backend pilot:provider 9276912100
# Example syntax for an operator-approved new provider; use their actual public UID.
pnpm --filter backend provider:approve PROVIDER_UID 'Lagos' 'Ikeja' 'ride,parcel-delivery'
```

The service keys come from `GET /api/v1/services`. The first approval replaces unapproved proposed coverage with the operator-selected area and services. Later approvals add vetted areas idempotently. A `*` city explicitly grants every town in that state; use it only when the provider can serve that scope. The customer never supplies provider approval or server prices. Existing jobs must be handled by the assigned provider.

Support operations:

```bash
pnpm --filter backend support:ops list
# Write the response as plain text in a local file, then resolve a reviewed ticket.
pnpm --filter backend support:ops resolve TICKET_UUID /absolute/path/response.txt
```

Responses and a notification are stored for the ticket owner. These commands do not send external email/SMS.

## Live service configuration

- Email/SMS: retain the signed authentication delivery adapter. See `AUTH-DELIVERY.md`; real provider credentials and sender approval are required. Development tokens are not returned in production.
- Payments: configure `PAYSTACK_SECRET_KEY` on the backend. Start with a **test key**. Set the Paystack webhook to `https://YOUR_API/api/v1/payments/paystack/webhook`. The backend checks HMAC-SHA512 over exact request bytes and verifies reference, NGN/kobo amount, customer and test/live domain directly with Paystack. No card details enter the OneCall API.
- Wallet funding: `ONECALL_WALLET_ENABLED=false` is the default. Test funding can be enabled explicitly. Chargebacks, refunds, provider payouts and financial operations are not automated in this source; keep live wallet funding off until those flows are implemented and operated. Paid cancellations go through Support. Do not manually mark a payment refunded without moving and reconciling actual money.
- A checkout left `INITIALIZING` after an ambiguous network failure is durable and blocks another payment channel for that booking. Check its status or have operations reconcile its reference with Paystack. The source deliberately does not auto-expire it and risk charging twice.
- Maps: Android can enable the embedded provider-position map by exporting `ONECALL_MAPS_API_KEY` for Gradle and building with `--dart-define=ONECALL_MAPS_ENABLED=true`. Configure the key for your Android package/signing certificate in your map provider console. Without it, actual coordinates and an Open in Maps link remain available. iOS/web maps need their platform-specific provider configuration before enabling the same flag. No directions/ETA service is connected.
- Hosted app link: optional Flutter define `ONECALL_PUBLIC_URL` accepts a published HTTPS URL. Legal documents are bundled for offline access and served at `/legal/` by the backend; `ONECALL_TERMS_URL` and `ONECALL_PRIVACY_URL` are superseded. See `docs/LEGAL.md` for draft status and public-launch requirements. Referral rewards have not launched.
- Web: configure exact `CORS_ORIGINS` for the deployed Flutter origin. GET/POST/PUT/PATCH/DELETE are supported. Release builds require an HTTPS API.

Nationwide software coverage is not nationwide provider availability. Live launch also needs a hosted API/database/Redis/delivery adapter, approved providers and customer support in each served area, payment reconciliation/settlement, published business policies and native release acceptance.

## Native acceptance

Use your existing customer and the separately registered provider. Run this flow first in Kaduna, then with a newly approved provider in another state:

1. Register/login/restore/logout; verify email and phone; request and confirm a password reset.
2. Select state/town; check actual provider availability; create a home-service request and a ride/delivery request with both addresses.
3. Provider signs in on a separate session: approved area queue → accept job → send quote. An unapproved provider or a provider in another area cannot claim it.
4. Customer accepts the current quote. Provider starts work. Customer refreshes status, calls/chats with the assigned provider, and sees the provider's shared location.
5. Provider completes work; customer sees Completed/History. Location is removed and new chat messages are blocked.
6. Save/edit/delete/default an address; save/remove a favorite; read owned notifications; submit a support ticket and read the operator response.
7. With test gateway credentials only: pay an accepted quote through checkout; verify it; enable test wallet funding and test ledger balance/debit/retry. Repeated callbacks and repeated payment presses must not duplicate money.

The remote checks passed: 152 unique backend tests, Nest build, application/test TypeScript checks, changed-module lint, Prisma validation, fresh migration application and legacy migration upgrade checks. The full record is `verification/nigeria-result.json`. Native PostgreSQL with ten independent connections, Flutter analyzer/tests/builds, Android execution and visual matching still require the commands above on your laptop. The older Kaduna native acceptance does not prove this new Flutter version.

## App-wide revision verification

See `verification/app-wide-result.json` for this revision. Eight installer tests passed against disposable projects and stub database/build commands: configuration preservation, complete update flow, archive traversal rejection, symlink rejection, failed backup, failed migration and nonlocal-environment rejection. These tests check installer behavior; they do not prove a native APK build. Dart syntax/formatting, platform XML/plist/JSON, asset dimensions and shell syntax were checked remotely. No backend logic was changed in this app-wide styling revision; the previous 152 backend test results remain the backend evidence.

Flutter analyzer, the 15 supplied client/widget tests, Android/web builds, emulator runtime and exact screen matching remain pending on the native laptop. The installer runs Flutter analyzer/tests and Android build there and stops on a failure. Run the customer/provider native acceptance above before release. iOS/macOS/Windows branding assets are included; native builds for those platforms have not been executed.

The platform artwork is checked in. Regenerating it is a developer task using `python3 scripts/generate-platform-icons.py` with Pillow installed; app users and Flutter builds do not need that tool.

## Download source audit

The source archive is generated with `scripts/package-source.py`. It contains the canonical backend in `apps/backend` and Flutter app in `apps/mobile`, and excludes obsolete root app copies, source backups and a malformed legacy filename that previously caused archive validation to fail. The actual packaged archive passes the installer regression test using stub database/build commands. Existing local files are preserved by the overlay; excluding obsolete files from this archive does not delete copies already on your laptop.

Flutter dependency resolution remains pending: the existing lockfile and generated platform plugin files must be refreshed by `flutter pub get` before native validation. The installer performs that step, then analysis, tests and Android build. Packaging verification does not establish native acceptance or live email/SMS delivery.
