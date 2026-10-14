# Kaduna pilot setup

The implemented scope is the customer path: create an account, sign in, verify email and phone, select a service, send a request with a Kaduna address, view status, and cancel before work starts. The eight service categories come from the API. Quotes, online checkout, provider/admin Flutter screens, push notifications and automated dispatch remain separate work.

## Local backend

Use Node 24, the pnpm version declared in `package.json`, Docker Compose, and Flutter 3.44.2 / Dart 3.12.2 or a compatible newer SDK. Flutter dependencies remain on the existing project constraints.

From the workspace root:

```bash
cp apps/backend/.env.example apps/backend/.env
docker compose -f compose.pilot.yml up -d --wait
pnpm install --frozen-lockfile
pnpm prisma:validate
pnpm prisma:deploy
pnpm build
pnpm dev
```

The example configuration targets local PostgreSQL at port 54329 and Redis at 63799. The API binds to loopback at port 3000, prefix `/api/v1`. The Compose credentials and secret placeholders are for development only. The new migration adds `Order.city` (default Kaduna) and optional `Order.address`, preserving old orders.

For the compiled entry point:

```bash
pnpm --filter backend start:prod
```

`start:prod` runs compiled JavaScript; `NODE_ENV` in your configuration selects the environment behavior. Set `NODE_ENV=production` for a deployment. Existing JWTs without `tokenVersion`, issuer or audience must sign in again after this upgrade.

## Flutter customer app

For an Android emulator:

```bash
cd apps/mobile
flutter pub get
flutter analyze
flutter test
flutter run --dart-define=ONECALL_API_URL=http://10.0.2.2:3000/api/v1
```

For an Android phone connected by USB, keep the backend bound to loopback and use:

```bash
adb reverse tcp:3000 tcp:3000
flutter run --dart-define=ONECALL_API_URL=http://127.0.0.1:3000/api/v1
```

Use an HTTPS API endpoint for an iOS device/simulator or any release build. For Flutter web development, add the exact web origin (for example `http://localhost:8080`) to `CORS_ORIGINS`, restart the backend, and run Chrome at that port. The default example does not enable CORS. CORS is unnecessary for native Flutter clients.

```bash
flutter run -d chrome --web-port=8080 --dart-define=ONECALL_API_URL=http://localhost:3000/api/v1
```

An HTTPS web page also needs an HTTPS API. Release builds reject HTTP API URLs. The API URL is configuration, not a secret; tokens are stored by `flutter_secure_storage` in one session record. Passwords are not retained. Network failures never automatically repeat an order submission. Concurrent 401s share one refresh request, and requests from an old login cannot retry using a new account.

## Local verification walkthrough

With backend `NODE_ENV=development` and a Flutter debug build:

1. Choose **Create account**, enter your name, email, phone and a password with at least eight characters including a letter and a number. Local Nigerian numbers beginning with 0 are converted to +234 by the client.
2. Choose **Verify account**. Request and confirm the email token, then request and confirm the phone code. Debug challenges are loaded into the fields automatically; no real message is sent in development.
3. Choose a service, enter the Kaduna address/landmark and job details, then send the request.
4. The status screen reads the saved request immediately and polls every 15 seconds while the app is active. Completed/cancelled requests stop polling. Pull to refresh or use the refresh button for an immediate update.

Development challenges are sensitive test credentials. Keep development servers local. Production/test responses never expose verification codes or reset secrets. The phone request returns a public selector so the client can pair it with the SMS code.

## Production verification delivery

Configure `AUTH_DELIVERY_URL` and `AUTH_DELIVERY_SECRET` for an operator-owned HTTPS adapter that sends email and SMS. The backend returns HTTP 503 when delivery is absent or fails. The package now includes an adapter for Resend email and Termii SMS, signed-request/replay checks, Redis delivery receipts and a production HTTPS integration test. See [AUTH-DELIVERY.md](AUTH-DELIVERY.md) for configuration and startup. Vendor credentials and actual deployment remain operator work.

The adapter receives a JSON POST with:

| Field | Value |
| --- | --- |
| `kind` | `email-verification`, `phone-verification`, or `password-reset` |
| `recipient` | Customer email address or phone number |
| `selector` | Public challenge selector |
| `secret` | Email/reset secret, or the six-digit SMS code |
| `expiresAt` | ISO 8601 expiry time |

The header is `x-onecall-signature: t=<unix-seconds>,v1=<hex-hmac>`. Verify HMAC-SHA256 over the exact string `<timestamp>.<raw-json-body>` using the shared secret, compare safely, and reject stale timestamps. Return a successful status only after accepting the message for delivery. The backend uses a ten-second timeout and rejects redirects. Keep message bodies and secrets out of logs.

Email verification must give the customer `selector.secret` to paste in the app. SMS contains only the six-digit secret; the app already retains the public selector. Password-reset messages use `selector.secret` with the reset-confirm API. Password reset is repaired on the backend but does not yet have a Flutter screen.

For deployment, set fresh random secrets (at least 32 characters), production PostgreSQL/Redis URLs, `NODE_ENV=production`, the HTTPS delivery adapter, and the HTTPS `ONECALL_API_URL`. Set `TRUST_PROXY` to the known number of reverse-proxy hops only when the API is reachable exclusively through that proxy. Default 0 ignores spoofed forwarded headers. The Android manifest permits cleartext only in debug builds. Distribution signing and final application identifiers still use the original Flutter project settings and need release configuration.

## Provider status operations

For this pilot, provision a vetted provider account from the backend host after that account has registered and verified both contacts. The command accepts the account's ten-digit public UID and is idempotent; it does not activate or verify an account.

```bash
pnpm --filter backend pilot:provider 1234567890
```

Use that provider's normal login credentials and Bearer access token for:

| Request | Result |
| --- | --- |
| `GET /api/v1/orders/available` | Up to 50 unassigned pending requests |
| `POST /api/v1/orders/<id>/accept` | Claims a pending request atomically |
| `POST /api/v1/orders/<id>/start` | ACCEPTED → IN_PROGRESS for the assigned provider |
| `POST /api/v1/orders/<id>/complete` | IN_PROGRESS → COMPLETED for the assigned provider |

The customer sees those states through `GET /orders/<id>` and their request list. Other customers/providers cannot read or mutate another account's order. Provider and customer requests require ACTIVE status plus both verification flags. The current provider availability API is for vetted pilot operators; category matching and a provider mobile interface are future work. Keep provider customer addresses private.

The price is server controlled and new requests have `amount=null`. The customer client does not submit a price, provider ID, city override or status. The pilot team must agree prices operationally; the backend does not yet enforce a quote-acceptance workflow.

## Reproducible tests

For the remaining native acceptance checks, `pnpm verify:pilot` runs native service preflight, frozen installation, migrations/build/type checks/lint, all backend/delivery tests, Flutter analysis/tests, release web compilation and a debug Android APK build. It refuses to label a PostgreSQL-compatible single backend as native multi-connection verification.

Start the included disposable services, then run it with a Flutter SDK plus Java/Android SDK on PATH. These use different ports and a separate Compose project from the development/pilot services:

```bash
docker compose -f compose.test.yml up -d --wait
export ONECALL_TEST_DATABASE_URL='postgresql://onecall_test:onecall_test_only@127.0.0.1:54339/onecall_test'
export ONECALL_TEST_REDIS_URL='redis://127.0.0.1:63809/15'
pnpm verify:pilot
```

The runner supplies isolated test secrets and forces ten Prisma connections. It never sends real email/SMS and does not deploy. Use `--backend-only` or `--flutter-only` to run either part independently. Results/logs go to `.pilot-verification/`; a failed check stops the run and records failure. A prerequisite failure leaves a fresh `passed=false` preflight marker, so an earlier success is never reused. Its default HTTPS API URL is an example used only for compilation. Set `ONECALL_API_URL` to the actual HTTPS backend for usable builds. Device behavior and real vendor delivery still need the walkthrough below.

The backend tests create and delete only their synthetic database fixtures. The Redis tests use unique keys and no longer call `FLUSHDB`. The runner requires explicit local test URLs and a PostgreSQL database name such as `onecall_test`. It does not rewrite the development `.env`. Use a disposable environment; do not run against the pilot database.

Remove the disposable test containers when finished; their temporary data is removed with them:

```bash
docker compose -f compose.test.yml down
```

If you already run native PostgreSQL/Redis locally, supply their disposable test URLs instead of starting Compose. Individual backend commands require the same isolated environment and `ONECALL_ALLOW_TEST_DATABASE=true`; the runner executes:

```bash
pnpm prisma:deploy
pnpm --filter backend build
pnpm --filter backend exec tsc --project test/tsconfig.json --noEmit
pnpm --filter backend lint:pilot
pnpm --filter backend lint:delivery
pnpm --filter backend test --runInBand --silent
pnpm --filter backend test:pilot
pnpm --filter backend test:delivery
```

The pilot suite keeps rate limits active across requests and proves that changing emails or forwarded IP headers cannot bypass the login limit. The older suites reset only their own throttle namespace between tests to isolate other behavior. Native PostgreSQL CI uses ten connections to exercise database contention. The Flutter CI job runs analysis, client/widget tests, an HTTPS-configured release web build and a debug Android APK build. CI needs to run after this source is placed in a GitHub repository.

## Device acceptance after native checks

Use a pilot test account on an Android device against the configured backend. Record the outcome of each step:

| Action | Expected result |
| --- | --- |
| Register, sign in and request both verification messages | Pending account cannot book; production responses contain no challenge secrets; messages arrive |
| Confirm email token and SMS code | Account becomes ACTIVE and the service request form becomes available |
| Submit one request, then provision/accept/start/complete with the provider API | Exactly one request is saved; the customer status changes through ACCEPTED, IN_PROGRESS and COMPLETED |
| Close/reopen the app | Stored session restores; account/contact verification remains correct |
| Expire the access JWT, disconnect temporarily, then reconnect and refresh | The saved session survives the outage and refresh succeeds when the backend is reachable |
| Sign out, reopen and sign in as another test account | Login is required after logout; prior account requests are absent |

Do not use compilation against the example API URL as evidence of device or live delivery acceptance. Use the backend reset-confirm API to verify that a delivered reset token invalidates prior access/refresh credentials; reset is not yet exposed in the Flutter UI.

See [PILOT-VERIFICATION.md](PILOT-VERIFICATION.md) for the exact results obtained in this workspace and the remaining acceptance checks.

Platform configuration reference: [flutter_secure_storage 10.3.1 documentation](https://pub.dev/packages/flutter_secure_storage/versions/10.3.1). Keychain capability entitlements are included for iOS/macOS, and Android backup is disabled for stored credentials. Apple signing and device behavior still require native verification.
