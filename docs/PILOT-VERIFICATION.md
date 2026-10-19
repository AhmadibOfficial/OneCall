# Kaduna pilot engineering verification — 2026-10-09

Authentication was repaired and the Flutter customer flow was connected in the supplied OneCall source. This is an engineering source delivery; no pilot server or app-store build was deployed.

## Changes

- JWTs now carry the current account token version and require HS256, the OneCall issuer and mobile audience. Deleted, suspended and deactivated accounts are rejected. Logout and password reset invalidate existing access and refresh credentials.
- Login, refresh, logout and reset acquire the same user-row lock before mutations. Refresh consumption and replacement creation share one transaction. Reset tokens have one atomic winner. Verification attempts reserve a slot before checking the secret; success, consumption and account activation are transactional.
- Redis throttling is installed globally. Login limits use the caller's IP, and a changed email or spoofed forwarded header does not bypass the limit with default proxy trust.
- Orders/payment initiation require ACTIVE status and verified email and phone. The authenticated profile response supplies the fields needed by Flutter, using the safe response mapper.
- An eight-category Kaduna service catalogue and order address/city fields connect the booking form to saved requests. Existing provider transitions are reflected in the customer status screen.
- Flutter has registration/login forms, verification, secure session persistence, one shared token refresh operation, guarded requests across account changes, request submission/list/detail/cancellation, network errors and foreground status polling.
- Production email/SMS/reset challenges use a signed HTTPS delivery-adapter contract and fail with 503 when unavailable. Development alone exposes local challenge values. An executable Resend/Termii adapter now validates signatures/expiry/replays, atomically reserves Redis receipts and hides vendor errors. Deployment and credentials remain operator work.
- Flutter keeps saved credentials across temporary network/server refresh failures and detaches pending refresh operations when changing sessions. Three additional client test cases cover outages and overlapping account refreshes; SDK execution remains pending.
- `pnpm verify:pilot` checks native PostgreSQL independent connections and uses ten Prisma connections for regression/contended auth checks, then runs Flutter analysis/tests/builds. It uses explicit disposable local service URLs and records results. Native CI now includes the delivery suite.
- Runtime dependencies, Prisma script forwarding and the compiled entry point were repaired. The obsolete Hello World e2e test was replaced by the pilot suite. Redis test connections/cleanup were repaired, stale test JWTs were updated, and webhook/file-upload fixtures now send the intended bytes and MIME types. A webhook idempotency race found in the wider regression run was repaired with payment-row serialization and an in-transaction duplicate check.

## Completed checks

| Check | Result |
| --- | --- |
| Frozen pnpm installation | Passed |
| Prisma client generation | Passed |
| Nest production build | Passed |
| TypeScript source + test type check | Passed |
| Focused authentication/pilot ESLint check | Passed |
| Delivery/runtime/test ESLint check | Passed |
| Prisma migration deployment to an empty test database | All 11 migrations applied |
| Maintained backend security suites | 16 suites, 105 tests passed |
| Kaduna pilot HTTP/database suite | 1 suite, 12 tests passed |
| Authentication delivery HTTP/Redis + production HTTPS | 17 tests passed; includes the compiled backend, signed payload, real TLS validation, both contact confirmations, booking/read status and password reset/session invalidation |
| Provider provisioning CLI | Rejected a pending account; created exactly one provider after verification, including a repeated invocation |
| Compiled production entry point | Started; health/catalogue, HSTS, authentication and missing-delivery behavior passed |
| Delivery CLI and native acceptance guard smoke checks | Missing configuration rejected; configured CLI served a healthy Redis-backed listener; native runner refused a pilot database name |
| Flutter source and test parsing/formatting | All 10 Dart files parsed/formatted with the Dart-style WASM formatter |
| Android XML, Apple plist/entitlement and workflow/Compose YAML syntax | Validated |
| Source git whitespace check | Passed; diff context inside `.patch` artifacts is excluded |
| Baseline and continuation patch application checks | Passed against the corresponding source checkpoints |

The pilot HTTP suite covers registration → login → verification → request creation; pending-account rejection; customer ownership; provider accept/start/complete; terminal-state rejection; client-controlled fields; simultaneous refresh/reset winners; concurrent challenge guesses; stale credentials after logout/reset; blocked accounts; private production challenge responses; and live IP-based rate limits.

All **134 backend/delivery tests passed**. These were real Nest/Express HTTP calls with Prisma transactions and SQL execution, plus native Redis. The SQL server available here was **PGlite**, a PostgreSQL-compatible engine, with **one Prisma connection** because its socket protocol multiplexes a single backend. Concurrent application calls were exercised, but this does **not** establish native PostgreSQL locking behavior under multiple connections. The native PostgreSQL/Redis CI job uses ten connections to repeat those checks. Delivery tests use mocked vendors and send no real messages. The production integration check runs the compiled backend and actual signed HTTPS requests with a per-run trusted test certificate; TLS verification is not disabled.

The focused ESLint commands cover repaired authentication, bootstrap/database wiring, catalogue, pilot tests and the new delivery/runtime JavaScript. Existing TypeScript keeps typed checks; CommonJS files use JavaScript checks. This is not a claim that all legacy source files have been lint-cleaned.

## Not executed here

Flutter/Dart SDK tools are absent and official archive downloads were unavailable in this environment. `flutter pub get`, `flutter analyze`, the seven API-client test cases, the three widget-flow tests, release builds and device/secure-storage behavior have **not run here**. All ten Dart source/test files parse and format with the Dart-style WASM formatter. Parsing is not a substitute for Flutter analysis or a build.

Docker is unavailable, and native PostgreSQL cannot initialize as root; this execution environment cannot switch to a database user. GitHub CI has not run because the supplied archive is not connected to a hosted repository. The included workflow and native acceptance runner repeat backend migrations/build/type checks/lint/tests and Flutter analysis/tests, release web build and debug Android APK build in a suitable environment.

Live Resend/Termii credentials, sending-domain/sender approvals and adapter deployment, final signing/application identifiers, Android/iOS device acceptance, quote/checkout flows and provider/admin mobile interfaces remain rollout work. For this source's acceptance, run `pnpm verify:pilot` with the test URLs in the setup guide, exercise registration through status on an Android device against the configured HTTPS backend, restart the app to verify session restoration, and confirm actual inbox/SMS arrival using the configured adapter.

## Reproduction

See [KADUNA-PILOT.md](KADUNA-PILOT.md) for setup and test commands and [AUTH-DELIVERY.md](AUTH-DELIVERY.md) for provider configuration. The recorded backend log, machine-readable result and CLI smoke result are included in `docs/verification/`. `kaduna-pilot.patch` covers changes from the supplied baseline; `continuation.patch` covers this continuation from the previously delivered source checkpoint (`6d26041`). Both patches exclude patch files themselves.

Original uploaded archive SHA-256: `cc0c77b7ff5656ec5ebac47b063a340c4ef782e4b1fe1bb3b9fb52f63d3d6e86`.
